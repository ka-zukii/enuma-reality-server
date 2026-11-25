import type { FastifyInstance } from "fastify";
import { isValidBuildingKey } from "../config/buildings.js";
import { prisma } from "../config/clients.js";
import { interiorRoomLayout } from "../config/layouts.js";
import { HARD_CAP } from "../config/settings.js";
import { isGuest, verifyAccessToken } from "../lib/auth.js";
import { ensureMembership } from "../services/membership.js";
import { ensureProfile } from "../services/profile.js";
import {
  canJoin,
  findOrCreateAutoServer,
  occupancy,
} from "../services/serverAllocator.js";
import { createManualWorkspace } from "../services/workspaces.js";

function extractBearer(header?: string): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function workspaceRoutes(fastify: FastifyInstance) {
  fastify.decorateRequest("userId", "");
  fastify.decorateRequest("isGuest", false);

  // Verifikasi Bearer token Supabase untuk semua route di plugin ini
  fastify.addHook("preHandler", async (request, reply) => {
    const token = extractBearer(request.headers.authorization);
    if (!token) {
      return reply
        .status(401)
        .send({ error: "Missing or invalid Authorization header" });
    }

    const user = await verifyAccessToken(token);
    if (!user) {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }

    try {
      await ensureProfile(user);
    } catch (err) {
      request.log.error(err);
      return reply
        .status(500)
        .send({ error: "Gagal menyiapkan profil user" });
    }

    request.userId = user.id;
    request.isGuest = isGuest(user);
  });

  // 1. GET /api/workspaces — server manual + server otomatis yang user ikuti.
  // inviteCode hanya dikirim ke member agar cadangan slot tidak bisa dibongkar siapa pun.
  fastify.get("/workspaces", async (request) => {
    const userId = request.userId;

    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [{ isAuto: false }, { members: { some: { profileId: userId } } }],
      },
      include: {
        rooms: true,
        members: { where: { profileId: userId } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return workspaces.map((ws) => {
      const myMembership = ws.members[0];

      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        isAuto: ws.isAuto,
        ownerId: ws.ownerId,
        inviteCode: myMembership ? ws.inviteCode : undefined,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
        rooms: ws.rooms,
        _count: ws._count,
        myRole: myMembership?.role ?? null,
        isMember: Boolean(myMembership),
        onlineCount: occupancy(ws.id),
        maxCapacity: HARD_CAP,
      };
    });
  });

  // 2. POST /api/workspaces — buat server manual + Main Floor
  fastify.post<{ Body: { name?: string; mapTemplate?: string } }>(
    "/workspaces",
    async (request, reply) => {
      // Tamu tidak boleh membuat server manual; ajak login lebih dulu
      if (request.isGuest) {
        return reply.status(403).send({
          error:
            "Membuat server membutuhkan akun. Hubungkan email atau Google dulu.",
          code: "GUEST_NOT_ALLOWED",
        });
      }

      const name = request.body?.name?.trim() ?? "";
      if (name.length < 3) {
        return reply
          .status(400)
          .send({ error: "Nama workspace minimal 3 karakter" });
      }

      const workspace = await createManualWorkspace({
        ownerId: request.userId,
        name,
        mapTemplate: request.body?.mapTemplate,
      });

      return reply.status(201).send(workspace);
    },
  );

  // 2b. POST /api/servers/quick-join — pilih server otomatis atau buat baru
  fastify.post("/servers/quick-join", async (request, reply) => {
    try {
      const workspace = await findOrCreateAutoServer(request.userId);
      return { workspace };
    } catch (err) {
      request.log.error(err);
      return reply
        .status(500)
        .send({ error: "Gagal menyiapkan server otomatis" });
    }
  });

  // Hapus workspace (khusus OWNER)
  fastify.delete<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId",
    async (request, reply) => {
      const { workspaceId } = request.params;

      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_profileId: { workspaceId, profileId: request.userId },
        },
      });

      if (membership?.role !== "OWNER") {
        return reply
          .status(403)
          .send({ error: "Hanya OWNER yang dapat menghapus workspace ini" });
      }

      await prisma.workspace.delete({ where: { id: workspaceId } });
      return { message: "Workspace berhasil dihapus", workspaceId };
    },
  );

  // 3. POST /api/workspaces/join — gabung dengan inviteCode (kapasitas maks HARD_CAP)
  fastify.post<{ Body: { inviteCode?: string } }>(
    "/workspaces/join",
    async (request, reply) => {
      const userId = request.userId;
      const inviteCode = request.body?.inviteCode?.trim();
      if (!inviteCode) {
        return reply.status(400).send({ error: "Kode undangan wajib diisi" });
      }

      const workspace = await prisma.workspace.findUnique({
        where: { inviteCode },
        include: { rooms: true },
      });
      if (!workspace) {
        return reply.status(404).send({ error: "Kode undangan tidak ditemukan" });
      }

      // Cek awal agar user langsung mendapat pesan jelas. Cek final ada di socket room:join.
      const alreadyMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_profileId: { workspaceId: workspace.id, profileId: userId },
        },
      });

      if (!alreadyMember && !canJoin(workspace.id, userId, "code")) {
        return reply
          .status(409)
          .send({ error: `Server sudah penuh (maks ${HARD_CAP} pemain)` });
      }

      await ensureMembership(workspace.id, userId, request.isGuest);

      return workspace;
    },
  );

  // 4a. GET /api/workspaces/:workspaceId/messages — riwayat chat GLOBAL seluruh server.
  // Hanya untuk anggota. Pagination: ?before=<ISO date>&limit=<1..100>
  fastify.get<{
    Params: { workspaceId: string };
    Querystring: { before?: string; limit?: string };
  }>("/workspaces/:workspaceId/messages", async (request, reply) => {
    const { workspaceId } = request.params;

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_profileId: { workspaceId, profileId: request.userId } },
    });
    if (!membership) {
      return reply.status(403).send({ error: "Kamu bukan anggota server ini" });
    }

    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 100);
    const beforeDate = request.query.before ? new Date(request.query.before) : null;
    const hasBefore = beforeDate !== null && !Number.isNaN(beforeDate.getTime());

    const messages = await prisma.message.findMany({
      where: {
        workspaceId,
        ...(hasBefore ? { createdAt: { lt: beforeDate } } : {}),
      },
      include: { sender: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Bentuk disamakan dengan paket socket `chat:receive` (channel GLOBAL)
    return messages.reverse().map((m) => ({
      id: m.id,
      channel: "GLOBAL" as const,
      senderId: m.senderId,
      senderName: m.sender.fullName,
      content: m.content,
      createdAt: m.createdAt,
    }));
  });

  // 4b. GET /api/rooms/:roomId/messages — (deprecated) riwayat per room, kini hanya untuk anggota
  fastify.get<{ Params: { roomId: string } }>(
    "/rooms/:roomId/messages",
    async (request, reply) => {
      const { roomId } = request.params;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { workspaceId: true },
      });
      if (!room) return reply.status(404).send({ error: "Ruangan tidak ditemukan" });

      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_profileId: {
            workspaceId: room.workspaceId,
            profileId: request.userId,
          },
        },
      });
      if (!membership) {
        return reply.status(403).send({ error: "Kamu bukan anggota server ini" });
      }

      const messages = await prisma.message.findMany({
        where: { roomId },
        include: {
          sender: { select: { id: true, fullName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return messages.reverse();
    },
  );

  // 5. GET /api/workspaces/:workspaceId/dms — riwayat Private DM milik user
  fastify.get<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/dms",
    async (request) => {
      const userId = request.userId;
      const { workspaceId } = request.params;

      const dms = await prisma.directMessage.findMany({
        where: {
          workspaceId,
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        include: {
          sender: { select: { id: true, fullName: true } },
          receiver: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return dms.reverse().map((dm) => ({
        id: dm.id,
        channel: "PRIVATE" as const,
        senderId: dm.senderId,
        senderName: dm.sender.fullName,
        receiverId: dm.receiverId,
        receiverName: dm.receiver.fullName,
        content: dm.content,
        createdAt: dm.createdAt,
      }));
    },
  );

  // 6. POST /api/workspaces/:workspaceId/interiors/:buildingKey — ambil/buat room interior gedung
  fastify.post<{ Params: { workspaceId: string; buildingKey: string } }>(
    "/workspaces/:workspaceId/interiors/:buildingKey",
    async (request, reply) => {
      const { workspaceId, buildingKey } = request.params;

      if (!isValidBuildingKey(buildingKey)) {
        return reply.status(404).send({ error: "Gedung tidak ditemukan" });
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!workspace) {
        return reply.status(404).send({ error: "Server tidak ditemukan" });
      }

      // upsert pada unique (workspaceId, buildingKey): aman dari race antar request
      const room = await prisma.room.upsert({
        where: {
          workspaceId_buildingKey: { workspaceId, buildingKey },
        },
        update: {},
        create: {
          workspaceId,
          buildingKey,
          name: `Interior ${buildingKey}`,
          mapTemplate: `interior-${buildingKey}`,
          layoutJson: interiorRoomLayout(),
        },
      });

      return { room };
    },
  );
}

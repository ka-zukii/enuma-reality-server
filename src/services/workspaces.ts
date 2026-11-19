import { prisma } from "../config/clients.js";
import { DEFAULT_MAP_TEMPLATE, officeRoomLayout } from "../config/layouts.js";
import { scheduleWorkspaceCleanup } from "./workspaceCleanup.js";

function randomSuffix(): number {
  return Math.floor(1000 + Math.random() * 9000);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Data Main Floor default, dipakai oleh server manual maupun otomatis */
function mainFloorData(mapTemplate: string = DEFAULT_MAP_TEMPLATE) {
  return {
    name: "Main Floor",
    mapTemplate,
    layoutJson: officeRoomLayout(),
  };
}

/** Server manual buatan user; OWNER otomatis jadi member pertama */
export async function createManualWorkspace(params: {
  ownerId: string;
  name: string;
  mapTemplate?: string;
}) {
  const workspace = await prisma.workspace.create({
    data: {
      name: params.name,
      slug: `${slugify(params.name)}-${randomSuffix()}`,
      ownerId: params.ownerId,
      isAuto: false,
      members: {
        create: {
          profileId: params.ownerId,
          role: "OWNER",
          jobTitle: "Founder / Lead",
        },
      },
      rooms: { create: mainFloorData(params.mapTemplate) },
    },
    include: { rooms: true },
  });

  // Jika user tidak segera masuk dalam grace period, server dihapus otomatis
  scheduleWorkspaceCleanup(workspace.id);
  return workspace;
}

/** Server otomatis untuk quick-join */
export async function createAutoServer(index: number) {
  const ws = await prisma.workspace.create({
    data: {
      name: `Enuma Server ${index}`,
      slug: `enuma-server-${Date.now().toString(36)}-${randomSuffix()}`,
      isAuto: true,
      rooms: { create: mainFloorData() },
    },
    include: { rooms: true },
  });

  scheduleWorkspaceCleanup(ws.id);
  return ws;
}

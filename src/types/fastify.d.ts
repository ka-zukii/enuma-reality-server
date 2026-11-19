import type {} from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Diisi oleh hook auth di routes/workspace.ts */
    userId: string;
    /** true jika user adalah tamu (sesi anonim) */
    isGuest: boolean;
  }
}

import "./env.js"; // harus pertama, sebelum modul lain membaca process.env

import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { setupSocketIO } from "./sockets/index.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { weatherRoutes } from "./routes/weather.js";
import { startWorkspaceCleanupCron } from "./services/workspaceCleanup.js";
import { startWeatherRefresh } from "./services/weather.js";

const fastify = Fastify({ logger: true });

async function bootstrap() {
  await fastify.register(cors, { origin: true, credentials: true });

  fastify.get("/health", async () => ({
    status: "ok",
    service: "Enuma Reality Project Server",
    timestamp: new Date().toISOString(),
  }));

  // REST API dengan prefix /api
  await fastify.register(workspaceRoutes, { prefix: "/api" });
  await fastify.register(weatherRoutes, { prefix: "/api" });

  const io = new Server(fastify.server, {
    path: "/realtime",
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  setupSocketIO(io);
  startWorkspaceCleanupCron();
  startWeatherRefresh();

  const port = Number(process.env.SERVER_PORT || process.env.PORT) || 4000;
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(
    `🚀 Enuma Reality Project Server running on http://localhost:${port}`,
  );
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

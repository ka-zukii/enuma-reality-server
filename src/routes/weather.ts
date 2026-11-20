import type { FastifyInstance } from "fastify";
import { getWeather } from "../services/weather.js";

export async function weatherRoutes(fastify: FastifyInstance) {
  // GET /api/weather
  fastify.get("/weather", async (_req, reply) => {
    try {
      const { data, fetchedAt } = await getWeather();

      return {
        source: "BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)",
        fetchedAt: new Date(fetchedAt).toISOString(),
        data,
      };
    } catch (err) {
      console.error("[Weather] Route error:", err);
      return reply
        .code(502)
        .send({ message: "Data cuaca belum tersedia, coba lagi nanti" });
    }
  });
}

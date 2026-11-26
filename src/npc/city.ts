// src/npc/city.ts
// Susunan semua NPC kota. Setiap room punya satu kumpulan NPC yang sama.
import type { Npc, StepContext } from "./base.js";
import { createAutonomous } from "./autonomous.js";
import { createCats } from "./cats.js";
import { createCyclists } from "./cyclists.js";
import { createPedestrians } from "./pedestrians.js";
import { createSocial } from "./social.js";
import { createTraffic } from "./traffic.js";

export interface CityNpcs {
  npcs: Npc[];
  updaters: ((ctx: StepContext) => void)[];
}

export function createCityNpcs(): CityNpcs {
  const traffic = createTraffic();
  const cyclists = createCyclists();
  const cats = createCats();
  const pedestrians = createPedestrians();
  const social = createSocial();
  const autonomous = createAutonomous();

  return {
    npcs: [
      ...traffic.cars,
      ...cyclists.cyclists,
      ...cats.cats,
      ...pedestrians.walkers,
      ...social.npcs,
      ...autonomous.npcs,
    ],
    // Urutan penting: lalu lintas dulu, lalu NPC yang bergantung pada lampu/trem
    updaters: [traffic.update, cyclists.update, cats.update, pedestrians.update, social.update, autonomous.update],
  };
}

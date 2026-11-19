export const BUILDING_KEYS = ["enuma-hq", "board-game-cafe", "m-cafe"] as const;
export type BuildingKey = (typeof BUILDING_KEYS)[number];

export function isValidBuildingKey(key: string): key is BuildingKey {
  return (BUILDING_KEYS as readonly string[]).includes(key);
}

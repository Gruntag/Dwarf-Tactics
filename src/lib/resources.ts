const STORAGE_PREFIX = "gruntag_resource_";

export const RESOURCES = {
  battleArena: {
    slug: "battle-arena",
    singular: "Arena Crest",
    plural: "Arena Crests",
    summary: "Awarded for enduring the full Battle Arena onslaught.",
  },
  dwarvenDefense: {
    slug: "dwarven-defense",
    singular: "Bastion Crest",
    plural: "Bastion Crests",
    summary: "Granted for holding the keep throughout Dwarven Defense.",
  },
  trophyHunt: {
    slug: "trophy-hunt",
    singular: "Hunter Trophy",
    plural: "Hunter Trophies",
    summary: "Claimed by landing decisive shots in Trophy Hunt.",
  },
  goldRush: {
    slug: "gold-rush",
    singular: "Golden Ingot",
    plural: "Golden Ingots",
    summary: "Stacked for purging the tunnels in Gold Rush.",
  },
  skullCrusher: {
    slug: "skull-crusher",
    singular: "Skull Shard",
    plural: "Skull Shards",
    summary: "Harvested by keeping the crusher roaring in Skull Crusher.",
  },
  dragonFire: {
    slug: "forge-master",
    singular: "Forge Seal",
    plural: "Forge Seals",
    summary: "Earned when the furnaces are mastered in Forge Master.",
  },
  lootTrain: {
    slug: "loot-train",
    singular: "Extraction Crate",
    plural: "Extraction Crates",
    summary: "Loaded for every flawless Minecart Extraction haul.",
  },
  gemMiner: {
    slug: "gem-miner",
    singular: "Gem Cache",
    plural: "Gem Caches",
    summary: "Uncovered by filling the vault in Gem Miner.",
  },
  warriorsChallenge: {
    slug: "warriors-challenge",
    singular: "Valor Seal",
    plural: "Valor Seals",
    summary: "Issued for clearing Warrior's Challenge stages.",
  },
} as const;

export type ResourceKey = keyof typeof RESOURCES;
export type ResourceDefinition = (typeof RESOURCES)[ResourceKey];

const storageKeyFor = (key: ResourceKey) => `${STORAGE_PREFIX}${RESOURCES[key].slug}`;

const parseCount = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const getResourceCount = (key: ResourceKey): number => {
  return parseCount(localStorage.getItem(storageKeyFor(key)));
};

export const setResourceCount = (key: ResourceKey, value: number): void => {
  localStorage.setItem(storageKeyFor(key), value.toString());
};

export const addResource = (key: ResourceKey, amount = 1): number => {
  const current = getResourceCount(key);
  const next = current + amount;
  setResourceCount(key, next);
  return next;
};

export interface ResourceSnapshot {
  key: ResourceKey;
  definition: ResourceDefinition;
  amount: number;
}

export const getResourceSnapshots = (): ResourceSnapshot[] => {
  return (Object.keys(RESOURCES) as ResourceKey[]).map((key) => ({
    key,
    definition: RESOURCES[key],
    amount: getResourceCount(key),
  }));
};

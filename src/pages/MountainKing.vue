<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Map as MapIcon,
  Mountain,
  Route,
  Hammer,
  Pickaxe,
  Package,
  ZoomIn,
  ZoomOut,
  Shield,
  Trees,
  Compass,
  RefreshCcw,
} from "lucide-vue-next";
import {
  getResourceSnapshots,
  getResourceCount,
  setResourceCount,
  type ResourceSnapshot,
  type ResourceKey,
} from "@/lib/resources";

type EconomyResource =
  | "ore"
  | "timber"
  | "coal"
  | "ingots"
  | "tools"
  | "provisions"
  | "ale"
  | "armaments"
  | "prestige";

type Terrain = "granite" | "frost" | "evergreen" | "ember" | "glimmer";

type BuildingCategory = "extraction" | "refinement" | "support" | "military";

interface EconomyState {
  resources: Record<EconomyResource, number>;
  buildings: BuildingInstance[];
  haulingLog: HaulingEvent[];
}

interface BuildingBlueprint {
  id: string;
  name: string;
  description: string;
  inputs?: Partial<Record<EconomyResource, number>>;
  output: { key: EconomyResource; amount: number };
  category: BuildingCategory;
  cost: Partial<Record<ResourceKey, number>>;
}

interface BuildingInstance {
  blueprintId: string;
  level: number;
  efficiency: number;
}

interface HaulingEvent {
  id: string;
  detail: string;
  timestamp: string;
}

interface HexTile {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  name: string;
  claimed: boolean;
  hasCapital: boolean;
  roads: string[];
  economy: EconomyState;
}

interface ClaimCost {
  key: ResourceKey;
  amount: number;
}

type StatusTone = "info" | "success" | "warn";

const mapRadius = 6;
const HEX_WIDTH = 120;
const HEX_HEIGHT = 104;
const axialDirections: Array<[number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

const economyResourcesOrder: EconomyResource[] = [
  "ore",
  "timber",
  "coal",
  "ingots",
  "tools",
  "provisions",
  "ale",
  "armaments",
  "prestige",
];

const resourceLabels: Record<EconomyResource, string> = {
  ore: "Ore",
  timber: "Timber",
  coal: "Coal",
  ingots: "Ingots",
  tools: "Tools",
  provisions: "Provisions",
  ale: "Ale",
  armaments: "Armaments",
  prestige: "Prestige",
};

const terrainPalette: Terrain[] = ["granite", "frost", "evergreen", "ember", "glimmer"];

const terrainLabels: Record<Terrain, string> = {
  granite: "Granite Ridge",
  frost: "Frost Wastes",
  evergreen: "Evergreen Reach",
  ember: "Ember Fault",
  glimmer: "Glimmer Veil",
};

const terrainGradients: Record<Terrain, string> = {
  granite: "from-slate-700/90 via-slate-800/90 to-slate-900/90",
  frost: "from-cyan-600/80 via-sky-500/70 to-blue-600/70",
  evergreen: "from-green-700/80 via-emerald-600/70 to-lime-600/60",
  ember: "from-orange-700/80 via-amber-600/70 to-red-600/70",
  glimmer: "from-purple-700/80 via-fuchsia-600/70 to-indigo-600/70",
};

const buildingBlueprints: BuildingBlueprint[] = [
  {
    id: "ore-mine",
    name: "Deep Ore Mine",
    description: "Cuts galleries into the ridge to haul raw ore. Consumes rations each cycle.",
    inputs: { provisions: 1 },
    output: { key: "ore", amount: 4 },
    category: "extraction",
    cost: { forgeMaster: 2 },
  },
  {
    id: "lumber-camp",
    name: "Evergreen Lumber Camp",
    description: "Harvests timber from nearby groves.",
    inputs: { provisions: 1 },
    output: { key: "timber", amount: 3 },
    category: "extraction",
    cost: { trophyHunt: 2 },
  },
  {
    id: "charcoal-kiln",
    name: "Charcoal Kiln",
    description: "Burns timber into coal for the smelters.",
    inputs: { timber: 2 },
    output: { key: "coal", amount: 2 },
    category: "refinement",
    cost: { goldRush: 25 },
  },
  {
    id: "smelter",
    name: "Smelter Stack",
    description: "Refines ore and coal into ingots.",
    inputs: { ore: 3, coal: 1 },
    output: { key: "ingots", amount: 2 },
    category: "refinement",
    cost: { forgeMaster: 4 },
  },
  {
    id: "gearworks",
    name: "Gearworks",
    description: "Turns ingots and timber into tools.",
    inputs: { ingots: 2, timber: 1 },
    output: { key: "tools", amount: 2 },
    category: "support",
    cost: { shieldDefense: 2 },
  },
  {
    id: "granary",
    name: "Granary & Smokehouse",
    description: "Prepares provisions for work crews.",
    inputs: { timber: 1 },
    output: { key: "provisions", amount: 3 },
    category: "support",
    cost: { lootTrain: 1 },
  },
  {
    id: "brewery",
    name: "Magma Brewery",
    description: "Brews morale-boosting ale.",
    inputs: { provisions: 2 },
    output: { key: "ale", amount: 2 },
    category: "support",
    cost: { dragonFire: 2 },
  },
  {
    id: "armory",
    name: "Hammerfall Armory",
    description: "Produces armaments for the frontier.",
    inputs: { ingots: 1, tools: 1, ale: 1 },
    output: { key: "armaments", amount: 2 },
    category: "military",
    cost: { battleArena: 3, warriorsChallenge: 1 },
  },
  {
    id: "hall-of-legends",
    name: "Hall of Legends",
    description: "Celebrates victories and mints prestige.",
    inputs: { armaments: 1, ale: 1 },
    output: { key: "prestige", amount: 1 },
    category: "military",
    cost: { trophyHunt: 5, dragonFire: 3 },
  },
];

const blueprintIndex = Object.fromEntries(buildingBlueprints.map((bp) => [bp.id, bp]));

const claimCosts: ClaimCost[] = [
  { key: "battleArena", amount: 3 },
  { key: "goldRush", amount: 40 },
  { key: "warriorsChallenge", amount: 1 },
];

const roadCosts: ClaimCost[] = [{ key: "lootTrain", amount: 2 }];

const makeHaulingEvent = (detail: string): HaulingEvent => ({
  id: `haul-${Math.random().toString(36).slice(2, 8)}`,
  detail,
  timestamp: new Date().toLocaleTimeString(),
});

const applyTerrainBonus = (resources: Record<EconomyResource, number>, terrain: Terrain) => {
  const bonusMap: Record<Terrain, { key: EconomyResource; amount: number }> = {
    granite: { key: "ore", amount: 8 },
    frost: { key: "provisions", amount: 6 },
    evergreen: { key: "timber", amount: 8 },
    ember: { key: "coal", amount: 5 },
    glimmer: { key: "prestige", amount: 1 },
  };
  const bonus = bonusMap[terrain];
  resources[bonus.key] += bonus.amount;
};

const createEconomyState = (mode: "capital" | "wilds", terrain: Terrain): EconomyState => {
  const base: EconomyState = {
    resources: {
      ore: 0,
      timber: 0,
      coal: 0,
      ingots: 0,
      tools: 0,
      provisions: 0,
      ale: 0,
      armaments: 0,
      prestige: 0,
    },
    buildings: [],
    haulingLog: [],
  };

  if (mode === "capital") {
    base.resources.ore = 40;
    base.resources.timber = 28;
    base.resources.coal = 8;
    base.resources.provisions = 18;
    base.resources.ale = 6;
    base.buildings = [
      { blueprintId: "ore-mine", level: 1, efficiency: 1.1 },
      { blueprintId: "lumber-camp", level: 1, efficiency: 1.1 },
      { blueprintId: "granary", level: 1, efficiency: 1.05 },
      { blueprintId: "brewery", level: 1, efficiency: 1 },
      { blueprintId: "smelter", level: 1, efficiency: 1 },
    ];
    base.haulingLog = [makeHaulingEvent("Capital caravans lit the first forges.")];
  } else {
    base.resources.provisions = 4;
  }

  applyTerrainBonus(base.resources, terrain);
  return base;
};

const generateHexName = (terrain: Terrain): string => {
  const prefixes: Record<Terrain, string[]> = {
    granite: ["Anvil", "Mythril", "Stone", "Ridge", "Obsidian"],
    frost: ["Frost", "Glacier", "Winter", "Ice", "Snow"],
    evergreen: ["Verdant", "Ever", "Grove", "Moss", "Bramble"],
    ember: ["Ember", "Ash", "Blaze", "Coal", "Cinder"],
    glimmer: ["Glimmer", "Radiant", "Starlit", "Auric", "Shimmer"],
  };
  const suffixes = ["Hollow", "Reach", "Spur", "Stronghold", "Fastness", "Hold", "Span"];
  const prefixOptions = prefixes[terrain];
  const prefix = prefixOptions[Math.floor(Math.random() * prefixOptions.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${prefix} ${suffix}`;
};

const createHexGrid = (): HexTile[] => {
  const tiles: HexTile[] = [];
  let counter = 0;
  for (let q = -mapRadius; q <= mapRadius; q += 1) {
    for (let r = -mapRadius; r <= mapRadius; r += 1) {
      const s = -q - r;
      if (Math.abs(s) > mapRadius) continue;
      const isCapital = q === 0 && r === 0;
      const terrain: Terrain = isCapital ? "granite" : terrainPalette[Math.floor(Math.random() * terrainPalette.length)];
      tiles.push({
        id: `hex-${counter}`,
        q,
        r,
        terrain,
        name: isCapital ? "Crown Seat Capital" : generateHexName(terrain),
        claimed: isCapital,
        hasCapital: isCapital,
        roads: [],
        economy: createEconomyState(isCapital ? "capital" : "wilds", terrain),
      });
      counter += 1;
    }
  }
  return tiles;
};

const hexes = ref<HexTile[]>(createHexGrid());
const selectedHexId = ref(hexes.value.find((tile) => tile.hasCapital)?.id ?? hexes.value[0]?.id ?? "");
const zoomedHexId = ref(selectedHexId.value);
const zoomLevel = ref(1.5);

const resourceVault = ref<ResourceSnapshot[]>([]);
const loadVault = () => {
  resourceVault.value = getResourceSnapshots();
};
onMounted(() => {
  loadVault();
});

const resourceLedger = computed(() => {
  const ledger = {} as Record<ResourceKey, number>;
  resourceVault.value.forEach((snapshot) => {
    ledger[snapshot.key] = snapshot.amount;
  });
  return ledger;
});

const statusMessage = ref<{ text: string; tone: StatusTone } | null>(null);
const setStatus = (text: string, tone: StatusTone = "info") => {
  statusMessage.value = { text, tone };
};

const hexById = (id: string | null | undefined) => hexes.value.find((hex) => hex.id === id);

const selectedHex = computed(() => hexById(selectedHexId.value) ?? hexes.value[0]);
const zoomedHex = computed(() => hexById(zoomedHexId.value) ?? selectedHex.value);

const claimedTiles = computed(() => hexes.value.filter((hex) => hex.claimed).length);
const totalTiles = computed(() => hexes.value.length);
const totalPrestige = computed(() =>
  hexes.value
    .filter((hex) => hex.claimed)
    .reduce((sum, hex) => sum + hex.economy.resources.prestige, 0)
);
const totalRoadSegments = computed(() => {
  const segments = hexes.value.reduce((sum, hex) => sum + hex.roads.length, 0);
  return Math.floor(segments / 2);
});
const mapCanvasStyle = computed(() => {
  const diameter = mapRadius * 2 + 1;
  const width = HEX_WIDTH * (diameter + mapRadius);
  const height = HEX_HEIGHT * (diameter + mapRadius);
  return {
    width: `${width}px`,
    height: `${height}px`,
  };
});

const tilePositionStyle = (hex: HexTile) => {
  const x = HEX_WIDTH * (hex.q + mapRadius) + (HEX_WIDTH / 2) * (hex.r + mapRadius);
  const y = HEX_HEIGHT * 0.85 * (hex.r + mapRadius);
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${HEX_WIDTH}px`,
    height: `${HEX_HEIGHT}px`,
  };
};

const isNeighbor = (a: HexTile, b: HexTile) => {
  return axialDirections.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
};

const hasRoadToEmpire = (hex: HexTile) => {
  return hex.roads.some((neighborId) => {
    const neighbor = hexById(neighborId);
    return neighbor?.claimed;
  });
};

const canAfford = (costs: ClaimCost[]) => {
  return costs.every(({ key, amount }) => (resourceLedger.value[key] ?? 0) >= amount);
};

const spendResources = (costs: ClaimCost[]) => {
  costs.forEach(({ key, amount }) => {
    const current = getResourceCount(key);
    setResourceCount(key, Math.max(0, current - amount));
  });
  loadVault();
};

const formatCost = (costs: ClaimCost[]) => {
  return costs
    .map(({ key, amount }) => {
      const resource = resourceVault.value.find((snapshot) => snapshot.key === key);
      return `${amount} ${resource?.definition.singular ?? key}`;
    })
    .join(" + ");
};

const deepCloneHex = (hex: HexTile): HexTile => JSON.parse(JSON.stringify(hex)) as HexTile;

const updateHex = (hexId: string, mutator: (draft: HexTile) => HexTile) => {
  hexes.value = hexes.value.map((hex) => {
    if (hex.id !== hexId) return hex;
    const next = deepCloneHex(hex);
    return mutator(next);
  });
};

const selectHex = (hex: HexTile) => {
  selectedHexId.value = hex.id;
};

const handleHexClick = (hex: HexTile) => {
  if (isRoadMode.value) {
    handleRoadSelection(hex);
    return;
  }
  selectHex(hex);
  if (hex.claimed) {
    zoomedHexId.value = hex.id;
  }
};

const isRoadMode = ref(false);
const roadSourceId = ref<string | null>(null);

const toggleRoadMode = () => {
  isRoadMode.value = !isRoadMode.value;
  if (!isRoadMode.value) {
    roadSourceId.value = null;
  }
};

const handleRoadSelection = (hex: HexTile) => {
  if (!roadSourceId.value) {
    if (!hex.claimed) {
      setStatus("Roads must start from a claimed hex.", "warn");
      return;
    }
    roadSourceId.value = hex.id;
    selectHex(hex);
    setStatus("Road origin locked. Select a neighboring hex to finish the route.");
    return;
  }

  const source = hexById(roadSourceId.value);
  if (!source) {
    roadSourceId.value = null;
    return;
  }

  if (source.id === hex.id) {
    roadSourceId.value = null;
    setStatus("Road building cancelled.", "info");
    return;
  }
  if (!isNeighbor(source, hex)) {
    setStatus("Only adjacent hexes can be linked by road.", "warn");
    return;
  }
  if (!source.claimed) {
    setStatus("Select a claimed hex to originate the road.", "warn");
    roadSourceId.value = null;
    return;
  }
  if (!canAfford(roadCosts)) {
    setStatus("You need additional Cargo Crates to pave this road.", "warn");
    roadSourceId.value = null;
    return;
  }

  const connect = (fromId: string, toId: string) => {
    updateHex(fromId, (draft) => {
      if (!draft.roads.includes(toId)) {
        draft.roads.push(toId);
      }
      return draft;
    });
  };

  connect(source.id, hex.id);
  connect(hex.id, source.id);
  spendResources(roadCosts);
  setStatus("Road completed. Supply carts can now cross between the tiles.", "success");
  if (!hex.claimed) {
    selectHex(hex);
  }
  roadSourceId.value = null;
};

const canClaimSelected = computed(() => {
  const hex = selectedHex.value;
  if (!hex || hex.claimed || hex.hasCapital) return false;
  return hasRoadToEmpire(hex) && canAfford(claimCosts);
});

const claimSelectedHex = () => {
  const hex = selectedHex.value;
  if (!hex) return;
  if (hex.claimed) {
    setStatus("Tile already claimed.", "info");
    return;
  }
  if (!hasRoadToEmpire(hex)) {
    setStatus("Extend a road from an adjacent claimed tile before annexing this hex.", "warn");
    return;
  }
  if (!canAfford(claimCosts)) {
    setStatus("You need additional spoils from other games to claim this tile.", "warn");
    return;
  }

  spendResources(claimCosts);
  updateHex(hex.id, (draft) => {
    draft.claimed = true;
    draft.economy = createEconomyState("wilds", draft.terrain);
    draft.economy.haulingLog.unshift(makeHaulingEvent(`${draft.name} joined the Mountain King's dominion.`));
    return draft;
  });
  setStatus(`${hex.name} has been claimed. Deploy dwarves to spin up production.`, "success");
};

const blueprintGroups = computed(() => {
  return buildingBlueprints.reduce<Record<BuildingCategory, BuildingBlueprint[]>>(
    (groups, blueprint) => {
      groups[blueprint.category].push(blueprint);
      return groups;
    },
    { extraction: [], refinement: [], support: [], military: [] }
  );
});

const buildStructure = (blueprint: BuildingBlueprint) => {
  const hex = selectedHex.value;
  if (!hex || !hex.claimed) {
    setStatus("Claim the tile before placing structures.", "warn");
    return;
  }
  if (hex.economy.buildings.some((building) => building.blueprintId === blueprint.id)) {
    setStatus("This structure already exists on the selected hex.", "info");
    return;
  }
  const costEntries = Object.entries(blueprint.cost) as [ResourceKey, number][];
  if (!canAfford(costEntries.map(([key, amount]) => ({ key, amount })))) {
    setStatus("Insufficient cross-game resources to commission this structure.", "warn");
    return;
  }

  spendResources(costEntries.map(([key, amount]) => ({ key, amount })));
  updateHex(hex.id, (draft) => {
    draft.economy.buildings.push({
      blueprintId: blueprint.id,
      level: 1,
      efficiency: 1,
    });
    draft.economy.haulingLog.unshift(makeHaulingEvent(`${blueprint.name} raised in ${draft.name}.`));
    return draft;
  });
  setStatus(`${blueprint.name} constructed. Queue a haul to feed it.`, "success");
};

const resolveEconomy = (hex: HexTile) => {
  const resources = { ...hex.economy.resources };
  const events: string[] = [];
  hex.economy.buildings.forEach((instance) => {
    const blueprint = blueprintIndex[instance.blueprintId];
    if (!blueprint) return;
    const inputs = blueprint.inputs ?? {};
    const canRun = Object.entries(inputs).every(
      ([key, amount]) => resources[key as EconomyResource] >= amount
    );
    if (!canRun) return;
    Object.entries(inputs).forEach(([key, amount]) => {
      resources[key as EconomyResource] -= amount;
    });
    const outputAmount = blueprint.output.amount * instance.efficiency;
    resources[blueprint.output.key] += outputAmount;
    events.push(
      `${blueprint.name} delivered ${outputAmount} ${resourceLabels[blueprint.output.key]}.`
    );
  });
  return { resources, events };
};

const dispatchHaulers = () => {
  const hex = selectedHex.value;
  if (!hex || !hex.claimed) {
    setStatus("Claim a tile to dispatch dwarves.", "warn");
    return;
  }
  if (!hex.economy.buildings.length) {
    setStatus("Place at least one structure before running a haul.", "warn");
    return;
  }
  const { resources, events } = resolveEconomy(hex);
  updateHex(hex.id, (draft) => {
    draft.economy.resources = resources;
    const entries = events.length ? events : ["No production fired—check your inputs."];
    const newLogs = entries.map((event) => makeHaulingEvent(event));
    draft.economy.haulingLog = [...newLogs, ...draft.economy.haulingLog].slice(0, 6);
    return draft;
  });
  setStatus(
    events.length ? "The haul completed and goods reached their destinations." : "Supply carts could not find valid production chains.",
    events.length ? "success" : "warn"
  );
};

const connectedNeighbors = computed(() => {
  const hex = selectedHex.value;
  if (!hex) return [];
  return hex.roads
    .map((neighborId) => hexById(neighborId))
    .filter((neighbor): neighbor is HexTile => Boolean(neighbor));
});

const adjustZoom = (delta: number) => {
  const next = Math.min(3, Math.max(1, zoomLevel.value + delta));
  zoomLevel.value = parseFloat(next.toFixed(2));
};

const focusSelectedHex = () => {
  const hex = selectedHex.value;
  if (!hex?.claimed) {
    setStatus("Only claimed hexes can be zoomed into.", "warn");
    return;
  }
  zoomedHexId.value = hex.id;
  setStatus(`Zoomed into ${hex.name}.`);
};
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-hero)] py-10 text-foreground">
    <div class="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />

    <main class="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4">
      <section
        class="rounded-3xl border border-border/40 bg-card/70 p-6 shadow-[var(--shadow-game)] backdrop-blur-lg md:p-8"
      >
        <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.5em] text-accent">Mountain King</p>
            <h1 class="mt-3 text-4xl font-black tracking-tight md:text-5xl">
              Command the Hex Dominion
            </h1>
            <p class="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
              Pan across the highland hex map, pave roads by hand, and stitch together a settlers-like supply chain.
              Every claimed tile unlocks new production chains, but only if your dwarves can haul goods along the roads
              fed by other game rewards.
            </p>
          </div>
          <div class="grid flex-shrink-0 grid-cols-2 gap-3 text-center md:grid-cols-3">
            <div class="rounded-2xl border border-border/30 bg-background/60 p-3">
              <p class="text-[11px] uppercase tracking-[0.4em] text-muted-foreground">Tiles</p>
              <p class="text-2xl font-bold">{{ claimedTiles }}/{{ totalTiles }}</p>
            </div>
            <div class="rounded-2xl border border-border/30 bg-background/60 p-3">
              <p class="text-[11px] uppercase tracking-[0.4em] text-muted-foreground">Prestige</p>
              <p class="text-2xl font-bold">{{ totalPrestige }}</p>
            </div>
            <div class="rounded-2xl border border-border/30 bg-background/60 p-3">
              <p class="text-[11px] uppercase tracking-[0.4em] text-muted-foreground">Roads</p>
              <p class="text-2xl font-bold">{{ totalRoadSegments }}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div class="rounded-3xl border border-border/40 bg-card/70 p-5 shadow-[var(--shadow-game)] backdrop-blur">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <MapIcon class="h-6 w-6 text-accent" />
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.45em] text-muted-foreground">
                  Main Map
                </p>
                <p class="text-base font-semibold">Pan & scroll the dominion</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                @click="toggleRoadMode"
              >
                <Route class="h-4 w-4" />
                {{ isRoadMode ? "Exit Road Mode" : "Build Road" }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                @click="loadVault"
              >
                <RefreshCcw class="h-4 w-4" />
                Sync Vault
              </button>
            </div>
          </div>

          <p class="mt-3 text-xs uppercase tracking-[0.4em] text-muted-foreground">
            {{ isRoadMode ? "Road Mode Active" : "Navigation Mode" }}
          </p>
          <p class="text-sm text-muted-foreground">
            <template v-if="isRoadMode">
              {{ roadSourceId ? "Select a neighboring hex to finish the road." : "Choose a claimed origin hex to start the road." }}
            </template>
            <template v-else>
              Click any hex to inspect it. Claimed tiles glow brighter and can be zoomed in on.
            </template>
          </p>

          <div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,320px)]">
            <div class="space-y-5">
              <div class="rounded-2xl border border-border/30 bg-background/60 p-4">
                <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                  Map Window Guidance
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                  Drag inside the window or use scroll wheels to move sideways or vertically. The atlas remembers which
                  hex you tapped and highlights existing roads so you can stitch the frontier together.
                </p>
              </div>

              <div class="rounded-3xl border border-border/40 bg-background/80 shadow-inner">
                <div
                  class="flex items-center justify-between border-b border-border/30 px-5 py-3 text-xs uppercase tracking-[0.35em] text-muted-foreground"
                >
                  <span>Atlas Window</span>
                  <span class="text-[10px] text-muted-foreground/70">Scroll both axes to explore</span>
                </div>
                <div
                  class="h-[560px] overflow-auto rounded-b-3xl border-t border-border/30 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.08),_transparent_45%)] p-4"
                >
                  <div class="relative min-h-[900px] min-w-[1200px]" :style="mapCanvasStyle">
                    <button
                      v-for="hex in hexes"
                      :key="hex.id"
                      type="button"
                      class="hex-cell absolute flex flex-col items-center justify-center border text-center transition"
                      :class="[
                        terrainGradients[hex.terrain],
                        hex.claimed ? 'border-primary/70 shadow-lg shadow-primary/30' : 'border-border/50 opacity-70',
                        selectedHex?.id === hex.id ? 'ring-4 ring-accent/60' : '',
                        hex.hasCapital ? 'capital-edge' : '',
                      ]"
                      :style="tilePositionStyle(hex)"
                      @click="handleHexClick(hex)"
                    >
                      <span class="text-xs font-semibold uppercase tracking-widest">{{ hex.name }}</span>
                      <span class="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        {{ terrainLabels[hex.terrain] }}
                      </span>
                      <span
                        class="mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4em]"
                        :class="hex.claimed ? 'bg-primary/60 text-background' : hasRoadToEmpire(hex) ? 'bg-primary/20 text-primary' : 'bg-background/60 text-muted-foreground'"
                      >
                        {{ hex.claimed ? "Claimed" : hasRoadToEmpire(hex) ? "Linked" : "Wild" }}
                      </span>
                      <span v-if="hex.roads.length" class="mt-1 text-[10px] text-muted-foreground">
                        {{ hex.roads.length }} road{{ hex.roads.length === 1 ? "" : "s" }}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="w-full space-y-4 rounded-2xl border border-border/40 bg-background/80 p-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                  Resource Vault
                </p>
                <ul class="mt-3 space-y-2">
                  <li
                    v-for="snapshot in resourceVault"
                    :key="snapshot.key"
                    class="flex items-center justify-between text-sm"
                  >
                    <span class="text-muted-foreground">{{ snapshot.definition.singular }}</span>
                    <span class="font-semibold">{{ snapshot.amount }}</span>
                  </li>
                </ul>
              </div>
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Legend</p>
                <ul class="mt-3 space-y-2 text-xs text-muted-foreground">
                  <li v-for="terrain in terrainPalette" :key="terrain" class="flex items-center gap-2">
                    <span
                      class="inline-block h-3 w-3 rounded-full"
                      :class="{
                        'bg-slate-500': terrain === 'granite',
                        'bg-sky-500': terrain === 'frost',
                        'bg-emerald-500': terrain === 'evergreen',
                        'bg-orange-500': terrain === 'ember',
                        'bg-purple-500': terrain === 'glimmer',
                      }"
                    />
                    {{ terrainLabels[terrain] }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div
            v-if="statusMessage"
            class="mt-4 rounded-2xl border border-border/40 px-4 py-3 text-sm"
            :class="{
              'bg-primary/10 text-primary': statusMessage.tone === 'info',
              'bg-emerald-500/15 text-emerald-300': statusMessage.tone === 'success',
              'bg-amber-500/15 text-amber-200': statusMessage.tone === 'warn',
            }"
          >
            {{ statusMessage.text }}
          </div>
        </div>

        <div class="space-y-5">
          <section class="rounded-3xl border border-border/40 bg-card/70 p-5 shadow-[var(--shadow-game)] backdrop-blur">
            <div class="flex items-center gap-3">
              <Mountain class="h-6 w-6 text-accent" />
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.45em] text-muted-foreground">Hex Detail</p>
                <h2 class="text-xl font-bold">{{ selectedHex?.name }}</h2>
              </div>
            </div>

            <p class="mt-2 text-sm text-muted-foreground">
              {{ terrainLabels[selectedHex?.terrain ?? "granite"] }} —
              <span class="font-semibold" :class="selectedHex?.claimed ? 'text-primary' : 'text-muted-foreground'">
                {{ selectedHex?.claimed ? "Claimed" : "Unclaimed" }}
              </span>
            </p>

            <div class="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                @click="claimSelectedHex"
                :disabled="!canClaimSelected"
                :class="{ 'opacity-50 cursor-not-allowed': !canClaimSelected }"
              >
                <Hammer class="h-4 w-4" />
                Claim Tile
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                @click="focusSelectedHex"
              >
                <Compass class="h-4 w-4" />
                Zoom Tile
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-full border border-border/50 px-3 py-1 text-xs font-semibold uppercase tracking-widest transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                @click="dispatchHaulers"
              >
                <Package class="h-4 w-4" />
                Dispatch Dwarves
              </button>
            </div>

            <div class="mt-4 rounded-2xl border border-border/30 bg-background/60 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                Claim Requirements
              </p>
              <p class="mt-1 text-sm text-foreground">
                {{ formatCost(claimCosts) }}
              </p>
              <p class="text-xs text-muted-foreground">
                Costs are paid from other minigames. Roads must link the tile to your empire before claiming.
              </p>
            </div>

            <div class="mt-4 space-y-3">
              <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Road Links</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-if="!connectedNeighbors.length"
                  class="rounded-full border border-dashed border-border/50 px-3 py-1 text-xs text-muted-foreground"
                >
                  No active links.
                </span>
                <span
                  v-for="neighbor in connectedNeighbors"
                  :key="neighbor.id"
                  class="rounded-full border border-border/50 px-3 py-1 text-xs"
                  :class="neighbor.claimed ? 'text-primary' : 'text-muted-foreground'"
                >
                  {{ neighbor.name }}
                </span>
              </div>
            </div>

            <div class="mt-5 grid gap-3 rounded-2xl border border-border/30 bg-background/70 p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Economy</p>
              <ul class="grid grid-cols-2 gap-3 text-sm">
                <li
                  v-for="resource in economyResourcesOrder"
                  :key="resource"
                  class="rounded-xl border border-border/30 bg-card/70 px-3 py-2"
                >
                  <p class="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                    {{ resourceLabels[resource] }}
                  </p>
                  <p class="text-xl font-semibold">
                    {{ selectedHex?.economy.resources[resource] ?? 0 }}
                  </p>
                </li>
              </ul>
            </div>

            <div class="mt-5">
              <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Hauling Log</p>
              <ul class="mt-2 space-y-2 text-xs text-muted-foreground">
                <li
                  v-for="event in selectedHex?.economy.haulingLog"
                  :key="event.id"
                  class="rounded-xl border border-border/20 bg-background/60 px-3 py-2"
                >
                  <span class="font-semibold text-foreground">{{ event.timestamp }}</span>
                  — {{ event.detail }}
                </li>
                <li v-if="!selectedHex?.economy.haulingLog.length" class="text-muted-foreground">
                  No hauls recorded yet. Dispatch dwarves to move goods.
                </li>
              </ul>
            </div>
          </section>

          <section class="rounded-3xl border border-border/40 bg-card/70 p-5 shadow-[var(--shadow-game)] backdrop-blur">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Shield class="h-6 w-6 text-accent" />
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.45em] text-muted-foreground">
                    Zoomed Hex
                  </p>
                  <h2 class="text-xl font-semibold">{{ zoomedHex?.name }}</h2>
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-full border border-border/50 p-2 text-xs hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  @click="adjustZoom(-0.2)"
                >
                  <ZoomOut class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="rounded-full border border-border/50 p-2 text-xs hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  @click="adjustZoom(0.2)"
                >
                  <ZoomIn class="h-4 w-4" />
                </button>
              </div>
            </div>

            <div class="mt-4">
              <div
                class="mx-auto flex h-64 w-64 items-center justify-center rounded-full border border-border/30 bg-background/70"
              >
                <div
                  class="hex-cell relative flex h-48 w-48 flex-col items-center justify-center border text-center shadow-xl transition"
                  :class="[
                    zoomedHex?.claimed ? 'border-primary/70 shadow-primary/30' : 'border-border/40 opacity-60',
                    zoomedHex ? terrainGradients[zoomedHex.terrain] : '',
                  ]"
                  :style="{ transform: `scale(${zoomLevel})` }"
                >
                  <span class="text-xs font-semibold uppercase tracking-[0.4em]">
                    {{ zoomedHex?.name }}
                  </span>
                  <span class="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                    {{ zoomedHex ? terrainLabels[zoomedHex.terrain] : "" }}
                  </span>
                  <span
                    class="mt-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.45em]"
                    :class="zoomedHex?.claimed ? 'bg-primary/70 text-background' : 'bg-background/60 text-muted-foreground'"
                  >
                    {{ zoomedHex?.claimed ? "Claimed" : "Wild" }}
                  </span>
                </div>
              </div>
              <p class="mt-3 text-center text-xs text-muted-foreground">
                Use zoom controls or focus a claimed tile to inspect its layout.
              </p>
            </div>
          </section>
        </div>
      </section>

      <section class="rounded-3xl border border-border/40 bg-card/70 p-6 shadow-[var(--shadow-game)] backdrop-blur">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <Trees class="h-6 w-6 text-accent" />
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.45em] text-muted-foreground">
                Settlers Economy
              </p>
              <h2 class="text-2xl font-bold">Blueprint Ledger</h2>
            </div>
          </div>
          <p class="text-sm text-muted-foreground">
            Buildings consume and produce goods. Dwarves haul outputs along roads you build manually.
          </p>
        </div>

        <div class="mt-6 grid gap-5 md:grid-cols-2">
          <div
            v-for="(blueprints, category) in blueprintGroups"
            :key="category"
            class="rounded-2xl border border-border/30 bg-background/60 p-4"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
              {{ category }}
            </p>
            <ul class="mt-4 space-y-3">
              <li
                v-for="blueprint in blueprints"
                :key="blueprint.id"
                class="rounded-2xl border border-border/30 bg-card/70 p-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold uppercase tracking-wide">{{ blueprint.name }}</p>
                    <p class="text-xs text-muted-foreground">{{ blueprint.description }}</p>
                  </div>
                  <button
                    type="button"
                    class="rounded-full border border-border/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.4em] transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    :class="{
                      'opacity-50 cursor-not-allowed':
                        !canAfford(Object.entries(blueprint.cost).map(([key, amount]) => ({ key: key as ResourceKey, amount: amount as number }))),
                    }"
                    @click="buildStructure(blueprint)"
                  >
                    <Pickaxe class="mr-1 inline h-3.5 w-3.5" />
                    Build
                  </button>
                </div>
                <p class="mt-2 text-xs text-muted-foreground">
                  Input:
                  {{
                    blueprint.inputs
                      ? Object.entries(blueprint.inputs)
                          .map(([key, amount]) => `${amount} ${resourceLabels[key as EconomyResource]}`)
                          .join(", ")
                      : "None"
                  }}
                </p>
                <p class="text-xs text-muted-foreground">
                  Output: {{ blueprint.output.amount }} {{ resourceLabels[blueprint.output.key] }}
                </p>
                <p class="text-xs text-muted-foreground">
                  Cost:
                  {{
                    Object.entries(blueprint.cost)
                      .map(
                        ([key, amount]) =>
                          `${amount} ${resourceVault.find((snapshot) => snapshot.key === key)?.definition.singular ?? key}`
                      )
                      .join(" + ")
                  }}
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.hex-cell {
  clip-path: polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%);
  min-width: 90px;
}

.capital-edge {
  box-shadow: 0 0 25px rgba(255, 255, 255, 0.25);
}
</style>

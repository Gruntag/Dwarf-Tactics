<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Clock3, Compass, Flag, Hammer, Loader2, Route } from "lucide-vue-next";

const GRID_COLUMNS = 14;
const GRID_ROWS = 12;
const TOTAL_TILES = GRID_COLUMNS * GRID_ROWS;
const PROCESS_TIME_MS = 30000;
const SIM_TICK_MS = 500;
const WORKER_SPEED_MS = 2000; // 2 seconds per hex
const FOREST_PATCHES = 35;
const HILL_COUNT = 12;
const TOWN_HALL_SINK_AMOUNT = 9999;
const HEX_WIDTH = 112;
const HEX_SIZE = HEX_WIDTH / 2;
const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE; // perfect flat-top

type ResourceType =
  | "logs"
  | "boards"
  | "stone"
  | "skins"
  | "ironOre"
  | "coal"
  | "ironBars"
  | "pigs"
  | "grain"
  | "flour"
  | "bread"
  | "axes"
  | "shields"
  | "armor"
  | "beer"
  | "meat";

interface ResourceDescriptor {
  label: string;
  role: "raw" | "refined" | "tool" | "food" | "military";
  starting?: number;
  note?: string;
}

const RESOURCE_LIBRARY: Record<ResourceType, ResourceDescriptor> = {
  logs: { label: "Logs", role: "raw" },
  boards: { label: "Boards", role: "refined", starting: 20 },
  stone: { label: "Stone", role: "raw", starting: 20 },
  skins: { label: "Skins", role: "raw", starting: 5 },
  ironOre: { label: "Iron Ore", role: "raw" },
  coal: { label: "Coal", role: "raw" },
  ironBars: { label: "Iron Bars", role: "refined" },
  pigs: { label: "Pigs", role: "raw" },
  grain: { label: "Grain", role: "raw" },
  flour: { label: "Flour", role: "refined" },
  bread: { label: "Bread", role: "food", note: "Food" },
  axes: { label: "Axes", role: "military", note: "Needed for warriors" },
  shields: { label: "Shields", role: "military", note: "Needed for warriors" },
  armor: { label: "Armor", role: "military", note: "Needed for warriors" },
  beer: { label: "Beer", role: "food", note: "Needed for warriors" },
  meat: { label: "Meat", role: "food" },
};

const RESOURCE_ORDER: ResourceType[] = [
  "logs",
  "boards",
  "stone",
  "skins",
  "ironOre",
  "coal",
  "ironBars",
  "grain",
  "flour",
  "bread",
  "pigs",
  "meat",
  "beer",
  "axes",
  "shields",
  "armor",
];

type HillYield = "stone" | "ironOre" | "coal";

interface HexTile {
  id: string;
  col: number;
  row: number;
  q: number;
  r: number;
  trees: number;
  hillResource: HillYield | null;
  isCapital: boolean;
  buildingId: string | null;
  forestStatus: "cutting" | "planting" | null;
}

type BuildableType =
  | "woodcutter"
  | "forester"
  | "sawmill"
  | "mine"
  | "ironSmelter"
  | "smithy"
  | "armorer"
  | "farm"
  | "pigFarm"
  | "butcher"
  | "windmill"
  | "bakery"
  | "brewery";

type BuildingType = BuildableType | "townHall";

type ResourceMap = Partial<Record<ResourceType, number>>;

interface BuildingDefinition {
  type: BuildingType;
  name: string;
  description: string;
  category: string;
  cost: ResourceMap;
  buildable: boolean;
  process?: {
    inputs?: ResourceMap;
    outputs?: ResourceMap;
    durationMs?: number;
    special?: "woodcutter" | "forester" | "mine";
  };
  requirement?: (tile: HexTile) => boolean;
  inputBuffer?: ResourceMap;
}

interface ProcessIntent {
  label: string;
  durationMs?: number;
  inputs?: ResourceMap;
  outputs?: ResourceMap;
  onStart?: (building: BuildingInstance, tile: HexTile) => void;
  onComplete?: (building: BuildingInstance, tile: HexTile, intent: ProcessIntent) => void;
}

interface ProcessingState {
  label: string;
  remainingMs: number;
  durationMs: number;
  intent: ProcessIntent;
}

interface BuildingInstance {
  id: string;
  type: BuildingType;
  tileId: string;
  flagInventory: ResourceMap;
  construction: {
    delivered: ResourceMap;
    complete: boolean;
  };
  processing: ProcessingState | null;
  lastMessage: string;
}

interface Need {
  resource: ResourceType;
  amount: number;
  priority: number;
}

interface Road {
  id: string;
  fromBuildingId: string;
  toBuildingId: string;
  distance: number;
  worker: RoadWorker;
}

interface RoadWorker {
  status: "idle" | "hauling";
  direction: "forward" | "backward";
  job: TransferJob | null;
  progressMs: number;
  durationMs: number;
}

interface TransferJob {
  id: string;
  from: string;
  to: string;
  resource: ResourceType;
  priority: number;
}

const BUILDING_LIBRARY: Record<BuildingType, BuildingDefinition> = {
  townHall: {
    type: "townHall",
    name: "Mountain Keep",
    description: "Stores every resource needed by the realm.",
    category: "Capital",
    cost: {},
    buildable: false,
  },
  woodcutter: {
    type: "woodcutter",
    name: "Woodcutter",
    description: "Cuts nearby trees into logs.",
    category: "Forestry",
    cost: { boards: 2 },
    buildable: true,
    process: { special: "woodcutter" },
  },
  forester: {
    type: "forester",
    name: "Forester",
    description: "Plants new groves to keep the saws fed.",
    category: "Forestry",
    cost: { boards: 2 },
    buildable: true,
    process: { special: "forester" },
  },
  sawmill: {
    type: "sawmill",
    name: "Sawmill",
    description: "Turns logs into sturdy boards.",
    category: "Forestry",
    cost: { boards: 5, stone: 2 },
    buildable: true,
    process: { inputs: { logs: 2 }, outputs: { boards: 2 } },
    inputBuffer: { logs: 4 },
  },
  mine: {
    type: "mine",
    name: "Mine",
    description: "Consumes food to pull stone, coal, or ore depending on the hill.",
    category: "Extraction",
    cost: { boards: 10 },
    buildable: true,
    process: { special: "mine" },
    requirement: (tile) => Boolean(tile.hillResource),
    inputBuffer: { bread: 2, meat: 2 },
  },
  ironSmelter: {
    type: "ironSmelter",
    name: "Iron Smelter",
    description: "Burns coal with ore to pour iron bars.",
    category: "Industry",
    cost: { boards: 5, stone: 2 },
    buildable: true,
    process: { inputs: { ironOre: 1, coal: 1 }, outputs: { ironBars: 1 } },
    inputBuffer: { ironOre: 2, coal: 2 },
  },
  smithy: {
    type: "smithy",
    name: "Smithy",
    description: "Forms axes and shields for the warriors.",
    category: "Industry",
    cost: { boards: 3, stone: 5, ironBars: 1 },
    buildable: true,
    process: { inputs: { boards: 1, ironBars: 1 }, outputs: { axes: 1, shields: 1 } },
    inputBuffer: { boards: 2, ironBars: 2 },
  },
  armorer: {
    type: "armorer",
    name: "Armorer",
    description: "Shapes armor from skins and iron bars.",
    category: "Industry",
    cost: { boards: 3, stone: 5, ironBars: 1 },
    buildable: true,
    process: { inputs: { ironBars: 1, skins: 1 }, outputs: { armor: 1 } },
    inputBuffer: { ironBars: 2, skins: 2 },
  },
  farm: {
    type: "farm",
    name: "Farm",
    description: "Sows grain around the tile and harvests it.",
    category: "Harvest",
    cost: { boards: 8, stone: 4 },
    buildable: true,
    process: { outputs: { grain: 2 } },
  },
  pigFarm: {
    type: "pigFarm",
    name: "Pig Farm",
    description: "Feeds grain to pigs.",
    category: "Harvest",
    cost: { boards: 7, stone: 3 },
    buildable: true,
    process: { inputs: { grain: 1 }, outputs: { pigs: 1 } },
    inputBuffer: { grain: 3 },
  },
  butcher: {
    type: "butcher",
    name: "Butcher",
    description: "Turns pigs into meat and skins.",
    category: "Harvest",
    cost: { boards: 5, stone: 2 },
    buildable: true,
    process: { inputs: { pigs: 1 }, outputs: { meat: 1, skins: 1 } },
    inputBuffer: { pigs: 2 },
  },
  windmill: {
    type: "windmill",
    name: "Windmill",
    description: "Grinds grain into flour.",
    category: "Processing",
    cost: { boards: 8, stone: 3, skins: 4 },
    buildable: true,
    process: { inputs: { grain: 1 }, outputs: { flour: 1 } },
    inputBuffer: { grain: 3 },
  },
  bakery: {
    type: "bakery",
    name: "Bakery",
    description: "Bakes flour into bread.",
    category: "Processing",
    cost: { boards: 3, stone: 7 },
    buildable: true,
    process: { inputs: { flour: 1 }, outputs: { bread: 1 } },
    inputBuffer: { flour: 3 },
  },
  brewery: {
    type: "brewery",
    name: "Brewery",
    description: "Brews grain into beer.",
    category: "Processing",
    cost: { boards: 3, stone: 7, ironBars: 2 },
    buildable: true,
    process: { inputs: { grain: 1 }, outputs: { beer: 1 } },
    inputBuffer: { grain: 3 },
  },
};

const router = useRouter();
const goHome = () => {
  router.push("/");
};

const { tiles: generatedTiles, capitalTileId } = createWorld();
const tilePositions = new Map<string, { x: number; y: number }>();
const mapExtents = computeMapExtents(generatedTiles);
const tiles = ref<HexTile[]>(generatedTiles);
const buildings = ref<BuildingInstance[]>([]);
const roads = ref<Road[]>([]);
const selectedTileId = ref<string | null>(capitalTileId);
const roadAnchor = ref<BuildingInstance | null>(null);
const statusMessage = ref("Connect flags with roads to let workers haul resources (1s per hex).");

const mapStyle = computed(() => {
  const width = mapExtents.maxX - mapExtents.minX + HEX_WIDTH * 2;
  const height = mapExtents.maxY - mapExtents.minY + HEX_HEIGHT * 2;
  return {
    width: `${width}px`,
    height: `${height}px`,
  };
});

const startInventory: ResourceMap = {};
for (const resource of RESOURCE_ORDER) {
  const starting = RESOURCE_LIBRARY[resource].starting ?? 0;
  if (starting > 0) {
    startInventory[resource] = starting;
  }
}

const townHall = createBuildingInstance("townHall", capitalTileId, startInventory);
buildings.value.push(townHall);
const capitalTile = tiles.value.find((tile) => tile.id === capitalTileId);
if (capitalTile) {
  capitalTile.buildingId = townHall.id;
}

let simHandle: number | null = null;

onMounted(() => {
  simHandle = window.setInterval(() => {
    updateBuildings(SIM_TICK_MS);
    updateRoads(SIM_TICK_MS);
  }, SIM_TICK_MS);
});

onBeforeUnmount(() => {
  if (simHandle) {
    window.clearInterval(simHandle);
    simHandle = null;
  }
});

const selectedTile = computed(() => tiles.value.find((tile) => tile.id === selectedTileId.value) ?? null);

const selectedBuilding = computed(() => {
  if (!selectedTile.value || !selectedTile.value.buildingId) return null;
  return buildings.value.find((building) => building.id === selectedTile.value?.buildingId) ?? null;
});

const selectedDefinition = computed(() => (selectedBuilding.value ? BUILDING_LIBRARY[selectedBuilding.value.type] : null));

const selectedRemainingCost = computed(() => (selectedBuilding.value ? getRemainingCost(selectedBuilding.value) : {}));

const selectedRoads = computed(() => {
  if (!selectedBuilding.value) return [];
  return roads.value.filter(
    (road) => road.fromBuildingId === selectedBuilding.value?.id || road.toBuildingId === selectedBuilding.value?.id,
  );
});

const buildableGroups = computed(() => {
  const map = new Map<string, BuildingDefinition[]>();
  Object.values(BUILDING_LIBRARY)
    .filter((definition) => definition.buildable)
    .forEach((definition) => {
      if (!map.has(definition.category)) {
        map.set(definition.category, []);
      }
      map.get(definition.category)!.push(definition);
    });
  return Array.from(map.entries()).map(([category, definitions]) => ({ category, definitions }));
});

const forestTileCount = computed(() => tiles.value.filter((tile) => tile.trees > 0).length);
const hillTileCount = computed(() => tiles.value.filter((tile) => tile.hillResource).length);

const globalInventory = computed(() => {
  const totals: Record<ResourceType, number> = Object.fromEntries(RESOURCE_ORDER.map((resource) => [resource, 0])) as Record<
    ResourceType,
    number
  >;
  buildings.value.forEach((building) => {
    Object.entries(building.flagInventory).forEach(([resourceKey, amount]) => {
      if (!amount) return;
      totals[resourceKey as ResourceType] += amount;
    });
    if (!building.construction.complete) {
      Object.entries(building.construction.delivered).forEach(([resourceKey, amount]) => {
        if (!amount) return;
        totals[resourceKey as ResourceType] += amount;
      });
    }
  });
  return totals;
});

function createWorld(): { tiles: HexTile[]; capitalTileId: string } {
  const tiles: HexTile[] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLUMNS; col += 1) {
      const q = col - Math.floor(row / 2);
      const r = row;
      tiles.push({
        id: `${col}-${row}`,
        col,
        row,
        q,
        r,
        trees: 0,
        hillResource: null,
        isCapital: false,
        buildingId: null,
        forestStatus: null,
      });
    }
  }
  const capitalCol = Math.floor(GRID_COLUMNS / 2);
  const capitalRow = Math.floor(GRID_ROWS / 2);
  const capitalId = `${capitalCol}-${capitalRow}`;
  const capitalTile = tiles.find((tile) => tile.id === capitalId);
  if (capitalTile) {
    capitalTile.isCapital = true;
  }
  seedForests(tiles, capitalId);
  seedHills(tiles, capitalId);
  return { tiles, capitalTileId: capitalId };
}

function axialToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (1.5 * q);
  const y = HEX_SIZE * (Math.sqrt(3) * (r + q / 2));
  return { x, y };
}

function computeMapExtents(allTiles: HexTile[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  allTiles.forEach((tile) => {
    const pos = axialToPixel(tile.q, tile.r);
    tilePositions.set(tile.id, pos);
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
  });
  return { minX, maxX, minY, maxY };
}

function hexDistance(a: Pick<HexTile, "q" | "r">, b: Pick<HexTile, "q" | "r">): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

function getTilesWithinRadius(allTiles: HexTile[], center: HexTile, radius: number): HexTile[] {
  return allTiles.filter((tile) => hexDistance(tile, center) <= radius);
}

function seedForests(allTiles: HexTile[], capitalId: string): void {
  for (let i = 0; i < FOREST_PATCHES; i += 1) {
    const candidates = allTiles.filter((tile) => tile.id !== capitalId && !tile.isCapital);
    const anchor = candidates[Math.floor(Math.random() * candidates.length)];
    if (!anchor) continue;
    const radius = 1 + Math.floor(Math.random() * 2);
    const cluster = getTilesWithinRadius(allTiles, anchor, radius).filter((tile) => tile.id !== capitalId);
    cluster.forEach((tile) => {
      tile.trees = 1;
    });
  }
}

function seedHills(allTiles: HexTile[], capitalId: string): void {
  const capitalTile = allTiles.find((tile) => tile.id === capitalId);
  const hillTypes: HillYield[] = ["stone", "ironOre", "coal"];

  if (capitalTile) {
    const nearby = allTiles.filter((tile) => tile.id !== capitalId && hexDistance(tile, capitalTile) <= 5);
    const guaranteed = nearby[Math.floor(Math.random() * nearby.length)];
    if (guaranteed) {
      guaranteed.hillResource = "stone";
    }
  }

  let placed = allTiles.filter((tile) => tile.hillResource).length;
  let attempts = 0;
  while (placed < HILL_COUNT && attempts < 500) {
    const tile = allTiles[Math.floor(Math.random() * allTiles.length)];
    if (!tile || tile.id === capitalId || tile.hillResource) {
      attempts += 1;
      continue;
    }
    tile.hillResource = hillTypes[Math.floor(Math.random() * hillTypes.length)];
    placed += 1;
    attempts += 1;
  }

  if (
    capitalTile &&
    !allTiles.some((tile) => tile.hillResource === "stone" && hexDistance(tile, capitalTile) <= 5 && tile.id !== capitalId)
  ) {
    const fallback =
      allTiles.find((tile) => tile.id !== capitalId && hexDistance(tile, capitalTile) <= 5) ?? allTiles[1];
    if (fallback) {
      fallback.hillResource = "stone";
    }
  }
}

function createBuildingInstance(
  type: BuildingType,
  tileId: string,
  seedInventory?: ResourceMap,
): BuildingInstance {
  const definition = BUILDING_LIBRARY[type];
  const inventory: ResourceMap = {};
  if (seedInventory) {
    Object.entries(seedInventory).forEach(([resourceKey, amount]) => {
      if (!amount) return;
      inventory[resourceKey as ResourceType] = amount;
    });
  }
  return {
    id: makeId(type),
    type,
    tileId,
    flagInventory: inventory,
    construction: {
      delivered: {},
      complete: !definition.buildable,
    },
    processing: null,
    lastMessage: definition.buildable ? "Awaiting materials." : "Ready to direct logistics.",
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function addInventory(map: ResourceMap, resource: ResourceType, amount: number): void {
  map[resource] = (map[resource] ?? 0) + amount;
}

function removeInventory(map: ResourceMap, resource: ResourceType, amount: number): boolean {
  const current = map[resource] ?? 0;
  if (current < amount) return false;
  const next = current - amount;
  if (next <= 0) {
    delete map[resource];
  } else {
    map[resource] = next;
  }
  return true;
}

function selectTile(tileId: string): void {
  selectedTileId.value = tileId;
}

function planBuilding(type: BuildableType): void {
  const tile = selectedTile.value;
  if (!tile || tile.isCapital) {
    statusMessage.value = "Choose a free tile away from the capital.";
    return;
  }
  if (tile.trees > 0) {
    statusMessage.value = "That hex is still forested. Clear the tree before staking a claim.";
    return;
  }
  if (tile.buildingId) {
    statusMessage.value = "That tile already has a flag.";
    return;
  }
  const definition = BUILDING_LIBRARY[type];
  if (definition.requirement && !definition.requirement(tile)) {
    statusMessage.value = `${definition.name} must be built on a matching hill.`;
    return;
  }
  const building = createBuildingInstance(type, tile.id);
  buildings.value.push(building);
  tile.buildingId = building.id;
  statusMessage.value = `${definition.name} foundation marked. Deliver ${formatCost(definition.cost)} to raise it.`;
}

function formatCost(cost: ResourceMap): string {
  const parts = Object.entries(cost).map(
    ([resourceKey, amount]) => `${amount} ${RESOURCE_LIBRARY[resourceKey as ResourceType].label}`,
  );
  return parts.length ? parts.join(" + ") : "Free";
}

function getBuildingName(building: BuildingInstance | null | undefined): string {
  if (!building) return "Empty";
  return BUILDING_LIBRARY[building.type].name;
}

function getBuildingById(id: string): BuildingInstance | undefined {
  return buildings.value.find((building) => building.id === id);
}

function getBuildingAtTile(tileId: string): BuildingInstance | undefined {
  return buildings.value.find((building) => building.tileId === tileId);
}

function getRemainingCost(building: BuildingInstance): ResourceMap {
  const definition = BUILDING_LIBRARY[building.type];
  const remaining: ResourceMap = {};
  Object.entries(definition.cost).forEach(([resourceKey, amount]) => {
    const resource = resourceKey as ResourceType;
    const delivered = building.construction.delivered[resource] ?? 0;
    if ((amount ?? 0) - delivered > 0) {
      remaining[resource] = (amount ?? 0) - delivered;
    }
  });
  return remaining;
}

function receiveResource(building: BuildingInstance, resource: ResourceType, amount: number): void {
  if (!building.construction.complete) {
    const remaining = getRemainingCost(building);
    const needed = remaining[resource] ?? 0;
    if (needed > 0) {
      building.construction.delivered[resource] = (building.construction.delivered[resource] ?? 0) + amount;
      const outstanding = getRemainingCost(building);
      if (Object.keys(outstanding).length === 0) {
        building.construction.complete = true;
        building.lastMessage = "Structure completed.";
        statusMessage.value = `${BUILDING_LIBRARY[building.type].name} is now operational.`;
      }
      return;
    }
  }
  addInventory(building.flagInventory, resource, amount);
}

function calculateNeeds(building: BuildingInstance): Need[] {
  const definition = BUILDING_LIBRARY[building.type];
  if (!building.construction.complete) {
    return Object.entries(getRemainingCost(building)).map(([resourceKey, amount]) => ({
      resource: resourceKey as ResourceType,
      amount: amount ?? 0,
      priority: 10,
    }));
  }
  if (building.type === "townHall") {
    return RESOURCE_ORDER.map((resource) => ({
      resource,
      amount: TOWN_HALL_SINK_AMOUNT,
      priority: 1,
    }));
  }
  if (!definition.process) return [];
  const needs: Need[] = [];
  if (definition.process.inputs) {
    Object.entries(definition.process.inputs).forEach(([resourceKey, cost]) => {
      const resource = resourceKey as ResourceType;
      const buffer = definition.inputBuffer?.[resource] ?? ((cost ?? 1) * 2);
      const current = building.flagInventory[resource] ?? 0;
      if (current < buffer) {
        needs.push({ resource, amount: buffer - current, priority: 5 });
      }
    });
  }
  if (definition.process.special === "mine") {
    const bread = building.flagInventory.bread ?? 0;
    if (bread < 2) {
      needs.push({ resource: "bread", amount: 2 - bread, priority: 5 });
    }
    const meat = building.flagInventory.meat ?? 0;
    if (meat < 2) {
      needs.push({ resource: "meat", amount: 2 - meat, priority: 4 });
    }
  }
  return needs;
}

function getReservedAmount(building: BuildingInstance, resource: ResourceType): number {
  if (!building.construction.complete) return 0;
  if (building.type === "townHall") return 0;
  const definition = BUILDING_LIBRARY[building.type];
  if (definition.inputBuffer?.[resource]) return definition.inputBuffer[resource] ?? 0;
  const inputRequirement = definition.process?.inputs?.[resource] ?? 0;
  if (inputRequirement > 0) return inputRequirement * 2;
  return 0;
}

function calculateSupply(building: BuildingInstance): Array<{ resource: ResourceType; amount: number }> {
  if (!building.construction.complete) return [];
  const supplies: Array<{ resource: ResourceType; amount: number }> = [];
  RESOURCE_ORDER.forEach((resource) => {
    const amount = building.flagInventory[resource] ?? 0;
    if (amount <= 0) return;
    const reserved = getReservedAmount(building, resource);
    const available = amount - reserved;
    if (available > 0) {
      supplies.push({ resource, amount: available });
    }
  });
  return supplies;
}

function findJobBetween(source: BuildingInstance, target: BuildingInstance): TransferJob | null {
  const supplies = calculateSupply(source);
  const needs = calculateNeeds(target);
  if (!supplies.length || !needs.length) return null;
  let best: TransferJob | null = null;
  needs.forEach((need) => {
    const supply = supplies.find((candidate) => candidate.resource === need.resource);
    if (!supply || supply.amount <= 0) return;
    if (!best || need.priority > best.priority) {
      best = {
        id: makeId("job"),
        from: source.id,
        to: target.id,
        resource: need.resource,
        priority: need.priority,
      };
    }
  });
  return best;
}

function assignJob(road: Road): void {
  if (road.worker.status !== "idle") return;
  const from = getBuildingById(road.fromBuildingId);
  const to = getBuildingById(road.toBuildingId);
  if (!from || !to) return;

  const forward = findJobBetween(from, to);
  const backward = findJobBetween(to, from);

  let job: TransferJob | null = null;
  if (forward && backward) {
    job = forward.priority >= backward.priority ? forward : backward;
  } else {
    job = forward ?? backward ?? null;
  }

  if (!job) return;
  const source = getBuildingById(job.from);
  if (!source) return;
  if (!removeInventory(source.flagInventory, job.resource, 1)) {
    return;
  }
  road.worker.job = job;
  road.worker.status = "hauling";
  road.worker.direction = job.from === road.fromBuildingId ? "forward" : "backward";
  road.worker.progressMs = 0;
  road.worker.durationMs = Math.max(1, road.distance) * WORKER_SPEED_MS;
}

function updateRoads(deltaMs: number): void {
  roads.value.forEach((road) => {
    if (road.worker.status === "idle") {
      assignJob(road);
      return;
    }
    if (!road.worker.job) {
      road.worker.status = "idle";
      return;
    }
    road.worker.progressMs += deltaMs;
    if (road.worker.progressMs >= road.worker.durationMs) {
      const destination = getBuildingById(road.worker.job.to);
      if (destination) {
        receiveResource(destination, road.worker.job.resource, 1);
      }
      road.worker.job = null;
      road.worker.status = "idle";
      road.worker.progressMs = 0;
      assignJob(road);
    }
  });
}

function resolveProcessIntent(building: BuildingInstance, tile: HexTile | undefined): ProcessIntent | null {
  const definition = BUILDING_LIBRARY[building.type];
  const process = definition.process;
  if (!tile || !process) return null;
  switch (process.special) {
    case "woodcutter":
      return resolveWoodcutterIntent(tile);
    case "forester":
      return resolveForesterIntent(tile);
    case "mine":
      return resolveMineIntent(building, tile);
    default:
      return resolveStandardIntent(building, definition);
  }
}

function resolveWoodcutterIntent(tile: HexTile): ProcessIntent | null {
  const capitalTile = tiles.value.find((candidate) => candidate.id === tile.id);
  const available = getTilesWithinRadius(tiles.value, tile, 3)
    .filter((candidate) => candidate.trees > 0 && candidate.forestStatus !== "cutting")
    .sort((a, b) => hexDistance(tile, a) - hexDistance(tile, b));
  if (available.length === 0) return null;
  const target = available[0];
  const distance = hexDistance(tile, target);
  const duration = PROCESS_TIME_MS + distance * 4000; // +4s per tile
  return {
    label: "Felling trees",
    durationMs: duration,
    outputs: { logs: 1 },
    onStart: () => {
      target.forestStatus = "cutting";
    },
    onComplete: () => {
      target.trees = 0;
      target.forestStatus = null;
    },
  };
}

function resolveForesterIntent(tile: HexTile): ProcessIntent | null {
  const choices = getTilesWithinRadius(tiles.value, tile, 2).filter(
    (candidate) =>
      candidate.trees === 0 && !candidate.isCapital && !candidate.buildingId && candidate.forestStatus !== "planting",
  );
  if (choices.length === 0) return null;
  const target = choices[Math.floor(Math.random() * choices.length)];
  target.forestStatus = "planting";
  return {
    label: "Planting seedlings",
    durationMs: PROCESS_TIME_MS,
    onComplete: () => {
      target.trees = 1;
      target.forestStatus = null;
    },
  };
}

function resolveMineIntent(building: BuildingInstance, tile: HexTile): ProcessIntent | null {
  if (!tile.hillResource) return null;
  const bread = building.flagInventory.bread ?? 0;
  const meat = building.flagInventory.meat ?? 0;
  let input: ResourceType | null = null;
  if (bread > 0) input = "bread";
  else if (meat > 0) input = "meat";
  if (!input) return null;
  return {
    label: "Feeding miners",
    durationMs: PROCESS_TIME_MS,
    inputs: { [input]: 1 },
    outputs: { [tile.hillResource]: 1 },
  };
}

function resolveStandardIntent(building: BuildingInstance, definition: BuildingDefinition): ProcessIntent | null {
  const process = definition.process;
  if (!process) return null;
  if (process.inputs) {
    const blocked = Object.entries(process.inputs).some(
      ([resourceKey, cost]) => (building.flagInventory[resourceKey as ResourceType] ?? 0) < (cost ?? 0),
    );
    if (blocked) return null;
  }
  return {
    label: `Processing ${definition.name}`,
    durationMs: process.durationMs ?? PROCESS_TIME_MS,
    inputs: process.inputs,
    outputs: process.outputs,
  };
}

function updateBuildings(deltaMs: number): void {
  buildings.value.forEach((building) => {
    if (!building.construction.complete) return;
    if (!building.processing) {
      const tile = tiles.value.find((candidate) => candidate.id === building.tileId);
      const intent = resolveProcessIntent(building, tile);
      if (!intent) return;
      if (intent.inputs) {
        const blocked = Object.entries(intent.inputs).some(
          ([resourceKey, amount]) => (building.flagInventory[resourceKey as ResourceType] ?? 0) < (amount ?? 0),
        );
        if (blocked) return;
        Object.entries(intent.inputs).forEach(([resourceKey, amount]) => {
          removeInventory(building.flagInventory, resourceKey as ResourceType, amount ?? 0);
        });
      }
      intent.onStart?.(building, tile!);
      building.processing = {
        label: intent.label,
        remainingMs: intent.durationMs ?? PROCESS_TIME_MS,
        durationMs: intent.durationMs ?? PROCESS_TIME_MS,
        intent,
      };
      building.lastMessage = intent.label;
      return;
    }
    building.processing.remainingMs -= deltaMs;
    if (building.processing.remainingMs <= 0) {
      const tile = tiles.value.find((candidate) => candidate.id === building.tileId);
      if (building.processing.intent.outputs) {
        Object.entries(building.processing.intent.outputs).forEach(([resourceKey, amount]) => {
          addInventory(building.flagInventory, resourceKey as ResourceType, amount ?? 0);
        });
      }
      building.processing.intent.onComplete?.(building, tile!, building.processing.intent);
      building.processing = null;
      building.lastMessage = `${BUILDING_LIBRARY[building.type].name} completed a batch.`;
    }
  });
}

function markRoadAnchor(): void {
  if (!selectedBuilding.value) {
    statusMessage.value = "Select a building flag first.";
    return;
  }
  if (roadAnchor.value && roadAnchor.value.id === selectedBuilding.value.id) {
    roadAnchor.value = null;
    return;
  }
  roadAnchor.value = selectedBuilding.value;
  statusMessage.value = `${BUILDING_LIBRARY[selectedBuilding.value.type].name} ready as road start. Choose the destination flag next.`;
}

function connectRoad(): void {
  if (!roadAnchor.value || !selectedBuilding.value) {
    statusMessage.value = "Set both endpoints before connecting.";
    return;
  }
  if (roadAnchor.value.id === selectedBuilding.value.id) {
    statusMessage.value = "Select a different flag to connect.";
    return;
  }
  const existing = roads.value.some(
    (road) =>
      (road.fromBuildingId === roadAnchor.value?.id && road.toBuildingId === selectedBuilding.value?.id) ||
      (road.toBuildingId === roadAnchor.value?.id && road.fromBuildingId === selectedBuilding.value?.id),
  );
  if (existing) {
    statusMessage.value = "Those flags are already linked.";
    return;
  }
  const startTile = tiles.value.find((tile) => tile.id === roadAnchor.value?.tileId);
  const endTile = tiles.value.find((tile) => tile.id === selectedBuilding.value?.tileId);
  if (!startTile || !endTile) return;
  const distance = Math.max(1, Math.round(hexDistance(startTile, endTile)));
  roads.value.push({
    id: makeId("road"),
    fromBuildingId: roadAnchor.value.id,
    toBuildingId: selectedBuilding.value.id,
    distance,
    worker: {
      status: "idle",
      direction: "forward",
      job: null,
      progressMs: 0,
      durationMs: distance * WORKER_SPEED_MS,
    },
  });
  statusMessage.value = `Road laid (${distance} hexes). A courier is now assigned between the two flags.`;
  roadAnchor.value = null;
}

function clearAnchor(): void {
  roadAnchor.value = null;
}

function processingPercent(building: BuildingInstance | null | undefined): number {
  if (!building?.processing) return 0;
  return Math.max(0, 1 - building.processing.remainingMs / building.processing.durationMs);
}

function tileHasGrain(tile: HexTile): boolean {
  if (!tile.buildingId) return false;
  const building = getBuildingById(tile.buildingId);
  if (!building || !building.construction.complete) return false;
  return building.type === "farm";
}

function getHexStyle(tile: HexTile) {
  const pos = tilePositions.get(tile.id);
  if (!pos) return {};
  const left = pos.x - mapExtents.minX + HEX_WIDTH;
  const top = pos.y - mapExtents.minY + HEX_HEIGHT;
  return {
    left: `${left}px`,
    top: `${top}px`,
  };
}
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
    <section class="rounded-3xl border border-border/50 bg-card/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Logistics sandbox</p>
          <h1 class="text-3xl font-bold text-white">Mountain King</h1>
          <p class="text-sm text-muted-foreground">
            100 hexes, one capital, and every flag must be connected by hand before workers haul goods.
          </p>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            class="flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-primary hover:text-primary"
            @click="goHome"
          >
            <ArrowLeft class="h-4 w-4" />
            Back to hub
          </button>
          <div class="flex items-center gap-2 rounded-full border border-border/50 px-4 py-2 text-xs text-muted-foreground">
            <Clock3 class="h-4 w-4" />
            Processing takes 30s • 1s per hex on roads
          </div>
        </div>
      </div>
      <p class="mt-4 rounded-2xl border border-border/40 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
        {{ statusMessage }}
      </p>
    </section>

    <section class="rounded-3xl border border-border/40 bg-card/70 p-6 shadow-[var(--shadow-game)]">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Hammer class="h-6 w-6 text-primary" />
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Stockpile</p>
            <h2 class="text-xl font-semibold text-white">Capital Inventory</h2>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">Town Hall absorbs every processed good before redistributing supplies.</p>
      </div>
      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="resource in RESOURCE_ORDER"
          :key="resource"
          class="rounded-2xl border border-border/40 bg-background/60 p-4"
        >
          <div class="flex items-center justify-between text-sm font-semibold text-white">
            <span>{{ RESOURCE_LIBRARY[resource].label }}</span>
            <span>{{ globalInventory[resource] ?? 0 }}</span>
          </div>
          <p class="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            {{ RESOURCE_LIBRARY[resource].role }} {{ RESOURCE_LIBRARY[resource].note ? `• ${RESOURCE_LIBRARY[resource].note}` : "" }}
          </p>
        </div>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div class="rounded-3xl border border-border/40 bg-card/70 p-6 shadow-[var(--shadow-game)]">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <Compass class="h-6 w-6 text-primary" />
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.45em] text-muted-foreground">Hex map</p>
              <h2 class="text-2xl font-semibold text-white">Settled Valley</h2>
            </div>
          </div>
          <div class="text-xs text-muted-foreground">
            {{ TOTAL_TILES }} tiles · {{ forestTileCount }} with trees · {{ hillTileCount }} hills
          </div>
        </div>
        <div class="mt-6 overflow-auto">
          <div class="hex-map" :style="mapStyle">
            <button
              v-for="tile in tiles"
              :key="tile.id"
              type="button"
              class="hex-button"
              :class="{
                'hex-selected': tile.id === selectedTileId,
                'hex-forest': tile.trees > 0,
                'hex-grain': tileHasGrain(tile),
                'hex-forest-cutting': tile.forestStatus === 'cutting',
                'hex-forest-planting': tile.forestStatus === 'planting',
                'hex-hill': tile.hillResource,
                'hex-capital': tile.isCapital,
                'hex-has-building': tile.buildingId,
              }"
              :style="getHexStyle(tile)"
              @click="selectTile(tile.id)"
            >
              <div class="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-200">
                {{ tile.col }},{{ tile.row }}
              </div>
              <div class="text-xs font-semibold text-white">
                {{ tile.isCapital ? "Keep" : getBuildingName(getBuildingAtTile(tile.id)) }}
              </div>
              <div v-if="tile.trees" class="text-[10px] text-emerald-300">
                Tree
              </div>
              <div v-else-if="tile.forestStatus === 'planting'" class="text-[10px] text-green-200">
                Planting
              </div>
              <div v-else-if="tile.forestStatus === 'cutting'" class="text-[10px] text-emerald-100">
                Clearing
              </div>
              <div v-if="tile.hillResource" class="text-[10px] text-amber-200">
                {{ tile.hillResource === "ironOre" ? "Iron hill" : `${tile.hillResource} hill` }}
              </div>
              <div v-if="tile.buildingId" class="mt-1 text-[10px] text-primary-foreground">
                <Flag class="hex-flag-icon" />
              </div>
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-6">
        <div class="rounded-3xl border border-border/40 bg-card/70 p-5">
          <div class="flex items-center gap-3">
            <Flag class="h-5 w-5 text-primary" />
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.45em] text-muted-foreground">Selected tile</p>
              <h2 class="text-xl font-semibold text-white">
                {{ selectedTile ? `${selectedTile.col},${selectedTile.row}` : "None" }}
              </h2>
            </div>
          </div>

          <div v-if="selectedTile" class="mt-4 space-y-4 text-sm text-muted-foreground">
            <p>
              Trees:
              <span class="font-semibold text-white">{{ selectedTile.trees }}</span>
              · Hill:
              <span class="font-semibold text-white">
                {{ selectedTile.hillResource ? selectedTile.hillResource : "None" }}
              </span>
            </p>

            <div v-if="selectedBuilding">
              <div class="rounded-2xl border border-border/30 bg-background/60 p-4 text-white">
                <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                  {{ selectedDefinition?.category }}
                </p>
                <h3 class="text-lg font-semibold">{{ selectedDefinition?.name }}</h3>
                <p class="text-sm text-muted-foreground">{{ selectedDefinition?.description }}</p>

                <div v-if="!selectedBuilding.construction.complete" class="mt-3 space-y-2">
                  <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">Foundation needs</p>
                  <ul class="space-y-1 text-sm">
                    <li
                      v-for="(amount, resourceKey) in selectedRemainingCost"
                      :key="resourceKey"
                      class="flex items-center justify-between"
                    >
                      <span>{{ RESOURCE_LIBRARY[resourceKey as ResourceType].label }}</span>
                      <span>{{ amount }}</span>
                    </li>
                  </ul>
                </div>

                <div v-else>
                  <div class="mt-3">
                    <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">Flag inventory</p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <span
                        v-for="[resourceKey, amount] in Object.entries(selectedBuilding.flagInventory)"
                        :key="resourceKey"
                        class="rounded-full border border-border/40 px-3 py-1 text-xs"
                      >
                        {{ RESOURCE_LIBRARY[resourceKey as ResourceType].label }}: {{ amount }}
                      </span>
                      <span v-if="Object.keys(selectedBuilding.flagInventory).length === 0" class="text-xs text-muted-foreground">
                        Empty flag
                      </span>
                    </div>
                  </div>

                  <div class="mt-3">
                    <p class="text-xs uppercase tracking-[0.3em] text-muted-foreground">Processing</p>
                    <div v-if="selectedBuilding.processing" class="mt-2">
                      <div class="flex items-center gap-2 text-xs">
                        <Loader2 class="h-4 w-4 animate-spin text-primary" />
                        {{ selectedBuilding.processing.label }}
                      </div>
                      <div class="mt-2 h-2 rounded-full bg-border/40">
                        <div
                          class="h-full rounded-full bg-primary"
                          :style="{ width: `${Math.round(processingPercent(selectedBuilding) * 100)}%` }"
                        />
                      </div>
                    </div>
                    <p v-else class="text-xs text-muted-foreground">Idle until inputs arrive.</p>
                  </div>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-full border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-primary hover:text-primary"
                  @click="markRoadAnchor"
                >
                  {{ roadAnchor?.id === selectedBuilding.id ? "Anchored" : "Set road start" }}
                </button>
                <button
                  v-if="roadAnchor && roadAnchor.id !== selectedBuilding.id"
                  type="button"
                  class="rounded-full border border-primary/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary transition hover:bg-primary/10"
                  @click="connectRoad"
                >
                  Connect to {{ BUILDING_LIBRARY[roadAnchor.type].name }}
                </button>
                <button
                  v-if="roadAnchor"
                  type="button"
                  class="rounded-full border border-border/40 px-3 py-2 text-xs text-muted-foreground hover:text-white"
                  @click="clearAnchor"
                >
                  Clear anchor
                </button>
              </div>

              <div class="mt-3 text-xs text-muted-foreground">
                Active roads: {{ selectedRoads.length }}
              </div>
            </div>

            <div v-else>
              <p class="text-xs uppercase tracking-[0.4em] text-muted-foreground">Plan a building</p>
              <div class="mt-3 space-y-3">
                <div v-for="group in buildableGroups" :key="group.category" class="rounded-2xl border border-border/40 p-3">
                  <p class="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{{ group.category }}</p>
                  <div class="mt-2 space-y-2">
                    <div
                      v-for="definition in group.definitions"
                      :key="definition.type"
                      class="rounded-xl border border-border/30 bg-background/70 p-3 text-white"
                    >
                      <div class="flex items-center justify-between text-sm font-semibold">
                        <span>{{ definition.name }}</span>
                        <button
                          type="button"
                          class="rounded-full border border-border/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] transition hover:border-primary hover:text-primary"
                          @click="planBuilding(definition.type as BuildableType)"
                        >
                          Place
                        </button>
                      </div>
                      <p class="text-xs text-muted-foreground">{{ definition.description }}</p>
                      <p class="text-[11px] text-muted-foreground">Cost: {{ formatCost(definition.cost) }}</p>
                      <p v-if="definition.requirement" class="text-[11px] text-amber-300">
                        Special: requires a matching tile (e.g., hill for mines).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-muted-foreground">Select a tile on the board to inspect or plan.</p>
        </div>

        <div class="rounded-3xl border border-border/40 bg-card/70 p-5 shadow-[var(--shadow-game)]">
          <div class="flex items-center gap-3">
            <Route class="h-5 w-5 text-primary" />
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Roads & couriers</p>
              <h2 class="text-xl font-semibold text-white">Flag connections</h2>
            </div>
          </div>

          <div class="mt-4 space-y-3">
            <p class="text-xs text-muted-foreground">
              Every road hosts one worker who hauls goods between both flags. Without roads, construction sites starve.
            </p>

            <div v-if="roads.length === 0" class="rounded-2xl border border-dashed border-border/40 p-4 text-sm text-muted-foreground">
              No roads yet. Anchor a flag, select another, and connect them to assign a courier.
            </div>

            <div v-for="road in roads" :key="road.id" class="rounded-2xl border border-border/30 bg-background/60 p-4 text-sm">
              <div class="flex flex-wrap items-center justify-between gap-2 text-white">
                <span>
                  {{ getBuildingName(getBuildingById(road.fromBuildingId)) }}
                  →
                  {{ getBuildingName(getBuildingById(road.toBuildingId)) }}
                </span>
                <span class="text-xs text-muted-foreground">{{ road.distance }} hexes</span>
              </div>
              <p class="text-xs text-muted-foreground">
                Worker:
                <span v-if="road.worker.status === 'hauling'" class="text-white">
                  Carrying {{ road.worker.job ? RESOURCE_LIBRARY[road.worker.job.resource].label : "cargo" }}
                </span>
                <span v-else class="text-white">Idle</span>
              </p>
              <div class="mt-2 h-2 rounded-full bg-border/40">
                <div
                  class="h-full rounded-full bg-primary transition-all"
                  :style="{
                    width:
                      road.worker.status === 'hauling'
                        ? `${Math.min(100, Math.round((road.worker.progressMs / road.worker.durationMs) * 100))}%`
                        : '0%',
                  }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hex-map {
  position: relative;
  min-width: 640px;
  padding-bottom: 1rem;
}

.hex-button {
  position: absolute;
  width: 112px;
  height: 98px;
  clip-path: polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%);
  background: linear-gradient(180deg, rgba(51, 65, 85, 0.8), rgba(15, 23, 42, 0.9));
  border: 1px solid rgba(148, 163, 184, 0.3);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  transition: transform 0.2s ease, border 0.2s ease, box-shadow 0.2s ease;
}

.hex-button:hover {
  transform: translateY(-2px);
  border-color: rgba(248, 250, 252, 0.5);
}

.hex-selected {
  border-color: rgba(250, 204, 21, 0.9);
  box-shadow: 0 0 15px rgba(250, 204, 21, 0.4);
}

.hex-forest {
  background: linear-gradient(180deg, rgba(15, 118, 110, 0.7), rgba(6, 78, 59, 0.8));
}

.hex-grain {
  background: linear-gradient(180deg, rgba(234, 179, 8, 0.8), rgba(202, 138, 4, 0.9));
  border-color: rgba(251, 191, 36, 0.8);
  color: #1b1302;
}

.hex-forest-cutting {
  background: linear-gradient(180deg, rgba(4, 47, 46, 0.9), rgba(6, 95, 70, 0.85));
  border-color: rgba(16, 185, 129, 0.5);
}

.hex-forest-planting {
  background: linear-gradient(180deg, rgba(187, 247, 208, 0.9), rgba(34, 197, 94, 0.8));
  border-color: rgba(134, 239, 172, 0.9);
}

.hex-hill {
  border-color: rgba(244, 114, 182, 0.5);
}

.hex-capital {
  border-color: rgba(56, 189, 248, 0.9);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
}

.hex-has-building {
  border-width: 2px;
  border-color: rgba(248, 113, 113, 0.6);
  box-shadow: 0 0 18px rgba(248, 113, 113, 0.35);
}

.hex-flag-icon {
  margin: 0 auto;
  height: 20px;
  width: 20px;
  color: #f87171;
  filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.6));
}
</style>

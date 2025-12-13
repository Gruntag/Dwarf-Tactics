<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Castle, Coins, Hammer, Shield, Trophy } from "lucide-vue-next";
import { toast } from "@/composables/useToast";

type PhaseState = "prep" | "running" | "defeat";
type CellTerrain = "road" | "buildable" | "start" | "end";
type EnemyKey = "normal" | "fast" | "tough" | "swarm" | "boss";
type TowerKey = "ballista" | "bomb" | "sniper" | "wizard" | "auto";
type TowerUpgradeKey = "range" | "speed" | "damage";
type TowerBehavior = "single" | "aoe" | "chain";
type EnemyShape = "circle" | "triangle" | "square" | "pentagon" | "hexagon";

interface BoardCell {
  id: string;
  row: number;
  col: number;
  terrain: CellTerrain;
  tower: TowerInstance | null;
}

interface TowerBlueprint {
  key: TowerKey;
  name: string;
  short: string;
  description: string;
  cost: number;
  baseDamage: number;
  fireDelay: number;
  baseRange: number;
  behavior: TowerBehavior;
  aoeRadius?: number;
  chainTargets?: number;
  tags: string[];
  baseUpgradeCosts: Record<TowerUpgradeKey, number>;
}

interface TowerInstance {
  id: string;
  key: TowerKey;
  row: number;
  col: number;
  cooldownMs: number;
  upgrades: Record<TowerUpgradeKey, number>;
}

interface ResolvedTowerStats {
  damage: number;
  range: number;
  fireDelay: number;
  fireDelayMs: number;
  blueprint: TowerBlueprint;
}

interface EnemyDefinition {
  key: EnemyKey;
  name: string;
  description: string;
  color: string;
  shape: EnemyShape;
  baseHealth: number;
  speed: number;
  damage: number;
  bounty: number;
  count: number;
  spawnGap: number;
}

interface EnemyInstance {
  id: string;
  key: EnemyKey;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  bounty: number;
  progress: number;
}

type ShotTraceType = "ballista" | "bomb" | "sniper" | "wizard" | "auto";

interface ShotTrace {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: ShotTraceType;
}

interface ExplosionMarker {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(16).slice(2)}`;

const MAP_BLUEPRINT = [
  "S.########",
  "#...#...##",
  "###.#.#.##",
  "#...#.#.##",
  "#.###.#.##",
  "#.....#.##",
  "#######.##",
  "#.......##",
  "#.########",
  "#........E",
] as const;

const BOARD_ROWS = MAP_BLUEPRINT.length;
const BOARD_COLS = MAP_BLUEPRINT[0].length;
const WALKABLE_TILES = new Set([".", "S", "E"]);
const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const STARTING_KEEP_HP = 200;
const STARTING_GOLD = 260;
const WAVES_PER_PHASE = 5;
const BASE_TICK_MS = 800;
const LOOP_INTERVAL_MS = 120;
const LOOP_DELTA = LOOP_INTERVAL_MS / BASE_TICK_MS;

const WAVE_ORDER: EnemyKey[] = ["normal", "fast", "tough", "swarm", "boss"];

const ENEMIES: Record<EnemyKey, EnemyDefinition> = {
  normal: {
    key: "normal",
    name: "Grottling Pack",
    description: "Balanced raiders pressing the outer hall.",
    color: "#22c55e",
    shape: "circle",
    baseHealth: 60,
    speed: 0.18,
    damage: 8,
    bounty: 4,
    count: 12,
    spawnGap: 2,
  },
  fast: {
    key: "fast",
    name: "Blitz Stalkers",
    description: "Sprint twice as fast but remain fragile.",
    color: "#facc15",
    shape: "triangle",
    baseHealth: 60,
    speed: 0.36,
    damage: 6,
    bounty: 5,
    count: 12,
    spawnGap: 2,
  },
  tough: {
    key: "tough",
    name: "Azure Bulwarks",
    description: "Twice the health of a raider with heavy shields.",
    color: "#38bdf8",
    shape: "square",
    baseHealth: 120,
    speed: 0.14,
    damage: 12,
    bounty: 8,
    count: 8,
    spawnGap: 3,
  },
  swarm: {
    key: "swarm",
    name: "Deepwater Swarm",
    description: "Tenfold numbers, only a fifth the health.",
    color: "#1d4ed8",
    shape: "pentagon",
    baseHealth: 12,
    speed: 0.22,
    damage: 2,
    bounty: 1,
    count: 120,
    spawnGap: 0.2,
  },
  boss: {
    key: "boss",
    name: "Amethyst Warlord",
    description: "Siege master with ten times a Bulwark's vitality.",
    color: "#a855f7",
    shape: "hexagon",
    baseHealth: 1200,
    speed: 0.1,
    damage: 40,
    bounty: 120,
    count: 1,
    spawnGap: 1,
  },
};

const TOWER_LIBRARY: Record<TowerKey, TowerBlueprint> = {
  ballista: {
    key: "ballista",
    name: "Ballista Tower",
    short: "Bal",
    description: "Single-target bolts with reliable tempo.",
    cost: 110,
    baseDamage: 34,
    fireDelay: 3,
    baseRange: 3.2,
    behavior: "single",
    tags: ["single target", "medium speed", "medium range"],
    baseUpgradeCosts: { range: 70, speed: 80, damage: 90 },
  },
  bomb: {
    key: "bomb",
    name: "Bomb Tower",
    short: "Bomb",
    description: "Arc barrels that explode in a small radius.",
    cost: 140,
    baseDamage: 42,
    fireDelay: 4,
    baseRange: 2.4,
    behavior: "aoe",
    aoeRadius: 1.3,
    tags: ["area damage", "slow rate", "medium range"],
    baseUpgradeCosts: { range: 65, speed: 90, damage: 95 },
  },
  sniper: {
    key: "sniper",
    name: "Sniper Tower",
    short: "Snp",
    description: "Extreme range shots that delete priority targets.",
    cost: 155,
    baseDamage: 110,
    fireDelay: 6,
    baseRange: 4.8,
    behavior: "single",
    tags: ["very long range", "very high damage", "slow rate"],
    baseUpgradeCosts: { range: 90, speed: 110, damage: 120 },
  },
  wizard: {
    key: "wizard",
    name: "Wizard Tower",
    short: "Wiz",
    description: "Chain lightning that hits multiple raiders.",
    cost: 150,
    baseDamage: 58,
    fireDelay: 3,
    baseRange: 3.4,
    behavior: "chain",
    chainTargets: 3,
    tags: ["multi target", "high damage", "medium range"],
    baseUpgradeCosts: { range: 80, speed: 85, damage: 105 },
  },
  auto: {
    key: "auto",
    name: "Auto Tower",
    short: "Auto",
    description: "Rapid-fire cogs with modest damage.",
    cost: 95,
    baseDamage: 18,
    fireDelay: 0.5,
    baseRange: 1.5,
    behavior: "single",
    tags: ["single target", "fast speed", "mid-high range"],
    baseUpgradeCosts: { range: 60, speed: 70, damage: 75 },
  },
};

const towerBlueprints = [
  TOWER_LIBRARY.ballista,
  TOWER_LIBRARY.bomb,
  TOWER_LIBRARY.sniper,
  TOWER_LIBRARY.wizard,
  TOWER_LIBRARY.auto,
];

const TILE_DIVISIONS = 100;
const HALF_TILE = TILE_DIVISIONS / 2;
const BOARD_FINE_ROWS = BOARD_ROWS * TILE_DIVISIONS;
const BOARD_FINE_COLS = BOARD_COLS * TILE_DIVISIONS;
const AUTO_WAVE_DELAY_MS = 1800;
const TOWER_TRACE_TYPES: Record<TowerKey, ShotTraceType> = {
  ballista: "ballista",
  bomb: "bomb",
  sniper: "sniper",
  wizard: "wizard",
  auto: "auto",
};

const router = useRouter();
const board = ref<BoardCell[][]>([]);
const selectedBlueprint = ref<TowerBlueprint>(towerBlueprints[0]);
const phase = ref<PhaseState>("prep");
const phaseNumber = ref(1);
const waveIndex = ref(0);
const keepHp = ref(STARTING_KEEP_HP);
const maxHp = ref(STARTING_KEEP_HP);
const gold = ref(STARTING_GOLD);
const stats = reactive({
  towersPlaced: 0,
  enemiesSlain: 0,
  leaks: 0,
  goldEarned: 0,
  phasesCleared: 0,
});
const activeEnemies = ref<EnemyInstance[]>([]);
const enemiesSpawned = ref(0);
const spawnTimerMs = ref(BASE_TICK_MS);
const loopHandle = ref<number | null>(null);
const defenseActive = ref(false);
const autoWaveTimer = ref<number | null>(null);
const selectedTower = ref<TowerInstance | null>(null);
const shotTraces = ref<ShotTrace[]>([]);
const traceTimers = new Map<string, number>();
const explosionMarkers = ref<ExplosionMarker[]>([]);
const explosionTimers = new Map<string, number>();

const keepHealthPercent = computed(() => Math.max(0, Math.round((keepHp.value / maxHp.value) * 100)));
const enemyHealthMultiplier = computed(() => phaseNumber.value);
const enemyHealthPercent = computed(() => enemyHealthMultiplier.value * 100);
const currentWaveKey = computed(() => WAVE_ORDER[waveIndex.value] ?? null);
const currentWave = computed(() => (currentWaveKey.value ? ENEMIES[currentWaveKey.value] : null));
const waveLabel = computed(() =>
  currentWave.value ? `Wave ${Math.min(waveIndex.value + 1, WAVES_PER_PHASE)} / ${WAVES_PER_PHASE}` : "All Waves Cleared",
);
const upcomingEnemies = computed(() => {
  if (!currentWave.value) return 0;
  return Math.max(0, currentWave.value.count - enemiesSpawned.value);
});
const canSendWave = computed(() => phase.value === "prep" && !!currentWave.value && keepHp.value > 0);
const boardStyle = computed(() => ({ gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))` }));
const enemyMarkers = computed(() =>
  activeEnemies.value.map((enemy) => {
    const point = getEnemyPoint(enemy);
    return {
      id: enemy.id,
      top: (point.row / BOARD_FINE_ROWS) * 100,
      left: (point.col / BOARD_FINE_COLS) * 100,
      color: ENEMIES[enemy.key].color,
      hpPercent: Math.max(0, enemy.hp) / (enemy.maxHp || 1),
    };
  }),
);

const overlayVisible = computed(() => phase.value === "defeat");

const cellKey = (row: number, col: number) => `${row},${col}`;

const findSymbol = (symbol: string) => {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (MAP_BLUEPRINT[row][col] === symbol) {
        return { row, col };
      }
    }
  }
  return null;
};

const startTile = findSymbol("S");
const endTile = findSymbol("E");

if (!startTile || !endTile) {
  throw new Error("Map definition missing start or end tile.");
}

const buildPath = () => {
  const queue: Array<{ row: number; col: number }> = [startTile];
  const cameFrom = new Map<string, string | null>();
  cameFrom.set(cellKey(startTile.row, startTile.col), null);

  while (queue.length) {
    const current = queue.shift()!;
    if (current.row === endTile.row && current.col === endTile.col) break;

    for (const [dr, dc] of DIRECTIONS) {
      const row = current.row + dr;
      const col = current.col + dc;
      if (row < 0 || col < 0 || row >= BOARD_ROWS || col >= BOARD_COLS) continue;
      if (!WALKABLE_TILES.has(MAP_BLUEPRINT[row][col])) continue;
      const key = cellKey(row, col);
      if (cameFrom.has(key)) continue;
      cameFrom.set(key, cellKey(current.row, current.col));
      queue.push({ row, col });
    }
  }

  const path: Array<{ row: number; col: number }> = [];
  let cursor: string | null = cellKey(endTile.row, endTile.col);
  if (!cameFrom.has(cursor)) {
    throw new Error("Could not connect start and end on the map.");
  }
  while (cursor) {
    const [row, col] = cursor.split(",").map(Number);
    path.push({ row, col });
    cursor = cameFrom.get(cursor) ?? null;
  }
  return path.reverse();
};

const PATH = buildPath();
const PATH_LAST_INDEX = PATH.length - 1;

const buildBoard = (): BoardCell[][] =>
  MAP_BLUEPRINT.map((rowString, row) =>
    rowString.split("").map((symbol, col) => {
      let terrain: CellTerrain = "road";
      if (symbol === "#") terrain = "buildable";
      if (symbol === "S") terrain = "start";
      if (symbol === "E") terrain = "end";
      return {
        id: cellKey(row, col),
        row,
        col,
        terrain,
        tower: null,
      };
    }),
  );

const resetBoard = () => {
  board.value = buildBoard();
};

const clearAutoWaveTimer = () => {
  if (autoWaveTimer.value !== null) {
    window.clearTimeout(autoWaveTimer.value);
    autoWaveTimer.value = null;
  }
};

const scheduleNextWave = (delay = AUTO_WAVE_DELAY_MS) => {
  if (!defenseActive.value || phase.value !== "prep" || !currentWave.value) return;
  clearAutoWaveTimer();
  autoWaveTimer.value = window.setTimeout(() => {
    autoWaveTimer.value = null;
    sendNextWave();
  }, Math.max(0, delay));
};

const beginDefense = () => {
  if (defenseActive.value || phase.value !== "prep") return;
  defenseActive.value = true;
  scheduleNextWave(900);
};

const getCellCenterFine = (row: number, col: number) => ({
  row: row * TILE_DIVISIONS + HALF_TILE,
  col: col * TILE_DIVISIONS + HALF_TILE,
});

const toSvgPoint = (point: { row: number; col: number }) => ({
  x: (point.col / BOARD_FINE_COLS) * 1000,
  y: (point.row / BOARD_FINE_ROWS) * 1000,
});

const resolveTowerStats = (tower: TowerInstance): ResolvedTowerStats => {
  const blueprint = TOWER_LIBRARY[tower.key];
  const damage = blueprint.baseDamage * (1 + tower.upgrades.damage * 0.1);
  const range = blueprint.baseRange * (1 + tower.upgrades.range * 0.1);
  const fireDelayTicks = blueprint.fireDelay / (1 + tower.upgrades.speed * 0.1);
  const fireDelayMs = Math.max(LOOP_INTERVAL_MS, fireDelayTicks * BASE_TICK_MS);
  return { damage, range, fireDelay: Number(fireDelayTicks.toFixed(2)), fireDelayMs, blueprint };
};

const towerUpgradeCost = (tower: TowerInstance, stat: TowerUpgradeKey) => {
  const blueprint = TOWER_LIBRARY[tower.key];
  return Math.round(blueprint.baseUpgradeCosts[stat] * Math.pow(1.5, tower.upgrades[stat]));
};

const addShotTrace = (from: { row: number; col: number }, to: { row: number; col: number }, type: ShotTraceType) => {
  if (typeof window === "undefined") return;
  const start = toSvgPoint(from);
  const end = toSvgPoint(to);
  const trace: ShotTrace = {
    id: randomId(),
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    type,
  };
  shotTraces.value = [...shotTraces.value, trace];
  const duration = type === "sniper" ? 1000 : 750;
  const timer = window.setTimeout(() => {
    traceTimers.delete(trace.id);
    shotTraces.value = shotTraces.value.filter((entry) => entry.id !== trace.id);
  }, duration);
  traceTimers.set(trace.id, timer);
};

const clearShotTraces = () => {
  if (typeof window !== "undefined") {
    traceTimers.forEach((handle) => window.clearTimeout(handle));
  }
  traceTimers.clear();
  shotTraces.value = [];
};

const addExplosionMarker = (center: { row: number; col: number }, radiusTiles: number) => {
  if (typeof window === "undefined") return;
  const marker: ExplosionMarker = {
    id: randomId(),
    top: (center.row / BOARD_FINE_ROWS) * 100,
    left: (center.col / BOARD_FINE_COLS) * 100,
    height: ((radiusTiles * TILE_DIVISIONS * 2) / BOARD_FINE_ROWS) * 100,
    width: ((radiusTiles * TILE_DIVISIONS * 2) / BOARD_FINE_COLS) * 100,
  };
  explosionMarkers.value = [...explosionMarkers.value, marker];
  const timer = window.setTimeout(() => {
    explosionTimers.delete(marker.id);
    explosionMarkers.value = explosionMarkers.value.filter((entry) => entry.id !== marker.id);
  }, 600);
  explosionTimers.set(marker.id, timer);
};

const clearExplosionMarkers = () => {
  if (typeof window !== "undefined") {
    explosionTimers.forEach((handle) => window.clearTimeout(handle));
  }
  explosionTimers.clear();
  explosionMarkers.value = [];
};

const getEnemyPoint = (enemy: EnemyInstance) => {
  const currentIndex = Math.min(PATH_LAST_INDEX, Math.floor(enemy.progress));
  const nextIndex = Math.min(PATH_LAST_INDEX, currentIndex + 1);
  const current = PATH[currentIndex];
  const next = PATH[nextIndex];
  const fraction = Math.max(0, enemy.progress - currentIndex);
  const currentCenter = getCellCenterFine(current.row, current.col);
  const nextCenter = getCellCenterFine(next.row, next.col);
  return {
    row: currentCenter.row + (nextCenter.row - currentCenter.row) * fraction,
    col: currentCenter.col + (nextCenter.col - currentCenter.col) * fraction,
  };
};

const rewardKill = (enemy: EnemyInstance) => {
  gold.value += enemy.bounty;
  stats.enemiesSlain += 1;
  stats.goldEarned += enemy.bounty;
};

const handleLeak = (enemy: EnemyInstance) => {
  keepHp.value = Math.max(0, keepHp.value - enemy.damage);
  stats.leaks += 1;
  if (keepHp.value <= 0) {
    triggerDefeat();
  }
};

const moveEnemies = () => {
  const survivors: EnemyInstance[] = [];
  for (const enemy of activeEnemies.value) {
    enemy.progress += enemy.speed * LOOP_DELTA;
    if (enemy.progress >= PATH_LAST_INDEX) {
      handleLeak(enemy);
      continue;
    }
    survivors.push(enemy);
  }
  activeEnemies.value = survivors;
};

const selectTargets = (tower: TowerInstance, range: number) => {
  const point = getCellCenterFine(tower.row, tower.col);
  return activeEnemies.value
    .map((enemy) => ({ enemy, target: getEnemyPoint(enemy) }))
    .filter(
      ({ target }) =>
        Math.hypot(point.row - target.row, point.col - target.col) / TILE_DIVISIONS <= range + 0.01,
    )
    .sort((a, b) => b.enemy.progress - a.enemy.progress)
    .map(({ enemy }) => enemy);
};

const fireTower = (tower: TowerInstance) => {
  const statsSummary = resolveTowerStats(tower);
  const towerPoint = getCellCenterFine(tower.row, tower.col);
  const traceType = TOWER_TRACE_TYPES[tower.key];
  if (tower.cooldownMs > 0) {
    tower.cooldownMs = Math.max(0, tower.cooldownMs - LOOP_INTERVAL_MS);
    return;
  }
  const targets = selectTargets(tower, statsSummary.range);
  if (!targets.length) return;
  const primary = targets[0];
  tower.cooldownMs = statsSummary.fireDelayMs;

  if (statsSummary.blueprint.behavior === "single") {
    const targetPoint = getEnemyPoint(primary);
    primary.hp -= statsSummary.damage;
    if (traceType) {
      addShotTrace(towerPoint, targetPoint, traceType);
    }
    if (primary.hp <= 0) rewardKill(primary);
  } else if (statsSummary.blueprint.behavior === "aoe") {
    const point = getEnemyPoint(primary);
    if (traceType) {
      addShotTrace(towerPoint, point, traceType);
    }
    const impacted = activeEnemies.value.filter((enemy) => {
      const targetPoint = getEnemyPoint(enemy);
      const distanceTiles = Math.hypot(point.row - targetPoint.row, point.col - targetPoint.col) / TILE_DIVISIONS;
      return distanceTiles <= (statsSummary.blueprint.aoeRadius ?? 1);
    });
    impacted.forEach((enemy) => {
      enemy.hp -= statsSummary.damage;
      if (enemy.hp <= 0) rewardKill(enemy);
    });
    addExplosionMarker(point, statsSummary.blueprint.aoeRadius ?? 1);
  } else {
    const chains = targets.slice(0, statsSummary.blueprint.chainTargets ?? 1);
    chains.forEach((enemy, index) => {
      const targetPoint = getEnemyPoint(enemy);
      const scaledDamage = statsSummary.damage * (1 - index * 0.2);
      enemy.hp -= scaledDamage;
      if (traceType) {
        addShotTrace(towerPoint, targetPoint, traceType);
      }
      if (enemy.hp <= 0) rewardKill(enemy);
    });
  }

  activeEnemies.value = activeEnemies.value.filter((enemy) => enemy.hp > 0);
};

const towersFire = () => {
  board.value.forEach((row) => {
    row.forEach((cell) => {
      if (!cell.tower) return;
      fireTower(cell.tower);
    });
  });
};

const spawnEnemy = () => {
  if (!currentWave.value) return;
  const definition = currentWave.value;
  const hp = definition.baseHealth * enemyHealthMultiplier.value;
  const enemy: EnemyInstance = {
    id: randomId(),
    key: definition.key,
    hp,
    maxHp: hp,
    speed: definition.speed,
    damage: definition.damage,
    bounty: definition.bounty,
    progress: 0,
  };
  activeEnemies.value = [...activeEnemies.value, enemy];
};

const advanceWaveIfReady = () => {
  if (!currentWave.value) return;
  const finished = enemiesSpawned.value >= currentWave.value.count && activeEnemies.value.length === 0;
  if (!finished) return;
  stopLoop();
  phase.value = "prep";
  enemiesSpawned.value = 0;
  spawnTimerMs.value = BASE_TICK_MS;
  if (waveIndex.value >= WAVES_PER_PHASE - 1) {
    stats.phasesCleared = phaseNumber.value;
    phaseNumber.value += 1;
    waveIndex.value = 0;
  } else {
    waveIndex.value += 1;
  }
  if (keepHp.value > 0 && defenseActive.value) {
    scheduleNextWave();
  }
};

const runTick = () => {
  if (phase.value !== "running") return;
  if (currentWave.value && enemiesSpawned.value < currentWave.value.count) {
    const gapMs = Math.max(LOOP_INTERVAL_MS, currentWave.value.spawnGap * BASE_TICK_MS);
    if (spawnTimerMs.value > 0) {
      spawnTimerMs.value = Math.max(0, spawnTimerMs.value - LOOP_INTERVAL_MS);
    } else {
      spawnEnemy();
      enemiesSpawned.value += 1;
      spawnTimerMs.value = gapMs;
    }
  }
  moveEnemies();
  towersFire();
  advanceWaveIfReady();
};

const startLoop = () => {
  stopLoop();
  loopHandle.value = window.setInterval(runTick, LOOP_INTERVAL_MS);
};

const stopLoop = () => {
  if (loopHandle.value !== null) {
    window.clearInterval(loopHandle.value);
    loopHandle.value = null;
  }
};

const triggerDefeat = () => {
  if (phase.value === "defeat") return;
  phase.value = "defeat";
  stopLoop();
  clearAutoWaveTimer();
  defenseActive.value = false;
  clearShotTraces();
  clearExplosionMarkers();
};

const resetDefense = () => {
  stopLoop();
  clearAutoWaveTimer();
  resetBoard();
  selectedBlueprint.value = towerBlueprints[0];
  phase.value = "prep";
  phaseNumber.value = 1;
  waveIndex.value = 0;
  keepHp.value = STARTING_KEEP_HP;
  maxHp.value = STARTING_KEEP_HP;
  gold.value = STARTING_GOLD;
  stats.towersPlaced = 0;
  stats.enemiesSlain = 0;
  stats.leaks = 0;
  stats.goldEarned = 0;
  stats.phasesCleared = 0;
  activeEnemies.value = [];
  enemiesSpawned.value = 0;
  spawnTimerMs.value = BASE_TICK_MS;
  defenseActive.value = false;
  selectedTower.value = null;
  clearShotTraces();
  clearExplosionMarkers();
};

const sendNextWave = () => {
  if (!canSendWave.value) return;
  clearAutoWaveTimer();
  phase.value = "running";
  enemiesSpawned.value = 0;
  spawnTimerMs.value = BASE_TICK_MS;
  startLoop();
};

const buildTower = (cell: BoardCell) => {
  if (cell.terrain !== "buildable") {
    toast({ title: "Invalid tile", description: "Only rune-marked pads (#) can host towers.", variant: "destructive" });
    return;
  }
  if (cell.tower) {
    toast({ title: "Occupied", description: "Remove or upgrade the tower already here.", variant: "destructive" });
    return;
  }
  if (gold.value < selectedBlueprint.value.cost) {
    toast({ title: "Not enough gold", description: "Claim more bounty before building that.", variant: "destructive" });
    return;
  }
  gold.value -= selectedBlueprint.value.cost;
  stats.towersPlaced += 1;
  cell.tower = {
    id: randomId(),
    key: selectedBlueprint.value.key,
    row: cell.row,
    col: cell.col,
    cooldownMs: 0,
    upgrades: { range: 0, speed: 0, damage: 0 },
  };
  selectedTower.value = cell.tower;
};

const chooseBlueprint = (blueprint: TowerBlueprint) => {
  selectedBlueprint.value = blueprint;
};

const handleCellInteraction = (cell: BoardCell) => {
  if (cell.tower) {
    selectedTower.value = cell.tower;
    return;
  }
  buildTower(cell);
};

const clearSelectedTower = () => {
  selectedTower.value = null;
};

const upgradeTower = (tower: TowerInstance, stat: TowerUpgradeKey) => {
  const cost = towerUpgradeCost(tower, stat);
  if (gold.value < cost) {
    toast({ title: "Need more gold", description: `Upgrade costs ${cost} gold.`, variant: "destructive" });
    return;
  }
  gold.value -= cost;
  tower.upgrades[stat] += 1;
};

const describeTower = (tower: TowerInstance) => {
  const statsSummary = resolveTowerStats(tower);
  return `DMG ${statsSummary.damage.toFixed(0)} | Range ${statsSummary.range.toFixed(1)} | Delay ${statsSummary.fireDelay}`;
};

onMounted(() => {
  resetDefense();
});

onBeforeUnmount(() => {
  stopLoop();
  clearAutoWaveTimer();
  clearShotTraces();
  clearExplosionMarkers();
});
</script>

<template>
  <div class="defense-page">
    <header class="top-bar">
      <button type="button" class="back-button" @click="router.push('/')">
        <ArrowLeft class="icon" />
        Back
      </button>
      <div class="phase-pill">
        <Castle class="icon" />
        <div>
          <p class="label">Phase</p>
          <p class="phase-value">{{ phaseNumber }}</p>
        </div>
        <div>
          <p class="label">Enemy Health</p>
          <p class="phase-value">{{ enemyHealthPercent }}%</p>
        </div>
      </div>
    </header>

    <section class="hero">
      <div>
        <p class="hero-pill">Dwarven Defense</p>
        <h1>Hold the stoneway</h1>
        <p>
          Place towers on rune-marked pads, then unleash each wave. Every phase holds the same five waves: normal, fast, tough,
          swarm, boss, and once a phase falls the enemy doubles their health again with no upper limit.
        </p>
      </div>
      <div class="hero-actions">
        <button v-if="phase === 'prep' && !defenseActive" type="button" class="cta-button" @click="beginDefense">
          Begin Defense
        </button>
        <p v-else-if="phase === 'prep'" class="status-pill">Next wave arming</p>
        <p v-else-if="phase === 'running'" class="status-pill">Wave in progress</p>
        <button v-else type="button" class="cta-button" @click="resetDefense">
          Rebuild the Gate
        </button>
      </div>
    </section>

    <section class="stats-panel">
      <div class="stat-card">
        <div class="stat-label">
          <Shield class="icon" />
          Keep Integrity
        </div>
        <p class="stat-value">{{ keepHp }} / {{ maxHp }}</p>
        <div class="progress-bar">
          <span class="progress-fill" :style="{ width: `${keepHealthPercent}%` }" />
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          <Coins class="icon" />
          Treasury
        </div>
        <p class="stat-value">{{ gold }} gold</p>
        <p class="stat-sub">Gold earned: {{ stats.goldEarned }}</p>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          <Castle class="icon" />
          {{ waveLabel }}
        </div>
        <p class="stat-value">{{ currentWave?.name ?? 'All Clear' }}</p>
        <p class="stat-sub">Raiders remaining: {{ upcomingEnemies + activeEnemies.length }}</p>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          <Trophy class="icon" />
          Campaign Stats
        </div>
        <p class="stat-value">{{ stats.towersPlaced }} towers</p>
        <p class="stat-sub">Kills {{ stats.enemiesSlain }} / Leaks {{ stats.leaks }}</p>
      </div>
    </section>

    <div class="playfield">
      <section class="board-panel">
        <header class="panel-header">
          <div>
            <p class="label">Battle Map</p>
            <h2>Stoneway Blueprint</h2>
            <p class="panel-subtext">Tap # pads to build. Roads (.) carry enemies from S to E.</p>
          </div>
          <div class="panel-subtext">Path tiles: {{ PATH.length }}</div>
        </header>
        <div class="board-grid-wrapper">
          <div class="board-grid" :style="boardStyle">
            <template v-for="row in board" :key="row[0].id">
              <button
                v-for="cell in row"
                :key="cell.id"
                type="button"
                class="board-cell"
                :class="[
                  `terrain-${cell.terrain}`,
                  { buildable: cell.terrain === 'buildable', occupied: !!cell.tower },
                ]"
                @click="handleCellInteraction(cell)"
              >
                <span v-if="cell.terrain === 'start'" class="cell-label">S</span>
                <span v-else-if="cell.terrain === 'end'" class="cell-label">E</span>
                <div v-if="cell.tower" class="tower-chip">
                  <Hammer class="chip-icon" />
                  <span>{{ TOWER_LIBRARY[cell.tower.key].short }}</span>
                </div>
              </button>
            </template>
          </div>
          <div class="enemy-field">
            <div
              v-for="marker in enemyMarkers"
              :key="marker.id"
              class="enemy-marker"
              :style="{ top: `${marker.top}%`, left: `${marker.left}%` }"
            >
              <div class="enemy-health-bar">
                <span class="enemy-health-fill" :style="{ width: `${marker.hpPercent * 100}%` }" />
              </div>
              <span class="enemy-dot" :style="{ backgroundColor: marker.color }" />
            </div>
          </div>
          <div class="explosion-field">
            <span
              v-for="ring in explosionMarkers"
              :key="ring.id"
              class="explosion-ring"
              :style="{
                top: `${ring.top}%`,
                left: `${ring.left}%`,
                width: `${ring.width}%`,
                height: `${ring.height}%`,
              }"
            />
          </div>
          <svg class="trace-field" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            <line
              v-for="trace in shotTraces"
              :key="trace.id"
              class="trace-line"
              :class="`trace-${trace.type}`"
              :x1="trace.x1"
              :y1="trace.y1"
              :x2="trace.x2"
              :y2="trace.y2"
            />
          </svg>
        </div>
      </section>

      <aside class="command-panel">
        <section class="panel">
          <div class="panel-header">
            <h3>Blueprints</h3>
            <p>Select a design, then click a pad.</p>
          </div>
          <div class="blueprint-grid">
            <button
              v-for="blueprint in towerBlueprints"
              :key="blueprint.key"
              type="button"
              class="blueprint-card"
              :class="{
                active: selectedBlueprint.key === blueprint.key,
                unaffordable: blueprint.cost > gold,
              }"
              @click="chooseBlueprint(blueprint)"
            >
              <div class="blueprint-header">
                <h4>{{ blueprint.name }}</h4>
                <span class="cost">{{ blueprint.cost }}g</span>
              </div>
              <p>{{ blueprint.description }}</p>
              <ul>
                <li v-for="tag in blueprint.tags" :key="tag">{{ tag }}</li>
              </ul>
            </button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h3>Wave Intel</h3>
            <p>{{ currentWave?.description ?? 'Every foe defeated. Prepare for the next phase.' }}</p>
          </div>
          <div class="wave-info" v-if="currentWave">
            <div>
              <p class="wave-label">Enemy Type</p>
              <p class="wave-value">{{ currentWave.name }}</p>
              <p class="wave-label">{{ currentWave.count }} units / {{ currentWave.spawnGap }} tick gap</p>
            </div>
            <div>
              <p class="wave-label">HP Scaling</p>
              <p class="wave-value">{{ currentWave.baseHealth }} x {{ phaseNumber }} = {{ currentWave.baseHealth * phaseNumber }}</p>
              <p class="wave-label">Damage {{ currentWave.damage }} / Bounty {{ currentWave.bounty }}</p>
            </div>
          </div>
        </section>

        <section v-if="selectedTower" class="panel tower-menu">
          <div class="panel-header">
            <div>
              <h3>{{ TOWER_LIBRARY[selectedTower.key].name }}</h3>
              <p>{{ describeTower(selectedTower) }}</p>
            </div>
            <button type="button" class="secondary-button" @click="clearSelectedTower">Close</button>
          </div>
          <div class="tower-upgrades">
            <button
              v-for="stat in ['range', 'speed', 'damage']"
              :key="`menu-${selectedTower.id}-${stat}`"
              type="button"
              class="upgrade-button"
              @click="upgradeTower(selectedTower, stat as TowerUpgradeKey)"
            >
              +10% {{ stat }} (Lv {{ selectedTower.upgrades[stat as TowerUpgradeKey] }} ->
              {{ selectedTower.upgrades[stat as TowerUpgradeKey] + 1 }})
              <span class="cost">{{ towerUpgradeCost(selectedTower, stat as TowerUpgradeKey) }}g</span>
            </button>
          </div>
        </section>
        <section v-else class="panel hint-panel">
          <div class="panel-header">
            <h3>Tower Upgrades</h3>
          </div>
          <p>Click a tower on the map to manage its stats.</p>
        </section>
      </aside>
    </div>

    <div v-if="overlayVisible" class="overlay">
      <div class="overlay-card">
        <p class="overlay-title">Gates Fallen</p>
        <p class="overlay-message">
          Phase {{ phaseNumber }} collapsed after clearing {{ stats.phasesCleared }} full phase{{ stats.phasesCleared === 1 ? '' : 's' }}.
        </p>
        <button type="button" class="cta-button" @click="resetDefense">
          Try Again
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.defense-page {
  min-height: 100vh;
  background: radial-gradient(circle at top, rgba(30, 64, 175, 0.35), transparent 60%), #010409;
  color: #e2e8f0;
  padding: 2.5rem 1rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.icon {
  width: 1rem;
  height: 1rem;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.8);
  color: inherit;
  font-weight: 600;
}

.phase-pill {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  border: 1px solid rgba(147, 51, 234, 0.4);
  background: rgba(2, 6, 23, 0.95);
}

.phase-value {
  font-size: 1.25rem;
  font-weight: 700;
}

.label {
  font-size: 0.65rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.8);
}

.hero {
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 1.5rem;
  padding: 1.5rem;
  background: rgba(10, 15, 30, 0.85);
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.hero-pill {
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 0.65rem;
  color: rgba(147, 197, 253, 0.9);
}

.hero h1 {
  font-size: 2.4rem;
  font-weight: 700;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cta-button {
  padding: 0.7rem 1.6rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(90deg, #f97316, #facc15);
  color: #0f172a;
  font-weight: 700;
}

.secondary-button {
  padding: 0.35rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.4);
  color: #e2e8f0;
  font-weight: 600;
}

.status-pill {
  padding: 0.4rem 1.2rem;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.15);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.75rem;
}

.stats-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.stat-card {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 1.1rem;
  background: rgba(15, 23, 42, 0.75);
  padding: 1rem;
}

.stat-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(148, 163, 184, 0.85);
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  margin-top: 0.3rem;
}

.stat-sub {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.9);
}

.progress-bar {
  margin-top: 0.5rem;
  height: 0.4rem;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.7);
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #34d399, #a3e635);
}

.playfield {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1.1fr);
  gap: 1.2rem;
}

.board-panel,
.command-panel > .panel {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1.2rem;
  background: rgba(2, 6, 23, 0.8);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-header h2,
.panel-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.panel-subtext {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.9);
}

.board-grid-wrapper {
  position: relative;
}

.board-grid {
  display: grid;
  gap: 0;
}

.board-cell {
  aspect-ratio: 1 / 1;
  border-radius: 0.6rem;
  border: 1px solid rgba(15, 23, 42, 0.9);
  background: rgba(15, 23, 42, 0.6);
  position: relative;
}

.board-cell.buildable {
  cursor: pointer;
  border-color: rgba(94, 234, 212, 0.5);
}

.board-cell.occupied {
  border-color: rgba(251, 191, 36, 0.8);
}

.board-cell.terrain-road {
  background: rgba(15, 23, 42, 0.75);
}

.board-cell.terrain-start,
.board-cell.terrain-end {
  background: rgba(8, 47, 73, 0.8);
  border-color: rgba(129, 140, 248, 0.8);
}

.cell-label {
  font-size: 0.85rem;
  font-weight: 700;
}

.tower-chip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  font-size: 0.65rem;
  text-transform: uppercase;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.6);
}

.enemy-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.enemy-health-bar {
  width: 2.4rem;
  height: 0.3rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(15, 23, 42, 0.9);
  overflow: hidden;
}

.enemy-health-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #f87171, #fbbf24);
}

.enemy-dot {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  box-shadow: 0 0 6px rgba(147, 197, 253, 0.5);
}

.enemy-field,
.explosion-field,
.trace-field {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.enemy-field {
  width: 100%;
  height: 100%;
}

.explosion-field,
.trace-field {
  width: 100%;
  height: 100%;
}

.explosion-ring {
  position: absolute;
  border: 2px solid rgba(248, 250, 252, 0.6);
  border-radius: 999px;
  transform: translate(-50%, -50%);
  animation: explosionPulse 0.6s forwards;
}

.trace-line {
  stroke-linecap: round;
  stroke-width: 2;
}

.trace-ballista {
  stroke: rgba(251, 191, 36, 0.8);
  animation: sniperTrace 0.7s forwards;
}

.trace-bomb {
  stroke: rgba(248, 113, 113, 0.9);
  animation: sniperTrace 0.5s forwards;
}

.trace-auto {
  stroke: rgba(45, 212, 191, 0.8);
  animation: sniperTrace 0.4s forwards;
}

.trace-sniper {
  stroke: rgba(148, 163, 184, 0.85);
  animation: sniperTrace 1s forwards;
}

.trace-wizard {
  stroke: rgba(248, 250, 252, 0.95);
  animation: wizardTrace 0.75s forwards;
}

@keyframes sniperTrace {
  0% {
    opacity: 0.95;
  }
  100% {
    opacity: 0;
  }
}

@keyframes wizardTrace {
  0% {
    opacity: 1;
  }
  33% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@keyframes explosionPulse {
  0% {
    opacity: 0.85;
    transform: translate(-50%, -50%) scale(0.9);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.3);
  }
}

.chip-icon {
  width: 0.7rem;
  height: 0.7rem;
}

.command-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.blueprint-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.6rem;
}

.blueprint-card {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 1rem;
  padding: 0.65rem;
  text-align: left;
  background: rgba(15, 23, 42, 0.6);
}

.blueprint-card.active {
  border-color: rgba(251, 191, 36, 0.8);
}

.blueprint-card.unaffordable {
  opacity: 0.5;
}

.blueprint-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.blueprint-card ul {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.blueprint-card li {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
}

.wave-info {
  display: grid;
  gap: 0.5rem;
}

.wave-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(148, 163, 184, 0.8);
}

.wave-value {
  font-size: 1.1rem;
  font-weight: 600;
}

.tower-menu .panel-header {
  align-items: center;
  justify-content: space-between;
}

.tower-upgrades {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.upgrade-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 0.75rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.12);
  font-size: 0.8rem;
}

.hint-panel {
  align-items: flex-start;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.overlay-card {
  border: 1px solid rgba(248, 113, 113, 0.5);
  border-radius: 1.5rem;
  background: rgba(2, 6, 23, 0.95);
  padding: 2rem;
  max-width: 420px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.overlay-title {
  text-transform: uppercase;
  letter-spacing: 0.3em;
  color: rgba(248, 113, 113, 0.7);
}

.overlay-message {
  color: rgba(226, 232, 240, 0.85);
}

@media (max-width: 1024px) {
  .playfield {
    grid-template-columns: 1fr;
  }
}
</style>

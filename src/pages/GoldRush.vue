<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Coins, Flame, Shield, Trophy, Zap } from "lucide-vue-next";
import { toast } from "@/composables/useToast";
import { addVictoryPoint, getVictoryPoints } from "@/lib/victory-points";

type Direction = "up" | "down" | "left" | "right";
type Tile = "wall" | "gold" | "power" | "empty";
type Phase = "ready" | "running" | "life-lost" | "level-complete" | "game-over";

interface Enemy {
  id: string;
  label: string;
  row: number;
  col: number;
  direction: Direction;
  state: "hunt" | "frightened" | "respawning";
  tickDelay: number;
  baseDelay: number;
  colorClass: string;
  spawnRow: number;
  spawnCol: number;
  respawnCounter: number;
}

interface Position {
  row: number;
  col: number;
}

const router = useRouter();

const victoryPoints = ref(getVictoryPoints());
const level = ref(1);
const score = ref(0);
const lives = ref(3);
const pelletsRemaining = ref(0);
const levelPelletTotal = ref(0);
const statusMessage = ref("Scout the tunnels and prepare to gather gold.");
const phase = ref<Phase>("ready");
const isPowerMode = ref(false);
const powerModeRemaining = ref(0);

const tileMap = ref<Tile[][]>([]);
const player = reactive({
  row: 0,
  col: 0,
  direction: "left" as Direction,
  nextDirection: "left" as Direction,
});
const enemies = reactive<Enemy[]>([]);

const BOARD_ROWS = 19;
const BOARD_COLS = 19;
const CENTER_ROW = Math.floor(BOARD_ROWS / 2);
const CENTER_COL = Math.floor(BOARD_COLS / 2);

const PLAYER_START: Position = { row: BOARD_ROWS - 6, col: Math.floor(BOARD_COLS / 2) };
const ENEMY_STARTS: Array<{ row: number; col: number; colorClass: string; label: string }> = [
  { row: CENTER_ROW - 1, col: CENTER_COL, colorClass: "from-amber-500 via-orange-400 to-amber-600", label: "Foreman" },
  { row: CENTER_ROW, col: CENTER_COL - 1, colorClass: "from-emerald-500 via-lime-400 to-emerald-600", label: "Scout" },
  { row: CENTER_ROW, col: CENTER_COL + 1, colorClass: "from-fuchsia-500 via-purple-400 to-fuchsia-600", label: "Warden" },
];

const directionOffsets: Record<Direction, Position> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

const oppositeDirection: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const actionButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";

const shuffleInPlace = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
};

const createMazeGrid = () => {
  const grid = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => false));
  const stack: Position[] = [];
  const start = { row: 1, col: 1 };

  grid[start.row][start.col] = true;
  stack.push(start);

  const carveDirections: Position[] = [
    { row: -2, col: 0 },
    { row: 2, col: 0 },
    { row: 0, col: -2 },
    { row: 0, col: 2 },
  ];

  while (stack.length) {
    const current = stack[stack.length - 1];
    const directions = [...carveDirections];
    shuffleInPlace(directions);

    let carved = false;
    for (const direction of directions) {
      const nextRow = current.row + direction.row;
      const nextCol = current.col + direction.col;
      if (nextRow <= 0 || nextRow >= BOARD_ROWS - 1 || nextCol <= 0 || nextCol >= BOARD_COLS - 1) continue;
      if (grid[nextRow][nextCol]) continue;

      const betweenRow = current.row + direction.row / 2;
      const betweenCol = current.col + direction.col / 2;

      grid[betweenRow][betweenCol] = true;
      grid[nextRow][nextCol] = true;
      stack.push({ row: nextRow, col: nextCol });
      carved = true;
      break;
    }

    if (!carved) {
      stack.pop();
    }
  }

  return grid;
};

const addRandomLoops = (grid: boolean[][]) => {
  const attempts = Math.floor((BOARD_ROWS * BOARD_COLS) / 6);
  for (let i = 0; i < attempts; i += 1) {
    const row = 1 + Math.floor(Math.random() * (BOARD_ROWS - 2));
    const col = 1 + Math.floor(Math.random() * (BOARD_COLS - 2));

    if (grid[row][col]) continue;

    const openNeighbors = [
      grid[row - 1][col],
      grid[row + 1][col],
      grid[row][col - 1],
      grid[row][col + 1],
    ].filter(Boolean).length;

    if (openNeighbors >= 2) {
      grid[row][col] = true;
    }
  }
};

const carveWardenRoom = (grid: boolean[][]) => {
  for (let r = CENTER_ROW - 1; r <= CENTER_ROW + 1; r += 1) {
    for (let c = CENTER_COL - 2; c <= CENTER_COL + 2; c += 1) {
      grid[r][c] = true;
    }
  }

  for (let c = CENTER_COL - 3; c <= CENTER_COL + 3; c += 1) {
    grid[CENTER_ROW][c] = true;
  }

  for (let r = Math.max(1, CENTER_ROW - 3); r <= PLAYER_START.row; r += 1) {
    grid[r][CENTER_COL] = true;
  }
};

const toTileMap = (grid: boolean[][]): Tile[][] =>
  grid.map((row) => row.map((isFloor) => (isFloor ? "gold" : "wall")));

const countReachableTiles = (tiles: Tile[][], start: Position) => {
  if (tiles[start.row]?.[start.col] === "wall") return 0;
  const visited = new Set<string>();
  const queue: Position[] = [start];
  visited.add(`${start.row}-${start.col}`);

  while (queue.length) {
    const current = queue.shift()!;
    for (const offset of Object.values(directionOffsets)) {
      const nextRow = current.row + offset.row;
      const nextCol = current.col + offset.col;
      if (nextRow < 0 || nextRow >= BOARD_ROWS || nextCol < 0 || nextCol >= BOARD_COLS) continue;
      if (tiles[nextRow][nextCol] === "wall") continue;
      const key = `${nextRow}-${nextCol}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ row: nextRow, col: nextCol });
    }
  }

  return visited.size;
};

const generateRandomMap = (): Tile[][] => {
  const playerStart = PLAYER_START;
  const powerPositions: Position[] = [
    { row: 1, col: 1 },
    { row: 1, col: BOARD_COLS - 2 },
    { row: BOARD_ROWS - 2, col: 1 },
    { row: BOARD_ROWS - 2, col: BOARD_COLS - 2 },
  ];

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const grid = createMazeGrid();
    addRandomLoops(grid);

    grid[playerStart.row][playerStart.col] = true;
    powerPositions.forEach(({ row, col }) => {
      grid[row][col] = true;
    });

    carveWardenRoom(grid);

    const tiles = toTileMap(grid);

    // Remove pellets inside the warden room and at spawn positions
    for (let r = CENTER_ROW - 1; r <= CENTER_ROW + 1; r += 1) {
      for (let c = CENTER_COL - 2; c <= CENTER_COL + 2; c += 1) {
        tiles[r][c] = "empty";
      }
    }

    const spawnPositions = [
      playerStart,
      ...ENEMY_STARTS.map(({ row, col }) => ({ row, col })),
    ];
    spawnPositions.forEach(({ row, col }) => {
      tiles[row][col] = "empty";
    });

    powerPositions.forEach(({ row, col }) => {
      tiles[row][col] = "power";
    });

    const walkableCount = tiles.reduce(
      (acc, row) => acc + row.filter((tile) => tile !== "wall").length,
      0,
    );

    const reachable = countReachableTiles(tiles, playerStart);

    if (reachable === walkableCount) {
      return tiles;
    }
  }

  // Fallback: open grid ensuring reachability
  const fallback = Array.from({ length: BOARD_ROWS }, (_, rowIdx) =>
    Array.from({ length: BOARD_COLS }, (_, colIdx) => {
      if (rowIdx === 0 || rowIdx === BOARD_ROWS - 1 || colIdx === 0 || colIdx === BOARD_COLS - 1) {
        return "wall";
      }
      return "gold";
    }),
  );

  for (let r = CENTER_ROW - 1; r <= CENTER_ROW + 1; r += 1) {
    for (let c = CENTER_COL - 2; c <= CENTER_COL + 2; c += 1) {
      fallback[r][c] = "empty";
    }
  }
  fallback[playerStart.row][playerStart.col] = "empty";
  ENEMY_STARTS.forEach(({ row, col }) => {
    fallback[row][col] = "empty";
  });
  powerPositions.forEach(({ row, col }) => {
    fallback[row][col] = "power";
  });

  return fallback;
};
const boardTiles = computed(() =>
  tileMap.value.flatMap((row, rowIndex) =>
    row.map((tile, colIndex) => ({
      row: rowIndex,
      col: colIndex,
      tile,
      key: `cell-${rowIndex}-${colIndex}`,
    })),
  ),
);

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${tileMap.value[0]?.length ?? 0}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${tileMap.value.length}, minmax(0, 1fr))`,
}));

const totalPelletsForLevel = computed(() => levelPelletTotal.value);
const goldCollected = computed(() => Math.max(0, totalPelletsForLevel.value - pelletsRemaining.value));

const overlayTitle = computed(() => {
  switch (phase.value) {
    case "ready":
      return goldCollected.value > 0 && goldCollected.value < totalPelletsForLevel.value ? "Run Paused" : "Ready to Raid";
    case "life-lost":
      return "Caught by a Warden";
    case "level-complete":
      return "Depth Cleared";
    case "game-over":
      return "Gold Lost";
    default:
      return "";
  }
});

const overlayDescription = computed(() => {
  switch (phase.value) {
    case "ready":
      return goldCollected.value > 0 && goldCollected.value < totalPelletsForLevel.value
        ? "Run paused mid-depth. Resume the raid to finish gathering every vein of gold."
        : "Guide Gruntag's mining cart through the tunnels and collect every shard of gold.";
    case "life-lost":
      return "Shake off the dust and dive back in before the goblin wardens regroup.";
    case "level-complete":
      return "You've emptied these tunnels. Claim your reward and descend deeper for richer veins.";
    case "game-over":
      return "The wardens overran the cart. Regroup, refit, and start a fresh run.";
    default:
      return "";
  }
});

const actionLabel = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Begin Run";
    case "life-lost":
      return "Resume Run";
    case "level-complete":
      return "Descend Deeper";
    case "game-over":
      return "Restart Expedition";
    default:
      return "Resume";
  }
});

const showOverlay = computed(() => phase.value !== "running");
const powerSeconds = computed(() => Math.max(0, Math.ceil(powerModeRemaining.value / 1000)));

const keyToDirection = (key: string): Direction | null => {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
};

const mutateTile = (row: number, col: number, tile: Tile) => {
  if (!tileMap.value[row]) return;
  const updatedRow = [...tileMap.value[row]];
  updatedRow[col] = tile;
  tileMap.value[row] = updatedRow;
  tileMap.value = [...tileMap.value];
};

const isWall = (row: number, col: number) => tileMap.value[row]?.[col] === "wall";

const spawnEnemies = () => {
  enemies.splice(0, enemies.length);
  ENEMY_STARTS.forEach((spawn, index) => {
    enemies.push({
      id: `enemy-${index}`,
      label: spawn.label,
      row: spawn.row,
      col: spawn.col,
      direction: "left",
      state: "hunt",
      tickDelay: index + 1,
      baseDelay: Math.max(3, 6 - Math.floor(level.value / 2)),
      colorClass: spawn.colorClass,
      spawnRow: spawn.row,
      spawnCol: spawn.col,
      respawnCounter: 0,
    });
  });
};

const resetPlayerPosition = () => {
  player.row = PLAYER_START.row;
  player.col = PLAYER_START.col;
  player.direction = "left";
  player.nextDirection = "left";
};

const resetEnemyPositions = (state: "hunt" | "frightened" = "hunt") => {
  enemies.forEach((enemy, index) => {
    const spawn = ENEMY_STARTS[index % ENEMY_STARTS.length];
    enemy.row = spawn.row;
    enemy.col = spawn.col;
    enemy.direction = "left";
    enemy.state = state;
    enemy.tickDelay = index + 1;
    enemy.respawnCounter = 0;
  });
};

const updatePelletCount = () => {
  pelletsRemaining.value = tileMap.value.reduce(
    (acc, row) => acc + row.filter((tile) => tile === "gold" || tile === "power").length,
    0,
  );
};

const prepareLevel = () => {
  tileMap.value = generateRandomMap();
  updatePelletCount();
  levelPelletTotal.value = pelletsRemaining.value;
  resetPlayerPosition();
  spawnEnemies();
  phase.value = "ready";
  isPowerMode.value = false;
  powerModeRemaining.value = 0;
  statusMessage.value = `Depth ${level.value} tunnels mapped. Awaiting orders.`;
};

const goHome = () => {
  router.push("/");
};

let gameLoop: number | null = null;
let currentTickMs = 140;

const clearLoop = () => {
  if (gameLoop) {
    clearInterval(gameLoop);
    gameLoop = null;
  }
};

const getTickInterval = () => Math.max(90, 160 - level.value * 6);

const startLoop = () => {
  clearLoop();
  currentTickMs = getTickInterval();
  gameLoop = window.setInterval(runTick, currentTickMs);
};

const startRun = () => {
  if (phase.value === "running") {
    return;
  }
  if (phase.value === "level-complete") {
    level.value += 1;
    prepareLevel();
  } else if (phase.value === "game-over") {
    level.value = 1;
    score.value = 0;
    lives.value = 3;
    prepareLevel();
  } else if (phase.value === "life-lost") {
    resetPlayerPosition();
    resetEnemyPositions(isPowerMode.value ? "frightened" : "hunt");
  }

  phase.value = "running";
  statusMessage.value = "Collect the gold and watch the wardens.";
  startLoop();
};

const stopRun = () => {
  phase.value = "ready";
  statusMessage.value = "Run paused. Resume when ready.";
  clearLoop();
};

const tryMove = (direction: Direction) => {
  const offset = directionOffsets[direction];
  const targetRow = player.row + offset.row;
  const targetCol = player.col + offset.col;

  if (isWall(targetRow, targetCol)) {
    return false;
  }

  player.row = targetRow;
  player.col = targetCol;
  player.direction = direction;
  handleTileEffects(targetRow, targetCol);
  return true;
};

const handleTileEffects = (row: number, col: number) => {
  const tile = tileMap.value[row]?.[col];
  if (tile === "gold") {
    mutateTile(row, col, "empty");
    pelletsRemaining.value -= 1;
    score.value += 50;
    statusMessage.value = "Gold gathered! Keep moving.";
  } else if (tile === "power") {
    mutateTile(row, col, "empty");
    pelletsRemaining.value -= 1;
    score.value += 150;
    triggerPowerMode();
  }

  if (pelletsRemaining.value <= 0) {
    handleLevelComplete();
  }
};

const triggerPowerMode = () => {
  isPowerMode.value = true;
  powerModeRemaining.value = 6000;
  enemies.forEach((enemy) => {
    if (enemy.state !== "respawning") {
      enemy.state = "frightened";
      enemy.tickDelay = Math.max(enemy.tickDelay, 2);
    }
  });
  statusMessage.value = "Power surge! Wardens are on the run.";
};

const endPowerMode = () => {
  isPowerMode.value = false;
  powerModeRemaining.value = 0;
  enemies.forEach((enemy) => {
    if (enemy.state === "frightened") {
      enemy.state = "hunt";
    }
  });
  statusMessage.value = "Surge faded. Stay sharp.";
};

const handleEnemyCaptured = (enemy: Enemy) => {
  score.value += 250;
  enemy.state = "respawning";
  enemy.row = enemy.spawnRow;
  enemy.col = enemy.spawnCol;
  enemy.respawnCounter = 6;
  enemy.tickDelay = 3;
  statusMessage.value = `${enemy.label} stunned!`;
};

const handlePlayerCaught = () => {
  clearLoop();
  lives.value -= 1;
  if (lives.value <= 0) {
    phase.value = "game-over";
    statusMessage.value = "The wardens overran the cart. You'll need a new plan.";
    toast({
      title: "Expedition Failed",
      description: "All carts destroyed. Restart the run to reclaim the gold.",
      variant: "destructive",
    });
    return;
  }

  phase.value = "life-lost";
  isPowerMode.value = false;
  powerModeRemaining.value = 0;
  resetPlayerPosition();
  resetEnemyPositions("hunt");
  statusMessage.value = "You were caught! Regroup and head back in.";
};

const handleLevelComplete = () => {
  clearLoop();
  phase.value = "level-complete";
  isPowerMode.value = false;
  powerModeRemaining.value = 0;
  score.value += 500;
  statusMessage.value = `Depth ${level.value} cleared. Claim your reward.`;
  const newTotal = addVictoryPoint();
  victoryPoints.value = newTotal;
  toast({
    title: "Gold Secured!",
    description: `You cleared the tunnels and earned a victory point. Total VP: ${newTotal}`,
    variant: "success",
  });
};

const distanceToPlayer = (row: number, col: number) => Math.abs(row - player.row) + Math.abs(col - player.col);

const moveEnemy = (enemy: Enemy) => {
  if (enemy.state === "respawning") {
    enemy.respawnCounter -= 1;
    if (enemy.respawnCounter <= 0) {
      enemy.state = isPowerMode.value ? "frightened" : "hunt";
    }
    return;
  }

  const availableDirections = (Object.keys(directionOffsets) as Direction[]).filter((direction) => {
    const offset = directionOffsets[direction];
    const nextRow = enemy.row + offset.row;
    const nextCol = enemy.col + offset.col;
    if (isWall(nextRow, nextCol)) return false;
    if (direction === oppositeDirection[enemy.direction]) {
      // Allow reversing only if trapped
      const forwardOffset = directionOffsets[enemy.direction];
      const forwardRow = enemy.row + forwardOffset.row;
      const forwardCol = enemy.col + forwardOffset.col;
      if (!isWall(forwardRow, forwardCol)) {
        return false;
      }
    }
    return true;
  });

  if (!availableDirections.length) {
    enemy.direction = oppositeDirection[enemy.direction];
    return;
  }

  let chosenDirection: Direction;
  if (availableDirections.length === 1) {
    chosenDirection = availableDirections[0];
  } else if (enemy.state === "frightened") {
    const randomIndex = Math.floor(Math.random() * availableDirections.length);
    chosenDirection = availableDirections[randomIndex];
  } else {
    if (Math.random() < 0.55) {
      const randomIndex = Math.floor(Math.random() * availableDirections.length);
      chosenDirection = availableDirections[randomIndex];
    } else {
      const distances = availableDirections.map((direction) => {
        const offset = directionOffsets[direction];
        return distanceToPlayer(enemy.row + offset.row, enemy.col + offset.col);
      });
      const minDistance = Math.min(...distances);
      const bestCandidates = availableDirections.filter((direction, idx) => distances[idx] === minDistance);
      const randomBest = Math.floor(Math.random() * bestCandidates.length);
      chosenDirection = bestCandidates[randomBest];
    }
  }

  enemy.direction = chosenDirection;
  const moveOffset = directionOffsets[chosenDirection];
  enemy.row += moveOffset.row;
  enemy.col += moveOffset.col;
};

const checkCollisions = () => {
  for (const enemy of enemies) {
    if (enemy.row === player.row && enemy.col === player.col) {
      if (enemy.state === "frightened") {
        handleEnemyCaptured(enemy);
      } else if (enemy.state === "hunt") {
        handlePlayerCaught();
        break;
      }
    }
  }
};

const playerRotation = computed(() => {
  switch (player.direction) {
    case "up":
      return "-90deg";
    case "down":
      return "90deg";
    case "left":
      return "180deg";
    default:
      return "0deg";
  }
});

const getEnemyClasses = (enemy: Enemy) => {
  const classes = ["enemy-token", enemy.colorClass];
  if (enemy.state === "frightened") {
    classes.push("enemy-frightened");
  }
  if (enemy.state === "respawning") {
    classes.push("enemy-respawning");
  }
  return classes.join(" ");
};

const enemyAtCell = (row: number, col: number) => enemies.filter((enemy) => enemy.row === row && enemy.col === col);
const isPlayerAt = (row: number, col: number) => player.row === row && player.col === col;

const getEnemyDelay = (enemy: Enemy) => {
  const base = Math.max(1, enemy.baseDelay - Math.floor(level.value / 3));
  const frightenedOffset = enemy.state === "frightened" ? 1 : 0;
  const randomOffset = enemy.state === "hunt" && Math.random() < 0.4 ? 1 : 0;
  return base + frightenedOffset + randomOffset;
};

const runTick = () => {
  if (phase.value !== "running") {
    clearLoop();
    return;
  }

  const direction = player.nextDirection;
  const moved = tryMove(direction) || tryMove(player.direction);
  if (!moved) {
    // Remain in place but still check tile for lingering power effects
    handleTileEffects(player.row, player.col);
  }

  enemies.forEach((enemy) => {
    enemy.tickDelay -= 1;
    if (enemy.tickDelay <= 0) {
      moveEnemy(enemy);
      enemy.tickDelay = getEnemyDelay(enemy);
    }
  });

  checkCollisions();

  if (isPowerMode.value) {
    powerModeRemaining.value = Math.max(0, powerModeRemaining.value - currentTickMs);
    if (powerModeRemaining.value <= 0) {
      endPowerMode();
    }
  }
};

const tileClass = (tile: Tile) => {
  if (tile === "wall") {
    return "bg-[radial-gradient(circle_at_center,rgba(14,116,144,0.3),rgba(15,23,42,0.95))] border border-primary/50 shadow-[inset_0_0_18px_rgba(14,116,144,0.45)]";
  }
  return "bg-slate-950/60";
};

const handleKeydown = (event: KeyboardEvent) => {
  const direction = keyToDirection(event.key);
  if (direction) {
    player.nextDirection = direction;
    event.preventDefault();
  }
  if ((event.key === " " || event.key === "Enter") && phase.value !== "running") {
    event.preventDefault();
    startRun();
  }
};

onMounted(() => {
  prepareLevel();
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  clearLoop();
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-game)] p-4 md:p-8">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,10,10,0.5),transparent_70%)]" />
    <div class="pointer-events-none absolute left-1/2 top-1/3 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

    <div class="relative z-10 mx-auto max-w-6xl space-y-8">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="goHome">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Trophy class="h-4 w-4 text-accent" />
              Victory Points
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ victoryPoints.toLocaleString() }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Coins class="h-4 w-4 text-primary" />
              Gold Banked
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ score.toLocaleString() }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Shield class="h-4 w-4 text-emerald-400" />
              Carts Remaining
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ lives }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Flame class="h-4 w-4 text-accent" />
              Depth
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ level }}</p>
          </div>
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur">
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 class="text-4xl font-black tracking-tight text-foreground md:text-5xl">Gold Rush</h1>
                <p class="text-sm text-muted-foreground">
                  Navigate the haunted tunnels, gather every nugget, and dodge the goblin wardens on patrol.
                </p>
              </div>
              <div class="rounded-lg border border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
                {{ statusMessage }}
              </div>
            </div>

            <div class="relative flex justify-center">
              <div
                class="relative w-full max-w-4xl overflow-visible rounded-2xl border border-border/60 bg-gradient-to-br from-slate-950/70 via-slate-900/80 to-black/70 p-6 shadow-[inset_0_0_48px_rgba(0,0,0,0.6)]"
              >
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(250,204,21,0.08),transparent_55%)]" />
                <div
                  class="relative z-10 grid gap-[6px]"
                  :style="gridStyle"
                >
                  <div
                    v-for="cell in boardTiles"
                    :key="cell.key"
                    class="relative flex items-center justify-center rounded-lg border border-slate-900/40 transition"
                    :class="tileClass(cell.tile)"
                  >
                    <div
                      v-if="cell.tile === 'gold'"
                      class="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(250,204,21,0.6)]"
                    />
                    <div
                      v-else-if="cell.tile === 'power'"
                      class="h-4 w-4 rounded-full bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-400 shadow-[0_0_18px_rgba(253,224,71,0.8)]"
                    />

                    <div
                      v-if="isPlayerAt(cell.row, cell.col)"
                      class="player-token"
                      :style="{ transform: `rotate(${playerRotation})` }"
                    />

                    <template v-for="enemy in enemyAtCell(cell.row, cell.col)" :key="enemy.id">
                      <div :class="getEnemyClasses(enemy)">
                        <div class="enemy-eye left" />
                        <div class="enemy-eye right" />
                        <div class="enemy-teeth" />
                      </div>
                    </template>
                  </div>
                </div>

                <div
                  v-if="showOverlay"
                  class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 text-center backdrop-blur"
                >
                  <h2 class="text-2xl font-semibold text-foreground">{{ overlayTitle }}</h2>
                  <p class="mt-3 max-w-md text-sm text-muted-foreground">
                    {{ overlayDescription }}
                  </p>
                  <button type="button" :class="actionButtonClasses" class="mt-6" @click="startRun">
                    {{ actionLabel }}
                  </button>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
              <div class="flex flex-wrap items-center gap-3">
                <span class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-foreground">
                  <Coins class="h-4 w-4 text-amber-400" />
                  {{ goldCollected }} / {{ totalPelletsForLevel }}
                </span>
                <span>&bull;</span>
                <span>Gold Remaining: {{ pelletsRemaining }}</span>
                <span>&bull;</span>
                <span v-if="isPowerMode">Power Surge: {{ powerSeconds }}s</span>
                <span v-else>Awaiting Rune Surge</span>
              </div>

              <button
                v-if="phase === 'running'"
                type="button"
                class="inline-flex items-center gap-2 rounded-md border border-destructive/60 bg-destructive/20 px-5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-destructive"
                @click="stopRun"
              >
                Pause Run
              </button>
            </div>
          </div>
        </section>

        <aside class="rounded-xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          <header class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-foreground">Run Intel</h2>
            <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground">
              <Zap class="h-4 w-4 text-primary" />
              Power {{ isPowerMode ? "Active" : "Dormant" }}
            </div>
          </header>

          <div class="mt-4 space-y-4">
            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Controls</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Use arrow keys or WASD to steer the cart.</li>
                <li>Collect all gold to clear the depth.</li>
                <li>Power shards stun wardens; crash into them while the surge lasts.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Tips</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Wardens prefer straight tunnels—break line of sight by cutting corners.</li>
                <li>Save power shards for cramped sectors to flip the chase.</li>
                <li>Every cleared depth awards a victory point. Keep the streak alive.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Enemy Intel</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li v-for="enemy in enemies" :key="enemy.id" class="flex items-center justify-between gap-2">
                  <span class="font-medium text-foreground">{{ enemy.label }}</span>
                  <span :class="['rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', enemy.state === 'hunt' ? 'bg-red-500/20 text-red-300' : enemy.state === 'frightened' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300']">
                    {{ enemy.state }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-token {
  position: relative;
  height: 1.9rem;
  width: 1.9rem;
  border-radius: 9999px;
  background: radial-gradient(circle at 35% 35%, rgba(255, 252, 214, 0.9), rgba(250, 204, 21, 0.85));
  box-shadow: 0 0 22px rgba(250, 204, 21, 0.5);
  transition: transform 0.08s linear;
}

.player-token::after {
  content: "";
  position: absolute;
  inset: 50% 0 0 50%;
  transform-origin: 0% 0%;
  width: 50%;
  height: 50%;
  border-radius: 0 100% 0 100%;
  background: rgba(12, 10, 22, 0.92);
  filter: drop-shadow(0 0 8px rgba(12, 10, 22, 0.6));
  transform: rotate(45deg);
}

.enemy-token {
  position: relative;
  height: 1.8rem;
  width: 1.8rem;
  border-radius: 1rem 1rem 0.5rem 0.5rem;
  background-image: linear-gradient(135deg, rgba(244, 114, 182, 0.85), rgba(129, 140, 248, 0.85));
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 0.2rem;
  box-shadow:
    0 6px 18px rgba(37, 99, 235, 0.4),
    inset 0 -6px 12px rgba(14, 14, 48, 0.6);
  overflow: hidden;
  transition: filter 0.2s;
}

.enemy-token::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 0.5rem;
  background: repeating-linear-gradient(
    to right,
    rgba(12, 10, 22, 0.85) 0,
    rgba(12, 10, 22, 0.85) 25%,
    transparent 25%,
    transparent 50%
  );
}

.enemy-frightened {
  filter: hue-rotate(120deg) brightness(1.1);
}

.enemy-respawning {
  opacity: 0.65;
}

.enemy-eye {
  position: absolute;
  top: 0.35rem;
  width: 0.35rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: white;
  box-shadow: inset 0 -1px 2px rgba(15, 15, 35, 0.4);
}

.enemy-eye::after {
  content: "";
  position: absolute;
  bottom: 0.1rem;
  left: 50%;
  transform: translateX(-50%);
  width: 0.22rem;
  height: 0.25rem;
  border-radius: 9999px;
  background: rgba(15, 15, 35, 0.85);
}

.enemy-eye.left {
  left: 0.45rem;
}

.enemy-eye.right {
  right: 0.45rem;
}

.enemy-teeth {
  position: absolute;
  bottom: 0.12rem;
  display: flex;
  gap: 0.08rem;
}

.enemy-teeth::before,
.enemy-teeth::after {
  content: "";
  width: 0.25rem;
  height: 0.25rem;
  background: rgba(233, 233, 244, 0.9);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  box-shadow: 0 0 6px rgba(233, 233, 244, 0.6);
}
</style>

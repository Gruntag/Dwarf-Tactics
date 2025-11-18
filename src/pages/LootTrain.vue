<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Crown, Flame, HeartPulse, LayoutGrid, Sparkles, Timer, Train, Trophy } from "lucide-vue-next";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import { toast } from "@/composables/useToast";

type Phase = "ready" | "running" | "victory" | "defeat";
type DirectionKey = "up" | "down" | "left" | "right";

interface Position {
  x: number;
  y: number;
}

interface FloatingMessage {
  id: string;
  text: string;
  life: number;
  maxLife: number;
  position: Position;
}

const BOARD_COLS = 20;
const BOARD_ROWS = 18;
const CELL_SIZE = 32;
const BASE_TICK_MS = 220;
const SPEED_MIN_MS = 90;
const LOOT_TARGET = 22;

const router = useRouter();

const phase = ref<Phase>("ready");
const LOOT_RESOURCE_KEY = "lootTrain" as const;
const lootResource = RESOURCES[LOOT_RESOURCE_KEY];
const cargoCrates = ref(getResourceCount(LOOT_RESOURCE_KEY));

const snake = ref<Position[]>([]);
const direction = ref<Position>({ x: 1, y: 0 });
const queuedDirection = ref<Position>({ x: 1, y: 0 });
const lootCart = ref<Position>({ x: 5, y: 5 });
const lootCollected = ref(0);
const distanceTravelled = ref(0);
const crashPosition = ref<Position | null>(null);

const floatingMessages = reactive<FloatingMessage[]>([]);

const tickRateMs = computed(() =>
  Math.max(SPEED_MIN_MS, BASE_TICK_MS - lootCollected.value * 6)
);

const boardStyle = computed(() => ({
  width: `${BOARD_COLS * CELL_SIZE}px`,
  height: `${BOARD_ROWS * CELL_SIZE}px`,
}));

const snakeHead = computed(() => snake.value[0]);
const trainLength = computed(() => snake.value.length);
const progressPercent = computed(() =>
  Math.min(100, Math.round((lootCollected.value / LOOT_TARGET) * 100))
);

let tickTimer: number | null = null;
let animationFrame: number | null = null;
let lastSpawnId = 0;
let pointGranted = false;

const goHome = () => {
  router.push("/");
};

const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(16).slice(2)}`;

const spawnFloatingMessage = (text: string, position: Position) => {
  floatingMessages.push({
    id: randomId(),
    text,
    life: 900,
    maxLife: 900,
    position,
  });
};

const popFloatingMessage = (id: string) => {
  const index = floatingMessages.findIndex((item) => item.id === id);
  if (index !== -1) {
    floatingMessages.splice(index, 1);
  }
};

const clearTimers = () => {
  if (tickTimer !== null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
};

const isOccupied = (position: Position) =>
  snake.value.some((segment) => segment.x === position.x && segment.y === position.y);

const randomEmptyCell = (): Position => {
  const freeCells: Position[] = [];
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLS; x += 1) {
      if (!isOccupied({ x, y })) {
        freeCells.push({ x, y });
      }
    }
  }
  if (!freeCells.length) {
    return { x: 0, y: 0 };
  }
  return freeCells[Math.floor(Math.random() * freeCells.length)];
};

const resetState = () => {
  clearTimers();
  phase.value = "ready";
  snake.value = [
    { x: Math.floor(BOARD_COLS / 2), y: Math.floor(BOARD_ROWS / 2) },
    { x: Math.floor(BOARD_COLS / 2) - 1, y: Math.floor(BOARD_ROWS / 2) },
    { x: Math.floor(BOARD_COLS / 2) - 2, y: Math.floor(BOARD_ROWS / 2) },
  ];
  direction.value = { x: 1, y: 0 };
  queuedDirection.value = { x: 1, y: 0 };
  lootCollected.value = 0;
  distanceTravelled.value = 0;
  crashPosition.value = null;
  floatingMessages.splice(0, floatingMessages.length);
  lootCart.value = randomEmptyCell();
  pointGranted = false;
};

const setDirection = (dir: DirectionKey) => {
  const nextDirection: Record<DirectionKey, Position> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const target = nextDirection[dir];
  const current = direction.value;
  if (current.x === -target.x && current.y === -target.y) {
    return;
  }
  queuedDirection.value = target;
};

const handleKeydown = (event: KeyboardEvent) => {
  if (phase.value !== "running") return;
  switch (event.key.toLowerCase()) {
    case "arrowup":
    case "w":
      setDirection("up");
      break;
    case "arrowdown":
    case "s":
      setDirection("down");
      break;
    case "arrowleft":
    case "a":
      setDirection("left");
      break;
    case "arrowright":
    case "d":
      setDirection("right");
      break;
    default:
      break;
  }
};

const endGame = (result: Phase) => {
  clearTimers();
  phase.value = result;
  if (result === "victory") {
    toast({
      title: "Loot Train Complete",
      description: "Gruntag delivers every cart safely.",
      variant: "success",
    });
  } else if (result === "defeat") {
    toast({
      title: "Train Derailed",
      description: "Gruntag's loot spills across the tracks.",
      variant: "destructive",
    });
  }
};

const advanceSnake = () => {
  if (phase.value !== "running") return;
  direction.value = { ...queuedDirection.value };
  const head = snake.value[0];
  const nextHead: Position = {
    x: head.x + direction.value.x,
    y: head.y + direction.value.y,
  };

  // wall collision
  if (
    nextHead.x < 0 ||
    nextHead.x >= BOARD_COLS ||
    nextHead.y < 0 ||
    nextHead.y >= BOARD_ROWS
  ) {
    crashPosition.value = nextHead;
    endGame("defeat");
    return;
  }

  // self collision
  if (snake.value.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)) {
    crashPosition.value = nextHead;
    endGame("defeat");
    return;
  }

  distanceTravelled.value += 1;

  const newSnake = [{ ...nextHead }, ...snake.value];
  const lootHit = nextHead.x === lootCart.value.x && nextHead.y === lootCart.value.y;

  if (lootHit) {
    lootCollected.value += 1;
    spawnFloatingMessage("Car Linked!", nextHead);
    lootCart.value = randomEmptyCell();
  } else {
    newSnake.pop();
  }

  snake.value = newSnake;

  if (lootCollected.value >= LOOT_TARGET) {
    endGame("victory");
  }
};

const updateFloatingMessages = (deltaMs: number) => {
  for (let index = floatingMessages.length - 1; index >= 0; index -= 1) {
    const item = floatingMessages[index];
    item.life -= deltaMs;
    if (item.life <= 0) {
      floatingMessages.splice(index, 1);
    }
  }
};

const animate = (timestamp: number) => {
  if (phase.value !== "running") return;
  if (!lastSpawnId) {
    lastSpawnId = timestamp;
  }
  const delta = timestamp - lastSpawnId;
  lastSpawnId = timestamp;
  updateFloatingMessages(delta);
  animationFrame = requestAnimationFrame(animate);
};

const scheduleTick = () => {
  clearTimers();
  lastSpawnId = 0;
  tickTimer = window.setInterval(advanceSnake, tickRateMs.value);
  animationFrame = requestAnimationFrame(animate);
};

const startGame = () => {
  resetState();
  phase.value = "running";
  scheduleTick();
  spawnFloatingMessage("All aboard!", snake.value[0]);
};

watch(
  () => lootCollected.value,
  () => {
    if (phase.value === "running") {
      scheduleTick();
    }
  }
);

watch(
  () => phase.value,
  (next) => {
    if (next === "running") {
      cargoCrates.value = getResourceCount(LOOT_RESOURCE_KEY);
    }
    if (next === "victory" && !pointGranted) {
      cargoCrates.value = addResource(LOOT_RESOURCE_KEY);
      pointGranted = true;
    }
  }
);

onMounted(() => {
  resetState();
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  clearTimers();
});

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const actionButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";

const overlayTitle = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Legendary Delivery";
    case "defeat":
      return "Train Derailed";
    default:
      return "Loot Train";
  }
});

const overlayDescription = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Every cart of treasure reaches the vault. Gruntag is pleased.";
    case "defeat":
      return "The cars scatter across the cavern floor. Gather yourself and try again.";
    default:
      return "Guide Gruntag's loot train through the tunnels. Gather treasure carts, avoid crashing into the cavern walls or yourself, and collect 22 carts to claim victory.";
  }
});

const overlayAction = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Run the Train Again";
    case "defeat":
      return "Rebuild the Train";
    default:
      return "Start the Heist";
  }
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-slate-950 py-10">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_60%)]" />
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(251,191,36,0.12),_transparent_55%)]" />

    <main class="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 lg:flex-row">
      <div class="flex-1 space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" :class="backButtonClasses" @click="goHome">
            <ArrowLeft class="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Return
          </button>

          <div class="flex items-center gap-2 rounded-lg border border-primary/30 bg-card/80 px-4 py-2 text-sm text-foreground backdrop-blur">
            <Trophy class="h-5 w-5 text-accent" />
            <div class="flex flex-col leading-tight text-right">
              <span class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ lootResource.plural }}</span>
              <span class="text-lg font-semibold text-foreground">{{ cargoCrates }}</span>
            </div>
          </div>
        </div>

        <section class="relative overflow-hidden rounded-3xl border border-primary/15 bg-slate-900/70 shadow-[0_20px_60px_rgba(15,23,42,0.55)] backdrop-blur">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.12),_transparent_65%)]" />
          <div class="relative px-6 py-6">
            <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">
                  Loot Train
                </p>
                <h1 class="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Cavern Rail Run
                </h1>
              </div>
              <div class="text-sm text-muted-foreground sm:max-w-md">
                <p>
                  Snake the rails through Gruntag's vaults. Link treasure carts, keep the train intact, and don't collide with your own loot.
                </p>
              </div>
            </header>

            <div class="mt-6 flex flex-col gap-6 lg:flex-row">
              <div class="flex-1">
                <div class="rounded-2xl border border-border/60 bg-slate-950/60 p-5">
                  <div class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div class="flex items-center gap-2">
                      <Train class="h-4 w-4 text-emerald-400" />
                      Cars Linked {{ lootCollected }} / {{ LOOT_TARGET }}
                    </div>
                    <div class="flex items-center gap-2">
                      <LayoutGrid class="h-4 w-4 text-sky-400" />
                      Train Length {{ trainLength }}
                    </div>
                    <div class="flex items-center gap-2">
                      <Timer class="h-4 w-4 text-amber-300" />
                      Pace {{ tickRateMs }} ms
                    </div>
                    <div class="flex items-center gap-2">
                      <Flame class="h-4 w-4 text-rose-400" />
                      Distance {{ distanceTravelled }}
                    </div>
                  </div>

                  <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      class="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 transition-all duration-300"
                      :style="{ width: `${progressPercent}%` }"
                    />
                  </div>
                </div>

                <div class="mt-5 flex justify-center">
                  <div class="board relative overflow-hidden rounded-3xl border border-border/50 bg-slate-900/80 shadow-[0_20px_50px_rgba(15,23,42,0.45)]" :style="boardStyle">
                    <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.08),_transparent_70%)]" />
                    <div class="absolute inset-0 bg-[linear-gradient(to_right,rgba(30,41,59,0.28)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,41,59,0.28)_1px,transparent_1px)]" :style="{ backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px` }" />

                    <div
                      v-for="(segment, index) in snake"
                      :key="`segment-${index}`"
                      :class="['train-segment', index === 0 ? 'head' : 'cart']"
                      :style="{
                        width: `${CELL_SIZE}px`,
                        height: `${CELL_SIZE}px`,
                        transform: `translate(${segment.x * CELL_SIZE}px, ${segment.y * CELL_SIZE}px)`,
                      }"
                    >
                      <Sparkles v-if="index === 0" class="h-4 w-4 text-amber-200" />
                      <span v-else class="cart-icon" />
                    </div>

                    <div
                      class="loot-cart"
                      :style="{
                        width: `${CELL_SIZE - 6}px`,
                        height: `${CELL_SIZE - 6}px`,
                        transform: `translate(${lootCart.x * CELL_SIZE + 3}px, ${lootCart.y * CELL_SIZE + 3}px)`,
                      }"
                    />

                    <div
                      v-if="crashPosition"
                      class="crash-marker"
                      :style="{
                        width: `${CELL_SIZE}px`,
                        height: `${CELL_SIZE}px`,
                        transform: `translate(${crashPosition.x * CELL_SIZE}px, ${crashPosition.y * CELL_SIZE}px)`,
                      }"
                    />

                    <div
                      v-for="message in floatingMessages"
                      :key="message.id"
                      class="floating-message"
                      :style="{
                        transform: `translate(${message.position.x * CELL_SIZE}px, ${message.position.y * CELL_SIZE}px)`,
                        opacity: Math.max(0, message.life / message.maxLife),
                      }"
                    >
                      {{ message.text }}
                    </div>

                    <div
                      v-if="phase !== 'running'"
                      class="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm"
                    >
                      <div class="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-primary/30 bg-slate-900/85 px-8 py-10 text-center shadow-[0_24px_60px_rgba(14,23,42,0.6)]">
                        <Train class="h-8 w-8 text-accent" />
                        <h2 class="text-2xl font-bold text-foreground">
                          {{ overlayTitle }}
                        </h2>
                        <p class="text-sm text-muted-foreground">
                          {{ overlayDescription }}
                        </p>
                        <button type="button" :class="actionButtonClasses" @click="startGame">
                          {{ overlayAction }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <aside class="w-full max-w-sm space-y-4">
                <div class="rounded-2xl border border-border/60 bg-slate-950/60 p-5">
                  <h3 class="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Controls
                  </h3>
                  <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>Use arrow keys or WASD to steer Gruntag through the tunnels.</li>
                    <li>Every loot cart adds a car to the train and increases the speed.</li>
                    <li>Colliding with the cavern wall or your own carts ends the run.</li>
                  </ul>
                </div>

                <div class="rounded-2xl border border-border/60 bg-slate-950/60 p-5">
                  <h3 class="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Rail Strategies
                  </h3>
                  <ul class="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>Keep a wide loop so the train has room for sudden turns.</li>
                    <li>Use the outer edges for travel and the center for pickups.</li>
                    <li>Link 22 carts to complete the haul and earn a {{ lootResource.singular.toLowerCase() }}.</li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>

      <aside class="w-full max-w-xs space-y-6">
        <div class="rounded-3xl border border-primary/15 bg-slate-900/60 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur">
          <h3 class="text-lg font-semibold text-foreground">Train Metrics</h3>
          <dl class="mt-4 space-y-3 text-sm text-muted-foreground">
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Train class="h-4 w-4 text-emerald-400" />
                Linked Carts
              </dt>
              <dd class="font-semibold text-foreground">{{ lootCollected }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Crown class="h-4 w-4 text-amber-300" />
                Train Length
              </dt>
              <dd class="font-semibold text-foreground">{{ trainLength }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Timer class="h-4 w-4 text-amber-300" />
                Tick Rate
              </dt>
              <dd class="font-semibold text-foreground">{{ tickRateMs }} ms</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Flame class="h-4 w-4 text-rose-400" />
                Distance
              </dt>
              <dd class="font-semibold text-foreground">{{ distanceTravelled }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <HeartPulse class="h-4 w-4 text-emerald-400" />
                Status
              </dt>
              <dd class="font-semibold text-foreground">
                {{ phase === "running" ? "Rolling" : phase === "victory" ? "Vaulted" : "Idle" }}
              </dd>
            </div>
          </dl>
        </div>

        <div class="rounded-3xl border border-primary/15 bg-slate-900/60 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur">
          <h3 class="text-lg font-semibold text-foreground">Victory Terms</h3>
          <p class="mt-3 text-sm text-muted-foreground">
            The train must haul <strong>22 carts</strong> without derailing. Each pickup accelerates the convoy, testing your reflexes. Keep Gruntag safe and the loot secure to earn a {{ lootResource.singular.toLowerCase() }}.
          </p>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.board {
  position: relative;
  border-radius: 24px;
  overflow: hidden;
}

.train-segment {
  position: absolute;
  display: grid;
  place-items: center;
  transition: transform 0.08s linear;
}

.train-segment.head {
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(251, 191, 36, 0.95), rgba(218, 119, 6, 0.9));
  box-shadow:
    0 10px 24px rgba(251, 191, 36, 0.35),
    inset 0 -10px 16px rgba(124, 45, 18, 0.4);
  border: 2px solid rgba(255, 228, 181, 0.6);
}

.train-segment.cart {
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(29, 78, 216, 0.85));
  box-shadow:
    0 8px 18px rgba(37, 99, 235, 0.3),
    inset 0 -8px 14px rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(191, 219, 254, 0.5);
}

.cart-icon {
  height: 12px;
  width: 18px;
  border-radius: 4px;
  background: linear-gradient(135deg, rgba(226, 232, 240, 0.85), rgba(148, 163, 184, 0.75));
  box-shadow:
    inset 0 -2px 4px rgba(71, 85, 105, 0.6),
    0 0 8px rgba(226, 232, 240, 0.3);
}

.loot-cart {
  position: absolute;
  border-radius: 10px;
  background: linear-gradient(145deg, rgba(251, 191, 36, 0.95), rgba(249, 115, 22, 0.8));
  box-shadow:
    0 12px 22px rgba(249, 115, 22, 0.4),
    inset 0 -8px 14px rgba(124, 45, 18, 0.4);
  border: 2px solid rgba(251, 191, 36, 0.6);
  transition: transform 0.08s linear;
}

.crash-marker {
  position: absolute;
  border-radius: 14px;
  border: 2px solid rgba(248, 113, 113, 0.7);
  background: rgba(248, 113, 113, 0.35);
  box-shadow:
    0 0 24px rgba(248, 113, 113, 0.4),
    inset 0 0 12px rgba(248, 113, 113, 0.6);
}

.floating-message {
  position: absolute;
  transform: translate(-10%, -40%);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.95);
  text-shadow:
    0 0 12px rgba(56, 189, 248, 0.6),
    0 0 24px rgba(226, 232, 240, 0.6);
  pointer-events: none;
}
</style>

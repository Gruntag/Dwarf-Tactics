<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Flame, Hammer, Skull, Timer, Trophy } from "lucide-vue-next";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import { toast } from "@/composables/useToast";

const router = useRouter();

interface GridSettings {
  rows: number;
  cols: number;
  activeSlots: number;
  spawnIntervalMs: number;
  hitRadius: number; // In grid cells
}

interface Goblin {
  id: string;
  row: number;
  col: number;
  state: "entering" | "active" | "running" | "hit" | "despawning";
  spawnedAt: number;
}

const baseSettings: GridSettings = {
  rows: 3,
  cols: 4,
  activeSlots: 3,
  spawnIntervalMs: 1000,
  hitRadius: 0,
};

const SKULL_RESOURCE_KEY = "skullCrusher" as const;
const skullResource = RESOURCES[SKULL_RESOURCE_KEY];
const skullShards = ref(getResourceCount(SKULL_RESOURCE_KEY));
const currentLevel = ref(1);
const combo = ref(0);
const score = ref(0);
const misses = ref(0);
const timeRemaining = ref(60);
const isRunning = ref(false);
const highCombo = ref(0);

const settings = reactive<GridSettings>({ ...baseSettings });

const goblins = reactive<Goblin[]>([]);
const activeSlots = computed(() => goblins.filter((g) => g.state === "active").length);
const gridSlots = computed(() => {
  const slots: Array<{ row: number; col: number; key: string }> = [];
  for (let row = 0; row < settings.rows; row += 1) {
    for (let col = 0; col < settings.cols; col += 1) {
      slots.push({ row, col, key: `cell-${row}-${col}` });
    }
  }
  return slots;
});

let spawnTimer: number | null = null;
let countdownTimer: number | null = null;

const goblinStates: Record<Goblin["state"], string> = {
  entering: "animate-slide-in",
  active: "animate-bob",
  running: "animate-run-away",
  hit: "animate-crushing",
  despawning: "animate-fade-out",
};

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${settings.cols}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${settings.rows}, minmax(0, 1fr))`,
}));

const occupiedKey = (row: number, col: number) => `${row}-${col}`;

const occupiedSlots = computed(() =>
  new Set(goblins.filter((g) => g.state !== "despawning").map((g) => occupiedKey(g.row, g.col))),
);

const createGoblinId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `goblin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nextGoblinPosition = () => {
  const occupied = occupiedSlots.value;
  const attempts = 10;
  for (let i = 0; i < attempts; i += 1) {
    const row = Math.floor(Math.random() * settings.rows);
    const col = Math.floor(Math.random() * settings.cols);
    const key = occupiedKey(row, col);
    if (!occupied.has(key)) {
      return { row, col };
    }
  }
  return null;
};

const spawnGoblin = () => {
  if (!isRunning.value) return;
  if (activeSlots.value >= settings.activeSlots) return;

  const position = nextGoblinPosition();
  if (!position) return;

  const goblin: Goblin = {
    id: createGoblinId(),
    row: position.row,
    col: position.col,
    state: "entering",
    spawnedAt: Date.now(),
  };

  goblins.push(goblin);

  setTimeout(() => {
    const target = goblins.find((g) => g.id === goblin.id);
    if (target && target.state === "entering") {
      target.state = "active";
      scheduleGoblinDeparture(target.id);
    }
  }, 120);
};

const scheduleGoblinDeparture = (id: string) => {
  setTimeout(() => {
    const target = goblins.find((g) => g.id === id);
    if (!target || !isRunning.value) return;
    if (target.state === "active") {
      target.state = "running";
      misses.value += 1;
      combo.value = 0;
      setTimeout(() => removeGoblin(target.id), 200);
    }
  }, settings.spawnIntervalMs * 1.5);
};

const removeGoblin = (id: string) => {
  const index = goblins.findIndex((g) => g.id === id);
  if (index >= 0) {
    goblins.splice(index, 1);
  }
};

const handleHit = (row: number, col: number) => {
  if (!isRunning.value) return;

  const hits: Goblin[] = [];
  const radius = settings.hitRadius;
  for (const goblin of goblins) {
    if (goblin.state !== "active") continue;
    const distance = Math.max(Math.abs(goblin.row - row), Math.abs(goblin.col - col));
    if (distance <= radius) {
      hits.push(goblin);
    }
  }

  if (!hits.length) {
    combo.value = 0;
    return;
  }

  hits.forEach((goblin, index) => {
    goblin.state = "hit";
    setTimeout(() => removeGoblin(goblin.id), 260 + index * 30);
  });

  combo.value += hits.length;
  highCombo.value = Math.max(combo.value, highCombo.value);
  score.value += hits.length * (1 + combo.value * 0.1);
};

const tickCountdown = () => {
  countdownTimer = window.setInterval(() => {
    if (timeRemaining.value <= 0) {
      endGame();
      return;
    }
    timeRemaining.value -= 1;
  }, 1000);
};

const startSpawning = () => {
  spawnTimer = window.setInterval(spawnGoblin, settings.spawnIntervalMs);
};

const clearTimers = () => {
  if (spawnTimer) {
    clearInterval(spawnTimer);
    spawnTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
};

const resetState = () => {
  goblins.splice(0, goblins.length);
  score.value = 0;
  combo.value = 0;
  highCombo.value = 0;
  misses.value = 0;
  timeRemaining.value = 60;
};

const applyLevelSettings = () => {
  const level = currentLevel.value;
  settings.rows = Math.min(5, baseSettings.rows + Math.floor((level - 1) / 2));
  settings.cols = Math.min(6, baseSettings.cols + Math.floor((level - 1) / 2));
  settings.activeSlots = Math.min(
    settings.rows * settings.cols,
    baseSettings.activeSlots + Math.floor(level / 2),
  );
  settings.spawnIntervalMs = Math.max(350, baseSettings.spawnIntervalMs - level * 70);
  settings.hitRadius = level >= 4 ? 1 : 0;
};

const startGame = () => {
  resetState();
  applyLevelSettings();
  isRunning.value = true;
  spawnGoblin();
  startSpawning();
  tickCountdown();
};

const endGame = () => {
  clearTimers();
  isRunning.value = false;
  const goblinsCleared = Math.round(score.value);
  toast({
    title: "Skull Crusher session complete!",
    description: `You smashed ${goblinsCleared} goblins. High combo: ${highCombo.value}.`,
  });
  if (goblinsCleared >= 60) {
    const newTotal = addResource(SKULL_RESOURCE_KEY);
    skullShards.value = newTotal;
    toast({
      title: `${skullResource.singular} Earned!`,
      description: `Gruntag honors your skull crushing prowess. Total ${skullResource.plural}: ${newTotal}`,
      variant: "success",
    });
  }
};

const backToMenu = () => {
  router.push("/");
};

watch(isRunning, (running) => {
  if (!running) {
    clearTimers();
  }
});

onMounted(() => {
  applyLevelSettings();
});

onBeforeUnmount(() => {
  clearTimers();
});

const goblinStyle = (goblin: Goblin) => ({
  animationDuration: goblin.state === "active" ? `${settings.spawnIntervalMs * 0.8}ms` : undefined,
});

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-game)] p-4 md:p-8">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,10,10,0.5),transparent_70%)]" />
    <div class="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

    <div class="relative z-10 mx-auto max-w-6xl space-y-8">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="backToMenu">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Trophy class="h-4 w-4 text-accent" />
              {{ skullResource.plural }}
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ skullShards.toLocaleString() }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Skull class="h-4 w-4 text-accent" />
              Score
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ score.toFixed(0) }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Timer class="h-4 w-4 text-primary" />
              Time Left
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ Math.max(timeRemaining, 0) }}s</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Flame class="h-4 w-4 text-accent" />
              Combo
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">x{{ combo }}</p>
          </div>
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur">
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                  <Hammer class="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 class="text-4xl font-black tracking-tight text-foreground">Skull Crusher</h1>
                  <p class="text-sm text-muted-foreground">
                    Whack the goblins before they escape. Keep combos alive to climb the leaderboard.
                  </p>
                </div>
              </div>
              <div class="rounded-lg border border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
                Crush goblins as fast as you can. Higher levels spawn more foes and shorten their patience.
              </div>
            </div>

            <div class="relative mx-auto w-full max-w-4xl">
              <div class="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-black/60 via-slate-900/70 to-black/60 p-6 shadow-[inset_0_0_48px_rgba(0,0,0,0.55)]">
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(34,197,94,0.05),transparent_55%)]" />
                <div class="relative grid h-full w-full gap-2" :style="gridStyle">
                  <button
                    v-for="slot in gridSlots"
                    :key="slot.key"
                    type="button"
                    class="group relative isolate flex items-end justify-center overflow-hidden rounded-xl border border-border/40 bg-card/40 transition hover:border-primary/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent focus-visible:ring-offset-background"
                    :class="['holo-cell']"
                    @click="handleHit(slot.row, slot.col)"
                  >
                    <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-30" />
                    <transition-group name="goblin" tag="div">
                      <div
                        v-for="goblin in goblins.filter((g) => g.row === slot.row && g.col === slot.col)"
                        :key="goblin.id"
                        class="relative flex h-full w-full items-center justify-center"
                      >
                        <div
                          class="goblin relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-lime-500 via-green-600 to-emerald-700 shadow-[0_12px_24px_rgba(16,185,129,0.35)] ring-2 ring-lime-300/70"
                          :class="goblinStates[goblin.state]"
                          :style="goblinStyle(goblin)"
                        >
                          <Skull class="h-10 w-10 -translate-y-0.5 text-black/80 drop-shadow-[0_4px_6px_rgba(0,0,0,0.45)]" />
                          <div
                            v-if="goblin.state === 'hit'"
                            class="absolute inset-0 rounded-full bg-white/30 mix-blend-overlay animate-ping-slow"
                          />
                        </div>
                        <div class="absolute bottom-2 rounded-full border border-border/50 bg-card/70 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                          {{ goblin.state }}
                        </div>
                      </div>
                    </transition-group>
                  </button>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/70 px-3 py-1">
                  Level {{ currentLevel }}
                </span>
                <span class="hidden sm:inline">&bull;</span>
                <span>Speed: {{ (1000 / settings.spawnIntervalMs).toFixed(2) }} goblins/s</span>
                <span>&bull;</span>
                <span>Grid: {{ settings.rows }} x {{ settings.cols }}</span>
                <span v-if="settings.hitRadius > 0">&bull; Hammer reach: {{ settings.hitRadius }}</span>
              </div>

              <div class="flex items-center gap-3">
                <button
                  v-if="!isRunning"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent"
                  @click="startGame"
                >
                  <Hammer class="h-4 w-4" />
                  Start Crushing
                </button>
                <button
                  v-else
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md border border-destructive/60 bg-destructive/20 px-5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-destructive"
                  @click="endGame"
                >
                  Stop Round
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside class="rounded-xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          <header class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-foreground">War Table</h2>
            <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground">
              <Skull class="h-4 w-4 text-accent" />
              {{ skullResource.singular }}: {{ skullShards }}
            </div>
          </header>

          <div class="mt-4 space-y-4">
            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Round Stats</h3>
              <ul class="mt-2 space-y-1 text-xs">
                <li>Score: {{ score.toFixed(0) }}</li>
                <li>High Combo: {{ highCombo }}</li>
                <li>Missed Goblins: {{ misses }}</li>
                <li>Spawn Interval: {{ settings.spawnIntervalMs }} ms</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Tips</h3>
              <p class="mt-2 text-xs leading-relaxed">
                Goblins enter, taunt, and sprint. Keep combos alive for bonus points. Upgrade your hammer reach to smash multiple goblins at once.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.goblin-enter-active {
  animation: appear 0.14s ease-out forwards;
}

.goblin-leave-active {
  animation: vanish 0.12s ease-in forwards;
}

@keyframes appear {
  0% {
    opacity: 0;
    transform: scale(0.7) translateY(18px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes vanish {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  100% {
    opacity: 0;
    transform: scale(0.6) translateY(12px);
  }
}

.animate-slide-in {
  animation: slide-in 0.12s ease-out forwards;
}

@keyframes slide-in {
  from {
    transform: translateY(120%) scale(0.85);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

.animate-bob {
  animation: bob 0.8s ease-in-out infinite;
}

@keyframes bob {
  0%, 100% {
    transform: translateY(-2px) scale(1.02);
  }
  50% {
    transform: translateY(4px) scale(0.98);
  }
}

.animate-run-away {
  animation: run-away 0.22s ease-in forwards;
}

@keyframes run-away {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-110%) translateX(60%) scale(0.5);
    opacity: 0;
  }
}

.animate-crushing {
  animation: crushing 0.24s cubic-bezier(0.65, -0.3, 0.45, 1.4) forwards;
}

@keyframes crushing {
  0% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
  25% {
    transform: scale(1.2) translateY(-6px);
    opacity: 1;
  }
  55% {
    transform: scale(0.8) translateY(6px);
    opacity: 0.85;
  }
  75% {
    transform: scale(0.9) translateY(2px);
    opacity: 0.55;
  }
  100% {
    transform: scale(0.45) translateY(14px);
    opacity: 0;
  }
}

.animate-fade-out {
  animation: fade-out 0.2s ease-in forwards;
}

@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.animate-ping-slow {
  animation: ping-slow 0.7s ease-out forwards;
}

@keyframes ping-slow {
  0% {
    transform: scale(1);
    opacity: 0.45;
  }
  60% {
    transform: scale(1.25);
    opacity: 0.2;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.holo-cell::before {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: radial-gradient(circle at 30% 30%, rgba(34, 197, 94, 0.12), transparent 55%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.holo-cell:hover::before,
.holo-cell:focus-visible::before {
  opacity: 1;
}

.holo-cell {
  position: relative;
  transition: transform 0.12s ease;
}

.holo-cell:active {
  transform: scale(0.97);
}
</style>

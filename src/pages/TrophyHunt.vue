<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { addVictoryPoint, getVictoryPoints } from "@/lib/victory-points";
import { toast } from "@/composables/useToast";
import { ArrowLeft, Crosshair, Flame, Sparkles, Target, Timer, Trophy } from "lucide-vue-next";

type Phase = "ready" | "running" | "paused" | "completed";

interface Deer {
  id: string;
  x: number;
  y: number;
  speed: number;
  direction: 1 | -1;
  hit: boolean;
  createdAt: number;
}

interface ShotPing {
  id: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

const BOARD_WIDTH = 960;
const BOARD_HEIGHT = 540;
const CROSSHAIR_RADIUS = 22;
const HUNT_DURATION_MS = 75_000;

const router = useRouter();

const victoryPoints = ref(getVictoryPoints());
const phase = ref<Phase>("ready");
const score = ref(0);
const shotsFired = ref(0);
const shotsHit = ref(0);
const combo = ref(0);
const timeRemaining = ref(Math.round(HUNT_DURATION_MS / 1000));
const deerEscaped = ref(0);
const accuracy = computed(() => (shotsFired.value ? Math.round((shotsHit.value / shotsFired.value) * 100) : 0));

const aim = reactive({ x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 });
const deers = reactive<Deer[]>([]);
const shotPings = reactive<ShotPing[]>([]);
const floatingTexts = reactive<FloatingText[]>([]);

let animationHandle: number | null = null;
let lastFrameTime = performance.now();
let spawnAccumulator = 0;
let huntStart = 0;
let shootCooldownMs = 0;
const boardSurfaceRef = ref<HTMLDivElement | null>(null);

const goHome = () => {
  router.push("/");
};

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const actionButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";

const overlayTitle = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Enter Trophy Hunt";
    case "paused":
      return "Hunt Paused";
    case "completed":
      return timeRemaining.value <= 0 ? "Hunt Complete" : "Hunt Aborted";
    default:
      return "";
  }
});

const overlayDescription = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Take position behind the sights. Track the herd and drop as many deer as possible before the horn sounds.";
    case "paused":
      return "Hold steady. Resume the hunt when you are ready to fire.";
    case "completed":
      return "Gruntag tallies your trophies. Prepare for the next call when the herd returns.";
    default:
      return "";
  }
});

const overlayActionLabel = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Start Hunt";
    case "paused":
      return "Resume Hunt";
    case "completed":
      return "Hunt Again";
    default:
      return "Continue";
  }
});

const showOverlay = computed(() => phase.value !== "running");

const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(16).slice(2)}`;

const resetState = () => {
  deers.splice(0, deers.length);
  shotPings.splice(0, shotPings.length);
  floatingTexts.splice(0, floatingTexts.length);
  score.value = 0;
  shotsFired.value = 0;
  shotsHit.value = 0;
  combo.value = 0;
  deerEscaped.value = 0;
  timeRemaining.value = Math.round(HUNT_DURATION_MS / 1000);
  spawnAccumulator = 0;
  shootCooldownMs = 0;
};

const spawnDeer = () => {
  const direction = Math.random() < 0.5 ? 1 : -1;
  const yBand = BOARD_HEIGHT * (0.3 + Math.random() * 0.4);
  const startX = direction === 1 ? -80 : BOARD_WIDTH + 80;
  deers.push({
    id: randomId(),
    x: startX,
    y: yBand,
    speed: 140 + Math.random() * 70,
    direction,
    hit: false,
    createdAt: performance.now(),
  });
};

const removeDeer = (id: string) => {
  const index = deers.findIndex((d) => d.id === id);
  if (index >= 0) {
    deers.splice(index, 1);
  }
};

const spawnShotPing = (x: number, y: number) => {
  shotPings.push({
    id: randomId(),
    x,
    y,
    life: 0,
    maxLife: 280,
  });
};

const spawnFloatingText = (x: number, y: number, text: string, maxLife = 900) => {
  floatingTexts.push({
    id: randomId(),
    x,
    y,
    text,
    life: 0,
    maxLife,
  });
};

const handleShot = (event?: MouseEvent) => {
  if (phase.value !== "running") return;
  if (shootCooldownMs > 0) return;
  if (event) {
    handleAimMove(event);
  }
  shootCooldownMs = 220;
  shotsFired.value += 1;
  const board = boardSurfaceRef.value;
  let hit = false;
  if (board) {
    for (let i = deers.length - 1; i >= 0; i -= 1) {
      const deer = deers[i];
      const dx = deer.x - aim.x;
      const dy = deer.y - aim.y;
      if (Math.hypot(dx, dy) <= 42) {
        hit = true;
        shotsHit.value += 1;
        combo.value += 1;
        const earned = 120 + combo.value * 15;
        score.value += earned;
        spawnFloatingText(deer.x, deer.y - 26, `+${earned}`);
        spawnShotPing(aim.x, aim.y);
        removeDeer(deer.id);
      }
    }
  }
  if (!hit) {
    combo.value = 0;
    spawnShotPing(aim.x, aim.y);
    spawnFloatingText(aim.x, aim.y + 24, "MISS", 700);
  }
};

const updateShotPings = (deltaMs: number) => {
  for (let i = shotPings.length - 1; i >= 0; i -= 1) {
    const ping = shotPings[i];
    ping.life += deltaMs;
    if (ping.life >= ping.maxLife) {
      shotPings.splice(i, 1);
    }
  }
};

const updateFloatingTexts = (deltaMs: number) => {
  for (let i = floatingTexts.length - 1; i >= 0; i -= 1) {
    const text = floatingTexts[i];
    text.life += deltaMs;
    if (text.life >= text.maxLife) {
      floatingTexts.splice(i, 1);
    }
  }
};

const updateDeers = (deltaMs: number) => {
  for (let i = deers.length - 1; i >= 0; i -= 1) {
    const deer = deers[i];
    deer.x += deer.direction * deer.speed * (deltaMs / 1000);
    const outOfBounds =
      (deer.direction === 1 && deer.x > BOARD_WIDTH + 100) || (deer.direction === -1 && deer.x < -100);
    if (outOfBounds) {
      deers.splice(i, 1);
      deerEscaped.value += 1;
      combo.value = 0;
      spawnFloatingText(aim.x, Math.min(aim.y + 36, BOARD_HEIGHT - 40), "ESCAPED", 650);
    }
  }
};

const handleAimMove = (event: MouseEvent) => {
  const board = boardSurfaceRef.value;
  if (!board) return;
  const rect = board.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  aim.x = Math.min(Math.max(x, 0), BOARD_WIDTH);
  aim.y = Math.min(Math.max(y, 0), BOARD_HEIGHT);
};

const centerAim = () => {
  aim.x = BOARD_WIDTH / 2;
  aim.y = BOARD_HEIGHT / 2;
};

const updateTimers = (deltaMs: number) => {
  if (phase.value !== "running") return;
  const elapsedSinceStart = performance.now() - huntStart;
  const remaining = Math.max(0, HUNT_DURATION_MS - elapsedSinceStart);
  timeRemaining.value = Math.ceil(remaining / 1000);
  if (remaining <= 0) {
    finishHunt(true);
  }
};

const finishHunt = (success: boolean) => {
  if (phase.value !== "running") return;
  phase.value = "completed";
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
  if (success) {
    const newTotal = addVictoryPoint();
    victoryPoints.value = newTotal;
    toast({
      title: "Trophies Secured",
      description: `Gruntag awards you a victory point. Total VP: ${newTotal}`,
      variant: "success",
    });
  } else {
    toast({
      title: "Hunt Ended",
      description: "The forest fell silent. Ready your aim and try again.",
      variant: "default",
    });
  }
};

const updateLoop = (timestamp: number) => {
  if (phase.value !== "running") {
    animationHandle = null;
    return;
  }
  const deltaMs = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  shootCooldownMs = Math.max(0, shootCooldownMs - deltaMs);
  spawnAccumulator += deltaMs;

  const spawnInterval = Math.max(600, 1600 - (timestamp - huntStart) / 4);
  if (spawnAccumulator >= spawnInterval) {
    spawnAccumulator = 0;
    spawnDeer();
  }

  updateDeers(deltaMs);
  updateShotPings(deltaMs);
  updateFloatingTexts(deltaMs);
  updateTimers(deltaMs);

  animationHandle = requestAnimationFrame(updateLoop);
};

const startHunt = () => {
  resetState();
  phase.value = "running";
  huntStart = performance.now();
  lastFrameTime = huntStart;
  spawnAccumulator = 0;
  spawnDeer();
  animationHandle = requestAnimationFrame(updateLoop);
};

const resumeHunt = () => {
  if (phase.value !== "paused") return;
  phase.value = "running";
  lastFrameTime = performance.now();
  huntStart = performance.now() - (HUNT_DURATION_MS - timeRemaining.value * 1000);
  animationHandle = requestAnimationFrame(updateLoop);
};

const pauseHunt = () => {
  if (phase.value !== "running") return;
  phase.value = "paused";
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
};

const handleOverlayAction = () => {
  if (phase.value === "running") return;
  if (phase.value === "paused") {
    resumeHunt();
  } else {
    startHunt();
  }
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (phase.value === "running") {
      pauseHunt();
    } else if (phase.value === "paused") {
      resumeHunt();
    }
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onBeforeUnmount(() => {
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
  }
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-game)] p-4 md:p-8">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,10,10,0.6),transparent_70%)]" />
    <div class="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

    <div class="relative z-10 mx-auto max-w-6xl space-y-8">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="goHome">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Trophy class="h-4 w-4 text-accent" />
              Victory Points
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ victoryPoints.toLocaleString() }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Timer class="h-4 w-4 text-primary" />
              Time Left
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ timeRemaining }}s</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Target class="h-4 w-4 text-accent" />
              Score
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ score.toLocaleString() }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Crosshair class="h-4 w-4 text-primary" />
              Accuracy
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ accuracy }}%</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Sparkles class="h-4 w-4 text-accent" />
              Combo
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">x{{ combo }}</p>
          </div>
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur">
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 class="text-4xl font-black tracking-tight text-foreground md:text-5xl">Trophy Hunt</h1>
                <p class="text-sm text-muted-foreground">
                  Track the fleet-footed stags sprinting through the glade. Keep the sights steady, squeeze the trigger, and claim your trophies before dusk.
                </p>
              </div>
              <div class="rounded-lg border border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
                Deer Escaped: <span class="font-semibold text-foreground">{{ deerEscaped }}</span>
              </div>
            </div>

            <div class="relative flex justify-center">
              <div
                class="relative w-full max-w-[1120px] overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-black/70 p-6 shadow-[inset_0_0_48px_rgba(0,0,0,0.65)]"
              >
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.08),transparent_60%)]" />
                <div class="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px]" />

                <div
                  ref="boardSurfaceRef"
                  class="relative mx-auto h-[540px] w-[960px] select-none overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-black/70 shadow-[inset_0_0_36px_rgba(0,0,0,0.6)]"
                  style="cursor: none;"
                  @mousemove="handleAimMove"
                  @mousedown.prevent="handleShot($event)"
                  @mouseleave="centerAim"
                  @mouseenter="handleAimMove"
                >
                  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(15,118,110,0.06),transparent_65%)]" />

                  <div
                    v-for="deer in deers"
                    :key="deer.id"
                    class="deer-token absolute flex h-16 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                    :style="{ transform: `translate(${deer.x}px, ${deer.y}px)` }"
                  >
                    <div class="deer-body" />
                    <div class="deer-head" />
                    <div class="deer-antlers" />
                  </div>

                  <div
                    v-for="ping in shotPings"
                    :key="ping.id"
                    class="shot-ping absolute"
                    :style="{
                      transform: `translate(${ping.x}px, ${ping.y}px) translate(-50%, -50%)`,
                      opacity: 1 - ping.life / ping.maxLife,
                    }"
                  />

                  <div
                    v-for="text in floatingTexts"
                    :key="text.id"
                    class="floating-text absolute"
                    :style="{
                      transform: `translate(${text.x}px, ${text.y}px) translate(-50%, -50%) translateY(${(-30 * (text.life / text.maxLife)).toFixed(2)}px)`,
                      opacity: 1 - text.life / text.maxLife,
                    }"
                  >
                    {{ text.text }}
                  </div>

                  <div
                    class="crosshair absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                    :style="{ transform: `translate(${aim.x}px, ${aim.y}px)` }"
                  >
                    <div class="crosshair-ring" />
                    <div class="crosshair-dot" />
                  </div>

                  <div
                    v-if="showOverlay"
                    class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/85 text-center backdrop-blur"
                  >
                    <h2 class="text-2xl font-semibold text-foreground">{{ overlayTitle }}</h2>
                    <p class="mt-3 max-w-md text-sm text-muted-foreground">
                      {{ overlayDescription }}
                    </p>
                    <button type="button" :class="actionButtonClasses" class="mt-6" @click="handleOverlayAction">
                      {{ overlayActionLabel }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
              <div class="flex flex-wrap items-center gap-3">
                <span class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-foreground">
                  <Flame class="h-4 w-4 text-primary" />
                  Shots Fired: {{ shotsFired }}
                </span>
                <span>&bull;</span>
                <span>Hits: {{ shotsHit }}</span>
                <span>&bull;</span>
                <span>Current Combo: x{{ combo }}</span>
              </div>

              <button
                v-if="phase === 'running'"
                type="button"
                class="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                @click="pauseHunt"
              >
                Pause Hunt
              </button>
            </div>
          </div>
        </section>

        <aside class="rounded-xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          <header class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-foreground">Hunt Briefing</h2>
            <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground">
              <Crosshair class="h-4 w-4 text-primary" />
              Phase: {{ phase }}
            </div>
          </header>

          <div class="mt-4 space-y-4">
            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Controls</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Move the mouse across the glade to aim the crosshair.</li>
                <li>Click to fire your shot. Time the release to the lead of the deer.</li>
                <li>Press spacebar to pause or resume mid-hunt.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Tactics</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Deer sprint in both directions. Lead your shots and watch their lanes.</li>
                <li>Keep combos alive for bigger scores. Missed shots break the streak.</li>
                <li>Escaping deer reset your rhythm. Prioritise the closest runners.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Objective</h3>
              <p class="mt-2 text-xs leading-relaxed">
                Hunt until the horn sounds. Land enough shots to impress Gruntag and claim a victory point for your collection.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.deer-token {
  pointer-events: none;
}

.deer-body {
  height: 36px;
  width: 64px;
  border-radius: 9999px 9999px 24px 24px;
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.8), rgba(185, 104, 21, 0.85));
  box-shadow:
    0 8px 14px rgba(185, 104, 21, 0.4),
    inset 0 -6px 10px rgba(124, 45, 18, 0.55);
}

.deer-head {
  position: absolute;
  height: 28px;
  width: 24px;
  right: 4px;
  top: -18px;
  border-radius: 18px 18px 12px 12px;
  background: linear-gradient(135deg, rgba(254, 215, 170, 0.9), rgba(250, 204, 21, 0.85));
  box-shadow: inset 0 -4px 8px rgba(124, 45, 18, 0.4);
}

.deer-antlers {
  position: absolute;
  height: 22px;
  width: 32px;
  right: -2px;
  top: -32px;
  border-radius: 9999px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  clip-path: polygon(0 0, 45% 0, 64% 35%, 85% 0, 100% 0, 100% 100%, 0 100%);
  transform: rotate(4deg);
  opacity: 0.8;
}

.crosshair {
  pointer-events: none;
  mix-blend-mode: screen;
}

.crosshair-ring {
  height: 44px;
  width: 44px;
  border-radius: 9999px;
  border: 2px solid rgba(226, 232, 240, 0.75);
  box-shadow:
    0 0 16px rgba(59, 130, 246, 0.45),
    inset 0 0 12px rgba(226, 232, 240, 0.35);
}

.crosshair-dot {
  position: absolute;
  height: 6px;
  width: 6px;
  border-radius: 9999px;
  background: rgba(226, 232, 240, 0.95);
  box-shadow:
    0 0 8px rgba(255, 255, 255, 0.6),
    0 0 14px rgba(59, 130, 246, 0.25);
}

.shot-ping {
  height: 46px;
  width: 46px;
  border-radius: 9999px;
  border: 2px solid rgba(226, 232, 240, 0.6);
  box-shadow:
    0 0 18px rgba(226, 232, 240, 0.45),
    inset 0 0 12px rgba(59, 130, 246, 0.4);
}

.floating-text {
  pointer-events: none;
  font-weight: 700;
  font-size: 0.9rem;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.95);
  text-shadow:
    0 0 12px rgba(34, 211, 238, 0.5),
    0 0 22px rgba(226, 232, 240, 0.7);
  letter-spacing: 0.15em;
}
</style>

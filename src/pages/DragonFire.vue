<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import { toast } from "@/composables/useToast";
import { ArrowLeft, Flame, Shield, Sparkles, Timer, Trophy, Zap } from "lucide-vue-next";

type Phase = "ready" | "running" | "victory" | "defeat";

interface FireStream {
  id: string;
  lane: number;
  progress: number;
  speed: number;
  intensity: number;
  state: "flying" | "deflected" | "burned";
  life: number;
}

interface RuneState {
  active: boolean;
  timer: number;
}

const router = useRouter();

const laneConfigs: Array<{ id: number; label: string; key: string }> = [
  { id: 0, label: "Auric Sigil", key: "Q" },
  { id: 1, label: "Blaze Sigil", key: "W" },
  { id: 2, label: "Ember Sigil", key: "E" },
  { id: 3, label: "Ash Sigil", key: "R" },
];

const laneKeyMap = laneConfigs.reduce((acc, lane) => {
  acc[lane.key.toLowerCase()] = lane.id;
  return acc;
}, {} as Record<string, number>);

const phase = ref<Phase>("ready");
const DRAGON_RESOURCE_KEY = "dragonFire" as const;
const emberResource = RESOURCES[DRAGON_RESOURCE_KEY];
const emberShards = ref(getResourceCount(DRAGON_RESOURCE_KEY));
const barrierIntegrity = ref(100);
const deflectedCount = ref(0);
const combo = ref(0);
const highestCombo = ref(0);
const elapsedMs = ref(0);
const statusMessage = ref("Streams emerge early - hit them when the rune flares gold within the glowing band.");

const streams = reactive<FireStream[]>([]);
const runeStates = reactive<RuneState[]>(laneConfigs.map(() => ({ active: false, timer: 0 })));

const timeLimitMs = 60_000;
const PREVIEW_START_PROGRESS = -0.55;
const HIT_WINDOW_START = 0.78;
const HIT_WINDOW_END = 0.9;
const EARLY_PENALTY = 3;
const LATE_PENALTY = 5;

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";
const actionButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";

const wardPercent = computed(() => Math.max(0, Math.round(barrierIntegrity.value)));
const timeProgressPercent = computed(() =>
  Math.min(100, Math.round((elapsedMs.value / timeLimitMs) * 100))
);
const elapsedSeconds = computed(() =>
  Math.min(timeLimitMs / 1000, Math.floor(elapsedMs.value / 1000))
);
const timeRemaining = computed(() =>
  Math.max(0, Math.ceil((timeLimitMs - elapsedMs.value) / 1000))
);
const overlayVisible = computed(() => phase.value !== "running");
const threatLevel = computed(() => {
  const ward = wardPercent.value;
  if (ward <= 20) return { label: "critical", class: "text-rose-400" };
  if (ward <= 55) return { label: "strained", class: "text-amber-300" };
  return { label: "stable", class: "text-emerald-300" };
});

const overlayTitle = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Flames Conquered";
    case "defeat":
      return "Ward Broken";
    default:
      return "Dragon Fire";
  }
});

const overlaySubtitle = computed(() => {
  switch (phase.value) {
    case "victory":
      return "You bent the dragon's breath back upon itself. The forge glows brighter with your legend.";
    case "defeat":
      return "The ward collapsed under the torrent. Steady your focus and try again.";
    default:
      return "Align the sigils (Q / W / E / R) as the flames descend. Hold focus for the full 60 seconds while keeping the ward intact.";
  }
});

const overlayButtonLabel = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Run the Ritual Again";
    case "defeat":
      return "Retry the Defense";
    default:
      return "Begin the Ritual";
  }
});

const successMessages = [
  "Rune aligned! The torrent bends.",
  "Sigil pulses - flame redirected.",
  "Channel steady! Fire diverted.",
  "The ward hums as the flame recoils.",
];

const failureMessages = [
  "Rune misfire! Flux destabilizes.",
  "Static surge - sigil faltered.",
  "Focus slips and the ward strains.",
  "The glyph fizzles. Regain rhythm!",
];

const impactMessages = [
  "Scorch marks snake across the ward!",
  "Flames lash the barrier - hold steady!",
  "The ward buckles under the heat!",
];

const earlyMessages = [
  "Too soon! Hold the channel a breath longer.",
  "Sigil flickers. Wait for the strike zone.",
  "Premature surge destabilizes the glyph.",
];

const lateMessages = [
  "The flame slips past - react faster!",
  "Timing lagged. The torrent clips the ward.",
  "Almost caught it. Keep your rhythm sharp.",
];

let animationHandle: number | null = null;
let lastTimestamp = 0;
let spawnAccumulator = 0;
let streamSeed = 0;
let lastLane = -1;
let pointGranted = false;

const cancelAnimation = () => {
  if (animationHandle !== null) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
};

const resetState = () => {
  cancelAnimation();
  deflectedCount.value = 0;
  combo.value = 0;
  highestCombo.value = 0;
  barrierIntegrity.value = 100;
  elapsedMs.value = 0;
  statusMessage.value = "Streams emerge early - hit them when the rune flares gold within the glowing band.";
  streams.splice(0, streams.length);
  runeStates.forEach((rune) => {
    rune.active = false;
    rune.timer = 0;
  });
  spawnAccumulator = 0;
  lastLane = -1;
  pointGranted = false;
};

const getSpawnInterval = () =>
  Math.max(650, 1600 - deflectedCount.value * 32 - Math.floor(elapsedMs.value / 1000) * 4);

const spawnStream = () => {
  if (streams.length >= 10) return;
  const available = laneConfigs.filter((lane) => lane.id !== lastLane);
  const chosen = available[Math.floor(Math.random() * available.length)];
  lastLane = chosen.id;
  streamSeed += 1;

  streams.push({
    id: `stream-${streamSeed}`,
    lane: chosen.id,
    progress: PREVIEW_START_PROGRESS,
    speed: 0.38 + Math.random() * 0.12 + deflectedCount.value * 0.012,
    intensity: 10 + Math.floor(deflectedCount.value / 4) + Math.floor(Math.random() * 4),
    state: "flying",
    life: 0,
  });
};

const updateRuneStates = (deltaMs: number) => {
  runeStates.forEach((rune) => {
    if (rune.timer > 0) {
      rune.timer = Math.max(0, rune.timer - deltaMs);
      if (rune.timer === 0) {
        rune.active = false;
      }
    }
  });
};

const endGame = (result: "victory" | "defeat") => {
  if (phase.value !== "running") return;
  phase.value = result;
  cancelAnimation();
  if (result === "victory") {
    statusMessage.value = "The dragon's breath yields to your mastery.";
  } else {
    statusMessage.value = "The ward collapses in flame. Regroup and return.";
  }
};

const updateStreams = (deltaMs: number) => {
  for (let index = streams.length - 1; index >= 0; index -= 1) {
    const stream = streams[index];
    if (stream.state === "flying") {
      stream.progress += (stream.speed * deltaMs) / 1000;
      if (stream.progress >= 1) {
        stream.state = "burned";
        stream.life = 260;
        stream.progress = 1;
        combo.value = 0;
        barrierIntegrity.value = Math.max(0, barrierIntegrity.value - stream.intensity);
        statusMessage.value = impactMessages[Math.floor(Math.random() * impactMessages.length)];
        if (barrierIntegrity.value <= 0) {
          statusMessage.value = "The ward is consumed by the inferno!";
          endGame("defeat");
          return;
        }
      }
    } else {
      stream.life -= deltaMs;
      if (stream.life <= 0) {
        streams.splice(index, 1);
        continue;
      }

      if (stream.state === "deflected") {
        stream.progress = Math.max(-0.35, stream.progress - (deltaMs / 1000) * 0.9);
      }
    }
  }
};

const loop = (timestamp: number) => {
  if (phase.value !== "running") {
    animationHandle = null;
    return;
  }

  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }

  const delta = Math.min(120, timestamp - lastTimestamp);
  lastTimestamp = timestamp;
  elapsedMs.value += delta;

  if (elapsedMs.value >= timeLimitMs) {
    if (barrierIntegrity.value > 0) {
      endGame("victory");
    } else {
      endGame("defeat");
    }
    return;
  }

  spawnAccumulator += delta;
  let interval = getSpawnInterval();
  while (spawnAccumulator >= interval) {
    spawnAccumulator -= interval;
    spawnStream();
    interval = getSpawnInterval();
  }

  updateRuneStates(delta);
  updateStreams(delta);

  animationHandle = requestAnimationFrame(loop);
};

const triggerRune = (laneId: number) => {
  if (phase.value !== "running") return;

  const rune = runeStates[laneId];
  rune.active = true;
  rune.timer = 220;

  let candidate: FireStream | null = null;
  for (const stream of streams) {
    if (stream.lane !== laneId || stream.state !== "flying") continue;
    if (stream.progress < 0.3 || stream.progress > 1.05) continue;
    if (!candidate || stream.progress > candidate.progress) {
      candidate = stream;
    }
  }

  if (candidate) {
    if (candidate.progress >= HIT_WINDOW_START && candidate.progress <= HIT_WINDOW_END) {
      candidate.state = "deflected";
      candidate.life = 320;
      candidate.progress = Math.min(candidate.progress, 0.92);
      deflectedCount.value += 1;
      combo.value += 1;
      highestCombo.value = Math.max(highestCombo.value, combo.value);
      statusMessage.value = successMessages[Math.floor(Math.random() * successMessages.length)];

    } else if (candidate.progress < HIT_WINDOW_START) {
      combo.value = 0;
      barrierIntegrity.value = Math.max(0, barrierIntegrity.value - EARLY_PENALTY);
      statusMessage.value = earlyMessages[Math.floor(Math.random() * earlyMessages.length)];
      if (barrierIntegrity.value <= 0) {
        statusMessage.value = "The ward splinters under the mistimed surge!";
        endGame("defeat");
      }
    } else {
      candidate.state = "burned";
      candidate.life = 320;
      candidate.progress = 1;
      combo.value = 0;
      barrierIntegrity.value = Math.max(0, barrierIntegrity.value - LATE_PENALTY);
      statusMessage.value = lateMessages[Math.floor(Math.random() * lateMessages.length)];
      if (barrierIntegrity.value <= 0) {
        statusMessage.value = "The ward splinters under the mistimed surge!";
        endGame("defeat");
      }
    }
  } else {
    combo.value = 0;
    barrierIntegrity.value = Math.max(0, barrierIntegrity.value - 4);
    statusMessage.value = failureMessages[Math.floor(Math.random() * failureMessages.length)];
    if (barrierIntegrity.value <= 0) {
      statusMessage.value = "The ward splinters under the stray flame!";
      endGame("defeat");
    }
  }
};

const getStreamsForLane = (laneId: number) => streams.filter((stream) => stream.lane === laneId);

const getStreamClasses = (stream: FireStream) => {
  const classes = ["fire-stream", stream.state];
  if (stream.state === "flying") {
    if (stream.progress >= HIT_WINDOW_START && stream.progress <= HIT_WINDOW_END) {
      classes.push("ready");
    } else if (stream.progress >= HIT_WINDOW_START - 0.08 && stream.progress < HIT_WINDOW_START) {
      classes.push("prepare");
    }
  }
  return classes;
};

const getStreamStyle = (stream: FireStream) => {
  const baseScale = 0.85 + stream.intensity / 40;
  if (stream.state === "flying") {
    const offsetProgress = stream.progress + 0.17;
    return {
      top: `${offsetProgress * 100}%`,
      "--stream-scale": baseScale.toFixed(2),
    };
  }

  const fade = Math.max(0, Math.min(1, stream.life / 280));
  const top = stream.state === "burned" ? 102 : stream.progress * 120;
  return {
    top: `${top}%`,
    opacity: fade,
    "--stream-scale": baseScale.toFixed(2),
  };
};

const startGame = () => {
  if (phase.value === "running") return;
  resetState();
  phase.value = "running";
  lastTimestamp = 0;
  animationHandle = requestAnimationFrame(loop);
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();

  if (overlayVisible.value && key === "enter") {
    event.preventDefault();
    startGame();
    return;
  }

  const lane = laneKeyMap[key];
  if (lane !== undefined) {
    event.preventDefault();
    triggerRune(lane);
  }
};

watch(
  () => phase.value,
  (next) => {
    if (next === "running") {
      emberShards.value = getResourceCount(DRAGON_RESOURCE_KEY);
    }

    if (next === "victory" && !pointGranted) {
      emberShards.value = addResource(DRAGON_RESOURCE_KEY);
      pointGranted = true;
      toast({
        title: `${emberResource.plural} Secured`,
        description: `Flame bows to your command. ${emberResource.singular} captured.`,
        variant: "success",
      });
    }
  }
);

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  emberShards.value = getResourceCount(DRAGON_RESOURCE_KEY);
});

onBeforeUnmount(() => {
  cancelAnimation();
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-slate-950 py-10">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(239,68,68,0.12),_transparent_55%)]" />

    <main class="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 lg:flex-row lg:items-start">
      <div class="flex-1 space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" :class="backButtonClasses" @click="router.push('/')">
            <ArrowLeft class="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Return
          </button>

          <div class="flex items-center gap-2 rounded-lg border border-primary/30 bg-card/80 px-4 py-2 text-sm text-foreground backdrop-blur">
            <Trophy class="h-5 w-5 text-accent" />
            <div class="flex flex-col leading-tight text-right">
              <span class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ emberResource.plural }}</span>
              <span class="text-lg font-semibold text-foreground">{{ emberShards }}</span>
            </div>
          </div>
        </div>

        <div class="relative overflow-hidden rounded-3xl border border-primary/15 bg-slate-900/70 shadow-[0_20px_60px_rgba(15,23,42,0.55)] backdrop-blur">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(14,116,144,0.12),_transparent_55%)]" />
          <div class="relative">
            <div class="flex items-center justify-between px-6 py-5">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.35em] text-primary/70">
                  Dragon Fire
                </p>
                <h1 class="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Sigil Convergence
                </h1>
              </div>
              <div class="max-w-xs text-right">
                <p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Status Feed
                </p>
                <p class="mt-1 text-sm font-medium text-foreground">
                  {{ statusMessage }}
                </p>
              </div>
            </div>

            <div class="relative px-6 pb-10 pt-4">
              <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div
                  v-for="lane in laneConfigs"
                  :key="lane.id"
                  :class="['rune-card', runeStates[lane.id].active ? 'rune-card-active' : '']"
                >
                  <div class="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span>{{ lane.label }}</span>
                    <span class="rune-key">{{ lane.key }}</span>
                  </div>
                  <div class="rune-lane">
                    <div class="flow-channel" />
                    <div class="hit-zone" />
                    <div
                      v-for="stream in getStreamsForLane(lane.id)"
                      :key="stream.id"
                      :class="getStreamClasses(stream)"
                      :style="getStreamStyle(stream)"
                    />
                  </div>
                  <p class="rune-glyph">Channel</p>
                </div>
              </div>

              <div
                v-if="overlayVisible"
                class="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 backdrop-blur-md"
              >
                <div class="flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-primary/30 bg-slate-900/80 px-10 py-12 text-center shadow-[0_30px_80px_rgba(14,23,42,0.65)]">
                  <Sparkles class="h-10 w-10 text-accent" />
                  <h2 class="text-2xl font-bold text-foreground sm:text-3xl">
                    {{ overlayTitle }}
                  </h2>
                  <p class="text-sm text-muted-foreground sm:text-base">
                    {{ overlaySubtitle }}
                  </p>
                  <button type="button" :class="actionButtonClasses" @click="startGame">
                    {{ overlayButtonLabel }}
                  </button>
                  <p class="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                    Press Enter to {{ phase === 'ready' ? 'Begin' : 'Restart' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside class="flex w-full max-w-md flex-col gap-6">
        <div class="rounded-3xl border border-primary/15 bg-slate-900/70 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur">
          <h2 class="text-lg font-semibold text-foreground">Ritual Diagnostics</h2>
          <div class="mt-4 space-y-5">
            <div>
              <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span class="flex items-center gap-2">
                  <Shield class="h-4 w-4 text-emerald-400" />
                  Ward Integrity
                </span>
                <span class="text-sm text-foreground">{{ wardPercent }}%</span>
              </div>
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 transition-all duration-300"
                  :style="{ width: `${wardPercent}%` }"
                />
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span class="flex items-center gap-2">
                  <Timer class="h-4 w-4 text-amber-300" />
                  Ritual Duration
                </span>
                <span class="text-sm text-foreground">{{ elapsedSeconds }}s / 60s</span>
              </div>
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-orange-400 via-rose-500 to-purple-500 transition-all duration-300"
                  :style="{ width: `${timeProgressPercent}%` }"
                />
              </div>
            </div>

            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 text-muted-foreground">
                <Flame class="h-4 w-4 text-orange-400" />
                Fires Deflected
              </span>
              <span class="font-semibold text-foreground">{{ deflectedCount }}</span>
            </div>

            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 text-muted-foreground">
                <Zap class="h-4 w-4 text-sky-400" />
                Max Combo
              </span>
              <span class="font-semibold text-foreground">{{ highestCombo }}</span>
            </div>

            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 text-muted-foreground">
                <Timer class="h-4 w-4 text-amber-300" />
                Time Remaining
              </span>
              <span class="font-semibold text-foreground">{{ timeRemaining }}s</span>
            </div>

            <div class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 text-muted-foreground">
                <Sparkles class="h-4 w-4 text-purple-300" />
                Threat Level
              </span>
              <span :class="['font-semibold uppercase tracking-wide', threatLevel.class]">
                {{ threatLevel.label.toUpperCase() }}
              </span>
            </div>
          </div>
        </div>

        <div class="rounded-3xl border border-primary/15 bg-slate-900/60 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur">
          <h3 class="text-lg font-semibold text-foreground">Battle Briefing</h3>
          <ul class="mt-4 space-y-4 text-sm text-muted-foreground">
            <li class="flex items-start gap-3">
              <span class="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-xs font-bold tracking-[0.25em] text-primary">
                1
              </span>
              <p>Press <strong>Q/W/E/R</strong> to channel the matching sigil when a flame nears the ward.</p>
            </li>
            <li class="flex items-start gap-3">
              <span class="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-xs font-bold tracking-[0.25em] text-primary">
                2
              </span>
              <p>Hold out for <strong>60 seconds</strong> while keeping the ward from collapsing.</p>
            </li>
            <li class="flex items-start gap-3">
              <span class="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-xs font-bold tracking-[0.25em] text-primary">
                3
              </span>
              <p>The glowing hit zone is tight; mistiming drains the ward fast. Keep your combo alive for speed.</p>
            </li>
          </ul>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.rune-card {
  position: relative;
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(12, 10, 22, 0.85), rgba(30, 41, 59, 0.82));
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 1.25rem 1.1rem;
  box-shadow:
    0 18px 40px rgba(15, 23, 42, 0.55),
    inset 0 1px 0 rgba(148, 163, 184, 0.2);
  overflow: hidden;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.rune-card::before {
  content: "";
  position: absolute;
  inset: -35% -20%;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.16), transparent 65%);
  opacity: 0.55;
  transform: scale(0.95);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.rune-card-active {
  border-color: rgba(125, 211, 252, 0.45);
  box-shadow:
    0 24px 42px rgba(56, 189, 248, 0.28),
    inset 0 1px 0 rgba(148, 163, 184, 0.25);
  transform: translateY(-6px);
}

.rune-card-active::before {
  opacity: 0.8;
  transform: scale(1.08);
}

.rune-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  padding: 0.25rem 0.75rem;
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  background: rgba(148, 163, 184, 0.12);
  color: rgba(226, 232, 240, 0.86);
}

.rune-lane {
  position: relative;
  margin-top: 1rem;
  height: 16rem;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.7));
  border: 1px solid rgba(148, 163, 184, 0.22);
  overflow: hidden;
  box-shadow:
    inset 0 0 30px rgba(15, 23, 42, 0.55),
    inset 0 -34px 54px rgba(124, 58, 237, 0.14);
}

.rune-lane::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.2), rgba(148, 163, 184, 0.08));
}

.flow-channel {
  position: absolute;
  inset: 16px 18px;
  border-radius: 9999px;
  border: 1px dashed rgba(250, 204, 21, 0.22);
}

.hit-zone {
  position: absolute;
  bottom: 18px;
  left: 18px;
  right: 18px;
  height: 28px;
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(248, 113, 113, 0.08), rgba(249, 115, 22, 0.32));
  border: 1px solid rgba(248, 113, 113, 0.45);
  box-shadow:
    0 0 20px rgba(248, 113, 113, 0.28),
    inset 0 0 12px rgba(250, 204, 21, 0.28);
  animation: hit-zone-glow 1s ease-in-out infinite alternate;
}

.fire-stream {
  position: absolute;
  left: 50%;
  height: 38px;
  width: 38px;
  border-radius: 9999px;
  background: radial-gradient(circle at 35% 25%, rgba(253, 224, 71, 0.95), rgba(248, 113, 113, 0.78));
  box-shadow:
    0 0 16px rgba(248, 113, 113, 0.45),
    0 0 26px rgba(244, 63, 94, 0.3);
  transform: translate(-50%, -50%) scale(var(--stream-scale, 1));
  transition:
    transform 0.08s linear,
    opacity 0.18s ease,
    box-shadow 0.12s ease,
    background 0.12s ease;
}

.fire-stream::after {
  content: "";
  position: absolute;
  inset: 10px;
  border-radius: 9999px;
  background: radial-gradient(circle at 50% 50%, rgba(252, 211, 77, 0.75), rgba(220, 38, 38, 0.55));
  filter: blur(5px);
}

.fire-stream.prepare {
  box-shadow:
    0 0 18px rgba(252, 211, 77, 0.45),
    0 0 30px rgba(248, 113, 113, 0.35);
}

.fire-stream.ready {
  background: radial-gradient(circle at 45% 35%, rgba(253, 224, 71, 1), rgba(249, 115, 22, 0.9));
  box-shadow:
    0 0 30px rgba(249, 115, 22, 0.6),
    0 0 42px rgba(251, 191, 36, 0.5);
  transform: translate(-50%, -50%) scale(calc(var(--stream-scale, 1) * 1.18));
}

.fire-stream.ready::before {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 9999px;
  border: 2px solid rgba(253, 224, 71, 0.6);
  box-shadow: 0 0 18px rgba(253, 224, 71, 0.5);
  animation: ready-pulse 0.4s ease-in-out infinite alternate;
}

.fire-stream.deflected {
  background: radial-gradient(circle at 40% 30%, rgba(165, 243, 252, 0.95), rgba(37, 99, 235, 0.82));
  box-shadow:
    0 0 24px rgba(37, 99, 235, 0.55),
    0 0 40px rgba(165, 243, 252, 0.35);
}

.fire-stream.burned {
  background: radial-gradient(circle at 40% 40%, rgba(248, 113, 113, 0.95), rgba(185, 28, 28, 0.75));
  box-shadow:
    0 0 26px rgba(248, 113, 113, 0.55),
    0 0 38px rgba(185, 28, 28, 0.32);
}

.fire-stream.burned::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(252, 165, 165, 0.4), transparent 70%);
  filter: blur(4px);
}

.fire-stream.deflected::before {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 9999px;
  border: 2px solid rgba(191, 219, 254, 0.55);
  box-shadow: 0 0 18px rgba(191, 219, 254, 0.55);
}

@keyframes ready-pulse {
  from {
    opacity: 0.6;
    transform: scale(1);
  }
  to {
    opacity: 0.9;
    transform: scale(1.08);
  }
}

@keyframes hit-zone-glow {
  from {
    opacity: 0.6;
    box-shadow:
      0 0 16px rgba(248, 113, 113, 0.24),
      inset 0 0 10px rgba(250, 204, 21, 0.2);
  }
  to {
    opacity: 0.85;
    box-shadow:
      0 0 26px rgba(248, 113, 113, 0.34),
      inset 0 0 16px rgba(250, 204, 21, 0.32);
  }
}

.rune-glyph {
  margin-top: 1.1rem;
  text-align: center;
  font-size: 0.75rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.68);
}
</style>


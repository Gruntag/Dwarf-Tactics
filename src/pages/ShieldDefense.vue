<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import { toast } from "@/composables/useToast";
import { ArrowLeft, Flame, ShieldCheck, Sparkles, Timer, Trophy } from "lucide-vue-next";

type Phase = "ready" | "running" | "paused" | "completed";
type EnemyState = "idle" | "telegraph" | "attack" | "cooldown";
type BlockState = "lowered" | "raising" | "raised" | "breaking";

const TOTAL_WAVES = 6;
const BASE_ATTACK_INTERVAL = 3500;
const BASE_ATTACK_WINDOW = 1100;
const BLOCK_DRAIN_PER_SECOND = 24;
const BLOCK_REGEN_PER_SECOND = 18;
const COOLDOWN_BONUS = 400;

const router = useRouter();

const phase = ref<Phase>("ready");
const currentWave = ref(1);
const SHIELD_RESOURCE_KEY = "shieldDefense" as const;
const shieldResource = RESOURCES[SHIELD_RESOURCE_KEY];
const bulwarkSigils = ref(getResourceCount(SHIELD_RESOURCE_KEY));
const timeRemaining = ref(90);
const stamina = ref(100);
const maxStamina = ref(100);
const shieldIntegrity = ref(100);
const blocksSuccessful = ref(0);
const blocksFailed = ref(0);
const combo = ref(0);
const highestCombo = ref(0);

const enemyState = ref<EnemyState>("idle");
const enemyTelegraphPercent = ref(0);
const blockState = ref<BlockState>("lowered");
const blockHolding = ref(false);

const overlayVisible = computed(() => phase.value !== "running");
const staminaPercent = computed(() => Math.max(0, Math.min(100, stamina.value)));
const integrityPercent = computed(() => Math.max(0, Math.min(100, shieldIntegrity.value)));
const timeLeftLabel = computed(() => Math.max(0, timeRemaining.value));
const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";
const actionButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";

const overlayTitle = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Shield Defense";
    case "paused":
      return "Defense Paused";
    case "completed":
      return shieldIntegrity.value > 0 ? "Defense Successful" : "Shield Shattered";
    default:
      return "";
  }
});

const overlayDescription = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Face Gruntag's elite attacker. Raise your shield during telegraphed strikes and keep stamina in reserve.";
    case "paused":
      return "Your guard eases. Take a breath, then rejoin the defense.";
    case "completed":
      return shieldIntegrity.value > 0
        ? "You blocked every strike. Gruntag acknowledges your iron resolve."
        : "Your shield splintered under the assault. Train and return stronger.";
    default:
      return "";
  }
});

const overlayAction = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Begin Defense";
    case "paused":
      return "Resume";
    case "completed":
      return "Defend Again";
    default:
      return "Continue";
  }
});

let animationHandle: number | null = null;
let lastFrame = performance.now();
let previousLoopTimestamp = performance.now();
let waveStartTime = performance.now();
let attackWindowMs = BASE_ATTACK_WINDOW;
let nextAttackInMs = BASE_ATTACK_INTERVAL;
let huntTimerHandle: number | null = null;

const resetState = () => {
  currentWave.value = 1;
  bulwarkSigils.value = getResourceCount(SHIELD_RESOURCE_KEY);
  timeRemaining.value = 90;
  stamina.value = 100;
  shieldIntegrity.value = 100;
  blocksSuccessful.value = 0;
  blocksFailed.value = 0;
  combo.value = 0;
  highestCombo.value = 0;
  enemyState.value = "idle";
  enemyTelegraphPercent.value = 0;
  blockState.value = "lowered";
  blockHolding.value = false;
  attackWindowMs = BASE_ATTACK_WINDOW;
  nextAttackInMs = BASE_ATTACK_INTERVAL;
  waveStartTime = performance.now();
};

const updateStamina = (deltaMs: number) => {
  if (blockHolding.value) {
    stamina.value = Math.max(0, stamina.value - (BLOCK_DRAIN_PER_SECOND * deltaMs) / 1000);
    if (stamina.value <= 0) {
      blockState.value = "breaking";
      blockHolding.value = false;
    } else if (blockState.value === "lowered") {
      blockState.value = "raising";
    }
  } else if (phase.value === "running" && stamina.value < maxStamina.value) {
    stamina.value = Math.min(maxStamina.value, stamina.value + (BLOCK_REGEN_PER_SECOND * deltaMs) / 1000);
    if (blockState.value === "raising") {
      blockState.value = "raised";
    } else if (blockState.value === "breaking") {
      blockState.value = "lowered";
    }
  }
};

const applyBlockToggle = (holding: boolean) => {
  if (phase.value !== "running") return;
  blockHolding.value = holding;
  if (!holding && blockState.value !== "breaking") {
    blockState.value = "lowered";
  } else if (holding && blockState.value === "lowered" && stamina.value > 0) {
    blockState.value = "raising";
  }
};

const startTimer = () => {
  const tick = () => {
    if (phase.value !== "running") return;
    const elapsed = Math.floor((performance.now() - waveStartTime) / 1000);
    timeRemaining.value = Math.max(0, 90 - elapsed);
    if (timeRemaining.value <= 0) {
      completeDefense(true);
      return;
    }
    huntTimerHandle = window.setTimeout(tick, 1000);
  };
  if (huntTimerHandle) window.clearTimeout(huntTimerHandle);
  huntTimerHandle = window.setTimeout(tick, 1000);
};

const stopTimer = () => {
  if (huntTimerHandle) {
    window.clearTimeout(huntTimerHandle);
    huntTimerHandle = null;
  }
};

const scheduleNextAttack = () => {
  const waveFactor = currentWave.value / TOTAL_WAVES;
  const randomVariance = 400 + Math.random() * 400;
  nextAttackInMs = Math.max(1400, BASE_ATTACK_INTERVAL - waveFactor * 600 - combo.value * 40 + randomVariance);
  attackWindowMs = Math.max(350, BASE_ATTACK_WINDOW - waveFactor * 200);
};

const beginTelegraph = () => {
  enemyState.value = "telegraph";
  enemyTelegraphPercent.value = 0;
};

const resolveAttack = () => {
  if (blockHolding.value && stamina.value > 0 && blockState.value !== "breaking") {
    blocksSuccessful.value += 1;
    combo.value += 1;
    highestCombo.value = Math.max(highestCombo.value, combo.value);
    toast({
      title: "Shield Impact",
      description: `Block absorbed the strike. Combo x${combo.value}`,
      variant: "success",
    });
  } else {
    blocksFailed.value += 1;
    combo.value = 0;
    shieldIntegrity.value = Math.max(0, shieldIntegrity.value - 18 - currentWave.value * 4);
    toast({
      title: "Shield Breached",
      description: "You failed to block the attack. Integrity dropped.",
      variant: "destructive",
    });
    if (shieldIntegrity.value <= 0) {
      completeDefense(false);
      return;
    }
  }
  enemyState.value = "cooldown";
  scheduleNextAttack();
};

const updateEnemy = (deltaMs: number) => {
  switch (enemyState.value) {
    case "telegraph": {
      const progress = enemyTelegraphPercent.value + (deltaMs / attackWindowMs) * 100;
      enemyTelegraphPercent.value = Math.min(100, progress);
      if (enemyTelegraphPercent.value >= 100) {
        enemyState.value = "attack";
        resolveAttack();
      }
      break;
    }
    case "cooldown": {
      nextAttackInMs -= deltaMs;
      if (nextAttackInMs <= 0) {
        enemyState.value = "idle";
      }
      break;
    }
    case "idle": {
      nextAttackInMs -= deltaMs;
      if (nextAttackInMs <= 0) {
        beginTelegraph();
      }
      break;
    }
    default:
      break;
  }
};

const updateLoop = (timestamp: number) => {
  if (phase.value !== "running") {
    animationHandle = null;
    return;
  }
  const deltaMs = timestamp - lastFrame;
  lastFrame = timestamp;
  updateStamina(deltaMs);
  updateEnemy(deltaMs);
  animationHandle = requestAnimationFrame(updateLoop);
};

const startDefense = () => {
  resetState();
  phase.value = "running";
  lastFrame = performance.now();
  previousLoopTimestamp = lastFrame;
  waveStartTime = performance.now();
  scheduleNextAttack();
  startTimer();
  animationHandle = requestAnimationFrame(updateLoop);
};

const resumeDefense = () => {
  if (phase.value !== "paused") return;
  phase.value = "running";
  lastFrame = performance.now();
  startTimer();
  animationHandle = requestAnimationFrame(updateLoop);
};

const pauseDefense = () => {
  if (phase.value !== "running") return;
  phase.value = "paused";
  stopTimer();
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
};

const completeDefense = (success: boolean) => {
  if (phase.value === "completed") return;
  phase.value = "completed";
  stopTimer();
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
  if (success) {
    const newTotal = addResource(SHIELD_RESOURCE_KEY);
    bulwarkSigils.value = newTotal;
    toast({
      title: "Shield Unbroken",
      description: `You endured every strike. ${shieldResource.singular} awarded. Total ${shieldResource.plural}: ${newTotal}`,
      variant: "success",
    });
  } else {
    toast({
      title: "Shield Destroyed",
      description: "The final impact shattered the defense. Reforge and try again.",
      variant: "destructive",
    });
  }
};

const handleOverlayAction = () => {
  if (phase.value === "paused") {
    resumeDefense();
  } else {
    startDefense();
  }
};

const handleBlockDown = () => applyBlockToggle(true);
const handleBlockUp = () => applyBlockToggle(false);

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (phase.value === "running") {
      pauseDefense();
    } else if (phase.value === "paused") {
      resumeDefense();
    }
  } else if (event.code === "KeyS") {
    handleBlockDown();
  }
};

const handleKeyUp = (event: KeyboardEvent) => {
  if (event.code === "KeyS") {
    handleBlockUp();
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
  stopTimer();
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
  }
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-game)] p-4 md:p-8">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,10,10,0.6),transparent_70%)]" />
    <div class="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

    <div class="relative z-10 mx-auto max-w-6xl space-y-8">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="router.push('/')">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Trophy class="h-4 w-4 text-accent" />
              {{ shieldResource.plural }}
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ bulwarkSigils }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Timer class="h-4 w-4 text-primary" />
              Time Left
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ timeLeftLabel }}s</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <ShieldCheck class="h-4 w-4 text-primary" />
              Integrity
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ integrityPercent.toFixed(0) }}%</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Flame class="h-4 w-4 text-accent" />
              Stamina
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ staminaPercent.toFixed(0) }}%</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Sparkles class="h-4 w-4 text-primary" />
              Combo
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">x{{ highestCombo }}</p>
          </div>
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur">
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 class="text-4xl font-black tracking-tight text-foreground md:text-5xl">Shield Defense</h1>
                <p class="text-sm text-muted-foreground">
                  Raise your shield against crushing blows. Hold steady when the enemy lunges and keep stamina high enough to endure the entire assault.
                </p>
              </div>
              <div class="rounded-lg border border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
                Status: <span class="font-semibold text-foreground">{{ phase }}</span>
              </div>
            </div>

            <div class="relative flex justify-center">
              <div class="relative w-full max-w-[1120px] overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-black/70 p-6 shadow-[inset_0_0_48px_rgba(0,0,0,0.65)]">
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.08),transparent_65%)]" />
                <div class="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />

                <div class="relative mx-auto flex h-[520px] w-[900px] flex-col overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-black/70 shadow-[inset_0_0_36px_rgba(0,0,0,0.6)]">
                  <div class="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-400/15 via-transparent to-transparent" />

                  <div class="absolute inset-0 flex flex-col items-center justify-center gap-16 p-10">
                    <div class="relative flex w-full max-w-3xl items-center justify-center">
                      <div class="enemy-container relative flex h-48 w-48 items-center justify-center rounded-full bg-gradient-to-br from-slate-800/80 to-slate-950/80 shadow-[0_0_32px_rgba(148,163,184,0.35)] border border-border/60">
                        <div class="enemy-core" :class="enemyState" />
                        <div
                          v-if="enemyState === 'telegraph'"
                          class="enemy-telegraph absolute inset-6 rounded-full border-2 border-emerald-300/60"
                          :style="{ '--progress': enemyTelegraphPercent + '%' }"
                        />
                        <div
                          v-if="enemyState === 'attack'"
                          class="enemy-strike absolute inset-4 rounded-full bg-gradient-to-br from-red-500/70 to-red-600/70 shadow-[0_0_24px_rgba(248,113,113,0.65)]"
                        />
                      </div>
                    </div>

                    <div class="relative flex w-full max-w-3xl flex-col items-center gap-4">
                      <div
                        class="shield-stance relative flex h-56 w-56 cursor-pointer items-center justify-center"
                        @mousedown.prevent="handleBlockDown"
                        @mouseup.prevent="handleBlockUp"
                        @mouseleave="handleBlockUp"
                        @touchstart.prevent="handleBlockDown"
                        @touchend.prevent="handleBlockUp"
                      >
                        <div
                          class="shield-body"
                          :class="blockState"
                        >
                          <div class="shield-insignia" />
                        </div>
                        <div class="shield-aura" :class="{ active: blockHolding }" />
                      </div>

                      <div class="flex w-full max-w-xl flex-col gap-3">
                        <div>
                          <p class="text-xs uppercase tracking-widest text-muted-foreground">Stamina</p>
                          <div class="relative h-3 rounded-full bg-border/60">
                            <div
                              class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 shadow-[0_0_16px_rgba(59,130,246,0.45)] transition-all duration-200"
                              :style="{ width: `${staminaPercent}%` }"
                            />
                          </div>
                        </div>
                        <div>
                          <p class="text-xs uppercase tracking-widest text-muted-foreground">Shield Integrity</p>
                          <div class="relative h-3 rounded-full bg-border/60">
                            <div
                              class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-red-400 shadow-[0_0_16px_rgba(249,115,22,0.45)] transition-all duration-200"
                              :style="{ width: `${integrityPercent}%` }"
                            />
                          </div>
                        </div>
                        <div class="mt-6 flex justify-center">
                          <button
                            type="button"
                            class="shield-button group relative flex h-16 w-16 items-center justify-center rounded-full border border-border/60 bg-card/70 text-sm font-semibold text-foreground shadow-lg transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                            @mousedown.prevent="handleBlockDown"
                            @mouseup.prevent="handleBlockUp"
                            @mouseleave="handleBlockUp"
                            @touchstart.prevent="handleBlockDown"
                            @touchend.prevent="handleBlockUp"
                            :class="{ 'opacity-60': staminaPercent <= 5 }"
                          >
                            <ShieldCheck class="h-6 w-6 transition-transform duration-200 group-active:scale-110" />
                            <span class="absolute -bottom-5 text-[10px] uppercase tracking-widest text-muted-foreground">Hold</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="overlayVisible"
                    class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/85 text-center backdrop-blur"
                  >
                    <h2 class="text-2xl font-semibold text-foreground">{{ overlayTitle }}</h2>
                    <p class="mt-3 max-w-md text-sm text-muted-foreground">
                      {{ overlayDescription }}
                    </p>
                    <button type="button" :class="actionButtonClasses" class="mt-6" @click="handleOverlayAction">
                      {{ overlayAction }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
              <div class="flex flex-wrap items-center gap-3">
                <span class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-foreground">
                  <Flame class="h-4 w-4 text-primary" />
                  Successful Blocks: {{ blocksSuccessful }}
                </span>
                <span>&bull;</span>
                <span>Failed Blocks: {{ blocksFailed }}</span>
                <span>&bull;</span>
                <span>Current Combo: x{{ combo }}</span>
              </div>

              <button
                v-if="phase === 'running'"
                type="button"
                class="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                @click="pauseDefense"
              >
                Pause Defense
              </button>
            </div>

          </div>
        </section>

        <aside class="rounded-xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          <header class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-foreground">Defense Briefing</h2>
            <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground">
              <ShieldCheck class="h-4 w-4 text-primary" />
              Wave {{ currentWave }} / {{ TOTAL_WAVES }}
            </div>
          </header>

          <div class="mt-4 space-y-4">
            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Controls</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Hold the shield button (or press <strong>S</strong>) to raise your guard.</li>
                <li>Release the button to regain stamina. Blocking drains stamina steadily.</li>
                <li>Press <strong>Space</strong> to pause or resume the defense mid-wave.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Tactics</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Watch for the glowing telegraph. Raise your shield as the bar reaches full.</li>
                <li>Chain perfect blocks to build combos and shorten enemy recovery.</li>
                <li>Stamina management is critical—lower your shield between attacks.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Objective</h3>
              <p class="mt-2 text-xs leading-relaxed">
                Survive the entire assault without your shield breaking. Succeed and Gruntag will award a {{ shieldResource.singular.toLowerCase() }} for your steadfast defense.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.enemy-container {
  transition: transform 0.2s ease;
}

.enemy-core {
  height: 140px;
  width: 140px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, rgba(226, 232, 240, 0.9), rgba(148, 163, 184, 0.8));
  box-shadow:
    inset 0 0 20px rgba(30, 41, 59, 0.65),
    0 0 26px rgba(59, 130, 246, 0.25);
  transition: transform 0.18s ease;
}

.enemy-core.telegraph {
  transform: scale(1.08);
  box-shadow:
    inset 0 0 28px rgba(30, 41, 59, 0.65),
    0 0 26px rgba(34, 197, 94, 0.45);
}

.enemy-core.attack {
  transform: scale(1.18);
}

.enemy-core.cooldown {
  transform: scale(0.96);
  opacity: 0.9;
}

.enemy-telegraph {
  position: absolute;
  border-radius: 9999px;
  box-shadow: 0 0 18px rgba(34, 197, 94, 0.55);
  background: conic-gradient(
    rgba(34, 197, 94, 0.4) calc(var(--progress)),
    rgba(15, 118, 110, 0.2) calc(var(--progress))
  );
  transition: background 0.05s linear;
}

.enemy-strike {
  animation: strike-pulse 0.3s ease forwards;
}

.shield-body {
  height: 220px;
  width: 180px;
  border-radius: 90% 90% 50% 50%;
  background: linear-gradient(145deg, rgba(148, 163, 184, 0.8), rgba(71, 85, 105, 0.9));
  border: 3px solid rgba(226, 232, 240, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 0 18px rgba(15, 23, 42, 0.65),
    0 14px 28px rgba(15, 23, 42, 0.45);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.shield-body.raised {
  transform: scale(1.03);
  border-color: rgba(59, 130, 246, 0.7);
  box-shadow:
    inset 0 0 22px rgba(59, 130, 246, 0.55),
    0 18px 32px rgba(59, 130, 246, 0.35);
}

.shield-body.raising {
  transform: scale(1.02);
}

.shield-body.breaking {
  transform: scale(0.95);
  border-color: rgba(248, 113, 113, 0.7);
  box-shadow:
    inset 0 0 24px rgba(248, 113, 113, 0.65),
    0 22px 36px rgba(248, 113, 113, 0.35);
}

.shield-insignia {
  height: 120px;
  width: 90px;
  border-radius: 45% 45% 30% 30%;
  background: linear-gradient(145deg, rgba(226, 232, 240, 0.6), rgba(148, 163, 184, 0.65));
  box-shadow:
    inset 0 0 14px rgba(30, 64, 175, 0.4),
    0 0 18px rgba(148, 163, 184, 0.35);
}

.shield-aura {
  position: absolute;
  inset: -18px;
  border-radius: 9999px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  opacity: 0;
  transition: opacity 0.2s ease;
  box-shadow: 0 0 26px rgba(59, 130, 246, 0.45);
}

.shield-aura.active {
  opacity: 1;
}

.shield-button {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.55), rgba(30, 41, 59, 0.65));
  box-shadow:
    0 12px 24px rgba(15, 23, 42, 0.45),
    inset 0 0 12px rgba(59, 130, 246, 0.35);
}

.shield-button:active {
  transform: translateY(1px) scale(0.98);
}

.enemy-core.idle {
  opacity: 0.95;
}

.floating-text {
  pointer-events: none;
  font-weight: 700;
  font-size: 0.9rem;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.95);
  text-shadow:
    0 0 12px rgba(34, 197, 94, 0.5),
    0 0 22px rgba(226, 232, 240, 0.7);
  letter-spacing: 0.2em;
}

@keyframes strike-pulse {
  0% {
    transform: scale(0.85);
    opacity: 0.8;
  }
  70% {
    transform: scale(1.15);
    opacity: 1;
  }
  100% {
    transform: scale(1.04);
    opacity: 0.8;
  }
}
</style>

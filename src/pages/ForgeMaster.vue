<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from "@/composables/useToast";
import { addVictoryPoint, getVictoryPoints } from "@/lib/victory-points";
import {
  ArrowLeft,
  Hammer,
  Trophy,
  Flame,
  Sparkles,
  Shield,
  Award,
} from "lucide-vue-next";

interface Contract {
  id: string;
  name: string;
  description: string;
  hitsRequired: number;
  baseReward: number;
  difficulty: number;
}

interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  multiplier: number;
  maxLevel?: number;
  type: "window" | "speed" | "quality" | "payout";
}

interface PersistedState {
  gold: number;
  contractIndex: number;
  contractProgress: number;
  upgrades: Record<string, number>;
}

const STORAGE_KEY = "forge_master_save";

const contracts: Contract[] = [
  {
    id: "apprentice-daggers",
    name: "Apprentice Daggers",
    description: "The guild needs quick blades for the watch.",
    hitsRequired: 12,
    baseReward: 120,
    difficulty: 1,
  },
  {
    id: "ornate-axes",
    name: "Ornate Axes",
    description: "Dwarven clans demand decorated axes for ceremony.",
    hitsRequired: 18,
    baseReward: 220,
    difficulty: 1.3,
  },
  {
    id: "titan-swords",
    name: "Titan Swords",
    description: "Heavy swords for the titan guard. Precision required.",
    hitsRequired: 26,
    baseReward: 360,
    difficulty: 1.6,
  },
  {
    id: "phoenix-halberds",
    name: "Phoenix Halberds",
    description: "Imbued halberds needing flawless timing.",
    hitsRequired: 34,
    baseReward: 520,
    difficulty: 1.9,
  },
  {
    id: "crownbreaker-hammer",
    name: "Crownbreaker Hammer",
    description: "A mythical hammer for the king of the mountain.",
    hitsRequired: 42,
    baseReward: 720,
    difficulty: 2.2,
  },
];

const upgrades: UpgradeDefinition[] = [
  {
    id: "precision-tongs",
    name: "Precision Tongs",
    description: "Widen the sweet spot for each strike.",
    baseCost: 120,
    multiplier: 1.6,
    maxLevel: 5,
    type: "window",
  },
  {
    id: "enchanted-bellows",
    name: "Enchanted Bellows",
    description: "Steady the rhythm to slow the slider slightly.",
    baseCost: 160,
    multiplier: 1.55,
    maxLevel: 4,
    type: "speed",
  },
  {
    id: "master-hammers",
    name: "Masterwork Hammers",
    description: "Increase progress gained on accurate strikes.",
    baseCost: 200,
    multiplier: 1.65,
    maxLevel: 6,
    type: "quality",
  },
  {
    id: "guild-favors",
    name: "Guild Favors",
    description: "Earn more gold from every completed contract.",
    baseCost: 240,
    multiplier: 1.7,
    maxLevel: 6,
    type: "payout",
  },
];

const router = useRouter();

const victoryPoints = ref(getVictoryPoints());
const gold = ref(0);
const contractIndex = ref(0);
const contractProgress = ref(0);
const combo = ref(0);
const heat = ref(0);

const sliderValue = ref(50);
const sliderDirection = ref<1 | -1>(1);
const targetCenter = ref(50);

const upgradeLevels = ref<Record<string, number>>({});

const baseWindow = 14;
const baseSpeed = 0.82;

const currentContract = computed(() => contracts[contractIndex.value] ?? contracts[contracts.length - 1]);
const hitsNeeded = computed(() => currentContract.value.hitsRequired);
const hitsRemaining = computed(() => Math.max(0, Math.ceil(hitsNeeded.value - contractProgress.value)));
const progressPercent = computed(() =>
  Math.min(100, (contractProgress.value / hitsNeeded.value) * 100),
);

const windowBonus = computed(() => (upgradeLevels.value["precision-tongs"] ?? 0) * 3.5);
const targetWindow = computed(() => baseWindow + windowBonus.value);
const targetStart = computed(() => Math.max(0, targetCenter.value - targetWindow.value / 2));
const targetWidth = computed(() => Math.min(100, targetWindow.value));

const speedModifier = computed(() => {
  const level = upgradeLevels.value["enchanted-bellows"] ?? 0;
  return 1 - Math.min(0.6, level * 0.12);
});

const qualityBonus = computed(() => {
  const level = upgradeLevels.value["master-hammers"] ?? 0;
  return level * 0.25;
});

const payoutBonus = computed(() => {
  const level = upgradeLevels.value["guild-favors"] ?? 0;
  return level * 0.18;
});

const sliderStep = computed(() => {
  const difficulty = currentContract.value.difficulty;
  return (baseSpeed + difficulty * 0.25) * speedModifier.value;
});

const currentRewardPreview = computed(() => {
  const base = currentContract.value.baseReward;
  return Math.round(base * (1 + payoutBonus.value));
});

const getUpgradeLevel = (id: string) => upgradeLevels.value[id] ?? 0;
const getUpgradeCost = (blueprint: UpgradeDefinition) => {
  const level = getUpgradeLevel(blueprint.id);
  return Math.round(blueprint.baseCost * Math.pow(blueprint.multiplier, level));
};

const canUpgrade = (blueprint: UpgradeDefinition) => {
  const level = getUpgradeLevel(blueprint.id);
  if (blueprint.maxLevel !== undefined && level >= blueprint.maxLevel) return false;
  return gold.value >= getUpgradeCost(blueprint);
};

const randomizeTarget = () => {
  const margin = Math.min(40, targetWindow.value / 2 + 6);
  const min = margin;
  const max = 100 - margin;
  targetCenter.value = Math.random() * (max - min) + min;
};

const attemptStrike = () => {
  const windowHalf = targetWindow.value / 2;
  const difference = Math.abs(sliderValue.value - targetCenter.value);
  const accuracy = Math.max(0, 1 - difference / windowHalf);

  if (difference <= windowHalf) {
    const progressGain = 1 + qualityBonus.value + accuracy * 1.5;
    contractProgress.value += progressGain;
    combo.value += 1;
    heat.value = Math.min(100, heat.value + 8 + accuracy * 12);

    const goldGain = Math.round(
      (currentContract.value.baseReward / hitsNeeded.value) * (0.8 + accuracy * 0.7) * (1 + payoutBonus.value),
    );
    gold.value += goldGain;

    if (contractProgress.value >= hitsNeeded.value) {
      completeContract();
    }
  } else {
    combo.value = 0;
    heat.value = Math.max(0, heat.value - 12);
  }

  randomizeTarget();
};

const completeContract = () => {
  toast({
    title: `${currentContract.value.name} complete!`,
    description: `You earned ${currentRewardPreview.value.toLocaleString()} gold.`,
  });

  gold.value += Math.round(currentContract.value.baseReward * (1 + payoutBonus.value));

  contractIndex.value += 1;
  contractProgress.value = 0;
  combo.value = 0;
  heat.value = Math.max(0, heat.value - 30);

  if (contractIndex.value >= contracts.length) {
    finishCampaign();
  }
};

const finishCampaign = () => {
  const newTotal = addVictoryPoint();
  victoryPoints.value = newTotal;
  toast({
    title: "Masterwork Complete!",
    description: `The guild crowns you Forge Master. Victory Points: ${newTotal}`,
    variant: "success",
  });

  resetGame();
};

const resetGame = () => {
  contractIndex.value = 0;
  contractProgress.value = 0;
  combo.value = 0;
  heat.value = 0;
  gold.value = 0;
  upgradeLevels.value = {};
  randomizeTarget();
  saveState();
};

const purchaseUpgrade = (blueprint: UpgradeDefinition) => {
  if (!canUpgrade(blueprint)) return;
  const cost = getUpgradeCost(blueprint);
  gold.value -= cost;
  upgradeLevels.value = {
    ...upgradeLevels.value,
    [blueprint.id]: getUpgradeLevel(blueprint.id) + 1,
  };

  toast({
    title: "Upgrade acquired!",
    description: `${blueprint.name} is now level ${getUpgradeLevel(blueprint.id)}`,
  });
};

const goHome = () => {
  router.push("/");
};

const saveState = () => {
  const payload: PersistedState = {
    gold: gold.value,
    contractIndex: contractIndex.value,
    contractProgress: contractProgress.value,
    upgrades: upgradeLevels.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const loadState = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    randomizeTarget();
    return;
  }

  try {
    const parsed = JSON.parse(stored) as PersistedState;
    gold.value = parsed.gold ?? 0;
    contractIndex.value = parsed.contractIndex ?? 0;
    contractProgress.value = parsed.contractProgress ?? 0;
    upgradeLevels.value = parsed.upgrades ?? {};
  } catch (error) {
    console.error("Failed to load Forge Master state", error);
    localStorage.removeItem(STORAGE_KEY);
  } finally {
    randomizeTarget();
  }
};

let animationHandle: number | null = null;

const stepSlider = () => {
  sliderValue.value += sliderDirection.value * sliderStep.value;

  if (sliderValue.value >= 100) {
    sliderValue.value = 100;
    sliderDirection.value = -1;
  } else if (sliderValue.value <= 0) {
    sliderValue.value = 0;
    sliderDirection.value = 1;
  }

  animationHandle = window.requestAnimationFrame(stepSlider);
};

onMounted(() => {
  loadState();
  animationHandle = window.requestAnimationFrame(stepSlider);
});

onBeforeUnmount(() => {
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
  }
});

watch([gold, contractIndex, contractProgress, upgradeLevels], saveState, { deep: true });
watch(() => currentContract.value.id, () => {
  contractProgress.value = Math.min(contractProgress.value, hitsNeeded.value - 0.01);
});

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const strikeButtonClasses =
  "relative mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-lg font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-8">
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.12),transparent_60%)]" />

    <div class="relative z-10 mx-auto max-w-6xl space-y-8">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="goHome">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="flex flex-wrap items-center justify-end gap-4 text-right">
          <div class="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-yellow-300">
            <Hammer class="h-5 w-5" />
            <span class="text-lg font-semibold">{{ gold.toLocaleString() }} gold</span>
          </div>
          <div class="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-accent">
            <Trophy class="h-5 w-5" />
            <span class="text-lg font-semibold">{{ victoryPoints }}</span>
          </div>
        </div>
      </header>

      <section class="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6 backdrop-blur">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-4">
            <h1 class="text-4xl font-black tracking-tight text-amber-200 md:text-5xl">
              Forge Master
            </h1>
            <p class="max-w-xl text-slate-300">
              Accept contracts from across the realms, time your hammer strikes, and craft legendary weapons worthy of Gruntag's hall.
            </p>
            <div class="flex flex-wrap gap-4 text-sm text-slate-300">
              <span class="inline-flex items-center gap-2 rounded-md border border-slate-600/70 bg-slate-800/70 px-3 py-1">
                <Sparkles class="h-4 w-4 text-amber-300" />
                Combo: <strong class="ml-1 text-amber-200">{{ combo }}</strong>
              </span>
              <span class="inline-flex items-center gap-2 rounded-md border border-slate-600/70 bg-slate-800/70 px-3 py-1">
                <Flame class="h-4 w-4 text-orange-400" />
                Heat: <strong class="ml-1 text-orange-300">{{ heat }}%</strong>
              </span>
              <span class="inline-flex items-center gap-2 rounded-md border border-slate-600/70 bg-slate-800/70 px-3 py-1">
                <Shield class="h-4 w-4 text-blue-300" />
                Contract {{ Math.min(contractIndex + 1, contracts.length) }} / {{ contracts.length }}
              </span>
            </div>
          </div>

          <div class="w-full max-w-sm space-y-3 rounded-lg border border-slate-700/70 bg-slate-900/70 p-4 text-sm text-slate-200">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-amber-300">{{ currentContract.name }}</span>
              <span class="text-slate-400">Reward: {{ currentRewardPreview.toLocaleString() }}</span>
            </div>
            <p class="text-slate-300/90">
              {{ currentContract.description }}
            </p>

            <div>
              <div class="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                <span>Progress</span>
                <span>{{ Math.round(progressPercent) }}%</span>
              </div>
              <div class="relative h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  class="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 transition-all"
                  :style="{ width: `${progressPercent}%` }"
                />
              </div>
              <p class="mt-1 text-xs text-slate-400">
                {{ hitsRemaining }} precise strikes remaining
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div class="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6 backdrop-blur">
          <h2 class="text-2xl font-semibold text-amber-200">Forge Control</h2>
          <p class="mt-1 text-sm text-slate-300">
            Hit the glowing zone to shape the metal. Miss, and you lose tempo.
          </p>

          <div class="mt-8 space-y-8">
            <div class="relative h-24 rounded-xl border border-slate-800 bg-slate-950/60 p-4 shadow-inner shadow-black/60">
              <div class="relative h-4 w-full rounded-full bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700">
                <div
                  class="absolute top-1/2 h-6 -translate-y-1/2 rounded-full bg-amber-500/60 blur-sm"
                  :style="{ left: `${targetStart}%`, width: `${targetWidth}%` }"
                />
                <div
                  class="absolute top-1/2 h-10 -translate-y-1/2 rounded-full border border-amber-400/70 bg-gradient-to-b from-amber-300/70 to-amber-500/70"
                  :style="{ left: `${targetCenter}%`, width: `${targetWindow}%`, transform: 'translateX(-50%)' }"
                />
                <div
                  class="absolute top-1/2 h-6 w-6 -translate-y-1/2 -translate-x-1/2 rounded-full border border-amber-200 bg-white shadow-[0_0_12px_rgba(251,191,36,0.7)] transition-transform"
                  :style="{ left: `${sliderValue}%` }"
                />
              </div>
            </div>

            <div class="flex items-center justify-between text-sm text-slate-300">
              <span>Strike window: {{ targetWindow.toFixed(0) }}%</span>
              <span>Rhythm: {{ (sliderStep).toFixed(2) }}</span>
            </div>

            <button type="button" :class="strikeButtonClasses" @click="attemptStrike">
              <Hammer class="h-5 w-5" />
              Strike
            </button>
          </div>
        </div>

        <div class="rounded-xl border border-slate-700/60 bg-slate-900/60 p-6 backdrop-blur">
          <h2 class="text-2xl font-semibold text-amber-200">Upgrades &amp; Guild Support</h2>
          <p class="mt-1 text-sm text-slate-300">
            Spend gold to enhance your forge. Upgrades persist until you finish the campaign.
          </p>

          <div class="mt-6 space-y-4">
            <div
              v-for="blueprint in upgrades"
              :key="blueprint.id"
              class="rounded-lg border border-slate-800 bg-slate-900/80 p-4"
            >
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-base font-semibold text-slate-100">
                    {{ blueprint.name }}
                  </p>
                  <p class="text-sm text-slate-400">
                    {{ blueprint.description }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-sm text-amber-300">
                    Lv {{ getUpgradeLevel(blueprint.id) }} / {{ blueprint.maxLevel ?? "∞" }}
                  </p>
                  <p class="text-xs text-slate-500">Cost: {{ getUpgradeCost(blueprint).toLocaleString() }}</p>
                </div>
              </div>

              <button
                type="button"
                class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                :disabled="!canUpgrade(blueprint)"
                @click="purchaseUpgrade(blueprint)"
              >
                <Award class="h-4 w-4" />
                Purchase
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

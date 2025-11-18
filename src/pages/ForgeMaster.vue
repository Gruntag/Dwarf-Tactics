<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from "@/composables/useToast";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import {
  ArrowLeft,
  Hammer,
  Trophy,
  Flame,
  Sparkles,
  Shield,
  Award,
  Swords,
  Coins,
  Diamond,
} from "lucide-vue-next";

type ContractType = "farming" | "guild";

interface ContractOption {
  id: string;
  name: string;
  description: string;
  hitsRequired: number;
  baseReward: number;
  difficulty: number;
  type: ContractType;
  tier: number;
  isLuxury?: boolean;
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
  guildStage: number;
  contractProgress: number;
  contractQuality: number;
  activeContract: ContractOption | null;
  availableContracts: ContractOption[] | null;
  upgrades: Record<string, number>;
}

const STORAGE_KEY = "forge_master_save";
const GUILD_GOAL = 5;

const farmingNames = [
  "Clan Armory Refill",
  "Mountain Patrol Weapons",
  "Mercenary Stockpile",
  "Arena Blades Batch",
  "Voyager Escort Gear",
];

const farmingDescriptions = [
  "A steady commission to fill racks of standard weapons.",
  "Quick work for dwarven defenders needing reliable arms.",
  "Mercenary bands pay well for durable weapons.",
  "Arena masters want a shipment of flashy blades.",
  "Travelers demand reinforced gear for treacherous roads.",
  "A noble house desires instruments of splendor and war.",
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

const FORGE_RESOURCE_KEY = "forgeMaster" as const;
const forgeResource = RESOURCES[FORGE_RESOURCE_KEY];
const forgeSeals = ref(getResourceCount(FORGE_RESOURCE_KEY));
const gold = ref(0);
const guildStage = ref(0);

const activeContract = ref<ContractOption | null>(null);
const availableContracts = ref<ContractOption[]>([]);
const contractProgress = ref(0);
const contractQuality = ref(0);

interface ProgressFloat {
  id: string;
  value: number;
  critical: boolean;
}

const combo = ref(0);
const heat = ref(0);

const sliderValue = ref(50);
const sliderDirection = ref<1 | -1>(1);
const targetCenter = ref(50);

const upgradeLevels = ref<Record<string, number>>({});

const baseWindow = 14;
const baseSpeed = 0.82;

const progressFloats = ref<ProgressFloat[]>([]);

const statTooltips = {
  combo:
    "Each accurate strike increases combo. Every stack adds 1% chance for a critical hit that doubles forge progress.",
  heat: "Heat rises with precise timing, quickening the forge rhythm. Misses cool the metal and slow the slider.",
  quality:
    "Quality measures the percentage of the contract's base payout you'll earn when a farming job is completed. Luxury work magnifies gains and penalties tenfold beyond 100%.",
};

const contractIconInfo = computed(() => {
  if (!currentContract.value) {
    return { icon: Hammer, label: "Forge Idle" };
  }
  if (currentContract.value.type === "guild") {
    return { icon: Shield, label: "Guild Masterwork" };
  }
  if (currentContract.value.isLuxury) {
    return { icon: Diamond, label: "Luxury Commission" };
  }
  return { icon: Swords, label: "Commission Craft" };
});

const hasActiveContract = computed(() => activeContract.value !== null);

const currentContract = computed(() => activeContract.value);
const hitsNeeded = computed(() => currentContract.value?.hitsRequired ?? 1);
const hitsRemaining = computed(() =>
  hasActiveContract.value ? Math.max(0, Math.ceil(hitsNeeded.value - contractProgress.value)) : 0,
);
const progressPercent = computed(() =>
  hasActiveContract.value
    ? Math.min(100, (contractProgress.value / hitsNeeded.value) * 100)
    : 0,
);

const windowBonus = computed(() => (upgradeLevels.value["precision-tongs"] ?? 0) * 3.5);
const targetWindow = computed(() => baseWindow + windowBonus.value);
const targetStart = computed(() => Math.max(0, targetCenter.value - targetWindow.value / 2));
const targetWidth = computed(() => Math.min(100, targetWindow.value));
const targetEnd = computed(() => Math.min(100, targetStart.value + targetWidth.value));

const strikeTolerance = computed(() => Math.max(1.5, targetWindow.value * 0.05));

const speedBaseModifier = computed(() => {
  const level = upgradeLevels.value["enchanted-bellows"] ?? 0;
  return 1 - Math.min(0.6, level * 0.12);
});

const speedModifier = computed(() => {
  const heatInfluence = 1 + Math.min(0.6, heat.value / 150);
  return speedBaseModifier.value * heatInfluence;
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
  const difficulty = currentContract.value?.difficulty ?? 1;
  return (baseSpeed + difficulty * 0.25) * speedModifier.value;
});

const progressClipPath = computed(() => {
  if (!hasActiveContract.value) {
    return "inset(0 100% 0 0)";
  }
  const percent = Math.max(0, Math.min(100, progressPercent.value));
  return `inset(0 ${100 - percent}% 0 0)`;
});

const getQualityMultiplier = (quality: number, isLuxury: boolean) => {
  if (isLuxury) {
    const delta = quality - 100;
    return Math.max(0, 1 + delta * 0.1);
  }
  return Math.max(0, quality / 100);
};

const currentRewardPreview = computed(() => {
  if (!currentContract.value) return 0;
  if (currentContract.value.type === "guild") {
    return Math.round(
      currentContract.value.baseReward *
        (1 + payoutBonus.value) *
        (1 + guildStage.value * 0.25),
    );
  }

  const multiplier = getQualityMultiplier(contractQuality.value, currentContract.value.isLuxury ?? false);
  return Math.round(
    currentContract.value.baseReward *
      multiplier *
      (1 + payoutBonus.value),
  );
});

const qualityLabel = computed(() => {
  const multiplier = getQualityMultiplier(
    contractQuality.value,
    currentContract.value?.isLuxury ?? false,
  );
  return `${Math.round(multiplier * 100)}% of base payout`;
});
const guildProgressLabel = computed(() => `${guildStage.value} / ${GUILD_GOAL}`);

const getUpgradeLevel = (id: string) => upgradeLevels.value[id] ?? 0;
const getUpgradeCost = (blueprint: UpgradeDefinition) => {
  const level = getUpgradeLevel(blueprint.id);
  return Math.round(blueprint.baseCost * Math.pow(blueprint.multiplier, level));
};

const getUpgradeStats = (blueprint: UpgradeDefinition) => {
  const level = getUpgradeLevel(blueprint.id);
  switch (blueprint.type) {
    case "window": {
      const current = baseWindow + level * 3.5;
      const next = baseWindow + (level + 1) * 3.5;
      return `Window width: ${current.toFixed(1)}% -> ${next.toFixed(1)}%`;
    }
    case "speed": {
      const current = 1 - Math.min(0.6, level * 0.12);
      const next = 1 - Math.min(0.6, (level + 1) * 0.12);
      return `Rhythm speed modifier: ${Math.round(current * 100)}% -> ${Math.round(next * 100)}%`;
    }
    case "quality": {
      const current = 1 + level * 0.25;
      const next = 1 + (level + 1) * 0.25;
      return `Progress multiplier: x${current.toFixed(2)} -> x${next.toFixed(2)}`;
    }
    case "payout": {
      const current = 1 + level * 0.18;
      const next = 1 + (level + 1) * 0.18;
      return `Gold bonus: +${Math.round((current - 1) * 100)}% -> +${Math.round((next - 1) * 100)}%`;
    }
    default:
      return "";
  }
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

const generateId = () => `contract-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;

const farmingTier = computed(() => Math.max(0, guildStage.value));

const generateFarmingContract = (tier: number): ContractOption => {
  const hits = 12 + tier * 4 + Math.floor(Math.random() * 6);
  const reward = 150 + tier * 90 + Math.floor(Math.random() * 80);
  const difficulty = 1 + tier * 0.18;
  const name = farmingNames[Math.floor(Math.random() * farmingNames.length)];
  const description =
    farmingDescriptions[Math.floor(Math.random() * farmingDescriptions.length)];
  const isLuxury = Math.random() < 0.25;

  return {
    id: generateId(),
    name,
    description: isLuxury
      ? `${description} The patrons demand opulent finishes fit for royalty.`
      : description,
    hitsRequired: hits,
    baseReward: reward,
    difficulty,
    type: "farming",
    tier,
    isLuxury,
  };
};

const generateGuildContract = (stage: number): ContractOption => {
  const hits = 24 + stage * 12;
  const reward = 300 + stage * 220;
  const difficulty = 1.6 + stage * 0.4;

  return {
    id: generateId(),
    name: "The Smiths Guild Contract",
    description:
      "The guild demands a flawless masterpiece. One mistake and the work is discarded.",
    hitsRequired: hits,
    baseReward: reward,
    difficulty,
    type: "guild",
    tier: stage,
  };
};

const rollContracts = () => {
  const stage = guildStage.value;
  const farmingOne = generateFarmingContract(Math.max(0, farmingTier.value));
  const farmingTwo = generateFarmingContract(Math.max(0, farmingTier.value + 1));
  const guildOption = generateGuildContract(stage);

  availableContracts.value = [farmingOne, farmingTwo, guildOption];
};

const selectContract = (contract: ContractOption) => {
  activeContract.value = contract;
  contractProgress.value = 0;
  contractQuality.value = 0;
  combo.value = 0;
  heat.value = 0;
  availableContracts.value = [];
  progressFloats.value = [];
  randomizeTarget();
};

const handleMiss = () => {
  const contract = currentContract.value;
  if (!contract) return;

  if (contract.type === "guild") {
    failContract("The guild rejects this flawed work. Try again when your forge is ready.");
    return;
  }

  const basePenalty = (100 / contract.hitsRequired) * 1.5;
  const penalty = basePenalty + contract.difficulty * 4 + Math.min(25, combo.value * 1.5);
  contractQuality.value = Math.max(0, contractQuality.value - penalty);
  combo.value = 0;
  heat.value = Math.max(0, Math.round(heat.value - 25));
};

const attemptStrike = () => {
  const contract = currentContract.value;
  if (!contract) return;

  const windowHalf = targetWindow.value / 2;
  const difference = Math.abs(sliderValue.value - targetCenter.value);
  const effectiveWindow = windowHalf + strikeTolerance.value;

  const accuracy = Math.max(0, 1 - difference / effectiveWindow);

  if (difference <= effectiveWindow) {
    const previousProgress = Math.min(contractProgress.value, hitsNeeded.value);

    combo.value += 1;
    heat.value = Math.min(100, Math.round(heat.value + 12 + accuracy * 16));
    const heatMultiplier = 1 + Math.min(0.3, heat.value / 200);

    let progressGain = (1 + qualityBonus.value + accuracy * 1.5) * heatMultiplier;
    const critChance = Math.min(100, combo.value);
    const didCrit = Math.random() * 100 < critChance;
    if (didCrit) {
      progressGain *= 2;
    }

    contractProgress.value += progressGain;
    const cappedProgress = Math.min(contractProgress.value, hitsNeeded.value);
    const effectiveGain = Math.max(0, cappedProgress - previousProgress);

    const floatId = `progress-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    progressFloats.value = [
      ...progressFloats.value,
      { id: floatId, value: effectiveGain, critical: didCrit },
    ];
    setTimeout(() => {
      progressFloats.value = progressFloats.value.filter((entry) => entry.id !== floatId);
    }, 900);

    const baseQualityGain = (effectiveGain / hitsNeeded.value) * 100;
    const accuracyFactor = 0.8 + 0.2 * accuracy;
    let qualityGain = baseQualityGain * accuracyFactor;
    if (qualityBonus.value > 0) {
      qualityGain += accuracy * qualityBonus.value * 4;
    }
    contractQuality.value = Math.min(200, contractQuality.value + qualityGain);

    if (contractProgress.value >= hitsNeeded.value) {
      completeContract();
    }
  } else {
    handleMiss();
  }

  randomizeTarget();
};

const completeContract = () => {
  const contract = currentContract.value;
  if (!contract) return;

  if (contract.type === "farming") {
    const multiplier = getQualityMultiplier(contractQuality.value, contract.isLuxury ?? false);
    const payout = Math.round(
      contract.baseReward *
        multiplier *
        (1 + payoutBonus.value),
    );
    gold.value += payout;

    const qualitySummary = `${contract.isLuxury ? "Luxury multiplier" : "Quality multiplier"} ${multiplier.toFixed(2)}x`;
    const toastTitle = contract.isLuxury ? `${contract.name} (Luxury) complete!` : `${contract.name} complete!`;

    toast({
      title: toastTitle,
      description: `${qualitySummary}. Payout: ${payout.toLocaleString()} gold`,
    });
  } else {
    guildStage.value += 1;
    const bonus = Math.round(
      contract.baseReward * (1 + payoutBonus.value) * (1 + guildStage.value * 0.25),
    );
    gold.value += bonus;

    toast({
      title: "Masterwork accepted!",
      description: `The Smiths Guild honors your craft. Bonus: ${bonus.toLocaleString()} gold.`,
    });

    if (guildStage.value >= GUILD_GOAL) {
      finishCampaign();
      return;
    }
  }

  activeContract.value = null;
  contractProgress.value = 0;
  contractQuality.value = 0;
  combo.value = 0;
  heat.value = Math.max(0, Math.round(heat.value - 30));
  progressFloats.value = [];
  rollContracts();
  saveState();
};

const failContract = (message: string) => {
  toast({
    title: "Craft Failed",
    description: message,
    variant: "destructive",
  });

  activeContract.value = null;
  contractProgress.value = 0;
  contractQuality.value = 0;
  combo.value = 0;
  heat.value = Math.max(0, Math.round(heat.value - 20));
  progressFloats.value = [];
  rollContracts();
  saveState();
};

const finishCampaign = () => {
  const newTotal = addResource(FORGE_RESOURCE_KEY);
  forgeSeals.value = newTotal;
  toast({
    title: "Forge Ascended!",
    description: `The guild crowns you Forge Master. ${forgeResource.plural}: ${newTotal}`,
    variant: "success",
  });

  resetGame();
};

const resetGame = () => {
  activeContract.value = null;
  contractProgress.value = 0;
  contractQuality.value = 0;
  combo.value = 0;
  heat.value = 0;
  gold.value = 0;
  guildStage.value = 0;
  upgradeLevels.value = {};
  progressFloats.value = [];
  rollContracts();
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
    guildStage: guildStage.value,
    contractProgress: contractProgress.value,
    contractQuality: contractQuality.value,
    activeContract: activeContract.value,
    availableContracts: availableContracts.value.length ? availableContracts.value : null,
    upgrades: upgradeLevels.value,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const loadState = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    rollContracts();
    randomizeTarget();
    return;
  }

  try {
    const parsed = JSON.parse(stored) as PersistedState;
    gold.value = parsed.gold ?? 0;
    guildStage.value = parsed.guildStage ?? 0;
    contractProgress.value = parsed.contractProgress ?? 0;
    contractQuality.value = parsed.contractQuality ?? 0;
    upgradeLevels.value = parsed.upgrades ?? {};
    activeContract.value = parsed.activeContract ?? null;
    if (parsed.availableContracts && parsed.availableContracts.length) {
      availableContracts.value = parsed.availableContracts;
    } else if (!activeContract.value) {
      rollContracts();
    }
  } catch (error) {
    console.error("Failed to load Forge Master state", error);
    localStorage.removeItem(STORAGE_KEY);
    rollContracts();
  } finally {
    randomizeTarget();
    combo.value = 0;
    heat.value = 0;
    progressFloats.value = [];
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

watch([gold, guildStage, contractProgress, contractQuality, upgradeLevels, activeContract, availableContracts], saveState, {
  deep: true,
});

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const strikeButtonClasses =
  "relative mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent px-8 py-3 text-lg font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:to-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60";
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-game)] p-4 md:p-8">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,10,10,0.5),transparent_70%)]" />
    <div class="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px] md:h-[640px] md:w-[640px]" />

    <div class="relative z-10 mx-auto max-w-6xl space-y-8">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="goHome">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="flex flex-wrap items-center justify-end gap-4 text-right">
          <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-foreground backdrop-blur">
            <Trophy class="h-5 w-5 text-accent" />
            <div class="flex flex-col leading-tight text-right">
              <span class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ forgeResource.plural }}</span>
              <span class="text-lg font-semibold">{{ forgeSeals }}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-4">
            <h1 class="text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Forge Master
            </h1>
            <p class="max-w-xl text-muted-foreground">
              Accept contracts from across the realms, time your hammer strikes, and craft legendary weapons worthy of Gruntag's hall.
            </p>
            <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div
                class="relative inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/70 px-3 py-1 backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background group"
                tabindex="0"
              >
                <Sparkles class="h-4 w-4 text-primary" />
                Combo: <strong class="ml-1 text-foreground">{{ combo }}</strong>
                <span
                  class="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-[0_12px_30px_rgba(0,0,0,0.45)] group-hover:flex group-focus-visible:flex"
                >
                  {{ statTooltips.combo }}
                </span>
              </div>
              <div
                class="relative inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/70 px-3 py-1 backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background group"
                tabindex="0"
              >
                <Flame class="h-4 w-4 text-accent" />
                Heat: <strong class="ml-1 text-foreground">{{ heat }}%</strong>
                <span
                  class="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-[0_12px_30px_rgba(0,0,0,0.45)] group-hover:flex group-focus-visible:flex"
                >
                  {{ statTooltips.heat }}
                </span>
              </div>
              <div
                class="relative inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/70 px-3 py-1 backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background group"
                tabindex="0"
              >
                <Coins class="h-4 w-4 text-primary" />
                Quality: <strong class="ml-1 text-foreground">{{ qualityLabel }}</strong>
                <span
                  class="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-[0_12px_30px_rgba(0,0,0,0.45)] group-hover:flex group-focus-visible:flex"
                >
                  {{ statTooltips.quality }}
                </span>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">
              Critical strikes can double progress, heat speeds the slider, and quality governs contract payouts.
            </p>
          </div>

          <div
            v-if="hasActiveContract"
            class="w-full max-w-sm space-y-3 rounded-lg border border-border/60 bg-card/70 p-4 text-sm text-foreground backdrop-blur"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-primary">{{ currentContract?.name }}</span>
                <span
                  v-if="currentContract?.isLuxury"
                  class="rounded-md bg-primary/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary"
                >
                  Luxury
                </span>
              </div>
              <span class="text-muted-foreground">
                <template v-if="currentContract?.type === 'guild'">
                  Progress Contract
                </template>
                <template v-else>
                  Projected: {{ currentRewardPreview.toLocaleString() }}
                </template>
              </span>
            </div>
            <p class="text-muted-foreground">
              {{ currentContract?.description }}
            </p>

            <div class="flex items-center justify-end gap-3 pt-2">
              <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-foreground backdrop-blur">
                <Hammer class="h-5 w-5 text-primary" />
                <span class="text-sm font-semibold">{{ gold.toLocaleString() }} gold</span>
              </div>
              <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-foreground backdrop-blur">
                <Shield class="h-5 w-5 text-accent" />
                <span class="text-sm font-semibold">Guild Progress: {{ guildProgressLabel }}</span>
              </div>
            </div>
          </div>
          <div
            v-else
            class="w-full max-w-sm rounded-lg border border-border/60 bg-card/70 p-4 text-sm text-muted-foreground backdrop-blur"
          >
            Choose a contract to begin forging. Harder guild contracts unlock {{ forgeResource.plural.toLowerCase() }}.
            <div class="mt-4 flex items-center justify-end gap-3">
              <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-foreground backdrop-blur">
                <Hammer class="h-5 w-5 text-primary" />
                <span class="text-sm font-semibold">{{ gold.toLocaleString() }} gold</span>
              </div>
              <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-foreground backdrop-blur">
                <Shield class="h-5 w-5 text-accent" />
                <span class="text-sm font-semibold">Guild Progress: {{ guildProgressLabel }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="!hasActiveContract"
        class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur"
      >
        <h2 class="text-2xl font-semibold text-foreground">Select Your Next Commission</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Two lucrative gold contracts and one grueling guild masterpiece await. Choose wisely.
        </p>

        <div class="mt-6 grid gap-4 md:grid-cols-3">
          <div
            v-for="option in availableContracts"
            :key="option.id"
            class="flex h-full flex-col rounded-lg border border-border/60 bg-card/70 p-4 backdrop-blur"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-lg font-semibold text-foreground">{{ option.name }}</h3>
              <span
                v-if="option.type === 'guild'"
                class="rounded-md bg-accent/20 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-accent"
              >
                Guild
              </span>
              <span
                v-else-if="option.isLuxury"
                class="rounded-md bg-primary/20 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
              >
                Luxury
              </span>
            </div>
            <p class="flex-1 text-sm text-muted-foreground">
              {{ option.description }}
            </p>

            <div class="mt-4 space-y-1 text-xs text-muted-foreground">
              <p>Strikes needed: <span class="text-foreground">{{ option.hitsRequired }}</span></p>
              <p>Difficulty: <span class="text-foreground">{{ option.difficulty.toFixed(2) }}</span></p>
              <p v-if="option.type === 'farming'">
                Base payout: <span class="text-foreground">{{ option.baseReward.toLocaleString() }}</span>
              </p>
              <p v-if="option.isLuxury" class="text-primary">
                Luxury bonus: Quality beyond 100% pays 10x, below 100% penalizes 10x.
              </p>
              <p v-else>
                Guild stage target: <span class="text-foreground">{{ guildStage + 1 }}</span>
              </p>
            </div>

            <button
              type="button"
              class="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/20 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/30"
              @click="selectContract(option)"
            >
              <component :is="option.isLuxury ? Diamond : Swords" class="h-4 w-4" />
              Accept Contract
            </button>
          </div>
        </div>
      </section>

      <section class="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div
          v-if="hasActiveContract"
          class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur transition-opacity"
        >
          <h2 class="text-2xl font-semibold text-foreground">Forge Control</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Hit the glowing zone to shape the metal. Miss on guild work and the contract fails.
          </p>

          <div class="mt-8 space-y-8">
            <div class="rounded-lg border border-border/60 bg-card/70 p-4 backdrop-blur">
              <div class="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                <span>{{ contractIconInfo.label }}</span>
                <span class="font-semibold text-foreground">{{ Math.round(progressPercent) }}%</span>
              </div>
              <div class="relative mt-4 flex h-28 items-center justify-center">
                <component
                  :is="contractIconInfo.icon"
                  class="pointer-events-none h-24 w-24 text-muted-foreground/20"
                />
                <component
                  :is="contractIconInfo.icon"
                  class="pointer-events-none absolute h-24 w-24 text-primary drop-shadow-[0_0_12px_rgba(34,197,94,0.45)] transition-all duration-300"
                  :style="{ clipPath: progressClipPath }"
                />
              </div>
              <p class="mt-3 text-xs text-muted-foreground">
                {{ hitsRemaining }} precise strikes remaining
              </p>
            </div>
            <div class="relative h-24 rounded-xl border border-border/60 bg-card/70 p-4 shadow-[inset_0_0_24px_rgba(0,0,0,0.35)]">
              <div class="relative h-4 w-full rounded-full bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20">
                <div
                  class="absolute top-[-10px] bottom-[-10px] w-[3px] rounded-full bg-primary/70 shadow-[0_0_10px_rgba(34,197,94,0.6)]"
                  :style="{ left: `${targetStart}%` }"
                />
                <div
                  class="absolute top-[-10px] bottom-[-10px] w-[3px] rounded-full bg-primary/70 shadow-[0_0_10px_rgba(34,197,94,0.6)]"
                  :style="{ left: `${targetEnd}%` }"
                />
                <div
                  class="absolute top-1/2 h-6 -translate-y-1/2 rounded-full bg-primary/40 blur-lg"
                  :style="{ left: `${targetStart}%`, width: `${targetWidth}%` }"
                />
                <div
                  class="absolute top-1/2 h-10 -translate-y-1/2 rounded-full border border-primary/70 bg-gradient-to-b from-primary/70 to-accent/70"
                  :style="{ left: `${targetCenter}%`, width: `${targetWindow}%`, transform: 'translateX(-50%)' }"
                />
                <div
                  class="absolute top-1/2 h-6 w-6 -translate-y-1/2 -translate-x-1/2 rounded-full border border-primary/70 bg-white shadow-[0_0_18px_rgba(34,197,94,0.7)] transition-transform"
                  :style="{ left: `${sliderValue}%` }"
                />
                <div
                  v-for="float in progressFloats"
                  :key="float.id"
                  :class="[
                    'float-indicator absolute left-1/2 top-[-36px] -translate-x-1/2 text-sm font-semibold',
                    float.critical
                      ? 'text-accent drop-shadow-[0_0_12px_rgba(244,114,182,0.6)]'
                      : 'text-primary drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]',
                  ]"
                >
                  {{ float.critical ? `CRIT +${float.value.toFixed(1)}` : `+${float.value.toFixed(1)}` }}
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between text-sm text-muted-foreground">
              <span>Strike window: {{ targetWindow.toFixed(0) }}%</span>
              <span>Rhythm: {{ sliderStep.toFixed(2) }}</span>
            </div>

            <button type="button" :class="strikeButtonClasses" :disabled="!hasActiveContract" @click="attemptStrike">
              <Hammer class="h-5 w-5" />
              Strike
            </button>
          </div>
        </div>
        <div
          v-else
          class="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-border/60 bg-card/80 p-6 text-center text-muted-foreground backdrop-blur"
        >
          <Hammer class="mb-3 h-10 w-10 text-primary" />
          <p class="text-lg font-semibold text-foreground">Awaiting Commission</p>
          <p class="mt-1 text-sm">
            Accept a contract to prepare the forge controls and begin crafting.
          </p>
        </div>

        <div class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur">
          <h2 class="text-2xl font-semibold text-foreground">Upgrades &amp; Guild Support</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Spend gold to enhance your forge. Upgrades persist until you claim victory.
          </p>

          <div class="mt-6 space-y-4">
            <div
              v-for="blueprint in upgrades"
              :key="blueprint.id"
              class="rounded-lg border border-border/60 bg-card/70 p-4 backdrop-blur"
            >
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-base font-semibold text-foreground">
                    {{ blueprint.name }}
                  </p>
                  <p class="text-sm text-muted-foreground">
                    {{ blueprint.description }}
                  </p>
                  <p class="text-xs font-medium text-foreground">
                    {{ getUpgradeStats(blueprint) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-sm text-primary">
                    Lv {{ getUpgradeLevel(blueprint.id) }} / {{ blueprint.maxLevel ?? "unlimited" }}
                  </p>
                  <p class="text-xs text-muted-foreground">Cost: {{ getUpgradeCost(blueprint).toLocaleString() }}</p>
                </div>
              </div>

              <button
                type="button"
                class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/20 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/30 disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-muted/40 disabled:text-muted-foreground"
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

<style scoped>
.float-indicator {
  animation: float-up 0.8s ease-out forwards;
}

@keyframes float-up {
  0% {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  60% {
    opacity: 1;
    transform: translate(-50%, -14px);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -24px);
  }
}
</style>

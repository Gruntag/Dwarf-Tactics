<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import { toast } from "@/composables/useToast";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import {
  ArrowLeft,
  Diamond,
  Pickaxe,
  Users,
  Zap,
  TrendingUp,
  Trophy,
} from "lucide-vue-next";
import { cn } from "@/lib/utils";

type UpgradeCategory = "click" | "auto" | "final";

interface UpgradeTemplate {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  multiplier: number;
  icon: Component;
  category: UpgradeCategory;
  bonus: number;
}

interface Upgrade extends UpgradeTemplate {
  level: number;
}

interface StoredUpgradeLevel {
  id: string;
  level: number;
}

interface PersistedState {
  gems: number;
  totalGemsEarned: number;
  clickPower: number;
  gemsPerSecond: number;
  levels: StoredUpgradeLevel[];
}

const STORAGE_KEY = "gem_miner_save";

const upgradeTemplates: UpgradeTemplate[] = [
  { id: "click1", name: "Sharper Pickaxe", description: "+1 gem/click", baseCost: 10, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 1 },
  { id: "auto1", name: "Goblin Miner", description: "+1 gem/sec", baseCost: 50, multiplier: 1.2, icon: Users, category: "auto", bonus: 1 },
  { id: "click2", name: "Iron Pickaxe", description: "+2 gems/click", baseCost: 100, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 2 },
  { id: "auto2", name: "Dwarf Foreman", description: "+5 gems/sec", baseCost: 500, multiplier: 1.25, icon: Zap, category: "auto", bonus: 5 },
  { id: "click3", name: "Steel Pickaxe", description: "+5 gems/click", baseCost: 1000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 5 },
  { id: "auto3", name: "Dark Enchantment", description: "+25 gems/sec", baseCost: 5000, multiplier: 1.3, icon: TrendingUp, category: "auto", bonus: 25 },
  { id: "click4", name: "Mithril Pickaxe", description: "+10 gems/click", baseCost: 10000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 10 },
  { id: "auto4", name: "Skeleton Crew", description: "+50 gems/sec", baseCost: 25000, multiplier: 1.3, icon: Users, category: "auto", bonus: 50 },
  { id: "click5", name: "Obsidian Pickaxe", description: "+25 gems/click", baseCost: 50000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 25 },
  { id: "auto5", name: "Shadow Miners", description: "+100 gems/sec", baseCost: 100000, multiplier: 1.35, icon: Zap, category: "auto", bonus: 100 },
  { id: "click6", name: "Cursed Pickaxe", description: "+50 gems/click", baseCost: 250000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 50 },
  { id: "auto6", name: "Necromancer", description: "+250 gems/sec", baseCost: 500000, multiplier: 1.35, icon: TrendingUp, category: "auto", bonus: 250 },
  { id: "click7", name: "Dragon Pickaxe", description: "+100 gems/click", baseCost: 1000000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 100 },
  { id: "auto7", name: "Dark Portal", description: "+500 gems/sec", baseCost: 2500000, multiplier: 1.4, icon: Users, category: "auto", bonus: 500 },
  { id: "click8", name: "Demon Pickaxe", description: "+250 gems/click", baseCost: 5000000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 250 },
  { id: "auto8", name: "Lich King", description: "+1000 gems/sec", baseCost: 10000000, multiplier: 1.4, icon: Zap, category: "auto", bonus: 1000 },
  { id: "click9", name: "Void Pickaxe", description: "+500 gems/click", baseCost: 25000000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 500 },
  { id: "auto9", name: "Abyssal Mine", description: "+2500 gems/sec", baseCost: 50000000, multiplier: 1.45, icon: TrendingUp, category: "auto", bonus: 2500 },
  { id: "click10", name: "Cosmic Pickaxe", description: "+1000 gems/click", baseCost: 100000000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 1000 },
  { id: "auto10", name: "Demon Army", description: "+5000 gems/sec", baseCost: 250000000, multiplier: 1.45, icon: Users, category: "auto", bonus: 5000 },
  { id: "click11", name: "Eldritch Pickaxe", description: "+2500 gems/click", baseCost: 500000000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 2500 },
  { id: "auto11", name: "Void Rift", description: "+10000 gems/sec", baseCost: 1000000000, multiplier: 1.5, icon: Zap, category: "auto", bonus: 10000 },
  { id: "click12", name: "Godslayer Pickaxe", description: "+5000 gems/click", baseCost: 2500000000, multiplier: 1.15, icon: Pickaxe, category: "click", bonus: 5000 },
  { id: "auto12", name: "Apocalypse", description: "+25000 gems/sec", baseCost: 5000000000, multiplier: 1.5, icon: TrendingUp, category: "auto", bonus: 25000 },
  { id: "final", name: "Eternal Darkness", description: "+100000 gems/sec", baseCost: 10000000000, multiplier: 1.6, icon: Diamond, category: "final", bonus: 100000 },
];

const router = useRouter();
const GEM_RESOURCE_KEY = "gemMiner" as const;
const gemResource = RESOURCES[GEM_RESOURCE_KEY];
const gemCaches = ref(getResourceCount(GEM_RESOURCE_KEY));
const gems = ref(0);
const totalGemsEarned = ref(0);
const clickPower = ref(1);
const gemsPerSecond = ref(0);
const activeTab = ref<"click" | "auto">("click");
const upgrades = ref<Upgrade[]>(upgradeTemplates.map((item) => ({ ...item, level: 0 })));

const currentGemsDisplay = computed(() => Math.floor(gems.value).toLocaleString());
const totalGemsDisplay = computed(() => Math.floor(totalGemsEarned.value).toLocaleString());
const perSecondDisplay = computed(() => gemsPerSecond.value.toFixed(1));

const clickUpgrades = computed(() => upgrades.value.filter((upgrade) => upgrade.category === "click"));
const autoUpgrades = computed(() => upgrades.value.filter((upgrade) => upgrade.category === "auto" || upgrade.category === "final"));

const unlockedClickUpgrades = computed(() =>
  clickUpgrades.value.filter((upgrade) => isUnlocked(upgrade.id)),
);
const unlockedAutoUpgrades = computed(() =>
  autoUpgrades.value.filter((upgrade) => isUnlocked(upgrade.id)),
);

const getUpgradeCost = (upgrade: Upgrade) => Math.floor(upgrade.baseCost * Math.pow(upgrade.multiplier, upgrade.level));

const isUnlocked = (id: string) => {
  const index = upgrades.value.findIndex((upgrade) => upgrade.id === id);
  if (index <= 0) return true;
  const previous = upgrades.value[index - 1];
  return previous.level > 0;
};

const canAfford = (upgrade: Upgrade) => gems.value >= getUpgradeCost(upgrade);

const formatCost = (upgrade: Upgrade) => getUpgradeCost(upgrade).toLocaleString();

const mine = () => {
  gems.value += clickPower.value;
  totalGemsEarned.value += clickPower.value;
};

const purchaseUpgrade = (id: string) => {
  const upgrade = upgrades.value.find((entry) => entry.id === id);
  if (!upgrade) {
    return;
  }

  const cost = getUpgradeCost(upgrade);
  if (gems.value < cost) {
    toast({
      title: "Not Enough Gems",
      description: `You need ${(cost - gems.value).toLocaleString()} more gems`,
      variant: "destructive",
    });
    return;
  }

  gems.value -= cost;
  upgrade.level += 1;

  if (upgrade.category === "click") {
    clickPower.value += upgrade.bonus;
  } else {
    gemsPerSecond.value += upgrade.bonus;
    if (upgrade.category === "final" && upgrade.level === 1) {
      const newTotal = addResource(GEM_RESOURCE_KEY);
      gemCaches.value = newTotal;
      toast({
        title: "VICTORY!",
        description: `You've conquered the darkness. ${gemResource.plural}: ${newTotal}`,
        variant: "success",
      });
    } else {
      toast({
        title: "Upgrade Purchased!",
        description: `${upgrade.name} level ${upgrade.level}`,
      });
    }
  }
};

const saveState = () => {
  const state: PersistedState = {
    gems: gems.value,
    totalGemsEarned: totalGemsEarned.value,
    clickPower: clickPower.value,
    gemsPerSecond: gemsPerSecond.value,
    levels: upgrades.value.map((upgrade) => ({ id: upgrade.id, level: upgrade.level })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const loadState = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (typeof parsed.gems === "number") gems.value = parsed.gems;
    if (typeof parsed.totalGemsEarned === "number") totalGemsEarned.value = parsed.totalGemsEarned;
    if (typeof parsed.clickPower === "number") clickPower.value = parsed.clickPower;
    if (typeof parsed.gemsPerSecond === "number") gemsPerSecond.value = parsed.gemsPerSecond;

    const levelMap = new Map<string, number>(
      (parsed.levels ?? []).map((entry) => [entry.id, entry.level]),
    );

    upgrades.value = upgradeTemplates.map((template) => ({
      ...template,
      level: levelMap.get(template.id) ?? 0,
    }));
  } catch (error) {
    console.error("Failed to load Gem Miner state", error);
    localStorage.removeItem(STORAGE_KEY);
  }
};

let miningInterval: ReturnType<typeof setInterval> | null = null;

const stopMining = () => {
  if (miningInterval) {
    clearInterval(miningInterval);
    miningInterval = null;
  }
};

const startMining = () => {
  stopMining();
  if (gemsPerSecond.value <= 0) return;

  miningInterval = setInterval(() => {
    const increment = gemsPerSecond.value / 10;
    gems.value += increment;
    totalGemsEarned.value += increment;
  }, 100);
};

onMounted(() => {
  loadState();
  startMining();
});

onBeforeUnmount(() => {
  stopMining();
});

watch([gems, totalGemsEarned, clickPower, gemsPerSecond, upgrades], saveState, { deep: true });
watch(gemsPerSecond, () => {
  startMining();
});

const goHome = () => {
  router.push("/");
};

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const upgradeButtonClasses = (enabled: boolean) =>
  cn(
    "mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary",
    enabled
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "border border-border bg-transparent text-muted-foreground opacity-60 cursor-not-allowed",
  );
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-game)] p-4 md:p-8">
    <div class="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px] animate-pulse" />

    <div class="relative z-10 mx-auto max-w-7xl">
      <div class="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="goHome">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="flex flex-col items-end gap-4 md:flex-row md:items-center md:gap-6">
          <div class="flex items-center gap-2 rounded-lg border border-border/50 bg-card/80 px-4 py-2 text-foreground backdrop-blur">
            <Trophy class="h-5 w-5 text-accent" />
            <div class="flex flex-col leading-tight text-right">
              <span class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ gemResource.plural }}</span>
              <span class="text-lg font-bold text-foreground">{{ gemCaches }}</span>
            </div>
          </div>

          <div class="text-right">
            <h1 class="text-4xl font-black tracking-tight text-foreground md:text-6xl">
              GEM MINER
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              Dark Fantasy Idle Mining
            </p>
          </div>
        </div>
      </div>

      <div class="mb-8 rounded-xl border border-border/50 bg-card/80 p-6 backdrop-blur">
        <div class="grid grid-cols-1 gap-4 text-center md:grid-cols-3">
          <div>
            <p class="mb-1 text-sm text-muted-foreground">Current Gems</p>
            <p class="text-3xl font-bold text-primary">
              <Diamond class="mr-2 inline h-6 w-6" />
              {{ currentGemsDisplay }}
            </p>
          </div>

          <div>
            <p class="mb-1 text-sm text-muted-foreground">Per Second</p>
            <p class="text-3xl font-bold text-accent">
              {{ perSecondDisplay }}/s
            </p>
          </div>

          <div>
            <p class="mb-1 text-sm text-muted-foreground">Total Mined</p>
            <p class="text-3xl font-bold text-foreground">
              {{ totalGemsDisplay }}
            </p>
          </div>
        </div>
      </div>

      <div class="grid gap-8 lg:grid-cols-2">
        <div class="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-border/50 bg-card/80 p-8 text-center backdrop-blur">
          <h2 class="mb-2 text-2xl font-bold text-foreground">Mine the Depths</h2>
          <p class="mb-8 text-muted-foreground">Click to extract gems from the dark caverns</p>

          <button type="button" class="group relative mb-8" @click="mine">
            <div class="absolute -inset-4 rounded-full bg-gradient-to-r from-primary via-accent to-primary opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
            <div class="relative rounded-full border-4 border-primary/50 bg-card/90 p-12 transition-all duration-300 group-hover:scale-105 group-hover:border-primary">
              <Diamond class="h-24 w-24 text-primary transition-colors duration-300 group-hover:text-accent" />
            </div>
          </button>

          <p class="mt-4 text-xl font-semibold text-foreground">
            <Pickaxe class="mr-2 inline h-5 w-5" />
            {{ clickPower }} gems per click
          </p>
        </div>

        <div class="rounded-xl border border-border/50 bg-card/80 p-8 backdrop-blur">
          <h2 class="mb-6 text-2xl font-bold text-foreground">Dark Upgrades</h2>

          <div class="mb-6 grid grid-cols-2 gap-2 rounded-lg border border-border p-1">
            <button
              type="button"
              class="rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              :class="activeTab === 'click' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'"
              @click="activeTab = 'click'"
            >
              <Pickaxe class="mr-2 inline h-4 w-4" />
              Per Click
            </button>
            <button
              type="button"
              class="rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
              :class="activeTab === 'auto' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'"
              @click="activeTab = 'auto'"
            >
              <Zap class="mr-2 inline h-4 w-4" />
              Per Second
            </button>
          </div>

          <div v-if="activeTab === 'click'" class="max-h-[520px] space-y-4 overflow-y-auto pr-2">
            <div
              v-for="upgrade in unlockedClickUpgrades"
              :key="upgrade.id"
              class="rounded-lg border border-border/50 bg-card/60 p-4 transition duration-300 hover:bg-card/80"
            >
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="rounded-lg bg-primary/20 p-2">
                    <component :is="upgrade.icon" class="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 class="font-bold text-foreground">{{ upgrade.name }}</h3>
                    <p class="text-sm text-muted-foreground">{{ upgrade.description }}</p>
                  </div>
                </div>
                <p class="text-right text-sm text-muted-foreground">
                  Level {{ upgrade.level }}
                </p>
              </div>

              <button
                type="button"
                :class="upgradeButtonClasses(canAfford(upgrade))"
                :disabled="!canAfford(upgrade)"
                @click="purchaseUpgrade(upgrade.id)"
              >
                <Diamond class="h-4 w-4" />
                Buy for {{ formatCost(upgrade) }}
              </button>
            </div>
          </div>

          <div v-else class="max-h-[520px] space-y-4 overflow-y-auto pr-2">
            <div
              v-for="upgrade in unlockedAutoUpgrades"
              :key="upgrade.id"
              class="rounded-lg border border-border/50 bg-card/60 p-4 transition duration-300 hover:bg-card/80"
            >
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="rounded-lg bg-primary/20 p-2">
                    <component :is="upgrade.icon" class="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 class="font-bold text-foreground">{{ upgrade.name }}</h3>
                    <p class="text-sm text-muted-foreground">{{ upgrade.description }}</p>
                  </div>
                </div>
                <p class="text-right text-sm text-muted-foreground">
                  Level {{ upgrade.level }}
                </p>
              </div>

              <button
                type="button"
                :class="upgradeButtonClasses(canAfford(upgrade))"
                :disabled="!canAfford(upgrade)"
                @click="purchaseUpgrade(upgrade.id)"
              >
                <Diamond class="h-4 w-4" />
                Buy for {{ formatCost(upgrade) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

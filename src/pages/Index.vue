<script setup lang="ts">
import { onMounted, ref, type Component } from "vue";
import { useRouter } from "vue-router";
import {
  Crown,
  Gamepad2,
  Sword,
  Shield,
  Hammer,
  Trophy,
  Coins,
  Skull,
  Flame,
  Diamond,
  Train,
} from "lucide-vue-next";
import gruntagDwarf from "@/assets/gruntag-dwarf.jpg";
import { getResourceSnapshots, type ResourceSnapshot } from "@/lib/resources";

interface Minigame {
  name: string;
  icon: Component;
  path?: string;
}

const router = useRouter();
const resourceVault = ref<ResourceSnapshot[]>([]);

const loadResourceVault = () => {
  resourceVault.value = getResourceSnapshots();
};

onMounted(() => {
  loadResourceVault();
});

const mountainKingGame: Minigame = {
  name: "Mountain King",
  icon: Crown,
  path: "/mountain-king",
};

const minigames: Minigame[] = [
  { name: "Battle Arena", icon: Sword, path: "/battle-arena" },
  { name: "Dwarven Defense", icon: Shield, path: "/dwarven-defense" },
  { name: "Forge Master", icon: Hammer, path: "/forge-master" },
  { name: "Trophy Hunt", icon: Trophy, path: "/trophy-hunt" },
  { name: "Gold Rush", icon: Coins, path: "/gold-rush" },
  { name: "Skull Crusher", icon: Skull, path: "/skull-crusher" },
  { name: "Dragon Fire", icon: Flame, path: "/dragon-fire" },
  { name: "Loot Train", icon: Train, path: "/loot-train" },
  { name: "Gem Miner", icon: Diamond, path: "/gem-miner" },
  { name: "Warrior's Challenge", icon: Gamepad2, path: "/warriors-challenge" },
];

const buttonClasses =
  "group flex h-16 items-center justify-center gap-3 rounded-lg border border-primary/40 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/10 px-6 text-lg font-semibold uppercase tracking-wide text-foreground transition duration-300 hover:from-primary/40 hover:to-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const handleNavigate = (path?: string) => {
  if (!path) return;
  router.push(path);
};
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
    <div class="absolute inset-0 bg-[var(--gradient-hero)]" />
    <div
      class="absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px] animate-pulse"
    />

    <main class="relative z-10 w-full max-w-6xl">
      <div class="mb-12 space-y-6 text-center">
        <h1
          class="bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-6xl font-black tracking-tight text-transparent drop-shadow-2xl md:text-8xl"
        >
          GRUNTAG
        </h1>
        <p class="text-xl font-semibold tracking-wide text-muted-foreground md:text-2xl">
          THE LEGENDARY DWARF
        </p>
      </div>

      <section class="mb-12 rounded-2xl border border-border/50 bg-card/80 p-6 shadow-[var(--shadow-game)] backdrop-blur">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <Trophy class="h-6 w-6 text-accent" />
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.35em] text-muted-foreground">Resource Vault</p>
              <p class="text-sm text-foreground/80">Spoils earned from each challenge</p>
            </div>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-md border border-primary/30 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            @click="loadResourceVault"
          >
            Refresh
          </button>
        </div>
        <div v-if="resourceVault.length" class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div
            v-for="snapshot in resourceVault"
            :key="snapshot.key"
            class="rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-right"
          >
            <p class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ snapshot.definition.plural }}</p>
            <p class="text-xl font-bold text-foreground">{{ snapshot.amount }}</p>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-muted-foreground">No spoils minted yet. Claim a resource to see it here.</p>
      </section>

      <div class="space-y-8">
        <h2 class="mb-12 text-center text-3xl font-bold tracking-wide text-foreground md:text-4xl">
          CHOOSE YOUR CHALLENGE
        </h2>

        <div class="flex flex-col items-center justify-center gap-8 lg:flex-row">
          <div class="flex w-full flex-col gap-4 lg:w-64">
            <button
              v-for="game in minigames.slice(0, 5)"
              :key="game.name"
              type="button"
              :class="buttonClasses"
              @click="handleNavigate(game.path)"
            >
              <component :is="game.icon" class="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
              {{ game.name }}
            </button>
          </div>

          <div class="group relative flex-shrink-0 pt-16">
            <button
              type="button"
              class="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full border border-primary/60 bg-card/90 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-foreground shadow-[var(--shadow-game)] transition hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary md:text-base"
              @click="handleNavigate(mountainKingGame.path)"
              aria-label="Enter the Mountain King challenge"
            >
              <component :is="mountainKingGame.icon" class="h-5 w-5 text-accent transition-transform duration-300 group-hover:scale-110" />
              {{ mountainKingGame.name }}
            </button>
            <div
              class="absolute inset-x-6 -top-6 bottom-6 rounded-lg bg-gradient-to-r from-primary via-accent to-primary opacity-75 blur-xl transition-opacity duration-500 group-hover:opacity-100"
            />
            <img
              :src="gruntagDwarf"
              alt="Gruntag the Angry Dwarf"
              class="relative w-full max-w-md rounded-lg border-4 border-primary/50 shadow-[var(--shadow-game)] transition-all duration-300 lg:max-w-lg"
            />
          </div>

          <div class="flex w-full flex-col gap-4 lg:w-64">
            <button
              v-for="game in minigames.slice(5, 10)"
              :key="game.name"
              type="button"
              :class="buttonClasses"
              @click="handleNavigate(game.path)"
            >
              <component :is="game.icon" class="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
              {{ game.name }}
            </button>
          </div>
        </div>
      </div>

      <div class="mt-16 text-center text-muted-foreground">
        <p class="text-sm tracking-widest">PREPARE FOR LEGENDARY BATTLES</p>
      </div>
    </main>
  </div>
</template>

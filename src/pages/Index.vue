<script setup lang="ts">
import { onMounted, ref, type Component } from "vue";
import { useRouter } from "vue-router";
import {
  Gamepad2,
  Sword,
  Shield,
  Hammer,
  Trophy,
  Coins,
  Skull,
  Flame,
  Crown,
  Diamond,
  Train,
} from "lucide-vue-next";
import gruntagDwarf from "@/assets/gruntag-dwarf.jpg";
import { getVictoryPoints } from "@/lib/victory-points";

interface Minigame {
  name: string;
  icon: Component;
  path?: string;
}

const router = useRouter();
const victoryPoints = ref(0);

onMounted(() => {
  victoryPoints.value = getVictoryPoints();
});

const minigames: Minigame[] = [
  { name: "Battle Arena", icon: Sword, path: "/battle-arena" },
  { name: "Shield Defense", icon: Shield, path: "/shield-defense" },
  { name: "Forge Master", icon: Hammer, path: "/forge-master" },
  { name: "Trophy Hunt", icon: Trophy, path: "/trophy-hunt" },
  { name: "Gold Rush", icon: Coins, path: "/gold-rush" },
  { name: "Skull Crusher", icon: Skull, path: "/skull-crusher" },
  { name: "Dragon Fire", icon: Flame, path: "/dragon-fire" },
  { name: "Loot Train", icon: Train, path: "/loot-train" },
  { name: "Gem Miner", icon: Diamond, path: "/gem-miner" },
  { name: "Warrior's Challenge", icon: Gamepad2, path: "/warriors-challenge" },
];

const mountainKingGame: Minigame = {
  name: "Mountain King",
  icon: Crown,
  path: "/mountain-king",
};

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
      <div class="absolute right-0 top-0 flex items-center gap-2 rounded-lg border border-border/50 bg-card/80 px-4 py-2 backdrop-blur">
        <Trophy class="h-5 w-5 text-accent" />
        <span class="text-lg font-bold text-foreground">{{ victoryPoints }}</span>
      </div>

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

          <div class="group relative flex-shrink-0">
            <div class="mb-6 flex justify-center">
              <button
                type="button"
                :class="buttonClasses"
                @click="handleNavigate(mountainKingGame.path)"
              >
                <component
                  :is="mountainKingGame.icon"
                  class="h-6 w-6 transition-transform duration-300 group-hover:scale-110"
                />
                {{ mountainKingGame.name }}
              </button>
            </div>

            <div
              class="absolute -inset-2 rounded-lg bg-gradient-to-r from-primary via-accent to-primary opacity-75 blur-xl transition-opacity duration-500 group-hover:opacity-100"
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

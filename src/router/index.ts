import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/pages/Index.vue"),
    },
    {
      path: "/gem-miner",
      name: "gem-miner",
      component: () => import("@/pages/GemMiner.vue"),
    },
    {
      path: "/battle-arena",
      name: "battle-arena",
      component: () => import("@/pages/BattleArena.vue"),
    },
    {
      path: "/forge-master",
      name: "forge-master",
      component: () => import("@/pages/ForgeMaster.vue"),
    },
    {
      path: "/trophy-hunt",
      name: "trophy-hunt",
      component: () => import("@/pages/TrophyHunt.vue"),
    },
    {
      path: "/shield-defense",
      name: "shield-defense",
      component: () => import("@/pages/ShieldDefense.vue"),
    },
    {
      path: "/gold-rush",
      name: "gold-rush",
      component: () => import("@/pages/GoldRush.vue"),
    },
    {
      path: "/skull-crusher",
      name: "skull-crusher",
      component: () => import("@/pages/SkullCrusher.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/pages/NotFound.vue"),
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;

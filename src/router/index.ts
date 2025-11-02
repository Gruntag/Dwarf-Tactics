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
      path: "/forge-master",
      name: "forge-master",
      component: () => import("@/pages/ForgeMaster.vue"),
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

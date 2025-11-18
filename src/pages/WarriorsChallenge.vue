<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Flame, HeartPulse, Shield, Sparkles, Sword, Swords, Timer, Trophy, Zap } from "lucide-vue-next";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import { toast } from "@/composables/useToast";

type Phase = "ready" | "playing" | "victory" | "defeat";
type CardType = "weapon" | "potion" | "buff";

interface CardTemplate {
  name: string;
  type: CardType;
  description: string;
  damage?: number;
  heal?: number;
  shield?: number;
  buff?: number;
  draw?: number;
}

interface Card extends CardTemplate {
  id: string;
}

interface EnemyTemplate {
  name: string;
  description: string;
  maxHp: number;
  damage: number;
  rewardPool: CardTemplate[];
  lootCount: [number, number];
}

interface Enemy extends EnemyTemplate {
  id: string;
  hp: number;
}

interface LogEntry {
  id: string;
  tone: "player" | "enemy" | "system";
  text: string;
}

const HAND_SIZE = 5;
const TOTAL_ENEMIES = 8;

const router = useRouter();

const phase = ref<Phase>("ready");
const CHALLENGE_RESOURCE_KEY = "warriorsChallenge" as const;
const valorResource = RESOURCES[CHALLENGE_RESOURCE_KEY];
const valorSeals = ref(getResourceCount(CHALLENGE_RESOURCE_KEY));

const drawPile = ref<Card[]>([]);
const discardPile = ref<Card[]>([]);
const hand = ref<Card[]>([]);

const enemyQueue = ref<EnemyTemplate[]>([]);
const activeEnemy = ref<Enemy | null>(null);

const defeatedEnemies = ref(0);
const cardsPlayed = ref(0);
const totalDamageDealt = ref(0);

const battleLog = ref<LogEntry[]>([]);

const playerState = reactive({
  hp: 36,
  maxHp: 36,
  shield: 0,
  damageBoost: 0,
});

const pointGranted = ref(false);

const totalCardsAvailable = computed(
  () => hand.value.length + drawPile.value.length + discardPile.value.length
);

const activeEnemyHpPercent = computed(() => {
  if (!activeEnemy.value) return 0;
  return Math.max(0, Math.round((activeEnemy.value.hp / activeEnemy.value.maxHp) * 100));
});

const isOutOfCards = computed(
  () => hand.value.length === 0 && drawPile.value.length === 0 && discardPile.value.length === 0
);

const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(16).slice(2)}`;

const shuffle = <T>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const createCard = (template: CardTemplate): Card => ({
  ...template,
  id: randomId(),
});

const starterDeckTemplates: CardTemplate[] = [
  { name: "Iron Slash", type: "weapon", description: "Deal 6 damage.", damage: 6 },
  { name: "Iron Slash", type: "weapon", description: "Deal 6 damage.", damage: 6 },
  { name: "Crushing Blow", type: "weapon", description: "Deal 8 damage. Lose any stored boost.", damage: 8 },
  { name: "Power Strike", type: "weapon", description: "Deal 5 damage. Consume damage boost for +4.", damage: 5 },
  { name: "Twin Daggers", type: "weapon", description: "Deal 3 damage twice.", damage: 3 },
  { name: "Battle Brew", type: "potion", description: "Heal 6 health.", heal: 6 },
  { name: "Steel Guard", type: "buff", description: "Gain 6 shield to absorb attacks.", shield: 6 },
  { name: "War Chant", type: "buff", description: "Next weapon gains +4 damage.", buff: 4 },
];

const weaponDrops: CardTemplate[] = [
  { name: "Inferno Axe", type: "weapon", description: "Deal 10 damage.", damage: 10 },
  { name: "Rune Spear", type: "weapon", description: "Deal 7 damage and draw a card.", damage: 7, draw: 1 },
  { name: "Blade Flurry", type: "weapon", description: "Deal 4 damage three times.", damage: 4 },
];

const potionDrops: CardTemplate[] = [
  { name: "Ember Tonic", type: "potion", description: "Heal 8 health.", heal: 8 },
  { name: "Stone Draught", type: "buff", description: "Gain 8 shield.", shield: 8 },
];

const buffDrops: CardTemplate[] = [
  { name: "Rallying Cry", type: "buff", description: "Next weapon gains +6 damage.", buff: 6 },
  { name: "Focus Elixir", type: "buff", description: "Draw two cards.", draw: 2 },
];

const enemyTemplates: EnemyTemplate[] = [
  {
    name: "Goblin Spearthrower",
    description: "Skirmisher that chips away from range.",
    maxHp: 18,
    damage: 4,
    rewardPool: [...weaponDrops, ...potionDrops],
    lootCount: [1, 2],
  },
  {
    name: "Orc Brute",
    description: "Heavy swings that batter your guard.",
    maxHp: 26,
    damage: 6,
    rewardPool: [...weaponDrops, ...buffDrops],
    lootCount: [1, 2],
  },
  {
    name: "Crystal Wraith",
    description: "Siphons life if allowed to linger.",
    maxHp: 22,
    damage: 5,
    rewardPool: [...potionDrops, ...buffDrops],
    lootCount: [2, 3],
  },
  {
    name: "Frostbound Knight",
    description: "Well armored challenger with punishing ripostes.",
    maxHp: 28,
    damage: 7,
    rewardPool: [...weaponDrops, ...buffDrops],
    lootCount: [1, 2],
  },
  {
    name: "Ember Drake",
    description: "Flame-lashed beast that scorches the arena.",
    maxHp: 30,
    damage: 8,
    rewardPool: [...weaponDrops, ...potionDrops],
    lootCount: [2, 3],
  },
  {
    name: "Dread Cultist",
    description: "Hexes weaken your strikes if ignored.",
    maxHp: 20,
    damage: 5,
    rewardPool: [...buffDrops, ...potionDrops],
    lootCount: [1, 2],
  },
  {
    name: "Shadow Assassin",
    description: "Fast cuts that slip beneath a weak guard.",
    maxHp: 24,
    damage: 6,
    rewardPool: [...weaponDrops, ...buffDrops],
    lootCount: [1, 2],
  },
  {
    name: "Runic Titan",
    description: "Immovable foe that hits like a siege ram.",
    maxHp: 34,
    damage: 9,
    rewardPool: [...weaponDrops, ...potionDrops, ...buffDrops],
    lootCount: [2, 3],
  },
];

const currentEnemy = computed(() => activeEnemy.value);

const currentEnemyName = computed(() => currentEnemy.value?.name ?? "No Foe");
const currentEnemyDescription = computed(() => currentEnemy.value?.description ?? "");

const goHome = () => {
  router.push("/");
};

const log = (tone: LogEntry["tone"], text: string) => {
  battleLog.value = [{ id: randomId(), tone, text }, ...battleLog.value].slice(0, 12);
};

const resetState = () => {
  phase.value = "ready";
  drawPile.value = [];
  discardPile.value = [];
  hand.value = [];
  enemyQueue.value = [];
  activeEnemy.value = null;
  defeatedEnemies.value = 0;
  cardsPlayed.value = 0;
  totalDamageDealt.value = 0;
  playerState.hp = playerState.maxHp;
  playerState.shield = 0;
  playerState.damageBoost = 0;
  battleLog.value = [];
  pointGranted.value = false;
};

const buildDeck = () => {
  const baseCards = starterDeckTemplates.map(createCard);
  drawPile.value = shuffle(baseCards);
  discardPile.value = [];
  hand.value = [];
};

const buildEnemyQueue = () => {
  const shuffled = shuffle(enemyTemplates);
  enemyQueue.value = shuffled.slice(0, TOTAL_ENEMIES);
};

const takeFromDrawPile = (): Card | null => {
  if (!drawPile.value.length) return null;
  const card = drawPile.value[drawPile.value.length - 1];
  drawPile.value = drawPile.value.slice(0, -1);
  return card;
};

const drawCards = (count: number) => {
  const nextHand = [...hand.value];
  for (let i = 0; i < count; i += 1) {
    if (!drawPile.value.length && discardPile.value.length) {
      drawPile.value = shuffle(discardPile.value);
      discardPile.value = [];
    }

    const card = takeFromDrawPile();
    if (!card) break;
    nextHand.push(card);
  }
  hand.value = nextHand;
};

const refillHand = () => {
  if (hand.value.length >= HAND_SIZE) return;
  const cardsNeeded = HAND_SIZE - hand.value.length;
  drawCards(cardsNeeded);
};

const spawnNextEnemy = () => {
  if (!enemyQueue.value.length) {
    activeEnemy.value = null;
    return;
  }
  const [nextEnemy, ...rest] = enemyQueue.value;
  enemyQueue.value = rest;
  activeEnemy.value = {
    ...nextEnemy,
    id: randomId(),
    hp: nextEnemy.maxHp,
  };
  log("enemy", `${nextEnemy.name} approaches: ${nextEnemy.description}`);
};

const grantLoot = (enemy: EnemyTemplate) => {
  const [min, max] = enemy.lootCount;
  const count = Math.max(1, Math.floor(Math.random() * (max - min + 1)) + min);
  if (!enemy.rewardPool.length) return;

  const lootCards: Card[] = [];
  for (let i = 0; i < count; i += 1) {
    const template = enemy.rewardPool[Math.floor(Math.random() * enemy.rewardPool.length)];
    lootCards.push(createCard(template));
  }

  if (!lootCards.length) return;

  discardPile.value = [...discardPile.value, ...lootCards];

  const lootNames = lootCards.map((card) => card.name).join(", ");
  log("system", `${enemy.name} drops ${lootNames}. They will be shuffled in soon.`);
  toast({
    title: "Loot Claimed",
    description: `${enemy.name} dropped: ${lootNames}`,
  });
};

const checkForCardExhaustion = () => {
  if (isOutOfCards.value) {
    log("system", "You are out of cards. The challenge ends here.");
    phase.value = "defeat";
  }
};

const handleEnemyAttack = () => {
  if (!activeEnemy.value) return;
  const enemy = activeEnemy.value;
  let incoming = enemy.damage;
  if (playerState.shield > 0) {
    const absorbed = Math.min(playerState.shield, incoming);
    playerState.shield -= absorbed;
    incoming -= absorbed;
    if (absorbed > 0) {
      log("system", `Your guard absorbs ${absorbed} damage.`);
    }
  }

  if (incoming > 0) {
    playerState.hp = Math.max(0, playerState.hp - incoming);
    log("enemy", `${enemy.name} strikes for ${incoming} damage.`);
  } else {
    log("enemy", `${enemy.name} cannot break through your guard.`);
  }

  if (playerState.hp <= 0) {
    log("system", "You collapse under the assault. The challenge ends.");
    phase.value = "defeat";
  }
};

const resolveEnemyDefeat = () => {
  if (!activeEnemy.value) return;
  const enemySnapshot = activeEnemy.value;
  grantLoot(enemySnapshot);
  defeatedEnemies.value += 1;
  activeEnemy.value = null;

  if (defeatedEnemies.value >= TOTAL_ENEMIES) {
    phase.value = "victory";
    log("system", "You stand among the fallen. The arena roars for you.");
    return;
  }

  spawnNextEnemy();
  refillHand();
  checkForCardExhaustion();
};

const resolveWeaponPlay = (card: Card) => {
  if (!activeEnemy.value) {
    log("system", "There is no enemy to strike.");
    return;
  }

  const enemy = activeEnemy.value;
  let totalDamage = card.damage ?? 0;

  if (card.name === "Twin Daggers") {
    let strikes = 2;
    totalDamage = 0;
    const perStrike = (card.damage ?? 0) + playerState.damageBoost;
    while (strikes > 0) {
      totalDamage += perStrike;
      strikes -= 1;
    }
  } else if (card.name === "Blade Flurry") {
    let strikes = 3;
    totalDamage = 0;
    const perStrike = (card.damage ?? 0) + playerState.damageBoost;
    while (strikes > 0) {
      totalDamage += perStrike;
      strikes -= 1;
    }
  } else {
    totalDamage += playerState.damageBoost;
  }

  if (playerState.damageBoost > 0) {
    log("system", `Damage boost adds ${playerState.damageBoost} power to your strike.`);
  }

  totalDamage = Math.max(0, totalDamage);
  enemy.hp = Math.max(0, enemy.hp - totalDamage);
  totalDamageDealt.value += totalDamage;

  log("player", `You use ${card.name}, dealing ${totalDamage} damage.`);

  if (card.name === "Crushing Blow") {
    playerState.damageBoost = 0;
  } else if (playerState.damageBoost > 0) {
    playerState.damageBoost = 0;
  }

  if (enemy.hp <= 0) {
    log("player", `${enemy.name} is defeated.`);
    resolveEnemyDefeat();
  } else {
    handleEnemyAttack();
  }
};

const resolvePotionPlay = (card: Card) => {
  if (card.heal) {
    const before = playerState.hp;
    playerState.hp = Math.min(playerState.maxHp, playerState.hp + card.heal);
    const restored = playerState.hp - before;
    log("player", `You drink ${card.name} and restore ${restored} health.`);
  }

  if (card.shield) {
    playerState.shield += card.shield;
    log("system", `${card.name} reinforces your guard by ${card.shield}.`);
  }

  if (card.draw) {
    drawCards(card.draw);
    log("system", `${card.name} lets you draw ${card.draw} extra card${card.draw > 1 ? "s" : ""}.`);
  }
};

const resolveBuffPlay = (card: Card) => {
  if (card.buff) {
    playerState.damageBoost += card.buff;
    log("system", `${card.name} builds a damage boost of ${card.buff}.`);
  }

  if (card.shield) {
    playerState.shield += card.shield;
    log("system", `${card.name} grants ${card.shield} shield.`);
  }

  if (card.draw) {
    drawCards(card.draw);
    log("system", `${card.name} draws ${card.draw} card${card.draw > 1 ? "s" : ""}.`);
  }
};

const discardCard = (card: Card) => {
  discardPile.value = [...discardPile.value, card];
};

const playCard = (cardId: string) => {
  if (phase.value !== "playing") return;
  const index = hand.value.findIndex((item) => item.id === cardId);
  if (index === -1) return;

  const card = hand.value[index];
  const nextHand = [...hand.value];
  nextHand.splice(index, 1);
  hand.value = nextHand;
  cardsPlayed.value += 1;

  switch (card.type) {
    case "weapon":
      resolveWeaponPlay(card);
      break;
    case "potion":
      resolvePotionPlay(card);
      if (phase.value === "playing" && activeEnemy.value) {
        handleEnemyAttack();
      }
      break;
    case "buff":
      resolveBuffPlay(card);
      if (phase.value === "playing" && activeEnemy.value) {
        handleEnemyAttack();
      }
      break;
    default:
      break;
  }

  discardCard(card);

  if (phase.value !== "playing") return;

  refillHand();
  checkForCardExhaustion();
};

const startGame = () => {
  resetState();
  buildDeck();
  buildEnemyQueue();
  drawCards(HAND_SIZE);
  spawnNextEnemy();
  refillHand();
  phase.value = "playing";
  log("system", "Warrior's Challenge begins. Spend your cards wisely.");
};

watch(
  () => phase.value,
  (next) => {
    if (next === "playing") {
      valorSeals.value = getResourceCount(CHALLENGE_RESOURCE_KEY);
    }
    if (next === "victory" && !pointGranted.value) {
      valorSeals.value = addResource(CHALLENGE_RESOURCE_KEY);
      pointGranted.value = true;
      toast({
        title: "Challenge Conquered",
        description: `You clear the arena and earn a ${valorResource.singular.toLowerCase()}.`,
        variant: "success",
      });
    }
  }
);

onMounted(() => {
  resetState();
});

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const actionButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";

const cardButtonClasses =
  "group relative flex w-full flex-col gap-2 rounded-xl border border-border/60 bg-card/70 px-4 py-4 text-left transition hover:border-primary/60 hover:bg-card/90";

const overlayTitle = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Arena Mastered";
    case "defeat":
      return playerState.hp <= 0 ? "You Fall" : "Deck Exhausted";
    default:
      return "Warrior's Challenge";
  }
});

const overlayMessage = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Every foe lies broken. Gruntag nods approval as the crowd erupts.";
    case "defeat":
      return playerState.hp <= 0
        ? "The arena medics drag you to safety. A sharper plan awaits next time."
        : "Your satchel runs dry. Without weapons, you must yield the arena.";
    default:
      return "Play weapon cards to strike foes, buff cards to build power, and potions to stay alive. Enemies drop new cards when slain. Survive all waves before you run out of options.";
  }
});

const overlayActionLabel = computed(() => {
  switch (phase.value) {
    case "victory":
      return "Challenge Again";
    case "defeat":
      return "Try Another Run";
    default:
      return "Begin Challenge";
  }
});

const cardAccentClass = (card: Card) => {
  switch (card.type) {
    case "weapon":
      return "border-orange-500/50 bg-gradient-to-b from-orange-500/20 to-orange-500/5";
    case "potion":
      return "border-emerald-500/40 bg-gradient-to-b from-emerald-500/20 to-emerald-500/5";
    case "buff":
      return "border-sky-500/40 bg-gradient-to-b from-sky-500/20 to-sky-500/5";
    default:
      return "";
  }
};
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-slate-950 py-10">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),_transparent_60%)]" />
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(59,130,246,0.12),_transparent_55%)]" />

    <main class="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 lg:flex-row">
      <div class="flex-1 space-y-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" :class="backButtonClasses" @click="goHome">
            <ArrowLeft class="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Return
          </button>

          <div class="flex items-center gap-2 rounded-lg border border-primary/30 bg-card/80 px-4 py-2 text-sm text-foreground backdrop-blur">
            <Trophy class="h-5 w-5 text-accent" />
            <div class="flex flex-col leading-tight text-right">
              <span class="text-[10px] uppercase tracking-widest text-muted-foreground">{{ valorResource.plural }}</span>
              <span class="text-lg font-semibold text-foreground">{{ valorSeals }}</span>
            </div>
          </div>
        </div>

        <section class="relative overflow-hidden rounded-3xl border border-primary/15 bg-slate-900/70 shadow-[0_20px_60px_rgba(15,23,42,0.55)] backdrop-blur">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.12),_transparent_65%)]" />
          <div class="relative px-6 pb-32 pt-6">
            <header class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">
                  Warrior's Challenge
                </p>
                <h1 class="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Arena Deck Duel
                </h1>
              </div>

              <div class="text-sm text-muted-foreground sm:max-w-md">
                <p>
                  Strike down each challenger before your options dwindle. Weapons hit hard, potions keep you standing, and buffs sharpen every swing.
                </p>
              </div>
            </header>

            <div class="mt-6 grid gap-6 lg:grid-cols-3">
              <div class="lg:col-span-2">
                <div class="flex flex-col gap-4 rounded-2xl border border-border/60 bg-slate-950/60 p-5">
                  <div class="flex items-center justify-between">
                    <div>
                      <h2 class="text-lg font-semibold text-foreground">{{ currentEnemyName }}</h2>
                      <p class="text-sm text-muted-foreground">{{ currentEnemyDescription }}</p>
                    </div>
                    <div class="flex items-center gap-4">
                      <div class="text-right">
                        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Remaining Foes
                        </p>
                        <p class="text-lg font-bold text-foreground">
                          {{ TOTAL_ENEMIES - defeatedEnemies }} / {{ TOTAL_ENEMIES }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-4">
                    <div class="relative h-24 w-24 flex-shrink-0 rounded-full border border-primary/30 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.25),_rgba(15,23,42,0.85))] shadow-[0_12px_40px_rgba(14,23,42,0.55)]">
                      <Sparkles class="absolute inset-0 m-auto h-10 w-10 text-accent" />
                    </div>
                    <div class="flex-1 space-y-4">
                      <div>
                        <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                          Enemy Health
                        </p>
                        <div class="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-800/70">
                          <div
                            class="h-full rounded-full bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300 transition-all duration-300"
                            :style="{ width: `${activeEnemyHpPercent}%` }"
                          />
                        </div>
                        <p v-if="currentEnemy" class="mt-1 text-xs font-semibold text-muted-foreground">
                          {{ currentEnemy.hp }} / {{ currentEnemy.maxHp }} HP
                        </p>
                      </div>

                      <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div class="flex items-center gap-2">
                          <Flame class="h-4 w-4 text-orange-400" />
                          Damage {{ currentEnemy?.damage ?? 0 }}
                        </div>
                        <div class="flex items-center gap-2">
                          <Shield class="h-4 w-4 text-sky-400" />
                          Your Shield {{ playerState.shield }}
                        </div>
                        <div class="flex items-center gap-2">
                          <HeartPulse class="h-4 w-4 text-emerald-400" />
                          Health {{ playerState.hp }} / {{ playerState.maxHp }}
                        </div>
                        <div class="flex items-center gap-2">
                          <Zap class="h-4 w-4 text-purple-400" />
                          Boost {{ playerState.damageBoost }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <aside class="flex flex-col gap-4 rounded-2xl border border-border/60 bg-slate-950/60 p-5">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Arena Notes
                  </p>
                  <p class="mt-2 text-sm text-muted-foreground">
                    Defeated enemies pile new weapons and brews into your discard. When the draw pile is empty, you will reshuffle and fight on.
                  </p>
                </div>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div class="rounded-xl border border-border/50 bg-slate-900/80 p-3">
                    <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Draw Pile</p>
                    <p class="mt-1 text-lg font-semibold text-foreground">{{ drawPile.length }}</p>
                  </div>
                  <div class="rounded-xl border border-border/50 bg-slate-900/80 p-3">
                    <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Discard</p>
                    <p class="mt-1 text-lg font-semibold text-foreground">{{ discardPile.length }}</p>
                  </div>
                  <div class="rounded-xl border border-border/50 bg-slate-900/80 p-3">
                    <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Hand</p>
                    <p class="mt-1 text-lg font-semibold text-foreground">{{ hand.length }}</p>
                  </div>
                  <div class="rounded-xl border border-border/50 bg-slate-900/80 p-3">
                    <p class="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cards Left</p>
                    <p class="mt-1 text-lg font-semibold text-foreground">{{ totalCardsAvailable }}</p>
                  </div>
                </div>
              </aside>
            </div>

            <div class="absolute inset-x-0 bottom-0">
              <div class="card-hand-background border-t border-primary/10 bg-slate-950/90 px-6 py-6 backdrop-blur">
                <p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Your Hand
                </p>
                <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <button
                    v-for="card in hand"
                    :key="card.id"
                    type="button"
                    :class="[cardButtonClasses, cardAccentClass(card)]"
                    @click="playCard(card.id)"
                  >
                    <div class="flex items-center justify-between">
                      <h3 class="text-base font-bold text-foreground">
                        {{ card.name }}
                      </h3>
                      <span
                        class="rounded-full border border-border/50 bg-card/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                      >
                        {{ card.type }}
                      </span>
                    </div>

                    <p class="text-xs text-muted-foreground">
                      {{ card.description }}
                    </p>

                    <div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span v-if="card.damage" class="inline-flex items-center gap-1">
                        <Sword class="h-3 w-3 text-orange-400" />
                        {{ card.damage }} dmg
                      </span>
                      <span v-if="card.heal" class="inline-flex items-center gap-1">
                        <HeartPulse class="h-3 w-3 text-emerald-400" />
                        +{{ card.heal }} hp
                      </span>
                      <span v-if="card.shield" class="inline-flex items-center gap-1">
                        <Shield class="h-3 w-3 text-sky-400" />
                        +{{ card.shield }} shield
                      </span>
                      <span v-if="card.buff" class="inline-flex items-center gap-1">
                        <Swords class="h-3 w-3 text-purple-400" />
                        +{{ card.buff }} boost
                      </span>
                      <span v-if="card.draw" class="inline-flex items-center gap-1">
                        <Timer class="h-3 w-3 text-amber-300" />
                        Draw {{ card.draw }}
                      </span>
                    </div>
                  </button>
                </div>

                <p v-if="hand.length === 0" class="mt-4 text-xs font-semibold uppercase tracking-[0.28em] text-rose-300">
                  No cards in hand - your satchel is empty.
                </p>
              </div>
            </div>

            <div
              v-if="phase !== 'playing'"
              class="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 backdrop-blur"
            >
              <div class="flex max-w-xl flex-col items-center gap-4 rounded-3xl border border-primary/25 bg-slate-900/80 px-10 py-12 text-center shadow-[0_30px_80px_rgba(14,23,42,0.6)]">
                <Sparkles class="h-10 w-10 text-accent" />
                <h2 class="text-2xl font-bold text-foreground sm:text-3xl">
                  {{ overlayTitle }}
                </h2>
                <p class="text-sm text-muted-foreground sm:text-base">
                  {{ overlayMessage }}
                </p>
                <button type="button" :class="actionButtonClasses" @click="startGame">
                  {{ overlayActionLabel }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-3xl border border-primary/15 bg-slate-900/70 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur">
          <h2 class="text-lg font-semibold text-foreground">Battle Log</h2>
          <ul class="mt-4 space-y-2 text-sm">
            <li
              v-for="entry in battleLog"
              :key="entry.id"
              :class="[
                'rounded-xl border px-4 py-3',
                entry.tone === 'player'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : entry.tone === 'enemy'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    : 'border-sky-500/30 bg-sky-500/10 text-sky-200',
              ]"
            >
              {{ entry.text }}
            </li>
          </ul>
        </section>
      </div>

      <aside class="w-full max-w-xs space-y-6">
        <div class="rounded-3xl border border-primary/15 bg-slate-900/60 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur">
          <h3 class="text-lg font-semibold text-foreground">Arena Metrics</h3>
          <dl class="mt-4 space-y-3 text-sm text-muted-foreground">
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Swords class="h-4 w-4 text-purple-400" />
                Cards Played
              </dt>
              <dd class="font-semibold text-foreground">{{ cardsPlayed }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Sword class="h-4 w-4 text-orange-400" />
                Total Damage
              </dt>
              <dd class="font-semibold text-foreground">{{ totalDamageDealt }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <HeartPulse class="h-4 w-4 text-emerald-400" />
                Health
              </dt>
              <dd class="font-semibold text-foreground">{{ playerState.hp }} / {{ playerState.maxHp }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Shield class="h-4 w-4 text-sky-400" />
                Shield
              </dt>
              <dd class="font-semibold text-foreground">{{ playerState.shield }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="flex items-center gap-2">
                <Timer class="h-4 w-4 text-amber-300" />
                Foes Defeated
              </dt>
              <dd class="font-semibold text-foreground">{{ defeatedEnemies }} / {{ TOTAL_ENEMIES }}</dd>
            </div>
          </dl>
        </div>

        <div class="rounded-3xl border border-primary/15 bg-slate-900/60 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.45)] backdrop-blur">
          <h3 class="text-lg font-semibold text-foreground">Combat Tips</h3>
          <ul class="mt-4 space-y-3 text-sm text-muted-foreground">
            <li class="flex items-start gap-3">
              <span class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-xs font-bold tracking-[0.25em] text-primary">
                1
              </span>
              <p>Buffs add damage or shield for the next exchanges. Try chaining a buff into a heavy weapon.</p>
            </li>
            <li class="flex items-start gap-3">
              <span class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-xs font-bold tracking-[0.25em] text-primary">
                2
              </span>
              <p>Potions keep you alive but still consume a turn. Use them before an enemy strike would finish you.</p>
            </li>
            <li class="flex items-start gap-3">
              <span class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/20 text-xs font-bold tracking-[0.25em] text-primary">
                3
              </span>
              <p>When your draw pile empties, your discard shuffles back in. If both run dry, the challenge ends.</p>
            </li>
          </ul>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.card-hand-background {
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>

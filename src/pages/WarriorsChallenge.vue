<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Flame, HeartPulse, Shield, Sparkles, Sword, Swords, Timer, Trophy, Zap } from "lucide-vue-next";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import { toast } from "@/composables/useToast";

type Phase = "ready" | "playing" | "reward" | "victory" | "defeat";

type CardEffect = "singleStrike" | "doubleStrike" | "tripleStrike" | "heal" | "boost" | "shield";

interface CardTemplate {
  name: string;
  effect: CardEffect;
  powerMultiplier: number;
  hitCount?: number;
  instant?: boolean;
}

interface Card extends CardTemplate {
  id: string;
  baseName: string;
  upgradeCount: number;
  description: string;
}

interface EnemyTemplate {
  name: string;
  description: string;
  strength: number;
  health: number;
  armor: number;
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

interface RewardOption {
  id: string;
  label: string;
  description: string;
  apply: () => void;
}

const HAND_SIZE = 5;
const TOTAL_ENEMIES = 8;
const REWARD_CHOICES = 3;
const BASE_PLAYER_HEALTH = 20;
const BASE_PLAYER_STRENGTH = 5;
const BASE_PLAYER_ARMOR = 0;
const MAX_ENEMY_ARMOR = 4;
const BASE_ENEMY_TOTAL = 10;
const ENEMY_TOTAL_STEP = 3;

const router = useRouter();
const CHALLENGE_RESOURCE_KEY = "warriorsChallenge" as const;
const valorResource = RESOURCES[CHALLENGE_RESOURCE_KEY];
const valorSeals = ref(getResourceCount(CHALLENGE_RESOURCE_KEY));

const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(16).slice(2)}`;

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const CARD_LIBRARY: CardTemplate[] = [
  { name: "Heroic Strike", effect: "singleStrike", powerMultiplier: 1.5, hitCount: 1 },
  { name: "Twin Lunge", effect: "doubleStrike", powerMultiplier: 0.9, hitCount: 2 },
  { name: "Blade Whirl", effect: "tripleStrike", powerMultiplier: 0.5, hitCount: 3 },
  { name: "Battle Salve", effect: "heal", powerMultiplier: 1.5 },
  { name: "Shield Wall", effect: "shield", powerMultiplier: 1, instant: true },
  { name: "War Hymn", effect: "boost", powerMultiplier: 0.5 },
  { name: "Quick Draught", effect: "heal", powerMultiplier: 0.6, instant: true },
  { name: "Guardian Pulse", effect: "shield", powerMultiplier: 0.6, instant: true },
  { name: "Quick Attack", effect: "singleStrike", powerMultiplier: 0.75, hitCount: 1, instant: true },
];

const cardEffectLabels: Record<CardEffect, string> = {
  singleStrike: "Single Attack",
  doubleStrike: "Twin Attack",
  tripleStrike: "Flurry",
  heal: "Heal",
  shield: "Shield",
  boost: "Boost",
};

const templateByName = (name: string): CardTemplate => {
  const template = CARD_LIBRARY.find((card) => card.name === name);
  if (!template) {
    throw new Error(`Unknown card template: ${name}`);
  }
  return { ...template };
};

const starterDeckTemplates: CardTemplate[] = [
  "Heroic Strike",
  "Heroic Strike",
  "Twin Lunge",
  "Blade Whirl",
  "Battle Salve",
  "Shield Wall",
  "War Hymn",
  "Quick Attack",
].map(templateByName);

const enemyBases = [
  { name: "Goblin Spearthrower", description: "Cowardly skirmisher pelting you from afar." },
  { name: "Orc Brute", description: "Heavy swings that batter your guard." },
  { name: "Crystal Wraith", description: "Siphons life if allowed to linger." },
  { name: "Frostbound Knight", description: "Well armored challenger with punishing ripostes." },
  { name: "Amber Drake", description: "Molten spit scorches armor clean off." },
  { name: "Warden Automaton", description: "Whirring blades and precise strikes." },
  { name: "Frost Revenant", description: "Steals warmth and resolve." },
  { name: "Arena Juggernaut", description: "Final challenger clad in iron plates." },
];

const generateEnemyTemplates = (): EnemyTemplate[] => {
  return enemyBases.slice(0, TOTAL_ENEMIES).map((base, index) => {
    const total = BASE_ENEMY_TOTAL + index * ENEMY_TOTAL_STEP;
    let armor = Math.min(MAX_ENEMY_ARMOR, Math.floor(total / 5));
    let remaining = total - armor;
    let strength = Math.max(2, Math.floor(remaining / 2));
    let healthUnits = remaining - strength;
    if (healthUnits < 1) {
      healthUnits = 1;
      strength = Math.max(2, remaining - healthUnits);
    }
    const health = Math.max(10, healthUnits * 10);
    return {
      name: base.name,
      description: base.description,
      strength,
      armor,
      health,
    };
  });
};

const enemyTemplates: EnemyTemplate[] = generateEnemyTemplates();

const phase = ref<Phase>("ready");
const drawPile = ref<Card[]>([]);
const discardPile = ref<Card[]>([]);
const hand = ref<Card[]>([]);
const enemyQueue = ref<EnemyTemplate[]>([]);
const activeEnemy = ref<Enemy | null>(null);
const defeatedEnemies = ref(0);
const cardsPlayed = ref(0);
const totalDamageDealt = ref(0);
const battleLog = ref<LogEntry[]>([]);
const rewardChoices = ref<RewardOption[]>([]);
const pointGranted = ref(false);

const playerState = reactive({
  strength: BASE_PLAYER_STRENGTH,
  armor: BASE_PLAYER_ARMOR,
  hp: BASE_PLAYER_HEALTH,
  maxHp: BASE_PLAYER_HEALTH,
  shield: 0,
  pendingBoost: 0,
});

const totalCardsAvailable = computed(() => hand.value.length + drawPile.value.length + discardPile.value.length);
const currentEnemy = computed(() => activeEnemy.value);
const currentEnemyName = computed(() => currentEnemy.value?.name ?? "No Foe");
const currentEnemyDescription = computed(() => currentEnemy.value?.description ?? "");
const activeEnemyHpPercent = computed(() => {
  if (!activeEnemy.value) return 0;
  return Math.max(0, Math.round((activeEnemy.value.hp / activeEnemy.value.health) * 100));
});
const isOutOfCards = computed(() => hand.value.length === 0 && drawPile.value.length === 0 && discardPile.value.length === 0);

const cardAccentClass = (card: Card) => {
  switch (card.effect) {
    case "singleStrike":
    case "doubleStrike":
    case "tripleStrike":
      return "border-orange-500/50 bg-gradient-to-b from-orange-500/20 to-orange-500/5";
    case "heal":
    case "shield":
      return "border-emerald-500/40 bg-gradient-to-b from-emerald-500/20 to-emerald-500/5";
    case "boost":
      return "border-sky-500/40 bg-gradient-to-b from-sky-500/20 to-sky-500/5";
    default:
      return "";
  }
};

const statDescriptions = {
  strength: "Damage dealt per attack before boosts.",
  health: "Damage you can take before defeat.",
  armor: "Flat damage reduction applied to each hit taken.",
  shield: "Temporary protection that absorbs hits before health.",
  boost: "Stored power bonus applied to your next card.",
  enemyStrength: "Damage the enemy deals before your armor and shield.",
  enemyHealth: "Enemy vitality. Reduce to zero to win.",
  enemyArmor: "Flat damage reduction applied to your attacks against the enemy.",
} as const;

const playerStats = computed(() => [
  { key: "strength", label: "Strength", value: playerState.strength, tooltip: statDescriptions.strength },
  {
    key: "health",
    label: "Health",
    value: `${playerState.hp} / ${playerState.maxHp}`,
    tooltip: statDescriptions.health,
  },
  { key: "armor", label: "Armor", value: playerState.armor, tooltip: statDescriptions.armor },
  { key: "shield", label: "Shield", value: playerState.shield, tooltip: statDescriptions.shield },
  {
    key: "boost",
    label: "Boost",
    value: `${Math.round(playerState.pendingBoost * 100)}%`,
    tooltip: statDescriptions.boost,
  },
]);

const enemyStats = computed(() => {
  const enemy = activeEnemy.value;
  if (!enemy) {
    return [
      { key: "enemyStrength", label: "Enemy Strength", value: "--", tooltip: statDescriptions.enemyStrength },
      { key: "enemyHealth", label: "Enemy Health", value: "--", tooltip: statDescriptions.enemyHealth },
      { key: "enemyArmor", label: "Enemy Armor", value: "--", tooltip: statDescriptions.enemyArmor },
    ];
  }
  return [
    { key: "enemyStrength", label: "Enemy Strength", value: enemy.strength, tooltip: statDescriptions.enemyStrength },
    { key: "enemyHealth", label: "Enemy Health", value: `${enemy.hp} / ${enemy.health}`, tooltip: statDescriptions.enemyHealth },
    { key: "enemyArmor", label: "Enemy Armor", value: enemy.armor, tooltip: statDescriptions.enemyArmor },
  ];
});

const describeCardStats = (card: Card) => {
  const baseStrength = playerState.strength;
  const perHit = Math.round(baseStrength * card.powerMultiplier);
  switch (card.effect) {
    case "singleStrike":
    case "doubleStrike":
    case "tripleStrike": {
      const hits = card.hitCount ?? 1;
      const total = perHit * hits;
      return hits > 1 ? `${perHit} dmg x ${hits} = ${total}` : `${total} damage`;
    }
    case "heal":
      return `Restore ${perHit} health`;
    case "shield":
      return `Gain ${perHit} shield`;
    case "boost":
      return `Store +${Math.round(card.powerMultiplier * 100)}% for your next card`;
    default:
      return "";
  }
};

const log = (tone: LogEntry["tone"], text: string) => {
  battleLog.value = [{ id: randomId(), tone, text }, ...battleLog.value].slice(0, 14);
};

const updateCardDescription = (card: Card): void => {
  const percent = Math.round(card.powerMultiplier * 100);
  switch (card.effect) {
    case "singleStrike":
    case "doubleStrike":
    case "tripleStrike": {
      const hits = card.hitCount ?? 1;
      card.description = `${card.instant ? "Instantly " : ""}deal ${hits} hit${hits > 1 ? "s" : ""} for ${percent}% of your strength each.`;
      break;
    }
    case "heal":
      card.description = `${card.instant ? "Instantly h" : "H"}eal ${percent}% of your strength.`;
      break;
    case "shield":
      card.description = `${card.instant ? "Instantly g" : "G"}ain ${percent}% of your strength as shield.`;
      break;
    case "boost":
      card.description = `Boost your next card by ${percent}%.`;
      break;
    default:
      card.description = "";
  }
};

const createCard = (template: CardTemplate): Card => {
  const card: Card = {
    ...template,
    id: randomId(),
    baseName: template.name,
    upgradeCount: 0,
    description: "",
  };
  updateCardDescription(card);
  return card;
};

const buildDeck = () => {
  drawPile.value = shuffle(starterDeckTemplates.map(createCard));
  discardPile.value = [];
  hand.value = [];
};

const buildEnemyQueue = () => {
  // Preserve the intended difficulty curve: first enemy uses the lowest total stats,
  // each subsequent enemy climbs by ENEMY_TOTAL_STEP.
  enemyQueue.value = enemyTemplates.slice(0, TOTAL_ENEMIES);
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
  drawCards(HAND_SIZE - hand.value.length);
};

const getAllCards = (): Card[] => [...drawPile.value, ...discardPile.value, ...hand.value];

const addCardToDeck = (card: Card) => {
  discardPile.value = [...discardPile.value, card];
  log("system", `${card.name} is added to your discard pile.`);
};

const upgradeRandomCard = () => {
  const pool = getAllCards();
  if (!pool.length) return;
  const target = pool[Math.floor(Math.random() * pool.length)];
  target.powerMultiplier = parseFloat((target.powerMultiplier * 1.5).toFixed(2));
  target.upgradeCount += 1;
  target.name = `${target.baseName}+${target.upgradeCount}`;
  updateCardDescription(target);
  log("system", `${target.name} surges with +50% effectiveness.`);
};

const spawnNextEnemy = () => {
  if (!enemyQueue.value.length) {
    activeEnemy.value = null;
    return;
  }
  const [template, ...rest] = enemyQueue.value;
  enemyQueue.value = rest;
  activeEnemy.value = { ...template, id: randomId(), hp: template.health };
  log("enemy", `${template.name} enters the arena: ${template.description}`);
};

const handleEnemyAttack = () => {
  if (!activeEnemy.value) return;
  const enemy = activeEnemy.value;
  let incoming = Math.max(0, enemy.strength - playerState.armor);
  if (playerState.shield > 0) {
    const absorbed = Math.min(playerState.shield, incoming);
    playerState.shield -= absorbed;
    incoming -= absorbed;
    if (absorbed > 0) log("system", `Shield absorbs ${absorbed} damage.`);
  }
  if (incoming > 0) {
    playerState.hp = Math.max(0, playerState.hp - incoming);
    log("enemy", `${enemy.name} strikes for ${incoming} damage.`);
  } else {
    log("enemy", `${enemy.name} cannot pierce your defenses.`);
  }
  if (playerState.hp <= 0) {
    log("system", "You collapse under the assault. The challenge ends.");
    phase.value = "defeat";
  }
};

const consumeBoostedMultiplier = (card: Card): number => {
  const boostFactor = 1 + playerState.pendingBoost;
  const effective = card.powerMultiplier * boostFactor;
  if (playerState.pendingBoost > 0) {
    log("system", `Stored boost adds ${Math.round(playerState.pendingBoost * 100)}% power.`);
  }
  playerState.pendingBoost = 0;
  return effective;
};

const executeAttack = (card: Card, hits: number) => {
  if (!activeEnemy.value) {
    log("system", "There is no enemy to strike.");
    return;
  }
  const enemy = activeEnemy.value;
  const perHit = Math.max(0, Math.round(playerState.strength * consumeBoostedMultiplier(card)));
  let totalDamage = 0;
  for (let i = 0; i < hits; i += 1) {
    const damage = Math.max(0, perHit - enemy.armor);
    enemy.hp = Math.max(0, enemy.hp - damage);
    totalDamage += damage;
  }
  totalDamageDealt.value += totalDamage;
  log("player", `${card.name} deals ${totalDamage} damage (${hits} hit${hits > 1 ? "s" : ""}).`);
  if (enemy.hp <= 0) {
    log("player", `${enemy.name} falls.`);
    resolveEnemyDefeat();
  }
};

const executeHeal = (card: Card) => {
  const amount = Math.max(0, Math.round(playerState.strength * consumeBoostedMultiplier(card)));
  const before = playerState.hp;
  playerState.hp = Math.min(playerState.maxHp, playerState.hp + amount);
  log("player", `${card.name} restores ${playerState.hp - before} health.`);
};

const executeShield = (card: Card) => {
  const amount = Math.max(0, Math.round(playerState.strength * consumeBoostedMultiplier(card)));
  playerState.shield += amount;
  log("system", `${card.name} grants ${amount} shield.`);
};

const executeCardEffect = (card: Card) => {
  switch (card.effect) {
    case "singleStrike":
    case "doubleStrike":
    case "tripleStrike":
      executeAttack(card, card.hitCount ?? 1);
      break;
    case "heal":
      executeHeal(card);
      break;
    case "shield":
      executeShield(card);
      break;
    case "boost":
      playerState.pendingBoost += card.powerMultiplier;
      log("system", `You store a ${Math.round(card.powerMultiplier * 100)}% boost for the next card.`);
      break;
    default:
      break;
  }
  if (!card.instant && phase.value === "playing" && activeEnemy.value) {
    handleEnemyAttack();
  }
};

const discardCard = (card: Card) => {
  discardPile.value = [...discardPile.value, card];
};

const playCard = (cardId: string) => {
  if (phase.value !== "playing") return;
  const index = hand.value.findIndex((card) => card.id === cardId);
  if (index === -1) return;
  const [card] = hand.value.splice(index, 1);
  cardsPlayed.value += 1;
  executeCardEffect(card);
  discardCard(card);
  if (phase.value !== "playing") return;
  refillHand();
  checkForCardExhaustion();
};

const checkForCardExhaustion = () => {
  if (isOutOfCards.value) {
    log("system", "You are out of cards. The challenge ends here.");
    phase.value = "defeat";
  }
};

const buildRewardChoices = () => {
  const rewardPool: Omit<RewardOption, "id">[] = [
    { label: "+1 Armor", description: "Reduce every incoming blow by one.", apply: () => { playerState.armor += 1; log("system", "Your armor is reinforced."); } },
    { label: "+1 Strength", description: "Increase the power of every card.", apply: () => { playerState.strength += 1; log("system", "Your strikes grow stronger."); } },
    { label: "+2 Health", description: "Raise max health and heal by two.", apply: () => { playerState.maxHp += 2; playerState.hp = Math.min(playerState.maxHp, playerState.hp + 2); log("system", "You catch your breath (+2 health)."); } },
    { label: "Gain Random Card", description: "Add a fresh card to your discard pile.", apply: () => addCardToDeck(createCard(CARD_LIBRARY[Math.floor(Math.random() * CARD_LIBRARY.length)])) },
    { label: "Empower Random Card", description: "Increase a random card's numbers by 50%.", apply: () => upgradeRandomCard() },
  ];
  rewardChoices.value = shuffle(rewardPool)
    .slice(0, REWARD_CHOICES)
    .map((option) => ({ ...option, id: randomId() }));
};

const resolveEnemyDefeat = () => {
  defeatedEnemies.value += 1;
  activeEnemy.value = null;
  if (defeatedEnemies.value >= TOTAL_ENEMIES) {
    phase.value = "victory";
    log("system", "You stand triumphant over the arena.");
    return;
  }
  buildRewardChoices();
  phase.value = "reward";
};

const claimReward = (choiceId: string) => {
  const reward = rewardChoices.value.find((option) => option.id === choiceId);
  if (!reward) return;
  reward.apply();
  rewardChoices.value = [];
  spawnNextEnemy();
  refillHand();
  checkForCardExhaustion();
  phase.value = "playing";
};

const skipRewardChoice = () => {
  if (!rewardChoices.value.length) return;
  rewardChoices.value = [];
  log("system", "You decline the arena's boons.");
  spawnNextEnemy();
  refillHand();
  checkForCardExhaustion();
  phase.value = "playing";
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
  playerState.strength = BASE_PLAYER_STRENGTH;
  playerState.armor = BASE_PLAYER_ARMOR;
  playerState.maxHp = BASE_PLAYER_HEALTH;
  playerState.hp = BASE_PLAYER_HEALTH;
  playerState.shield = 0;
  playerState.pendingBoost = 0;
  battleLog.value = [];
  rewardChoices.value = [];
  pointGranted.value = false;
};

const startGame = () => {
  resetState();
  buildDeck();
  buildEnemyQueue();
  drawCards(HAND_SIZE);
  spawnNextEnemy();
  refillHand();
  phase.value = "playing";
  log("system", "Warrior's Challenge begins. Play your cards wisely.");
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
  },
);

onMounted(() => {
  resetState();
});

const goHome = () => router.push("/");

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
      return "Every foe lies broken. The crowd roars for your strength.";
    case "defeat":
      return playerState.hp <= 0
        ? "Medics drag you aside. Return once your wounds knit."
        : "Your satchel runs dry. Without cards, you must yield.";
    default:
      return "Ready to prove your mettle?";
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

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const cardButtonClasses =
  "group relative flex w-full flex-col gap-2 rounded-xl border border-border/60 bg-card/70 px-4 py-4 text-left transition hover:border-primary/60 hover:bg-card/90";

</script>

<template>
  <div class="arena-page">
    <header class="top-bar">
      <button type="button" :class="backButtonClasses" @click="goHome">
        <ArrowLeft class="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Return
      </button>
      <div class="resource-pill">
        <Trophy class="h-5 w-5 text-accent" />
        <div class="text-right">
          <p class="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{{ valorResource.plural }}</p>
          <p class="text-lg font-bold">{{ valorSeals }}</p>
        </div>
      </div>
    </header>

    <section class="intro-panel">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.3em] text-primary/70">Warrior's Challenge</p>
        <h1 class="mt-1 text-3xl font-bold tracking-tight text-foreground">Arena Deck Duel</h1>
      </div>
      <p class="text-sm text-muted-foreground sm:max-w-xl">
        Strength fuels every card. Time your swings, mend between blows, and claim a single boon after each victory.
        Defeat {{ TOTAL_ENEMIES }} foes before your deck runs dry.
      </p>
      <button v-if="phase === 'ready'" type="button" class="cta-button" @click="startGame">
        Begin Challenge
      </button>
    </section>

    <section class="panel stats-panel">
      <header class="panel-header">
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-muted-foreground">Your Stand</p>
          <h2 class="text-xl font-semibold text-foreground">Battle-readiness</h2>
        </div>
      </header>
      <div class="stat-grid">
        <div
          v-for="stat in playerStats"
          :key="stat.key"
          class="stat-card"
          :title="stat.tooltip"
        >
          <p class="stat-label">{{ stat.label }}</p>
          <p class="stat-value">{{ stat.value }}</p>
        </div>
      </div>
    </section>

    <div class="content-grid">
      <section class="panel enemy-panel">
        <header class="panel-header">
          <div>
            <p class="text-xs uppercase tracking-[0.25em] text-muted-foreground">Current Foe</p>
            <h2 class="text-2xl font-semibold">{{ currentEnemyName }}</h2>
            <p class="text-sm text-muted-foreground">{{ currentEnemyDescription }}</p>
          </div>
          <div class="text-right text-xs text-muted-foreground">
            Remaining
            <p class="text-lg font-bold text-foreground">{{ TOTAL_ENEMIES - defeatedEnemies }} / {{ TOTAL_ENEMIES }}</p>
          </div>
        </header>

        <div class="mt-4">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Enemy Health</p>
          <div class="health-bar">
            <span class="health-fill" :style="{ width: `${activeEnemyHpPercent}%` }" />
          </div>
        </div>
        <div class="stat-grid mt-4">
          <div
            v-for="stat in enemyStats"
            :key="stat.key"
            class="stat-card"
            :title="stat.tooltip"
          >
            <p class="stat-label">{{ stat.label }}</p>
            <p class="stat-value">{{ stat.value }}</p>
          </div>
        </div>
      </section>

      <section class="panel hand-panel">
        <header class="panel-header">
          <div>
            <p class="text-xs uppercase tracking-[0.25em] text-muted-foreground">Your Hand</p>
            <h2 class="text-xl font-semibold text-foreground">Play a card</h2>
          </div>
          <p class="text-xs text-muted-foreground">Cards remaining: {{ totalCardsAvailable }}</p>
        </header>
        <div class="card-grid">
          <button
            v-for="card in hand"
            :key="card.id"
            type="button"
            :class="[cardButtonClasses, cardAccentClass(card)]"
            @click="playCard(card.id)"
          >
                    <div class="flex items-center justify-between">
                      <h3 class="text-base font-bold text-foreground">{{ card.name }}</h3>
                      <div class="flex items-center gap-2">
                        <span class="badge">{{ cardEffectLabels[card.effect] }}</span>
                        <span v-if="card.instant" class="badge badge-instant">Instant</span>
                      </div>
                    </div>
            <p class="text-xs text-muted-foreground">{{ card.description }}</p>
            <p class="text-[11px] font-semibold text-muted-foreground">{{ describeCardStats(card) }}</p>
          </button>
          <p v-if="!hand.length" class="text-xs uppercase tracking-[0.3em] text-rose-300">Satchel empty.</p>
        </div>
      </section>

      <section class="panel log-panel">
        <header class="panel-header">
          <p class="text-xs uppercase tracking-[0.25em] text-muted-foreground">Battle Log</p>
          <p class="text-xs text-muted-foreground">Latest events</p>
        </header>
        <ul class="space-y-2 text-sm">
          <li
            v-for="entry in battleLog"
            :key="entry.id"
            class="rounded-xl border px-3 py-2"
            :class="[
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

    <div
      v-if="phase === 'reward' && rewardChoices.length"
      class="overlay"
    >
      <div class="overlay-card">
        <p class="text-xs font-semibold uppercase tracking-[0.4em] text-primary/80">Victory Reward</p>
        <h3 class="text-2xl font-bold text-foreground mt-2">Choose one boon</h3>
        <p class="text-sm text-muted-foreground">Each victory grants a single boon. Choose wisely.</p>
        <div class="grid gap-4 sm:grid-cols-2">
          <button
            v-for="choice in rewardChoices"
            :key="choice.id"
            type="button"
            class="reward-card"
            @click="claimReward(choice.id)"
          >
            <p class="text-base font-semibold text-foreground">{{ choice.label }}</p>
            <p class="text-sm text-muted-foreground">{{ choice.description }}</p>
          </button>
        </div>
        <button type="button" class="skip-link" @click="skipRewardChoice">Skip reward</button>
      </div>
    </div>

    <div
      v-if="phase === 'victory' || phase === 'defeat'"
      class="overlay"
    >
      <div class="overlay-card text-center">
        <p class="text-xs font-semibold uppercase tracking-[0.4em] text-primary/80">{{ overlayTitle }}</p>
        <p class="text-sm text-muted-foreground mt-2">{{ overlayMessage }}</p>
        <button type="button" class="cta-button mt-4" @click="startGame">
          {{ overlayActionLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.arena-page {
  min-height: 100vh;
  background: radial-gradient(circle at top, rgba(148, 163, 184, 0.15), transparent 55%), #020617;
  padding: 2.5rem 1rem 4rem;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.resource-pill {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.9);
}

.intro-panel {
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 1.5rem;
  padding: 1.5rem;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cta-button {
  padding: 0.75rem 1.75rem;
  background: linear-gradient(90deg, #f97316, #facc15);
  color: #0f172a;
  font-weight: 600;
  border-radius: 999px;
  border: none;
  cursor: pointer;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.25rem;
}

.panel {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1.25rem;
  background: rgba(2, 6, 23, 0.8);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.health-bar {
  margin-top: 0.5rem;
  height: 0.75rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.7);
  overflow: hidden;
}

.health-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #f43f5e, #fb923c, #fde047);
  transition: width 0.3s ease;
}

.hand-panel .card-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.badge {
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  padding: 0 0.75rem;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.badge-instant {
  border-color: rgba(244, 114, 182, 0.8);
  background: rgba(244, 114, 182, 0.1);
}

.stats-panel {
  margin-bottom: 1.25rem;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.75rem;
}

.stat-card {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.85rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.6);
}

.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(226, 232, 240, 0.7);
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: #f8fafc;
  margin-top: 0.2rem;
}

.log-panel ul {
  max-height: none;
  min-height: 200px;
  overflow-y: auto;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 40;
}

.overlay-card {
  width: 100%;
  max-width: 480px;
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 1.5rem;
  background: rgba(2, 6, 23, 0.95);
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.reward-card {
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 1rem;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.8);
  text-align: left;
  transition: border-color 0.2s ease;
}

.reward-card:hover {
  border-color: rgba(248, 250, 252, 0.75);
}

.skip-link {
  border: none;
  background: transparent;
  color: rgba(248, 250, 252, 0.6);
  font-size: 0.85rem;
  text-decoration: underline;
  cursor: pointer;
}
</style>

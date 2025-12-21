<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { addResource, getResourceCount, RESOURCES } from "@/lib/resources";
import { toast } from "@/composables/useToast";
import { ArrowLeft, Award, Compass, Heart, Map as MapIcon, Repeat2, Train, Zap } from "lucide-vue-next";

type NodeType = "start" | "loot" | "camp" | "vault";
type CardRarity = "common" | "uncommon" | "rare";
type CardFocus = "train" | "grun" | "balanced";

interface TrackNode {
  id: string;
  column: number;
  row: number;
  type: NodeType;
  visited: boolean;
  resolved: boolean;
  connections: string[];
}

interface StepBonuses {
  costReduction?: number;
  gritGain?: number;
  cargoGain?: number;
  speedGain?: number;
  luckGain?: number;
  resourceBonus?: number;
}

interface InstantBonuses {
  grit?: number;
  gritMax?: number;
  cargo?: number;
}

interface CardDefinition {
  key: string;
  name: string;
  rarity: CardRarity;
  focus: CardFocus;
  description: string;
  step: StepBonuses;
  instant?: InstantBonuses;
}

const router = useRouter();
const lootResource = RESOURCES.lootTrain;
const lootCount = ref(getResourceCount("lootTrain"));

const TRACK_COLUMNS = 15;
const NODES_PER_COLUMN = 5;
const TRACK_ROWS = 9;
const BASE_STEP_COST = 2;

const nodes = ref<TrackNode[]>([]);
const currentNodeId = ref<string | null>(null);
const travelSteps = ref(0);
const visitedNodes = ref(1);
const travelLog = ref<string[]>([]);
const availableChoices = ref<CardDefinition[] | null>(null);
const restNodeId = ref<string | null>(null);
const runPhase = ref<"map" | "victory" | "defeat">("map");
const defeatReason = ref("Exhausted in the tunnels.");

const runStats = reactive({
  grit: 28,
  maxGrit: 28,
  cargo: 0,
  speed: 1,
  luck: 0,
});

const collectedCards = ref<CardDefinition[]>([]);
const sealProgress = ref(0);

const CARD_LIBRARY: CardDefinition[] = [
  {
    key: "mithril-brakes",
    name: "Mithril Brakes",
    rarity: "common",
    focus: "train",
    description: "Step bonus: -1 grit travel cost (min 1).",
    step: { costReduction: 1 },
  },
  {
    key: "vault-ale",
    name: "Vault Ale",
    rarity: "common",
    focus: "grun",
    description: "Step bonus: +2 grit after traveling.",
    step: { gritGain: 2 },
  },
  {
    key: "cargo-net",
    name: "Cargo Net",
    rarity: "common",
    focus: "train",
    description: "Step bonus: +1 cargo.",
    step: { cargoGain: 1 },
  },
  {
    key: "glimmer-lantern",
    name: "Glimmer Lantern",
    rarity: "common",
    focus: "balanced",
    description: "Step bonus: +1 luck.",
    step: { luckGain: 1 },
  },
  {
    key: "thrumming-rails",
    name: "Thrumming Rails",
    rarity: "uncommon",
    focus: "train",
    description: "Step bonus: +1 speed and +1 cargo.",
    step: { speedGain: 1, cargoGain: 1 },
  },
  {
    key: "heartforge-pulse",
    name: "Heartforge Pulse",
    rarity: "uncommon",
    focus: "grun",
    description: "Step bonus: +3 grit, +1 max grit immediately.",
    step: { gritGain: 3 },
    instant: { gritMax: 1, grit: 1 },
  },
  {
    key: "starlode",
    name: "Starlode Cache",
    rarity: "uncommon",
    focus: "balanced",
    description: "Step bonus: +1 cargo and +1 luck.",
    step: { cargoGain: 1, luckGain: 1 },
  },
  {
    key: "river-of-sparks",
    name: "River of Sparks",
    rarity: "rare",
    focus: "train",
    description: "Step bonus: -2 grit cost, +2 speed.",
    step: { costReduction: 2, speedGain: 2 },
  },
  {
    key: "grim-determination",
    name: "Grim Determination",
    rarity: "rare",
    focus: "grun",
    description: "Step bonus: +4 grit. Immediately +3 max grit.",
    step: { gritGain: 4 },
    instant: { gritMax: 3, grit: 3 },
  },
  {
    key: "vault-ledger",
    name: "Vault Ledger",
    rarity: "rare",
    focus: "balanced",
    description: "Step bonus: +1 cargo, +1 luck, +1 loot seal progress.",
    step: { cargoGain: 1, luckGain: 1, resourceBonus: 1 },
  },
  {
    key: "slag-chains",
    name: "Slag Chains",
    rarity: "common",
    focus: "train",
    description: "Step bonus: +2 cargo, -1 grit cost.",
    step: { cargoGain: 2, costReduction: 1 },
  },
  {
    key: "ember-rations",
    name: "Ember Rations",
    rarity: "common",
    focus: "grun",
    description: "Step bonus: +1 grit, +1 luck.",
    step: { gritGain: 1, luckGain: 1 },
  },
];

const CARD_LOOKUP = CARD_LIBRARY.reduce<Record<string, CardDefinition>>((map, card) => {
  map[card.key] = card;
  return map;
}, {});

const currentNode = computed(() => nodes.value.find((node) => node.id === currentNodeId.value) ?? null);

const nodePositions = computed(() => {
  const map = new Map<string, { x: number; y: number }>();
  const columnStep = TRACK_COLUMNS > 1 ? 100 / (TRACK_COLUMNS - 1) : 0;
  const rowStep = TRACK_ROWS > 1 ? 100 / (TRACK_ROWS - 1) : 0;
  nodes.value.forEach((node) => {
    map.set(node.id, {
      x: node.column * columnStep,
      y: node.row * rowStep,
    });
  });
  return map;
});

const connectionLines = computed(() =>
  nodes.value.flatMap((node) => {
    const start = nodePositions.value.get(node.id);
    if (!start) return [];
    return node.connections
      .filter((targetId) => node.id.localeCompare(targetId) < 0)
      .map((targetId) => {
        const end = nodePositions.value.get(targetId);
        if (!end) return null;
        return {
          id: `${node.id}-${targetId}`,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
        };
      })
      .filter(Boolean) as Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>;
  }),
);

const stepBonuses = computed(() =>
  collectedCards.value.reduce(
    (acc, card) => {
      acc.costReduction += card.step.costReduction ?? 0;
      acc.gritGain += card.step.gritGain ?? 0;
      acc.cargoGain += card.step.cargoGain ?? 0;
      acc.speedGain += card.step.speedGain ?? 0;
      acc.luckGain += card.step.luckGain ?? 0;
      acc.resourceBonus += card.step.resourceBonus ?? 0;
      return acc;
    },
    { costReduction: 0, gritGain: 0, cargoGain: 0, speedGain: 0, luckGain: 0, resourceBonus: 0 },
  ),
);

const nextStepCost = computed(() => Math.max(1, BASE_STEP_COST + travelSteps.value - stepBonuses.value.costReduction));

const reachableNodes = computed(() => {
  const curr = currentNode.value;
  if (!curr) return new Set<string>();
  return new Set(curr.connections);
});

const generateNode = (column: number, row: number, type: NodeType): TrackNode => ({
  id: crypto.randomUUID(),
  column,
  row,
  type,
  visited: column === 0,
  resolved: column === 0,
  connections: [],
});

const pickNodeType = () => (Math.random() < 0.2 ? "camp" : "loot");

const shuffle = <T>(list: T[]) => {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const buildGraph = () => {
  const columns: TrackNode[][] = [];
  const start = generateNode(0, Math.floor(TRACK_ROWS / 2), "start");
  columns.push([start]);

  for (let column = 1; column < TRACK_COLUMNS - 1; column += 1) {
    const columnNodes: TrackNode[] = [];
    for (let i = 0; i < NODES_PER_COLUMN; i += 1) {
      const jitter = Math.random() * 0.6;
      const row = Math.max(
        0,
        Math.min(TRACK_ROWS - 1, Math.round(((i + jitter) / (NODES_PER_COLUMN - 1)) * (TRACK_ROWS - 1))),
      );
      columnNodes.push(generateNode(column, row, pickNodeType()));
    }
    columns.push(columnNodes);
  }

  const vault = generateNode(TRACK_COLUMNS - 1, Math.floor(TRACK_ROWS / 2), "vault");
  columns.push([vault]);

  for (let c = 0; c < columns.length - 1; c += 1) {
    const currentColumn = columns[c];
    const nextColumn = columns[c + 1];
    currentColumn.forEach((node) => {
      const candidates = nextColumn.filter((target) => Math.abs(target.row - node.row) <= 2);
      const links = shuffle(candidates.length ? [...candidates] : [...nextColumn]).slice(0, 3);
      links.forEach((target) => {
        if (!node.connections.includes(target.id)) node.connections.push(target.id);
        if (!target.connections.includes(node.id)) target.connections.push(node.id);
      });
    });
  }

  nodes.value = columns.flat();
  currentNodeId.value = start.id;
};

const logStep = (message: string) => {
  travelLog.value = [message, ...travelLog.value].slice(0, 12);
};

const presentCardDraft = () => {
  const picks: CardDefinition[] = [];
  while (picks.length < 3) {
    const card = CARD_LIBRARY[Math.floor(Math.random() * CARD_LIBRARY.length)];
    picks.push(card);
  }
  availableChoices.value = picks;
};

const applyInstantBonuses = (card: CardDefinition) => {
  if (!card.instant) return;
  if (card.instant.gritMax) {
    runStats.maxGrit += card.instant.gritMax;
    runStats.grit += card.instant.gritMax;
  }
  if (card.instant.grit) {
    runStats.grit = Math.min(runStats.maxGrit, runStats.grit + card.instant.grit);
  }
  if (card.instant.cargo) {
    runStats.cargo += card.instant.cargo;
  }
};

const applyStepBonuses = () => {
  const bonuses = stepBonuses.value;
  if (bonuses.gritGain) {
    runStats.grit = Math.min(runStats.maxGrit, runStats.grit + bonuses.gritGain);
  }
  if (bonuses.cargoGain) {
    runStats.cargo += bonuses.cargoGain;
  }
  if (bonuses.speedGain) {
    runStats.speed += bonuses.speedGain;
  }
  if (bonuses.luckGain) {
    runStats.luck += bonuses.luckGain;
  }
  if (bonuses.resourceBonus) {
    sealProgress.value += bonuses.resourceBonus;
  }
};

const resolveNode = (node: TrackNode) => {
  if (node.type === "camp") {
    restNodeId.value = node.id;
  } else if (node.type === "vault") {
    presentCardDraft();
  } else {
    presentCardDraft();
  }
};

const completeVault = () => {
  runPhase.value = "victory";
  lootCount.value = addResource("lootTrain");
};

const moveToNode = (node: TrackNode) => {
  if (!reachableNodes.value.has(node.id)) return;
  const cost = nextStepCost.value;
  const forcedStep = runStats.grit < cost;
  if (forcedStep) {
    toast({
      title: "Grit exhausted",
      description: "Gruntag pushes onward anyway, but the convoy will fail after this move.",
      variant: "destructive",
    });
  }
  runStats.grit -= cost;
  travelSteps.value += 1;
  applyStepBonuses();
  currentNodeId.value = node.id;
  if (!node.visited) {
    node.visited = true;
    visitedNodes.value += 1;
  }
  logStep(`Moved to ${node.type.toUpperCase()} • Cost ${cost} grit`);
  if (!node.resolved) {
    resolveNode(node);
  }
  if (runStats.grit < 0 || forcedStep) {
    triggerDefeat("Gruntag collapses after forcing the convoy forward.");
  }
};

const handleNodeClick = (node: TrackNode) => {
  if (node.type === "start") return;
  if (!reachableNodes.value.has(node.id)) return;
  moveToNode(node);
};

const pickCard = (key: string) => {
  const card = CARD_LOOKUP[key];
  if (!card) return;
  collectedCards.value.push(card);
  applyInstantBonuses(card);
  availableChoices.value = null;
  const node = currentNode.value;
  if (node) {
    node.resolved = true;
    if (node.type === "vault") {
      completeVault();
    }
  }
};

const restAtCamp = (action: "grit" | "max" | "luck") => {
  if (!restNodeId.value) return;
  if (action === "grit") {
    runStats.grit = Math.min(runStats.maxGrit, runStats.grit + 10);
    logStep("Camped: +10 grit.");
  } else if (action === "max") {
    runStats.maxGrit += 2;
    runStats.grit += 2;
    logStep("Camped: +2 max grit.");
  } else if (action === "luck") {
    runStats.luck += 2;
    logStep("Camped: +2 luck.");
  }
  restNodeId.value = null;
  const node = currentNode.value;
  if (node && !node.resolved) {
    presentCardDraft();
  }
};

const triggerDefeat = (reason: string) => {
  defeatReason.value = reason;
  runPhase.value = "defeat";
  availableChoices.value = null;
  restNodeId.value = null;
};

const resetRun = () => {
  nodes.value = [];
  collectedCards.value = [];
  availableChoices.value = null;
  restNodeId.value = null;
  runPhase.value = "map";
  travelSteps.value = 0;
  visitedNodes.value = 1;
  travelLog.value = ["Convoy assembled at the outer station."];
  runStats.grit = 28;
  runStats.maxGrit = 28;
  runStats.cargo = 0;
  runStats.speed = 1;
  runStats.luck = 0;
  sealProgress.value = 0;
  buildGraph();
};

onMounted(() => {
  resetRun();
});
</script>

<template>
  <div class="loot-page">
    <header class="top-bar">
      <button type="button" class="back-button" @click="router.push('/')">
        <ArrowLeft class="icon" />
        Back
      </button>
      <div class="title-cluster">
        <Train class="icon" />
        <div>
          <p class="eyebrow">Final Expedition</p>
          <h1>Loot Train</h1>
        </div>
      </div>
      <button type="button" class="secondary-button" @click="resetRun">
        <Repeat2 class="icon" />
        Reset Run
      </button>
    </header>

    <section class="hero">
      <div>
        <p class="eyebrow">Deckbuilding Journey</p>
        <p>
          Guide Gruntag across a sprawling, non-linear tunnel map inspired by FTL. Every stop yields loot cards that
          grant bonuses each time you travel. Manage your grit—each step costs more than the last.
        </p>
      </div>
      <div class="resource-pill">
        <Award class="icon" />
        <div>
          <p class="label">{{ lootResource.plural }}</p>
          <p class="value">{{ lootCount }}</p>
        </div>
      </div>
    </section>

    <section class="stats-row">
      <div class="stat-card">
        <Heart class="icon" />
        <div>
          <p class="label">Grit</p>
          <p class="value">{{ runStats.grit }} / {{ runStats.maxGrit }}</p>
          <p class="sub">Next step cost: {{ nextStepCost }}</p>
        </div>
      </div>
      <div class="stat-card">
        <Compass class="icon" />
        <div>
          <p class="label">Convoy Pace</p>
          <p class="value">Speed {{ runStats.speed }}</p>
          <p class="sub">Luck {{ runStats.luck }}</p>
        </div>
      </div>
      <div class="stat-card">
        <Zap class="icon" />
        <div>
          <p class="label">Cargo Tally</p>
          <p class="value">{{ runStats.cargo }}</p>
          <p class="sub">{{ collectedCards.length }} loot cards collected</p>
        </div>
      </div>
    </section>

    <div class="playfield">
      <section class="map-panel">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Tunnel Cartography</p>
            <h2>Choose Your Path</h2>
          </div>
          <MapIcon class="icon" />
        </header>
        <div class="map-canvas">
          <svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              v-for="edge in connectionLines"
              :key="edge.id"
              :x1="edge.x1"
              :y1="edge.y1"
              :x2="edge.x2"
              :y2="edge.y2"
            />
          </svg>
          <button
            v-for="node in nodes"
            :key="node.id"
            type="button"
            class="map-node"
            :class="[
              `type-${node.type}`,
              { visited: node.visited, resolved: node.resolved, reachable: reachableNodes.has(node.id) },
              { current: currentNode?.id === node.id },
            ]"
            :style="{
              left: `${nodePositions.get(node.id)?.x ?? 0}%`,
              top: `${nodePositions.get(node.id)?.y ?? 0}%`,
            }"
            @click="handleNodeClick(node)"
          >
            <span>{{ node.type === "vault" ? "✦" : node.type === "camp" ? "☕" : node.type === "loot" ? "◇" : "S" }}</span>
          </button>
        </div>
        <p class="map-footnotes">
          Steps taken: {{ travelSteps }} • Nodes visited: {{ visitedNodes }} / {{ nodes.length }}
        </p>
      </section>

      <section class="journey-panel">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Journey Log</p>
            <h2>Bonuses & Notes</h2>
          </div>
        </header>

        <div class="bonus-summary">
          <p class="summary-title">Step Bonuses</p>
          <ul>
            <li>-{{ stepBonuses.costReduction }} grit travel cost</li>
            <li>+{{ stepBonuses.gritGain }} grit after moving</li>
            <li>+{{ stepBonuses.cargoGain }} cargo • +{{ stepBonuses.speedGain }} speed</li>
            <li>+{{ stepBonuses.luckGain }} luck • +{{ stepBonuses.resourceBonus }} seal progress</li>
          </ul>
        </div>

        <div class="card-inventory">
          <p class="summary-title">Collected Loot Cards</p>
          <p v-if="!collectedCards.length" class="empty">Collect cards to power each step.</p>
          <ul v-else>
            <li v-for="(card, index) in collectedCards" :key="`${card.key}-${index}`">
              <span class="card-name">{{ card.name }}</span>
              <span class="card-meta">{{ card.rarity }} • {{ card.focus }}</span>
            </li>
          </ul>
        </div>

        <div class="log-panel">
          <p class="summary-title">Recent Events</p>
          <ul>
            <li v-for="entry in travelLog" :key="entry">{{ entry }}</li>
          </ul>
        </div>
      </section>
    </div>

    <div v-if="availableChoices" class="overlay">
      <div class="overlay-card">
        <header>
          <h3>Choose New Loot</h3>
          <p>Each card grants bonuses automatically every step.</p>
        </header>
        <div class="draft-grid">
          <button
            v-for="card in availableChoices"
            :key="card.key"
            type="button"
            class="draft-card"
            @click="pickCard(card.key)"
          >
            <p class="card-title">{{ card.name }} <span>{{ card.rarity }}</span></p>
            <p class="card-body">{{ card.description }}</p>
            <p class="card-tag">{{ card.focus }} focus</p>
          </button>
        </div>
      </div>
    </div>

    <div v-if="restNodeId" class="overlay">
      <div class="overlay-card">
        <header>
          <h3>Campfire Choices</h3>
          <p>Recover before continuing.</p>
        </header>
        <div class="rest-grid">
          <button type="button" class="rest-button" @click="restAtCamp('grit')">
            <Heart class="icon" /> +10 grit
          </button>
          <button type="button" class="rest-button" @click="restAtCamp('max')">
            <Zap class="icon" /> +2 max grit
          </button>
          <button type="button" class="rest-button" @click="restAtCamp('luck')">
            <Compass class="icon" /> +2 luck
          </button>
        </div>
      </div>
    </div>

    <div v-if="runPhase === 'victory'" class="overlay">
      <div class="overlay-card">
        <header>
          <h3>Vault Secured</h3>
          <p>The loot train reaches the inner vault. A seal is awarded!</p>
        </header>
        <button type="button" class="secondary-button" @click="resetRun">Start New Run</button>
      </div>
    </div>

    <div v-if="runPhase === 'defeat'" class="overlay">
      <div class="overlay-card">
        <header>
          <h3>Convoy Lost</h3>
          <p>{{ defeatReason }}</p>
        </header>
        <button type="button" class="secondary-button" @click="resetRun">Try Again</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loot-page {
  min-height: 100vh;
  padding: 2.5rem 1.25rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  color: #e2e8f0;
  background: radial-gradient(circle at top, rgba(147, 197, 253, 0.3), transparent 65%), #030712;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.icon {
  width: 1rem;
  height: 1rem;
}

.back-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.8);
  color: inherit;
  font-weight: 600;
}

.title-cluster {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.eyebrow {
  font-size: 0.65rem;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}

.hero {
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 1.25rem;
  padding: 1.25rem;
  background: rgba(2, 6, 23, 0.85);
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.resource-pill {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 999px;
  padding: 0.5rem 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.stat-card {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1rem;
  background: rgba(1, 5, 15, 0.85);
  padding: 0.9rem;
  display: flex;
  gap: 0.75rem;
}

.label {
  font-size: 0.7rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}

.value {
  font-size: 1.4rem;
  font-weight: 700;
}

.sub {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.8);
}

.playfield {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 1.25rem;
}

.map-panel,
.journey-panel {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1.25rem;
  background: rgba(2, 6, 23, 0.85);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.map-canvas {
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1.2rem;
  min-height: 480px;
  background: radial-gradient(circle at center, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
}

.map-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.map-lines line {
  stroke: rgba(59, 130, 246, 0.35);
  stroke-width: 1.5;
}

.map-node {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 999px;
  border: 2px solid transparent;
  background: rgba(2, 6, 23, 0.6);
  color: #e2e8f0;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.map-node.type-loot {
  background: rgba(34, 197, 94, 0.25);
}

.map-node.type-camp {
  background: rgba(251, 191, 36, 0.25);
}

.map-node.type-vault {
  background: rgba(248, 113, 113, 0.3);
}

.map-node.visited {
  opacity: 0.65;
  border-color: rgba(148, 163, 184, 0.4);
}

.map-node.current {
  transform: translate(-50%, -50%) scale(1.15);
  border-color: rgba(251, 191, 36, 0.9);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.8);
}

.map-node.reachable {
  border-color: rgba(56, 189, 248, 0.8);
  cursor: pointer;
}

.map-footnotes {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.8);
}

.journey-panel .summary-title {
  font-size: 0.85rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.8);
}

.bonus-summary ul,
.card-inventory ul,
.log-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.card-inventory .empty {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.75);
}

.card-name {
  font-weight: 600;
}

.card-meta {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

.log-panel ul li {
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.95);
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 40;
}

.overlay-card {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1.5rem;
  background: rgba(1, 5, 15, 0.95);
  padding: 1.5rem;
  width: min(900px, 100%);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.draft-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.draft-card {
  border: 1px solid rgba(248, 250, 252, 0.25);
  border-radius: 0.9rem;
  padding: 0.85rem;
  text-align: left;
  background: rgba(15, 23, 42, 0.8);
  color: inherit;
}

.draft-card .card-title {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
}

.draft-card .card-tag {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(148, 163, 184, 0.75);
}

.rest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.rest-button {
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 0.9rem;
  padding: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(15, 23, 42, 0.6);
}

@media (max-width: 1024px) {
  .playfield {
    grid-template-columns: 1fr;
  }
  .map-canvas {
    min-height: 360px;
  }
}
</style>

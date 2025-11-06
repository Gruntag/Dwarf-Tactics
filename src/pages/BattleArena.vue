<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Crosshair, Flame, Hammer, HeartPulse, Snowflake, Sparkles, Sun, Target, Timer, Trophy } from "lucide-vue-next";
import { addVictoryPoint, getVictoryPoints } from "@/lib/victory-points";
import { toast } from "@/composables/useToast";

type Phase = "ready" | "running" | "paused" | "victory" | "game-over";

interface Entity {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  radius: number;
  hp: number;
  maxHp: number;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  pierce?: number;
  size?: number;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface WeaponDefinition {
  id: string;
  name: string;
  description: string;
  icon: Component;
  baseCooldown: number;
  minCooldown: number;
  cooldownScaling: number;
  rarityWeight: number;
}

interface WeaponPickup {
  id: string;
  x: number;
  y: number;
  weaponId: string;
  life: number;
  rotation: number;
}

interface BombPickup {
  id: string;
  x: number;
  y: number;
  life: number;
  rotation: number;
}

interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
}

const router = useRouter();

const BOARD_WIDTH = 960;
const BOARD_HEIGHT = 640;
const PLAYER_RADIUS = 18;

const victoryPoints = ref(getVictoryPoints());
const phase = ref<Phase>("ready");
const score = ref(0);
const elapsedMs = ref(0);
const bestKillStreak = ref(0);
const killCount = ref(0);
const currentStreak = ref(0);
const timeToSurviveMs = 90_000;

const player = reactive<Entity>({
  id: "player",
  x: BOARD_WIDTH / 2,
  y: BOARD_HEIGHT / 2,
  vx: 0,
  vy: 0,
  speed: 240,
  radius: PLAYER_RADIUS,
  hp: 100,
  maxHp: 100,
});

const enemies = reactive<Entity[]>([]);
const projectiles = reactive<Projectile[]>([]);
const particles = reactive<Particle[]>([]);
const weaponPickups = reactive<WeaponPickup[]>([]);
const bombPickups = reactive<BombPickup[]>([]);
const floatingTexts = reactive<FloatingText[]>([]);

const weaponDefinitions: WeaponDefinition[] = [
  {
    id: "skull-hammer",
    name: "Skull Hammer",
    description: "Fires a heavy hammer bolt toward the nearest foe.",
    icon: Hammer,
    baseCooldown: 420,
    minCooldown: 180,
    cooldownScaling: 0.25,
    rarityWeight: 1,
  },
  {
    id: "storm-scatter",
    name: "Storm Scatter",
    description: "Launches a tri-shot spread that blankets a lane.",
    icon: Sparkles,
    baseCooldown: 520,
    minCooldown: 260,
    cooldownScaling: 0.35,
    rarityWeight: 1.1,
  },
  {
    id: "glacier-lance",
    name: "Glacier Lance",
    description: "Piercing spear that tears through multiple enemies.",
    icon: Snowflake,
    baseCooldown: 640,
    minCooldown: 300,
    cooldownScaling: 0.4,
    rarityWeight: 0.9,
  },
  {
    id: "ember-ring",
    name: "Ember Ring",
    description: "Erupts a ring of ember bolts in all directions.",
    icon: Sun,
    baseCooldown: 680,
    minCooldown: 340,
    cooldownScaling: 0.45,
    rarityWeight: 0.8,
  },
];

const weaponById = weaponDefinitions.reduce<Record<string, WeaponDefinition>>((acc, weapon) => {
  acc[weapon.id] = weapon;
  return acc;
}, {});

const currentWeapon = ref<WeaponDefinition>(weaponDefinitions[0]);

const inputState = reactive({
  up: false,
  down: false,
  left: false,
  right: false,
});

let animationHandle: number | null = null;
let lastFrameTime = performance.now();
let shootCooldown = 0;
let spawnCooldown = 0;
let difficultyTimer = 0;
let enemySpeedBonus = 0;
let enemyHealthBonus = 0;
const previousDirections = reactive({ x: 1, y: 0 });
const weaponPickupLifetime = 16000;
const weaponDropBaseChance = 0.24;
const weaponDropBonusPerStreak = 0.015;
const bombPickupLifetime = 14000;
const bombDropBaseChance = 0.1;
const bombDropBonusPerStreak = 0.01;

const backButtonClasses =
  "group inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary";

const actionButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary via-accent to-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition hover:from-primary/90 hover:via-accent/90 hover:to-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent";

const overlayTitle = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Enter the Battle Arena";
    case "paused":
      return "Run Paused";
    case "victory":
      return "Arena Cleared";
    case "game-over":
      return "Gruntag Was Overrun";
    default:
      return "";
  }
});

const overlayDescription = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Survive waves of stalkers and keep moving. Your auto-hammer fires at nearby threatsâ€”stay in motion and gather kills.";
    case "paused":
      return "Catch your breath. Resume the onslaught when ready.";
    case "victory":
      return "You conquered the horde and lived to brag in Gruntag's hall. Claim your spoils and prepare for the next siege.";
    case "game-over":
      return "The swarm overwhelmed you. Rally your strength and dive back into the arena.";
    default:
      return "";
  }
});

const overlayActionLabel = computed(() => {
  switch (phase.value) {
    case "ready":
      return "Enter Arena";
    case "paused":
      return "Resume Battle";
    case "victory":
      return "Run Again";
    case "game-over":
      return "Try Again";
    default:
      return "Continue";
  }
});

const showOverlay = computed(() => phase.value !== "running");

const elapsedSeconds = computed(() => Math.floor(elapsedMs.value / 1000));
const timeRemaining = computed(() => Math.max(0, Math.ceil((timeToSurviveMs - elapsedMs.value) / 1000)));

const hpPercent = computed(() => (player.hp / player.maxHp) * 100);
const streakLabel = computed(() => Math.max(bestKillStreak.value, currentStreak.value));

const formatScore = computed(() => score.value.toLocaleString());
const currentWeaponName = computed(() => currentWeapon.value.name);
const currentWeaponDescription = computed(() => currentWeapon.value.description);
const currentWeaponIcon = computed(() => currentWeapon.value.icon);

const goHome = () => {
  router.push("/");
};

const resetPlayer = () => {
  player.x = BOARD_WIDTH / 2;
  player.y = BOARD_HEIGHT / 2;
  player.vx = 0;
  player.vy = 0;
  player.hp = player.maxHp;
};

const clearEntities = () => {
  enemies.splice(0, enemies.length);
  projectiles.splice(0, projectiles.length);
  particles.splice(0, particles.length);
  weaponPickups.splice(0, weaponPickups.length);
  bombPickups.splice(0, bombPickups.length);
  floatingTexts.splice(0, floatingTexts.length);
};

const resetGame = () => {
  clearEntities();
  resetPlayer();
  score.value = 0;
  elapsedMs.value = 0;
  killCount.value = 0;
  bestKillStreak.value = 0;
  currentStreak.value = 0;
  shootCooldown = 0;
  spawnCooldown = 0;
  difficultyTimer = 0;
  enemySpeedBonus = 0;
  enemyHealthBonus = 0;
  previousDirections.x = 1;
  previousDirections.y = 0;
  currentWeapon.value = weaponDefinitions[0];
};

const randomId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(16).slice(2)}`);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizedVector = (x: number, y: number) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

const rotateVector = (vector: { x: number; y: number }, radians: number) => {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
};

const spawnProjectile = (options: {
  x: number;
  y: number;
  speed: number;
  direction: { x: number; y: number };
  damage: number;
  life: number;
  pierce?: number;
  size?: number;
}) => {
  const { x, y, speed, direction, damage, life, pierce = 0, size = 12 } = options;
  projectiles.push({
    id: randomId(),
    x,
    y,
    vx: direction.x * speed,
    vy: direction.y * speed,
    damage,
    life,
    pierce,
    size,
  });
};

const getAimVector = () => {
  const nearest = enemies.reduce<{ enemy: Entity | null; dist: number }>(
    (acc, enemy) => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = dx * dx + dy * dy;
      if (!acc.enemy || dist < acc.dist) {
        return { enemy, dist };
      }
      return acc;
    },
    { enemy: null, dist: Infinity },
  ).enemy;

  let dirX = previousDirections.x;
  let dirY = previousDirections.y;

  if (nearest) {
    const normalized = normalizedVector(nearest.x - player.x, nearest.y - player.y);
    dirX = normalized.x;
    dirY = normalized.y;
    previousDirections.x = dirX;
    previousDirections.y = dirY;
  } else if (Math.abs(dirX) < 0.01 && Math.abs(dirY) < 0.01) {
    dirX = 1;
    dirY = 0;
  }

  return { direction: { x: dirX, y: dirY }, target: nearest };
};

const maybeDropWeapon = (x: number, y: number) => {
  if (weaponDefinitions.length <= 1) return;
  const available = weaponDefinitions.filter((weapon) => weapon.id !== currentWeapon.value.id);
  if (!available.length) return;
  const chance = Math.min(
    0.65,
    weaponDropBaseChance + Math.min(bestKillStreak.value, 10) * weaponDropBonusPerStreak,
  );
  if (Math.random() > chance) return;
  const totalWeight = available.reduce((acc, weapon) => acc + weapon.rarityWeight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = available[0];
  for (const weapon of available) {
    roll -= weapon.rarityWeight;
    if (roll <= 0) {
      chosen = weapon;
      break;
    }
  }
  weaponPickups.push({
    id: randomId(),
    x,
    y,
    weaponId: chosen.id,
    life: weaponPickupLifetime,
    rotation: Math.random() * Math.PI * 2,
  });
};

const maybeDropBomb = (x: number, y: number) => {
  const chance = Math.min(
    0.4,
    bombDropBaseChance + Math.min(bestKillStreak.value, 12) * bombDropBonusPerStreak,
  );
  if (Math.random() > chance) return;
  bombPickups.push({
    id: randomId(),
    x,
    y,
    life: bombPickupLifetime,
    rotation: Math.random() * Math.PI * 2,
  });
};

const updatePickups = (deltaMs: number) => {
  for (let i = weaponPickups.length - 1; i >= 0; i -= 1) {
    const pickup = weaponPickups[i];
    pickup.life -= deltaMs;
    pickup.rotation += deltaMs * 0.002;
    if (pickup.life <= 0) {
      weaponPickups.splice(i, 1);
    }
  }
};

const updateBombPickups = (deltaMs: number) => {
  for (let i = bombPickups.length - 1; i >= 0; i -= 1) {
    const pickup = bombPickups[i];
    pickup.life -= deltaMs;
    pickup.rotation += deltaMs * 0.0025;
    if (pickup.life <= 0) {
      bombPickups.splice(i, 1);
    }
  }
};

const updateFloatingTexts = (deltaMs: number) => {
  for (let i = floatingTexts.length - 1; i >= 0; i -= 1) {
    const text = floatingTexts[i];
    text.life += deltaMs;
    if (text.life >= text.maxLife) {
      floatingTexts.splice(i, 1);
    }
  }
};

const handlePickupCollisions = () => {
  for (let i = weaponPickups.length - 1; i >= 0; i -= 1) {
    const pickup = weaponPickups[i];
    const dx = pickup.x - player.x;
    const dy = pickup.y - player.y;
    if (Math.hypot(dx, dy) <= player.radius + 22) {
      const weapon = weaponById[pickup.weaponId];
      if (weapon) {
        currentWeapon.value = weapon;
        shootCooldown = 0;
        toast({
          title: `${weapon.name} Acquired`,
          description: weapon.description,
          variant: "info",
        });
        floatingTexts.push({
          id: randomId(),
          x: pickup.x,
          y: pickup.y,
          text: weapon.name,
          life: 0,
          maxLife: 1600,
        });
      }
      weaponPickups.splice(i, 1);
    }
  }
};

const handleBombCollisions = () => {
  for (let i = bombPickups.length - 1; i >= 0; i -= 1) {
    const pickup = bombPickups[i];
    const dx = pickup.x - player.x;
    const dy = pickup.y - player.y;
    if (Math.hypot(dx, dy) <= player.radius + 24) {
      bombPickups.splice(i, 1);
      floatingTexts.push({
        id: randomId(),
        x: pickup.x,
        y: pickup.y,
        text: "Bomb!",
        life: 0,
        maxLife: 1400,
      });
      const defeated = enemies.splice(0, enemies.length);
      if (defeated.length) {
        defeated.forEach((enemy) => {
          spawnShardBurst(enemy.x, enemy.y);
        });
        const gainedScore = defeated.length * 35;
        score.value += gainedScore;
        killCount.value += defeated.length;
        currentStreak.value += defeated.length;
        bestKillStreak.value = Math.max(bestKillStreak.value, currentStreak.value);
        toast({
          title: "Bomb Detonated",
          description: `You obliterated ${defeated.length} enemies for ${gainedScore} points.`,
          variant: "success",
        });
      }
    }
  }
};

const computeWeaponCooldown = () => {
  const weapon = currentWeapon.value;
  const scaled = weapon.baseCooldown - weapon.cooldownScaling * (elapsedMs.value / 10);
  return Math.max(weapon.minCooldown, scaled);
};

const spawnEnemy = () => {
  const spawnMargin = 40;
  const side = Math.floor(Math.random() * 4);
  let x = BOARD_WIDTH / 2;
  let y = BOARD_HEIGHT / 2;

  if (side === 0) {
    x = Math.random() * BOARD_WIDTH;
    y = spawnMargin;
  } else if (side === 1) {
    x = Math.random() * BOARD_WIDTH;
    y = BOARD_HEIGHT - spawnMargin;
  } else if (side === 2) {
    x = spawnMargin;
    y = Math.random() * BOARD_HEIGHT;
  } else {
    x = BOARD_WIDTH - spawnMargin;
    y = Math.random() * BOARD_HEIGHT;
  }

  enemies.push({
    id: randomId(),
    x,
    y,
    vx: 0,
    vy: 0,
    speed: 90 + enemySpeedBonus + Math.random() * 20,
    radius: 16,
    hp: 40 + enemyHealthBonus,
    maxHp: 40 + enemyHealthBonus,
  });
};

const spawnShardBurst = (x: number, y: number) => {
  for (let i = 0; i < 6; i += 1) {
    particles.push({
      id: randomId(),
      x: x + (Math.random() - 0.5) * 24,
      y: y + (Math.random() - 0.5) * 24,
      life: 0,
      maxLife: 450 + Math.random() * 200,
    });
  }
};

const fireCurrentWeapon = () => {
  const { direction } = getAimVector();
  const weaponId = currentWeapon.value.id;
  switch (weaponId) {
    case "storm-scatter": {
      const offsets = [-0.32, 0, 0.32];
      offsets.forEach((angle, index) => {
        const rotated = rotateVector(direction, angle);
        spawnProjectile({
          x: player.x,
          y: player.y,
          speed: 540,
          direction: rotated,
          damage: index === 1 ? 20 : 16,
          life: 1000,
        });
      });
      break;
    }
    case "glacier-lance": {
      spawnProjectile({
        x: player.x,
        y: player.y,
        speed: 640,
        direction,
        damage: 34,
        life: 1400,
        pierce: 2,
        size: 16,
      });
      break;
    }
    case "ember-ring": {
      const rays = 8;
      for (let i = 0; i < rays; i += 1) {
        const angle = (Math.PI * 2 * i) / rays;
        const rayDir = { x: Math.cos(angle), y: Math.sin(angle) };
        spawnProjectile({
          x: player.x,
          y: player.y,
          speed: 520,
          direction: rayDir,
          damage: 18,
          life: 900,
        });
      }
      break;
    }
    case "skull-hammer":
    default: {
      spawnProjectile({
        x: player.x,
        y: player.y,
        speed: 540,
        direction,
        damage: 26,
        life: 1100,
      });
      break;
    }
  }
};

const updateProjectiles = (deltaMs: number) => {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    projectile.x += projectile.vx * (deltaMs / 1000);
    projectile.y += projectile.vy * (deltaMs / 1000);
    projectile.life -= deltaMs;

    const outOfBounds =
      projectile.x < -40 || projectile.x > BOARD_WIDTH + 40 || projectile.y < -40 || projectile.y > BOARD_HEIGHT + 40;

    if (projectile.life <= 0 || outOfBounds) {
      projectiles.splice(i, 1);
    }
  }
};

const updateParticles = (deltaMs: number) => {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life += deltaMs;
    if (particle.life >= particle.maxLife) {
      particles.splice(i, 1);
    }
  }
};

const applyPlayerMovement = (deltaMs: number) => {
  let moveX = 0;
  let moveY = 0;

  if (inputState.up) moveY -= 1;
  if (inputState.down) moveY += 1;
  if (inputState.left) moveX -= 1;
  if (inputState.right) moveX += 1;

  if (moveX !== 0 || moveY !== 0) {
    const direction = normalizedVector(moveX, moveY);
    previousDirections.x = direction.x;
    previousDirections.y = direction.y;
    moveX = direction.x;
    moveY = direction.y;
  }

  player.x += moveX * player.speed * (deltaMs / 1000);
  player.y += moveY * player.speed * (deltaMs / 1000);

  player.x = clamp(player.x, PLAYER_RADIUS, BOARD_WIDTH - PLAYER_RADIUS);
  player.y = clamp(player.y, PLAYER_RADIUS, BOARD_HEIGHT - PLAYER_RADIUS);
};

const handleCollisions = () => {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);

    if (dist < enemy.radius + player.radius) {
      player.hp -= 8;
      currentStreak.value = 0;
      spawnShardBurst(player.x, player.y);
      const knockback = normalizedVector(dx, dy);
      player.x += knockback.x * 18;
      player.y += knockback.y * 18;
      enemies.splice(i, 1);
      continue;
    }

    for (let j = projectiles.length - 1; j >= 0; j -= 1) {
      const projectile = projectiles[j];
      const ddx = projectile.x - enemy.x;
      const ddy = projectile.y - enemy.y;
      if (ddx * ddx + ddy * ddy < (enemy.radius + 6) * (enemy.radius + 6)) {
        enemy.hp -= projectile.damage;
        if (projectile.pierce && projectile.pierce > 0) {
          projectile.pierce -= 1;
        } else {
          projectiles.splice(j, 1);
        }
        spawnShardBurst(enemy.x, enemy.y);
        if (enemy.hp <= 0) {
          maybeDropWeapon(enemy.x, enemy.y);
          maybeDropBomb(enemy.x, enemy.y);
          enemies.splice(i, 1);
          score.value += 35;
          killCount.value += 1;
          currentStreak.value += 1;
          bestKillStreak.value = Math.max(bestKillStreak.value, currentStreak.value);
        }
        break;
      }
    }
  }
};

const updateEnemies = (deltaMs: number) => {
  enemies.forEach((enemy) => {
    const direction = normalizedVector(player.x - enemy.x, player.y - enemy.y);
    const jitter = (Math.random() - 0.5) * 0.35;
    enemy.x += (direction.x + jitter) * enemy.speed * (deltaMs / 1000);
    enemy.y += (direction.y + jitter) * enemy.speed * (deltaMs / 1000);
    enemy.x = clamp(enemy.x, enemy.radius, BOARD_WIDTH - enemy.radius);
    enemy.y = clamp(enemy.y, enemy.radius, BOARD_HEIGHT - enemy.radius);
  });
};

const updateDifficulty = (deltaMs: number) => {
  difficultyTimer += deltaMs;
  if (difficultyTimer >= 15_000) {
    difficultyTimer = 0;
    enemySpeedBonus += 8;
    enemyHealthBonus += 6;
    spawnCooldown = Math.max(250, spawnCooldown - 25);
  }
};

const updateLoop = (timestamp: number) => {
  if (phase.value !== "running") {
    animationHandle = null;
    return;
  }

  const deltaMs = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  elapsedMs.value += deltaMs;
  shootCooldown -= deltaMs;
  spawnCooldown -= deltaMs;

  if (shootCooldown <= 0) {
    fireCurrentWeapon();
    shootCooldown = computeWeaponCooldown();
  }

  if (spawnCooldown <= 0) {
    spawnEnemy();
    spawnCooldown = Math.max(320, 1500 - elapsedMs.value / 10);
  }

  applyPlayerMovement(deltaMs);
  updateEnemies(deltaMs);
  updateProjectiles(deltaMs);
  updateParticles(deltaMs);
  updatePickups(deltaMs);
  updateBombPickups(deltaMs);
  handleCollisions();
  handlePickupCollisions();
  handleBombCollisions();
  updateFloatingTexts(deltaMs);
  updateDifficulty(deltaMs);

  particles.splice(80);

  if (player.hp <= 0) {
    phase.value = "game-over";
    animationHandle = null;
    toast({
      title: "Arena Overrun",
      description: `You lasted ${elapsedSeconds.value}s and felled ${killCount.value} foes.`,
      variant: "destructive",
    });
    return;
  }

  if (elapsedMs.value >= timeToSurviveMs) {
    phase.value = "victory";
    animationHandle = null;
    const newTotal = addVictoryPoint();
    victoryPoints.value = newTotal;
    toast({
      title: "Arena Master",
      description: `You survived the full assault and earned a victory point. Total VP: ${newTotal}`,
      variant: "success",
    });
    return;
  }

  animationHandle = requestAnimationFrame(updateLoop);
};

const startRun = () => {
  if (phase.value === "running") return;
  if (phase.value === "ready" || phase.value === "victory" || phase.value === "game-over") {
    resetGame();
  }
  phase.value = "running";
  lastFrameTime = performance.now();
  animationHandle = requestAnimationFrame(updateLoop);
};

const pauseRun = () => {
  if (phase.value !== "running") return;
  phase.value = "paused";
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
    animationHandle = null;
  }
};

const resumeRun = () => {
  if (phase.value !== "paused") return;
  phase.value = "running";
  lastFrameTime = performance.now();
  animationHandle = requestAnimationFrame(updateLoop);
};

const handleOverlayAction = () => {
  if (phase.value === "paused") {
    resumeRun();
  } else {
    startRun();
  }
};

const handleKeyDown = (event: KeyboardEvent) => {
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      inputState.up = true;
      event.preventDefault();
      break;
    case "ArrowDown":
    case "s":
    case "S":
      inputState.down = true;
      event.preventDefault();
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      inputState.left = true;
      event.preventDefault();
      break;
    case "ArrowRight":
    case "d":
    case "D":
      inputState.right = true;
      event.preventDefault();
      break;
    case " ":
      if (phase.value === "running") {
        pauseRun();
      } else if (phase.value === "paused") {
        resumeRun();
      } else {
        startRun();
      }
      event.preventDefault();
      break;
    default:
      break;
  }
};

const handleKeyUp = (event: KeyboardEvent) => {
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      inputState.up = false;
      break;
    case "ArrowDown":
    case "s":
    case "S":
      inputState.down = false;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      inputState.left = false;
      break;
    case "ArrowRight":
    case "d":
    case "D":
      inputState.right = false;
      break;
    default:
      break;
  }
};

onMounted(() => {
  resetGame();
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
});

onBeforeUnmount(() => {
  if (animationHandle) {
    cancelAnimationFrame(animationHandle);
  }
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("keyup", handleKeyUp);
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[var(--gradient-game)] p-4 md:p-8">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,10,10,0.6),transparent_70%)]" />
    <div class="pointer-events-none absolute left-1/2 top-1/3 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />

    <div class="relative z-10 mx-auto max-w-6xl space-y-8">
      <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" :class="backButtonClasses" @click="goHome">
          <ArrowLeft class="h-5 w-5 transition group-hover:-translate-x-1" />
          Back to Menu
        </button>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Trophy class="h-4 w-4 text-accent" />
              Victory Points
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ victoryPoints.toLocaleString() }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Timer class="h-4 w-4 text-primary" />
              Time Survived
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ elapsedSeconds }}s</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <HeartPulse class="h-4 w-4 text-emerald-400" />
              Vitality
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ Math.max(0, Math.floor(player.hp)) }} HP</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Target class="h-4 w-4 text-accent" />
              Score
            </div>
            <p class="mt-1 text-2xl font-semibold text-foreground">{{ formatScore }}</p>
          </div>
          <div class="rounded-lg border border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <component :is="currentWeaponIcon" class="h-4 w-4 text-primary" />
              Weapon
            </div>
            <p class="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground leading-tight">
              <component :is="currentWeaponIcon" class="h-5 w-5 text-primary" />
              {{ currentWeaponName }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground leading-snug">
              {{ currentWeaponDescription }}
            </p>
          </div>
        </div>
      </header>

      <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section class="rounded-xl border border-border/60 bg-card/80 p-6 backdrop-blur">
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 class="text-4xl font-black tracking-tight text-foreground md:text-5xl">Battle Arena</h1>
                <p class="text-sm text-muted-foreground">
                  Hold the arena, collect kills, and outlast the swarm. Your auto-hammer fires while you move -- keep distance and survive.
                </p>
              </div>
              <div class="rounded-lg border border-border/60 bg-card/70 px-4 py-3 text-sm text-muted-foreground backdrop-blur">
                Survive {{ Math.floor(timeToSurviveMs / 1000) }} seconds to earn Gruntag's favor.
              </div>
            </div>

            <div class="space-y-4">
              <div class="h-2 rounded-full bg-border/70">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-primary via-accent to-primary transition-all duration-200"
                  :style="{ width: `${hpPercent}%` }"
                />
              </div>
              <div class="flex flex-wrap items-center gap-4 text-xs uppercase tracking-widest text-muted-foreground">
                <span>Kill Count: <strong class="text-foreground">{{ killCount }}</strong></span>
                <span>&bull;</span>
                <span>Best Streak: <strong class="text-foreground">x{{ streakLabel }}</strong></span>
                <span>&bull;</span>
                <span>Time Remaining: <strong class="text-foreground">{{ timeRemaining }}s</strong></span>
              </div>
            </div>

            <div class="relative flex justify-center">
              <div
                class="relative w-full max-w-[1120px] overflow-visible rounded-2xl border border-border/60 bg-gradient-to-br from-slate-950/70 via-slate-900/80 to-black/70 p-6 shadow-[inset_0_0_48px_rgba(0,0,0,0.65)]"
              >
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(244,114,182,0.08),transparent_55%)]" />

                <div class="relative z-10 w-full overflow-auto">
                  <div
                    class="relative mx-auto overflow-hidden rounded-xl border border-border/50 bg-slate-950/60"
                    :style="{ width: `${BOARD_WIDTH}px`, height: `${BOARD_HEIGHT}px` }"
                  >
                    <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.08),transparent_60%)]" />
                    <div class="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

                    <div
                      class="player-token absolute flex items-center justify-center"
                      :style="{ transform: `translate(${player.x - PLAYER_RADIUS}px, ${player.y - PLAYER_RADIUS}px)` }"
                    >
                      <div class="player-core" />
                    </div>

                    <div
                      v-for="projectile in projectiles"
                      :key="projectile.id"
                      class="projectile-token absolute"
                      :style="{ transform: `translate(${projectile.x - 6}px, ${projectile.y - 6}px)` }"
                    />

                    <div
                      v-for="enemy in enemies"
                      :key="enemy.id"
                      class="enemy-token absolute flex items-center justify-center"
                      :style="{ transform: `translate(${enemy.x - enemy.radius}px, ${enemy.y - enemy.radius}px)` }"
                    >
                      <div class="enemy-inner" />
                    </div>

                    <div
                      v-for="particle in particles"
                      :key="particle.id"
                      class="particle-token absolute"
                      :style="{
                        transform: `translate(${particle.x}px, ${particle.y}px)`,
                        opacity: 1 - particle.life / particle.maxLife,
                      }"
                    />

                    <div
                      v-for="floating in floatingTexts"
                      :key="floating.id"
                      class="floating-text absolute"
                      :style="{
                        transform: `translate(${floating.x}px, ${floating.y}px) translate(-50%, -50%) translateY(${(-24 * (floating.life / floating.maxLife)).toFixed(2)}px)`,
                        opacity: 1 - floating.life / floating.maxLife,
                      }"
                    >
                      {{ floating.text }}
                    </div>

                    <div
                      v-for="pickup in weaponPickups"
                      :key="pickup.id"
                      class="pickup-token absolute flex items-center justify-center"
                      :title="weaponById[pickup.weaponId]?.name ?? 'Weapon Pickup'"
                      :style="{
                        transform: `translate(${pickup.x - 18}px, ${pickup.y - 18}px) rotate(${pickup.rotation}rad)`,
                      }"
                    >
                      <component :is="weaponById[pickup.weaponId]?.icon ?? Sparkles" class="h-6 w-6 text-slate-900" />
                    </div>

                    <div
                      v-for="bomb in bombPickups"
                      :key="bomb.id"
                      class="bomb-pickup absolute flex items-center justify-center"
                      :title="'Bomb Rune'"
                      :style="{
                        transform: `translate(${bomb.x - 22}px, ${bomb.y - 22}px) rotate(${bomb.rotation}rad)`,
                      }"
                    >
                      <Flame class="h-7 w-7 text-amber-300" />
                    </div>

                    <div
                      v-if="showOverlay"
                      class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/85 text-center backdrop-blur"
                    >
                      <h2 class="text-2xl font-semibold text-foreground">{{ overlayTitle }}</h2>
                      <p class="mt-3 max-w-md text-sm text-muted-foreground">
                        {{ overlayDescription }}
                      </p>
                      <button type="button" :class="actionButtonClasses" class="mt-6" @click="handleOverlayAction">
                        <Crosshair class="h-4 w-4" />
                        {{ overlayActionLabel }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
              <div class="flex flex-wrap items-center gap-3">
                <span class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-foreground">
                  <Flame class="h-4 w-4 text-primary" />
                  Intensity: {{ Math.min(10, Math.floor(elapsedSeconds / 10) + 1) }}
                </span>
                <span>&bull;</span>
                <span>Enemies Active: {{ enemies.length }}</span>
                <span>&bull;</span>
                <span>Projectiles: {{ projectiles.length }}</span>
              </div>

              <button
                v-if="phase === 'running'"
                type="button"
                class="inline-flex items-center gap-2 rounded-md border border-destructive/60 bg-destructive/20 px-5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-destructive"
                @click="pauseRun"
              >
                Pause Run
              </button>
            </div>
          </div>
        </section>

        <aside class="rounded-xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground backdrop-blur">
          <header class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-foreground">Arena Briefing</h2>
            <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground">
              <Crosshair class="h-4 w-4 text-primary" />
              Phase: {{ phase }}
            </div>
          </header>

          <div class="mt-4 space-y-4">
            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Controls</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Move with WASD or arrow keys.</li>
                <li>Auto-hammer fires toward the nearest foe.</li>
                <li>Press spacebar to pause or resume in the heat of battle.</li>
                <li>Collect glowing glyphs dropped by enemies to swap weapons.</li>
                <li>Fiery bomb runes explode on contact, clearing the arena.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Tactics</h3>
              <ul class="mt-2 space-y-1 text-xs leading-relaxed">
                <li>Keep momentum -- standing still invites the horde.</li>
                <li>Streaks reward aggressive play; losing health resets the combo.</li>
                <li>Each wave sharpens enemy speed and resilience. Adapt or fall.</li>
                <li>Bomb runes obliterate the arena -- grab them when the swarm grows thick.</li>
                <li>Weapon runes fade fast; grab them between waves to stay ahead.</li>
              </ul>
            </div>

            <div class="rounded-lg border border-border/60 bg-card/60 p-4">
              <h3 class="text-sm font-semibold text-foreground">Objective</h3>
              <p class="mt-2 text-xs leading-relaxed">
                Survive for {{ Math.floor(timeToSurviveMs / 1000) }} seconds to claim a victory point. Every enemy crushed fuels Gruntag's legend.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-token {
  height: 36px;
  width: 36px;
  border-radius: 9999px;
  background: radial-gradient(circle at 35% 35%, rgba(253, 224, 71, 0.9), rgba(250, 204, 21, 0.75));
  box-shadow: 0 0 26px rgba(250, 204, 21, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
}

.player-core {
  height: 18px;
  width: 18px;
  border-radius: 9999px;
  background: radial-gradient(circle at 40% 40%, rgba(12, 10, 22, 0.95), rgba(17, 24, 39, 0.85));
  box-shadow:
    inset 0 0 8px rgba(17, 24, 39, 0.8),
    0 0 10px rgba(255, 255, 255, 0.25);
}

.enemy-token {
  height: 32px;
  width: 32px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.85), rgba(239, 68, 68, 0.75));
  box-shadow:
    0 10px 18px rgba(239, 68, 68, 0.35),
    inset 0 -10px 14px rgba(68, 16, 16, 0.6);
}

.enemy-inner {
  height: 18px;
  width: 18px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(12, 10, 22, 0.9), rgba(24, 24, 35, 0.6));
  box-shadow: 0 0 12px rgba(12, 10, 22, 0.7);
}

.projectile-token {
  height: 12px;
  width: 12px;
  border-radius: 9999px;
  background: radial-gradient(circle at 30% 30%, rgba(129, 140, 248, 0.9), rgba(79, 70, 229, 0.8));
  box-shadow:
    0 0 12px rgba(129, 140, 248, 0.65),
    0 0 22px rgba(59, 130, 246, 0.35);
}

.particle-token {
  height: 10px;
  width: 10px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(244, 114, 182, 0.85), rgba(244, 114, 182, 0));
  transform: translate(-50%, -50%);
}

.pickup-token {
  height: 36px;
  width: 36px;
  border-radius: 14px;
  background: radial-gradient(circle at center, rgba(96, 165, 250, 0.85), rgba(37, 99, 235, 0.45));
  box-shadow:
    0 0 20px rgba(37, 99, 235, 0.45),
    inset 0 0 12px rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.4);
}

.bomb-pickup {
  height: 44px;
  width: 44px;
  border-radius: 18px;
  background: radial-gradient(circle at center, rgba(248, 113, 113, 0.9), rgba(244, 63, 94, 0.45));
  box-shadow:
    0 0 24px rgba(248, 113, 113, 0.55),
    inset 0 0 16px rgba(67, 20, 7, 0.8);
  border: 1px solid rgba(248, 113, 113, 0.55);
}

.pickup-core {
  height: 16px;
  width: 16px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(248, 250, 252, 0.95), rgba(148, 163, 184, 0.6));
  box-shadow: 0 0 12px rgba(248, 250, 252, 0.7);
}

.floating-text {
  pointer-events: none;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.95);
  text-shadow: 0 0 12px rgba(148, 163, 184, 0.7);
}
</style>















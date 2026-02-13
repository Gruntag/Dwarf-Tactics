<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Brain, Castle, RotateCcw } from "lucide-vue-next";
import { toast } from "@/composables/useToast";
import whitePawn from "@/assets/chess_pieces/white-pawn.png";
import whiteKnight from "@/assets/chess_pieces/white-knight.png";
import whiteBishop from "@/assets/chess_pieces/white-bishop.png";
import whiteRook from "@/assets/chess_pieces/white-rook.png";
import whiteQueen from "@/assets/chess_pieces/white-queen.png";
import whiteKing from "@/assets/chess_pieces/white-king.png";
import blackPawn from "@/assets/chess_pieces/black-pawn.png";
import blackKnight from "@/assets/chess_pieces/black-knight.png";
import blackBishop from "@/assets/chess_pieces/black-bishop.png";
import blackRook from "@/assets/chess_pieces/black-rook.png";
import blackQueen from "@/assets/chess_pieces/black-queen.png";
import blackKing from "@/assets/chess_pieces/black-king.png";
import grassTexture from "@/assets/texture-grass-field.jpg";
import groundTexture from "@/assets/photo-ground-texture-pattern.jpg";
import captureAnimation from "@/assets/fight2.gif";
import { pickAiMove } from "@/lib/orkishAi";
import {
  BOARD_SIZE,
  assessBoardState,
  createInitialBoard,
  describeMove,
  generateLegalMovesForColor,
  generateMovesForPiece,
  getKingCaptureOutcome,
  getStateSnapshot,
  initialCastlingRights,
  isKingInCheck,
  type AppliedState,
  type BoardMatrix,
  type CastlingRights,
  type LegalMove,
  type Move,
  type PieceColor,
  type PieceType,
  type Square,
  applyMoveToSnapshot,
  capitalize,
} from "@/lib/dwarvenTactics";

const pieceImages: Record<PieceColor, Record<PieceType, string>> = {
  white: {
    pawn: whitePawn,
    rook: whiteRook,
    knight: whiteKnight,
    bishop: whiteBishop,
    queen: whiteQueen,
    king: whiteKing,
  },
  black: {
    pawn: blackPawn,
    rook: blackRook,
    knight: blackKnight,
    bishop: blackBishop,
    queen: blackQueen,
    king: blackKing,
  },
};

const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2);

const difficulty = ref(0);
const difficultyLevels = Array.from({ length: 11 }, (_, index) => index - 5);

const board = ref<BoardMatrix>(createInitialBoard(difficulty.value));
const enPassantTarget = ref<Square | null>(null);
const castlingRights = ref<CastlingRights>(initialCastlingRights(board.value));
const selectedSquare = ref<Square | null>(null);
const highlightedMoves = ref<LegalMove[]>([]);
const moveHistory = ref<string[]>([]);
const lastMove = ref<{ from: Square; to: Square } | null>(null);
const activeMoveAnimation = ref<{ id: string; dx: number; dy: number; duration: number } | null>(null);
const captureOverlay = ref<{ id: string; row: number; col: number; durationMs: number } | null>(null);
const lingeringCapture = ref<{ id: string; src: string; row: number; col: number } | null>(null);
const gameMessage = ref("Dwarven tacticians await your opening.");
const currentTurn = ref<PieceColor>("white");
const aiThinking = ref(false);
const gameOver = ref(false);
const winner = ref<PieceColor | "draw" | null>(null);
const aiTimer = ref<number | null>(null);
let moveAnimTimer: number | null = null;
let captureDelayTimer: number | null = null;
let captureHideTimer: number | null = null;
let lingerHideTimer: number | null = null;
const CAPTURE_REVEAL_RATIO = 0.8;

const highlightedLookup = computed<Record<string, LegalMove>>(() => {
  const map: Record<string, LegalMove> = {};
  highlightedMoves.value.forEach((move) => {
    map[`${move.to.row}-${move.to.col}`] = move;
  });
  return map;
});

const lastMoveArrow = computed(() => {
  if (!lastMove.value) return null;
  const scale = 100 / BOARD_SIZE;
  const { from, to } = lastMove.value;
  const x1 = (from.col + 0.5) * scale;
  const y1 = (from.row + 0.5) * scale;
  const x2 = (to.col + 0.5) * scale;
  const y2 = (to.row + 0.5) * scale;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const trim = 3;
  const headLength = 4;
  const shaftLength = Math.max(0, length - headLength - trim);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    x: x1,
    y: y1,
    angle,
    shaftLength,
    headLength,
  };
});

const kingPositions = computed(() => {
  const map: Record<PieceColor, Square | null> = { white: null, black: null };
  board.value.forEach((row, r) => {
    row.forEach((piece, c) => {
      if (piece?.type === "king") {
        map[piece.color] = { row: r, col: c };
      }
    });
  });
  return map;
});

const setCastlingRights = (rights: CastlingRights) => {
  castlingRights.value = { ...rights };
};

const resetAiTimer = () => {
  if (aiTimer.value !== null) {
    window.clearTimeout(aiTimer.value);
    aiTimer.value = null;
  }
};

const clearLogs = () => {
  moveHistory.value = [];
  lastMove.value = null;
};

const clearMoveAnimation = () => {
  if (moveAnimTimer) {
    window.clearTimeout(moveAnimTimer);
    moveAnimTimer = null;
  }
  activeMoveAnimation.value = null;
};

const clearCaptureOverlay = () => {
  if (captureDelayTimer) {
    window.clearTimeout(captureDelayTimer);
    captureDelayTimer = null;
  }
  if (captureHideTimer) {
    window.clearTimeout(captureHideTimer);
    captureHideTimer = null;
  }
  captureOverlay.value = null;
};

const clearLingeringCapture = () => {
  if (lingerHideTimer) {
    window.clearTimeout(lingerHideTimer);
    lingerHideTimer = null;
  }
  lingeringCapture.value = null;
};

const triggerMoveAnimation = (move: Move) => {
  clearMoveAnimation();
  clearCaptureOverlay();
  clearLingeringCapture();
  const dx = move.from.col - move.to.col;
  const dy = move.from.row - move.to.row;
  const tiles = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  const duration = tiles * 500; // 0.5s per tile for clearer sliding
  activeMoveAnimation.value = {
    id: move.piece.id,
    dx,
    dy,
    duration,
  };
  moveAnimTimer = window.setTimeout(() => {
    activeMoveAnimation.value = null;
    moveAnimTimer = null;
  }, duration + 50);

  const capturedPiece = move.captured;
  const captureSquare = move.enPassantCapture ?? move.to;
  if (capturedPiece) {
    const id = randomId();
    const src = pieceImages[capturedPiece.color][capturedPiece.type];
    const revealDelay = Math.round(duration * CAPTURE_REVEAL_RATIO);
    const overlayDuration = Math.max(300, (duration + 1200) / 2);
    lingeringCapture.value = { id, src, row: captureSquare.row, col: captureSquare.col };
    lingerHideTimer = window.setTimeout(() => {
      if (lingeringCapture.value?.id === id) {
        lingeringCapture.value = null;
      }
    }, revealDelay);
    captureDelayTimer = window.setTimeout(() => {
      captureOverlay.value = { id, row: captureSquare.row, col: captureSquare.col, durationMs: overlayDuration };
      captureHideTimer = window.setTimeout(
        () => handleCaptureEnded(id),
        overlayDuration,
      );
    }, revealDelay);
  }
};

const handleCaptureEnded = (id: string) => {
  if (captureOverlay.value?.id === id) {
    captureOverlay.value = null;
  }
};

const resetGame = () => {
  resetAiTimer();
  clearMoveAnimation();
  clearCaptureOverlay();
  clearLingeringCapture();
  board.value = createInitialBoard(difficulty.value);
  enPassantTarget.value = null;
  setCastlingRights(initialCastlingRights(board.value));
  selectedSquare.value = null;
  highlightedMoves.value = [];
  clearLogs();
  gameMessage.value = "Dwarven tacticians await your opening.";
  currentTurn.value = "white";
  aiThinking.value = false;
  gameOver.value = false;
  winner.value = null;
};

watch(difficulty, () => {
  resetGame();
});

onBeforeUnmount(() => {
  resetAiTimer();
  if (moveAnimTimer) {
    window.clearTimeout(moveAnimTimer);
  }
  clearCaptureOverlay();
  clearLingeringCapture();
});

const getSnapshot = () => getStateSnapshot(enPassantTarget.value, castlingRights.value);

const applyOutcome = (outcome: AppliedState) => {
  board.value = outcome.board;
  enPassantTarget.value = outcome.enPassant ? { ...outcome.enPassant } : null;
  setCastlingRights(outcome.castling);
};

const recordMove = (move: Move) => {
  const text = `${capitalize(move.piece.color)}: ${describeMove(move)}`;
  lastMove.value = { from: { ...move.from }, to: { ...move.to } };
  moveHistory.value = [text, ...moveHistory.value];
};

const runAssessment = (nextTurn: PieceColor, presetMoves?: LegalMove[]) => {
  const snapshot = getSnapshot();
  const assessment = assessBoardState(board.value, nextTurn, snapshot, presetMoves);
  if (assessment.finished) {
    gameOver.value = true;
    winner.value = assessment.winner;
    gameMessage.value = assessment.message;
    aiThinking.value = false;
    resetAiTimer();
  } else {
    gameMessage.value = assessment.message;
  }
  return assessment;
};

const handleSquareClick = (row: number, col: number) => {
  if (gameOver.value || currentTurn.value !== "white") return;
  const key = `${row}-${col}`;
  const targetMove = highlightedLookup.value[key];
  if (targetMove) {
    executePlayerMove(targetMove);
    return;
  }
  const piece = board.value[row][col];
  if (!piece) {
    selectedSquare.value = null;
    highlightedMoves.value = [];
    return;
  }
  if (piece.color !== "white") {
    toast({ title: "Ork piece", description: "Only the dwarf host answers to you.", variant: "destructive" });
    return;
  }
  const snapshot = getSnapshot();
  const pseudoMoves = generateMovesForPiece(board.value, row, col, snapshot);
  const legalMoves: LegalMove[] = [];
  pseudoMoves.forEach((move) => {
    const outcome = applyMoveToSnapshot(board.value, move, snapshot);
    if (!isKingInCheck(outcome.board, "white")) {
      legalMoves.push({ ...move, outcome });
    }
  });
  selectedSquare.value = { row, col };
  highlightedMoves.value = legalMoves;
};

const executePlayerMove = (move: LegalMove) => {
  if (activeMoveAnimation.value) return;
  triggerMoveAnimation(move);
  applyOutcome(move.outcome);
  recordMove(move);
  if (checkKingCaptureVictory()) return;
  selectedSquare.value = null;
  highlightedMoves.value = [];
  currentTurn.value = "black";
  const assessment = runAssessment("black");
  if (!assessment.finished) {
    queueAiTurn(assessment.moves);
  }
};

const checkKingCaptureVictory = () => {
  const outcome = getKingCaptureOutcome(board.value);
  if (!outcome.finished) return false;
  gameOver.value = true;
  winner.value = outcome.winner;
  if (outcome.message) {
    gameMessage.value = outcome.message;
  }
  aiThinking.value = false;
  resetAiTimer();
  return true;
};

const queueAiTurn = (preparedMoves: LegalMove[]) => {
  aiThinking.value = true;
  resetAiTimer();
  aiTimer.value = window.setTimeout(() => {
    if (activeMoveAnimation.value) {
      moveAnimTimer = window.setTimeout(() => aiMove(preparedMoves), activeMoveAnimation.value.duration);
    } else {
      aiMove(preparedMoves);
    }
  }, 600);
};

const aiMove = (preparedMoves: LegalMove[]) => {
  if (gameOver.value) {
    aiThinking.value = false;
    return;
  }
  const snapshot = getSnapshot();
  const moves = preparedMoves.length ? preparedMoves : generateLegalMovesForColor(board.value, "black", snapshot);
  if (!moves.length) {
    aiThinking.value = false;
    runAssessment("black", moves);
    return;
  }
  const pick = pickAiMove(moves);
  if (!pick) {
    aiThinking.value = false;
    return;
  }
  const bestMove = pick.move;

  const finishMove = () => {
    triggerMoveAnimation(bestMove);
    applyOutcome(bestMove.outcome);
    recordMove(bestMove);
    if (checkKingCaptureVictory()) return;
    currentTurn.value = "white";
    aiThinking.value = false;
    const assessment = runAssessment("white");
    if (!assessment.finished) {
      gameMessage.value = "Your move. Outsmart the greenskins.";
    }
  };

  if (activeMoveAnimation.value) {
    moveAnimTimer = window.setTimeout(finishMove, activeMoveAnimation.value.duration);
  } else {
    finishMove();
  }
};
</script>

<template>
  <div class="tactics-page">
    <header class="top-bar">
      <div class="title-cluster">
        <Castle class="icon" />
        <div>
          <h1 class="title-main">Dwarven Tactics</h1>
        </div>
      </div>
      <div class="top-actions">
        <button type="button" class="secondary-button" data-testid="reset-match" @click="resetGame">
          <RotateCcw class="icon" />
          Reset Match
        </button>
      </div>
    </header>

    <section class="hero">
      <div>
        <p class="eyebrow">Dwarves vs. Greenskins</p>
        <p class="intro">
          Command the Dwarven host agains the greenskin onslaught. Every piece obeys classic chess rules—win by defeating the orkish boss.
        </p>
      </div>
    </section>

    <div class="playfield">
      <section class="difficulty-card">
        <div class="panel-header">
          <h3>Difficulty</h3>
          <p class="panel-sub">-5 favors Dwarves, +5 favors Orcs</p>
        </div>
        <div class="difficulty-buttons">
          <button
            v-for="level in difficultyLevels"
            :key="level"
            type="button"
            class="difficulty-button"
            :class="{ active: difficulty === level }"
            :data-testid="`difficulty-${level}`"
            @click="difficulty = level"
          >
            {{ level }}
          </button>
        </div>
      </section>

      <section class="board-panel">
          <div class="board-wrapper">
            <svg
              v-if="lastMoveArrow"
              class="last-move-layer"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
          >
            <g
              :transform="`translate(${lastMoveArrow.x}, ${lastMoveArrow.y}) rotate(${lastMoveArrow.angle})`"
              fill="rgba(255, 224, 138, 0.55)"
            >
              <rect
                x="0"
                :y="-(0.7)"
                :width="lastMoveArrow.shaftLength"
                height="1.4"
                rx="0"
              />
              <polygon
                :points="`
                  ${lastMoveArrow.shaftLength},-2
                  ${lastMoveArrow.shaftLength + lastMoveArrow.headLength},0
                  ${lastMoveArrow.shaftLength},2
                `"
              />
            </g>
          </svg>

          <div class="board-grid">
            <template v-for="(row, rowIndex) in board" :key="`row-${rowIndex}`">
              <button
                v-for="(cell, colIndex) in row"
                :key="`${rowIndex}-${colIndex}`"
                type="button"
                class="board-square"
                :data-testid="`board-square-${rowIndex}-${colIndex}`"
                :class="[
                  (rowIndex + colIndex) % 2 === 0 ? 'light' : 'dark',
                  { selected: selectedSquare && selectedSquare.row === rowIndex && selectedSquare.col === colIndex },
                  { targetable: highlightedLookup[`${rowIndex}-${colIndex}`] },
                ]"
                :style="{
                  backgroundImage: `url(${
                    (rowIndex + colIndex) % 2 === 0 ? grassTexture : groundTexture
                  })`,
                  backgroundColor: (rowIndex + colIndex) % 2 === 0 ? '#5f7f4a' : '#5a4a36',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }"
                @click="handleSquareClick(rowIndex, colIndex)"
              >
                <img
                  v-if="lingeringCapture && lingeringCapture.row === rowIndex && lingeringCapture.col === colIndex"
                  class="lingering-capture"
                  :src="lingeringCapture.src"
                  alt="captured piece"
                />
                <img
                  v-if="cell"
                  class="piece-img"
                  :class="[
                    cell.color,
                    { animating: activeMoveAnimation && activeMoveAnimation.id === cell.id },
                  ]"
                  :src="pieceImages[cell.color][cell.type]"
                  :alt="`${cell.color} ${cell.type}`"
                :style="activeMoveAnimation && activeMoveAnimation.id === cell.id
                    ? {
                        '--move-x-percent': `${activeMoveAnimation.dx * 139}%`,
                        '--move-y-percent': `${activeMoveAnimation.dy * 139}%`,
                        '--move-duration': `${activeMoveAnimation.duration}ms`,
                      }
                    : undefined"
                />
                <img
                  v-if="captureOverlay && captureOverlay.row === rowIndex && captureOverlay.col === colIndex"
                  :key="captureOverlay.id"
                  class="capture-video"
                  :src="captureAnimation"
                  alt="capture animation"
                  :style="{ '--capture-duration': `${captureOverlay.durationMs}ms` }"
                />
                <span
                  v-if="highlightedLookup[`${rowIndex}-${colIndex}`]"
                  class="move-dot"
                  :class="{ capture: highlightedLookup[`${rowIndex}-${colIndex}`]?.captured || highlightedLookup[`${rowIndex}-${colIndex}`]?.enPassantCapture }"
                />
                <span class="coordinate rank-left" v-if="colIndex === 0">{{ BOARD_SIZE - rowIndex }}</span>
                <span class="coordinate rank-right" v-if="colIndex === BOARD_SIZE - 1">{{ BOARD_SIZE - rowIndex }}</span>
                <span class="coordinate file-top" v-if="rowIndex === 0">{{ String.fromCharCode(65 + colIndex) }}</span>
                <span class="coordinate file" v-if="rowIndex === BOARD_SIZE - 1">{{ String.fromCharCode(65 + colIndex) }}</span>
              </button>
            </template>
          </div>
        </div>
      </section>

      <aside class="info-panel">
        <div class="status-card">
          <div class="status-line">
            <Brain class="icon" />
            <span>{{ aiThinking ? "Ork is thinking..." : gameOver ? "Final verdict" : "Awaiting move" }}</span>
          </div>
          <div class="status-message">
            {{ gameMessage }}
          </div>
          <p v-if="winner" class="status-sub">
            Result: {{ winner === 'draw' ? 'Stalemate' : `${capitalize(winner)} victory` }}
          </p>
        </div>

        <section class="panel log-panel">
          <div class="panel-header">
            <h3>Move Log</h3>
            <p class="panel-sub">All moves (latest first)</p>
          </div>
          <ul class="log-list" data-testid="move-log">
            <li v-if="!moveHistory.length" class="empty">No moves recorded yet.</li>
            <li v-for="entry in moveHistory" :key="entry">{{ entry }}</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.tactics-page {
  min-height: 100vh;
  background: radial-gradient(circle at top, rgba(30, 64, 175, 0.35), transparent 60%), #020617;
  color: #e2e8f0;
  padding: 2.5rem 1.25rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.top-bar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.icon {
  width: 1rem;
  height: 1rem;
}

.secondary-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(15, 23, 42, 0.8);
  color: inherit;
  font-weight: 600;
}

.secondary-button {
  background: rgba(8, 47, 73, 0.6);
}

.title-cluster {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.title-main {
  font-size: 2.4rem;
  line-height: 1.1;
}

.title-cluster .icon {
  width: 2.4rem;
  height: 2.4rem;
}

.eyebrow {
  font-size: 0.65rem;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
}

.top-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  width: 100%;
}

@media (min-width: 768px) {
  .top-bar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .top-actions {
    width: auto;
    justify-content: flex-end;
  }
}

.hero {
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 1.4rem;
  padding: 1.5rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  background: rgba(5, 12, 30, 0.85);
}

.intro {
  font-size: 1.1rem;
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.95);
}

.status-card {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1rem;
  padding: 1rem;
  background: rgba(2, 6, 23, 0.7);
  min-width: 240px;
}

.difficulty-card {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1rem;
  padding: 1rem;
  background: rgba(2, 6, 23, 0.7);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.difficulty-buttons {
  display: grid;
  grid-template-columns: repeat(11, minmax(0, 1fr));
  gap: 0.4rem;
}

.difficulty-button {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.8);
  color: inherit;
  font-weight: 600;
  border-radius: 0.6rem;
  padding: 0.35rem 0;
  font-size: 0.75rem;
  transition: transform 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}

.difficulty-button:hover {
  transform: translateY(-1px);
  border-color: rgba(129, 140, 248, 0.8);
}

.difficulty-button.active {
  border-color: rgba(56, 189, 248, 0.9);
  box-shadow: 0 0 0 2px rgba(14, 116, 144, 0.35);
  color: #e2e8f0;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  color: rgba(129, 140, 248, 0.85);
}

.status-message {
  margin-top: 0.75rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.status-sub {
  margin-top: 0.35rem;
  color: rgba(248, 250, 252, 0.85);
}

.playfield {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(280px, 1fr);
  grid-template-areas:
    "board difficulty"
    "board info";
  gap: 1.2rem;
}

.board-panel,
.panel {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1.25rem;
  padding: 1rem;
  background: rgba(2, 6, 23, 0.85);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.board-panel {
  grid-area: board;
}

.difficulty-card {
  grid-area: difficulty;
}

.info-panel {
  grid-area: info;
}

.panel-header h2,
.panel-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.panel-sub {
  color: rgba(148, 163, 184, 0.85);
  font-size: 0.85rem;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  width: 100%;
  position: relative;
  z-index: 1;
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.8);
}

.board-wrapper {
  position: relative;
  width: min(90vh, 100%);
  max-height: 90vh;
  margin: 0 auto;
  container-type: inline-size;
}

.capture-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  background-color: transparent;
  mix-blend-mode: screen;
  filter:
    brightness(1)
    drop-shadow(0 2px 6px rgba(15, 23, 42, 0.6))
    drop-shadow(0 0 4px rgba(248, 250, 252, 0.35));
  z-index: 30;
  display: block;
  animation: capture-fade var(--capture-duration, 800ms) linear forwards;
}

@keyframes capture-fade {
  0% {
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.last-move-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  filter:
    drop-shadow(0 0 6px rgba(255, 224, 138, 0.35))
    drop-shadow(0 0 10px rgba(255, 224, 138, 0.25));
}

.board-square {
  position: relative;
  aspect-ratio: 1 / 1;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.board-square.light {
  background: #cbd5f5;
  color: #0f172a;
}

.board-square.dark {
  background: #1e293b;
}

.board-square.selected {
  box-shadow: inset 0 0 0 3px rgba(251, 191, 36, 0.8);
}

.board-square.targetable {
  outline: 2px solid rgba(147, 197, 253, 0.4);
}

.piece-img {
  width: 72%;
  height: 72%;
  object-fit: contain;
  will-change: transform;
  transform-origin: center;
  filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.6));
  transform: translate(0, 0);
}

.lingering-capture {
  position: absolute;
  width: 72%;
  height: 72%;
  object-fit: contain;
  pointer-events: none;
  z-index: 2;
  filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.6));
}

.piece-img.animating {
  animation: piece-slide var(--move-duration, 500ms) ease-in-out forwards;
  animation-fill-mode: both;
  position: relative;
  z-index: 3;
}

.piece-img.white {
  filter:
    drop-shadow(0 2px 6px rgba(15, 23, 42, 0.6))
    drop-shadow(0 0 4px rgba(253, 224, 71, 0.35));
}

.piece-img.black {
  filter:
    drop-shadow(0 2px 6px rgba(15, 23, 42, 0.6))
    drop-shadow(0 0 4px rgba(248, 250, 252, 0.35));
}

.move-dot {
  position: absolute;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: rgba(220, 38, 38, 0.9);
}

.move-dot.capture {
  width: 80%;
  height: 80%;
  border: 3px solid rgba(220, 38, 38, 0.9);
  background: transparent;
}

.coordinate {
  position: absolute;
  font-size: clamp(0.6rem, 2.2cqw, 1.2rem);
  color: #f8fafc;
  font-weight: 700;
  text-shadow:
    0 1px 2px rgba(15, 23, 42, 0.6),
    0 0 6px rgba(0, 0, 0, 0.35);
}

.file-top {
  left: 50%;
  transform: translateX(-50%);
  top: 0.3rem;
  bottom: auto;
  pointer-events: none;
}

.file {
  left: 50%;
  transform: translateX(-50%);
  bottom: 0.3rem;
  top: auto;
  pointer-events: none;
}

.rank-left {
  left: 0.4rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.rank-right {
  right: 0.4rem;
  left: auto;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.board-square.dark .coordinate {
  color: #f8fafc;
  text-shadow:
    0 1px 3px rgba(15, 23, 42, 0.7),
    0 0 6px rgba(0, 0, 0, 0.45);
}

@keyframes piece-slide {
  from {
    transform: translate(
      var(--move-x-percent, 0),
      var(--move-y-percent, 0)
    );
  }
  to {
    transform: translate(0, 0);
  }
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@media (max-width: 640px) {
  .difficulty-buttons {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.status-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-list .label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(148, 163, 184, 0.8);
}

.status-list .value {
  font-size: 1rem;
  font-weight: 600;
}

.log-panel {
  flex: 1;
}

.log-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 320px;
  overflow-y: auto;
}

.log-list li {
  font-size: 0.9rem;
  padding: 0.4rem 0.6rem;
  border-radius: 0.5rem;
  background: rgba(15, 23, 42, 0.6);
}

.log-list .empty {
  text-align: center;
  color: rgba(148, 163, 184, 0.8);
  background: transparent;
  padding: 0.6rem 0;
}

@media (max-width: 1024px) {
  .playfield {
    grid-template-columns: 1fr;
    grid-template-areas:
      "difficulty"
      "board"
      "info";
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Brain, Castle, RotateCcw } from "lucide-vue-next";
import { toast } from "@/composables/useToast";

type PieceType = "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";
type PieceColor = "white" | "black";

interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  hasMoved: boolean;
}

interface Square {
  row: number;
  col: number;
}

interface CastlingRights {
  whiteKingSide: boolean;
  whiteQueenSide: boolean;
  blackKingSide: boolean;
  blackQueenSide: boolean;
}

interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured?: Piece | null;
  promotion?: PieceType | null;
  enPassantCapture?: Square | null;
  castleRookFrom?: Square | null;
  castleRookTo?: Square | null;
  annotation?: string | null;
}

interface AppliedState {
  board: BoardMatrix;
  enPassant: Square | null;
  castling: CastlingRights;
}

interface LegalMove extends Move {
  outcome: AppliedState;
}

type BoardMatrix = (Piece | null)[][];

const BOARD_SIZE = 8;
const router = useRouter();

const pieceGlyphs: Record<PieceColor, Record<PieceType, string>> = {
  white: {
    pawn: "♙",
    rook: "♖",
    knight: "♘",
    bishop: "♗",
    queen: "♕",
    king: "♔",
  },
  black: {
    pawn: "♟",
    rook: "♜",
    knight: "♞",
    bishop: "♝",
    queen: "♛",
    king: "♚",
  },
};

const pieceValues: Record<PieceType, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 10000,
};

const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2);

const createPiece = (type: PieceType, color: PieceColor): Piece => ({
  id: randomId(),
  type,
  color,
  hasMoved: false,
});

const createInitialBoard = (): BoardMatrix => {
  const board: BoardMatrix = Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));
  const backRank: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  backRank.forEach((type, col) => {
    board[0][col] = createPiece(type, "black");
    board[1][col] = createPiece("pawn", "black");
    board[6][col] = createPiece("pawn", "white");
    board[7][col] = createPiece(type, "white");
  });
  return board;
};

const cloneBoard = (board: BoardMatrix): BoardMatrix =>
  board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));

const defaultCastlingRights = (): CastlingRights => ({
  whiteKingSide: true,
  whiteQueenSide: true,
  blackKingSide: true,
  blackQueenSide: true,
});

const board = ref<BoardMatrix>(createInitialBoard());
const enPassantTarget = ref<Square | null>(null);
const castlingRights = ref<CastlingRights>(defaultCastlingRights());
const selectedSquare = ref<Square | null>(null);
const highlightedMoves = ref<LegalMove[]>([]);
const moveHistory = ref<string[]>([]);
const gameMessage = ref("Dwarven tacticians await your opening.");
const currentTurn = ref<PieceColor>("white");
const aiThinking = ref(false);
const gameOver = ref(false);
const winner = ref<PieceColor | "draw" | null>(null);
const aiTimer = ref<number | null>(null);

const highlightedLookup = computed<Record<string, LegalMove>>(() => {
  const map: Record<string, LegalMove> = {};
  highlightedMoves.value.forEach((move) => {
    map[`${move.to.row}-${move.to.col}`] = move;
  });
  return map;
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

const findKingSquare = (boardMatrix: BoardMatrix, color: PieceColor): Square | null => {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = boardMatrix[row][col];
      if (piece?.type === "king" && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
};

const capitalize = (color: PieceColor) => (color === "white" ? "White" : "Black");
const oppositeColor = (color: PieceColor): PieceColor => (color === "white" ? "black" : "white");
const squareToNotation = (square: Square) => `${String.fromCharCode(97 + square.col)}${BOARD_SIZE - square.row}`;

const setCastlingRights = (rights: CastlingRights) => {
  castlingRights.value = { ...rights };
};

const resetAiTimer = () => {
  if (aiTimer.value !== null) {
    window.clearTimeout(aiTimer.value);
    aiTimer.value = null;
  }
};

const resetGame = () => {
  resetAiTimer();
  board.value = createInitialBoard();
  enPassantTarget.value = null;
  setCastlingRights(defaultCastlingRights());
  selectedSquare.value = null;
  highlightedMoves.value = [];
  moveHistory.value = [];
  gameMessage.value = "Dwarven tacticians await your opening.";
  currentTurn.value = "white";
  aiThinking.value = false;
  gameOver.value = false;
  winner.value = null;
};

onBeforeUnmount(() => {
  resetAiTimer();
});

const isInside = (row: number, col: number) => row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE;

const getStateSnapshot = () => ({
  enPassant: enPassantTarget.value ? { ...enPassantTarget.value } : null,
  castling: { ...castlingRights.value },
});

const isSquareAttacked = (boardMatrix: BoardMatrix, square: Square, attacker: PieceColor): boolean => {
  const pawnDir = attacker === "white" ? -1 : 1;
  const pawnRow = square.row + pawnDir;
  if (isInside(pawnRow, square.col - 1)) {
    const piece = boardMatrix[pawnRow][square.col - 1];
    if (piece?.type === "pawn" && piece.color === attacker) return true;
  }
  if (isInside(pawnRow, square.col + 1)) {
    const piece = boardMatrix[pawnRow][square.col + 1];
    if (piece?.type === "pawn" && piece.color === attacker) return true;
  }

  const knightOffsets = [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ];
  for (const [dr, dc] of knightOffsets) {
    const row = square.row + dr;
    const col = square.col + dc;
    if (!isInside(row, col)) continue;
    const piece = boardMatrix[row][col];
    if (piece?.color === attacker && piece.type === "knight") return true;
  }

  const rayDirections = {
    rook: [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ],
    bishop: [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ],
  };

  const scan = (directions: number[][], types: PieceType[]) => {
    for (const [dr, dc] of directions) {
      let row = square.row + dr;
      let col = square.col + dc;
      while (isInside(row, col)) {
        const piece = boardMatrix[row][col];
        if (piece) {
          if (piece.color === attacker && (types.includes(piece.type) || piece.type === "queen")) {
            return true;
          }
          break;
        }
        row += dr;
        col += dc;
      }
    }
    return false;
  };

  if (scan(rayDirections.rook, ["rook"])) return true;
  if (scan(rayDirections.bishop, ["bishop"])) return true;

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = square.row + dr;
      const col = square.col + dc;
      if (!isInside(row, col)) continue;
      const piece = boardMatrix[row][col];
      if (piece?.color === attacker && piece.type === "king") return true;
    }
  }

  return false;
};

const isKingInCheck = (boardMatrix: BoardMatrix, color: PieceColor) => {
  const kingSquare = findKingSquare(boardMatrix, color);
  if (!kingSquare) return false;
  return isSquareAttacked(boardMatrix, kingSquare, oppositeColor(color));
};

const generateMovesForPiece = (boardMatrix: BoardMatrix, row: number, col: number, snapshot: ReturnType<typeof getStateSnapshot>): Move[] => {
  const piece = boardMatrix[row][col];
  if (!piece) return [];
  const moves: Move[] = [];
  const forward = piece.color === "white" ? -1 : 1;
  const startRow = piece.color === "white" ? 6 : 1;
  const promotionRow = piece.color === "white" ? 0 : 7;

  const addMove = (toRow: number, toCol: number, extra?: Partial<Move>) => {
    const base: Move = {
      from: { row, col },
      to: { row: toRow, col: toCol },
      piece,
      captured: boardMatrix[toRow][toCol],
      promotion: null,
      enPassantCapture: null,
      castleRookFrom: null,
      castleRookTo: null,
      annotation: null,
      ...extra,
    };
    if (piece.type === "pawn" && toRow === promotionRow) {
      base.promotion = "queen";
    }
    moves.push(base);
  };

  if (piece.type === "pawn") {
    const oneRow = row + forward;
    if (isInside(oneRow, col) && !boardMatrix[oneRow][col]) {
      addMove(oneRow, col);
      if (row === startRow) {
        const twoRow = row + forward * 2;
        if (isInside(twoRow, col) && !boardMatrix[twoRow][col]) {
          addMove(twoRow, col);
        }
      }
    }
    for (const dc of [-1, 1]) {
      const targetRow = row + forward;
      const targetCol = col + dc;
      if (!isInside(targetRow, targetCol)) continue;
      const targetPiece = boardMatrix[targetRow][targetCol];
      if (targetPiece && targetPiece.color !== piece.color) {
        addMove(targetRow, targetCol);
      } else if (snapshot.enPassant && snapshot.enPassant.row === targetRow && snapshot.enPassant.col === targetCol) {
        const capturedSquare = { row, col: targetCol };
        addMove(targetRow, targetCol, {
          captured: boardMatrix[capturedSquare.row][capturedSquare.col],
          enPassantCapture: capturedSquare,
        });
      }
    }
  } else if (piece.type === "knight") {
    const offsets = [
      [2, 1],
      [2, -1],
      [-2, 1],
      [-2, -1],
      [1, 2],
      [1, -2],
      [-1, 2],
      [-1, -2],
    ];
    offsets.forEach(([dr, dc]) => {
      const targetRow = row + dr;
      const targetCol = col + dc;
      if (!isInside(targetRow, targetCol)) return;
      const occupant = boardMatrix[targetRow][targetCol];
      if (!occupant || occupant.color !== piece.color) {
        addMove(targetRow, targetCol);
      }
    });
  } else if (piece.type === "bishop" || piece.type === "rook" || piece.type === "queen") {
    const directions: Record<string, number[][]> = {
      bishop: [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ],
      rook: [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ],
    };
    const selectedDirs =
      piece.type === "bishop"
        ? directions.bishop
        : piece.type === "rook"
          ? directions.rook
          : [...directions.bishop, ...directions.rook];
    selectedDirs.forEach(([dr, dc]) => {
      let targetRow = row + dr;
      let targetCol = col + dc;
      while (isInside(targetRow, targetCol)) {
        const occupant = boardMatrix[targetRow][targetCol];
        if (!occupant) {
          addMove(targetRow, targetCol);
        } else {
          if (occupant.color !== piece.color) {
            addMove(targetRow, targetCol);
          }
          break;
        }
        targetRow += dr;
        targetCol += dc;
      }
    });
  } else if (piece.type === "king") {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const targetRow = row + dr;
        const targetCol = col + dc;
        if (!isInside(targetRow, targetCol)) continue;
        const occupant = boardMatrix[targetRow][targetCol];
        if (!occupant || occupant.color !== piece.color) {
          addMove(targetRow, targetCol);
        }
      }
    }

    const rights = snapshot.castling;
    const canCastleKingSide =
      piece.color === "white" ? rights.whiteKingSide : rights.blackKingSide;
    const canCastleQueenSide =
      piece.color === "white" ? rights.whiteQueenSide : rights.blackQueenSide;
    const homeRow = piece.color === "white" ? 7 : 0;
    if (row === homeRow && col === 4) {
      if (canCastleKingSide && !boardMatrix[homeRow][5] && !boardMatrix[homeRow][6]) {
        const pathSafe = [4, 5, 6].every((file) =>
          !isSquareAttacked(boardMatrix, { row: homeRow, col: file }, oppositeColor(piece.color)),
        );
        const rook = boardMatrix[homeRow][7];
        if (pathSafe && rook?.type === "rook" && rook.color === piece.color) {
          addMove(homeRow, 6, {
            castleRookFrom: { row: homeRow, col: 7 },
            castleRookTo: { row: homeRow, col: 5 },
            captured: null,
          });
        }
      }
      if (
        canCastleQueenSide &&
        !boardMatrix[homeRow][1] &&
        !boardMatrix[homeRow][2] &&
        !boardMatrix[homeRow][3]
      ) {
        const pathSafe = [4, 3, 2].every((file) =>
          !isSquareAttacked(boardMatrix, { row: homeRow, col: file }, oppositeColor(piece.color)),
        );
        const rook = boardMatrix[homeRow][0];
        if (pathSafe && rook?.type === "rook" && rook.color === piece.color) {
          addMove(homeRow, 2, {
            castleRookFrom: { row: homeRow, col: 0 },
            castleRookTo: { row: homeRow, col: 3 },
            captured: null,
          });
        }
      }
    }
  }

  return moves;
};

const updateCastlingAfterMove = (
  rights: CastlingRights,
  move: Move,
  captured?: Piece | null,
): CastlingRights => {
  const updated: CastlingRights = { ...rights };
  const { from, piece, castleRookFrom } = move;
  if (piece.type === "king") {
    if (piece.color === "white") {
      updated.whiteKingSide = false;
      updated.whiteQueenSide = false;
    } else {
      updated.blackKingSide = false;
      updated.blackQueenSide = false;
    }
  }
  if (piece.type === "rook") {
    if (piece.color === "white") {
      if (from.row === 7 && from.col === 0) updated.whiteQueenSide = false;
      if (from.row === 7 && from.col === 7) updated.whiteKingSide = false;
    } else {
      if (from.row === 0 && from.col === 0) updated.blackQueenSide = false;
      if (from.row === 0 && from.col === 7) updated.blackKingSide = false;
    }
  }
  if (castleRookFrom) {
    if (piece.color === "white") {
      updated.whiteKingSide = false;
      updated.whiteQueenSide = false;
    } else {
      updated.blackKingSide = false;
      updated.blackQueenSide = false;
    }
  }
  if (captured?.type === "rook") {
    const square = move.to;
    if (captured.color === "white") {
      if (square.row === 7 && square.col === 0) updated.whiteQueenSide = false;
      if (square.row === 7 && square.col === 7) updated.whiteKingSide = false;
    } else {
      if (square.row === 0 && square.col === 0) updated.blackQueenSide = false;
      if (square.row === 0 && square.col === 7) updated.blackKingSide = false;
    }
  }
  return updated;
};

const applyMoveToSnapshot = (
  boardMatrix: BoardMatrix,
  move: Move,
  snapshot: ReturnType<typeof getStateSnapshot>,
): AppliedState => {
  const newBoard = cloneBoard(boardMatrix);
  const movingPiece = { ...move.piece, hasMoved: true };
  const capturedPiece = move.captured ?? null;

  newBoard[move.from.row][move.from.col] = null;

  if (move.enPassantCapture) {
    newBoard[move.enPassantCapture.row][move.enPassantCapture.col] = null;
  }

  if (move.castleRookFrom && move.castleRookTo) {
    const rook = newBoard[move.castleRookFrom.row][move.castleRookFrom.col];
    if (rook) {
      newBoard[move.castleRookFrom.row][move.castleRookFrom.col] = null;
      newBoard[move.castleRookTo.row][move.castleRookTo.col] = { ...rook, hasMoved: true };
    }
  }

  if (move.promotion) {
    movingPiece.type = move.promotion;
  }

  newBoard[move.to.row][move.to.col] = movingPiece;

  let nextEnPassant: Square | null = null;
  if (move.piece.type === "pawn" && Math.abs(move.to.row - move.from.row) === 2) {
    nextEnPassant = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
  }

  const nextCastling = updateCastlingAfterMove(snapshot.castling, move, capturedPiece);

  return {
    board: newBoard,
    enPassant: nextEnPassant,
    castling: nextCastling,
  };
};

const generateLegalMovesForColor = (color: PieceColor): LegalMove[] => {
  const snapshot = getStateSnapshot();
  const moves: LegalMove[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = board.value[row][col];
      if (!piece || piece.color !== color) continue;
      const pseudoMoves = generateMovesForPiece(board.value, row, col, snapshot);
      pseudoMoves.forEach((move) => {
        const outcome = applyMoveToSnapshot(board.value, move, snapshot);
        if (!isKingInCheck(outcome.board, color)) {
          moves.push({ ...move, outcome });
        }
      });
    }
  }
  return moves;
};

const describeMove = (move: Move) => {
  if (move.castleRookFrom) {
    return move.to.col === 6 ? "O-O" : "O-O-O";
  }
  const pieceLetter = move.piece.type === "pawn" ? "" : move.piece.type[0].toUpperCase();
  const captureMarker = move.captured || move.enPassantCapture ? "x" : "-";
  const promotion = move.promotion ? `=${move.promotion[0].toUpperCase()}` : "";
  return `${pieceLetter || "P"}${squareToNotation(move.from)}${captureMarker}${squareToNotation(move.to)}${promotion}`;
};

const applyOutcome = (outcome: AppliedState) => {
  board.value = outcome.board;
  enPassantTarget.value = outcome.enPassant ? { ...outcome.enPassant } : null;
  setCastlingRights(outcome.castling);
};

const recordMove = (move: Move) => {
  const text = `${capitalize(move.piece.color)}: ${describeMove(move)}`;
  moveHistory.value = [text, ...moveHistory.value].slice(0, 20);
};

const assessBoardState = (
  nextTurn: PieceColor,
  presetMoves?: LegalMove[],
) => {
  const moves = presetMoves ?? generateLegalMovesForColor(nextTurn);
  const inCheck = isKingInCheck(board.value, nextTurn);
  if (!moves.length) {
    gameOver.value = true;
    if (inCheck) {
      winner.value = oppositeColor(nextTurn);
      gameMessage.value = `${capitalize(oppositeColor(nextTurn))} wins by checkmate.`;
    } else {
      winner.value = "draw";
      gameMessage.value = "Stalemate. Honor shared.";
    }
    aiThinking.value = false;
    resetAiTimer();
    return { finished: true, moves };
  }
  gameMessage.value = inCheck
    ? `${capitalize(nextTurn)} is in check!`
    : nextTurn === "white"
      ? "Your move. Hold the line."
      : "Black is plotting...";
  return { finished: false, moves };
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
    toast({ title: "Black piece", description: "Only the white host answers to you.", variant: "destructive" });
    return;
  }
  const snapshot = getStateSnapshot();
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
  applyOutcome(move.outcome);
  recordMove(move);
  if (checkKingCaptureVictory()) return;
  selectedSquare.value = null;
  highlightedMoves.value = [];
  currentTurn.value = "black";
  const assessment = assessBoardState("black");
  if (!assessment.finished) {
    queueAiTurn(assessment.moves);
  }
};

const evaluateBoard = (boardMatrix: BoardMatrix) => {
  let score = 0;
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = boardMatrix[row][col];
      if (!piece) continue;
      const value = pieceValues[piece.type];
      score += piece.color === "white" ? value : -value;
    }
  }
  return score;
};

const checkKingCaptureVictory = () => {
  const whiteAlive = !!findKingSquare(board.value, "white");
  const blackAlive = !!findKingSquare(board.value, "black");
  if (whiteAlive && blackAlive) return false;
  gameOver.value = true;
  if (whiteAlive && !blackAlive) {
    winner.value = "white";
    gameMessage.value = "White wins by capturing the black king.";
  } else if (!whiteAlive && blackAlive) {
    winner.value = "black";
    gameMessage.value = "Black wins by capturing the white king.";
  } else {
    winner.value = "draw";
    gameMessage.value = "Both kings fall. The war ends in ashes.";
  }
  aiThinking.value = false;
  resetAiTimer();
  return true;
};

const queueAiTurn = (preparedMoves: LegalMove[]) => {
  aiThinking.value = true;
  resetAiTimer();
  aiTimer.value = window.setTimeout(() => {
    aiMove(preparedMoves);
  }, 600);
};

const aiMove = (preparedMoves: LegalMove[]) => {
  if (gameOver.value) {
    aiThinking.value = false;
    return;
  }
  const moves = preparedMoves.length ? preparedMoves : generateLegalMovesForColor("black");
  if (!moves.length) {
    aiThinking.value = false;
    assessBoardState("black", moves);
    return;
  }
  let bestMove = moves[0];
  let bestScore = Infinity;
  moves.forEach((move) => {
    const score = evaluateBoard(move.outcome.board);
    if (score < bestScore - 0.5 || (Math.abs(score - bestScore) < 0.5 && Math.random() < 0.25)) {
      bestScore = score;
      bestMove = move;
    }
  });

  applyOutcome(bestMove.outcome);
  recordMove(bestMove);
  if (checkKingCaptureVictory()) return;
  currentTurn.value = "white";
  aiThinking.value = false;
  const assessment = assessBoardState("white");
  if (!assessment.finished) {
    gameMessage.value = "Your move. Outsmart the automaton.";
  }
};
</script>

<template>
  <div class="tactics-page">
    <header class="top-bar">
      <button type="button" class="back-button" @click="router.push('/')">
        <ArrowLeft class="icon" />
        Back
      </button>
      <div class="title-cluster">
        <Castle class="icon" />
        <div>
          <p class="eyebrow">New Scenario</p>
          <h1>Dwarven Tactics</h1>
        </div>
      </div>
      <button type="button" class="secondary-button" @click="resetGame">
        <RotateCcw class="icon" />
        Reset Match
      </button>
    </header>

    <section class="hero">
      <div>
        <p class="eyebrow">White vs. Machine</p>
        <p class="intro">
          Command the white host across 64 squares. Every piece obeys classic chess doctrine—win by checkmating the black automaton mind.
        </p>
      </div>
      <div class="status-card">
        <div class="status-line">
          <Brain class="icon" />
          <span>{{ aiThinking ? "Black is thinking..." : gameOver ? "Final verdict" : "Black ready" }}</span>
        </div>
        <div class="status-message">
          {{ gameMessage }}
        </div>
        <p v-if="winner" class="status-sub">
          Result: {{ winner === 'draw' ? 'Stalemate' : `${capitalize(winner)} victory` }}
        </p>
      </div>
    </section>

    <div class="playfield">
      <section class="board-panel">
        <header class="panel-header">
          <div>
            <p class="eyebrow">Battlefield</p>
            <h2>Stone-table Chessboard</h2>
          </div>
          <p class="panel-sub">White to move: {{ currentTurn === 'white' ? 'Yes' : 'No' }}</p>
        </header>
        <div class="board-grid">
          <template v-for="(row, rowIndex) in board" :key="`row-${rowIndex}`">
            <button
              v-for="(cell, colIndex) in row"
              :key="`${rowIndex}-${colIndex}`"
              type="button"
              class="board-square"
              :class="[
                (rowIndex + colIndex) % 2 === 0 ? 'light' : 'dark',
                { selected: selectedSquare && selectedSquare.row === rowIndex && selectedSquare.col === colIndex },
                { targetable: highlightedLookup[`${rowIndex}-${colIndex}`] },
              ]"
              @click="handleSquareClick(rowIndex, colIndex)"
            >
              <span v-if="cell" class="piece" :class="cell.color">{{ pieceGlyphs[cell.color][cell.type] }}</span>
              <span
                v-if="highlightedLookup[`${rowIndex}-${colIndex}`]"
                class="move-dot"
                :class="{ capture: highlightedLookup[`${rowIndex}-${colIndex}`]?.captured || highlightedLookup[`${rowIndex}-${colIndex}`]?.enPassantCapture }"
              />
              <span class="coordinate" v-if="colIndex === 0">{{ BOARD_SIZE - rowIndex }}</span>
              <span class="coordinate file" v-if="rowIndex === BOARD_SIZE - 1">{{ String.fromCharCode(97 + colIndex) }}</span>
            </button>
          </template>
        </div>
      </section>

      <aside class="info-panel">
        <section class="panel">
          <div class="panel-header">
            <h3>Current Front</h3>
            <p class="panel-sub">
              {{ currentTurn === 'white' ? 'White planning...' : aiThinking ? 'Black computing...' : 'Black ready' }}
            </p>
          </div>
          <ul class="status-list">
            <li>
              <span class="label">White King</span>
              <span class="value">{{ kingPositions.white ? squareToNotation(kingPositions.white) : 'captured' }}</span>
            </li>
            <li>
              <span class="label">Black King</span>
              <span class="value">{{ kingPositions.black ? squareToNotation(kingPositions.black) : 'captured' }}</span>
            </li>
            <li>
              <span class="label">En passant</span>
              <span class="value">{{ enPassantTarget ? squareToNotation(enPassantTarget) : '—' }}</span>
            </li>
          </ul>
        </section>

        <section class="panel log-panel">
          <div class="panel-header">
            <h3>Move Log</h3>
            <p class="panel-sub">Latest 20 turns</p>
          </div>
          <ul class="log-list">
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
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.icon {
  width: 1rem;
  height: 1rem;
}

.back-button,
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

.eyebrow {
  font-size: 0.65rem;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.85);
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
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.8);
}

.board-square {
  position: relative;
  aspect-ratio: 1 / 1;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.9rem;
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

.piece {
  font-size: 2.1rem;
  text-shadow: 0 2px 6px rgba(15, 23, 42, 0.6);
}

.piece.white {
  color: #fde047;
}

.piece.black {
  color: #f8fafc;
}

.move-dot {
  position: absolute;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.85);
}

.move-dot.capture {
  width: 80%;
  height: 80%;
  border: 3px solid rgba(248, 113, 113, 0.85);
  background: transparent;
}

.coordinate {
  position: absolute;
  font-size: 0.6rem;
  color: rgba(15, 23, 42, 0.6);
  left: 0.2rem;
  top: 0.2rem;
}

.coordinate.file {
  left: auto;
  right: 0.2rem;
  top: auto;
  bottom: 0.2rem;
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
  }
}
</style>

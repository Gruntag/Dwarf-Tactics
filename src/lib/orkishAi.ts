import type { BoardMatrix, LegalMove } from "@/lib/dwarvenTactics";

const pieceValues = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 10000,
} as const;

export const evaluateBoard = (boardMatrix: BoardMatrix) => {
  let score = 0;
  for (let row = 0; row < boardMatrix.length; row += 1) {
    for (let col = 0; col < boardMatrix[row].length; col += 1) {
      const piece = boardMatrix[row][col];
      if (!piece) continue;
      const value = pieceValues[piece.type];
      score += piece.color === "white" ? value : -value;
    }
  }
  return score;
};

export const pickAiMove = (
  moves: LegalMove[],
  randomness: () => number = Math.random,
): { move: LegalMove; score: number } | null => {
  if (!moves.length) return null;
  let bestMove = moves[0];
  let bestScore = Infinity;
  moves.forEach((move) => {
    const score = evaluateBoard(move.outcome.board);
    if (score < bestScore - 0.5 || (Math.abs(score - bestScore) < 0.5 && randomness() < 0.25)) {
      bestScore = score;
      bestMove = move;
    }
  });
  return { move: bestMove, score: bestScore };
};

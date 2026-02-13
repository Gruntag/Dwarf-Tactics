import { assert } from "chai";
import { suite, test } from "vitest";
import type { BoardMatrix, CastlingRights, Piece, PieceColor, PieceType } from "@/lib/dwarvenTactics";
import {
  BOARD_SIZE,
  applyMoveToSnapshot,
  assessBoardState,
  createInitialBoard,
  capitalize,
  describeMove,
  generateMovesForPiece,
  generateLegalMovesForColor,
  getKingCaptureOutcome,
  getStateSnapshot,
  initialCastlingRights,
  isKingInCheck,
  oppositeColor,
} from "@/lib/dwarvenTactics";
import { pickAiMove } from "@/lib/orkishAi";

const emptyBoard = (): BoardMatrix =>
  Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));

const makePiece = (type: PieceType, color: PieceColor): Piece => ({
  id: `${color}-${type}`,
  type,
  color,
  hasMoved: false,
});

const noCastling: CastlingRights = {
  whiteKingSide: false,
  whiteQueenSide: false,
  blackKingSide: false,
  blackQueenSide: false,
};

const getMoveTargets = (moves: { to: { row: number; col: number } }[]) =>
  moves.map((move) => `${move.to.row},${move.to.col}`);

const findMoveTo = (moves: { to: { row: number; col: number } }[], row: number, col: number) =>
  moves.find((move) => move.to.row === row && move.to.col === col);

const findMoveFromTo = (
  moves: { from: { row: number; col: number }; to: { row: number; col: number } }[],
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
) => moves.find((move) => move.from.row === fromRow && move.from.col === fromCol && move.to.row === toRow && move.to.col === toCol);

suite("white movement", () => {
  test("pawn can move one or two squares from start", () => {
    const board = createInitialBoard(0);
    const snapshot = getStateSnapshot(null, initialCastlingRights(board));

    const moves = generateMovesForPiece(board, 6, 0, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 2);
    assert.include(moveTargets, "5,0");
    assert.include(moveTargets, "4,0");
  });

  test("pawn after moving can only move one square", () => {
    const board = createInitialBoard(0);
    const snapshot = getStateSnapshot(null, initialCastlingRights(board));

    const firstMoves = generateMovesForPiece(board, 6, 0, snapshot);
    const twoStep = firstMoves.find((move) => move.to.row === 4 && move.to.col === 0);
    assert.isOk(twoStep, "expected a two-step pawn move from the start");

    if (!twoStep) return;

    const outcome = applyMoveToSnapshot(board, twoStep, snapshot);
    const movedSnapshot = getStateSnapshot(outcome.enPassant, outcome.castling);
    const movesAfter = generateMovesForPiece(outcome.board, 4, 0, movedSnapshot);
    const moveTargets = getMoveTargets(movesAfter);

    assert.equal(moveTargets.length, 1);
    assert.include(moveTargets, "3,0");
    assert.notInclude(moveTargets, "2,0");
  });

  test("rook moves in straight lines with blockers and captures", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("rook", "white");
    board[4][6] = makePiece("pawn", "white");
    board[4][2] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 10);
    assert.include(moveTargets, "4,5");
    assert.notInclude(moveTargets, "4,6");
    assert.notInclude(moveTargets, "4,7");

    assert.include(moveTargets, "4,2");
    assert.notInclude(moveTargets, "4,1");
    assert.notInclude(moveTargets, "4,0");

    assert.include(moveTargets, "0,4");
    assert.include(moveTargets, "7,4");
  });

  test("knight jumps and can capture enemies", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("knight", "white");
    board[5][6] = makePiece("pawn", "white");
    board[6][5] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 7);
    assert.include(moveTargets, "6,5");
    assert.notInclude(moveTargets, "5,6");
    assert.include(moveTargets, "2,3");
    assert.include(moveTargets, "3,2");
  });

  test("bishop moves diagonally with blockers and captures", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("bishop", "white");
    board[6][6] = makePiece("pawn", "white");
    board[2][2] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 9);
    assert.include(moveTargets, "3,3");
    assert.include(moveTargets, "2,2");
    assert.notInclude(moveTargets, "1,1");

    assert.include(moveTargets, "3,5");
    assert.include(moveTargets, "2,6");
    assert.include(moveTargets, "1,7");
    assert.notInclude(moveTargets, "6,6");
  });

  test("queen combines rook and bishop movement", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("queen", "white");
    board[4][5] = makePiece("pawn", "white");
    board[6][6] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 23);
    assert.include(moveTargets, "4,3");
    assert.notInclude(moveTargets, "4,5");
    assert.notInclude(moveTargets, "4,6");

    assert.include(moveTargets, "5,5");
    assert.include(moveTargets, "6,6");
    assert.notInclude(moveTargets, "7,7");
  });

  test("king moves one square and can capture", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("king", "white");
    board[4][5] = makePiece("pawn", "white");
    board[5][5] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 7);
    assert.include(moveTargets, "5,5");
    assert.notInclude(moveTargets, "4,5");
    assert.include(moveTargets, "3,3");
    assert.include(moveTargets, "5,4");
    assert.notInclude(moveTargets, "6,6");
  });

  test("king can castle when path is clear and rights are available", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][7] = makePiece("rook", "white");

    const rights: CastlingRights = {
      whiteKingSide: true,
      whiteQueenSide: false,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 6);
    assert.include(moveTargets, "7,6");
  });

  test("king can castle queenside when path is clear and rights are available", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][0] = makePiece("rook", "white");

    const rights: CastlingRights = {
      whiteKingSide: false,
      whiteQueenSide: true,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 6);
    assert.include(moveTargets, "7,2");
  });
});

suite("black movement", () => {
  test("pawn can move one or two squares from start", () => {
    const board = createInitialBoard(0);
    const snapshot = getStateSnapshot(null, initialCastlingRights(board));

    const moves = generateMovesForPiece(board, 1, 0, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 2);
    assert.include(moveTargets, "2,0");
    assert.include(moveTargets, "3,0");
  });

  test("pawn after moving can only move one square", () => {
    const board = createInitialBoard(0);
    const snapshot = getStateSnapshot(null, initialCastlingRights(board));

    const firstMoves = generateMovesForPiece(board, 1, 0, snapshot);
    const twoStep = firstMoves.find((move) => move.to.row === 3 && move.to.col === 0);
    assert.isOk(twoStep, "expected a two-step pawn move from the start");

    if (!twoStep) return;

    const outcome = applyMoveToSnapshot(board, twoStep, snapshot);
    const movedSnapshot = getStateSnapshot(outcome.enPassant, outcome.castling);
    const movesAfter = generateMovesForPiece(outcome.board, 3, 0, movedSnapshot);
    const moveTargets = getMoveTargets(movesAfter);

    assert.equal(moveTargets.length, 1);
    assert.include(moveTargets, "4,0");
    assert.notInclude(moveTargets, "5,0");
  });

  test("rook moves in straight lines with blockers and captures", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("rook", "black");
    board[4][6] = makePiece("pawn", "black");
    board[4][2] = makePiece("pawn", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 10);
    assert.include(moveTargets, "4,5");
    assert.notInclude(moveTargets, "4,6");
    assert.notInclude(moveTargets, "4,7");

    assert.include(moveTargets, "4,2");
    assert.notInclude(moveTargets, "4,1");
    assert.notInclude(moveTargets, "4,0");

    assert.include(moveTargets, "0,4");
    assert.include(moveTargets, "7,4");
  });

  test("knight jumps and can capture enemies", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("knight", "black");
    board[5][6] = makePiece("pawn", "black");
    board[6][5] = makePiece("pawn", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 7);
    assert.include(moveTargets, "6,5");
    assert.notInclude(moveTargets, "5,6");
    assert.include(moveTargets, "2,3");
    assert.include(moveTargets, "3,2");
  });

  test("bishop moves diagonally with blockers and captures", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("bishop", "black");
    board[6][6] = makePiece("pawn", "black");
    board[2][2] = makePiece("pawn", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 9);
    assert.include(moveTargets, "3,3");
    assert.include(moveTargets, "2,2");
    assert.notInclude(moveTargets, "1,1");

    assert.include(moveTargets, "3,5");
    assert.include(moveTargets, "2,6");
    assert.include(moveTargets, "1,7");
    assert.notInclude(moveTargets, "6,6");
  });

  test("queen combines rook and bishop movement", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("queen", "black");
    board[4][5] = makePiece("pawn", "black");
    board[6][6] = makePiece("pawn", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 23);
    assert.include(moveTargets, "4,3");
    assert.notInclude(moveTargets, "4,5");
    assert.notInclude(moveTargets, "4,6");

    assert.include(moveTargets, "5,5");
    assert.include(moveTargets, "6,6");
    assert.notInclude(moveTargets, "7,7");
  });

  test("king moves one square and can capture", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("king", "black");
    board[4][5] = makePiece("pawn", "black");
    board[5][5] = makePiece("pawn", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 7);
    assert.include(moveTargets, "5,5");
    assert.notInclude(moveTargets, "4,5");
    assert.include(moveTargets, "3,3");
    assert.include(moveTargets, "5,4");
    assert.notInclude(moveTargets, "6,6");
  });

  test("king can castle when path is clear and rights are available", () => {
    const board = emptyBoard();
    board[0][4] = makePiece("king", "black");
    board[0][7] = makePiece("rook", "black");

    const rights: CastlingRights = {
      whiteKingSide: false,
      whiteQueenSide: false,
      blackKingSide: true,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 0, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 6);
    assert.include(moveTargets, "0,6");
  });

  test("king can castle queenside when path is clear and rights are available", () => {
    const board = emptyBoard();
    board[0][4] = makePiece("king", "black");
    board[0][0] = makePiece("rook", "black");

    const rights: CastlingRights = {
      whiteKingSide: false,
      whiteQueenSide: false,
      blackKingSide: false,
      blackQueenSide: true,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 0, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 6);
    assert.include(moveTargets, "0,2");
  });
});

suite("movement rules", () => {
  test("pawn captures diagonally and cannot move forward when blocked", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("pawn", "white");
    board[3][3] = makePiece("pawn", "black");
    board[3][5] = makePiece("pawn", "black");
    board[3][4] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.equal(moveTargets.length, 2);
    assert.include(moveTargets, "3,3");
    assert.include(moveTargets, "3,5");
    assert.notInclude(moveTargets, "3,4");
  });

  test("en passant capture is available and removes the passed pawn", () => {
    const board = emptyBoard();
    board[3][4] = makePiece("pawn", "white");
    board[3][5] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot({ row: 2, col: 5 }, noCastling);
    const moves = generateMovesForPiece(board, 3, 4, snapshot);
    const enPassantMove = moves.find((move) => move.enPassantCapture);

    assert.isOk(enPassantMove, "expected en passant capture move");
    if (!enPassantMove) return;

    const outcome = applyMoveToSnapshot(board, enPassantMove, snapshot);
    assert.isNull(outcome.board[3][5], "passed pawn should be removed");
    assert.equal(outcome.board[2][5]?.type, "pawn");
    assert.equal(outcome.board[2][5]?.color, "white");
  });

  test("castling is blocked if a path square is under attack", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][7] = makePiece("rook", "white");
    board[5][5] = makePiece("rook", "black");

    const rights: CastlingRights = {
      whiteKingSide: true,
      whiteQueenSide: false,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 4, snapshot);
    const moveTargets = getMoveTargets(moves);

    assert.notInclude(moveTargets, "7,6");
  });

  test("king in check is detected and legal moves resolve the check", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("king", "white");
    board[4][7] = makePiece("rook", "black");
    board[6][6] = makePiece("rook", "white");
    board[6][0] = makePiece("pawn", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    assert.isTrue(isKingInCheck(board, "white"));

    const legalMoves = generateLegalMovesForColor(board, "white", snapshot);
    const rookBlock = findMoveTo(legalMoves, 4, 6);
    const pawnAdvance = findMoveTo(legalMoves, 5, 0);

    assert.isOk(rookBlock, "expected a blocking rook move");
    assert.isNotOk(pawnAdvance, "non-blocking pawn move should be illegal while in check");
  });

  test("king cannot move into pawn capture squares", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("king", "white");
    board[5][4] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const legalMoves = generateLegalMovesForColor(board, "white", snapshot);
    const moveTargets = getMoveTargets(legalMoves);

    assert.notInclude(moveTargets, "4,3");
    assert.notInclude(moveTargets, "4,5");
  });
});

suite("applyMoveToSnapshot", () => {
  test("captures remove the target piece and move the attacker", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("rook", "white");
    board[4][2] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 4, 4, snapshot);
    const captureMove = findMoveTo(moves, 4, 2);

    assert.isOk(captureMove);
    if (!captureMove) return;

    const outcome = applyMoveToSnapshot(board, captureMove, snapshot);
    assert.isNull(outcome.board[4][4]);
    assert.equal(outcome.board[4][2]?.type, "rook");
    assert.equal(outcome.board[4][2]?.color, "white");
  });

  test("en passant capture removes the passed pawn", () => {
    const board = emptyBoard();
    board[3][4] = makePiece("pawn", "white");
    board[3][5] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot({ row: 2, col: 5 }, noCastling);
    const moves = generateMovesForPiece(board, 3, 4, snapshot);
    const enPassantMove = moves.find((move) => move.enPassantCapture);

    assert.isOk(enPassantMove);
    if (!enPassantMove) return;

    const outcome = applyMoveToSnapshot(board, enPassantMove, snapshot);
    assert.isNull(outcome.board[3][5]);
    assert.equal(outcome.board[2][5]?.type, "pawn");
    assert.equal(outcome.board[2][5]?.color, "white");
  });

  test("castling moves the rook to the correct square", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][7] = makePiece("rook", "white");

    const rights: CastlingRights = {
      whiteKingSide: true,
      whiteQueenSide: false,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 4, snapshot);
    const castleMove = findMoveTo(moves, 7, 6);

    assert.isOk(castleMove);
    if (!castleMove) return;

    const outcome = applyMoveToSnapshot(board, castleMove, snapshot);
    assert.equal(outcome.board[7][6]?.type, "king");
    assert.equal(outcome.board[7][5]?.type, "rook");
    assert.isNull(outcome.board[7][7]);
  });

  test("pawn promotes to queen on the last rank", () => {
    const board = emptyBoard();
    board[1][0] = makePiece("pawn", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 1, 0, snapshot);
    const promotionMove = findMoveTo(moves, 0, 0);

    assert.isOk(promotionMove);
    if (!promotionMove) return;

    const outcome = applyMoveToSnapshot(board, promotionMove, snapshot);
    assert.equal(outcome.board[0][0]?.type, "queen");
    assert.equal(outcome.board[0][0]?.color, "white");
  });
});

suite("ai move selection", () => {
  test("returns null when there are no moves", () => {
    const result = pickAiMove([]);
    assert.isNull(result);
  });

  test("picks the move with the lowest evaluation score", () => {
    const boardNeutral = emptyBoard();
    const boardWhiteUp = emptyBoard();
    boardWhiteUp[7][4] = makePiece("king", "white");
    boardWhiteUp[0][4] = makePiece("king", "black");
    boardWhiteUp[6][0] = makePiece("pawn", "white");

    const moveA = {
      from: { row: 0, col: 0 },
      to: { row: 0, col: 0 },
      piece: makePiece("pawn", "black"),
      outcome: { board: boardWhiteUp, enPassant: null, castling: noCastling },
    };
    const moveB = {
      from: { row: 0, col: 0 },
      to: { row: 0, col: 0 },
      piece: makePiece("pawn", "black"),
      outcome: { board: boardNeutral, enPassant: null, castling: noCastling },
    };

    const result = pickAiMove([moveA, moveB], () => 0);
    assert.isOk(result);
    assert.strictEqual(result?.move, moveB);
  });
});

suite("castling rights", () => {
  test("king move clears both castling rights", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][0] = makePiece("rook", "white");
    board[7][7] = makePiece("rook", "white");

    const rights: CastlingRights = {
      whiteKingSide: true,
      whiteQueenSide: true,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 4, snapshot);
    const move = findMoveTo(moves, 6, 4);

    assert.isOk(move);
    if (!move) return;

    const outcome = applyMoveToSnapshot(board, move, snapshot);
    assert.isFalse(outcome.castling.whiteKingSide);
    assert.isFalse(outcome.castling.whiteQueenSide);
  });

  test("rook move clears the corresponding castling right", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][0] = makePiece("rook", "white");

    const rights: CastlingRights = {
      whiteKingSide: true,
      whiteQueenSide: true,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 0, snapshot);
    const move = findMoveTo(moves, 7, 1);

    assert.isOk(move);
    if (!move) return;

    const outcome = applyMoveToSnapshot(board, move, snapshot);
    assert.isTrue(outcome.castling.whiteKingSide);
    assert.isFalse(outcome.castling.whiteQueenSide);
  });

  test("capturing a rook clears that side's castling right", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][0] = makePiece("rook", "white");
    board[7][1] = makePiece("rook", "black");

    const rights: CastlingRights = {
      whiteKingSide: true,
      whiteQueenSide: true,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 1, snapshot);
    const captureMove = findMoveTo(moves, 7, 0);

    assert.isOk(captureMove);
    if (!captureMove) return;

    const outcome = applyMoveToSnapshot(board, captureMove, snapshot);
    assert.isFalse(outcome.castling.whiteQueenSide);
    assert.isTrue(outcome.castling.whiteKingSide);
  });
});

suite("en passant timing", () => {
  test("en passant is available immediately after a double-step only", () => {
    const board = emptyBoard();
    board[6][4] = makePiece("pawn", "white");
    board[4][5] = makePiece("pawn", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const whiteMoves = generateMovesForPiece(board, 6, 4, snapshot);
    const doubleStep = findMoveTo(whiteMoves, 4, 4);

    assert.isOk(doubleStep);
    if (!doubleStep) return;

    const outcome = applyMoveToSnapshot(board, doubleStep, snapshot);
    const withEnPassant = getStateSnapshot(outcome.enPassant, outcome.castling);
    const blackMoves = generateMovesForPiece(outcome.board, 4, 5, withEnPassant);
    const enPassantMove = blackMoves.find((move) => move.enPassantCapture);

    assert.isOk(enPassantMove);

    const withoutEnPassant = getStateSnapshot(null, outcome.castling);
    const blackMovesExpired = generateMovesForPiece(outcome.board, 4, 5, withoutEnPassant);
    const expiredMove = blackMovesExpired.find((move) => move.enPassantCapture);

    assert.isNotOk(expiredMove);
  });
});

suite("promotion capture", () => {
  test("pawn promotes when capturing on the last rank", () => {
    const board = emptyBoard();
    board[1][1] = makePiece("pawn", "white");
    board[0][2] = makePiece("rook", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 1, 1, snapshot);
    const capturePromotion = findMoveTo(moves, 0, 2);

    assert.isOk(capturePromotion);
    if (!capturePromotion) return;

    const outcome = applyMoveToSnapshot(board, capturePromotion, snapshot);
    assert.equal(outcome.board[0][2]?.type, "queen");
    assert.equal(outcome.board[0][2]?.color, "white");
  });
});

suite("board assessment", () => {
  test("checkmate is detected with a winner", () => {
    const board = emptyBoard();
    board[0][0] = makePiece("king", "black");
    board[1][1] = makePiece("queen", "white");
    board[2][2] = makePiece("king", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const assessment = assessBoardState(board, "black", snapshot);

    assert.isTrue(assessment.finished);
    assert.isTrue(assessment.inCheck);
    assert.equal(assessment.winner, "white");
  });

  test("stalemate is detected as a draw", () => {
    const board = emptyBoard();
    board[0][0] = makePiece("king", "black");
    board[2][1] = makePiece("queen", "white");
    board[2][2] = makePiece("king", "white");

    const snapshot = getStateSnapshot(null, noCastling);
    const assessment = assessBoardState(board, "black", snapshot);

    assert.isTrue(assessment.finished);
    assert.isFalse(assessment.inCheck);
    assert.equal(assessment.winner, "draw");
  });
});

suite("king capture outcome", () => {
  test("returns unfinished when both kings are alive", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[0][4] = makePiece("king", "black");

    const outcome = getKingCaptureOutcome(board);
    assert.isFalse(outcome.finished);
    assert.isNull(outcome.winner);
  });

  test("returns white win when black king is missing", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");

    const outcome = getKingCaptureOutcome(board);
    assert.isTrue(outcome.finished);
    assert.equal(outcome.winner, "white");
  });

  test("returns black win when white king is missing", () => {
    const board = emptyBoard();
    board[0][4] = makePiece("king", "black");

    const outcome = getKingCaptureOutcome(board);
    assert.isTrue(outcome.finished);
    assert.equal(outcome.winner, "black");
  });

  test("returns draw when both kings are missing", () => {
    const board = emptyBoard();

    const outcome = getKingCaptureOutcome(board);
    assert.isTrue(outcome.finished);
    assert.equal(outcome.winner, "draw");
  });
});

suite("legal move filtering", () => {
  test("moves that expose the king are filtered out", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[6][4] = makePiece("rook", "white");
    board[0][4] = makePiece("rook", "black");

    const snapshot = getStateSnapshot(null, noCastling);
    const legalMoves = generateLegalMovesForColor(board, "white", snapshot);
    const illegalMove = findMoveFromTo(legalMoves, 6, 4, 6, 5);
    const legalMove = findMoveTo(legalMoves, 5, 4);

    assert.isNotOk(illegalMove);
    assert.isOk(legalMove);
  });
});

suite("move descriptions", () => {
  test("formats captures and promotions", () => {
    const move = {
      from: { row: 6, col: 0 },
      to: { row: 5, col: 0 },
      piece: makePiece("pawn", "white"),
      captured: makePiece("pawn", "black"),
      promotion: "queen" as PieceType,
    };

    const text = describeMove(move);
    assert.include(text, "(capture)");
    assert.include(text, "promotes to Queen");
  });

  test("formats castling", () => {
    const kingSide = describeMove({
      from: { row: 7, col: 4 },
      to: { row: 7, col: 6 },
      piece: makePiece("king", "white"),
      castleRookFrom: { row: 7, col: 7 },
      castleRookTo: { row: 7, col: 5 },
    });

    const queenSide = describeMove({
      from: { row: 7, col: 4 },
      to: { row: 7, col: 2 },
      piece: makePiece("king", "white"),
      castleRookFrom: { row: 7, col: 0 },
      castleRookTo: { row: 7, col: 3 },
    });

    assert.equal(kingSide, "Kingside castle");
    assert.equal(queenSide, "Queenside castle");
  });

  test("uses board notation in coordinates", () => {
    const move = {
      from: { row: 7, col: 0 },
      to: { row: 0, col: 7 },
      piece: makePiece("rook", "white"),
    };

    const text = describeMove(move);
    assert.equal(text, "Rook A1 -> H8");
  });
});

suite("helpers and internals via behavior", () => {
  test("capitalize and oppositeColor return the expected values", () => {
    assert.equal(capitalize("white"), "Dwarf");
    assert.equal(capitalize("black"), "Ork");
    assert.equal(oppositeColor("white"), "black");
    assert.equal(oppositeColor("black"), "white");
  });

  test("createInitialBoard applies handicaps for both sides", () => {
    const whiteHandicap = createInitialBoard(1);
    assert.isNull(whiteHandicap[7][0], "white queen-side rook removed");
    assert.isOk(whiteHandicap[0][0], "black queen-side rook remains");

    const blackHandicap = createInitialBoard(-3);
    assert.isNull(blackHandicap[0][3], "black queen removed");
    assert.isOk(blackHandicap[7][3], "white queen remains");
  });

  test("pieces created for the initial board have ids", () => {
    const board = createInitialBoard(0);
    const piece = board[7][4];
    assert.isOk(piece?.id);
    assert.isAbove(piece?.id.length ?? 0, 0);
  });

  test("applyMoveToSnapshot does not mutate the original board", () => {
    const board = createInitialBoard(0);
    const snapshot = getStateSnapshot(null, initialCastlingRights(board));
    const moves = generateMovesForPiece(board, 6, 0, snapshot);
    const move = moves[0];

    const originalPiece = board[6][0];
    const outcome = applyMoveToSnapshot(board, move, snapshot);

    assert.strictEqual(board[6][0], originalPiece);
    assert.isNull(outcome.board[6][0]);
  });

  test("isKingInCheck returns false when the king is missing", () => {
    const board = emptyBoard();
    board[0][0] = makePiece("rook", "black");

    assert.isFalse(isKingInCheck(board, "white"));
  });

  test("isKingInCheck detects knight and pawn attacks", () => {
    const board = emptyBoard();
    board[4][4] = makePiece("king", "white");
    board[2][5] = makePiece("knight", "black");

    assert.isTrue(isKingInCheck(board, "white"));

    const pawnBoard = emptyBoard();
    pawnBoard[4][4] = makePiece("king", "white");
    pawnBoard[5][3] = makePiece("pawn", "black");
    assert.isTrue(isKingInCheck(pawnBoard, "white"));
  });

  test("promotion move is marked with a promotion piece", () => {
    const board = emptyBoard();
    board[1][0] = makePiece("pawn", "white");
    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 1, 0, snapshot);
    const promotionMove = moves.find((move) => move.to.row === 0 && move.to.col === 0);

    assert.isOk(promotionMove);
    assert.equal(promotionMove?.promotion, "queen");
  });

  test("castling rights update after rook capture", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[7][7] = makePiece("rook", "white");
    board[7][6] = makePiece("rook", "black");

    const rights: CastlingRights = {
      whiteKingSide: true,
      whiteQueenSide: false,
      blackKingSide: false,
      blackQueenSide: false,
    };

    const snapshot = getStateSnapshot(null, rights);
    const moves = generateMovesForPiece(board, 7, 6, snapshot);
    const captureMove = moves.find((move) => move.to.row === 7 && move.to.col === 7);
    assert.isOk(captureMove);
    if (!captureMove) return;

    const outcome = applyMoveToSnapshot(board, captureMove, snapshot);
    assert.isFalse(outcome.castling.whiteKingSide);
  });

  test("edge moves stay on the board", () => {
    const board = emptyBoard();
    board[0][0] = makePiece("knight", "white");
    const snapshot = getStateSnapshot(null, noCastling);
    const moves = generateMovesForPiece(board, 0, 0, snapshot);
    const targets = getMoveTargets(moves);

    assert.equal(targets.length, 2);
    assert.include(targets, "1,2");
    assert.include(targets, "2,1");
  });
});

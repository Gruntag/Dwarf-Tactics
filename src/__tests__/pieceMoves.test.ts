import { assert } from "chai";
import { suite, test } from "vitest";
import type { BoardMatrix, CastlingRights, Piece, PieceColor, PieceType } from "@/lib/dwarvenTactics";
import {
  BOARD_SIZE,
  applyMoveToSnapshot,
  createInitialBoard,
  generateMovesForPiece,
  getStateSnapshot,
  initialCastlingRights,
} from "@/lib/dwarvenTactics";

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

const targets = (moves: { to: { row: number; col: number } }[]) =>
  moves.map((move) => `${move.to.row},${move.to.col}`);

const getMoveTargets = (moves: { to: { row: number; col: number } }[]) =>
  moves.map((move) => `${move.to.row},${move.to.col}`);

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

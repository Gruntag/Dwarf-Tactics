import { assert } from "chai";
import { suite, test } from "vitest";
import type { BoardMatrix, LegalMove, Piece, PieceColor, PieceType } from "@/lib/dwarvenTactics";
import { evaluateBoard, pickAiMove } from "@/lib/orkishAi";

const emptyBoard = (): BoardMatrix => Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));

const makePiece = (type: PieceType, color: PieceColor): Piece => ({
  id: `${color}-${type}-${Math.random().toString(16).slice(2)}`,
  type,
  color,
  hasMoved: false,
});

const makeMove = (board: BoardMatrix): LegalMove => ({
  from: { row: 0, col: 0 },
  to: { row: 0, col: 0 },
  piece: makePiece("pawn", "black"),
  outcome: {
    board,
    enPassant: null,
    castling: {
      whiteKingSide: false,
      whiteQueenSide: false,
      blackKingSide: false,
      blackQueenSide: false,
    },
  },
});

suite("orkish ai", () => {
  test("evaluateBoard returns 0 on empty board", () => {
    const board = emptyBoard();
    assert.equal(evaluateBoard(board), 0);
  });

  test("evaluateBoard is positive for white material and negative for black", () => {
    const whiteUp = emptyBoard();
    whiteUp[7][4] = makePiece("king", "white");
    whiteUp[0][4] = makePiece("king", "black");
    whiteUp[6][0] = makePiece("pawn", "white");

    const blackUp = emptyBoard();
    blackUp[7][4] = makePiece("king", "white");
    blackUp[0][4] = makePiece("king", "black");
    blackUp[1][0] = makePiece("pawn", "black");

    assert.isAbove(evaluateBoard(whiteUp), 0);
    assert.isBelow(evaluateBoard(blackUp), 0);
  });

  test("evaluateBoard respects piece weights", () => {
    const boardQueen = emptyBoard();
    boardQueen[7][4] = makePiece("king", "white");
    boardQueen[0][4] = makePiece("king", "black");
    boardQueen[6][0] = makePiece("queen", "white");

    const boardRook = emptyBoard();
    boardRook[7][4] = makePiece("king", "white");
    boardRook[0][4] = makePiece("king", "black");
    boardRook[6][0] = makePiece("rook", "white");

    const boardKnight = emptyBoard();
    boardKnight[7][4] = makePiece("king", "white");
    boardKnight[0][4] = makePiece("king", "black");
    boardKnight[6][0] = makePiece("knight", "white");

    const queenScore = evaluateBoard(boardQueen);
    const rookScore = evaluateBoard(boardRook);
    const knightScore = evaluateBoard(boardKnight);

    assert.isAbove(queenScore, rookScore);
    assert.isAbove(rookScore, knightScore);
  });

  test("pickAiMove returns null when there are no moves", () => {
    assert.isNull(pickAiMove([]));
  });

  test("pickAiMove selects the move with the lowest score", () => {
    const boardNeutral = emptyBoard();
    boardNeutral[7][4] = makePiece("king", "white");
    boardNeutral[0][4] = makePiece("king", "black");

    const boardWhiteUp = emptyBoard();
    boardWhiteUp[7][4] = makePiece("king", "white");
    boardWhiteUp[0][4] = makePiece("king", "black");
    boardWhiteUp[6][0] = makePiece("pawn", "white");

    const moveA = makeMove(boardWhiteUp);
    const moveB = makeMove(boardNeutral);

    const result = pickAiMove([moveA, moveB], () => 0);
    assert.isOk(result);
    assert.strictEqual(result?.move, moveB);
  });

  test("pickAiMove can choose a tie alternative when randomness allows", () => {
    const boardBase = emptyBoard();
    boardBase[7][4] = makePiece("king", "white");
    boardBase[0][4] = makePiece("king", "black");

    const boardTie = emptyBoard();
    boardTie[7][4] = makePiece("king", "white");
    boardTie[0][4] = makePiece("king", "black");

    const moveA = makeMove(boardBase);
    const moveB = makeMove(boardTie);

    const result = pickAiMove([moveA, moveB], () => 0);
    assert.isOk(result);
    assert.strictEqual(result?.move, moveB);
  });

  test("pickAiMove returns the same move object from the input list", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[0][4] = makePiece("king", "black");
    const move = makeMove(board);

    const result = pickAiMove([move], () => 0.5);
    assert.isOk(result);
    assert.strictEqual(result?.move, move);
  });

  test("pickAiMove chooses the only available move", () => {
    const board = emptyBoard();
    board[7][4] = makePiece("king", "white");
    board[0][4] = makePiece("king", "black");
    const onlyMove = makeMove(board);

    const result = pickAiMove([onlyMove], () => 0.1);
    assert.isOk(result);
    assert.strictEqual(result?.move, onlyMove);
  });
});

export type PieceType = "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";
export type PieceColor = "white" | "black";

export interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  hasMoved: boolean;
}

export interface Square {
  row: number;
  col: number;
}

export interface CastlingRights {
  whiteKingSide: boolean;
  whiteQueenSide: boolean;
  blackKingSide: boolean;
  blackQueenSide: boolean;
}

export interface Move {
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

export interface AppliedState {
  board: BoardMatrix;
  enPassant: Square | null;
  castling: CastlingRights;
}

export interface LegalMove extends Move {
  outcome: AppliedState;
}

export interface GameSnapshot {
  enPassant: Square | null;
  castling: CastlingRights;
}

export type BoardMatrix = (Piece | null)[][];

export const BOARD_SIZE = 8;


const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2);

const createPiece = (type: PieceType, color: PieceColor): Piece => ({
  id: randomId(),
  type,
  color,
  hasMoved: false,
});

const removeQueen = (boardMatrix: BoardMatrix, color: PieceColor) => {
  const row = color === "white" ? 7 : 0;
  boardMatrix[row][3] = null;
};

const removeRook = (boardMatrix: BoardMatrix, color: PieceColor, side: "queen" | "king") => {
  const row = color === "white" ? 7 : 0;
  const col = side === "queen" ? 0 : 7;
  boardMatrix[row][col] = null;
};

const applyHandicap = (boardMatrix: BoardMatrix, color: PieceColor, level: number) => {
  if (level === 5) {
    removeQueen(boardMatrix, color);
    removeRook(boardMatrix, color, "queen");
    removeRook(boardMatrix, color, "king");
  } else if (level === 4) {
    removeQueen(boardMatrix, color);
    removeRook(boardMatrix, color, "queen");
  } else if (level === 3) {
    removeQueen(boardMatrix, color);
  } else if (level === 2) {
    removeRook(boardMatrix, color, "queen");
    removeRook(boardMatrix, color, "king");
  } else if (level === 1) {
    removeRook(boardMatrix, color, "queen");
  }
};

export const createInitialBoard = (difficulty: number): BoardMatrix => {
  const board: BoardMatrix = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  );
  const backRank: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  backRank.forEach((type, col) => {
    board[0][col] = createPiece(type, "black");
    board[1][col] = createPiece("pawn", "black");
    board[6][col] = createPiece("pawn", "white");
    board[7][col] = createPiece(type, "white");
  });
  if (difficulty < 0) {
    applyHandicap(board, "black", Math.abs(difficulty));
  } else if (difficulty > 0) {
    applyHandicap(board, "white", difficulty);
  }
  return board;
};

const cloneBoard = (board: BoardMatrix): BoardMatrix =>
  board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));

export const initialCastlingRights = (boardMatrix: BoardMatrix): CastlingRights => {
  const whiteKing = boardMatrix[7]?.[4]?.type === "king" && boardMatrix[7]?.[4]?.color === "white";
  const blackKing = boardMatrix[0]?.[4]?.type === "king" && boardMatrix[0]?.[4]?.color === "black";
  return {
    whiteKingSide: !!whiteKing && boardMatrix[7]?.[7]?.type === "rook" && boardMatrix[7]?.[7]?.color === "white",
    whiteQueenSide: !!whiteKing && boardMatrix[7]?.[0]?.type === "rook" && boardMatrix[7]?.[0]?.color === "white",
    blackKingSide: !!blackKing && boardMatrix[0]?.[7]?.type === "rook" && boardMatrix[0]?.[7]?.color === "black",
    blackQueenSide: !!blackKing && boardMatrix[0]?.[0]?.type === "rook" && boardMatrix[0]?.[0]?.color === "black",
  };
};

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

export const capitalize = (color: PieceColor) => (color === "white" ? "Dwarf" : "Ork");
export const oppositeColor = (color: PieceColor): PieceColor => (color === "white" ? "black" : "white");
const squareToNotation = (square: Square) =>
  `${String.fromCharCode(97 + square.col).toUpperCase()}${BOARD_SIZE - square.row}`;

const isInside = (row: number, col: number) => row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE;

export const getStateSnapshot = (enPassant: Square | null, castling: CastlingRights): GameSnapshot => ({
  enPassant: enPassant ? { ...enPassant } : null,
  castling: { ...castling },
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

export const isKingInCheck = (boardMatrix: BoardMatrix, color: PieceColor) => {
  const kingSquare = findKingSquare(boardMatrix, color);
  if (!kingSquare) return false;
  return isSquareAttacked(boardMatrix, kingSquare, oppositeColor(color));
};

export const generateMovesForPiece = (
  boardMatrix: BoardMatrix,
  row: number,
  col: number,
  snapshot: GameSnapshot,
): Move[] => {
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
      } else if (
        snapshot.enPassant &&
        snapshot.enPassant.row === targetRow &&
        snapshot.enPassant.col === targetCol
      ) {
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
    const canCastleKingSide = piece.color === "white" ? rights.whiteKingSide : rights.blackKingSide;
    const canCastleQueenSide = piece.color === "white" ? rights.whiteQueenSide : rights.blackQueenSide;
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
      if (canCastleQueenSide && !boardMatrix[homeRow][1] && !boardMatrix[homeRow][2] && !boardMatrix[homeRow][3]) {
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

const updateCastlingAfterMove = (rights: CastlingRights, move: Move, captured?: Piece | null): CastlingRights => {
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

export const applyMoveToSnapshot = (boardMatrix: BoardMatrix, move: Move, snapshot: GameSnapshot): AppliedState => {
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

export const generateLegalMovesForColor = (
  boardMatrix: BoardMatrix,
  color: PieceColor,
  snapshot: GameSnapshot,
): LegalMove[] => {
  const moves: LegalMove[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const piece = boardMatrix[row][col];
      if (!piece || piece.color !== color) continue;
      const pseudoMoves = generateMovesForPiece(boardMatrix, row, col, snapshot);
      pseudoMoves.forEach((move) => {
        const outcome = applyMoveToSnapshot(boardMatrix, move, snapshot);
        if (!isKingInCheck(outcome.board, color)) {
          moves.push({ ...move, outcome });
        }
      });
    }
  }
  return moves;
};

export const describeMove = (move: Move) => {
  const pieceNames: Record<PieceType, string> = {
    pawn: "Pawn",
    knight: "Knight",
    bishop: "Bishop",
    rook: "Rook",
    queen: "Queen",
    king: "King",
  };
  if (move.castleRookFrom) {
    return move.to.col === 6 ? "Kingside castle" : "Queenside castle";
  }
  const captureTag = move.captured || move.enPassantCapture ? " (capture)" : "";
  const promotion = move.promotion ? `, promotes to ${pieceNames[move.promotion]}` : "";
  return `${pieceNames[move.piece.type]} ${squareToNotation(move.from)} -> ${squareToNotation(move.to)}${captureTag}${promotion}`;
};

export const getKingCaptureOutcome = (boardMatrix: BoardMatrix) => {
  const whiteAlive = !!findKingSquare(boardMatrix, "white");
  const blackAlive = !!findKingSquare(boardMatrix, "black");
  if (whiteAlive && blackAlive) {
    return { finished: false, winner: null as PieceColor | "draw" | null, message: null as string | null };
  }
  if (whiteAlive && !blackAlive) {
    return { finished: true, winner: "white" as const, message: "Dwarf wins by capturing the ork king." };
  }
  if (!whiteAlive && blackAlive) {
    return { finished: true, winner: "black" as const, message: "Ork wins by capturing the dwarf king." };
  }
  return { finished: true, winner: "draw" as const, message: "Both kings fall. The war ends in ashes." };
};

export const assessBoardState = (
  boardMatrix: BoardMatrix,
  nextTurn: PieceColor,
  snapshot: GameSnapshot,
  presetMoves?: LegalMove[],
) => {
  const moves = presetMoves ?? generateLegalMovesForColor(boardMatrix, nextTurn, snapshot);
  const inCheck = isKingInCheck(boardMatrix, nextTurn);
  if (!moves.length) {
    if (inCheck) {
      return {
        finished: true,
        moves,
        inCheck,
        winner: oppositeColor(nextTurn) as PieceColor,
        message: `${capitalize(oppositeColor(nextTurn))} wins by checkmate.`,
      };
    }
    return {
      finished: true,
      moves,
      inCheck,
      winner: "draw" as const,
      message: "Stalemate. Honor shared.",
    };
  }
  const message = inCheck
    ? `${capitalize(nextTurn)} is in check!`
    : nextTurn === "white"
      ? "Your move. Hold the line."
      : "Greenskins are plotting...";

  return { finished: false, moves, inCheck, winner: null as PieceColor | "draw" | null, message };
};

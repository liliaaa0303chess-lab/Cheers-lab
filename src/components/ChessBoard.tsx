import React from 'react';
import { getPieceDisplaySymbol, type BoardPieceInstance } from '../engine/chessEngine';
import type {
  AppSettings,
  BoardConfig,
  PieceDef,
  PlayerSide,
} from '../types/chess';

interface ChessBoardProps {
  board: BoardConfig;
  pieces?: Record<number, BoardPieceInstance>;
  setupMap?: Record<number, string>;
  customPieces?: PieceDef[];
  settings?: AppSettings;
  opponentThemeOverride?: {
    boardTexture?: string;
    boardLight?: string;
    boardDark?: string;
  } | null;
  selectedSquare?: number | null;
  legalTargets?: number[];
  captureTargets?: number[];
  powerTargets?: number[];
  lastMove?: { from: number; to: number } | null;
  inCheckSquares?: number[];
  viewerSide?: PlayerSide | null;
  compact?: boolean;
  onCellClick?: (index: number) => void;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  board,
  pieces,
  setupMap,
  customPieces = [],
  settings,
  opponentThemeOverride,
  selectedSquare = null,
  legalTargets = [],
  captureTargets = [],
  powerTargets = [],
  lastMove = null,
  inCheckSquares = [],
  viewerSide = null,
  compact = false,
  onCellClick,
}) => {
  const customMap: Record<string, PieceDef> = {};
  for (const p of customPieces) customMap[p.id] = p;

  const effectiveTexture =
    opponentThemeOverride?.boardTexture ||
    (board.texture && board.texture !== 'plain'
      ? board.texture
      : settings?.boardTexture || 'plain');

  const lightColor =
    opponentThemeOverride?.boardLight ||
    board.light ||
    settings?.boardLight ||
    '#dce5ef';
  const darkColor =
    opponentThemeOverride?.boardDark ||
    board.dark ||
    settings?.boardDark ||
    '#788ba2';

  const pieceTexture = settings?.pieceTexture || 'plain';
  const rows = Math.max(2, Math.min(16, board.rows || 8));
  const cols = Math.max(2, Math.min(16, board.cols || 8));
  const rotation = board.rotation || 0;
  const isDiagonalRotation = rotation % 90 !== 0;

  // Sizing: always fits cleanly inside mobile viewport without clipping, even when rotated 45°
  const maxPx = compact
    ? Math.min(340, Math.max(180, cols * 32))
    : Math.min(520, Math.max(240, cols * 48));

  const legalSet = new Set(legalTargets);
  const captureSet = new Set(captureTargets);
  const powerSet = new Set(powerTargets);
  const checkSet = new Set(inCheckSquares);

  const fontSizeClamp =
    cols >= 13
      ? 'clamp(11px, 2.8vw, 22px)'
      : cols >= 10
        ? 'clamp(13px, 3.6vw, 27px)'
        : 'clamp(16px, 5vw, 36px)';

  return (
    <div
      className="w-full flex items-center justify-center overflow-visible py-2"
      style={{
        paddingTop: isDiagonalRotation ? '2.25rem' : '0.5rem',
        paddingBottom: isDiagonalRotation ? '2.25rem' : '0.5rem',
      }}
    >
      <div
        className={`grid border-2 border-[#4f6076] rounded-md overflow-hidden select-none shadow-lg board-tex-${effectiveTexture}`}
        style={{
          width: isDiagonalRotation
            ? `min(64vw, ${Math.round(maxPx * 0.72)}px)`
            : `min(92vw, ${maxPx}px)`,
          aspectRatio: `${cols} / ${rows}`,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: 'center',
          touchAction: 'manipulation',
        }}
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const isDark = (r + c) % 2 === 1;
          const isActive = board.cells?.[i] !== 0;
          const isBlocked = Boolean(board.blocked?.includes(i));
          const isSpecial = Boolean(board.special?.includes(i));
          const isSelected = selectedSquare === i;
          const isLegal = legalSet.has(i);
          const isCapture = captureSet.has(i);
          const isPower = powerSet.has(i);
          const isLast = lastMove && (lastMove.from === i || lastMove.to === i);
          const isCheck = checkSet.has(i);

          // Resolve piece either from live GameState `pieces` or setupMap
          let renderSym: string | null = null;
          let renderSide: PlayerSide = 'white';
          let isShielded = false;
          let isInvisible = false;
          let isFrozen = false;
          let pTex = pieceTexture;

          const inst = pieces?.[i];
          if (inst) {
            // Hide enemy invisible pieces from opponent in online/AI play if viewerSide is set
            if (inst.invisibleTurns > 0 && viewerSide && inst.side !== viewerSide) {
              renderSym = null;
            } else {
              renderSide = inst.side;
              renderSym = getPieceDisplaySymbol(inst.pieceId, inst.side, customMap);
              isShielded = inst.shielded;
              isInvisible = inst.invisibleTurns > 0;
              isFrozen = inst.frozenTurns > 0;
              const def = customMap[inst.pieceId];
              if (def && pieceTexture === 'plain') {
                pTex = def.texture || 'plain';
              }
            }
          } else if (setupMap?.[i]) {
            const raw = String(setupMap[i]);
            const match = raw.match(/^(.*)\|(white|black|red|blue|green|gold)$/);
            const pid = match ? match[1] : raw;
            renderSide = (match ? match[2] : 'white') as PlayerSide;
            renderSym = getPieceDisplaySymbol(pid, renderSide, customMap);
          }

          if (!isActive) {
            return (
              <div
                key={i}
                onClick={() => onCellClick?.(i)}
                className="min-w-0 min-h-0 bg-transparent cursor-pointer"
                aria-label={`Case ${r + 1}-${c + 1} supprimée`}
              />
            );
          }

          const squareBgStyle =
            effectiveTexture === 'plain' && !isBlocked
              ? { backgroundColor: isDark ? darkColor : lightColor }
              : undefined;

          return (
            <button
              key={i}
              type="button"
              onClick={() => onCellClick?.(i)}
              style={{
                ...squareBgStyle,
                fontSize: fontSizeClamp,
              }}
              className={`relative min-w-0 min-h-0 flex items-center justify-center p-0 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 transition-transform duration-100 ${
                isDark ? 'cell-dark' : 'cell-light'
              } ${isBlocked ? 'cell-blocked cursor-not-allowed' : 'cursor-pointer'} ${
                isSelected ? 'ring-3 ring-inset ring-amber-300 z-10' : ''
              } ${isLast && !isSelected ? 'ring-2 ring-inset ring-sky-400/80' : ''} ${
                isCheck ? 'bg-rose-600/75!' : ''
              }`}
              aria-label={`Case ${String.fromCharCode(97 + (c % 26))}${rows - r}`}
            >
              {/* Special cell marker */}
              {isSpecial && !isBlocked && (
                <span
                  className="absolute top-0.5 right-0.5 text-[9px] leading-none text-amber-400 drop-shadow pointer-events-none"
                  title={board.specialEffect || 'Case spéciale'}
                >
                  ✦
                </span>
              )}

              {/* Legal move dot / capture ring / power ring */}
              {isLegal && !renderSym && !isCapture && (
                <span className="w-[28%] h-[28%] rounded-full bg-emerald-400/75 shadow-sm pointer-events-none" />
              )}
              {isCapture && (
                <span className="absolute inset-[6%] rounded-full border-[3px] border-rose-500/85 pointer-events-none z-10" />
              )}
              {isPower && !isCapture && (
                <span className="absolute inset-[8%] rounded-full border-2 border-dashed border-violet-400/90 pointer-events-none z-10" />
              )}

              {/* Piece glyph */}
              {renderSym && (
                <span
                  className={`piece-glyph piece-side-${renderSide} piece-tex-${pTex} z-10 ${
                    isInvisible ? 'opacity-45' : ''
                  } ${isFrozen ? 'ring-1 ring-cyan-300 rounded-full px-0.5' : ''}`}
                  style={{
                    transform: rotation ? `rotate(${-rotation}deg)` : undefined,
                  }}
                >
                  {renderSym}
                </span>
              )}

              {/* Shield indicator */}
              {isShielded && (
                <span
                  className="absolute bottom-0.5 left-0.5 text-[9px] leading-none text-sky-300 pointer-events-none z-20"
                  title="Bouclier actif"
                >
                  🛡
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

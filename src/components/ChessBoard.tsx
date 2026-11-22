import React, { useLayoutEffect, useRef, useState } from 'react';
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
  fullscreen?: boolean;
  isMyTurnHighlight?: boolean;
  onCellClick?: (index: number) => void;
}

interface SlideAnimState {
  sq: number;
  dxPct: number;
  dyPct: number;
  active: boolean;
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
  fullscreen = false,
  isMyTurnHighlight = false,
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
  const flipBoard = viewerSide === 'black';

  const [slideAnim, setSlideAnim] = useState<SlideAnimState | null>(null);
  const lastMoveUidRef = useRef<string>('');

  // Smooth fast glide animation before paint (zero flicker) when a piece moves from -> to
  useLayoutEffect(() => {
    if (!lastMove || lastMove.from === lastMove.to || !pieces) {
      setSlideAnim(null);
      return;
    }
    const movedPiece = pieces[lastMove.to];
    if (!movedPiece) return;

    const moveKey = `${lastMove.from}->${lastMove.to}:${movedPiece.uid}`;
    if (lastMoveUidRef.current === moveKey) return;
    lastMoveUidRef.current = moveKey;

    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const rFromRaw = Math.floor(lastMove.from / cols);
    const cFromRaw = lastMove.from % cols;
    const rToRaw = Math.floor(lastMove.to / cols);
    const cToRaw = lastMove.to % cols;

    const rFrom = flipBoard ? rows - 1 - rFromRaw : rFromRaw;
    const cFrom = flipBoard ? cols - 1 - cFromRaw : cFromRaw;
    const rTo = flipBoard ? rows - 1 - rToRaw : rToRaw;
    const cTo = flipBoard ? cols - 1 - cToRaw : cToRaw;

    const dxPct = (cFrom - cTo) * 100;
    const dyPct = (rFrom - rTo) * 100;

    setSlideAnim({ sq: lastMove.to, dxPct, dyPct, active: false });

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setSlideAnim((curr) => (curr && curr.sq === lastMove.to ? { ...curr, active: true } : curr));
      });
    });

    const timer = setTimeout(() => {
      setSlideAnim((curr) => (curr && curr.sq === lastMove.to ? null : curr));
    }, 185);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  }, [lastMove?.from, lastMove?.to, pieces, rows, cols, flipBoard]);

  // Sizing: large & crisp in normal view, viewport-filling in fullscreen without overflow
  const maxPx = compact
    ? Math.min(340, Math.max(180, cols * 32))
    : Math.min(680, Math.max(280, cols * 66));

  const legalSet = new Set(legalTargets);
  const captureSet = new Set(captureTargets);
  const powerSet = new Set(powerTargets);
  const checkSet = new Set(inCheckSquares);

  const fontSizeClamp = fullscreen
    ? cols >= 13
      ? 'clamp(14px, 3.2vw, 30px)'
      : cols >= 10
        ? 'clamp(16px, 4.2vw, 36px)'
        : 'clamp(22px, 6.2vw, 52px)'
    : cols >= 13
      ? 'clamp(12px, 2.8vw, 24px)'
      : cols >= 10
        ? 'clamp(14px, 3.8vw, 30px)'
        : 'clamp(18px, 5.4vw, 42px)';

  const aspectRatioScalar = (cols / rows).toFixed(4);
  const boardWidthStyle = fullscreen
    ? isDiagonalRotation
      ? 'min(68vw, 56dvh)'
      : `min(94vw, calc((100dvh - 220px) * ${aspectRatioScalar}))`
    : isDiagonalRotation
      ? `min(70vw, ${Math.round(maxPx * 0.74)}px)`
      : `min(94vw, ${maxPx}px)`;

  return (
    <div
      className="w-full flex items-center justify-center overflow-visible"
      style={{
        paddingTop: isDiagonalRotation ? '2.25rem' : fullscreen ? '0.1rem' : '0.4rem',
        paddingBottom: isDiagonalRotation ? '2.25rem' : fullscreen ? '0.1rem' : '0.4rem',
      }}
    >
      <div
        className={`grid rounded-lg overflow-hidden select-none transition-colors duration-200 board-tex-${effectiveTexture} ${
          isMyTurnHighlight
            ? 'border-2 border-emerald-400 shadow-[0_0_26px_rgba(52,211,153,0.28)]'
            : 'border-2 border-[#4f6076] shadow-xl'
        }`}
        style={{
          width: boardWidthStyle,
          aspectRatio: `${cols} / ${rows}`,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: 'center',
          touchAction: 'manipulation',
        }}
      >
        {Array.from({ length: rows * cols }, (_, visualPos) => {
          const i = flipBoard ? rows * cols - 1 - visualPos : visualPos;
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

          const isGlidingHere = slideAnim && slideAnim.sq === i;
          const pieceTransform = isGlidingHere
            ? slideAnim.active
              ? `translate3d(0%, 0%, 0)${rotation ? ` rotate(${-rotation}deg)` : ''}`
              : `translate3d(${slideAnim.dxPct}%, ${slideAnim.dyPct}%, 0)${
                  rotation ? ` rotate(${-rotation}deg)` : ''
                }`
            : rotation
              ? `rotate(${-rotation}deg)`
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
              className={`relative min-w-0 min-h-0 flex items-center justify-center p-0 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                isDark ? 'cell-dark' : 'cell-light'
              } ${isBlocked ? 'cell-blocked cursor-not-allowed' : 'cursor-pointer'} ${
                isGlidingHere ? 'z-30' : isSelected ? 'z-10' : ''
              } ${isSelected ? 'ring-3 ring-inset ring-amber-300' : ''} ${
                isLast && !isSelected ? 'ring-2 ring-inset ring-sky-400/80' : ''
              } ${isCheck ? 'bg-rose-600/75!' : ''}`}
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

              {/* Piece glyph with smooth GPU glide on move */}
              {renderSym && (
                <span
                  className={`piece-glyph piece-side-${renderSide} piece-tex-${pTex} w-full h-full flex items-center justify-center pointer-events-none ${
                    isGlidingHere ? 'z-30' : 'z-10'
                  } ${isInvisible ? 'opacity-45' : ''} ${
                    isFrozen ? 'ring-1 ring-cyan-300 rounded-full' : ''
                  }`}
                  style={{
                    transform: pieceTransform,
                    transition: isGlidingHere
                      ? slideAnim.active
                        ? 'transform 155ms cubic-bezier(0.2, 0.9, 0.3, 1)'
                        : 'none'
                      : undefined,
                    willChange: isGlidingHere ? 'transform' : undefined,
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

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  getPieceDisplaySymbol,
  normalizePieceRef,
  type BoardPieceInstance,
} from '../engine/chessEngine';
import type {
  AppSettings,
  BoardConfig,
  PieceDef,
  PlayerSide,
} from '../types/chess';
import { ChessPieceArtwork } from './ChessPieceArtwork';

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
  premoveTargets?: number[];
  premoveSquares?: { from: number; to: number } | null;
  lastMove?: { from: number; to: number } | null;
  inCheckSquares?: number[];
  viewerSide?: PlayerSide | null;
  compact?: boolean;
  fullscreen?: boolean;
  isMyTurnHighlight?: boolean;
  gameWon?: boolean;
  goldEffects?: {
    goldLastMove?: boolean;
    captureSparks?: boolean;
    checkPulse?: boolean;
    powerShimmer?: boolean;
    victoryCrownFrame?: boolean;
    boardGoldSheen?: boolean;
    turnAura?: boolean;
  };
  canDragSquare?: (index: number) => boolean;
  onPieceDrop?: (from: number, to: number) => void;
  onBoardContextMenu?: () => void;
  onCellClick?: (index: number) => void;
}

interface SlideAnimState {
  sq: number;
  dxPct: number;
  dyPct: number;
  active: boolean;
}

interface DragGhostState {
  from: number;
  clientX: number;
  clientY: number;
  hoverSquare: number | null;
  sizePx: number;
  pieceId?: string;
  symbol: string;
  side: PlayerSide;
  texture: string;
  lightColor?: string;
  darkColor?: string;
}

function getSquareIdxAtPoint(clientX: number, clientY: number): number | null {
  if (typeof document === 'undefined') return null;
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    if (el instanceof HTMLElement && el.dataset.squareIdx !== undefined) {
      const idx = Number(el.dataset.squareIdx);
      if (Number.isInteger(idx) && idx >= 0) return idx;
    }
  }
  return null;
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
  premoveTargets = [],
  premoveSquares = null,
  lastMove = null,
  inCheckSquares = [],
  viewerSide = null,
  compact = false,
  fullscreen = false,
  isMyTurnHighlight = false,
  gameWon = false,
  goldEffects,
  canDragSquare,
  onPieceDrop,
  onBoardContextMenu,
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
  const [dragGhost, setDragGhost] = useState<DragGhostState | null>(null);
  const lastMoveUidRef = useRef<string>('');
  const suppressNextClickRef = useRef(false);

  const selectedSquareRef = useRef(selectedSquare);
  selectedSquareRef.current = selectedSquare;
  const onCellClickRef = useRef(onCellClick);
  onCellClickRef.current = onCellClick;
  const onPieceDropRef = useRef(onPieceDrop);
  onPieceDropRef.current = onPieceDrop;

  const dragSessionRef = useRef<{
    pointerId: number;
    from: number;
    startX: number;
    startY: number;
    moved: boolean;
    meta: Omit<DragGhostState, 'from' | 'clientX' | 'clientY' | 'hoverSquare'>;
  } | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      if (!session.moved) {
        const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
        if (dist < 6) return;
        session.moved = true;
        if (selectedSquareRef.current !== session.from) {
          onCellClickRef.current?.(session.from);
        }
      }

      const hoverSquare = getSquareIdxAtPoint(e.clientX, e.clientY);
      setDragGhost({
        from: session.from,
        clientX: e.clientX,
        clientY: e.clientY,
        hoverSquare,
        ...session.meta,
      });
    };

    const finishDrag = (e: PointerEvent, commitDrop: boolean) => {
      const session = dragSessionRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      const wasMoved = session.moved;
      const fromSq = session.from;
      dragSessionRef.current = null;
      setDragGhost(null);

      if (wasMoved) {
        suppressNextClickRef.current = true;
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 90);
        if (commitDrop) {
          const targetSq = getSquareIdxAtPoint(e.clientX, e.clientY);
          if (targetSq !== null && targetSq !== fromSq) {
            onPieceDropRef.current?.(fromSq, targetSq);
          }
        }
      }
    };

    const onUp = (e: PointerEvent) => finishDrag(e, true);
    const onCancel = (e: PointerEvent) => finishDrag(e, false);

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  // Smooth fast glide animation before paint (zero flicker) when a piece moves from -> to
  useLayoutEffect(() => {
    if (!lastMove || lastMove.from === lastMove.to || lastMove.from < 0 || !pieces) {
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
  const premoveTargetSet = new Set(premoveTargets);
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
      ? 'min(68vw, 50dvh)'
      : `min(94vw, calc((100dvh - 260px) * ${aspectRatioScalar}))`
    : isDiagonalRotation
      ? `min(70vw, ${Math.round(maxPx * 0.74)}px)`
      : `min(94vw, ${maxPx}px)`;

  const handleSquareClick = (i: number) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    onCellClick?.(i);
  };

  return (
    <div
      className="w-full flex items-center justify-center overflow-visible"
      style={{
        paddingTop: isDiagonalRotation ? '2.25rem' : fullscreen ? '0.1rem' : '0.4rem',
        paddingBottom: isDiagonalRotation ? '2.25rem' : fullscreen ? '0.1rem' : '0.4rem',
      }}
    >
      <div
        onContextMenu={(e) => {
          if (onBoardContextMenu) {
            e.preventDefault();
            onBoardContextMenu();
          }
        }}
        className={`grid rounded-lg overflow-hidden select-none transition-colors duration-200 board-tex-${effectiveTexture} ${
          gameWon && goldEffects?.victoryCrownFrame
            ? 'border-4 border-amber-400 shadow-[0_0_34px_rgba(251,191,36,0.55)]'
            : isMyTurnHighlight
              ? goldEffects?.turnAura
                ? 'border-2 border-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.38)]'
                : 'border-2 border-emerald-400 shadow-[0_0_26px_rgba(52,211,153,0.28)]'
              : goldEffects?.boardGoldSheen
                ? 'border-2 border-amber-500/55 shadow-[0_0_18px_rgba(245,158,11,0.2)]'
                : 'border-2 border-[#4f6076] shadow-xl'
        }`}
        style={{
          width: boardWidthStyle,
          aspectRatio: `${cols} / ${rows}`,
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: 'center',
          touchAction: dragGhost ? 'none' : 'manipulation',
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
          const isPremoveTarget = premoveTargetSet.has(i);
          const isPremoveSq = Boolean(
            premoveSquares && (premoveSquares.from === i || premoveSquares.to === i)
          );
          const isLast = lastMove && (lastMove.from === i || lastMove.to === i);
          const isCheck = checkSet.has(i);
          const isDragOrigin = dragGhost?.from === i;
          const isDragHover = dragGhost?.hoverSquare === i && dragGhost.from !== i;

          // Resolve piece either from live GameState `pieces` or setupMap
          let renderPieceId: string | undefined;
          let renderSym: string | null = null;
          let renderSide: PlayerSide = 'white';
          let renderLight: string | undefined;
          let renderDark: string | undefined;
          let isShielded = false;
          let isInvisible = false;
          let isFrozen = false;
          let pTex = pieceTexture;

          const inst = pieces?.[i];
          if (inst) {
            if (inst.invisibleTurns > 0 && viewerSide && inst.side !== viewerSide) {
              renderSym = null;
            } else {
              renderPieceId = inst.pieceId;
              renderSide = inst.side;
              renderSym = getPieceDisplaySymbol(inst.pieceId, inst.side, customMap);
              isShielded = inst.shielded;
              isInvisible = inst.invisibleTurns > 0;
              isFrozen = inst.frozenTurns > 0;
              const def = customMap[inst.pieceId];
              if (def) {
                renderLight = def.light;
                renderDark = def.dark;
                if (pieceTexture === 'plain') {
                  pTex = def.texture || 'plain';
                }
              }
            }
          } else if (setupMap?.[i]) {
            const norm = normalizePieceRef(String(setupMap[i]));
            renderPieceId = norm.pieceId;
            renderSide = norm.side;
            renderSym = getPieceDisplaySymbol(norm.pieceId, renderSide, customMap);
            const def = customMap[norm.pieceId];
            if (def) {
              renderLight = def.light;
              renderDark = def.dark;
              if (pieceTexture === 'plain') {
                pTex = def.texture || 'plain';
              }
            }
          }

          if (!isActive) {
            return (
              <div
                key={i}
                data-square-idx={i}
                onClick={() => handleSquareClick(i)}
                className="min-w-0 min-h-0 bg-transparent cursor-pointer"
                aria-label={`Case ${r + 1}-${c + 1} supprimée`}
              />
            );
          }

          const draggableHere = Boolean(
            renderSym && !isBlocked && onPieceDrop && canDragSquare?.(i)
          );

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
              data-square-idx={i}
              onClick={() => handleSquareClick(i)}
              onPointerDown={(e) => {
                if (!draggableHere || !renderSym) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                dragSessionRef.current = {
                  pointerId: e.pointerId,
                  from: i,
                  startX: e.clientX,
                  startY: e.clientY,
                  moved: false,
                  meta: {
                    sizePx: Math.max(28, Math.min(rect.width, rect.height) * 0.92),
                    pieceId: renderPieceId,
                    symbol: renderSym,
                    side: renderSide,
                    texture: pTex,
                    lightColor: renderLight,
                    darkColor: renderDark,
                  },
                };
              }}
              style={{
                ...squareBgStyle,
                fontSize: fontSizeClamp,
                touchAction: draggableHere ? 'none' : undefined,
              }}
              className={`relative min-w-0 min-h-0 flex items-center justify-center p-0 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                isDark ? 'cell-dark' : 'cell-light'
              } ${
                isBlocked
                  ? 'cell-blocked cursor-not-allowed'
                  : draggableHere
                    ? isDragOrigin
                      ? 'cursor-grabbing'
                      : 'cursor-grab'
                    : 'cursor-pointer'
              } ${isGlidingHere ? 'z-30' : isSelected ? 'z-10' : ''} ${
                isSelected ? 'ring-3 ring-inset ring-amber-300' : ''
              } ${
                isPremoveSq && !isSelected
                  ? 'ring-2 ring-inset ring-cyan-400 bg-cyan-500/25!'
                  : isLast && !isSelected
                    ? goldEffects?.goldLastMove
                      ? 'ring-2 ring-inset ring-amber-400 shadow-[inset_0_0_12px_rgba(251,191,36,0.45)]'
                      : 'ring-2 ring-inset ring-sky-400/80'
                    : ''
              } ${
                isDragHover ? 'ring-2 ring-inset ring-sky-300 bg-sky-400/20!' : ''
              } ${
                isCheck
                  ? goldEffects?.checkPulse
                    ? 'bg-rose-600/80! ring-2 ring-inset ring-amber-300 animate-pulse'
                    : 'bg-rose-600/75!'
                  : ''
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

              {/* Legal move dot / capture ring / power ring / premove dot */}
              {isLegal && !renderSym && !isCapture && (
                <span className="w-[28%] h-[28%] rounded-full bg-emerald-400/75 shadow-sm pointer-events-none" />
              )}
              {isCapture && (
                <span
                  className={`absolute inset-[6%] rounded-full border-[3px] pointer-events-none z-10 ${
                    goldEffects?.captureSparks
                      ? 'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.75)]'
                      : 'border-rose-500/85'
                  }`}
                />
              )}
              {isPower && !isCapture && (
                <span
                  className={`absolute inset-[8%] rounded-full border-2 border-dashed pointer-events-none z-10 ${
                    goldEffects?.powerShimmer
                      ? 'border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.65)]'
                      : 'border-violet-400/90'
                  }`}
                />
              )}
              {isPremoveTarget && !isLegal && !isCapture && (
                <span className="w-[28%] h-[28%] rounded-full bg-cyan-400/70 ring-2 ring-cyan-200/60 pointer-events-none z-10" />
              )}

              {/* Piece artwork with smooth GPU glide on move */}
              {renderSym && (
                <span
                  className={`piece-tex-${pTex} w-[84%] h-[84%] flex items-center justify-center pointer-events-none select-none ${
                    isGlidingHere ? 'z-30' : 'z-10'
                  } ${isDragOrigin ? 'opacity-20' : isInvisible ? 'opacity-45' : ''} ${
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
                  <ChessPieceArtwork
                    pieceId={renderPieceId}
                    symbol={renderSym}
                    side={renderSide}
                    texture={pTex}
                    lightColor={renderLight}
                    darkColor={renderDark}
                    mode="board"
                    className="w-full h-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
                  />
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

      {/* Floating GPU-composited drag ghost */}
      {dragGhost && (
        <div
          className={`fixed left-0 top-0 pointer-events-none z-[90] piece-tex-${dragGhost.texture}`}
          style={{
            width: `${dragGhost.sizePx}px`,
            height: `${dragGhost.sizePx}px`,
            transform: `translate3d(${dragGhost.clientX - dragGhost.sizePx / 2}px, ${
              dragGhost.clientY - dragGhost.sizePx / 2
            }px, 0) scale(1.12)`,
            willChange: 'transform',
          }}
        >
          <ChessPieceArtwork
            pieceId={dragGhost.pieceId}
            symbol={dragGhost.symbol}
            side={dragGhost.side}
            texture={dragGhost.texture}
            lightColor={dragGhost.lightColor}
            darkColor={dragGhost.darkColor}
            mode="board"
            className="w-full h-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.65)]"
          />
        </div>
      )}
    </div>
  );
};

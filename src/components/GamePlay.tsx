import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Flag,
  Globe,
  Handshake,
  Info,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
} from 'lucide-react';
import { chooseBestAiMove } from '../engine/aiEngine';
import {
  applyMove,
  cloneGameState,
  createInitialGameState,
  explainBlockedMove,
  getCurrentTurnSide,
  getLegalMovesForSquare,
  getSpecialPowerMoves,
  isStandardChessCompatible,
  SIDE_LABELS,
  type GameState,
  type LegalMove,
} from '../engine/chessEngine';
import { computeEolTransfer } from '../engine/eol';
import {
  AI_LEVELS,
  type AiDifficultyLevel,
  type AppSettings,
  type EolBreakdown,
  type GameMode,
  type GameRecord,
  type PieceDef,
  type PlayerSide,
  type Profile,
  type Variant,
} from '../types/chess';
import { playChessSound } from '../utils/sound';
import { ChessBoard } from './ChessBoard';
import { VariantRulesSummary } from './VariantRulesSummary';

interface GamePlayProps {
  variants: Variant[];
  selectedVariantId: string | null;
  initialMode?: GameMode;
  autoMatchedRoom?: {
    roomId: string;
    code: string;
    yourSide: 'white' | 'black';
    opponent: {
      userId: string;
      nickname: string;
      eol: number;
      theme?: { boardTexture?: string; boardLight?: string; boardDark?: string };
    };
    ws: WebSocket;
  } | null;
  profile: Profile;
  customPieces: PieceDef[];
  settings: AppSettings;
  userRatings: Record<string, number>;
  onSelectVariantId: (id: string) => void;
  onFinishGame: (record: GameRecord, updatedEol?: number) => void;
  onRateVariant: (variantId: string, stars: number) => void;
  onClearOnlineRoom?: () => void;
  onNotify: (msg: string) => void;
}

function formatClock(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const GamePlay: React.FC<GamePlayProps> = ({
  variants,
  selectedVariantId,
  initialMode = 'ai',
  autoMatchedRoom = null,
  profile,
  customPieces,
  settings,
  userRatings,
  onSelectVariantId,
  onFinishGame,
  onRateVariant,
  onClearOnlineRoom,
  onNotify,
}) => {
  const activeVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || variants[0],
    [variants, selectedVariantId]
  );

  const [mode, setMode] = useState<GameMode>(autoMatchedRoom ? 'online' : initialMode);
  const [aiLevel, setAiLevel] = useState<AiDifficultyLevel>(5);
  const [phase, setPhase] = useState<'lobby' | 'playing' | 'ended'>(
    autoMatchedRoom ? 'playing' : 'lobby'
  );

  const [gameState, setGameState] = useState<GameState | null>(() =>
    activeVariant ? createInitialGameState(activeVariant, customPieces) : null
  );
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [analysisTrayPiece, setAnalysisTrayPiece] = useState<string>('builtin:Q|white');
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [pendingDrawOffer, setPendingDrawOffer] = useState<'incoming' | 'local_prompt' | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [engineBadge, setEngineBadge] = useState<'stockfish' | 'variant' | null>(null);
  const [lastEolBreakdown, setLastEolBreakdown] = useState<EolBreakdown | null>(null);
  const [endRatingHover, setEndRatingHover] = useState<number>(0);

  // Clocks
  const [clocks, setClocks] = useState<Record<PlayerSide, number>>({
    white: 600,
    black: 600,
    red: 600,
    blue: 600,
    green: 600,
    gold: 600,
  });

  // Online Room state
  const [onlineWs, setOnlineWs] = useState<WebSocket | null>(autoMatchedRoom?.ws || null);
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(autoMatchedRoom?.roomId || null);
  const [onlineCode, setOnlineCode] = useState<string>(autoMatchedRoom?.code || '');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [myOnlineSide, setMyOnlineSide] = useState<'white' | 'black'>(
    autoMatchedRoom?.yourSide || 'white'
  );
  const [onlineOpponent, setOnlineOpponent] = useState(autoMatchedRoom?.opponent || null);
  const [waitingRoomCode, setWaitingRoomCode] = useState<string | null>(null);

  const gameRecordedRef = useRef(false);

  // Sync external autoMatchedRoom (from Discover)
  useEffect(() => {
    if (autoMatchedRoom && activeVariant) {
      setMode('online');
      setOnlineWs(autoMatchedRoom.ws);
      setOnlineRoomId(autoMatchedRoom.roomId);
      setOnlineCode(autoMatchedRoom.code);
      setMyOnlineSide(autoMatchedRoom.yourSide);
      setOnlineOpponent(autoMatchedRoom.opponent);
      const fresh = createInitialGameState(activeVariant, customPieces);
      setGameState(fresh);
      resetClocks(activeVariant);
      gameRecordedRef.current = false;
      setLastEolBreakdown(null);
      setPhase('playing');
    }
  }, [autoMatchedRoom]);

  const resetClocks = (v: Variant) => {
    const secs = (v.duration || 0) * 60;
    setClocks({
      white: secs,
      black: secs,
      red: secs,
      blue: secs,
      green: secs,
      gold: secs,
    });
  };

  // Start local / AI / analysis game
  const startGame = (chosenMode: GameMode) => {
    if (!activeVariant) return;
    setMode(chosenMode);
    const fresh = createInitialGameState(activeVariant, customPieces);
    setGameState(fresh);
    setSelectedSquare(null);
    setLastEolBreakdown(null);
    setEngineBadge(null);
    gameRecordedRef.current = false;
    resetClocks(activeVariant);
    setPhase('playing');
    if (chosenMode === 'ai') {
      onNotify(
        isStandardChessCompatible(activeVariant)
          ? 'Partie lancée avec le moteur Stockfish.'
          : 'Partie lancée avec le moteur IA adapté à la variante.'
      );
    }
  };

  // Clock countdown
  useEffect(() => {
    if (phase !== 'playing' || !gameState || gameState.winner || mode === 'analysis') return;
    if ((gameState.variant.duration || 0) <= 0) return;

    const timer = setInterval(() => {
      const turnSide = getCurrentTurnSide(gameState);
      setClocks((prev) => {
        const nextVal = Math.max(0, prev[turnSide] - 1);
        if (nextVal === 0) {
          const otherSides = gameState.activeSides.filter(
            (s) => s !== turnSide && !gameState.eliminatedSides.includes(s)
          );
          const winner = otherSides[0] || 'draw';
          setGameState((curr) =>
            curr
              ? {
                  ...curr,
                  winner,
                  endReason: `Temps écoulé pour les ${SIDE_LABELS[turnSide]}.`,
                }
              : curr
          );
        }
        return { ...prev, [turnSide]: nextVal };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, gameState?.turnIndex, gameState?.winner, mode]);

  // Trigger game completion + ÉOL recording when gameState.winner becomes non-null
  useEffect(() => {
    if (!gameState || !gameState.winner || gameRecordedRef.current || mode === 'analysis') return;
    gameRecordedRef.current = true;
    setPhase('ended');

    const mySide: PlayerSide = mode === 'online' ? myOnlineSide : 'white';
    const result: 'win' | 'loss' | 'draw' =
      gameState.winner === 'draw'
        ? 'draw'
        : gameState.winner === mySide
          ? 'win'
          : 'loss';

    playChessSound(
      result === 'draw' ? 'draw' : 'win',
      settings.sound,
      settings.volume
    );

    let breakdown: EolBreakdown | undefined;
    if (mode === 'ai' || mode === 'online') {
      const oppEol =
        mode === 'online'
          ? onlineOpponent?.eol || 400
          : 250 + aiLevel * 65; // AI ÉOL scale across 10 levels
      const oppName =
        mode === 'online'
          ? onlineOpponent?.nickname || 'Adversaire en ligne'
          : `IA ${AI_LEVELS.find((l) => l.level === aiLevel)?.label || ''}`;
      const isCreator = gameState.variant.creatorId === profile.id;

      breakdown = computeEolTransfer({
        playerEol: profile.eol,
        opponentEol: oppEol,
        result,
        variant: gameState.variant,
        playerPriorGames: profile.variantPlayCounts?.[gameState.variant.id] || 0,
        opponentPriorGames: 2,
        isPlayerCreator: isCreator,
        isOpponentCreator:
          mode === 'online' && onlineOpponent?.userId === gameState.variant.creatorId,
        movesCount: gameState.moveHistory.length,
      });
      setLastEolBreakdown(breakdown);

      const rec: GameRecord = {
        id: `gm_${crypto.randomUUID().slice(0, 10)}`,
        type: mode === 'online' ? 'Partie en ligne' : 'Partie contre IA',
        mode,
        variantId: gameState.variant.id,
        variantName: gameState.variant.name,
        creatorName: gameState.variant.creator,
        opponentName: oppName,
        opponentEol: oppEol,
        playerSide: mySide,
        result,
        reason: gameState.endReason || undefined,
        movesCount: gameState.moveHistory.length,
        date: new Date().toISOString(),
        eolBreakdown: breakdown,
        userRating: userRatings[gameState.variant.id],
      };
      onFinishGame(rec, breakdown.counted ? breakdown.playerEolAfter : undefined);
    } else {
      const rec: GameRecord = {
        id: `gm_${crypto.randomUUID().slice(0, 10)}`,
        type: 'Partie locale',
        mode: 'local',
        variantId: gameState.variant.id,
        variantName: gameState.variant.name,
        creatorName: gameState.variant.creator,
        opponentName: 'Joueur local',
        playerSide: 'white',
        result,
        reason: gameState.endReason || undefined,
        movesCount: gameState.moveHistory.length,
        date: new Date().toISOString(),
        userRating: userRatings[gameState.variant.id],
      };
      onFinishGame(rec);
    }
  }, [gameState?.winner]);

  // AI Turn automation
  useEffect(() => {
    if (
      phase !== 'playing' ||
      mode !== 'ai' ||
      !gameState ||
      gameState.winner ||
      getCurrentTurnSide(gameState) === 'white'
    ) {
      return;
    }

    let cancelled = false;
    setAiThinking(true);

    const timer = setTimeout(async () => {
      const { move, engineUsed } = await chooseBestAiMove(gameState, aiLevel);
      if (cancelled) return;
      setAiThinking(false);
      setEngineBadge(engineUsed);

      if (!move) {
        setGameState((prev) =>
          prev
            ? {
                ...prev,
                winner: 'white',
                endReason: 'L’IA n’a plus de coup légal disponible.',
              }
            : prev
        );
        return;
      }

      const next = applyMove(gameState, move);
      if (next.inCheckSides.length > 0) {
        playChessSound('check', settings.sound, settings.volume);
      } else if (move.isPower) {
        playChessSound('power', settings.sound, settings.volume);
      } else if (move.captureIndex !== undefined) {
        playChessSound('capture', settings.sound, settings.volume);
      } else {
        playChessSound('move', settings.sound, settings.volume);
      }
      setGameState(next);
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, mode, gameState, aiLevel]);

  // WebSocket listener for Online game
  useEffect(() => {
    if (!onlineWs) return;
    const onMessage = (ev: MessageEvent<string>) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }

      if (msg.type === 'room:created') {
        setOnlineRoomId(String(msg.roomId));
        setWaitingRoomCode(String(msg.code));
        setMyOnlineSide('white');
        onNotify(`Salle créée ! Code : ${msg.code}`);
      } else if (msg.type === 'room:error') {
        onNotify(String(msg.message || 'Erreur de salle.'));
      } else if (msg.type === 'match:found') {
        const v = msg.variant as Variant;
        setOnlineRoomId(String(msg.roomId));
        setOnlineCode(String(msg.code));
        setWaitingRoomCode(null);
        setMyOnlineSide(msg.yourSide === 'black' ? 'black' : 'white');
        setOnlineOpponent(msg.opponent as typeof onlineOpponent);
        const fresh = createInitialGameState(v, customPieces);
        setGameState(fresh);
        resetClocks(v);
        gameRecordedRef.current = false;
        setLastEolBreakdown(null);
        setPhase('playing');
        onNotify('Adversaire connecté ! La partie commence.');
      } else if (msg.type === 'game:move') {
        const move = msg.move as LegalMove;
        setGameState((prev) => {
          if (!prev || prev.winner) return prev;
          const next = applyMove(prev, move);
          if (next.inCheckSides.length > 0) {
            playChessSound('check', settings.sound, settings.volume);
          } else if (move.captureIndex !== undefined) {
            playChessSound('capture', settings.sound, settings.volume);
          } else {
            playChessSound('move', settings.sound, settings.volume);
          }
          return next;
        });
      } else if (msg.type === 'game:draw_offered') {
        setPendingDrawOffer('incoming');
        onNotify('Votre adversaire propose la nulle.');
      } else if (msg.type === 'game:draw_response') {
        if (msg.accepted) {
          setGameState((prev) =>
            prev
              ? { ...prev, winner: 'draw', endReason: 'Match nul accepté par les deux joueurs.' }
              : prev
          );
        } else {
          onNotify('Proposition de nulle refusée. La partie continue.');
        }
      } else if (msg.type === 'game:opponent_resigned') {
        const oppSide = msg.resignedSide === 'white' ? 'black' : 'white';
        setGameState((prev) =>
          prev
            ? {
                ...prev,
                winner: oppSide,
                endReason: 'Votre adversaire a abandonné la partie.',
              }
            : prev
        );
      } else if (msg.type === 'game:opponent_disconnected') {
        onNotify('Adversaire déconnecté de la salle.');
      }
    };

    onlineWs.addEventListener('message', onMessage);
    return () => {
      onlineWs.removeEventListener('message', onMessage);
    };
  }, [onlineWs, customPieces]);

  const openWsConnection = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (onlineWs && onlineWs.readyState === WebSocket.OPEN) {
        resolve(onlineWs);
        return;
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onopen = () => {
        setOnlineWs(ws);
        resolve(ws);
      };
      ws.onerror = () => reject(new Error('Connexion temps réel impossible'));
    });
  };

  const handleCreateOnlineRoom = async () => {
    if (!activeVariant) return;
    try {
      const ws = await openWsConnection();
      ws.send(
        JSON.stringify({
          type: 'room:create',
          userId: profile.id,
          nickname: profile.nickname || 'Joueur',
          eol: profile.eol,
          variant: activeVariant,
          theme: {
            boardTexture: settings.boardTexture,
            boardLight: settings.boardLight,
            boardDark: settings.boardDark,
          },
        })
      );
    } catch {
      onNotify('Impossible de se connecter au serveur multijoueur.');
    }
  };

  const handleJoinOnlineRoom = async () => {
    if (!joinCodeInput.trim()) {
      onNotify('Entrez un code de salle.');
      return;
    }
    try {
      const ws = await openWsConnection();
      ws.send(
        JSON.stringify({
          type: 'room:join',
          code: joinCodeInput.trim().toUpperCase(),
          userId: profile.id,
          nickname: profile.nickname || 'Joueur',
          eol: profile.eol,
          theme: {
            boardTexture: settings.boardTexture,
            boardLight: settings.boardLight,
            boardDark: settings.boardDark,
          },
        })
      );
    } catch {
      onNotify('Impossible de rejoindre la salle.');
    }
  };

  const legalMovesForSelected = useMemo(() => {
    if (!gameState || selectedSquare === null || mode === 'analysis') return [];
    return getLegalMovesForSquare(gameState, selectedSquare, true);
  }, [gameState, selectedSquare, mode]);

  const powerMovesForSelected = useMemo(() => {
    if (!gameState || selectedSquare === null || mode === 'analysis') return [];
    return getSpecialPowerMoves(gameState, selectedSquare);
  }, [gameState, selectedSquare, mode]);

  const executePlayerMove = (move: LegalMove) => {
    if (!gameState || gameState.winner) return;
    const next = applyMove(gameState, move);
    setGameState(next);
    setSelectedSquare(null);

    if (next.inCheckSides.length > 0) {
      playChessSound('check', settings.sound, settings.volume);
    } else if (move.isPower) {
      playChessSound('power', settings.sound, settings.volume);
    } else if (move.captureIndex !== undefined) {
      playChessSound('capture', settings.sound, settings.volume);
    } else {
      playChessSound('move', settings.sound, settings.volume);
    }

    if (mode === 'online' && onlineWs && onlineRoomId) {
      onlineWs.send(
        JSON.stringify({
          type: 'game:move',
          roomId: onlineRoomId,
          move,
        })
      );
    }
  };

  const handleBoardClick = (index: number) => {
    if (!gameState) return;

    // Free Analysis mode: free placement and movement without turn restrictions
    if (mode === 'analysis') {
      if (
        gameState.board.cells[index] === 0 ||
        gameState.board.blocked?.includes(index)
      ) {
        onNotify('Case bloquée ou supprimée.');
        return;
      }
      const next = cloneGameState(gameState);
      if (selectedSquare !== null) {
        if (selectedSquare === index) {
          setSelectedSquare(null);
          return;
        }
        const moving = next.pieces[selectedSquare];
        if (moving) {
          delete next.pieces[selectedSquare];
          next.pieces[index] = moving;
          next.lastMove = { from: selectedSquare, to: index };
          playChessSound('move', settings.sound, settings.volume);
          setGameState(next);
          setSelectedSquare(null);
          return;
        }
      }
      if (next.pieces[index]) {
        setSelectedSquare(index);
      } else {
        const [pid, side] = analysisTrayPiece.split('|');
        next.pieces[index] = {
          uid: `ana_${Date.now()}_${index}`,
          pieceId: pid,
          side: (side as PlayerSide) || 'white',
          hasMoved: false,
          shielded: false,
          invisibleTurns: 0,
          frozenTurns: 0,
          powerUsesLeft: 3,
        };
        setGameState(next);
        playChessSound('move', settings.sound, settings.volume);
      }
      return;
    }

    if (gameState.winner || aiThinking) return;

    const currentTurn = getCurrentTurnSide(gameState);
    if (mode === 'ai' && currentTurn !== 'white') return;
    if (mode === 'online' && currentTurn !== myOnlineSide) return;

    // Check if clicking a legal move destination
    if (selectedSquare !== null) {
      const matched = legalMovesForSelected.find((m) => m.to === index);
      if (matched) {
        executePlayerMove(matched);
        return;
      }
    }

    // Select own piece
    const clickedPiece = gameState.pieces[index];
    if (clickedPiece && clickedPiece.side === currentTurn) {
      if (clickedPiece.frozenTurns > 0) {
        onNotify('Cette pièce est gelée pour ce tour.');
        return;
      }
      setSelectedSquare(index);
    } else {
      if (selectedSquare !== null && selectedSquare !== index) {
        const reason = explainBlockedMove(gameState, selectedSquare, index);
        if (reason) {
          onNotify(reason);
        }
      }
      setSelectedSquare(null);
    }
  };

  // Resign & Draw actions
  const confirmResign = () => {
    if (!gameState || gameState.winner) return;
    setShowResignConfirm(false);
    const resigningSide: PlayerSide =
      mode === 'online' ? myOnlineSide : getCurrentTurnSide(gameState);
    const otherSide =
      gameState.activeSides.find(
        (s) => s !== resigningSide && !gameState.eliminatedSides.includes(s)
      ) || 'black';

    if (mode === 'online' && onlineWs && onlineRoomId) {
      onlineWs.send(JSON.stringify({ type: 'game:resign', roomId: onlineRoomId }));
    }

    setGameState({
      ...gameState,
      winner: otherSide,
      endReason: `Abandon des ${SIDE_LABELS[resigningSide]}.`,
    });
  };

  const handleOfferDraw = () => {
    if (!gameState || gameState.winner) return;
    if (mode === 'online' && onlineWs && onlineRoomId) {
      onlineWs.send(JSON.stringify({ type: 'game:offer_draw', roomId: onlineRoomId }));
      onNotify('Proposition de nulle envoyée à l’adversaire.');
    } else if (mode === 'local') {
      setPendingDrawOffer('local_prompt');
    } else if (mode === 'ai') {
      // AI accepts draw only if game has >= 20 half-moves and material is roughly equal
      if (gameState.moveHistory.length >= 20) {
        setGameState({
          ...gameState,
          winner: 'draw',
          endReason: 'Match nul accepté par l’IA.',
        });
      } else {
        onNotify('L’IA refuse la nulle et souhaite continuer la partie.');
      }
    }
  };

  const handleRespondDraw = (accepted: boolean) => {
    setPendingDrawOffer(null);
    if (mode === 'online' && onlineWs && onlineRoomId) {
      onlineWs.send(
        JSON.stringify({ type: 'game:respond_draw', roomId: onlineRoomId, accepted })
      );
      return;
    }
    if (accepted && gameState) {
      setGameState({
        ...gameState,
        winner: 'draw',
        endReason: 'Match nul convenu entre les joueurs.',
      });
    } else {
      onNotify('Match nul refusé — la partie continue.');
    }
  };

  const handleSaveAnalysis = () => {
    if (!gameState) return;
    onFinishGame({
      id: `ana_${crypto.randomUUID().slice(0, 10)}`,
      type: 'Analyse sauvegardée',
      mode: 'analysis',
      variantId: gameState.variant.id,
      variantName: gameState.variant.name,
      creatorName: gameState.variant.creator,
      opponentName: 'Analyse libre',
      result: 'saved',
      movesCount: gameState.moveHistory.length,
      date: new Date().toISOString(),
      userRating: userRatings[gameState.variant.id],
    });
    onNotify('Position d’analyse enregistrée dans l’historique.');
  };

  if (!activeVariant) {
    return (
      <div className="p-6 rounded-2xl border border-slate-800 bg-[#151c27] text-center">
        <p className="text-slate-400">Aucune variante disponible. Créez-en une d’abord !</p>
      </div>
    );
  }

  const inCheckSquares = useMemo(() => {
    if (!gameState) return [];
    const arr: number[] = [];
    for (const [idxStr, p] of Object.entries(gameState.pieces)) {
      if (
        gameState.inCheckSides.includes(p.side) &&
        (p.pieceId === 'builtin:K' || customPieces.find((c) => c.id === p.pieceId)?.moves?.king)
      ) {
        arr.push(Number(idxStr));
      }
    }
    return arr;
  }, [gameState, customPieces]);

  const currentTurnSide = gameState ? getCurrentTurnSide(gameState) : 'white';
  const currentRating = userRatings[activeVariant.id] || 0;

  return (
    <div className="space-y-5">
      {/* Sélection de variante et mode dans le Lobby */}
      {phase === 'lobby' && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              Jouer & Analyser
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Choisissez une variante, sélectionnez un mode de jeu et lancez la partie.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Variante sélectionnée
              </span>
              <select
                value={activeVariant.id}
                onChange={(e) => {
                  onSelectVariantId(e.target.value);
                  const found = variants.find((v) => v.id === e.target.value);
                  if (found) setGameState(createInitialGameState(found, customPieces));
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3.5 py-2.5 text-sm font-medium"
              >
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.board.rows}×{v.board.cols} · {v.controlledDifficulty || v.difficulty})
                  </option>
                ))}
              </select>
            </label>

            <VariantRulesSummary
              variant={activeVariant}
              profile={profile}
              customPieces={customPieces}
              showEolPreview
            />
          </div>

          {/* 4 cartes de modes de jeu */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Contre IA */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <Bot className="w-5 h-5 text-sky-400" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  Jouer contre une IA
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isStandardChessCompatible(activeVariant)
                  ? 'Moteur Stockfish actif pour cette variante classique.'
                  : 'Moteur IA Chess Lab adapté aux règles personnalisées de cette variante.'}
              </p>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Difficulté (10 niveaux)
                </span>
                <select
                  value={aiLevel}
                  onChange={(e) => setAiLevel(Number(e.target.value) as AiDifficultyLevel)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
                >
                  {AI_LEVELS.map((l) => (
                    <option key={l.level} value={l.level}>
                      Niveau {l.level} — {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => startGame('ai')}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
              >
                Affronter l’IA (classé ÉOL)
              </button>
            </div>

            {/* 2. Contre un autre humain (local) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <Users className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                    Jouer contre un autre humain
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Partie locale sur le même appareil pour 2 à {activeVariant.players} joueurs avec respect complet des tours, pouvoirs et horloges.
                </p>
              </div>
              <button
                type="button"
                onClick={() => startGame('local')}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm min-h-[44px]"
              >
                Lancer partie locale
              </button>
            </div>

            {/* 3. En ligne */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <Globe className="w-5 h-5 text-violet-400" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  Jouer en ligne (salle privée)
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Créez un code de partie à partager ou rejoignez un ami en temps réel. Chacun conserve son propre thème de pièces.
              </p>

              {waitingRoomCode ? (
                <div className="p-3 rounded-xl bg-violet-500/15 border border-violet-500/30 text-center space-y-1">
                  <div className="text-xs text-violet-300">En attente d’un adversaire…</div>
                  <div className="text-2xl font-bold font-mono-num tracking-widest text-white">
                    {waitingRoomCode}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleCreateOnlineRoom}
                    className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm min-h-[44px]"
                  >
                    Créer une salle en ligne
                  </button>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      placeholder="Code (ex. AB12CD)"
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num uppercase"
                    />
                    <button
                      type="button"
                      onClick={handleJoinOnlineRoom}
                      className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium min-h-[44px]"
                    >
                      Rejoindre
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Analyse libre */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <Wand2 className="w-5 h-5 text-amber-400" />
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                    Analyse libre
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Déplacez librement les pièces et testez des positions sans adversaire ni contrainte de tour.
                </p>
              </div>
              <button
                type="button"
                onClick={() => startGame('analysis')}
                className="w-full py-2.5 px-4 rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300 font-semibold text-sm min-h-[44px]"
              >
                Ouvrir l’analyse libre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interface de partie active ou terminée */}
      {phase !== 'lobby' && gameState && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Colonne Échiquier */}
          <div className="lg:col-span-7 space-y-3">
            {/* Bandeau adversaire */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27]">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {mode === 'ai'
                    ? `IA · ${AI_LEVELS.find((l) => l.level === aiLevel)?.label}`
                    : mode === 'online'
                      ? `${onlineOpponent?.nickname || 'Adversaire'} (${onlineOpponent?.eol || 400} ÉOL)`
                      : mode === 'analysis'
                        ? 'Analyse libre'
                        : 'Joueur 2 (Noirs)'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {aiThinking
                    ? 'Réflexion en cours…'
                    : engineBadge
                      ? `Moteur : ${engineBadge === 'stockfish' ? 'Stockfish' : 'Moteur Variantes'}`
                      : gameState.variant.name}
                </div>
              </div>
              {gameState.variant.duration > 0 && mode !== 'analysis' && (
                <div className="text-base font-bold font-mono-num px-3 py-1 rounded-lg bg-slate-100 dark:bg-[#0f151f] text-slate-900 dark:text-slate-100">
                  {formatClock(clocks[mode === 'online' && myOnlineSide === 'black' ? 'white' : 'black'])}
                </div>
              )}
            </div>

            {/* Échiquier unifié */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#0d121a] p-2 sm:p-3">
              <ChessBoard
                board={gameState.board}
                pieces={gameState.pieces}
                customPieces={[...customPieces, ...(gameState.variant.customPieceDefs || [])]}
                settings={settings}
                opponentThemeOverride={
                  mode === 'online' && settings.showOpponentTheme ? onlineOpponent?.theme : null
                }
                selectedSquare={selectedSquare}
                legalTargets={legalMovesForSelected
                  .filter((m) => !m.isPower && m.captureIndex === undefined)
                  .map((m) => m.to)}
                captureTargets={legalMovesForSelected
                  .filter((m) => m.captureIndex !== undefined)
                  .map((m) => m.to)}
                powerTargets={legalMovesForSelected.filter((m) => m.isPower).map((m) => m.to)}
                lastMove={gameState.lastMove}
                inCheckSquares={inCheckSquares}
                viewerSide={
                  mode === 'online' ? myOnlineSide : mode === 'ai' ? 'white' : null
                }
                onCellClick={handleBoardClick}
              />
            </div>

            {/* Bandeau joueur */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27]">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {profile.nickname || 'Vous'} ({SIDE_LABELS[mode === 'online' ? myOnlineSide : 'white']})
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Tour actuel :{' '}
                  <span className="font-semibold text-sky-400">
                    {SIDE_LABELS[currentTurnSide]}
                  </span>
                  {gameState.actionsRemaining > 1 && ` · ${gameState.actionsRemaining} actions restantes`}
                  {gameState.inCheckSides.includes(currentTurnSide) && (
                    <span className="text-rose-400 font-semibold"> · ÉCHEC !</span>
                  )}
                </div>
              </div>
              {gameState.variant.duration > 0 && mode !== 'analysis' && (
                <div className="text-base font-bold font-mono-num px-3 py-1 rounded-lg bg-slate-100 dark:bg-[#0f151f] text-slate-900 dark:text-slate-100">
                  {formatClock(clocks[mode === 'online' ? myOnlineSide : 'white'])}
                </div>
              )}
            </div>
          </div>

          {/* Colonne Contrôles, Pouvoirs & Historique des coups */}
          <div className="lg:col-span-5 space-y-4">
            {/* Pouvoirs spéciaux contextuels si une pièce sélectionnée en possède */}
            {selectedSquare !== null && powerMovesForSelected.length > 0 && (
              <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-300">
                  <Sparkles className="w-4 h-4" />
                  <span>Pouvoir spécial disponible</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {powerMovesForSelected
                    .filter((pm) => pm.from === pm.to)
                    .map((pm, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => executePlayerMove(pm)}
                        className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold min-h-[40px]"
                      >
                        {pm.description}
                      </button>
                    ))}
                  {powerMovesForSelected.some((pm) => pm.from !== pm.to) && (
                    <p className="text-xs text-violet-200">
                      Les cases entourées en pointillés violets sont accessibles par le pouvoir de cette pièce.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Outils d'Analyse Libre */}
            {mode === 'analysis' && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-4 space-y-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Palette d’analyse libre
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {[
                    'builtin:K|white', 'builtin:Q|white', 'builtin:R|white',
                    'builtin:B|white', 'builtin:N|white', 'builtin:P|white',
                    'builtin:K|black', 'builtin:Q|black', 'builtin:R|black',
                    'builtin:B|black', 'builtin:N|black', 'builtin:P|black',
                  ].map((ref) => {
                    const isWhite = ref.endsWith('white');
                    const symMap: Record<string, string> = {
                      'builtin:K': '♚',
                      'builtin:Q': '♛',
                      'builtin:R': '♜',
                      'builtin:B': '♝',
                      'builtin:N': '♞',
                      'builtin:P': '♟',
                    };
                    const pid = ref.split('|')[0];
                    return (
                      <button
                        key={ref}
                        type="button"
                        onClick={() => {
                          setAnalysisTrayPiece(ref);
                          setSelectedSquare(null);
                        }}
                        className={`py-2 rounded-lg border text-xl min-h-[42px] ${
                          analysisTrayPiece === ref
                            ? 'border-sky-500 bg-sky-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                        }`}
                      >
                        <span className={`piece-glyph ${isWhite ? 'piece-side-white' : 'piece-side-black'}`}>
                          {symMap[pid]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = cloneGameState(gameState);
                      next.pieces = {};
                      setGameState(next);
                      setSelectedSquare(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[40px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vider</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGameState(createInitialGameState(activeVariant, customPieces));
                      setSelectedSquare(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[40px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Position initiale</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAnalysis}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold text-xs min-h-[40px]"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Sauver dans l’historique</span>
                  </button>
                </div>
              </div>
            )}

            {/* Boutons d'actions de partie */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowRulesModal((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm min-h-[44px]"
                >
                  <Info className="w-4 h-4 text-sky-400" />
                  <span>Règles</span>
                </button>

                {mode !== 'analysis' && phase === 'playing' && (
                  <>
                    <button
                      type="button"
                      onClick={handleOfferDraw}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm min-h-[44px]"
                    >
                      <Handshake className="w-4 h-4 text-amber-400" />
                      <span>Proposer la nulle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResignConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 text-sm min-h-[44px]"
                    >
                      <Flag className="w-4 h-4" />
                      <span>Abandonner</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPhase('lobby');
                    onClearOnlineRoom?.();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm ml-auto min-h-[44px]"
                >
                  <Play className="w-4 h-4" />
                  <span>Menu jeu</span>
                </button>
              </div>

              {showRulesModal && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <VariantRulesSummary
                    variant={gameState.variant}
                    profile={profile}
                    customPieces={customPieces}
                    showEolPreview={false}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Résultat de fin de partie + ÉOL + Note 5 étoiles */}
            {phase === 'ended' && (
              <div className="rounded-2xl border border-sky-500/40 bg-white dark:bg-[#151c27] p-5 space-y-4">
                <div>
                  <div className="text-xs font-medium text-sky-400">Fin de partie</div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                    {gameState.winner === 'draw'
                      ? 'Match nul'
                      : `Victoire des ${SIDE_LABELS[gameState.winner as PlayerSide]}`}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {gameState.endReason}
                  </p>
                </div>

                {lastEolBreakdown && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0f151f] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    {lastEolBreakdown.counted ? (
                      <>
                        <div className="flex items-center justify-between font-semibold text-sm">
                          <span>Variation ÉOL</span>
                          <span
                            className={`font-mono-num ${
                              lastEolBreakdown.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {lastEolBreakdown.delta >= 0 ? '+' : ''}
                            {lastEolBreakdown.delta} ÉOL ({lastEolBreakdown.playerEolBefore} →{' '}
                            {lastEolBreakdown.playerEolAfter})
                          </span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          Base : {lastEolBreakdown.baseGain} · {lastEolBreakdown.familiarityLabel} · Difficulté{' '}
                          {lastEolBreakdown.difficultyLabel} (×{lastEolBreakdown.difficultyMultiplier.toFixed(2)})
                          {lastEolBreakdown.creatorMultiplier !== 1 &&
                            ` · Créateur ×${lastEolBreakdown.creatorMultiplier.toFixed(2)}`}
                          {lastEolBreakdown.discoveryLossProtectionApplied &&
                            ' · Protection découverte −20 %'}
                        </div>
                      </>
                    ) : (
                      <div className="text-amber-400">{lastEolBreakdown.reasonIfUncounted}</div>
                    )}
                  </div>
                )}

                {/* Notation de la variante sur 5 étoiles */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Noter cette variante (1 note par joueur, modifiable dans l’Historique)
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const active = (endRatingHover || currentRating) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setEndRatingHover(star)}
                          onMouseLeave={() => setEndRatingHover(0)}
                          onClick={() => onRateVariant(activeVariant.id, star)}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label={`Noter ${star} sur 5`}
                        >
                          <Star
                            className={`w-6 h-6 ${
                              active ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                            }`}
                          />
                        </button>
                      );
                    })}
                    {currentRating > 0 && (
                      <span className="text-xs font-mono-num text-slate-400 ml-2">
                        {currentRating}/5
                      </span>
                    )}
                  </div>
                </div>

                {mode !== 'online' && (
                  <button
                    type="button"
                    onClick={() => startGame(mode)}
                    className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
                  >
                    Rejouer
                  </button>
                )}
              </div>
            )}

            {/* Liste des coups */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Coups joués</span>
                <span className="font-mono-num">{gameState.moveHistory.length}</span>
              </div>
              {gameState.moveHistory.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun coup joué pour l’instant.</p>
              ) : (
                <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1.5 text-xs font-mono-num">
                  {gameState.moveHistory.map((m, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0f151f] text-slate-700 dark:text-slate-300 truncate"
                    >
                      {idx + 1}. {m}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation d'abandon exacte */}
      {showResignConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-[#151c27] p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-50">
              Êtes-vous sûr de vouloir abandonner ?
            </h3>
            <p className="text-sm text-slate-400">
              Confirmer entraînera une défaite immédiate sur cette partie.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={confirmResign}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm min-h-[44px]"
              >
                Oui
              </button>
              <button
                type="button"
                onClick={() => setShowResignConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-600 text-slate-200 font-semibold text-sm min-h-[44px]"
              >
                Non
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale proposition de nulle */}
      {pendingDrawOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-[#151c27] p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-50">Proposition de match nul</h3>
            <p className="text-sm text-slate-400">
              {pendingDrawOffer === 'incoming'
                ? 'Votre adversaire propose de terminer la partie sur une égalité.'
                : 'Le joueur adverse accepte-t-il le match nul ?'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleRespondDraw(true)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm min-h-[44px]"
              >
                Accepter
              </button>
              <button
                type="button"
                onClick={() => handleRespondDraw(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-600 text-slate-200 font-semibold text-sm min-h-[44px]"
              >
                Refuser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

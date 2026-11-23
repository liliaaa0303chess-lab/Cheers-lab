import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  Clock,
  Copy,
  Flag,
  Globe,
  Handshake,
  Info,
  Link2,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Undo2,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { chooseBestAiMove } from '../engine/aiEngine';
import { ChessPieceArtwork } from './ChessPieceArtwork';
import {
  applyMove,
  cloneGameState,
  createInitialGameState,
  explainBlockedMove,
  getCurrentTurnSide,
  getLegalDropMovesForSide,
  getLegalMovesForSquare,
  getPieceName,
  getPremoveCandidateTargets,
  getPromotionChoicesForState,
  getSpecialPowerMoves,
  isStandardChessCompatible,
  SIDE_LABELS,
  type GameState,
  type LegalMove,
} from '../engine/chessEngine';
import {
  areSidesAllied,
  formatTeamLabel,
  getRemainingTeamGroups,
  getTeamSides,
  resolveDynamicSpecialEffect,
} from '../engine/ruleParser';
import { computeEolTransfer } from '../engine/eol';
import {
  AI_LEVELS,
  getClosestAiLevelForEol,
  type AiDifficultyLevel,
  type AppSettings,
  type BattleCardData,
  type BattleCardStyle,
  type EolBreakdown,
  type GameMode,
  type GameRecord,
  type OnlineAiSeat,
  type OnlineHumanSeat,
  type PieceDef,
  type PlayerSide,
  type Profile,
  type ReplayMove,
  type SpecialCellEffectType,
  type Variant,
} from '../types/chess';
import { playChessSound } from '../utils/sound';
import { safeUuid } from '../utils/safeId';
import {
  clearActiveOnlineSession,
  loadActiveOnlineSession,
  saveActiveOnlineSession,
} from '../utils/storage';
import { getPublicAppUrl } from '../utils/appUrl';
import { isGoldEffectActive } from '../utils/goldRewards';
import { BattleIntroOverlay, getBattleCardFromProfile } from './BattleCard';
import { ChessBoard } from './ChessBoard';
import { VariantRulesSummary } from './VariantRulesSummary';
import { VictoryEffects } from './VictoryEffects';

interface WaitingPlayerInfo {
  userId: string;
  nickname: string;
  eol: number;
}

interface DisconnectedPlayerBanner {
  userId: string;
  nickname: string;
  side: PlayerSide;
  remainingSec: number;
}

interface SeatConfig {
  kind: 'ai' | 'human';
  aiLevel: AiDifficultyLevel;
}

interface GamePlayProps {
  variants: Variant[];
  selectedVariantId: string | null;
  initialMode?: GameMode;
  initialCompetitive?: boolean;
  initialJoinRoomCode?: string;
  autoMatchedRoom?: {
    roomId: string;
    code: string;
    yourSide: PlayerSide;
    competitive?: boolean;
    opponent: {
      userId: string;
      nickname: string;
      eol: number;
      avatarColor?: string;
      avatarSymbol?: string;
      title?: string;
      streakPieceSymbol?: string;
      streakPieceLabel?: string;
      battleCardStyle?: BattleCardStyle;
      theme?: { boardTexture?: string; boardLight?: string; boardDark?: string };
    };
    participants?: OnlineHumanSeat[];
    aiSeats?: OnlineAiSeat[];
    hostUserId?: string;
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
  onOpenChallenges?: (tab?: 'streak' | 'bots') => void;
  pendingFriendInvite?: {
    toUid: string;
    toNickname: string;
    variantId: string;
    nonce: number;
  } | null;
  onRoomCreatedForFriend?: (
    target: { toUid: string; toNickname: string },
    roomCode: string,
    variant: Variant
  ) => void;
  onNotify: (msg: string) => void;
}

const VALID_SIDES: PlayerSide[] = ['white', 'black', 'red', 'blue', 'green', 'gold'];

const SIDE_SWATCH: Record<PlayerSide, string> = {
  white: 'bg-slate-100 border-slate-400',
  black: 'bg-slate-900 border-slate-500',
  red: 'bg-rose-500 border-rose-300',
  blue: 'bg-sky-500 border-sky-300',
  green: 'bg-emerald-500 border-emerald-300',
  gold: 'bg-amber-400 border-amber-200',
};

function parsePlayerSide(raw: unknown, fallback: PlayerSide = 'white'): PlayerSide {
  return typeof raw === 'string' && VALID_SIDES.includes(raw as PlayerSide)
    ? (raw as PlayerSide)
    : fallback;
}

function formatClock(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatMinSec(sec: number): string {
  const clamped = Math.max(0, Math.floor(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m} min et ${String(s).padStart(2, '0')} sec`;
}

function toReplayMove(m: LegalMove): ReplayMove {
  return {
    from: m.from,
    to: m.to,
    ...(m.captureIndex !== undefined ? { captureIndex: m.captureIndex } : {}),
    ...(m.promotionPieceId ? { promotionPieceId: m.promotionPieceId } : {}),
    ...(m.isCastle ? { isCastle: m.isCastle } : {}),
    ...(m.castleRookFrom !== undefined ? { castleRookFrom: m.castleRookFrom } : {}),
    ...(m.castleRookTo !== undefined ? { castleRookTo: m.castleRookTo } : {}),
    ...(m.isEnPassant ? { isEnPassant: m.isEnPassant } : {}),
    ...(m.isDrop ? { isDrop: m.isDrop } : {}),
    ...(m.dropPieceId ? { dropPieceId: m.dropPieceId } : {}),
    ...(m.isPower ? { isPower: m.isPower } : {}),
    ...(m.powerTarget !== undefined ? { powerTarget: m.powerTarget } : {}),
    ...(m.description ? { description: m.description } : {}),
  };
}

const SPECIAL_EFFECT_BADGE_LABELS: Record<SpecialCellEffectType, string> = {
  none: 'Aucun effet',
  boost_range: 'Portée augmentée',
  teleport: 'Téléportation',
  promote: 'Promotion instantanée',
  shield: 'Bouclier',
  freeze: 'Gel (1 tour)',
  trap: 'Piège',
  victory_zone: 'Zone de victoire',
  forbidden: 'Accès restreint',
};

function formatEndCondition(gs: GameState): string {
  const reason = (gs.endReason || '').trim();
  if (!reason) return 'fin de partie';
  const low = reason.toLowerCase();
  if (low.includes('échec et mat')) return 'échec et mat';
  if (low.includes('pat fait gagner')) return 'pat victorieux';
  if (low.includes('pat')) return 'pat';
  if (low.includes('déconnexion')) return 'abandon automatique après déconnexion';
  if (low.includes('abandon')) return 'abandon';
  if (low.includes('temps écoulé')) return 'temps écoulé';
  if (low.includes('match nul accepté') || low.includes('match nul convenu')) return 'accord mutuel';
  if (low.includes('50 coups')) return 'règle des 50 coups';
  if (low.includes('case royale')) return 'occupation de la case royale';
  if (low.includes('case spéciale')) return 'occupation d’une case spéciale';
  if (low.includes('dernière rangée')) return 'atteinte de la dernière rangée';
  if (low.includes('captures')) {
    const m = reason.match(/atteignent\s+(\d+)\s+captures/i);
    return m ? `objectif de ${m[1]} captures atteint` : 'objectif de captures atteint';
  }
  if (low.includes('échecs')) {
    const m = reason.match(/avec\s+(\d+)\s+échecs/i);
    return m ? `${m[1]} échecs délivrés` : 'échecs cumulés';
  }
  if (low.includes('qui-perd-gagne')) return 'règle Qui-perd-gagne';
  if (low.includes('aucun coup légal')) return 'blocage complet';
  if (low.includes('remportent la partie')) return 'capture du roi / élimination';
  return reason.replace(/[.!]+$/, '').replace(/^[A-ZÀÂÉÈÊËÎÏÔÙÛÇ]/, (c) => c.toLowerCase());
}

export const GamePlay: React.FC<GamePlayProps> = ({
  variants,
  selectedVariantId,
  initialMode = 'ai',
  initialCompetitive = true,
  initialJoinRoomCode = '',
  autoMatchedRoom = null,
  profile,
  customPieces,
  settings,
  userRatings,
  onSelectVariantId,
  onFinishGame,
  onRateVariant,
  onClearOnlineRoom,
  onOpenChallenges,
  pendingFriendInvite = null,
  onRoomCreatedForFriend,
  onNotify,
}) => {
  const activeVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || variants[0],
    [variants, selectedVariantId]
  );

  const recommendedAiLevel = useMemo(
    () => getClosestAiLevelForEol(profile.eol),
    [profile.eol]
  );
  const recommendedAiMeta = useMemo(
    () => AI_LEVELS.find((l) => l.level === recommendedAiLevel) || AI_LEVELS[2],
    [recommendedAiLevel]
  );

  const [mode, setMode] = useState<GameMode>(autoMatchedRoom ? 'online' : initialMode);
  const [lobbyCompetitive, setLobbyCompetitive] = useState<boolean>(
    autoMatchedRoom ? autoMatchedRoom.competitive !== false : initialCompetitive
  );
  const [activeCompetitive, setActiveCompetitive] = useState<boolean>(
    autoMatchedRoom ? autoMatchedRoom.competitive !== false : initialCompetitive
  );
  const [aiLevel, setAiLevel] = useState<AiDifficultyLevel>(() =>
    getClosestAiLevelForEol(profile.eol)
  );
  const [aiLevelCustomPicked, setAiLevelCustomPicked] = useState(false);

  // User color choice for AI & Local practice (default random)
  const [preferredSide, setPreferredSide] = useState<'random' | PlayerSide>('random');

  // Per-opponent configuration for >2-player games
  const [multiSeatConfigs, setMultiSeatConfigs] = useState<SeatConfig[]>(() =>
    Array.from({ length: 5 }, (_, idx) => ({
      kind: idx === 0 ? 'human' : 'ai',
      aiLevel: getClosestAiLevelForEol(profile.eol),
    }))
  );

  const [phase, setPhase] = useState<'lobby' | 'playing' | 'ended'>(
    autoMatchedRoom ? 'playing' : 'lobby'
  );

  useEffect(() => {
    const scrollTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollTop();
    const raf = requestAnimationFrame(scrollTop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const [gameState, setGameState] = useState<GameState | null>(() =>
    activeVariant ? createInitialGameState(activeVariant, customPieces) : null
  );
  const [undoStack, setUndoStack] = useState<GameState[]>([]);
  const [undoMovesLenStack, setUndoMovesLenStack] = useState<number[]>([]);
  const [recordedMoves, setRecordedMoves] = useState<ReplayMove[]>([]);
  const [myPlayerSide, setMyPlayerSide] = useState<PlayerSide>(
    autoMatchedRoom?.yourSide || 'white'
  );
  const [aiSides, setAiSides] = useState<PlayerSide[]>(() =>
    autoMatchedRoom?.aiSeats ? autoMatchedRoom.aiSeats.map((a) => a.side) : []
  );
  const [aiLevelsBySide, setAiLevelsBySide] = useState<Partial<Record<PlayerSide, AiDifficultyLevel>>>(
    () => {
      const map: Partial<Record<PlayerSide, AiDifficultyLevel>> = {};
      for (const a of autoMatchedRoom?.aiSeats || []) {
        map[a.side] = a.level;
      }
      return map;
    }
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [selectedDropPieceId, setSelectedDropPieceId] = useState<string | null>(null);
  const [premoveSelectedSquare, setPremoveSelectedSquare] = useState<number | null>(null);
  const [queuedPremove, setQueuedPremove] = useState<{ from: number; to: number } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    baseMove: LegalMove;
    side: PlayerSide;
    choices: string[];
  } | null>(null);
  const [analysisTrayPiece, setAnalysisTrayPiece] = useState<string>('builtin:Q|white');
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [pendingDrawOffer, setPendingDrawOffer] = useState<'incoming' | 'local_prompt' | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [engineBadge, setEngineBadge] = useState<'stockfish' | 'variant' | null>(null);
  const [lastEolBreakdown, setLastEolBreakdown] = useState<EolBreakdown | null>(null);
  const [endRatingHover, setEndRatingHover] = useState<number>(0);
  const [battleIntroOpponent, setBattleIntroOpponent] = useState<BattleCardData | null>(null);

  // Clocks
  const [clocks, setClocks] = useState<Record<PlayerSide, number>>({
    white: 600,
    black: 600,
    red: 600,
    blue: 600,
    green: 600,
    gold: 600,
  });

  // Online Room & Matchmaking state
  const [onlineWs, setOnlineWs] = useState<WebSocket | null>(autoMatchedRoom?.ws || null);
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(autoMatchedRoom?.roomId || null);
  const [onlineCode, setOnlineCode] = useState<string>(autoMatchedRoom?.code || '');
  const [joinCodeInput, setJoinCodeInput] = useState(initialJoinRoomCode);
  const [myOnlineSide, setMyOnlineSide] = useState<PlayerSide>(
    autoMatchedRoom?.yourSide || 'white'
  );
  const [onlineOpponent, setOnlineOpponent] = useState(autoMatchedRoom?.opponent || null);
  const [onlineParticipants, setOnlineParticipants] = useState<OnlineHumanSeat[]>(
    autoMatchedRoom?.participants || []
  );
  const [onlineAiSeats, setOnlineAiSeats] = useState<OnlineAiSeat[]>(
    autoMatchedRoom?.aiSeats || []
  );
  const [onlineHostUserId, setOnlineHostUserId] = useState<string | null>(
    autoMatchedRoom?.hostUserId || null
  );
  const [waitingRoomCode, setWaitingRoomCode] = useState<string | null>(null);
  const [onlineWaitingPlayers, setOnlineWaitingPlayers] = useState<WaitingPlayerInfo[]>([]);
  const [onlineTargetPlayers, setOnlineTargetPlayers] = useState<number>(2);
  const [fillerAiLevels, setFillerAiLevels] = useState<AiDifficultyLevel[]>([]);
  const [disconnectedOpponents, setDisconnectedOpponents] = useState<DisconnectedPlayerBanner[]>([]);
  const [copiedHint, setCopiedHint] = useState<'code' | 'link' | null>(null);

  const [matchmakingActive, setMatchmakingActive] = useState(false);
  const [matchmakingCountdown, setMatchmakingCountdown] = useState(10);

  const gameRecordedRef = useRef(false);
  const onlineWsRef = useRef<WebSocket | null>(onlineWs);
  onlineWsRef.current = onlineWs;
  const autoJoinedUrlCodeRef = useRef<string>('');
  const attemptedSessionResumeRef = useRef(false);
  const handledFriendInviteNonceRef = useRef<number | null>(null);
  const dispatchedInviteNonceRef = useRef<number | null>(null);
  const pendingFriendInviteRef = useRef(pendingFriendInvite);
  pendingFriendInviteRef.current = pendingFriendInvite;
  const activeVariantRef = useRef(activeVariant);
  activeVariantRef.current = activeVariant;
  const onRoomCreatedForFriendRef = useRef(onRoomCreatedForFriend);
  onRoomCreatedForFriendRef.current = onRoomCreatedForFriend;

  useEffect(() => {
    return () => {
      if (onlineWsRef.current) {
        try {
          onlineWsRef.current.close();
        } catch {
          // ignore
        }
        onlineWsRef.current = null;
      }
    };
  }, []);

  const lobbyAvailableSides = useMemo(
    () => VALID_SIDES.slice(0, Math.max(2, Math.min(6, activeVariant?.players || 2))),
    [activeVariant?.players]
  );

  // Reset preferredSide to random if current side exceeds new variant player count
  useEffect(() => {
    if (preferredSide !== 'random' && !lobbyAvailableSides.includes(preferredSide)) {
      setPreferredSide('random');
    }
  }, [lobbyAvailableSides, preferredSide]);

  useEffect(() => {
    if (!aiLevelCustomPicked) {
      setAiLevel(recommendedAiLevel);
    }
  }, [recommendedAiLevel, aiLevelCustomPicked]);

  useEffect(() => {
    if (phase === 'lobby' && !aiLevelCustomPicked) {
      setMultiSeatConfigs((prev) =>
        prev.map((cfg) => ({ ...cfg, aiLevel: recommendedAiLevel }))
      );
    }
  }, [recommendedAiLevel, phase, aiLevelCustomPicked]);

  useEffect(() => {
    setLobbyCompetitive(initialCompetitive);
  }, [initialCompetitive]);

  useEffect(() => {
    if (initialJoinRoomCode) {
      setJoinCodeInput(initialJoinRoomCode.toUpperCase());
    }
  }, [initialJoinRoomCode]);

  useEffect(() => {
    const missing = Math.max(0, onlineTargetPlayers - onlineWaitingPlayers.length);
    setFillerAiLevels((prev) =>
      Array.from({ length: missing }, (_, idx) => prev[idx] || recommendedAiLevel)
    );
  }, [onlineTargetPlayers, onlineWaitingPlayers.length, recommendedAiLevel]);

  // Sync external autoMatchedRoom (from Discover)
  useEffect(() => {
    if (autoMatchedRoom && activeVariant) {
      const comp = autoMatchedRoom.competitive !== false;
      const incomingAi = autoMatchedRoom.aiSeats || [];
      const lvlMap: Partial<Record<PlayerSide, AiDifficultyLevel>> = {};
      for (const seat of incomingAi) {
        lvlMap[seat.side] = seat.level;
      }
      setMode('online');
      setMatchmakingActive(false);
      setWaitingRoomCode(null);
      setActiveCompetitive(comp);
      setLobbyCompetitive(comp);
      setOnlineWs(autoMatchedRoom.ws);
      setOnlineRoomId(autoMatchedRoom.roomId);
      setOnlineCode(autoMatchedRoom.code);
      setMyOnlineSide(autoMatchedRoom.yourSide);
      setMyPlayerSide(autoMatchedRoom.yourSide);
      setOnlineOpponent(autoMatchedRoom.opponent);
      setOnlineParticipants(autoMatchedRoom.participants || []);
      setOnlineAiSeats(incomingAi);
      setOnlineHostUserId(autoMatchedRoom.hostUserId || null);
      setDisconnectedOpponents([]);
      setAiSides(incomingAi.map((a) => a.side));
      setAiLevelsBySide(lvlMap);
      const fresh = createInitialGameState(activeVariant, customPieces);
      setGameState(fresh);
      setUndoStack([]);
      setUndoMovesLenStack([]);
      setRecordedMoves([]);
      setSelectedSquare(null);
      setSelectedDropPieceId(null);
      setPremoveSelectedSquare(null);
      setQueuedPremove(null);
      resetClocks(activeVariant);
      gameRecordedRef.current = false;
      setLastEolBreakdown(null);
      setPhase('playing');
      if (profile.showBattleIntro !== false) {
        setBattleIntroOpponent({
          uid: autoMatchedRoom.opponent.userId,
          nickname: autoMatchedRoom.opponent.nickname,
          eol: autoMatchedRoom.opponent.eol,
          avatarColor: autoMatchedRoom.opponent.avatarColor || '#f59e0b',
          avatarSymbol: autoMatchedRoom.opponent.avatarSymbol || '♚',
          title: autoMatchedRoom.opponent.title,
          streakPieceSymbol: autoMatchedRoom.opponent.streakPieceSymbol || '♙',
          streakPieceLabel: autoMatchedRoom.opponent.streakPieceLabel,
          battleCardStyle: autoMatchedRoom.opponent.battleCardStyle || 'classic',
          isOnline: true,
        });
      }
      saveActiveOnlineSession({
        roomId: autoMatchedRoom.roomId,
        code: autoMatchedRoom.code,
        userId: profile.id,
        variantId: activeVariant.id,
        savedAt: Date.now(),
      });
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
  const startGame = (chosenMode: GameMode, overrideAiLevel?: AiDifficultyLevel) => {
    if (!activeVariant) return;
    setPendingPromotion(null);
    setSelectedDropPieceId(null);
    setPremoveSelectedSquare(null);
    setQueuedPremove(null);
    setMatchmakingActive(false);
    setWaitingRoomCode(null);
    setDisconnectedOpponents([]);
    clearActiveOnlineSession();
    setMode(chosenMode);
    const fresh = createInitialGameState(activeVariant, customPieces);

    const chosenSide: PlayerSide =
      chosenMode === 'analysis'
        ? 'white'
        : preferredSide !== 'random' && fresh.activeSides.includes(preferredSide)
          ? preferredSide
          : fresh.activeSides[Math.floor(Math.random() * fresh.activeSides.length)] || 'white';

    const effectiveMainAi = overrideAiLevel || aiLevel;
    const otherSides = fresh.activeSides.filter((s) => s !== chosenSide);
    const nextAiSides: PlayerSide[] = [];
    const nextAiLevels: Partial<Record<PlayerSide, AiDifficultyLevel>> = {};

    if (chosenMode === 'ai') {
      otherSides.forEach((s, idx) => {
        nextAiSides.push(s);
        nextAiLevels[s] = idx === 0 ? effectiveMainAi : multiSeatConfigs[idx]?.aiLevel || effectiveMainAi;
      });
    } else if (chosenMode === 'local' && fresh.activeSides.length > 2) {
      otherSides.forEach((s, idx) => {
        const cfg = multiSeatConfigs[idx];
        if (cfg && cfg.kind === 'ai') {
          nextAiSides.push(s);
          nextAiLevels[s] = cfg.aiLevel;
        }
      });
    }

    setAiSides(nextAiSides);
    setAiLevelsBySide(nextAiLevels);
    setOnlineParticipants([]);
    setOnlineAiSeats([]);
    setOnlineHostUserId(null);
    setMyPlayerSide(chosenSide);
    setActiveCompetitive(chosenMode === 'analysis' ? false : lobbyCompetitive);
    setGameState(fresh);
    setUndoStack([]);
    setUndoMovesLenStack([]);
    setRecordedMoves([]);
    setSelectedSquare(null);
    setLastEolBreakdown(null);
    setEngineBadge(null);
    gameRecordedRef.current = false;
    resetClocks(activeVariant);
    setPhase('playing');
    if (chosenMode !== 'analysis' && profile.showBattleIntro !== false) {
      if (chosenMode === 'ai') {
        const meta = AI_LEVELS.find((l) => l.level === effectiveMainAi) || AI_LEVELS[2];
        setBattleIntroOpponent({
          uid: `ai_lvl_${effectiveMainAi}`,
          nickname: `IA ${meta.label}`,
          avatarColor: '#38bdf8',
          avatarSymbol: '🤖',
          eol: meta.approxEol,
          title: `Bot Niveau ${meta.level}`,
          streakPieceSymbol: '♘',
          battleCardStyle: 'classic',
          isOnline: false,
        });
      } else if (chosenMode === 'local') {
        setBattleIntroOpponent({
          uid: 'local_p2',
          nickname: fresh.activeSides.length > 2 ? 'Joueurs locaux' : 'Joueur 2',
          avatarColor: '#a78bfa',
          avatarSymbol: '♚',
          eol: Math.round(profile.eol || 400),
          title: 'Duel sur le même écran',
          streakPieceSymbol: '♙',
          battleCardStyle: 'emerald',
          isOnline: false,
        });
      }
    }
    if (chosenMode === 'ai') {
      const sideLabel = SIDE_LABELS[chosenSide];
      onNotify(
        isStandardChessCompatible(activeVariant) && fresh.activeSides.length === 2
          ? `Partie lancée (Stockfish) — Vous jouez les ${sideLabel}.`
          : `Partie lancée (IA variantes) — Vous jouez les ${sideLabel}.`
      );
    } else if (chosenMode === 'local') {
      onNotify(`Partie locale lancée — Vous jouez les ${SIDE_LABELS[chosenSide]}.`);
    }
  };

  // In-lobby 10-second matchmaking countdown before falling back to ÉOL-matched AI
  useEffect(() => {
    if (!matchmakingActive || phase !== 'lobby') return;
    if (matchmakingCountdown <= 0) {
      setMatchmakingActive(false);
      if (onlineWsRef.current && onlineWsRef.current.readyState === WebSocket.OPEN) {
        onlineWsRef.current.send(JSON.stringify({ type: 'matchmaking:leave' }));
      }
      const fallbackLvl = recommendedAiLevel;
      setAiLevel(fallbackLvl);
      onNotify(
        `Aucun adversaire trouvé en 10 s — Lancement contre l’IA Niveau ${fallbackLvl} (~${recommendedAiMeta.approxEol} ÉOL).`
      );
      startGame('ai', fallbackLvl);
      return;
    }
    const timer = setTimeout(() => setMatchmakingCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [matchmakingActive, matchmakingCountdown, phase, recommendedAiLevel, recommendedAiMeta.approxEol]);

  // Clock countdown
  useEffect(() => {
    if (phase !== 'playing' || !gameState || gameState.winner || mode === 'analysis') return;
    if ((gameState.variant.duration || 0) <= 0) return;

    const timer = setInterval(() => {
      const turnSide = getCurrentTurnSide(gameState);
      setClocks((prev) => ({
        ...prev,
        [turnSide]: Math.max(0, prev[turnSide] - 1),
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, gameState?.turnIndex, gameState?.winner, mode]);

  useEffect(() => {
    if (gameState?.winner) {
      if (pendingPromotion) setPendingPromotion(null);
      setSelectedDropPieceId(null);
      setPremoveSelectedSquare(null);
      setQueuedPremove(null);
    }
  }, [gameState?.winner, pendingPromotion]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pendingPromotion) {
        setPendingPromotion(null);
        return;
      }
      setSelectedSquare(null);
      setSelectedDropPieceId(null);
      setPremoveSelectedSquare(null);
      setQueuedPremove(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingPromotion]);

  // Trigger timeout cleanly when active clock reaches 0 (local/AI; online timeout comes authoritatively or notifies server)
  useEffect(() => {
    if (phase !== 'playing' || !gameState || gameState.winner || mode === 'analysis') return;
    if ((gameState.variant.duration || 0) <= 0) return;
    const turnSide = getCurrentTurnSide(gameState);
    if (clocks[turnSide] > 0) return;

    if (mode === 'online' && onlineWs && onlineRoomId) {
      onlineWs.send(
        JSON.stringify({
          type: 'game:timeout',
          roomId: onlineRoomId,
          timedOutSide: turnSide,
        })
      );
    }

    const rules = gameState.compiledRules;
    setGameState((curr) => {
      if (!curr || curr.winner) return curr;
      const next = cloneGameState(curr);
      if (!next.eliminatedSides.includes(turnSide)) {
        next.eliminatedSides.push(turnSide);
      }
      if (rules?.teamSharedElimination) {
        for (const ally of getTeamSides(rules, turnSide)) {
          if (next.activeSides.includes(ally) && !next.eliminatedSides.includes(ally)) {
            next.eliminatedSides.push(ally);
          }
        }
      }
      const remainingGroups = getRemainingTeamGroups(rules, next.activeSides, next.eliminatedSides);
      if (remainingGroups.length === 0) {
        next.winner = 'draw';
        next.winningTeam = null;
        next.endReason = `Temps écoulé pour les ${SIDE_LABELS[turnSide]}.`;
        return next;
      }
      if (remainingGroups.length === 1) {
        const winGroup = remainingGroups[0];
        next.winner = winGroup[0];
        next.winningTeam = winGroup.length > 1 ? winGroup : null;
        next.endReason =
          winGroup.length > 1
            ? `Temps écoulé pour les ${SIDE_LABELS[turnSide]}. Victoire de l’équipe ${formatTeamLabel(winGroup)} !`
            : `Temps écoulé pour les ${SIDE_LABELS[turnSide]}.`;
        return next;
      }
      let nxt = (next.turnIndex + 1) % next.activeSides.length;
      let guard = 0;
      while (next.eliminatedSides.includes(next.activeSides[nxt]) && guard < next.activeSides.length) {
        nxt = (nxt + 1) % next.activeSides.length;
        guard++;
      }
      next.turnIndex = nxt;
      return next;
    });
  }, [clocks, phase, gameState, mode, onlineWs, onlineRoomId]);

  // Trigger game completion + ÉOL recording + save replayMoves when gameState.winner becomes non-null
  useEffect(() => {
    if (!gameState || !gameState.winner || gameRecordedRef.current || mode === 'analysis') return;
    gameRecordedRef.current = true;
    setPhase('ended');
    if (mode === 'online') {
      clearActiveOnlineSession();
      setDisconnectedOpponents([]);
    }

    const mySide: PlayerSide = mode === 'online' ? myOnlineSide : myPlayerSide;
    const didIWin =
      gameState.winner !== 'draw' &&
      areSidesAllied(gameState.compiledRules, gameState.winner, mySide);
    const result: 'win' | 'loss' | 'draw' =
      gameState.winner === 'draw' ? 'draw' : didIWin ? 'win' : 'loss';

    playChessSound(
      result === 'draw' ? 'draw' : 'win',
      settings.sound,
      settings.volume
    );

    const resolveOppStats = () => {
      if (mode === 'online') {
        const humans = onlineParticipants.filter((p) => p.userId !== profile.id);
        const aiEols = onlineAiSeats.map((a) => a.approxEol);
        const allEols = [...humans.map((h) => h.eol), ...aiEols];
        const avgEol =
          allEols.length > 0
            ? Math.round(allEols.reduce((s, e) => s + e, 0) / allEols.length)
            : onlineOpponent?.eol || 400;
        const nameList = [...humans.map((h) => h.nickname), ...onlineAiSeats.map((a) => a.nickname)];
        const primaryHuman = humans[0];
        return {
          eol: avgEol,
          uid: primaryHuman?.userId || onlineOpponent?.userId,
          avatarColor: primaryHuman?.avatarColor || onlineOpponent?.avatarColor,
          avatarSymbol: primaryHuman?.avatarSymbol || onlineOpponent?.avatarSymbol,
          title: primaryHuman?.title || onlineOpponent?.title,
          streakPieceSymbol:
            primaryHuman?.streakPieceSymbol || onlineOpponent?.streakPieceSymbol,
          battleCardStyle: primaryHuman?.battleCardStyle || onlineOpponent?.battleCardStyle,
          name: nameList.length > 0 ? nameList.join(', ') : onlineOpponent?.nickname || 'Adversaire en ligne',
          isCreator: humans.some((h) => h.userId === gameState.variant.creatorId),
        };
      }
      if (mode === 'ai') {
        const levelsUsed =
          aiSides.length > 0
            ? aiSides.map((s) => aiLevelsBySide[s] || aiLevel)
            : [aiLevel];
        const eols = levelsUsed.map(
          (lvl) => AI_LEVELS.find((l) => l.level === lvl)?.approxEol || 400
        );
        const avg = Math.round(eols.reduce((a, b) => a + b, 0) / eols.length);
        const firstLevel = levelsUsed[0];
        const firstMeta = AI_LEVELS.find((l) => l.level === firstLevel) || AI_LEVELS[2];
        return {
          eol: avg,
          aiLevel: firstLevel,
          uid: undefined,
          avatarColor: undefined,
          avatarSymbol: undefined,
          title: undefined,
          streakPieceSymbol: undefined,
          battleCardStyle: undefined,
          name:
            levelsUsed.length > 1
              ? `${levelsUsed.length} IA (~${avg} ÉOL)`
              : `IA ${firstMeta.label} (~${firstMeta.approxEol} ÉOL)`,
          isCreator: false,
        };
      }
      return {
        eol: Math.max(300, profile.eol),
        aiLevel: undefined,
        uid: undefined,
        avatarColor: undefined,
        avatarSymbol: undefined,
        title: undefined,
        streakPieceSymbol: undefined,
        battleCardStyle: undefined,
        name: gameState.activeSides.length > 2 ? 'Joueurs locaux' : 'Joueur local',
        isCreator: false,
      };
    };

    const oppStats = resolveOppStats();

    if (activeCompetitive && (mode === 'ai' || mode === 'online' || mode === 'local')) {
      const isCreator = gameState.variant.creatorId === profile.id;
      const hasAiInOnline = mode === 'online' && onlineAiSeats.length > 0;
      const modeMultiplier = mode === 'online' && !hasAiInOnline ? 1 : 0.5;

      const breakdown = computeEolTransfer({
        playerEol: profile.eol,
        opponentEol: oppStats.eol,
        result,
        variant: gameState.variant,
        playerPriorGames: profile.variantPlayCounts?.[gameState.variant.id] || 0,
        opponentPriorGames: 2,
        isPlayerCreator: isCreator,
        isOpponentCreator: oppStats.isCreator,
        movesCount: gameState.moveHistory.length,
        modeMultiplier,
      });
      setLastEolBreakdown(breakdown);

      const rec: GameRecord = {
        id: `gm_${safeUuid().slice(0, 10)}`,
        type:
          mode === 'online'
            ? 'Partie en ligne'
            : mode === 'ai'
              ? 'Partie contre IA'
              : 'Partie locale',
        mode,
        competitive: true,
        variantId: gameState.variant.id,
        variantName: gameState.variant.name,
        variantSnapshot: gameState.variant,
        creatorName: gameState.variant.creator,
        opponentName: oppStats.name,
        ...(oppStats.uid ? { opponentUid: oppStats.uid } : {}),
        opponentEol: oppStats.eol,
        ...(oppStats.avatarColor ? { opponentAvatarColor: oppStats.avatarColor } : {}),
        ...(oppStats.avatarSymbol ? { opponentAvatarSymbol: oppStats.avatarSymbol } : {}),
        ...(oppStats.title ? { opponentTitle: oppStats.title } : {}),
        ...(oppStats.streakPieceSymbol ? { opponentStreakPiece: oppStats.streakPieceSymbol } : {}),
        ...(oppStats.battleCardStyle ? { opponentBattleCardStyle: oppStats.battleCardStyle } : {}),
        ...(oppStats.aiLevel ? { aiLevel: oppStats.aiLevel } : {}),
        playerSide: mySide,
        result,
        reason: gameState.endReason || undefined,
        movesCount: gameState.moveHistory.length,
        replayMoves: recordedMoves,
        date: new Date().toISOString(),
        eolBreakdown: breakdown,
        userRating: userRatings[gameState.variant.id],
      };
      onFinishGame(rec, breakdown.counted ? breakdown.playerEolAfter : undefined);
    } else {
      setLastEolBreakdown(null);
      const rec: GameRecord = {
        id: `gm_${safeUuid().slice(0, 10)}`,
        type:
          mode === 'online'
            ? 'Partie en ligne'
            : mode === 'ai'
              ? 'Partie contre IA'
              : 'Partie locale',
        mode,
        competitive: false,
        variantId: gameState.variant.id,
        variantName: gameState.variant.name,
        variantSnapshot: gameState.variant,
        creatorName: gameState.variant.creator,
        opponentName: oppStats.name,
        ...(oppStats.uid ? { opponentUid: oppStats.uid } : {}),
        opponentEol: oppStats.eol,
        ...(oppStats.avatarColor ? { opponentAvatarColor: oppStats.avatarColor } : {}),
        ...(oppStats.avatarSymbol ? { opponentAvatarSymbol: oppStats.avatarSymbol } : {}),
        ...(oppStats.title ? { opponentTitle: oppStats.title } : {}),
        ...(oppStats.streakPieceSymbol ? { opponentStreakPiece: oppStats.streakPieceSymbol } : {}),
        ...(oppStats.battleCardStyle ? { opponentBattleCardStyle: oppStats.battleCardStyle } : {}),
        ...(oppStats.aiLevel ? { aiLevel: oppStats.aiLevel } : {}),
        playerSide: mySide,
        result,
        reason: gameState.endReason || undefined,
        movesCount: gameState.moveHistory.length,
        replayMoves: recordedMoves,
        date: new Date().toISOString(),
        userRating: userRatings[gameState.variant.id],
      };
      onFinishGame(rec);
    }
  }, [gameState?.winner]);

  // AI Turn automation with realistic human pacing (950ms–1750ms)
  useEffect(() => {
    if (phase !== 'playing' || !gameState || gameState.winner || mode === 'analysis') return;
    const activeSide = getCurrentTurnSide(gameState);

    const isAiControlledSide =
      mode === 'ai'
        ? activeSide !== myPlayerSide
        : mode === 'local'
          ? aiSides.includes(activeSide)
          : mode === 'online'
            ? aiSides.includes(activeSide) && onlineHostUserId === profile.id
            : false;

    if (!isAiControlledSide) return;

    const sideLevel = aiLevelsBySide[activeSide] || aiLevel;
    let cancelled = false;
    setAiThinking(true);

    const runAiTurn = async () => {
      const startedAt = Date.now();
      // Natural human thinking delay: 580–1000ms for fluid cadence
      const humanDelayMs = 580 + Math.floor(Math.random() * 420);
      const { move, engineUsed } = await chooseBestAiMove(gameState, sideLevel);
      const elapsed = Date.now() - startedAt;
      if (elapsed < humanDelayMs) {
        await new Promise((r) => setTimeout(r, humanDelayMs - elapsed));
      }
      if (cancelled) return;
      setAiThinking(false);
      setEngineBadge(engineUsed);

      if (!move) {
        const rules = gameState.compiledRules;
        if (rules.reverseWin) {
          const winTeam = getTeamSides(rules, activeSide).filter((m) =>
            gameState.activeSides.includes(m)
          );
          setGameState((prev) =>
            prev
              ? {
                  ...prev,
                  winner: activeSide,
                  winningTeam: winTeam.length > 1 ? winTeam : null,
                  endReason: `L’IA (${SIDE_LABELS[activeSide]}) n’a plus de coup légal — Qui-perd-gagne.`,
                }
              : prev
          );
          return;
        }

        const isCheckmatedOrStalemateWin =
          gameState.inCheckSides.includes(activeSide) || rules.stalemateWins;

        setGameState((prev) => {
          if (!prev || prev.winner) return prev;
          const next = cloneGameState(prev);
          if (isCheckmatedOrStalemateWin) {
            if (!next.eliminatedSides.includes(activeSide)) {
              next.eliminatedSides.push(activeSide);
            }
            if (rules.teamSharedElimination) {
              for (const ally of getTeamSides(rules, activeSide)) {
                if (next.activeSides.includes(ally) && !next.eliminatedSides.includes(ally)) {
                  next.eliminatedSides.push(ally);
                }
              }
            }
            const remainingGroups = getRemainingTeamGroups(
              rules,
              next.activeSides,
              next.eliminatedSides
            );
            if (remainingGroups.length <= 1) {
              const winGroup = remainingGroups[0];
              next.winner = winGroup ? winGroup[0] : 'draw';
              next.winningTeam = winGroup && winGroup.length > 1 ? winGroup : null;
              next.endReason = winGroup
                ? winGroup.length > 1
                  ? `L’IA (${SIDE_LABELS[activeSide]}) n’a plus de coup légal. Victoire de l’équipe ${formatTeamLabel(winGroup)} !`
                  : `L’IA (${SIDE_LABELS[activeSide]}) n’a plus de coup légal disponible.`
                : 'Match nul.';
              return next;
            }
          } else {
            // Stalemate: if a teammate is alive on another side, pass the turn; otherwise draw/eliminate team
            const aliveTeammates = getTeamSides(rules, activeSide).filter(
              (m) => m !== activeSide && next.activeSides.includes(m) && !next.eliminatedSides.includes(m)
            );
            const currentGroups = getRemainingTeamGroups(
              rules,
              next.activeSides,
              next.eliminatedSides
            );
            if (aliveTeammates.length === 0) {
              if (currentGroups.length > 2) {
                for (const m of getTeamSides(rules, activeSide)) {
                  if (next.activeSides.includes(m) && !next.eliminatedSides.includes(m)) {
                    next.eliminatedSides.push(m);
                  }
                }
              } else {
                next.winner = 'draw';
                next.winningTeam = null;
                next.endReason = 'Pat — L’IA n’a plus de coup légal disponible.';
                return next;
              }
            }
          }

          let nxt = (next.turnIndex + 1) % next.activeSides.length;
          let guard = 0;
          while (
            next.eliminatedSides.includes(next.activeSides[nxt]) &&
            guard < next.activeSides.length
          ) {
            nxt = (nxt + 1) % next.activeSides.length;
            guard++;
          }
          next.turnIndex = nxt;
          return next;
        });
        return;
      }

      if (mode === 'ai' || mode === 'local') {
        setUndoStack((prev) => [...prev, cloneGameState(gameState)]);
        setUndoMovesLenStack((prev) => [...prev, recordedMoves.length]);
      }

      const next = applyMove(gameState, move);
      const turnFinished = next.turnIndex !== gameState.turnIndex;
      const incSec = next.variant.incrementSec || 0;
      if (
        turnFinished &&
        !next.winner &&
        (next.variant.duration || 0) > 0 &&
        incSec > 0 &&
        mode !== 'online'
      ) {
        setClocks((prev) => ({
          ...prev,
          [activeSide]: (prev[activeSide] || 0) + incSec,
        }));
      }

      if (next.inCheckSides.length > 0) {
        playChessSound('check', settings.sound, settings.volume);
      } else if (move.isPower) {
        playChessSound('power', settings.sound, settings.volume);
      } else if (move.captureIndex !== undefined) {
        playChessSound('capture', settings.sound, settings.volume);
      } else {
        playChessSound('move', settings.sound, settings.volume);
      }
      setRecordedMoves((prev) => [...prev, toReplayMove(move)]);
      setGameState(next);

      if (mode === 'online' && onlineWs && onlineRoomId) {
        onlineWs.send(
          JSON.stringify({
            type: 'game:move',
            roomId: onlineRoomId,
            move,
            turnFinished,
            nextTurnSide: getCurrentTurnSide(next),
            eliminatedSides: next.eliminatedSides,
            winner: next.winner,
          })
        );
      }
    };

    void runAiTurn();

    return () => {
      cancelled = true;
    };
  }, [
    phase,
    mode,
    gameState,
    aiLevel,
    aiSides,
    aiLevelsBySide,
    myPlayerSide,
    onlineHostUserId,
    profile.id,
    onlineWs,
    onlineRoomId,
  ]);

  // WebSocket listener for Online rooms, matchmaking, clock sync & 5-min reconnect grace
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
        const roomCode = String(msg.code);
        setOnlineRoomId(String(msg.roomId));
        setWaitingRoomCode(roomCode);
        setOnlineTargetPlayers(Number(msg.targetPlayers || 2));
        setOnlineHostUserId(String(msg.hostUserId || profile.id));
        setOnlineWaitingPlayers(
          Array.isArray(msg.players)
            ? (msg.players as WaitingPlayerInfo[])
            : [{ userId: profile.id, nickname: profile.nickname || 'Hôte', eol: profile.eol }]
        );
        const pending = pendingFriendInviteRef.current;
        if (
          pending &&
          handledFriendInviteNonceRef.current === pending.nonce &&
          dispatchedInviteNonceRef.current !== pending.nonce &&
          activeVariantRef.current
        ) {
          dispatchedInviteNonceRef.current = pending.nonce;
          onRoomCreatedForFriendRef.current?.(
            { toUid: pending.toUid, toNickname: pending.toNickname },
            roomCode,
            activeVariantRef.current
          );
        } else {
          onNotify(`Salle créée ! Partagez le code ${roomCode} ou le lien d’invitation.`);
        }
      } else if (msg.type === 'room:lobby_update') {
        setOnlineRoomId(String(msg.roomId));
        setWaitingRoomCode(String(msg.code));
        setOnlineTargetPlayers(Number(msg.targetPlayers || 2));
        setOnlineHostUserId(String(msg.hostUserId || ''));
        if (Array.isArray(msg.players)) {
          setOnlineWaitingPlayers(msg.players as WaitingPlayerInfo[]);
        }
      } else if (msg.type === 'room:host_changed') {
        setOnlineHostUserId(String(msg.hostUserId || ''));
      } else if (msg.type === 'room:error') {
        onNotify(String(msg.message || 'Erreur de salle.'));
      } else if (msg.type === 'room:reconnect_expired') {
        clearActiveOnlineSession();
      } else if (msg.type === 'room:state_sync') {
        const v = msg.variant as Variant;
        const assignedSide = parsePlayerSide(msg.yourSide, 'white');
        const comp = msg.competitive !== false;
        const incomingAi = Array.isArray(msg.aiSeats) ? (msg.aiSeats as OnlineAiSeat[]) : [];
        const incomingHumans = Array.isArray(msg.participants)
          ? (msg.participants as OnlineHumanSeat[])
          : [];
        const aiLvlMap: Partial<Record<PlayerSide, AiDifficultyLevel>> = {};
        for (const a of incomingAi) {
          aiLvlMap[a.side] = a.level;
        }
        const serverMoves = Array.isArray(msg.moves) ? (msg.moves as LegalMove[]) : [];
        const combinedPieces = [...customPieces, ...(v.customPieceDefs || [])];
        let rebuilt = createInitialGameState(v, combinedPieces);
        for (const mv of serverMoves) {
          rebuilt = applyMove(rebuilt, mv);
        }

        setMatchmakingActive(false);
        setOnlineRoomId(String(msg.roomId));
        setOnlineCode(String(msg.code));
        setWaitingRoomCode(null);
        setMode('online');
        setActiveCompetitive(comp);
        setLobbyCompetitive(comp);
        setMyOnlineSide(assignedSide);
        setMyPlayerSide(assignedSide);
        setOnlineOpponent(msg.opponent as typeof onlineOpponent);
        setOnlineParticipants(incomingHumans);
        setOnlineAiSeats(incomingAi);
        setOnlineHostUserId(msg.hostUserId ? String(msg.hostUserId) : null);
        setAiSides(incomingAi.map((a) => a.side));
        setAiLevelsBySide(aiLvlMap);
        if (msg.clocks) {
          setClocks(msg.clocks as Record<PlayerSide, number>);
        } else {
          resetClocks(v);
        }
        if (Array.isArray(msg.disconnectedPlayers)) {
          setDisconnectedOpponents(
            (msg.disconnectedPlayers as DisconnectedPlayerBanner[]).filter(
              (d) => d.userId !== profile.id
            )
          );
        } else {
          setDisconnectedOpponents([]);
        }
        setRecordedMoves(serverMoves.map(toReplayMove));
        setGameState(rebuilt);
        setUndoStack([]);
        setUndoMovesLenStack([]);
        setSelectedSquare(null);
        setSelectedDropPieceId(null);
        setPremoveSelectedSquare(null);
        setQueuedPremove(null);
        gameRecordedRef.current = Boolean(rebuilt.winner);
        setPhase(rebuilt.winner ? 'ended' : 'playing');
        saveActiveOnlineSession({
          roomId: String(msg.roomId),
          code: String(msg.code),
          userId: profile.id,
          variantId: v.id,
          savedAt: Date.now(),
        });
        onNotify('Reconnecté à votre partie en ligne !');
      } else if (msg.type === 'match:found') {
        const v = msg.variant as Variant;
        const assignedSide = parsePlayerSide(msg.yourSide, 'white');
        const comp = msg.competitive !== false;
        const incomingAi = Array.isArray(msg.aiSeats) ? (msg.aiSeats as OnlineAiSeat[]) : [];
        const incomingHumans = Array.isArray(msg.participants)
          ? (msg.participants as OnlineHumanSeat[])
          : [];
        const aiLvlMap: Partial<Record<PlayerSide, AiDifficultyLevel>> = {};
        for (const a of incomingAi) {
          aiLvlMap[a.side] = a.level;
        }

        setMatchmakingActive(false);
        setOnlineRoomId(String(msg.roomId));
        setOnlineCode(String(msg.code));
        setWaitingRoomCode(null);
        setMode('online');
        setActiveCompetitive(comp);
        setLobbyCompetitive(comp);
        setMyOnlineSide(assignedSide);
        setMyPlayerSide(assignedSide);
        setOnlineOpponent(msg.opponent as typeof onlineOpponent);
        setOnlineParticipants(incomingHumans);
        setOnlineAiSeats(incomingAi);
        setOnlineHostUserId(msg.hostUserId ? String(msg.hostUserId) : null);
        setDisconnectedOpponents([]);
        setAiSides(incomingAi.map((a) => a.side));
        setAiLevelsBySide(aiLvlMap);

        const fresh = createInitialGameState(v, customPieces);
        setGameState(fresh);
        setUndoStack([]);
        setUndoMovesLenStack([]);
        setRecordedMoves([]);
        setSelectedSquare(null);
        setSelectedDropPieceId(null);
        setPremoveSelectedSquare(null);
        setQueuedPremove(null);
        if (msg.clocks) {
          setClocks(msg.clocks as Record<PlayerSide, number>);
        } else {
          resetClocks(v);
        }
        gameRecordedRef.current = false;
        setLastEolBreakdown(null);
        setPhase('playing');
        if (profile.showBattleIntro !== false) {
          const opp = msg.opponent as NonNullable<typeof onlineOpponent> | undefined;
          if (opp) {
            setBattleIntroOpponent({
              uid: opp.userId,
              nickname: opp.nickname,
              eol: opp.eol,
              avatarColor: opp.avatarColor || '#f59e0b',
              avatarSymbol: opp.avatarSymbol || '♚',
              title: opp.title,
              streakPieceSymbol: opp.streakPieceSymbol || '♙',
              streakPieceLabel: opp.streakPieceLabel,
              battleCardStyle: opp.battleCardStyle || 'classic',
              isOnline: !String(opp.userId || '').startsWith('ai_'),
            });
          }
        }
        saveActiveOnlineSession({
          roomId: String(msg.roomId),
          code: String(msg.code),
          userId: profile.id,
          variantId: v.id,
          savedAt: Date.now(),
        });
        onNotify(
          incomingAi.length > 0
            ? `Partie lancée avec ${incomingHumans.length} joueur(s) et ${incomingAi.length} IA ! Vous jouez les ${SIDE_LABELS[assignedSide]}.`
            : `Adversaire connecté ! Vous jouez les ${SIDE_LABELS[assignedSide]} (${comp ? 'Compétitif' : 'Amical'}).`
        );
      } else if (msg.type === 'game:move') {
        const move = msg.move as LegalMove;
        if (msg.clocks) {
          setClocks(msg.clocks as Record<PlayerSide, number>);
        }
        setRecordedMoves((prev) => [...prev, toReplayMove(move)]);
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
      } else if (msg.type === 'room:clocks_sync') {
        if (msg.clocks) {
          setClocks(msg.clocks as Record<PlayerSide, number>);
        }
      } else if (msg.type === 'room:disconnect_countdown') {
        const list = Array.isArray(msg.disconnectedPlayers)
          ? (msg.disconnectedPlayers as DisconnectedPlayerBanner[]).filter(
              (d) => d.userId !== profile.id
            )
          : [];
        setDisconnectedOpponents(list);
      } else if (msg.type === 'room:player_reconnected') {
        const list = Array.isArray(msg.disconnectedPlayers)
          ? (msg.disconnectedPlayers as DisconnectedPlayerBanner[]).filter(
              (d) => d.userId !== profile.id
            )
          : [];
        setDisconnectedOpponents(list);
        if (msg.nickname) {
          onNotify(`${msg.nickname} s’est reconnecté à la partie.`);
        }
      } else if (msg.type === 'game:draw_offered') {
        setPendingDrawOffer('incoming');
        onNotify('Votre adversaire propose la nulle.');
      } else if (msg.type === 'game:draw_response') {
        if (msg.accepted) {
          setGameState((prev) =>
            prev
              ? { ...prev, winner: 'draw', endReason: 'Match nul accepté par les joueurs.' }
              : prev
          );
        } else {
          onNotify('Proposition de nulle refusée. La partie continue.');
        }
      } else if (msg.type === 'game:opponent_resigned') {
        const resignedSide = parsePlayerSide(msg.resignedSide, 'black');
        const reasonText =
          typeof msg.reason === 'string' && msg.reason
            ? msg.reason
            : `Abandon des ${SIDE_LABELS[resignedSide]}.`;
        setDisconnectedOpponents((prev) => prev.filter((d) => d.side !== resignedSide));
        setGameState((prev) => {
          if (!prev || prev.winner) return prev;
          const next = cloneGameState(prev);
          const rules = next.compiledRules;
          if (!next.eliminatedSides.includes(resignedSide)) {
            next.eliminatedSides.push(resignedSide);
          }
          if (rules?.teamSharedElimination) {
            for (const ally of getTeamSides(rules, resignedSide)) {
              if (next.activeSides.includes(ally) && !next.eliminatedSides.includes(ally)) {
                next.eliminatedSides.push(ally);
              }
            }
          }
          const remainingGroups = getRemainingTeamGroups(rules, next.activeSides, next.eliminatedSides);
          if (remainingGroups.length <= 1) {
            const winGroup = remainingGroups[0];
            next.winner = winGroup ? winGroup[0] : 'draw';
            next.winningTeam = winGroup && winGroup.length > 1 ? winGroup : null;
            next.endReason = reasonText;
            return next;
          }
          if (next.eliminatedSides.includes(getCurrentTurnSide(next))) {
            let nxt = (next.turnIndex + 1) % next.activeSides.length;
            let guard = 0;
            while (
              next.eliminatedSides.includes(next.activeSides[nxt]) &&
              guard < next.activeSides.length
            ) {
              nxt = (nxt + 1) % next.activeSides.length;
              guard++;
            }
            next.turnIndex = nxt;
          }
          return next;
        });
      } else if (msg.type === 'game:timeout') {
        const timedOutSide = parsePlayerSide(msg.timedOutSide, 'white');
        setGameState((prev) => {
          if (!prev || prev.winner) return prev;
          const next = cloneGameState(prev);
          const rules = next.compiledRules;
          if (!next.eliminatedSides.includes(timedOutSide)) {
            next.eliminatedSides.push(timedOutSide);
          }
          if (rules?.teamSharedElimination) {
            for (const ally of getTeamSides(rules, timedOutSide)) {
              if (next.activeSides.includes(ally) && !next.eliminatedSides.includes(ally)) {
                next.eliminatedSides.push(ally);
              }
            }
          }
          const remainingGroups = getRemainingTeamGroups(rules, next.activeSides, next.eliminatedSides);
          if (remainingGroups.length <= 1) {
            const winGroup = remainingGroups[0];
            next.winner = winGroup ? winGroup[0] : 'draw';
            next.winningTeam = winGroup && winGroup.length > 1 ? winGroup : null;
            next.endReason = `Temps écoulé pour les ${SIDE_LABELS[timedOutSide]}.`;
            return next;
          }
          if (next.eliminatedSides.includes(getCurrentTurnSide(next))) {
            let nxt = (next.turnIndex + 1) % next.activeSides.length;
            let guard = 0;
            while (
              next.eliminatedSides.includes(next.activeSides[nxt]) &&
              guard < next.activeSides.length
            ) {
              nxt = (nxt + 1) % next.activeSides.length;
              guard++;
            }
            next.turnIndex = nxt;
          }
          return next;
        });
      } else if (msg.type === 'game:opponent_disconnected') {
        onNotify('Un joueur s’est déconnecté de la salle.');
      }
    };

    onlineWs.addEventListener('message', onMessage);
    return () => {
      onlineWs.removeEventListener('message', onMessage);
    };
  }, [onlineWs, customPieces, profile.id, profile.nickname, profile.eol, settings.sound, settings.volume]);

  const openWsConnection = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (onlineWsRef.current && onlineWsRef.current.readyState === WebSocket.OPEN) {
        resolve(onlineWsRef.current);
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

  // Auto-reconnect to saved online game if user returns within 5 minutes (reload or app switch)
  useEffect(() => {
    if (attemptedSessionResumeRef.current || autoMatchedRoom) return;
    attemptedSessionResumeRef.current = true;
    const saved = loadActiveOnlineSession();
    if (!saved || saved.userId !== profile.id) return;

    void openWsConnection()
      .then((ws) => {
        ws.send(
          JSON.stringify({
            type: 'room:reconnect',
            roomId: saved.roomId,
            code: saved.code,
            userId: saved.userId,
          })
        );
      })
      .catch(() => {});
  }, [autoMatchedRoom, profile.id]);

  // Also reconnect seamlessly when tab returns to foreground during active online match
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (mode !== 'online' || phase !== 'playing' || !onlineRoomId) return;
      const ws = onlineWsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        void openWsConnection()
          .then((freshWs) => {
            freshWs.send(
              JSON.stringify({
                type: 'room:reconnect',
                roomId: onlineRoomId,
                code: onlineCode,
                userId: profile.id,
              })
            );
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [mode, phase, onlineRoomId, onlineCode, profile.id]);

  const buildMyCardMeta = () => {
    const card = getBattleCardFromProfile(profile, true);
    return {
      avatarColor: card.avatarColor,
      avatarSymbol: card.avatarSymbol,
      title: card.title,
      streakPieceSymbol: card.streakPieceSymbol,
      streakPieceLabel: card.streakPieceLabel,
      battleCardStyle: card.battleCardStyle,
    };
  };

  const handleStartOnlineMatchmaking = async () => {
    if (!activeVariant) return;
    setMatchmakingActive(true);
    setMatchmakingCountdown(10);
    setWaitingRoomCode(null);
    try {
      const ws = await openWsConnection();
      ws.send(
        JSON.stringify({
          type: 'matchmaking:join',
          userId: profile.id,
          nickname: profile.nickname || 'Joueur',
          eol: profile.eol,
          mode: 'specific',
          competitive: lobbyCompetitive,
          variantId: activeVariant.id,
          variantSnapshot: activeVariant,
          card: buildMyCardMeta(),
          theme: {
            boardTexture: settings.boardTexture,
            boardLight: settings.boardLight,
            boardDark: settings.boardDark,
          },
        })
      );
    } catch {
      setMatchmakingActive(false);
      onNotify('Serveur multijoueur indisponible — lancement contre l’IA.');
      startGame('ai', recommendedAiLevel);
    }
  };

  const handleCancelMatchmaking = () => {
    setMatchmakingActive(false);
    if (onlineWs && onlineWs.readyState === WebSocket.OPEN) {
      onlineWs.send(JSON.stringify({ type: 'matchmaking:leave' }));
    }
  };

  const handleCreateOnlineRoom = async () => {
    if (!activeVariant) return;
    setMatchmakingActive(false);
    try {
      const ws = await openWsConnection();
      ws.send(
        JSON.stringify({
          type: 'room:create',
          userId: profile.id,
          nickname: profile.nickname || 'Joueur',
          eol: profile.eol,
          competitive: lobbyCompetitive,
          variant: activeVariant,
          card: buildMyCardMeta(),
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

  const joinRoomByCode = async (rawCode: string) => {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) {
      onNotify('Entrez un code de salle.');
      return;
    }
    setMatchmakingActive(false);
    try {
      const ws = await openWsConnection();
      ws.send(
        JSON.stringify({
          type: 'room:join',
          code: clean,
          userId: profile.id,
          nickname: profile.nickname || 'Joueur',
          eol: profile.eol,
          card: buildMyCardMeta(),
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

  const handleJoinOnlineRoom = async () => {
    await joinRoomByCode(joinCodeInput);
  };

  const handleLaunchRoomWithAi = () => {
    if (!onlineWs || onlineWs.readyState !== WebSocket.OPEN || !onlineRoomId) return;
    onlineWs.send(
      JSON.stringify({
        type: 'room:start_with_ai',
        roomId: onlineRoomId,
        aiLevels: fillerAiLevels,
      })
    );
  };

  // Auto-join friend invite URL (?room=CODE) once on landing in Play lobby
  useEffect(() => {
    const code = initialJoinRoomCode.trim().toUpperCase();
    if (
      code &&
      phase === 'lobby' &&
      !waitingRoomCode &&
      !autoMatchedRoom &&
      autoJoinedUrlCodeRef.current !== code
    ) {
      autoJoinedUrlCodeRef.current = code;
      void joinRoomByCode(code);
    }
  }, [initialJoinRoomCode, phase, waitingRoomCode, autoMatchedRoom]);

  // Auto-create an online room when user clicked "Proposer une partie" to a friend
  useEffect(() => {
    if (
      pendingFriendInvite &&
      pendingFriendInvite.nonce !== handledFriendInviteNonceRef.current &&
      activeVariant &&
      activeVariant.id === pendingFriendInvite.variantId &&
      phase === 'lobby' &&
      !waitingRoomCode &&
      !autoMatchedRoom
    ) {
      handledFriendInviteNonceRef.current = pendingFriendInvite.nonce;
      setMode('online');
      void handleCreateOnlineRoom();
    }
  }, [pendingFriendInvite, activeVariant?.id, phase, waitingRoomCode, autoMatchedRoom]);

  const copyFriendInvite = async (kind: 'code' | 'link', code: string) => {
    const text =
      kind === 'code'
        ? code
        : `${getPublicAppUrl()}/?room=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHint(kind);
      setTimeout(() => setCopiedHint((prev) => (prev === kind ? null : prev)), 2000);
    } catch {
      onNotify(`Code à partager : ${text}`);
    }
  };

  const legalMovesForSelected = useMemo(() => {
    if (!gameState || selectedSquare === null || mode === 'analysis') return [];
    return getLegalMovesForSquare(gameState, selectedSquare, true);
  }, [gameState, selectedSquare, mode]);

  const legalDropMovesForSelected = useMemo(() => {
    if (!gameState || !selectedDropPieceId || mode === 'analysis' || gameState.winner) return [];
    const turnSide = getCurrentTurnSide(gameState);
    return getLegalDropMovesForSide(gameState, turnSide, selectedDropPieceId);
  }, [gameState, selectedDropPieceId, mode]);

  const myHumanControlSide: PlayerSide = mode === 'online' ? myOnlineSide : myPlayerSide;

  const premoveTargetsForSelected = useMemo(() => {
    if (
      !gameState ||
      premoveSelectedSquare === null ||
      phase !== 'playing' ||
      gameState.winner ||
      (mode !== 'ai' && mode !== 'online')
    ) {
      return [];
    }
    if (getCurrentTurnSide(gameState) === myHumanControlSide) return [];
    return getPremoveCandidateTargets(gameState, premoveSelectedSquare, myHumanControlSide);
  }, [gameState, premoveSelectedSquare, phase, mode, myHumanControlSide]);

  const powerMovesForSelected = useMemo(() => {
    if (!gameState || selectedSquare === null || mode === 'analysis') return [];
    return getSpecialPowerMoves(gameState, selectedSquare);
  }, [gameState, selectedSquare, mode]);

  const executePlayerMove = (move: LegalMove) => {
    if (!gameState || gameState.winner) return;
    const movingSide = getCurrentTurnSide(gameState);
    if (mode === 'ai' || mode === 'local') {
      setUndoStack((prev) => [...prev, cloneGameState(gameState)]);
      setUndoMovesLenStack((prev) => [...prev, recordedMoves.length]);
    }
    const next = applyMove(gameState, move);
    const turnFinished = next.turnIndex !== gameState.turnIndex;
    const incSec = next.variant.incrementSec || 0;
    if (
      turnFinished &&
      !next.winner &&
      (next.variant.duration || 0) > 0 &&
      incSec > 0
    ) {
      setClocks((prev) => ({
        ...prev,
        [movingSide]: (prev[movingSide] || 0) + incSec,
      }));
    }

    setRecordedMoves((prev) => [...prev, toReplayMove(move)]);
    setGameState(next);
    setSelectedSquare(null);
    setSelectedDropPieceId(null);
    setPremoveSelectedSquare(null);

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
          turnFinished,
          nextTurnSide: getCurrentTurnSide(next),
          eliminatedSides: next.eliminatedSides,
          winner: next.winner,
        })
      );
    }
  };

  // Auto-execute queued premove when it becomes the player's turn
  useEffect(() => {
    if (
      phase !== 'playing' ||
      !gameState ||
      gameState.winner ||
      aiThinking ||
      pendingPromotion ||
      !queuedPremove
    ) {
      return;
    }
    if (mode !== 'ai' && mode !== 'online') return;
    if (getCurrentTurnSide(gameState) !== myHumanControlSide) return;

    const premove = queuedPremove;
    setQueuedPremove(null);
    setPremoveSelectedSquare(null);

    const legal = getLegalMovesForSquare(gameState, premove.from, true);
    const matched = legal.find((m) => m.to === premove.to);
    if (!matched) return;

    if (matched.promotionPieceId && !matched.isPower) {
      const choices = getPromotionChoicesForState(gameState);
      if (choices.length > 1) {
        setPendingPromotion({
          baseMove: matched,
          side: myHumanControlSide,
          choices,
        });
        return;
      }
      if (choices.length === 1) {
        executePlayerMove({ ...matched, promotionPieceId: choices[0] });
        return;
      }
    }
    executePlayerMove(matched);
  }, [phase, mode, gameState, queuedPremove, myHumanControlSide, aiThinking, pendingPromotion]);

  const canUndo =
    (mode === 'ai' || mode === 'local') &&
    phase === 'playing' &&
    Boolean(gameState && !gameState.winner) &&
    (mode === 'local'
      ? undoStack.length > 0
      : undoStack.some((s) => getCurrentTurnSide(s) === myPlayerSide));

  const handleUndo = () => {
    if (mode === 'online' || mode === 'analysis' || !gameState || gameState.winner) return;
    if (undoStack.length === 0) return;
    setPendingPromotion(null);
    setSelectedDropPieceId(null);
    setPremoveSelectedSquare(null);
    setQueuedPremove(null);

    if (mode === 'local') {
      const target = undoStack[undoStack.length - 1];
      const len = undoMovesLenStack[undoMovesLenStack.length - 1] ?? Math.max(0, recordedMoves.length - 1);
      setUndoStack((prev) => prev.slice(0, -1));
      setUndoMovesLenStack((prev) => prev.slice(0, -1));
      setRecordedMoves((prev) => prev.slice(0, len));
      setGameState(target);
      setSelectedSquare(null);
      onNotify('Dernier coup annulé.');
      return;
    }

    let targetIdx = -1;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (getCurrentTurnSide(undoStack[i]) === myPlayerSide) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return;
    const restored = undoStack[targetIdx];
    const targetMovesLen = undoMovesLenStack[targetIdx] ?? 0;
    setAiThinking(false);
    setUndoStack(undoStack.slice(0, targetIdx));
    setUndoMovesLenStack(undoMovesLenStack.slice(0, targetIdx));
    setRecordedMoves((prev) => prev.slice(0, targetMovesLen));
    setGameState(restored);
    setSelectedSquare(null);
    onNotify('Votre dernier coup a été annulé.');
  };

  const tryCommitPlayerMove = (matched: LegalMove, currentTurn: PlayerSide) => {
    if (matched.promotionPieceId && !matched.isPower) {
      const choices = getPromotionChoicesForState(gameState!);
      if (choices.length > 1) {
        setPendingPromotion({
          baseMove: matched,
          side: currentTurn,
          choices,
        });
        return;
      }
      if (choices.length === 1) {
        executePlayerMove({ ...matched, promotionPieceId: choices[0] });
        return;
      }
    }
    executePlayerMove(matched);
  };

  const canDragBoardSquare = (index: number): boolean => {
    if (!gameState) return false;
    const piece = gameState.pieces[index];
    if (!piece) return false;
    if (mode === 'analysis') return true;
    if (phase !== 'playing' || gameState.winner || pendingPromotion) return false;

    const currentTurn = getCurrentTurnSide(gameState);
    if (mode === 'local') {
      return !aiSides.includes(currentTurn) && piece.side === currentTurn && piece.frozenTurns <= 0;
    }
    // AI or Online: allow dragging own pieces during own turn (active move) AND opponent's turn (premove)
    if (piece.side !== myHumanControlSide) return false;
    if (currentTurn === myHumanControlSide) {
      return !aiThinking && piece.frozenTurns <= 0;
    }
    return true;
  };

  const handlePieceDrop = (from: number, to: number) => {
    if (!gameState || from === to) return;

    if (mode === 'analysis') {
      if (gameState.board.cells[to] === 0 || gameState.board.blocked?.includes(to)) {
        onNotify('Case bloquée ou supprimée.');
        return;
      }
      const next = cloneGameState(gameState);
      const moving = next.pieces[from];
      if (!moving) return;
      delete next.pieces[from];
      next.pieces[to] = moving;
      next.lastMove = { from, to };
      playChessSound('move', settings.sound, settings.volume);
      setGameState(next);
      setSelectedSquare(null);
      return;
    }

    if (phase !== 'playing' || gameState.winner || pendingPromotion) return;
    const currentTurn = getCurrentTurnSide(gameState);
    const isActiveTurn =
      mode === 'local' ? !aiSides.includes(currentTurn) : currentTurn === myHumanControlSide;

    if (!isActiveTurn) {
      if (mode === 'ai' || mode === 'online') {
        const piece = gameState.pieces[from];
        if (!piece || piece.side !== myHumanControlSide) return;
        const targets = getPremoveCandidateTargets(gameState, from, myHumanControlSide);
        if (targets.includes(to)) {
          setQueuedPremove({ from, to });
          setPremoveSelectedSquare(null);
        } else {
          setPremoveSelectedSquare(null);
        }
      }
      return;
    }

    if (aiThinking) return;
    const legal = getLegalMovesForSquare(gameState, from, true);
    const matched = legal.find((m) => m.to === to);
    if (matched) {
      tryCommitPlayerMove(matched, currentTurn);
    } else {
      const reason = explainBlockedMove(gameState, from, to);
      if (reason) onNotify(reason);
      setSelectedSquare(from);
    }
  };

  const handleBoardContextMenu = () => {
    setSelectedSquare(null);
    setSelectedDropPieceId(null);
    setPremoveSelectedSquare(null);
    if (queuedPremove) {
      setQueuedPremove(null);
    }
  };

  const handleBoardClick = (index: number) => {
    if (!gameState) return;

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

    if (gameState.winner || pendingPromotion) return;

    const currentTurn = getCurrentTurnSide(gameState);
    const isMyInputTurn =
      !aiThinking &&
      (mode === 'ai'
        ? currentTurn === myPlayerSide
        : mode === 'local'
          ? !aiSides.includes(currentTurn)
          : currentTurn === myOnlineSide);

    // Premove flow during opponent turn (AI / Online)
    if (!isMyInputTurn) {
      if (phase === 'playing' && (mode === 'ai' || mode === 'online')) {
        if (premoveSelectedSquare !== null) {
          if (premoveSelectedSquare === index) {
            setPremoveSelectedSquare(null);
            return;
          }
          if (premoveTargetsForSelected.includes(index)) {
            setQueuedPremove({ from: premoveSelectedSquare, to: index });
            setPremoveSelectedSquare(null);
            return;
          }
        }
        const clickedOwn = gameState.pieces[index];
        if (clickedOwn && clickedOwn.side === myHumanControlSide) {
          setPremoveSelectedSquare(index);
        } else {
          setPremoveSelectedSquare(null);
          setQueuedPremove(null);
        }
      }
      return;
    }

    // Parachutage placement
    if (selectedDropPieceId) {
      const matchedDrop = legalDropMovesForSelected.find((m) => m.to === index);
      if (matchedDrop) {
        executePlayerMove(matchedDrop);
        return;
      }
      setSelectedDropPieceId(null);
    }

    if (selectedSquare !== null) {
      const matched = legalMovesForSelected.find((m) => m.to === index);
      if (matched) {
        tryCommitPlayerMove(matched, currentTurn);
        return;
      }
    }

    const clickedPiece = gameState.pieces[index];
    if (clickedPiece && clickedPiece.side === currentTurn) {
      if (clickedPiece.frozenTurns > 0) {
        onNotify('Cette pièce est gelée pour ce tour.');
        return;
      }
      setSelectedDropPieceId(null);
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

  const confirmResign = () => {
    if (!gameState || gameState.winner) return;
    setShowResignConfirm(false);
    const rules = gameState.compiledRules;
    const resigningSide: PlayerSide =
      mode === 'online'
        ? myOnlineSide
        : mode === 'ai'
          ? myPlayerSide
          : getCurrentTurnSide(gameState);

    if (mode === 'online' && onlineWs && onlineRoomId) {
      onlineWs.send(JSON.stringify({ type: 'game:resign', roomId: onlineRoomId }));
      clearActiveOnlineSession();
    }

    const next = cloneGameState(gameState);
    if (!next.eliminatedSides.includes(resigningSide)) {
      next.eliminatedSides.push(resigningSide);
    }
    if (rules?.teamSharedElimination || mode === 'online' || mode === 'ai') {
      for (const ally of getTeamSides(rules, resigningSide)) {
        if (next.activeSides.includes(ally) && !next.eliminatedSides.includes(ally)) {
          next.eliminatedSides.push(ally);
        }
      }
    }

    const remainingGroups = getRemainingTeamGroups(rules, next.activeSides, next.eliminatedSides);
    const enemyGroup = remainingGroups.find((g) => !areSidesAllied(rules, g[0], resigningSide)) || remainingGroups[0];

    if (remainingGroups.length <= 1 || mode === 'online' || mode === 'ai') {
      const winGroup = enemyGroup || [];
      const otherSide =
        winGroup[0] ||
        next.activeSides.find((s) => !areSidesAllied(rules, s, resigningSide)) ||
        (resigningSide === 'white' ? 'black' : 'white');
      setGameState({
        ...next,
        winner: otherSide,
        winningTeam: winGroup.length > 1 ? winGroup : null,
        endReason: `Abandon des ${SIDE_LABELS[resigningSide]}.`,
      });
    } else {
      let nxt = (next.turnIndex + 1) % next.activeSides.length;
      let guard = 0;
      while (
        next.eliminatedSides.includes(next.activeSides[nxt]) &&
        guard < next.activeSides.length
      ) {
        nxt = (nxt + 1) % next.activeSides.length;
        guard++;
      }
      next.turnIndex = nxt;
      setGameState(next);
    }
  };

  const handleOfferDraw = () => {
    if (!gameState || gameState.winner) return;
    if (mode === 'online' && onlineWs && onlineRoomId) {
      onlineWs.send(JSON.stringify({ type: 'game:offer_draw', roomId: onlineRoomId }));
      onNotify('Proposition de nulle envoyée à l’adversaire.');
    } else if (mode === 'local') {
      setPendingDrawOffer('local_prompt');
    } else if (mode === 'ai') {
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
      id: `ana_${safeUuid().slice(0, 10)}`,
      type: 'Analyse sauvegardée',
      mode: 'analysis',
      variantId: gameState.variant.id,
      variantName: gameState.variant.name,
      variantSnapshot: gameState.variant,
      creatorName: gameState.variant.creator,
      opponentName: 'Analyse libre',
      result: 'saved',
      movesCount: gameState.moveHistory.length,
      replayMoves: recordedMoves,
      date: new Date().toISOString(),
      userRating: userRatings[gameState.variant.id],
    });
    onNotify('Position d’analyse enregistrée dans l’historique.');
  };

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

  if (!activeVariant) {
    return (
      <div className="p-6 rounded-2xl border border-slate-800 bg-[#151c27] text-center">
        <p className="text-slate-400">Aucune variante disponible. Créez-en une d’abord !</p>
      </div>
    );
  }

  const currentTurnSide = gameState ? getCurrentTurnSide(gameState) : 'white';
  const currentRating = userRatings[activeVariant.id] || 0;
  const effectiveMySide: PlayerSide = mode === 'online' ? myOnlineSide : myPlayerSide;
  const opponentSide: PlayerSide =
    gameState?.activeSides.find(
      (s) => s !== effectiveMySide && !gameState.eliminatedSides.includes(s)
    ) ||
    gameState?.activeSides.find((s) => s !== effectiveMySide) ||
    (effectiveMySide === 'black' ? 'white' : 'black');

  const isMyTurn =
    phase === 'playing' &&
    Boolean(gameState && !gameState.winner) &&
    mode !== 'analysis' &&
    (mode === 'local' ? !aiSides.includes(currentTurnSide) : currentTurnSide === effectiveMySide);

  const isOpponentTurn =
    phase === 'playing' && Boolean(gameState && !gameState.winner) && mode !== 'analysis' && !isMyTurn;

  const endOutcome: 'win' | 'loss' | 'draw' | null =
    phase === 'ended' && gameState?.winner && mode !== 'analysis'
      ? gameState.winner === 'draw'
        ? 'draw'
        : areSidesAllied(gameState.compiledRules, gameState.winner, effectiveMySide)
          ? 'win'
          : 'loss'
      : null;

  const endHeadline =
    endOutcome && gameState
      ? `Vous avez ${
          endOutcome === 'win'
            ? 'gagné'
            : endOutcome === 'loss'
              ? 'perdu'
              : 'fait nul'
        } par ${formatEndCondition(gameState)}`
      : '';

  const describeSideSeat = (side: PlayerSide): string => {
    if (mode === 'analysis') return SIDE_LABELS[side];
    if (side === effectiveMySide && mode !== 'local') {
      return `${profile.nickname || 'Vous'} (${SIDE_LABELS[side]})`;
    }
    if (mode === 'online') {
      const hum = onlineParticipants.find((p) => p.side === side);
      if (hum) {
        return hum.userId === profile.id
          ? `${hum.nickname} · Vous (${SIDE_LABELS[side]})`
          : `${hum.nickname} (${hum.eol} ÉOL · ${SIDE_LABELS[side]})`;
      }
      const bot = onlineAiSeats.find((a) => a.side === side);
      if (bot) return `IA Niv.${bot.level} (~${bot.approxEol} ÉOL · ${SIDE_LABELS[side]})`;
      return `${onlineOpponent?.nickname || 'Adversaire'} (${SIDE_LABELS[side]})`;
    }
    if (aiSides.includes(side)) {
      const lvl = aiLevelsBySide[side] || aiLevel;
      const meta = AI_LEVELS.find((l) => l.level === lvl) || AI_LEVELS[2];
      return `IA Niv.${lvl} (~${meta.approxEol} ÉOL · ${SIDE_LABELS[side]})`;
    }
    if (side === myPlayerSide) {
      return `${profile.nickname || 'Joueur 1'} (${SIDE_LABELS[side]})`;
    }
    return `Humain local (${SIDE_LABELS[side]})`;
  };

  const opponentLabel =
    mode === 'analysis'
      ? 'Analyse libre'
      : (gameState?.activeSides.length || 2) > 2
        ? `${gameState?.activeSides.length} joueurs · Actif : ${describeSideSeat(currentTurnSide)}`
        : describeSideSeat(opponentSide);

  const hasClock = Boolean(gameState && gameState.variant.duration > 0 && mode !== 'analysis');
  const topClockSide =
    (gameState?.activeSides.length || 2) > 2 && currentTurnSide !== effectiveMySide
      ? currentTurnSide
      : opponentSide;

  const renderClockBadge = (side: PlayerSide, isTicking: boolean, large = false) => {
    if (!gameState || mode === 'analysis') return null;
    if (!hasClock) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-900/70 border border-slate-700/70 text-slate-400 shrink-0 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" />
          <span>∞ Sans chrono</span>
        </span>
      );
    }
    const remaining = clocks[side];
    const lowTime = remaining <= 30;
    return (
      <div
        className={`inline-flex items-center gap-1.5 font-extrabold font-mono-num rounded-xl border shrink-0 whitespace-nowrap ${
          large ? 'text-base sm:text-xl px-3 py-1.5' : 'text-sm sm:text-base px-2.5 py-1'
        } ${
          lowTime
            ? 'border-rose-400 bg-rose-500/20 text-rose-200 animate-pulse'
            : isTicking
              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.28)]'
              : 'border-slate-700 bg-[#0d131d] text-slate-200'
        }`}
      >
        <Clock className={large ? 'w-4 h-4 text-emerald-400' : 'w-3.5 h-3.5 text-slate-400'} />
        <span>{formatClock(remaining)}</span>
      </div>
    );
  };

  const renderDisconnectBanner = () => {
    if (mode !== 'online' || phase !== 'playing' || disconnectedOpponents.length === 0) {
      return null;
    }
    return (
      <div className="w-full max-w-6xl shrink-0 rounded-xl border border-amber-400/50 bg-amber-500/15 px-3.5 py-2 flex items-center justify-between gap-2 text-xs sm:text-sm text-amber-200">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="truncate">
            {disconnectedOpponents
              .map(
                (d) =>
                  `${d.nickname} a quitté l’application — Abandon automatique dans ${formatMinSec(d.remainingSec)}`
              )
              .join(' · ')}
          </span>
        </div>
      </div>
    );
  };

  const renderMultiPlayerStrip = (darkSurface: boolean) => {
    if (!gameState || gameState.activeSides.length <= 2) return null;
    const teams = gameState.compiledRules?.teams || [];
    return (
      <div className="w-full max-w-6xl flex items-center gap-1.5 shrink-0 overflow-x-auto flex-nowrap py-0.5">
        {gameState.activeSides.map((s) => {
          const eliminated = gameState.eliminatedSides.includes(s);
          const active = currentTurnSide === s && !gameState.winner;
          const teamIdx = teams.findIndex((g) => g.includes(s));
          const isAllyToMe =
            mode !== 'local' &&
            s !== effectiveMySide &&
            areSidesAllied(gameState.compiledRules, s, effectiveMySide);
          return (
            <div
              key={s}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs shrink-0 whitespace-nowrap ${
                eliminated
                  ? 'opacity-45 border-slate-800 bg-slate-900/40 line-through'
                  : active
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100 font-semibold shadow-sm'
                    : darkSurface
                      ? 'border-slate-800 bg-[#121923] text-slate-300'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full border shrink-0 ${SIDE_SWATCH[s]}`} />
              {teamIdx >= 0 && (
                <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                  Éq.{teamIdx + 1}
                  {isAllyToMe ? ' · Allié' : ''}
                </span>
              )}
              <span className="truncate max-w-[145px]">{describeSideSeat(s)}</span>
              {hasClock && (
                <span className="font-mono-num font-bold opacity-90">
                  · {formatClock(clocks[s])}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderSidePicker = () => (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
        Votre couleur (pour s’entraîner ou aléatoire)
      </span>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPreferredSide('random')}
          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors min-h-[36px] ${
            preferredSide === 'random'
              ? 'border-sky-500 bg-sky-500/20 text-sky-400'
              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] text-slate-600 dark:text-slate-300'
          }`}
        >
          Aléatoire
        </button>
        {lobbyAvailableSides.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPreferredSide(s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors min-h-[36px] ${
              preferredSide === s
                ? 'border-sky-500 bg-sky-500/20 text-sky-400'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] text-slate-600 dark:text-slate-300'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full border ${SIDE_SWATCH[s]}`} />
            <span>{SIDE_LABELS[s]}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderBoardHidingOverlay = () => {
    if (!endOutcome || !gameState) return null;
    return (
      <div className="absolute inset-0 z-30 rounded-xl bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-5 sm:p-8 text-center space-y-4">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
            endOutcome === 'win'
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              : endOutcome === 'loss'
                ? 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                : 'bg-amber-500/20 border-amber-400/50 text-amber-300'
          }`}
        >
          <Trophy className="w-7 h-7" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <div className="text-xs uppercase tracking-wider font-semibold text-sky-400">
            Fin de partie · {activeCompetitive ? 'Compétitif (ÉOL)' : 'Amical (sans ÉOL)'}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
            {endHeadline}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300">
            {gameState.winner === 'draw'
              ? 'Match nul'
              : gameState.winningTeam && gameState.winningTeam.length > 1
                ? `Victoire de l’équipe ${formatTeamLabel(gameState.winningTeam)}`
                : `Victoire des ${SIDE_LABELS[gameState.winner as PlayerSide]}`}
            {gameState.endReason ? ` — ${gameState.endReason}` : ''}
          </p>
        </div>

        {activeCompetitive && lastEolBreakdown && (
          <div className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900/90 text-xs sm:text-sm">
            {lastEolBreakdown.counted ? (
              <span className="font-semibold">
                ÉOL :{' '}
                <span
                  className={`font-mono-num ${
                    lastEolBreakdown.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {lastEolBreakdown.delta >= 0 ? '+' : ''}
                  {lastEolBreakdown.delta} ({lastEolBreakdown.playerEolBefore} →{' '}
                  {lastEolBreakdown.playerEolAfter})
                </span>
                {lastEolBreakdown.modeMultiplier !== undefined &&
                  lastEolBreakdown.modeMultiplier < 1 && (
                    <span className="text-slate-400"> · ×0.50 (IA / Local)</span>
                  )}
              </span>
            ) : (
              <span className="text-amber-300">{lastEolBreakdown.reasonIfUncounted}</span>
            )}
          </div>
        )}
        {!activeCompetitive && (
          <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300">
            Partie amicale — aucun point ÉOL en jeu
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          {mode !== 'online' && (
            <button
              type="button"
              onClick={() => startGame(mode)}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
            >
              Rejouer
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              setPhase('lobby');
              clearActiveOnlineSession();
              onClearOnlineRoom?.();
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-600 hover:border-slate-400 text-slate-100 font-semibold text-sm min-h-[44px]"
          >
            Menu jeu
          </button>
          {isFullscreen && (
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-600 hover:border-sky-400 text-slate-200 font-semibold text-sm min-h-[44px]"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Diminuer l’écran</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderReserveTray = (compactBar = false) => {
    if (!gameState || mode === 'analysis' || !gameState.compiledRules?.allowPieceDrops) {
      return null;
    }
    const displaySide: PlayerSide =
      mode === 'local' ? currentTurnSide : effectiveMySide;
    const reserve = gameState.capturedReserve?.[displaySide] || [];
    const counts = new Map<string, number>();
    for (const pid of reserve) {
      counts.set(pid, (counts.get(pid) || 0) + 1);
    }
    const entries = Array.from(counts.entries());
    const canPickReserve =
      phase === 'playing' &&
      !gameState.winner &&
      isMyTurn &&
      !aiThinking &&
      !pendingPromotion;

    return (
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-xl border px-3 py-2 ${
          compactBar
            ? 'w-full max-w-6xl shrink-0 border-slate-800 bg-[#0d131d]'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27]'
        }`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mr-1">
          Réserve ({SIDE_LABELS[displaySide]}) :
        </span>
        {entries.length === 0 ? (
          <span className="text-xs text-slate-500">
            Aucune pièce capturée
          </span>
        ) : (
          entries.map(([pid, qty]) => {
            const active = selectedDropPieceId === pid;
            const cDef = gameState.customPieceMap[pid];
            return (
              <button
                key={pid}
                type="button"
                disabled={!canPickReserve}
                onClick={() => {
                  setSelectedSquare(null);
                  setPremoveSelectedSquare(null);
                  setSelectedDropPieceId((curr) => (curr === pid ? null : pid));
                }}
                className={`relative inline-flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors min-h-[36px] disabled:opacity-50 ${
                  active
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#111824] hover:border-sky-400 text-slate-200'
                }`}
                title={`Parachuter : ${getPieceName(pid, gameState.customPieceMap)}`}
              >
                <ChessPieceArtwork
                  pieceId={pid}
                  symbol={cDef?.symbol}
                  side={displaySide}
                  texture={cDef?.texture || settings.pieceTexture}
                  lightColor={cDef?.light || settings.pieceLight}
                  darkColor={cDef?.dark || settings.pieceDark}
                  mode="board"
                  className="w-6 h-6"
                />
                {qty > 1 && (
                  <span className="text-[11px] font-mono-num font-bold text-amber-300">
                    ×{qty}
                  </span>
                )}
              </button>
            );
          })
        )}
        {selectedDropPieceId && (
          <span className="text-[11px] text-emerald-300 ml-auto">
            Cliquez sur une case libre pour parachuter
          </span>
        )}
      </div>
    );
  };

  const renderPromotionOverlay = () => {
    if (!pendingPromotion || !gameState || gameState.winner) return null;
    const allCustomMap = gameState.customPieceMap;
    return (
      <div
        className="absolute inset-0 z-30 rounded-xl bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Choisir une pièce de promotion"
      >
        <div className="w-full max-w-md rounded-2xl border border-amber-400/50 bg-[#121925] p-4 sm:p-5 shadow-2xl space-y-4">
          <div className="text-center space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
              Promotion · {SIDE_LABELS[pendingPromotion.side]}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white">
              Choisissez la pièce d’arrivée
            </h3>
          </div>

          <div
            className={`grid gap-2.5 ${
              pendingPromotion.choices.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            {pendingPromotion.choices.map((pid) => {
              const cDef = allCustomMap[pid];
              const label = getPieceName(pid, allCustomMap);
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => {
                    const chosenMove: LegalMove = {
                      ...pendingPromotion.baseMove,
                      promotionPieceId: pid,
                    };
                    setPendingPromotion(null);
                    executePlayerMove(chosenMove);
                  }}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-slate-700 hover:border-amber-400 bg-[#0d131d] hover:bg-amber-500/10 transition-colors min-h-[84px]"
                >
                  <ChessPieceArtwork
                    pieceId={pid}
                    symbol={cDef?.symbol}
                    side={pendingPromotion.side}
                    texture={cDef?.texture || settings.pieceTexture}
                    lightColor={cDef?.light || settings.pieceLight}
                    darkColor={cDef?.dark || settings.pieceDark}
                    mode="board"
                    className="w-10 h-10"
                  />
                  <span className="text-xs font-semibold text-slate-100 text-center leading-tight line-clamp-1">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setPendingPromotion(null)}
              className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold min-h-[40px]"
            >
              Annuler le coup
            </button>
          </div>
        </div>
      </div>
    );
  };

  const extraPlayersCount = Math.max(0, (activeVariant.players || 2) - 2);
  const missingRoomSlots = Math.max(0, onlineTargetPlayers - onlineWaitingPlayers.length);

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
              Choisissez une variante, votre couleur, le mode compétitif ou amical, puis lancez la partie.
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
                    {v.name} ({v.board.rows}×{v.board.cols} · {v.players} joueurs · {v.controlledDifficulty || v.difficulty})
                  </option>
                ))}
              </select>
            </label>

            {/* Choix Compétitif vs Amical */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                Enjeu de la partie
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setLobbyCompetitive(true)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    lobbyCompetitive
                      ? 'border-sky-500 bg-sky-500/15 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="text-sm font-semibold">Compétitif (ÉOL en jeu)</div>
                  <div className="text-xs opacity-80 mt-0.5">
                    En ligne : 100 % ÉOL · IA / Humain local : 50 % ÉOL
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setLobbyCompetitive(false)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !lobbyCompetitive
                      ? 'border-emerald-500 bg-emerald-500/15 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="text-sm font-semibold">Amical (sans ÉOL)</div>
                  <div className="text-xs opacity-80 mt-0.5">
                    Aucun point ÉOL gagné ni perdu — idéal pour s’entraîner
                  </div>
                </button>
              </div>
            </div>

            {renderSidePicker()}

            <VariantRulesSummary
              variant={activeVariant}
              profile={profile}
              customPieces={customPieces}
              showEolPreview
            />
          </div>

          {/* 4 cartes de modes de jeu */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Contre IA */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Bot className="w-5 h-5 text-sky-400" />
                    <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                      Jouer contre une IA
                    </h2>
                  </div>
                  <span className="text-[11px] font-mono-num font-semibold text-sky-400">
                    Votre ÉOL : {profile.eol}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  L’IA la plus proche de votre niveau ({recommendedAiMeta.label}, ~{recommendedAiMeta.approxEol} ÉOL) est présélectionnée. Ouvertures variées et rythme humain.
                </p>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      {extraPlayersCount > 0 ? 'IA 1 (adversaire principal)' : 'Difficulté de l’IA'}
                    </span>
                    {aiLevel !== recommendedAiLevel && (
                      <button
                        type="button"
                        onClick={() => {
                          setAiLevel(recommendedAiLevel);
                          setAiLevelCustomPicked(false);
                        }}
                        className="text-sky-400 hover:underline font-medium"
                      >
                        Recommandé (Niv.{recommendedAiLevel})
                      </button>
                    )}
                  </div>
                  <select
                    value={aiLevel}
                    onChange={(e) => {
                      setAiLevel(Number(e.target.value) as AiDifficultyLevel);
                      setAiLevelCustomPicked(true);
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
                  >
                    {AI_LEVELS.map((l) => (
                      <option key={l.level} value={l.level}>
                        Niveau {l.level} — {l.label} (~{l.approxEol} ÉOL)
                        {l.level === recommendedAiLevel ? ' ★ Recommandé' : ''}
                      </option>
                    ))}
                  </select>
                  {onOpenChallenges && profile.botRebellionUnlocked && (
                    <button
                      type="button"
                      onClick={() => onOpenChallenges('bots')}
                      className="w-full flex items-center justify-between text-[11px] rounded-lg border border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/15 px-2.5 py-1.5 text-amber-200 transition-colors"
                    >
                      <span className="flex items-center gap-1.5 font-medium">
                        <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>La Grève des 8 Bots débloquée</span>
                      </span>
                      <span className="font-semibold text-amber-300 shrink-0">Voir</span>
                    </button>
                  )}
                </div>

                {extraPlayersCount > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0f151f] border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Niveaux des {extraPlayersCount} autre(s) IA ({activeVariant.players} joueurs)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Array.from({ length: extraPlayersCount }, (_, i) => {
                        const seatIdx = i + 1;
                        const cfg = multiSeatConfigs[seatIdx] || {
                          kind: 'ai',
                          aiLevel: recommendedAiLevel,
                        };
                        return (
                          <label key={seatIdx} className="block space-y-1">
                            <span className="text-[11px] text-slate-500">IA {i + 2}</span>
                            <select
                              value={cfg.aiLevel}
                              onChange={(e) => {
                                const val = Number(e.target.value) as AiDifficultyLevel;
                                setMultiSeatConfigs((prev) =>
                                  prev.map((item, idx) =>
                                    idx === seatIdx ? { ...item, kind: 'ai', aiLevel: val } : item
                                  )
                                );
                              }}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2.5 py-1.5 text-xs"
                            >
                              {AI_LEVELS.map((l) => (
                                <option key={l.level} value={l.level}>
                                  Niv.{l.level} · {l.label} (~{l.approxEol} ÉOL)
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => startGame('ai')}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
              >
                {lobbyCompetitive
                  ? `Affronter l’IA Niv.${aiLevel} (ÉOL −50 %)`
                  : `Affronter l’IA Niv.${aiLevel} (amical)`}
              </button>
            </div>

            {/* 2. Contre un autre humain (local) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 flex flex-col justify-between space-y-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <Users className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                    Jouer contre un autre humain (local)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Partie en face à face sur cet appareil pour 2 à {activeVariant.players} joueurs, avec votre choix de couleur, bouton Annuler et horloges.
                </p>

                {extraPlayersCount > 0 && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0f151f] border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Places supplémentaires (Humain ou IA)
                    </div>
                    <div className="space-y-2">
                      {Array.from({ length: extraPlayersCount }, (_, i) => {
                        const seatIdx = i + 1;
                        const cfg = multiSeatConfigs[seatIdx] || {
                          kind: 'ai',
                          aiLevel: recommendedAiLevel,
                        };
                        return (
                          <div key={seatIdx} className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-16 shrink-0">
                              Place {seatIdx + 2}
                            </span>
                            <select
                              value={cfg.kind}
                              onChange={(e) => {
                                const k = e.target.value === 'human' ? 'human' : 'ai';
                                setMultiSeatConfigs((prev) =>
                                  prev.map((item, idx) =>
                                    idx === seatIdx ? { ...item, kind: k } : item
                                  )
                                );
                              }}
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2 py-1.5 text-xs"
                            >
                              <option value="human">Humain local</option>
                              <option value="ai">Compléter par IA</option>
                            </select>
                            {cfg.kind === 'ai' && (
                              <select
                                value={cfg.aiLevel}
                                onChange={(e) => {
                                  const val = Number(e.target.value) as AiDifficultyLevel;
                                  setMultiSeatConfigs((prev) =>
                                    prev.map((item, idx) =>
                                      idx === seatIdx ? { ...item, aiLevel: val } : item
                                    )
                                  );
                                }}
                                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2 py-1.5 text-xs"
                              >
                                {AI_LEVELS.map((l) => (
                                  <option key={l.level} value={l.level}>
                                    Niv.{l.level} (~{l.approxEol} ÉOL)
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => startGame('local')}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm min-h-[44px]"
              >
                {lobbyCompetitive
                  ? 'Lancer partie locale (ÉOL −50 %)'
                  : 'Lancer partie locale (amicale)'}
              </button>
            </div>

            {/* 3. En ligne */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <Globe className="w-5 h-5 text-violet-400" />
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  Jouer en ligne (Matchmaking ou Ami)
                </h2>
              </div>

              {matchmakingActive ? (
                <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/35 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-sky-300">
                    <span>Recherche d’un adversaire ÉOL ≈ {profile.eol}…</span>
                    <span className="font-mono-num text-sm">{matchmakingCountdown} s</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-sky-400 transition-all duration-1000"
                      style={{ width: `${(matchmakingCountdown / 10) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>
                      {(activeVariant.players || 2) > 2
                        ? 'Les places libres seront complétées par des IA après 10 s.'
                        : `Si personne ne rejoint sous ${matchmakingCountdown} s, lancement contre l’IA Niv.${recommendedAiLevel}.`}
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelMatchmaking}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-200 shrink-0"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                !waitingRoomCode && (
                  <button
                    type="button"
                    onClick={handleStartOnlineMatchmaking}
                    className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
                  >
                    Matchmaking en ligne · délai max 10 s ({lobbyCompetitive ? '100 % ÉOL' : 'Amical'})
                  </button>
                )
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong className="text-violet-400">Jouer avec un ami :</strong> 1) Créez une salle pour obtenir un{' '}
                  <strong>code à 6 caractères</strong> · 2) Envoyez-lui le code ou le <strong>lien direct</strong>. (5 min accordées en cas de déconnexion).
                </div>

                {waitingRoomCode ? (
                  <div className="p-3.5 rounded-xl bg-violet-500/15 border border-violet-500/35 space-y-3">
                    <div className="text-center space-y-1">
                      <div className="text-xs text-violet-300 font-medium">
                        En attente de joueurs ({onlineWaitingPlayers.length}/{onlineTargetPlayers})…
                      </div>
                      <div className="text-3xl font-extrabold font-mono-num tracking-[0.22em] text-white">
                        {waitingRoomCode}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => copyFriendInvite('code', waitingRoomCode)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-violet-400/40 bg-violet-500/20 hover:bg-violet-500/30 text-xs font-semibold text-white min-h-[38px]"
                      >
                        {copiedHint === 'code' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedHint === 'code' ? 'Code copié !' : 'Copier le code'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyFriendInvite('link', waitingRoomCode)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-sky-400/40 bg-sky-500/20 hover:bg-sky-500/30 text-xs font-semibold text-white min-h-[38px]"
                      >
                        {copiedHint === 'link' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedHint === 'link' ? 'Lien copié !' : 'Copier le lien'}</span>
                      </button>
                    </div>

                    {onlineWaitingPlayers.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-300 font-medium">
                          Joueurs déjà dans la salle :
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {onlineWaitingPlayers.map((p) => (
                            <span
                              key={p.userId}
                              className="px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-700 text-xs text-slate-200"
                            >
                              {p.nickname} ({p.eol} ÉOL)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {onlineTargetPlayers > 2 &&
                      missingRoomSlots > 0 &&
                      onlineHostUserId === profile.id && (
                        <div className="pt-2 border-t border-violet-400/25 space-y-2">
                          <div className="text-xs font-semibold text-amber-300">
                            Il manque {missingRoomSlots} joueur(s) : complétez avec des IA
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {fillerAiLevels.map((lvl, idx) => (
                              <select
                                key={idx}
                                value={lvl}
                                onChange={(e) => {
                                  const nextVal = Number(e.target.value) as AiDifficultyLevel;
                                  setFillerAiLevels((prev) =>
                                    prev.map((x, j) => (j === idx ? nextVal : x))
                                  );
                                }}
                                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                              >
                                {AI_LEVELS.map((l) => (
                                  <option key={l.level} value={l.level}>
                                    IA {idx + 1} : Niv.{l.level} (~{l.approxEol} ÉOL)
                                  </option>
                                ))}
                              </select>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={handleLaunchRoomWithAi}
                            className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs min-h-[38px]"
                          >
                            Lancer maintenant avec {missingRoomSlots} IA
                          </button>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleCreateOnlineRoom}
                      className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm min-h-[44px]"
                    >
                      Créer une salle privée pour un ami
                    </button>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="Collez le code reçu (ex. AB12CD)"
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num uppercase"
                      />
                      <button
                        type="button"
                        onClick={handleJoinOnlineRoom}
                        className="px-4 py-2 rounded-lg bg-violet-600/20 border border-violet-500/40 hover:bg-violet-600/30 text-violet-200 text-sm font-semibold min-h-[44px]"
                      >
                        Rejoindre
                      </button>
                    </div>
                  </div>
                )}
              </div>
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

      {/* Mode Grand écran : mise en page verrouillée (aucun saut lors de la sélection d'une pièce) */}
      {phase !== 'lobby' && gameState && isFullscreen && (
        <div
          className="fixed inset-0 z-50 h-dvh w-screen bg-[#070b11] text-slate-100 flex flex-col items-center justify-between gap-1.5 sm:gap-2 px-2 sm:px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-hidden overscroll-none"
          style={{ overflowAnchor: 'none' }}
        >
          {/* Ligne utilitaire supérieure : boutons d'action (jamais de collision avec la pendule) */}
          <div className="w-full max-w-6xl shrink-0 flex items-center justify-between gap-2">
            <span className="hidden sm:inline-block text-xs font-medium text-slate-400 truncate">
              {gameState.variant.name}
            </span>
            <div className="flex items-center justify-end gap-1.5 flex-wrap ml-auto">
              {(mode === 'ai' || mode === 'local') && phase === 'playing' && (
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-[#0d131d] text-xs min-h-[36px] disabled:opacity-40 whitespace-nowrap"
                >
                  <Undo2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Annuler</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowRulesModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-[#0d131d] text-xs min-h-[36px] whitespace-nowrap"
              >
                <Info className="w-3.5 h-3.5 text-sky-400" />
                <span>Règles</span>
              </button>
              {mode !== 'analysis' && phase === 'playing' && (
                <>
                  <button
                    type="button"
                    onClick={handleOfferDraw}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-[#0d131d] text-xs min-h-[36px] whitespace-nowrap"
                  >
                    <Handshake className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Proposer nulle</span>
                    <span className="sm:hidden">Nulle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResignConfirm(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 text-rose-300 text-xs min-h-[36px] whitespace-nowrap"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Abandonner</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs min-h-[36px] whitespace-nowrap"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Diminuer</span>
                <span className="hidden sm:inline">l’écran</span>
              </button>
            </div>
          </div>

          {/* Barre adversaire dédiée : nom + pendule toujours visibles sur tous les écrans */}
          <div
            className={`w-full max-w-6xl min-h-[48px] sm:h-14 shrink-0 flex items-center justify-between gap-2 px-3.5 rounded-2xl border ${
              isOpponentTurn
                ? 'border-sky-400/70 bg-sky-500/10 shadow-[0_0_20px_rgba(56,189,248,0.18)]'
                : 'border-slate-800 bg-[#121923]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className={`w-3.5 h-3.5 rounded-full border shrink-0 ${SIDE_SWATCH[topClockSide]}`} />
              <span className="text-xs sm:text-sm font-bold text-white truncate">
                {opponentLabel}
              </span>
              {aiThinking && (
                <span className="text-xs font-semibold text-sky-300 whitespace-nowrap shrink-0">
                  Réflexion…
                </span>
              )}
            </div>
            {renderClockBadge(topClockSide, isOpponentTurn, true)}
          </div>

          {renderDisconnectBanner()}
          {renderMultiPlayerStrip(true)}

          {/* Zone centrale de l'échiquier */}
          <div className="relative flex-1 w-full flex items-center justify-center min-h-0">
            <div
              className={`relative inline-flex items-center justify-center rounded-2xl border p-1.5 sm:p-2 transition-colors ${
                isMyTurn
                  ? 'border-emerald-400/70 bg-emerald-950/20 shadow-[0_0_28px_rgba(16,185,129,0.2)]'
                  : 'border-slate-800 bg-[#0d121a]'
              }`}
            >
              <ChessBoard
                board={gameState.board}
                pieces={gameState.pieces}
                customPieces={[...customPieces, ...(gameState.variant.customPieceDefs || [])]}
                settings={settings}
                opponentThemeOverride={
                  mode === 'online' && settings.showOpponentTheme ? onlineOpponent?.theme : null
                }
                selectedSquare={isMyTurn ? selectedSquare : premoveSelectedSquare}
                legalTargets={[
                  ...legalMovesForSelected
                    .filter((m) => !m.isPower && m.captureIndex === undefined)
                    .map((m) => m.to),
                  ...legalDropMovesForSelected.map((m) => m.to),
                ]}
                captureTargets={legalMovesForSelected
                  .filter((m) => m.captureIndex !== undefined)
                  .map((m) => m.to)}
                powerTargets={legalMovesForSelected.filter((m) => m.isPower).map((m) => m.to)}
                premoveTargets={premoveTargetsForSelected}
                premoveSquares={queuedPremove}
                lastMove={gameState.lastMove}
                inCheckSquares={inCheckSquares}
                viewerSide={mode === 'analysis' ? null : effectiveMySide}
                fullscreen
                isMyTurnHighlight={isMyTurn}
                gameWon={
                  phase === 'ended' &&
                  Boolean(gameState.winner && gameState.winner !== 'draw') &&
                  areSidesAllied(gameState.compiledRules, gameState.winner as PlayerSide, effectiveMySide)
                }
                goldEffects={{
                  goldLastMove: isGoldEffectActive(profile, 'gold_last_move'),
                  captureSparks: isGoldEffectActive(profile, 'capture_sparks'),
                  checkPulse: isGoldEffectActive(profile, 'check_pulse'),
                  powerShimmer: isGoldEffectActive(profile, 'power_shimmer'),
                  victoryCrownFrame: isGoldEffectActive(profile, 'victory_crown_frame'),
                  boardGoldSheen: isGoldEffectActive(profile, 'board_gold_sheen'),
                  turnAura: isGoldEffectActive(profile, 'turn_aura'),
                }}
                canDragSquare={canDragBoardSquare}
                onPieceDrop={handlePieceDrop}
                onBoardContextMenu={handleBoardContextMenu}
                onCellClick={handleBoardClick}
              />
              {renderPromotionOverlay()}
              {renderBoardHidingOverlay()}
            </div>

            {queuedPremove && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/90 border border-cyan-400/60 text-cyan-200 text-xs shadow-lg">
                <span>Coup anticipé prêt</span>
                <button
                  type="button"
                  onClick={() => setQueuedPremove(null)}
                  className="underline hover:text-white font-semibold"
                >
                  Annuler
                </button>
              </div>
            )}

            {/* Pouvoir spécial flottant pour ne jamais modifier la hauteur des barres */}
            {selectedSquare !== null &&
              powerMovesForSelected.some((pm) => pm.from === pm.to) && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                  {powerMovesForSelected
                    .filter((pm) => pm.from === pm.to)
                    .map((pm, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => executePlayerMove(pm)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-lg border border-violet-300/40"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{pm.description}</span>
                      </button>
                    ))}
                </div>
              )}
          </div>

          {/* Réserve parachutage compacte en plein écran si activée */}
          {renderReserveTray(true)}

          {/* Barre inférieure à hauteur fixe : indicateur visuel fort + pendule */}
          <div
            className={`w-full max-w-6xl h-14 sm:h-16 shrink-0 flex items-center justify-between gap-2 px-3.5 rounded-2xl border flex-nowrap ${
              isMyTurn
                ? 'border-emerald-400 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-[#121923] shadow-[0_0_24px_rgba(16,185,129,0.25)]'
                : 'border-slate-800 bg-[#121923]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-nowrap overflow-x-auto">
              <span className={`w-3.5 h-3.5 rounded-full border shrink-0 ${SIDE_SWATCH[effectiveMySide]}`} />
              <span className="text-sm sm:text-base font-bold text-white truncate">
                {profile.nickname || 'Vous'} ({SIDE_LABELS[effectiveMySide]})
              </span>

              {isMyTurn && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400 text-slate-950 font-extrabold text-xs tracking-wide uppercase shadow-sm shrink-0 whitespace-nowrap">
                  <span>
                    {mode === 'local' && currentTurnSide !== effectiveMySide
                      ? `À VOUS : ${SIDE_LABELS[currentTurnSide]}`
                      : 'À VOUS DE JOUER'}
                  </span>
                </span>
              )}

              {!isMyTurn && mode !== 'analysis' && phase === 'playing' && (
                <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
                  Tour : <strong className="text-sky-300">{SIDE_LABELS[currentTurnSide]}</strong>
                </span>
              )}

              {gameState.actionsRemaining > 1 && (
                <span className="text-xs font-semibold text-amber-300 shrink-0 whitespace-nowrap">
                  {gameState.actionsRemaining} actions
                </span>
              )}
              {gameState.inCheckSides.includes(currentTurnSide) && (
                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/50 text-rose-300 text-xs font-bold shrink-0 whitespace-nowrap">
                  ÉCHEC !
                </span>
              )}
            </div>

            {renderClockBadge(effectiveMySide, isMyTurn, true)}
          </div>
        </div>
      )}

      {/* Interface normale de partie active ou terminée */}
      {phase !== 'lobby' && gameState && !isFullscreen && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Colonne Échiquier */}
          <div className="lg:col-span-8 space-y-3">
            {renderDisconnectBanner()}

            {/* Barre du haut */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl border transition-colors ${
                isOpponentTurn
                  ? 'border-sky-400/70 bg-sky-500/10 dark:bg-sky-500/10 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-3 h-3 rounded-full border shrink-0 ${SIDE_SWATCH[topClockSide]}`} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {opponentLabel}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {aiThinking
                      ? 'Réflexion en cours…'
                      : engineBadge
                        ? `Moteur : ${engineBadge === 'stockfish' ? 'Stockfish' : 'Moteur Variantes'}`
                        : `${gameState.variant.name} · ${
                            mode === 'analysis'
                              ? 'Analyse'
                              : activeCompetitive
                                ? 'Compétitif'
                                : 'Amical'
                          }`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {renderClockBadge(topClockSide, isOpponentTurn)}
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-sky-400 bg-slate-50 dark:bg-[#0f151f] text-xs font-semibold min-h-[38px]"
                  title="Passer en grand écran"
                >
                  <Maximize2 className="w-4 h-4 text-sky-400" />
                  <span>Grand écran</span>
                </button>
              </div>
            </div>

            {renderMultiPlayerStrip(false)}

            {/* Échiquier unifié */}
            <div
              className={`relative rounded-2xl border p-2 sm:p-3 transition-colors ${
                isMyTurn
                  ? 'border-emerald-400/80 bg-emerald-500/5 dark:bg-emerald-950/15 shadow-[0_0_26px_rgba(16,185,129,0.18)]'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#0d121a]'
              }`}
            >
              <ChessBoard
                board={gameState.board}
                pieces={gameState.pieces}
                customPieces={[...customPieces, ...(gameState.variant.customPieceDefs || [])]}
                settings={settings}
                opponentThemeOverride={
                  mode === 'online' && settings.showOpponentTheme ? onlineOpponent?.theme : null
                }
                selectedSquare={isMyTurn ? selectedSquare : premoveSelectedSquare}
                legalTargets={[
                  ...legalMovesForSelected
                    .filter((m) => !m.isPower && m.captureIndex === undefined)
                    .map((m) => m.to),
                  ...legalDropMovesForSelected.map((m) => m.to),
                ]}
                captureTargets={legalMovesForSelected
                  .filter((m) => m.captureIndex !== undefined)
                  .map((m) => m.to)}
                powerTargets={legalMovesForSelected.filter((m) => m.isPower).map((m) => m.to)}
                premoveTargets={premoveTargetsForSelected}
                premoveSquares={queuedPremove}
                lastMove={gameState.lastMove}
                inCheckSquares={inCheckSquares}
                viewerSide={mode === 'analysis' ? null : effectiveMySide}
                isMyTurnHighlight={isMyTurn}
                gameWon={
                  phase === 'ended' &&
                  Boolean(gameState.winner && gameState.winner !== 'draw') &&
                  areSidesAllied(gameState.compiledRules, gameState.winner as PlayerSide, effectiveMySide)
                }
                goldEffects={{
                  goldLastMove: isGoldEffectActive(profile, 'gold_last_move'),
                  captureSparks: isGoldEffectActive(profile, 'capture_sparks'),
                  checkPulse: isGoldEffectActive(profile, 'check_pulse'),
                  powerShimmer: isGoldEffectActive(profile, 'power_shimmer'),
                  victoryCrownFrame: isGoldEffectActive(profile, 'victory_crown_frame'),
                  boardGoldSheen: isGoldEffectActive(profile, 'board_gold_sheen'),
                  turnAura: isGoldEffectActive(profile, 'turn_aura'),
                }}
                canDragSquare={canDragBoardSquare}
                onPieceDrop={handlePieceDrop}
                onBoardContextMenu={handleBoardContextMenu}
                onCellClick={handleBoardClick}
              />
              {renderPromotionOverlay()}
              {renderBoardHidingOverlay()}
              {battleIntroOpponent && (
                <BattleIntroOverlay
                  open={true}
                  player={getBattleCardFromProfile(profile, true)}
                  opponent={battleIntroOpponent}
                  variantName={gameState.variant.name}
                  onFinish={() => setBattleIntroOpponent(null)}
                />
              )}
              <VictoryEffects
                active={
                  phase === 'ended' &&
                  Boolean(gameState.winner && gameState.winner !== 'draw') &&
                  areSidesAllied(gameState.compiledRules, gameState.winner as PlayerSide, effectiveMySide)
                }
                confettiEnabled={isGoldEffectActive(profile, 'confetti_win')}
                starburstEnabled={isGoldEffectActive(profile, 'starburst_checkmate')}
                signatureMateEnabled={
                  (profile.goldCoins || 0) >= 100 && profile.gold100Choice === 'signature_mate'
                }
              />
            </div>

            {/* Bandeau joueur du bas */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-2xl border transition-colors ${
                isMyTurn
                  ? 'border-emerald-400 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-white dark:to-[#151c27] shadow-[0_0_22px_rgba(16,185,129,0.2)]'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27]'
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`w-3.5 h-3.5 rounded-full border shrink-0 ${SIDE_SWATCH[effectiveMySide]}`} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {profile.nickname || 'Vous'} ({SIDE_LABELS[effectiveMySide]})
                    </span>
                    {isMyTurn && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-extrabold text-[11px] tracking-wide uppercase">
                        <span>
                          {mode === 'local' && currentTurnSide !== effectiveMySide
                            ? `À VOUS : ${SIDE_LABELS[currentTurnSide]}`
                            : 'À VOUS DE JOUER'}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
              </div>
              {renderClockBadge(effectiveMySide, isMyTurn, true)}
            </div>

            {renderReserveTray(false)}

            {queuedPremove && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-xs text-cyan-200">
                <span>Coup anticipé enregistré — il sera joué automatiquement à votre tour.</span>
                <button
                  type="button"
                  onClick={() => setQueuedPremove(null)}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 font-semibold"
                >
                  Annuler
                </button>
              </div>
            )}

            {gameState.compiledRules?.timedRules?.some((r) => r.kind === 'rotate_special_effect') && (
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-amber-500/35 bg-amber-500/10 text-xs text-amber-200">
                <span>
                  ✦ Effet actif des cases spéciales :{' '}
                  <strong>
                    {SPECIAL_EFFECT_BADGE_LABELS[
                      resolveDynamicSpecialEffect(gameState.compiledRules, gameState.fullMoveNumber)
                    ]}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Colonne Contrôles */}
          <div className="lg:col-span-4 space-y-4">
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
                    const pid = ref.split('|')[0];
                    return (
                      <button
                        key={ref}
                        type="button"
                        onClick={() => {
                          setAnalysisTrayPiece(ref);
                          setSelectedSquare(null);
                        }}
                        className={`py-2 rounded-lg border min-h-[42px] flex items-center justify-center ${
                          analysisTrayPiece === ref
                            ? 'border-sky-500 bg-sky-500/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                        }`}
                      >
                        <span className="w-7 h-7 mx-auto flex items-center justify-center">
                          <ChessPieceArtwork
                            pieceId={pid}
                            side={isWhite ? 'white' : 'black'}
                            texture={settings.pieceTexture}
                            lightColor={settings.pieceLight}
                            darkColor={settings.pieceDark}
                            mode="board"
                            className="w-7 h-7"
                          />
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

                {(mode === 'ai' || mode === 'local') && phase === 'playing' && (
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm min-h-[44px] disabled:opacity-40"
                  >
                    <Undo2 className="w-4 h-4 text-sky-400" />
                    <span>Annuler</span>
                  </button>
                )}

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
                    setIsFullscreen(false);
                    setPhase('lobby');
                    if (mode !== 'online') {
                      clearActiveOnlineSession();
                    }
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

            {phase === 'ended' && (
              <div className="rounded-2xl border border-sky-500/40 bg-white dark:bg-[#151c27] p-5 space-y-4">
                <div>
                  <div className="text-xs font-medium text-sky-400">Fin de partie</div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                    {endHeadline ||
                      (gameState.winner === 'draw'
                        ? 'Match nul'
                        : gameState.winningTeam && gameState.winningTeam.length > 1
                          ? `Victoire de l’équipe ${formatTeamLabel(gameState.winningTeam)}`
                          : `Victoire des ${SIDE_LABELS[gameState.winner as PlayerSide]}`)}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {gameState.endReason}
                  </p>
                </div>

                {activeCompetitive && lastEolBreakdown && (
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
                          {lastEolBreakdown.modeMultiplier !== undefined &&
                            lastEolBreakdown.modeMultiplier < 1 &&
                            ` · Mode IA/Local ×${lastEolBreakdown.modeMultiplier.toFixed(2)} (−50 %)`}
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

                {!activeCompetitive && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0f151f] border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Partie amicale (sans ÉOL en jeu).
                  </div>
                )}

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

      {/* Modale Règles en mode Grand écran */}
      {isFullscreen && showRulesModal && gameState && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-[#151c27] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-50">Règles de {gameState.variant.name}</h3>
              <button
                type="button"
                onClick={() => setShowRulesModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <VariantRulesSummary
              variant={gameState.variant}
              profile={profile}
              customPieces={customPieces}
              showEolPreview={false}
              compact
            />
          </div>
        </div>
      )}

      {/* Confirmation d'abandon */}
      {showResignConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
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

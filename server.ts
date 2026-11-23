import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { getStarterVariants } from './src/utils/defaultVariants.ts';
import { computeControlledDifficulty } from './src/engine/eol.ts';
import { compileVariantRules } from './src/engine/ruleParser.ts';
import { isContentFamilyFriendly, validateFamilyFriendlyText } from './src/utils/moderation.ts';
import {
  AI_LEVELS,
  getClosestAiLevelForEol,
  type AiDifficultyLevel,
  type BattleCardStyle,
  type OnlineAiSeat,
  type OnlineHumanSeat,
  type PlayerSide,
  type Variant,
} from './src/types/chess.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'chesslab-db.json');

interface ServerRatingMap {
  [userId: string]: number;
}

interface ServerDb {
  variants: Variant[];
  ratings: Record<string, ServerRatingMap>; // variantId -> userId -> stars
  profiles: Record<
    string,
    {
      id: string;
      nickname: string;
      eol: number;
      gamesPlayed: number;
      wins: number;
      draws: number;
      losses: number;
      avatarColor?: string;
      avatarSymbol?: string;
      updatedAt: string;
    }
  >;
}

function ensureDb(): ServerDb {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid DB path');
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: ServerDb = {
      variants: getStarterVariants(),
      ratings: {},
      profiles: {},
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ServerDb>;
    const starter = getStarterVariants();
    const existing = Array.isArray(parsed.variants) ? parsed.variants : [];
    // Ensure starter variants exist on first boot if empty
    const variants = existing.length > 0 ? existing : starter;
    return {
      variants,
      ratings: parsed.ratings || {},
      profiles: parsed.profiles || {},
    };
  } catch {
    return {
      variants: getStarterVariants(),
      ratings: {},
      profiles: {},
    };
  }
}

let db: ServerDb = ensureDb();

function persistDb() {
  const tmp = path.resolve(DATA_DIR, `chesslab-db.${process.pid}.tmp`);
  if (!tmp.startsWith(DATA_DIR + path.sep)) return;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ---------- Real-time Matchmaking & Game Rooms ----------
const RECONNECT_GRACE_MS = 5 * 60 * 1000;

interface CardMeta {
  avatarColor?: string;
  avatarSymbol?: string;
  title?: string;
  streakPieceSymbol?: string;
  streakPieceLabel?: string;
  battleCardStyle?: BattleCardStyle;
}

interface PlayerConn {
  ws: WebSocket;
  userId: string;
  nickname: string;
  eol: number;
  side: PlayerSide;
  disconnectedAt?: number | null;
  eliminated?: boolean;
  card?: CardMeta;
  theme?: {
    boardTexture?: string;
    boardLight?: string;
    boardDark?: string;
  };
}

interface OnlineRoom {
  roomId: string;
  code: string;
  variant: Variant;
  competitive: boolean;
  targetPlayers: number;
  hostUserId: string;
  players: PlayerConn[];
  aiSeats: OnlineAiSeat[];
  activeSides: PlayerSide[];
  eliminatedSides: PlayerSide[];
  turnSide: PlayerSide;
  clocks: Record<PlayerSide, number>;
  incrementSec: number;
  moves: unknown[];
  drawOfferFrom: string | null;
  status: 'waiting' | 'active' | 'finished';
  winnerSide: string | null;
  createdAt: number;
}

interface QueueEntry {
  ws: WebSocket;
  userId: string;
  nickname: string;
  eol: number;
  mode: 'specific' | 'random';
  competitive: boolean;
  variantId: string | null;
  variantSnapshot?: Variant;
  joinedAt: number;
  card?: CardMeta;
  theme?: {
    boardTexture?: string;
    boardLight?: string;
    boardDark?: string;
  };
}

const VALID_SIDES: PlayerSide[] = ['white', 'black', 'red', 'blue', 'green', 'gold'];

function getVariantActiveSides(variant: Variant): PlayerSide[] {
  const compiled = compileVariantRules(variant, variant.customPieceDefs || []);
  const requestedCount = Math.max(2, Math.min(6, variant.players || 2));
  const sides = [...compiled.turnOrderSides].slice(0, requestedCount);
  for (const raw of Object.values(variant.setup || {})) {
    const match = String(raw).match(/\|(white|black|red|blue|green|gold)$/);
    const s = match?.[1] as PlayerSide | undefined;
    if (s && !sides.includes(s)) sides.push(s);
  }
  return sides;
}

function shuffleSides(sides: PlayerSide[]): PlayerSide[] {
  const copy = [...sides];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const rooms = new Map<string, OnlineRoom>();
const roomByCode = new Map<string, string>();
let matchmakingQueue: QueueEntry[] = [];
const onlineUsers = new Map<string, Set<WebSocket>>();

function registerOnlineSocket(userId: string, ws: WebSocket) {
  if (!userId) return;
  let set = onlineUsers.get(userId);
  if (!set) {
    set = new Set<WebSocket>();
    onlineUsers.set(userId, set);
  }
  set.add(ws);
}

function unregisterOnlineSocket(userId: string | null, ws: WebSocket) {
  if (!userId) return;
  const set = onlineUsers.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) onlineUsers.delete(userId);
}

function sendToUser(userId: string, payload: unknown) {
  const set = onlineUsers.get(userId);
  if (!set) return;
  for (const sock of set) {
    safeSend(sock, payload);
  }
}

function safeSend(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

function buildInitialClocks(variant: Variant): Record<PlayerSide, number> {
  const secs = Math.max(0, (variant.duration || 0) * 60);
  return {
    white: secs,
    black: secs,
    red: secs,
    blue: secs,
    green: secs,
    gold: secs,
  };
}

function getDisconnectedSummary(room: OnlineRoom) {
  const now = Date.now();
  return room.players
    .filter((p) => p.disconnectedAt && !p.eliminated)
    .map((p) => ({
      userId: p.userId,
      nickname: p.nickname,
      side: p.side,
      remainingSec: Math.max(0, Math.ceil((RECONNECT_GRACE_MS - (now - (p.disconnectedAt || now))) / 1000)),
    }));
}

function launchOnlineRoom(room: OnlineRoom, customAiLevels?: number[]) {
  const activeSides = getVariantActiveSides(room.variant);
  const shuffled = shuffleSides(activeSides);

  room.players.forEach((p, idx) => {
    p.side = shuffled[idx] || VALID_SIDES[idx] || 'white';
    p.disconnectedAt = null;
    p.eliminated = false;
  });

  const avgHumanEol =
    room.players.length > 0
      ? Math.round(room.players.reduce((acc, p) => acc + p.eol, 0) / room.players.length)
      : 400;

  const aiSeats: OnlineAiSeat[] = [];
  for (let idx = room.players.length; idx < shuffled.length; idx++) {
    const aiSide = shuffled[idx];
    const requestedLvl = customAiLevels?.[idx - room.players.length];
    const validLvl: AiDifficultyLevel =
      typeof requestedLvl === 'number' && requestedLvl >= 1 && requestedLvl <= 20
        ? (Math.round(requestedLvl) as AiDifficultyLevel)
        : getClosestAiLevelForEol(avgHumanEol);
    const meta = AI_LEVELS.find((l) => l.level === validLvl) || AI_LEVELS[2];
    aiSeats.push({
      side: aiSide,
      level: validLvl,
      approxEol: meta.approxEol,
      nickname: `IA ${meta.label}`,
    });
  }

  room.aiSeats = aiSeats;
  room.activeSides = activeSides;
  room.eliminatedSides = [];
  room.turnSide = activeSides[0] || 'white';
  room.clocks = buildInitialClocks(room.variant);
  room.incrementSec = Math.max(0, room.variant.incrementSec || 0);
  room.status = 'active';
  room.hostUserId = room.players[0]?.userId || '';

  const participants: OnlineHumanSeat[] = room.players.map((p) => ({
    userId: p.userId,
    nickname: p.nickname,
    eol: p.eol,
    side: p.side,
    avatarColor: p.card?.avatarColor,
    avatarSymbol: p.card?.avatarSymbol,
    title: p.card?.title,
    streakPieceSymbol: p.card?.streakPieceSymbol,
    streakPieceLabel: p.card?.streakPieceLabel,
    battleCardStyle: p.card?.battleCardStyle,
    theme: p.theme,
  }));

  for (const p of room.players) {
    const firstOther = room.players.find((other) => other.userId !== p.userId);
    const oppFallback = firstOther
      ? {
          userId: firstOther.userId,
          nickname: firstOther.nickname,
          eol: firstOther.eol,
          avatarColor: firstOther.card?.avatarColor,
          avatarSymbol: firstOther.card?.avatarSymbol,
          title: firstOther.card?.title,
          streakPieceSymbol: firstOther.card?.streakPieceSymbol,
          streakPieceLabel: firstOther.card?.streakPieceLabel,
          battleCardStyle: firstOther.card?.battleCardStyle,
          theme: firstOther.theme,
        }
      : {
          userId: 'ai_companion',
          nickname: aiSeats[0]?.nickname || 'IA Chess Lab',
          eol: aiSeats[0]?.approxEol || 400,
        };

    safeSend(p.ws, {
      type: 'match:found',
      roomId: room.roomId,
      code: room.code,
      yourSide: p.side,
      competitive: room.competitive,
      variant: room.variant,
      opponent: oppFallback,
      participants,
      aiSeats,
      hostUserId: room.hostUserId,
      clocks: room.clocks,
      turnSide: room.turnSide,
    });
  }
}

function tryMatchQueue() {
  matchmakingQueue = matchmakingQueue.filter((q) => q.ws.readyState === WebSocket.OPEN);
  if (matchmakingQueue.length < 2) return;
  const now = Date.now();

  // 1. Prioritize multi-player variant groups (>2 players): wait up to 9s for extra humans, then launch with AI fill
  const multiGroups = new Map<string, QueueEntry[]>();
  for (const entry of matchmakingQueue) {
    if (entry.variantId && entry.variantSnapshot && (entry.variantSnapshot.players || 2) > 2) {
      const key = `${entry.variantId}::${entry.competitive ? 'c' : 'f'}`;
      const list = multiGroups.get(key) || [];
      if (!list.some((x) => x.userId === entry.userId)) {
        list.push(entry);
        multiGroups.set(key, list);
      }
    }
  }

  for (const [, group] of multiGroups) {
    const sampleVariant =
      db.variants.find((v) => v.id === group[0].variantId) || group[0].variantSnapshot;
    if (!sampleVariant) continue;
    const targetPlayers = Math.max(3, Math.min(6, sampleVariant.players || 4));
    const oldestWaitSec = Math.max(...group.map((g) => (now - g.joinedAt) / 1000));

    if (group.length >= targetPlayers || (group.length >= 2 && oldestWaitSec >= 8.5)) {
      const selected = group.slice(0, targetPlayers);
      const selectedIds = new Set(selected.map((s) => s.userId));
      matchmakingQueue = matchmakingQueue.filter((q) => !selectedIds.has(q.userId));

      const roomId = crypto.randomUUID();
      const code = generateRoomCode();
      const room: OnlineRoom = {
        roomId,
        code,
        variant: sampleVariant,
        competitive: selected[0].competitive,
        targetPlayers,
        hostUserId: selected[0].userId,
        players: selected.map((s) => ({
          ws: s.ws,
          userId: s.userId,
          nickname: s.nickname,
          eol: s.eol,
          side: 'white',
          card: s.card,
          theme: s.theme,
        })),
        aiSeats: [],
        activeSides: [],
        eliminatedSides: [],
        turnSide: 'white',
        clocks: buildInitialClocks(sampleVariant),
        incrementSec: Math.max(0, sampleVariant.incrementSec || 0),
        moves: [],
        drawOfferFrom: null,
        status: 'waiting',
        winnerSide: null,
        createdAt: Date.now(),
      };
      rooms.set(roomId, room);
      roomByCode.set(code, roomId);
      launchOnlineRoom(room);
      return;
    }
  }

  // 2. Standard 2-player ELO-balanced matchmaking (tight gap early -> full pool before 10s expiry)
  for (let i = 0; i < matchmakingQueue.length; i++) {
    const a = matchmakingQueue[i];
    if (a.ws.readyState !== WebSocket.OPEN) continue;

    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let j = i + 1; j < matchmakingQueue.length; j++) {
      const b = matchmakingQueue[j];
      if (b.ws.readyState !== WebSocket.OPEN) continue;
      if (a.userId === b.userId) continue;

      const compatible =
        a.competitive === b.competitive &&
        ((a.mode === 'random' && b.mode === 'random') ||
          (a.mode === 'specific' && b.mode === 'specific' && a.variantId === b.variantId) ||
          (a.mode === 'specific' && b.mode === 'random') ||
          (a.mode === 'random' && b.mode === 'specific'));

      if (!compatible) continue;

      const waitSec = Math.max((now - a.joinedAt) / 1000, (now - b.joinedAt) / 1000);
      const maxGap = waitSec >= 6.5 ? 99999 : waitSec >= 3 ? 600 : 220;
      const diff = Math.abs(a.eol - b.eol);
      if (diff <= maxGap && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }

    if (bestIdx !== -1) {
      const b = matchmakingQueue[bestIdx];
      matchmakingQueue = matchmakingQueue.filter((_, idx) => idx !== i && idx !== bestIdx);

      let chosenVariant: Variant | undefined;
      const targetId = a.variantId || b.variantId;
      if (targetId) {
        chosenVariant =
          db.variants.find((v) => v.id === targetId) ||
          a.variantSnapshot ||
          b.variantSnapshot;
      }
      if (!chosenVariant) {
        const pubs = db.variants.filter((v) => v.visibility === 'public');
        chosenVariant = pubs[crypto.randomInt(0, Math.max(1, pubs.length))] || db.variants[0];
      }

      if (!chosenVariant) continue;

      const roomId = crypto.randomUUID();
      const code = generateRoomCode();
      const targetPlayers = Math.max(2, Math.min(6, chosenVariant.players || 2));

      const room: OnlineRoom = {
        roomId,
        code,
        variant: chosenVariant,
        competitive: a.competitive,
        targetPlayers,
        hostUserId: a.userId,
        players: [
          { ws: a.ws, userId: a.userId, nickname: a.nickname, eol: a.eol, side: 'white', card: a.card, theme: a.theme },
          { ws: b.ws, userId: b.userId, nickname: b.nickname, eol: b.eol, side: 'black', card: b.card, theme: b.theme },
        ],
        aiSeats: [],
        activeSides: [],
        eliminatedSides: [],
        turnSide: 'white',
        clocks: buildInitialClocks(chosenVariant),
        incrementSec: Math.max(0, chosenVariant.incrementSec || 0),
        moves: [],
        drawOfferFrom: null,
        status: 'waiting',
        winnerSide: null,
        createdAt: Date.now(),
      };
      rooms.set(roomId, room);
      roomByCode.set(code, roomId);
      launchOnlineRoom(room);
      return;
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Serve Stockfish worker files cleanly in both dev and production
  const sfPath = path.resolve(process.cwd(), 'node_modules/stockfish.js');
  if (fs.existsSync(sfPath)) {
    app.use('/stockfish', express.static(sfPath));
  }

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Profile sync & leaderboard
  app.post('/api/profile', (req, res) => {
    const body = req.body || {};
    const id = typeof body.id === 'string' ? body.id.slice(0, 64) : '';
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 32) : '';
    if (!id || !nickname) {
      res.status(400).json({ error: 'Profil invalide' });
      return;
    }
    const nickMod = validateFamilyFriendlyText(nickname, { blockLinks: true, label: 'Le pseudo' });
    if (!nickMod.ok) {
      res.status(400).json({ error: nickMod.reason });
      return;
    }
    const existing = db.profiles[id];
    const updated = {
      id,
      nickname,
      eol: typeof body.eol === 'number' ? Math.max(100, Math.round(body.eol)) : existing?.eol ?? 400,
      gamesPlayed: typeof body.gamesPlayed === 'number' ? Math.max(0, body.gamesPlayed) : existing?.gamesPlayed ?? 0,
      wins: typeof body.wins === 'number' ? Math.max(0, body.wins) : existing?.wins ?? 0,
      draws: typeof body.draws === 'number' ? Math.max(0, body.draws) : existing?.draws ?? 0,
      losses: typeof body.losses === 'number' ? Math.max(0, body.losses) : existing?.losses ?? 0,
      avatarColor: typeof body.avatarColor === 'string' ? body.avatarColor.slice(0, 16) : '#7ebcff',
      avatarSymbol: typeof body.avatarSymbol === 'string' ? body.avatarSymbol.slice(0, 4) : '♔',
      updatedAt: new Date().toISOString(),
    };
    db.profiles[id] = updated;
    persistDb();
    res.json(updated);
  });

  app.get('/api/leaderboard', (_req, res) => {
    const list = Object.values(db.profiles)
      .sort((a, b) => b.eol - a.eol)
      .slice(0, 50);
    res.json({ leaderboard: list });
  });

  // Public variants search (NEVER returns private/link-only or unsafe variants in public search)
  app.get('/api/variants', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const variants = db.variants.filter((v) => {
      if (v.visibility !== 'public') return false;
      if (
        !isContentFamilyFriendly(v.name, true) ||
        !isContentFamilyFriendly(v.creator, true) ||
        !isContentFamilyFriendly(v.description || '', true)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.creator.toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q)
      );
    });
    res.json({ variants });
  });

  // Get specific variant (allowed for public or link-shared; private only if creatorId query matches)
  app.get('/api/variants/:id', (req, res) => {
    const v = db.variants.find((item) => item.id === req.params.id);
    if (!v) {
      res.status(404).json({ error: 'Variante introuvable' });
      return;
    }
    const requesterId = typeof req.query.userId === 'string' ? req.query.userId : '';
    if (v.visibility === 'private' && v.creatorId !== requesterId) {
      res.status(403).json({ error: 'Variante privée' });
      return;
    }
    res.json({ variant: v });
  });

  // Variant lineage (origin, ancestors, derived branches)
  app.get('/api/variants/:id/lineage', (req, res) => {
    const current = db.variants.find((v) => v.id === req.params.id);
    if (!current) {
      res.json({ ancestors: [], branches: [] });
      return;
    }
    const ancestors: Variant[] = [];
    let cursor: Variant | undefined = current;
    const seen = new Set<string>([current.id]);
    while (cursor?.parentId) {
      const parent = db.variants.find((v) => v.id === cursor!.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      if (parent.visibility !== 'private') {
        ancestors.unshift(parent);
      }
      cursor = parent;
    }
    const branches = db.variants.filter(
      (v) => v.parentId === current.id && v.visibility === 'public'
    );
    res.json({ ancestors, branches });
  });

  // Create or update variant on server
  app.post('/api/variants', (req, res) => {
    const body = req.body as Variant;
    if (!body || typeof body.id !== 'string' || typeof body.name !== 'string' || !body.board) {
      res.status(400).json({ error: 'Données de variante invalides' });
      return;
    }
    if (body.visibility !== 'private') {
      const checks = [
        validateFamilyFriendlyText(body.name, { blockLinks: true, label: 'Le nom de la variante' }),
        validateFamilyFriendlyText(body.description || '', { blockLinks: true, label: 'La description' }),
        validateFamilyFriendlyText(body.rules || '', { blockLinks: true, label: 'Les règles' }),
        validateFamilyFriendlyText(body.goal || '', { blockLinks: true, label: 'L’objectif' }),
        validateFamilyFriendlyText(body.creator || '', { blockLinks: true, label: 'Le nom du créateur' }),
      ];
      const failed = checks.find((c) => !c.ok);
      if (failed) {
        res.status(400).json({ error: failed.reason });
        return;
      }
    }
    const controlledDifficulty = computeControlledDifficulty(body);
    const cleanVariant: Variant = {
      ...body,
      name: body.name.trim().slice(0, 80),
      description: (body.description || '').slice(0, 600),
      controlledDifficulty,
      commentsEnabled: body.commentsEnabled !== false,
      comments: Array.isArray(body.comments) ? body.comments : [],
      versions: Array.isArray(body.versions) ? body.versions : [],
    };

    const idx = db.variants.findIndex((v) => v.id === cleanVariant.id);
    if (idx >= 0) {
      const existing = db.variants[idx];
      if (existing.creatorId !== cleanVariant.creatorId) {
        res.status(403).json({ error: 'Non autorisé à modifier cette variante' });
        return;
      }
      cleanVariant.games = existing.games;
      cleanVariant.ratingSum = existing.ratingSum;
      cleanVariant.ratingCount = existing.ratingCount;
      cleanVariant.comments = existing.comments;
      db.variants[idx] = cleanVariant;
    } else {
      db.variants.unshift(cleanVariant);
    }
    persistDb();
    res.json({ variant: cleanVariant });
  });

  // Rate variant (1 rating per user per variant, overwritable)
  app.post('/api/variants/:id/rate', (req, res) => {
    const { userId, stars } = req.body || {};
    if (typeof userId !== 'string' || typeof stars !== 'number' || stars < 1 || stars > 5) {
      res.status(400).json({ error: 'Note invalide' });
      return;
    }
    const v = db.variants.find((item) => item.id === req.params.id);
    if (!v) {
      res.status(404).json({ error: 'Variante introuvable' });
      return;
    }
    if (!db.ratings[v.id]) db.ratings[v.id] = {};
    db.ratings[v.id][userId] = Math.round(stars);

    const allStars = Object.values(db.ratings[v.id]);
    v.ratingCount = allStars.length;
    v.ratingSum = allStars.reduce((acc, s) => acc + s, 0);
    persistDb();
    res.json({ ratingSum: v.ratingSum, ratingCount: v.ratingCount });
  });

  // Comments on variant
  app.post('/api/variants/:id/comments', (req, res) => {
    const { authorId, authorName, text } = req.body || {};
    if (typeof authorId !== 'string' || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'Commentaire vide' });
      return;
    }
    const textMod = validateFamilyFriendlyText(text, { blockLinks: true, label: 'Le commentaire' });
    if (!textMod.ok) {
      res.status(400).json({ error: textMod.reason });
      return;
    }
    const safeAuthorName =
      typeof authorName === 'string' &&
      authorName.trim() &&
      isContentFamilyFriendly(authorName.trim(), true)
        ? authorName.trim().slice(0, 32)
        : 'Joueur';
    const v = db.variants.find((item) => item.id === req.params.id);
    if (!v) {
      res.status(404).json({ error: 'Variante introuvable' });
      return;
    }
    if (!v.commentsEnabled) {
      res.status(403).json({ error: 'Commentaires désactivés par le créateur' });
      return;
    }
    v.comments = v.comments || [];
    v.comments.unshift({
      id: crypto.randomUUID(),
      authorId: authorId.slice(0, 64),
      authorName: safeAuthorName,
      text: text.trim().slice(0, 400),
      createdAt: new Date().toISOString(),
    });
    persistDb();
    res.json({ variant: v });
  });

  // Record completed game popularity & ÉOL update
  app.post('/api/games/record', (req, res) => {
    const { userId, variantId, playerEolAfter, result } = req.body || {};
    if (typeof variantId === 'string') {
      const v = db.variants.find((item) => item.id === variantId);
      if (v) {
        v.games = (v.games || 0) + 1;
      }
    }
    if (typeof userId === 'string' && db.profiles[userId]) {
      const p = db.profiles[userId];
      if (typeof playerEolAfter === 'number') {
        p.eol = Math.max(100, Math.round(playerEolAfter));
      }
      if (result === 'win' || result === 'loss' || result === 'draw') {
        p.gamesPlayed += 1;
        if (result === 'win') p.wins += 1;
        else if (result === 'loss') p.losses += 1;
        else p.draws += 1;
      }
      p.updatedAt = new Date().toISOString();
    }
    persistDb();
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  // Periodic 1s tick: matchmaking + authoritative active room clocks + 5-min disconnect countdown
  let tickCount = 0;
  const mmTimer = setInterval(() => {
    tickCount += 1;
    if (matchmakingQueue.length >= 2) {
      tryMatchQueue();
    }

    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.status !== 'active') continue;

      // 1. Authoritative clock continues running even if player left the app
      if ((room.variant.duration || 0) > 0 && room.turnSide) {
        room.clocks[room.turnSide] = Math.max(0, (room.clocks[room.turnSide] ?? 0) - 1);
        if (room.clocks[room.turnSide] <= 0) {
          const timedOutSide = room.turnSide;
          if (!room.eliminatedSides.includes(timedOutSide)) {
            room.eliminatedSides.push(timedOutSide);
          }
          const aliveSides = room.activeSides.filter((s) => !room.eliminatedSides.includes(s));
          const winnerSide: PlayerSide =
            aliveSides[0] || (timedOutSide === 'white' ? 'black' : 'white');
          if (aliveSides.length <= 1) {
            room.status = 'finished';
            room.winnerSide = winnerSide;
          } else {
            room.turnSide = aliveSides[0];
          }
          for (const p of room.players) {
            if (!p.disconnectedAt) {
              safeSend(p.ws, {
                type: 'game:timeout',
                timedOutSide,
                winnerSide,
              });
            }
          }
          continue;
        }
      }

      // 2. Check 5-minute disconnect grace period for absent players
      let changedGrace = false;
      for (const p of room.players) {
        if (p.disconnectedAt && !p.eliminated && now - p.disconnectedAt >= RECONNECT_GRACE_MS) {
          p.disconnectedAt = null;
          p.eliminated = true;
          changedGrace = true;
          if (!room.eliminatedSides.includes(p.side)) {
            room.eliminatedSides.push(p.side);
          }
          const aliveSides = room.activeSides.filter((s) => !room.eliminatedSides.includes(s));
          if (aliveSides.length <= 1) {
            room.status = 'finished';
            room.winnerSide = aliveSides[0] || 'draw';
          } else if (room.turnSide === p.side) {
            room.turnSide = aliveSides[0];
          }
          for (const other of room.players) {
            if (other.userId !== p.userId && !other.disconnectedAt) {
              safeSend(other.ws, {
                type: 'game:opponent_resigned',
                resignedSide: p.side,
                autoDisconnect: true,
                reason: `Abandon automatique de ${p.nickname} (déconnexion de 5 minutes).`,
              });
            }
          }
        }
      }

      // 3. Broadcast live countdown every second when any opponent is absent
      const disconnected = getDisconnectedSummary(room);
      if (room.status === 'active' && (disconnected.length > 0 || changedGrace)) {
        for (const p of room.players) {
          if (!p.disconnectedAt) {
            safeSend(p.ws, {
              type: 'room:disconnect_countdown',
              disconnectedPlayers: disconnected,
            });
          }
        }
      }

      // 4. Keep clocks synced across clients every 5 seconds
      if (room.status === 'active' && tickCount % 5 === 0 && (room.variant.duration || 0) > 0) {
        for (const p of room.players) {
          if (!p.disconnectedAt) {
            safeSend(p.ws, {
              type: 'room:clocks_sync',
              clocks: room.clocks,
              turnSide: room.turnSide,
            });
          }
        }
      }
    }
  }, 1000);
  server.on('close', () => clearInterval(mmTimer));

  wss.on('connection', (ws) => {
    let boundRoomId: string | null = null;
    let boundUserId: string | null = null;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      const sanitizeNick = (rawNick: unknown, fallback: string) => {
        const s = String(rawNick || fallback).trim().slice(0, 32) || fallback;
        return isContentFamilyFriendly(s, true) ? s : fallback;
      };
      if (type === 'presence:hello') {
        const userId = String(msg.userId || '');
        if (userId) {
          if (boundUserId && boundUserId !== userId) {
            unregisterOnlineSocket(boundUserId, ws);
          }
          boundUserId = userId;
          registerOnlineSocket(userId, ws);
        }
      } else if (type === 'presence:query') {
        const ids = Array.isArray(msg.userIds) ? msg.userIds.slice(0, 100) : [];
        const online: Record<string, boolean> = {};
        for (const id of ids) {
          const uid = String(id || '');
          const sockets = onlineUsers.get(uid);
          online[uid] = Boolean(
            sockets && Array.from(sockets).some((s) => s.readyState === WebSocket.OPEN)
          );
        }
        safeSend(ws, { type: 'presence:status', online });
      } else if (type === 'friend:request') {
        const toUid = String(msg.toUid || '');
        if (toUid && msg.request) {
          sendToUser(toUid, { type: 'friend:request_received', request: msg.request });
        }
      } else if (type === 'friend:response') {
        const toUid = String(msg.toUid || '');
        if (toUid) {
          sendToUser(toUid, {
            type: 'friend:response_received',
            accepted: Boolean(msg.accepted),
            fromUid: msg.fromUid,
            friend: msg.friend,
          });
        }
      } else if (type === 'friend:invite_game') {
        const toUid = String(msg.toUid || '');
        if (toUid && msg.invite) {
          sendToUser(toUid, { type: 'friend:game_invite_received', invite: msg.invite });
        }
      } else if (type === 'matchmaking:join') {
        const userId = String(msg.userId || '');
        const nickname = sanitizeNick(msg.nickname, 'Joueur');
        const eol = Number(msg.eol || 400);
        const mode = msg.mode === 'random' ? 'random' : 'specific';
        const competitive = msg.competitive !== false;
        const variantId = typeof msg.variantId === 'string' ? msg.variantId : null;
        const variantSnapshot = msg.variantSnapshot as Variant | undefined;
        const theme = msg.theme as QueueEntry['theme'];
        const card = (msg.card as CardMeta | undefined) || undefined;
        boundUserId = userId;
        registerOnlineSocket(userId, ws);

        matchmakingQueue = matchmakingQueue.filter((q) => q.userId !== userId && q.ws !== ws);
        matchmakingQueue.push({
          ws,
          userId,
          nickname,
          eol,
          mode,
          competitive,
          variantId,
          variantSnapshot,
          joinedAt: Date.now(),
          card,
          theme,
        });
        safeSend(ws, { type: 'matchmaking:queued' });
        tryMatchQueue();
      } else if (type === 'matchmaking:leave') {
        matchmakingQueue = matchmakingQueue.filter((q) => q.ws !== ws);
      } else if (type === 'room:create') {
        const userId = String(msg.userId || '');
        const nickname = sanitizeNick(msg.nickname, 'Hôte');
        const eol = Number(msg.eol || 400);
        const competitive = msg.competitive !== false;
        const variant = msg.variant as Variant;
        const theme = msg.theme as PlayerConn['theme'];
        const card = (msg.card as CardMeta | undefined) || undefined;
        if (!variant) return;
        boundUserId = userId;
        registerOnlineSocket(userId, ws);

        const roomId = crypto.randomUUID();
        const code = generateRoomCode();
        const targetPlayers = Math.max(2, Math.min(6, variant.players || 2));
        const room: OnlineRoom = {
          roomId,
          code,
          variant,
          competitive,
          targetPlayers,
          hostUserId: userId,
          players: [{ ws, userId, nickname, eol, side: 'white', card, theme }],
          aiSeats: [],
          activeSides: [],
          eliminatedSides: [],
          turnSide: 'white',
          clocks: buildInitialClocks(variant),
          incrementSec: Math.max(0, variant.incrementSec || 0),
          moves: [],
          drawOfferFrom: null,
          status: 'waiting',
          winnerSide: null,
          createdAt: Date.now(),
        };
        rooms.set(roomId, room);
        roomByCode.set(code, roomId);
        boundRoomId = roomId;
        safeSend(ws, {
          type: 'room:created',
          roomId,
          code,
          competitive,
          targetPlayers,
          hostUserId: room.hostUserId,
          players: room.players.map((p) => ({
            userId: p.userId,
            nickname: p.nickname,
            eol: p.eol,
          })),
        });
      } else if (type === 'room:join') {
        const code = String(msg.code || '').trim().toUpperCase();
        const userId = String(msg.userId || '');
        const nickname = sanitizeNick(msg.nickname, 'Invité');
        const eol = Number(msg.eol || 400);
        const theme = msg.theme as PlayerConn['theme'];
        const card = (msg.card as CardMeta | undefined) || undefined;
        boundUserId = userId;
        registerOnlineSocket(userId, ws);

        const roomId = roomByCode.get(code);
        const room = roomId ? rooms.get(roomId) : undefined;
        if (!room) {
          safeSend(ws, { type: 'room:error', message: 'Code de salle introuvable.' });
          return;
        }
        if (room.status !== 'waiting' || room.players.length >= room.targetPlayers) {
          safeSend(ws, {
            type: 'room:error',
            message: 'Cette salle est déjà complète ou déjà lancée.',
          });
          return;
        }

        const existingPlayer = room.players.find((p) => p.userId === userId);
        if (existingPlayer) {
          existingPlayer.ws = ws;
          existingPlayer.card = card;
        } else {
          const guest: PlayerConn = { ws, userId, nickname, eol, side: 'black', card, theme };
          room.players.push(guest);
        }
        boundRoomId = room.roomId;

        if (room.players.length >= room.targetPlayers) {
          launchOnlineRoom(room);
        } else {
          const lobbyPayload = {
            type: 'room:lobby_update',
            roomId: room.roomId,
            code: room.code,
            competitive: room.competitive,
            targetPlayers: room.targetPlayers,
            hostUserId: room.hostUserId,
            variant: room.variant,
            players: room.players.map((p) => ({
              userId: p.userId,
              nickname: p.nickname,
              eol: p.eol,
            })),
          };
          for (const p of room.players) {
            safeSend(p.ws, lobbyPayload);
          }
        }
      } else if (type === 'room:start_with_ai') {
        const roomId = String(msg.roomId || boundRoomId || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'waiting') return;
        if (room.hostUserId !== boundUserId) return;
        const aiLevels = Array.isArray(msg.aiLevels)
          ? (msg.aiLevels.map((n) => Number(n)) as number[])
          : undefined;
        launchOnlineRoom(room, aiLevels);
      } else if (type === 'room:reconnect') {
        const reqRoomId = String(msg.roomId || '');
        const reqCode = String(msg.code || '').trim().toUpperCase();
        const userId = String(msg.userId || '');
        const resolvedId = reqRoomId || (reqCode ? roomByCode.get(reqCode) || '' : '');
        const room = resolvedId ? rooms.get(resolvedId) : undefined;
        if (!room || room.status !== 'active') {
          safeSend(ws, { type: 'room:reconnect_expired' });
          return;
        }
        const player = room.players.find((p) => p.userId === userId && !p.eliminated);
        if (!player) {
          safeSend(ws, { type: 'room:reconnect_expired' });
          return;
        }
        player.ws = ws;
        player.disconnectedAt = null;
        boundRoomId = room.roomId;
        boundUserId = userId;

        const participants: OnlineHumanSeat[] = room.players.map((p) => ({
          userId: p.userId,
          nickname: p.nickname,
          eol: p.eol,
          side: p.side,
          avatarColor: p.card?.avatarColor,
          avatarSymbol: p.card?.avatarSymbol,
          title: p.card?.title,
          streakPieceSymbol: p.card?.streakPieceSymbol,
          streakPieceLabel: p.card?.streakPieceLabel,
          battleCardStyle: p.card?.battleCardStyle,
          theme: p.theme,
        }));
        const firstOther = room.players.find((other) => other.userId !== userId);
        const oppFallback = firstOther
          ? {
              userId: firstOther.userId,
              nickname: firstOther.nickname,
              eol: firstOther.eol,
              avatarColor: firstOther.card?.avatarColor,
              avatarSymbol: firstOther.card?.avatarSymbol,
              title: firstOther.card?.title,
              streakPieceSymbol: firstOther.card?.streakPieceSymbol,
              streakPieceLabel: firstOther.card?.streakPieceLabel,
              battleCardStyle: firstOther.card?.battleCardStyle,
              theme: firstOther.theme,
            }
          : {
              userId: 'ai_companion',
              nickname: room.aiSeats[0]?.nickname || 'IA Chess Lab',
              eol: room.aiSeats[0]?.approxEol || 400,
            };
        const disconnected = getDisconnectedSummary(room);

        safeSend(ws, {
          type: 'room:state_sync',
          roomId: room.roomId,
          code: room.code,
          yourSide: player.side,
          competitive: room.competitive,
          variant: room.variant,
          opponent: oppFallback,
          participants,
          aiSeats: room.aiSeats,
          hostUserId: room.hostUserId,
          moves: room.moves,
          clocks: room.clocks,
          turnSide: room.turnSide,
          eliminatedSides: room.eliminatedSides,
          disconnectedPlayers: disconnected,
        });

        for (const other of room.players) {
          if (other.userId !== userId && !other.disconnectedAt) {
            safeSend(other.ws, {
              type: 'room:player_reconnected',
              userId: player.userId,
              nickname: player.nickname,
              side: player.side,
              disconnectedPlayers: disconnected,
            });
          }
        }
      } else if (type === 'game:move') {
        const roomId = String(msg.roomId || boundRoomId || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;
        const movingSide = room.turnSide;
        room.moves.push(msg.move);
        room.drawOfferFrom = null;

        if ((room.variant.duration || 0) > 0 && room.incrementSec > 0 && msg.turnFinished !== false) {
          room.clocks[movingSide] = (room.clocks[movingSide] || 0) + room.incrementSec;
        }
        if (Array.isArray(msg.eliminatedSides)) {
          room.eliminatedSides = (msg.eliminatedSides as PlayerSide[]).filter((s) =>
            VALID_SIDES.includes(s)
          );
        }
        if (typeof msg.nextTurnSide === 'string' && VALID_SIDES.includes(msg.nextTurnSide as PlayerSide)) {
          room.turnSide = msg.nextTurnSide as PlayerSide;
        }
        if (msg.winner) {
          room.status = 'finished';
          room.winnerSide = String(msg.winner);
        }

        for (const p of room.players) {
          if (p.ws !== ws && !p.disconnectedAt) {
            safeSend(p.ws, {
              type: 'game:move',
              move: msg.move,
              fromUserId: boundUserId,
              clocks: room.clocks,
              turnSide: room.turnSide,
            });
          }
        }
      } else if (type === 'game:offer_draw') {
        const roomId = String(msg.roomId || boundRoomId || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;
        room.drawOfferFrom = boundUserId;
        for (const p of room.players) {
          if (p.ws !== ws) {
            safeSend(p.ws, { type: 'game:draw_offered', fromUserId: boundUserId });
          }
        }
      } else if (type === 'game:respond_draw') {
        const roomId = String(msg.roomId || boundRoomId || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;
        const accepted = Boolean(msg.accepted);
        if (accepted) {
          room.status = 'finished';
          room.winnerSide = 'draw';
        } else {
          room.drawOfferFrom = null;
        }
        for (const p of room.players) {
          safeSend(p.ws, { type: 'game:draw_response', accepted });
        }
      } else if (type === 'game:resign') {
        const roomId = String(msg.roomId || boundRoomId || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;
        if (room.players.length <= 2 && room.aiSeats.length === 0) {
          room.status = 'finished';
        }
        const resigner = room.players.find((p) => p.ws === ws || p.userId === boundUserId);
        if (resigner) {
          resigner.eliminated = true;
          resigner.disconnectedAt = null;
        }
        for (const p of room.players) {
          if (p.ws !== ws && !p.disconnectedAt) {
            safeSend(p.ws, {
              type: 'game:opponent_resigned',
              resignedSide: resigner?.side || 'white',
            });
          }
        }
      } else if (type === 'game:timeout') {
        const roomId = String(msg.roomId || boundRoomId || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;
        const rawSide = String(msg.timedOutSide || 'white') as PlayerSide;
        const timedOutSide: PlayerSide = VALID_SIDES.includes(rawSide) ? rawSide : 'white';
        const activeSides = getVariantActiveSides(room.variant);
        const remainingHumanOrAi = activeSides.filter((s) => s !== timedOutSide);
        const winnerSide: PlayerSide = remainingHumanOrAi[0] || (timedOutSide === 'white' ? 'black' : 'white');
        if (activeSides.length <= 2) {
          room.status = 'finished';
          room.winnerSide = winnerSide;
        }
        for (const p of room.players) {
          if (!p.disconnectedAt) {
            safeSend(p.ws, {
              type: 'game:timeout',
              timedOutSide,
              winnerSide,
            });
          }
        }
      }
    });

    ws.on('close', () => {
      unregisterOnlineSocket(boundUserId, ws);
      matchmakingQueue = matchmakingQueue.filter((q) => q.ws !== ws);
      if (boundRoomId) {
        const room = rooms.get(boundRoomId);
        if (room && room.status === 'active') {
          const leaving = room.players.find((p) => p.ws === ws);
          if (leaving && !leaving.eliminated) {
            leaving.disconnectedAt = Date.now();
          }
          const alive = room.players.filter(
            (p) => p.ws !== ws && !p.disconnectedAt && p.ws.readyState === WebSocket.OPEN
          );
          if (room.hostUserId === boundUserId && alive.length > 0) {
            room.hostUserId = alive[0].userId;
            for (const p of alive) {
              safeSend(p.ws, { type: 'room:host_changed', hostUserId: room.hostUserId });
            }
          }
          const disconnected = getDisconnectedSummary(room);
          for (const p of alive) {
            safeSend(p.ws, {
              type: 'room:disconnect_countdown',
              disconnectedPlayers: disconnected,
            });
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        ws: {
          server,
          path: '/__vite_ws',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Chess Lab server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

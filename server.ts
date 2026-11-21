import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { getStarterVariants } from './src/utils/defaultVariants.ts';
import { computeControlledDifficulty } from './src/engine/eol.ts';
import { isContentFamilyFriendly, validateFamilyFriendlyText } from './src/utils/moderation.ts';
import type { Variant } from './src/types/chess.ts';

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
interface PlayerConn {
  ws: WebSocket;
  userId: string;
  nickname: string;
  eol: number;
  side: 'white' | 'black';
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
  players: PlayerConn[];
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
  variantId: string | null;
  variantSnapshot?: Variant;
  joinedAt: number;
  theme?: {
    boardTexture?: string;
    boardLight?: string;
    boardDark?: string;
  };
}

const rooms = new Map<string, OnlineRoom>();
const roomByCode = new Map<string, string>();
let matchmakingQueue: QueueEntry[] = [];

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

function tryMatchQueue() {
  if (matchmakingQueue.length < 2) return;
  const now = Date.now();

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
        (a.mode === 'random' && b.mode === 'random') ||
        (a.mode === 'specific' && b.mode === 'specific' && a.variantId === b.variantId) ||
        (a.mode === 'specific' && b.mode === 'random') ||
        (a.mode === 'random' && b.mode === 'specific');

      if (!compatible) continue;

      const waitSec = Math.max((now - a.joinedAt) / 1000, (now - b.joinedAt) / 1000);
      const maxGap = waitSec > 4 ? 1000 : 250;
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
      const firstIsWhite = crypto.randomInt(0, 2) === 0;
      const sideA: 'white' | 'black' = firstIsWhite ? 'white' : 'black';
      const sideB: 'white' | 'black' = firstIsWhite ? 'black' : 'white';

      const room: OnlineRoom = {
        roomId,
        code,
        variant: chosenVariant,
        players: [
          { ws: a.ws, userId: a.userId, nickname: a.nickname, eol: a.eol, side: sideA, theme: a.theme },
          { ws: b.ws, userId: b.userId, nickname: b.nickname, eol: b.eol, side: sideB, theme: b.theme },
        ],
        moves: [],
        drawOfferFrom: null,
        status: 'active',
        winnerSide: null,
        createdAt: Date.now(),
      };
      rooms.set(roomId, room);
      roomByCode.set(code, roomId);

      safeSend(a.ws, {
        type: 'match:found',
        roomId,
        code,
        yourSide: sideA,
        variant: chosenVariant,
        opponent: { userId: b.userId, nickname: b.nickname, eol: b.eol, theme: b.theme },
      });
      safeSend(b.ws, {
        type: 'match:found',
        roomId,
        code,
        yourSide: sideB,
        variant: chosenVariant,
        opponent: { userId: a.userId, nickname: a.nickname, eol: a.eol, theme: a.theme },
      });
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
      if (type === 'matchmaking:join') {
        const userId = String(msg.userId || '');
        const nickname = sanitizeNick(msg.nickname, 'Joueur');
        const eol = Number(msg.eol || 400);
        const mode = msg.mode === 'random' ? 'random' : 'specific';
        const variantId = typeof msg.variantId === 'string' ? msg.variantId : null;
        const variantSnapshot = msg.variantSnapshot as Variant | undefined;
        const theme = msg.theme as QueueEntry['theme'];
        boundUserId = userId;

        matchmakingQueue = matchmakingQueue.filter((q) => q.userId !== userId && q.ws !== ws);
        matchmakingQueue.push({
          ws,
          userId,
          nickname,
          eol,
          mode,
          variantId,
          variantSnapshot,
          joinedAt: Date.now(),
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
        const variant = msg.variant as Variant;
        const theme = msg.theme as PlayerConn['theme'];
        if (!variant) return;
        boundUserId = userId;

        const roomId = crypto.randomUUID();
        const code = generateRoomCode();
        const room: OnlineRoom = {
          roomId,
          code,
          variant,
          players: [{ ws, userId, nickname, eol, side: 'white', theme }],
          moves: [],
          drawOfferFrom: null,
          status: 'waiting',
          winnerSide: null,
          createdAt: Date.now(),
        };
        rooms.set(roomId, room);
        roomByCode.set(code, roomId);
        boundRoomId = roomId;
        safeSend(ws, { type: 'room:created', roomId, code, yourSide: 'white' });
      } else if (type === 'room:join') {
        const code = String(msg.code || '').trim().toUpperCase();
        const userId = String(msg.userId || '');
        const nickname = sanitizeNick(msg.nickname, 'Invité');
        const eol = Number(msg.eol || 400);
        const theme = msg.theme as PlayerConn['theme'];
        boundUserId = userId;

        const roomId = roomByCode.get(code);
        const room = roomId ? rooms.get(roomId) : undefined;
        if (!room) {
          safeSend(ws, { type: 'room:error', message: 'Code de salle introuvable.' });
          return;
        }
        if (room.players.length >= 2) {
          safeSend(ws, { type: 'room:error', message: 'Cette salle est déjà complète.' });
          return;
        }
        const host = room.players[0];
        const guest: PlayerConn = { ws, userId, nickname, eol, side: 'black', theme };
        room.players.push(guest);
        room.status = 'active';
        boundRoomId = room.roomId;

        safeSend(host.ws, {
          type: 'match:found',
          roomId: room.roomId,
          code: room.code,
          yourSide: 'white',
          variant: room.variant,
          opponent: { userId: guest.userId, nickname: guest.nickname, eol: guest.eol, theme: guest.theme },
        });
        safeSend(guest.ws, {
          type: 'match:found',
          roomId: room.roomId,
          code: room.code,
          yourSide: 'black',
          variant: room.variant,
          opponent: { userId: host.userId, nickname: host.nickname, eol: host.eol, theme: host.theme },
        });
      } else if (type === 'game:move') {
        const roomId = String(msg.roomId || boundRoomId || '');
        const room = rooms.get(roomId);
        if (!room || room.status !== 'active') return;
        room.moves.push(msg.move);
        room.drawOfferFrom = null;
        for (const p of room.players) {
          if (p.ws !== ws) {
            safeSend(p.ws, { type: 'game:move', move: msg.move, fromUserId: boundUserId });
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
        room.status = 'finished';
        const resigner = room.players.find((p) => p.ws === ws);
        for (const p of room.players) {
          if (p.ws !== ws) {
            safeSend(p.ws, {
              type: 'game:opponent_resigned',
              resignedSide: resigner?.side || 'white',
            });
          }
        }
      }
    });

    ws.on('close', () => {
      matchmakingQueue = matchmakingQueue.filter((q) => q.ws !== ws);
      if (boundRoomId) {
        const room = rooms.get(boundRoomId);
        if (room && room.status === 'active') {
          for (const p of room.players) {
            if (p.ws !== ws) {
              safeSend(p.ws, { type: 'game:opponent_disconnected' });
            }
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

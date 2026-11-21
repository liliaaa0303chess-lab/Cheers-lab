import { makeDefaultBoard, makeStandardSetup } from '../engine/chessEngine.ts';
import type { PieceDef, Variant } from '../types/chess.ts';

export const STARTER_PIECES: PieceDef[] = [
  {
    id: 'piece_sentinel',
    name: 'Sentinelle',
    symbol: '★',
    moves: {
      rook: false,
      bishop: true,
      knight: true,
      king: false,
      pawn: false,
      maxRange: 3,
      canJump: false,
    },
    customMoves: 'Portée 3 en diagonale + saut de Cavalier',
    powerType: 'shield',
    powers: 'Active un bouclier qui bloque la prochaine capture subie.',
    conditions: 'Disponible une fois par pièce',
    limits: 1,
    limitsText: '1 utilisation par partie',
    texture: 'metal',
    light: '#f8f9fc',
    dark: '#1d2430',
    description: 'Pièce hybride Fou limité + Cavalier dotée d’un bouclier défensif.',
  },
  {
    id: 'piece_chrono',
    name: 'Chronomage',
    symbol: '⚡',
    moves: {
      rook: true,
      bishop: false,
      knight: false,
      king: true,
      pawn: false,
      maxRange: 3,
      canJump: false,
    },
    customMoves: 'Tour (portée 3) + pas du Roi',
    powerType: 'teleport',
    powers: 'Téléportation sur n’importe quelle case libre du plateau.',
    conditions: 'Utilisable au tour du joueur',
    limits: 2,
    limitsText: '2 utilisations par partie',
    texture: 'marble',
    light: '#f8f9fc',
    dark: '#1d2430',
    description: 'Pièce tactique capable de se téléporter sur le plateau.',
  },
];

export function getStarterVariants(): Variant[] {
  const classicBoard = makeDefaultBoard(8, 8);
  const classicSetup = makeStandardSetup();

  // Échecs du Chaos : plateau 8x8 avec cases spéciales téléportation et pièces personnalisées
  const chaosBoard = makeDefaultBoard(8, 8);
  chaosBoard.texture = 'marble';
  chaosBoard.special = [27, 28, 35, 36];
  chaosBoard.specialEffectType = 'teleport';
  chaosBoard.specialEffect = 'Les 4 cases centrales téléportent la pièce vers une autre case ✦ libre.';
  const chaosSetup = makeStandardSetup();
  chaosSetup[3] = 'piece_chrono|black';
  chaosSetup[59] = 'piece_chrono|white';
  chaosSetup[1] = 'piece_sentinel|black';
  chaosSetup[6] = 'piece_sentinel|black';
  chaosSetup[57] = 'piece_sentinel|white';
  chaosSetup[62] = 'piece_sentinel|white';

  // Mini-Échecs 6x6
  const miniBoard = makeDefaultBoard(6, 6);
  miniBoard.texture = 'wood';
  const miniSetup: Record<number, string> = {
    0: 'builtin:R|black',
    1: 'builtin:N|black',
    2: 'builtin:Q|black',
    3: 'builtin:K|black',
    4: 'builtin:B|black',
    5: 'builtin:R|black',
    6: 'builtin:P|black',
    7: 'builtin:P|black',
    8: 'builtin:P|black',
    9: 'builtin:P|black',
    10: 'builtin:P|black',
    11: 'builtin:P|black',
    24: 'builtin:P|white',
    25: 'builtin:P|white',
    26: 'builtin:P|white',
    27: 'builtin:P|white',
    28: 'builtin:P|white',
    29: 'builtin:P|white',
    30: 'builtin:R|white',
    31: 'builtin:N|white',
    32: 'builtin:Q|white',
    33: 'builtin:K|white',
    34: 'builtin:B|white',
    35: 'builtin:R|white',
  };

  // Forteresse : plateau non rectangulaire avec cases bloquées et Roi de la colline
  const fortBoard = makeDefaultBoard(8, 8);
  fortBoard.texture = 'stone';
  fortBoard.cells[0] = 0;
  fortBoard.cells[7] = 0;
  fortBoard.cells[56] = 0;
  fortBoard.cells[63] = 0;
  fortBoard.blocked = [18, 21, 42, 45];
  fortBoard.special = [27, 28, 35, 36];
  fortBoard.specialEffectType = 'king_hill';
  fortBoard.specialEffect = 'Atteindre une des 4 cases centrales ✦ avec votre Roi offre la victoire immédiate.';
  const fortSetup: Record<number, string> = {
    1: 'builtin:N|black',
    2: 'builtin:B|black',
    3: 'builtin:Q|black',
    4: 'builtin:K|black',
    5: 'builtin:B|black',
    6: 'builtin:N|black',
    9: 'builtin:P|black',
    10: 'builtin:P|black',
    11: 'builtin:P|black',
    12: 'builtin:P|black',
    13: 'builtin:P|black',
    14: 'builtin:P|black',
    49: 'builtin:P|white',
    50: 'builtin:P|white',
    51: 'builtin:P|white',
    52: 'builtin:P|white',
    53: 'builtin:P|white',
    54: 'builtin:P|white',
    57: 'builtin:N|white',
    58: 'builtin:B|white',
    59: 'builtin:Q|white',
    60: 'builtin:K|white',
    61: 'builtin:B|white',
    62: 'builtin:N|white',
  };

  return [
    {
      id: 'var_classic_8x8',
      name: 'Échecs Classiques',
      description: 'Les échecs traditionnels 8×8 compatibles avec le moteur Stockfish.',
      visibility: 'public',
      players: 2,
      difficulty: 'Très simple',
      controlledDifficulty: 'Très simple',
      victoryType: 'checkmate_or_king',
      goal: 'Mettre le Roi adverse échec et mat.',
      actions: 1,
      duration: 10,
      turnOrder: 'Blancs puis Noirs',
      rules: 'Règles officielles : roque, prise en passant et promotion inclus.',
      board: classicBoard,
      pieces: [],
      customPieceDefs: [],
      setup: classicSetup,
      createdAt: '2026-01-01T10:00:00.000Z',
      creatorId: 'system_chesslab',
      creator: 'Chess Lab',
      games: 142,
      ratingSum: 672,
      ratingCount: 140,
      commentsEnabled: true,
      comments: [],
      versions: [{ version: 1, date: '2026-01-01T10:00:00.000Z', summary: 'Version standard', author: 'Chess Lab' }],
    },
    {
      id: 'var_chaos_chess',
      name: 'Échecs du Chaos',
      description: 'Variante tactique avec Sentinelles à bouclier, Chronomages téléporteurs et cases portails.',
      visibility: 'public',
      players: 2,
      difficulty: 'Complexe',
      controlledDifficulty: 'Complexe',
      victoryType: 'checkmate_or_king',
      goal: 'Capturer ou mater le Roi adverse en exploitant les portails et pouvoirs.',
      actions: 1,
      duration: 15,
      turnOrder: 'Blancs puis Noirs',
      rules: 'Les Sentinelles (★) activent un bouclier. Les Chronomages (⚡) peuvent se téléporter. Les 4 cases centrales ✦ téléportent.',
      board: chaosBoard,
      pieces: ['piece_sentinel', 'piece_chrono'],
      customPieceDefs: STARTER_PIECES,
      setup: chaosSetup,
      createdAt: '2026-02-12T14:30:00.000Z',
      creatorId: 'creator_x',
      creator: 'Architecte_X',
      games: 38,
      ratingSum: 171,
      ratingCount: 36,
      commentsEnabled: true,
      comments: [
        {
          id: 'c_seed_1',
          authorId: 'u_seed',
          authorName: 'Stratège_N',
          text: 'Les portails centraux rendent l’ouverture très dynamique !',
          createdAt: '2026-03-01T18:00:00.000Z',
        },
      ],
      versions: [{ version: 1, date: '2026-02-12T14:30:00.000Z', summary: 'Publication initiale', author: 'Architecte_X' }],
    },
    {
      id: 'var_mini_6x6',
      name: 'Mini-Échecs 6×6',
      description: 'Parties rapides sur plateau bois 6×6, idéales sur mobile.',
      visibility: 'public',
      players: 2,
      difficulty: 'Simple',
      controlledDifficulty: 'Simple',
      victoryType: 'checkmate_or_king',
      goal: 'Mettre le Roi adverse échec et mat sur un plateau réduit.',
      actions: 1,
      duration: 5,
      turnOrder: 'Blancs puis Noirs',
      rules: 'Pas de roque, pions avancent de 1 ou 2 cases au premier coup et promeuvent en Dame.',
      board: miniBoard,
      pieces: [],
      customPieceDefs: [],
      setup: miniSetup,
      createdAt: '2026-03-05T09:15:00.000Z',
      creatorId: 'system_chesslab',
      creator: 'Chess Lab',
      games: 64,
      ratingSum: 288,
      ratingCount: 64,
      commentsEnabled: true,
      comments: [],
      versions: [{ version: 1, date: '2026-03-05T09:15:00.000Z', summary: 'Format compact 6×6', author: 'Chess Lab' }],
    },
    {
      id: 'var_forteresse',
      name: 'Forteresse Royale',
      description: 'Plateau octogonal avec piliers bloqués et objectif Roi de la colline au centre.',
      visibility: 'public',
      players: 2,
      difficulty: 'Moyenne',
      controlledDifficulty: 'Moyenne',
      victoryType: 'king_of_hill',
      goal: 'Mater le Roi adverse OU amener votre Roi sur une des 4 cases centrales ✦.',
      actions: 1,
      duration: 12,
      turnOrder: 'Blancs puis Noirs',
      rules: 'Les coins sont supprimés et 4 piliers bloquent les diagonales directes.',
      board: fortBoard,
      pieces: [],
      customPieceDefs: [],
      setup: fortSetup,
      createdAt: '2026-04-02T11:00:00.000Z',
      creatorId: 'creator_luna',
      creator: 'Luna_Tactique',
      games: 29,
      ratingSum: 132,
      ratingCount: 28,
      commentsEnabled: true,
      comments: [],
      versions: [{ version: 1, date: '2026-04-02T11:00:00.000Z', summary: 'Création Forteresse', author: 'Luna_Tactique' }],
    },
  ];
}

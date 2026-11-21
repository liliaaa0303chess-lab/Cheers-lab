import React, { useMemo, useState } from 'react';
import { ArrowLeft, FlaskConical, Trash2, Edit3, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  createInitialGameState,
  explainBlockedMove,
  getLegalMovesForSquare,
  makeDefaultBoard,
  type BoardPieceInstance,
} from '../engine/chessEngine';
import { parsePieceTextConfig } from '../engine/ruleParser';
import type {
  AppSettings,
  BoardConfig,
  PieceDef,
  PieceTexture,
  SpecialPowerType,
  Variant,
} from '../types/chess';
import { ChessBoard } from './ChessBoard';
import { validateFamilyFriendlyText } from '../utils/moderation';

interface PieceCreatorProps {
  pieces: PieceDef[];
  currentVariantBoard?: BoardConfig;
  currentVariant?: Variant;
  settings: AppSettings;
  onSavePiece: (piece: PieceDef) => void;
  onDeletePiece: (pieceId: string) => void;
  onBack?: () => void;
  onNotify: (msg: string) => void;
}

const SYMBOLS = [
  '★', '⚡', '✦', '⬟', '☄', '☯', '●', '◆',
  '♖', '♗', '♘', '♕', '♔', '♙',
  '♜', '♝', '♞', '♛', '♚', '♟',
];

const POWER_OPTIONS: { value: SpecialPowerType; label: string }[] = [
  { value: 'none', label: 'Aucun pouvoir spécial' },
  { value: 'teleport', label: 'Téléportation (case libre)' },
  { value: 'invisibility', label: 'Invisibilité (2 tours)' },
  { value: 'shield', label: 'Bouclier (absorbe 1 capture)' },
  { value: 'transform', label: 'Transformation (en Dame)' },
  { value: 'duplicate', label: 'Duplication (case adjacente)' },
  { value: 'manipulate', label: 'Manipulation (repousser pièce adjacente)' },
  { value: 'custom', label: 'Autre pouvoir personnalisé (décrit en texte)' },
];

const CUSTOM_MOVE_CHIPS = [
  'Amazone',
  'Chameau',
  'Zèbre',
  'Noctambule',
  'Portée 3',
  'Peut sauter',
];

const CONDITION_CHIPS = [
  'Hors échec',
  'Sur case spéciale',
  'Après le 3e tour',
  "Avant d'avoir bougé",
];

const EMPTY_FORM = (): PieceDef => ({
  id: '',
  name: '',
  symbol: '★',
  moves: {
    rook: false,
    bishop: false,
    knight: false,
    king: false,
    pawn: false,
    maxRange: 0,
    canJump: false,
    forwardOnly: false,
    noCapture: false,
  },
  customMoves: '',
  powerType: 'none',
  powers: '',
  conditions: '',
  limits: 2,
  limitsText: '',
  texture: 'plain',
  light: '#f8f9fc',
  dark: '#181d26',
  description: '',
});

export const PieceCreator: React.FC<PieceCreatorProps> = ({
  pieces,
  currentVariantBoard,
  currentVariant,
  settings,
  onSavePiece,
  onDeletePiece,
  onBack,
  onNotify,
}) => {
  const [form, setForm] = useState<PieceDef>(EMPTY_FORM());
  const [testingPieceId, setTestingPieceId] = useState<string>('');
  const [testSquare, setTestSquare] = useState<number | null>(null);
  const [testBoardEnemies, setTestBoardEnemies] = useState<Record<number, BoardPieceInstance>>({});
  const [placeMode, setPlaceMode] = useState<'self' | 'enemy'>('self');
  const [enemyPieceId, setEnemyPieceId] = useState<string>('builtin:P');
  const [testWithVariantRules, setTestWithVariantRules] = useState<boolean>(true);

  const boardForTest = currentVariant?.board || currentVariantBoard || makeDefaultBoard(8, 8);

  const parsedDraftCapabilities = useMemo(() => parsePieceTextConfig(form), [form]);

  const activeTestPiece: PieceDef = useMemo(() => {
    if (testingPieceId === '__draft__') {
      return { ...form, id: '__draft__', name: form.name || 'Brouillon' };
    }
    return (
      pieces.find((p) => p.id === testingPieceId) ||
      pieces[0] || { ...form, id: '__draft__', name: 'Brouillon' }
    );
  }, [testingPieceId, pieces, form]);

  // Build live test GameState on the EXACT current variant board (with optional variant rules)
  const testState = useMemo(() => {
    const useVariant = Boolean(currentVariant && testWithVariantRules);
    const mockVariant: Variant = {
      id: 'test_var',
      name: useVariant && currentVariant ? currentVariant.name || 'Test de pièce' : 'Test de pièce',
      description: '',
      visibility: 'private',
      players: 2,
      difficulty: 'Simple',
      victoryType: useVariant && currentVariant ? currentVariant.victoryType : 'checkmate_or_king',
      goal: useVariant && currentVariant ? currentVariant.goal : '',
      actions: 1,
      duration: 0,
      turnOrder: useVariant && currentVariant ? currentVariant.turnOrder : '',
      rules: useVariant && currentVariant ? currentVariant.rules : '',
      ruleConstraints: useVariant && currentVariant ? currentVariant.ruleConstraints : undefined,
      board: boardForTest,
      pieces: [activeTestPiece.id],
      customPieceDefs: [
        activeTestPiece,
        ...pieces.filter((p) => p.id !== activeTestPiece.id),
      ],
      setup: {},
      createdAt: '',
      creatorId: 'local',
      creator: 'Local',
      games: 0,
      commentsEnabled: false,
    };
    const st = createInitialGameState(mockVariant, [
      activeTestPiece,
      ...pieces.filter((p) => p.id !== activeTestPiece.id),
    ]);
    for (const [k, v] of Object.entries(testBoardEnemies)) {
      st.pieces[Number(k)] = v;
    }
    if (testSquare !== null) {
      st.pieces[testSquare] = {
        uid: 'test_self',
        pieceId: activeTestPiece.id,
        side: 'white',
        hasMoved: false,
        shielded: false,
        invisibleTurns: 0,
        frozenTurns: 0,
        powerUsesLeft: activeTestPiece.limits || 2,
      };
    }
    return st;
  }, [boardForTest, activeTestPiece, pieces, testSquare, testBoardEnemies, currentVariant, testWithVariantRules]);

  const legalTestMoves = useMemo(() => {
    if (testSquare === null) return [];
    return getLegalMovesForSquare(testState, testSquare, true);
  }, [testState, testSquare]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      onNotify('Donnez un nom à votre pièce.');
      return;
    }
    const checks = [
      validateFamilyFriendlyText(form.name, { blockLinks: true, label: 'Le nom de la pièce' }),
      validateFamilyFriendlyText(form.description || '', { blockLinks: true, label: 'La description' }),
      validateFamilyFriendlyText(form.powers || '', { blockLinks: true, label: 'Le texte du pouvoir' }),
    ];
    const failed = checks.find((c) => !c.ok);
    if (failed) {
      onNotify(failed.reason || 'Texte refusé (charte tout public).');
      return;
    }
    const saved: PieceDef = {
      ...form,
      id: form.id || `piece_${crypto.randomUUID().slice(0, 8)}`,
      name: form.name.trim(),
    };
    onSavePiece(saved);
    setTestingPieceId(saved.id);
    setForm(EMPTY_FORM());
    onNotify(form.id ? 'Pièce modifiée et enregistrée.' : 'Pièce enregistrée dans la bibliothèque.');
  };

  const handleTestThisDraft = () => {
    setTestingPieceId('__draft__');
    // Auto-place in center of usable board
    const cols = boardForTest.cols;
    const rows = boardForTest.rows;
    const center = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    if (boardForTest.cells[center] !== 0 && !boardForTest.blocked?.includes(center)) {
      setTestSquare(center);
    } else {
      const firstValid = boardForTest.cells.findIndex(
        (c, idx) => c !== 0 && !boardForTest.blocked?.includes(idx)
      );
      setTestSquare(firstValid >= 0 ? firstValid : null);
    }
    document.getElementById('piece-test-panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTestCellClick = (index: number) => {
    if (boardForTest.cells[index] === 0 || boardForTest.blocked?.includes(index)) {
      onNotify('Case bloquée ou supprimée sur ce plateau.');
      return;
    }
    if (placeMode === 'enemy') {
      setTestBoardEnemies((prev) => {
        const copy = { ...prev };
        if (copy[index]) {
          delete copy[index];
        } else {
          copy[index] = {
            uid: `dummy_${index}`,
            pieceId: enemyPieceId,
            side: 'black',
            hasMoved: true,
            shielded: false,
            invisibleTurns: 0,
            frozenTurns: 0,
            powerUsesLeft: 0,
          };
        }
        return copy;
      });
      return;
    }

    // If clicking a legal move target, move the test piece there!
    const matched = legalTestMoves.find((m) => m.to === index && !m.isPower);
    if (testSquare !== null && matched) {
      if (matched.captureIndex !== undefined) {
        setTestBoardEnemies((prev) => {
          const copy = { ...prev };
          delete copy[matched.captureIndex!];
          return copy;
        });
      }
      setTestSquare(index);
      return;
    }

    if (testSquare !== null && index !== testSquare) {
      const blockedReason = explainBlockedMove(testState, testSquare, index);
      if (blockedReason) {
        onNotify(blockedReason);
        return;
      }
    }

    setTestSquare(index);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm text-sky-500 hover:underline mb-1 min-h-[40px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retour à la variante</span>
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Pièces personnalisées
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Créez par combinaison ou librement, puis testez sur le plateau exact de la variante.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulaire de création */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 space-y-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {form.id ? 'Modifier la pièce' : 'Nouvelle pièce'}
            </h2>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm(EMPTY_FORM())}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Annuler modification
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Nom de la pièce</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex. Dragon, Sentinelle, Chimère"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Symbole</span>
              <select
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-lg"
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Méthode 1 : Combinaison de déplacements */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Méthode 1 — Combinaison de déplacements classiques
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(
                [
                  ['rook', 'Tour'],
                  ['bishop', 'Fou'],
                  ['knight', 'Cavalier'],
                  ['king', 'Roi'],
                  ['pawn', 'Pion'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm cursor-pointer min-h-[44px] ${
                    form.moves[key]
                      ? 'border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.moves[key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        moves: { ...form.moves, [key]: e.target.checked },
                      })
                    }
                    className="accent-sky-500"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="block space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Portée maximale (0 = illimitée)
                </span>
                <input
                  type="number"
                  min={0}
                  max={16}
                  value={form.moves.maxRange}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      moves: { ...form.moves, maxRange: Math.max(0, Number(e.target.value)) },
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num"
                />
              </label>

              <label className="flex items-center gap-2 mt-5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] text-sm cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={form.moves.canJump}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      moves: { ...form.moves, canJump: e.target.checked },
                    })
                  }
                  className="accent-sky-500"
                />
                <span>Peut sauter par-dessus les pièces</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer min-h-[44px] ${
                  form.moves.forwardOnly
                    ? 'border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(form.moves.forwardOnly)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      moves: { ...form.moves, forwardOnly: e.target.checked },
                    })
                  }
                  className="accent-sky-500"
                />
                <span>Ne peut pas reculer (avant uniquement)</span>
              </label>

              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer min-h-[44px] ${
                  form.moves.noCapture
                    ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(form.moves.noCapture)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      moves: { ...form.moves, noCapture: e.target.checked },
                    })
                  }
                  className="accent-sky-500"
                />
                <span>Ne peut pas capturer (pièce pacifique)</span>
              </label>
            </div>
          </div>

          {/* Méthode 2 : Création libre & Capacités spéciales */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
              Méthode 2 — Déplacements libres & Pouvoirs spéciaux
            </div>

            <div className="space-y-1.5">
              <label className="block space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Déplacements libres (ex. Chameau, Zèbre, portée 3, saut de 2…)
                </span>
                <textarea
                  rows={2}
                  value={form.customMoves}
                  onChange={(e) => setForm({ ...form, customMoves: e.target.value })}
                  placeholder="Décrivez précisément les déplacements, directions, sauts ou captures..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_MOVE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        customMoves: prev.customMoves.trim()
                          ? `${prev.customMoves.trim()}, ${chip}`
                          : chip,
                      }))
                    }
                    className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] hover:border-sky-500 text-xs text-slate-700 dark:text-slate-300"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Pouvoir spécial exécutable
                </span>
                <select
                  value={form.powerType}
                  onChange={(e) =>
                    setForm({ ...form, powerType: e.target.value as SpecialPowerType })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
                >
                  {POWER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Utilisations max par partie (0 = illimité)
                </span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={form.limits}
                  onChange={(e) => setForm({ ...form, limits: Math.max(0, Number(e.target.value)) })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Conditions d’activation
                  </span>
                  <input
                    type="text"
                    value={form.conditions}
                    onChange={(e) => setForm({ ...form, conditions: e.target.value })}
                    placeholder="Ex. Hors échec, après le 3e tour..."
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CONDITION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          conditions: prev.conditions.trim()
                            ? `${prev.conditions.trim()}, ${chip}`
                            : chip,
                        }))
                      }
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] hover:border-violet-400 text-[11px] text-slate-600 dark:text-slate-300"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Texture de la pièce
                </span>
                <select
                  value={form.texture}
                  onChange={(e) =>
                    setForm({ ...form, texture: e.target.value as PieceTexture })
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
                >
                  <option value="plain">Classique</option>
                  <option value="wood">Bois</option>
                  <option value="stone">Pierre</option>
                  <option value="metal">Métal</option>
                  <option value="marble">Marbre</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Détails du pouvoir & restrictions
              </span>
              <textarea
                rows={2}
                value={form.powers}
                onChange={(e) => setForm({ ...form, powers: e.target.value })}
                placeholder="Précisez les effets, cibles autorisées et restrictions..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
              />
            </label>

            {parsedDraftCapabilities.recognizedNotes.length > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Capacités comprises par le moteur</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {parsedDraftCapabilities.recognizedNotes.map((note, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-0.5 rounded bg-white/70 dark:bg-[#0f151f] border border-emerald-500/30 text-slate-800 dark:text-slate-200"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
            >
              {form.id ? 'Mettre à jour la pièce' : 'Enregistrer la pièce'}
            </button>
            <button
              type="button"
              onClick={handleTestThisDraft}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-medium text-sm min-h-[44px]"
            >
              <FlaskConical className="w-4 h-4" />
              <span>Tester ma pièce</span>
            </button>
            <button
              type="button"
              onClick={() => setForm(EMPTY_FORM())}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm min-h-[44px]"
            >
              Effacer
            </button>
          </div>
        </form>

        {/* Mini-plateau de test exact + bibliothèque de pièces */}
        <div className="lg:col-span-5 space-y-5">
          <section
            id="piece-test-panel"
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Tester ma pièce
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                Plateau {boardForTest.rows}×{boardForTest.cols}
              </span>
            </div>

            {currentVariant && (
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testWithVariantRules}
                  onChange={(e) => setTestWithVariantRules(e.target.checked)}
                  className="accent-sky-500"
                />
                <span>Tester avec les règles de la variante en cours</span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-2">
              <select
                value={testingPieceId || (pieces[0]?.id ?? '__draft__')}
                onChange={(e) => setTestingPieceId(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
              >
                <option value="__draft__">Brouillon en cours ({form.symbol})</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.symbol} {p.name}
                  </option>
                ))}
              </select>

              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPlaceMode('self')}
                  className={`flex-1 text-xs font-medium px-2 min-h-[40px] ${
                    placeMode === 'self'
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-50 dark:bg-[#0f151f]'
                  }`}
                >
                  Ma pièce
                </button>
                <button
                  type="button"
                  onClick={() => setPlaceMode('enemy')}
                  className={`flex-1 text-xs font-medium px-2 min-h-[40px] ${
                    placeMode === 'enemy'
                      ? 'bg-rose-500 text-white'
                      : 'bg-slate-50 dark:bg-[#0f151f]'
                  }`}
                >
                  Cibles noires
                </button>
              </div>
            </div>

            {placeMode === 'enemy' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  Type de cible :
                </span>
                <select
                  value={enemyPieceId}
                  onChange={(e) => setEnemyPieceId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-2.5 py-1.5 text-xs"
                >
                  <option value="builtin:P">Pion noir</option>
                  <option value="builtin:N">Cavalier noir</option>
                  <option value="builtin:B">Fou noir</option>
                  <option value="builtin:R">Tour noire</option>
                  <option value="builtin:Q">Dame noire</option>
                  <option value="builtin:K">Roi noir</option>
                </select>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-[#0d121a] p-2">
              <ChessBoard
                board={boardForTest}
                pieces={testState.pieces}
                customPieces={[activeTestPiece, ...pieces]}
                settings={settings}
                selectedSquare={testSquare}
                legalTargets={legalTestMoves.filter((m) => !m.isPower && m.captureIndex === undefined).map((m) => m.to)}
                captureTargets={legalTestMoves.filter((m) => m.captureIndex !== undefined).map((m) => m.to)}
                powerTargets={legalTestMoves.filter((m) => m.isPower).map((m) => m.to)}
                compact
                onCellClick={handleTestCellClick}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                {testSquare === null
                  ? 'Touchez une case pour placer la pièce.'
                  : `${legalTestMoves.length} coup(s)/action(s) possible(s)`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTestSquare(null);
                  setTestBoardEnemies({});
                }}
                className="text-sky-500 hover:underline"
              >
                Vider test
              </button>
            </div>
            {activeTestPiece.powerType !== 'none' && (
              <div className="flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/25 rounded-lg p-2.5">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  Pouvoir actif en partie : {POWER_OPTIONS.find((o) => o.value === activeTestPiece.powerType)?.label}
                </span>
              </div>
            )}
          </section>

          {/* Bibliothèque de pièces */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Pièces enregistrées ({pieces.length})
            </h2>
            {pieces.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune pièce personnalisée.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {pieces.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="text-xl">{p.symbol}</span>
                        <span className="truncate">{p.name}</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {[
                          p.moves.rook && 'Tour',
                          p.moves.bishop && 'Fou',
                          p.moves.knight && 'Cavalier',
                          p.moves.king && 'Roi',
                          p.moves.pawn && 'Pion',
                          p.customMoves && 'Libre',
                          p.powerType !== 'none' && p.powerType,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Déplacement libre'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTestingPieceId(p.id)}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-500 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        title="Tester"
                      >
                        <FlaskConical className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm(p)}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sky-500 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        title="Modifier"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePiece(p.id)}
                        className="p-2 rounded-lg hover:bg-rose-500/15 text-rose-400 min-h-[40px] min-w-[40px] flex items-center justify-center"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

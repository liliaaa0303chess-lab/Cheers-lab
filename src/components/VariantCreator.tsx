import React, { useMemo, useState } from 'react';
import {
  Play,
  Save,
  RotateCcw,
  Plus,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import {
  makeDefaultBoard,
  makeStandardSetup,
  PLAYER_SIDES,
  SIDE_LABELS,
} from '../engine/chessEngine';
import { computeControlledDifficulty, DIFFICULTY_COEFFICIENTS } from '../engine/eol';
import {
  compileVariantRules,
  formatCaptureRestrictionLabel,
} from '../engine/ruleParser';
import type {
  AppSettings,
  BoardConfig,
  CaptureRestrictionCondition,
  PieceDef,
  PieceTargetFilter,
  PlayerSide,
  Profile,
  Variant,
  VariantCaptureRestriction,
  VariantDifficulty,
  VariantRuleConfig,
  VariantVisibility,
  VictoryConditionType,
} from '../types/chess';
import { BoardEditor } from './BoardEditor';
import { ChessBoard } from './ChessBoard';
import { validateFamilyFriendlyText } from '../utils/moderation';
import { safeUuid } from '../utils/safeId';

interface VariantCreatorProps {
  profile: Profile;
  pieces: PieceDef[];
  settings: AppSettings;
  draft: Variant;
  onChangeDraft: (next: Variant) => void;
  onSaveVariant: (variant: Variant) => void;
  onSaveBoard: (board: BoardConfig, name: string) => void;
  onOpenPieceCreator: () => void;
  onTestVariantPlay: (variant: Variant) => void;
  onNotify: (msg: string) => void;
}

const CLASSIC_PIECES: { id: string; symbolWhite: string; symbolBlack: string; name: string }[] = [
  { id: 'builtin:K', symbolWhite: '♚', symbolBlack: '♚', name: 'Roi' },
  { id: 'builtin:Q', symbolWhite: '♛', symbolBlack: '♛', name: 'Dame' },
  { id: 'builtin:R', symbolWhite: '♜', symbolBlack: '♜', name: 'Tour' },
  { id: 'builtin:B', symbolWhite: '♝', symbolBlack: '♝', name: 'Fou' },
  { id: 'builtin:N', symbolWhite: '♞', symbolBlack: '♞', name: 'Cavalier' },
  { id: 'builtin:P', symbolWhite: '♟', symbolBlack: '♟', name: 'Pion' },
];

export function createEmptyDraftVariant(profile: Profile): Variant {
  return {
    id: '',
    name: '',
    description: '',
    visibility: 'private',
    players: 2,
    difficulty: 'Simple',
    victoryType: 'checkmate_or_king',
    captureTarget: 5,
    goal: 'Mettre le Roi adverse échec et mat.',
    actions: 1,
    duration: 10,
    incrementSec: 0,
    turnOrder: 'Blancs, Noirs',
    rules: '',
    board: makeDefaultBoard(8, 8),
    pieces: [],
    customPieceDefs: [],
    setup: makeStandardSetup(),
    createdAt: new Date().toISOString(),
    creatorId: profile.id,
    creator: profile.nickname || 'Créateur local',
    games: 0,
    commentsEnabled: true,
    versions: [],
  };
}

export const VariantCreator: React.FC<VariantCreatorProps> = ({
  profile,
  pieces,
  settings,
  draft,
  onChangeDraft,
  onSaveVariant,
  onSaveBoard,
  onOpenPieceCreator,
  onTestVariantPlay,
  onNotify,
}) => {
  const [setupSide, setSetupSide] = useState<PlayerSide>('white');
  const [selectedTrayPiece, setSelectedTrayPiece] = useState<string>('builtin:P');
  const [capAttacker, setCapAttacker] = useState<PieceTargetFilter>('builtin:B');
  const [capCondition, setCapCondition] = useState<CaptureRestrictionCondition>('attacker_on_special');
  const [capTarget, setCapTarget] = useState<PieceTargetFilter>('builtin:N');

  const activeSides = useMemo(
    () => PLAYER_SIDES.slice(0, Math.max(2, Math.min(6, draft.players || 2))),
    [draft.players]
  );

  const controlledDiff = useMemo(() => {
    const customDefs = pieces.filter((p) => draft.pieces.includes(p.id));
    return computeControlledDifficulty({ ...draft, customPieceDefs: customDefs });
  }, [draft, pieces]);

  const compiledRules = useMemo(() => compileVariantRules(draft, pieces), [draft, pieces]);

  const ruleConstraints = draft.ruleConstraints || {};

  const updateRuleConstraint = (patch: Partial<VariantRuleConfig>) => {
    onChangeDraft({
      ...draft,
      ruleConstraints: {
        ...(draft.ruleConstraints || {}),
        ...patch,
      },
    });
  };

  const handleAddCaptureRestriction = () => {
    const nextRule: VariantCaptureRestriction = {
      id: `cap_${safeUuid().slice(0, 6)}`,
      attacker: capAttacker,
      target: capTarget,
      condition: capCondition,
    };
    const existing = draft.ruleConstraints?.captureRestrictions || [];
    updateRuleConstraint({
      captureRestrictions: [...existing, nextRule],
    });
  };

  const handleRemoveCaptureRestriction = (ruleId: string) => {
    const existing = draft.ruleConstraints?.captureRestrictions || [];
    updateRuleConstraint({
      captureRestrictions: existing.filter((r) => r.id !== ruleId),
    });
  };

  const toggleCustomPiece = (id: string) => {
    const exists = draft.pieces.includes(id);
    const nextPieces = exists
      ? draft.pieces.filter((x) => x !== id)
      : [...draft.pieces, id];
    onChangeDraft({ ...draft, pieces: nextPieces });
  };

  const handleSetupCellClick = (index: number) => {
    if (draft.board.cells[index] === 0 || draft.board.blocked?.includes(index)) {
      onNotify('Impossible de placer une pièce sur une case supprimée ou bloquée.');
      return;
    }
    const nextSetup = { ...draft.setup };
    if (nextSetup[index]) {
      delete nextSetup[index];
      onChangeDraft({ ...draft, setup: nextSetup });
      return;
    }
    if (!selectedTrayPiece) {
      onNotify('Choisissez une pièce dans le bac de placement.');
      return;
    }
    nextSetup[index] = `${selectedTrayPiece}|${setupSide}`;
    onChangeDraft({ ...draft, setup: nextSetup });
  };

  const handleResetStandardSetup = () => {
    if (draft.board.rows === 8 && draft.board.cols === 8) {
      onChangeDraft({ ...draft, setup: makeStandardSetup() });
      onNotify('Position standard 8×8 rétablie.');
      return;
    }
    // Generic symmetrical placement for custom board dimensions
    const next: Record<number, string> = {};
    const { rows, cols, cells, blocked } = draft.board;
    const isUsable = (idx: number) => cells[idx] !== 0 && !blocked.includes(idx);
    const back = ['builtin:R', 'builtin:N', 'builtin:B', 'builtin:Q', 'builtin:K', 'builtin:B', 'builtin:N', 'builtin:R'];
    for (let c = 0; c < cols; c++) {
      const topIdx = c;
      const botIdx = (rows - 1) * cols + c;
      const pieceId = back[c % back.length];
      if (isUsable(topIdx)) next[topIdx] = `${pieceId}|black`;
      if (isUsable(botIdx)) next[botIdx] = `${pieceId}|white`;
      if (rows >= 4) {
        const topPawn = cols + c;
        const botPawn = (rows - 2) * cols + c;
        if (isUsable(topPawn)) next[topPawn] = 'builtin:P|black';
        if (isUsable(botPawn)) next[botPawn] = 'builtin:P|white';
      }
    }
    onChangeDraft({ ...draft, setup: next });
    onNotify('Position initiale adaptée au plateau appliquée.');
  };

  const handleBuildFinalVariant = (): Variant | null => {
    if (!draft.name.trim()) {
      onNotify('Ajoutez un nom à votre variante avant de continuer.');
      return null;
    }
    const nameCheck = validateFamilyFriendlyText(draft.name, {
      blockLinks: true,
      label: 'Le nom de la variante',
    });
    if (!nameCheck.ok) {
      onNotify(nameCheck.reason || 'Nom refusé (charte tout public).');
      return null;
    }
    if (draft.visibility !== 'private') {
      const checks = [
        validateFamilyFriendlyText(draft.description || '', {
          blockLinks: true,
          label: 'La description',
        }),
        validateFamilyFriendlyText(draft.rules || '', {
          blockLinks: true,
          label: 'Les règles',
        }),
        validateFamilyFriendlyText(draft.goal || '', {
          blockLinks: true,
          label: 'L’objectif',
        }),
      ];
      const failed = checks.find((c) => !c.ok);
      if (failed) {
        onNotify(failed.reason || 'Contenu refusé pour publication publique.');
        return null;
      }
    }
    const usedCustomIds = new Set<string>(draft.pieces);
    for (const val of Object.values(draft.setup)) {
      const pid = val.split('|')[0];
      if (pid && !pid.startsWith('builtin:')) {
        usedCustomIds.add(pid);
      }
    }
    const customDefs = pieces.filter((p) => usedCustomIds.has(p.id));
    const isEdit = Boolean(draft.id);
    const nextVersionNumber = (draft.versions?.length || 0) + 1;
    const newVersion = {
      version: nextVersionNumber,
      date: new Date().toISOString(),
      summary: isEdit ? `Modification v${nextVersionNumber}` : 'Création initiale',
      author: profile.nickname || 'Créateur local',
    };

    const finalVariant: Variant = {
      ...draft,
      id: draft.id || `var_${safeUuid().slice(0, 10)}`,
      name: draft.name.trim(),
      pieces: Array.from(usedCustomIds),
      customPieceDefs: customDefs,
      controlledDifficulty: computeControlledDifficulty({
        ...draft,
        customPieceDefs: customDefs,
      }),
      creatorId: draft.creatorId || profile.id,
      creator: draft.creator || profile.nickname || 'Créateur local',
      updatedAt: new Date().toISOString(),
      versions: [newVersion, ...(draft.versions || [])],
    };
    return finalVariant;
  };

  const handleSave = () => {
    const built = handleBuildFinalVariant();
    if (!built) return;
    onSaveVariant(built);
  };

  const handleTestPlay = () => {
    const built = handleBuildFinalVariant();
    if (!built) return;
    onTestVariantPlay(built);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            {draft.id ? `Modifier : ${draft.name}` : 'Créer une variante'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Mode simple guidé : configurez le plateau, les pièces, les règles et la position de départ.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChangeDraft(createEmptyDraftVariant(profile))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm min-h-[44px]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Réinitialiser</span>
          </button>
          <button
            type="button"
            onClick={handleTestPlay}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-sm font-medium min-h-[44px]"
          >
            <Play className="w-4 h-4" />
            <span>Tester la variante</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
          >
            <Save className="w-4 h-4" />
            <span>Enregistrer</span>
          </button>
        </div>
      </div>

      {/* 1. Informations générales & visibilité */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            1. Informations & Partage
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Difficulté contrôlée : {controlledDiff} (×{DIFFICULTY_COEFFICIENTS[controlledDiff].toFixed(2)})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Nom de la variante</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onChangeDraft({ ...draft, name: e.target.value })}
              placeholder="Ex. Échecs du Chaos, Citadelle..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Visibilité</span>
            <select
              value={draft.visibility}
              onChange={(e) =>
                onChangeDraft({ ...draft, visibility: e.target.value as VariantVisibility })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            >
              <option value="private">Privée (visible uniquement par vous)</option>
              <option value="public">Publique (visible et jouable par tous)</option>
              <option value="link">Par lien (accessible via lien partagé)</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Description courte</span>
          <textarea
            rows={2}
            value={draft.description}
            onChange={(e) => onChangeDraft({ ...draft, description: e.target.value })}
            placeholder="Présentez le concept de votre variante en quelques lignes..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Difficulté estimée par le créateur
            </span>
            <select
              value={draft.difficulty}
              onChange={(e) =>
                onChangeDraft({ ...draft, difficulty: e.target.value as VariantDifficulty })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            >
              <option>Très simple</option>
              <option>Simple</option>
              <option>Moyenne</option>
              <option>Complexe</option>
              <option>Extrême</option>
            </select>
          </label>

          <label className="flex items-center gap-2 mt-5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] text-sm cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={draft.commentsEnabled !== false}
              onChange={(e) =>
                onChangeDraft({ ...draft, commentsEnabled: e.target.checked })
              }
              className="accent-sky-500"
            />
            <span>Autoriser les commentaires sur cette variante</span>
          </label>
        </div>
      </section>

      {/* 2. Plateau */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          2. Création et personnalisation du plateau
        </h2>
        <BoardEditor
          board={draft.board}
          settings={settings}
          onChange={(nextBoard) => onChangeDraft({ ...draft, board: nextBoard })}
          onSaveBoardToLibrary={onSaveBoard}
          onNotify={onNotify}
        />
      </section>

      {/* 3. Pièces de la variante */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              3. Pièces personnalisées de la variante
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cochez vos pièces personnalisées pour les rendre disponibles dans cette variante, ou créez-en de nouvelles.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenPieceCreator}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-white text-sm font-medium transition-colors min-h-[44px] shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Créer / tester une pièce</span>
          </button>
        </div>

        {pieces.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune pièce personnalisée enregistrée.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {pieces.map((p) => {
              const selected = draft.pieces.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleCustomPiece(p.id)}
                  className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-left transition-colors min-h-[52px] ${
                    selected
                      ? 'border-sky-500 bg-sky-500/15 text-slate-900 dark:text-slate-50'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl">{p.symbol}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {p.powerType !== 'none' ? `Pouvoir : ${p.powerType}` : 'Déplacements personnalisés'}
                      </div>
                    </div>
                  </div>
                  {selected && <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Règles générales */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          4. Règles générales
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Nombre de joueurs</span>
            <select
              value={draft.players}
              onChange={(e) =>
                onChangeDraft({ ...draft, players: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} joueurs
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Actions par tour</span>
            <input
              type="number"
              min={1}
              max={5}
              value={draft.actions}
              onChange={(e) =>
                onChangeDraft({
                  ...draft,
                  actions: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Condition de victoire
            </span>
            <select
              value={draft.victoryType}
              onChange={(e) =>
                onChangeDraft({
                  ...draft,
                  victoryType: e.target.value as VictoryConditionType,
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            >
              <option value="checkmate_or_king">Échec et mat / Capture du Roi</option>
              <option value="eliminate_all">Capturer toutes les pièces</option>
              <option value="king_of_hill">Roi sur case spéciale ✦ (ou Mat)</option>
              <option value="capture_count">Nombre de captures défini</option>
              <option value="custom">Règle personnalisée (texte)</option>
            </select>
          </label>
        </div>

        {/* Pendule personnalisée : exemples rapides + champs minutes et incrément */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f151f] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Pendule personnalisée (minutes + incrément par coup)
            </span>
            <span className="text-xs font-mono-num font-semibold text-sky-400">
              {draft.duration > 0
                ? `${draft.duration} min + ${draft.incrementSec || 0} s / coup`
                : 'Sans pendule (illimité)'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Illimité', min: 0, inc: 0 },
              { label: '1 + 0 Bullet', min: 1, inc: 0 },
              { label: '3 + 2 Blitz', min: 3, inc: 2 },
              { label: '5 + 3 Blitz', min: 5, inc: 3 },
              { label: '10 + 0 Rapide', min: 10, inc: 0 },
              { label: '10 + 5', min: 10, inc: 5 },
              { label: '15 + 10', min: 15, inc: 10 },
              { label: '30 + 0 Classique', min: 30, inc: 0 },
            ].map((preset) => {
              const selected =
                draft.duration === preset.min && (draft.incrementSec || 0) === preset.inc;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    onChangeDraft({
                      ...draft,
                      duration: preset.min,
                      incrementSec: preset.inc,
                    })
                  }
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    selected
                      ? 'border-sky-500 bg-sky-500/20 text-sky-300 font-semibold'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] text-slate-600 dark:text-slate-300 hover:border-sky-400'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Durée initiale (min, 0 = illimitée)
              </span>
              <input
                type="number"
                min={0}
                max={180}
                value={draft.duration}
                onChange={(e) =>
                  onChangeDraft({
                    ...draft,
                    duration: Math.max(0, Math.min(180, Number(e.target.value) || 0)),
                  })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-3 py-2 text-sm font-mono-num"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Incrément par coup (secondes)
              </span>
              <input
                type="number"
                min={0}
                max={120}
                disabled={draft.duration <= 0}
                value={draft.duration > 0 ? draft.incrementSec || 0 : 0}
                onChange={(e) =>
                  onChangeDraft({
                    ...draft,
                    incrementSec: Math.max(0, Math.min(120, Number(e.target.value) || 0)),
                  })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-3 py-2 text-sm font-mono-num disabled:opacity-45"
              />
            </label>
          </div>
        </div>

        {draft.victoryType === 'capture_count' && (
          <label className="block space-y-1 max-w-xs">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Nombre de captures pour gagner
            </span>
            <input
              type="number"
              min={1}
              max={30}
              value={draft.captureTarget || 5}
              onChange={(e) =>
                onChangeDraft({
                  ...draft,
                  captureTarget: Math.max(1, Number(e.target.value) || 5),
                })
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num"
            />
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">Ordre des tours</span>
            <input
              type="text"
              value={draft.turnOrder}
              onChange={(e) => onChangeDraft({ ...draft, turnOrder: e.target.value })}
              placeholder="Ex. Blancs, Noirs, Rouges, Bleus"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Résumé de l’objectif & défaite
            </span>
            <input
              type="text"
              value={draft.goal}
              onChange={(e) => onChangeDraft({ ...draft, goal: e.target.value })}
              placeholder="Ex. Mater le Roi adverse ou atteindre le centre."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <label className="block space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Règles spéciales en français (exécutées automatiquement par le moteur)
            </span>
            <textarea
              rows={3}
              value={draft.rules}
              onChange={(e) => onChangeDraft({ ...draft, rules: e.target.value })}
              placeholder="Ex. Les pièces ne peuvent pas reculer. Les fous ne peuvent pas manger les cavaliers s'ils ne sont pas sur la case spéciale."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Aucune pièce, sauf le Roi, n'a le droit de reculer.",
              "Les fous ne peuvent pas manger les cavaliers s'ils ne sont pas sur la case spéciale.",
              'Les pions peuvent reculer.',
              'Toutes les pièces peuvent sauter.',
              'Pas de capture au premier tour.',
              'Après une capture, on rejoue.',
              'Seul le Roi peut manger la Dame.',
              'Prise obligatoire.',
              '3 échecs pour gagner.',
              ...(draft.players >= 3
                ? [
                    'Équipe 1 : Blancs et Rouges. Équipe 2 : Noirs et Bleus.',
                    '2 contre 2 (équipes alternées).',
                  ]
                : []),
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() =>
                  onChangeDraft({
                    ...draft,
                    rules: draft.rules.trim()
                      ? `${draft.rules.trim()} ${sample}`
                      : sample,
                  })
                }
                className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] hover:border-sky-500 text-xs text-slate-600 dark:text-slate-300 text-left"
              >
                + {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Constructeur guidé de règles exécutables */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f151f] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Règles spéciales exécutables (Mode Simple)</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span>Portée max globale (0 = illimitée)</span>
              <input
                type="number"
                min={0}
                max={16}
                value={ruleConstraints.maxStepsPerMove || 0}
                onChange={(e) =>
                  updateRuleConstraint({
                    maxStepsPerMove: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2 py-1 text-xs font-mono-num"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(
              [
                ['noBackwardAll', 'Aucune pièce ne peut reculer'],
                ['mandatoryCapture', 'Prise obligatoire'],
                ['disableCastling', 'Interdire le roque'],
                ['disableEnPassant', 'Interdire la prise en passant'],
                ['disablePawnDoubleStep', 'Interdire le double pas des pions'],
                ['disablePromotion', 'Interdire la promotion des pions'],
                ['specialProtected', 'Cases spéciales ✦ = Zone protégée'],
                ['specialCaptureOnly', 'Captures uniquement sur/depuis ✦'],
                ['noCheckRestriction', "Ignorer l'échec (capture directe du Roi)"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer min-h-[40px] ${
                  ruleConstraints[key]
                    ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300 font-medium'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151c27] text-slate-700 dark:text-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(ruleConstraints[key])}
                  onChange={(e) => updateRuleConstraint({ [key]: e.target.checked })}
                  className="accent-sky-500"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {draft.players >= 3 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Équipes (optionnel)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Les alliés d’une même équipe ne se capturent pas, ne se mettent pas en échec et gagnent ensemble.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateRuleConstraint({
                      teamAssignments: undefined,
                      teamSharedElimination: false,
                    })
                  }
                  className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:border-sky-500"
                >
                  Chacun pour soi
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {activeSides.map((s) => {
                  const assigned = ruleConstraints.teamAssignments?.[s] || 0;
                  const maxTeams = Math.min(3, Math.max(2, Math.floor(activeSides.length / 2) + 1));
                  const teamNums = Array.from({ length: maxTeams }, (_, i) => i + 1);
                  return (
                    <div
                      key={s}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151c27] text-xs"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {SIDE_LABELS[s]}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const next = { ...(ruleConstraints.teamAssignments || {}) };
                            delete next[s];
                            updateRuleConstraint({
                              teamAssignments: Object.keys(next).length > 0 ? next : undefined,
                            });
                          }}
                          className={`px-2 py-1 rounded text-[11px] font-medium border ${
                            assigned === 0
                              ? 'border-sky-500 bg-sky-500/20 text-sky-400'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          Solo
                        </button>
                        {teamNums.map((tNum) => (
                          <button
                            key={tNum}
                            type="button"
                            onClick={() =>
                              updateRuleConstraint({
                                teamAssignments: {
                                  ...(ruleConstraints.teamAssignments || {}),
                                  [s]: tNum,
                                },
                              })
                            }
                            className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                              assigned === tNum
                                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                          >
                            Éq.{tNum}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(ruleConstraints.teamSharedElimination)}
                  onChange={(e) =>
                    updateRuleConstraint({ teamSharedElimination: e.target.checked })
                  }
                  className="accent-sky-500"
                />
                <span>
                  Défaite d’équipe partagée (si un allié est mat ou éliminé, toute son équipe perd immédiatement)
                </span>
              </label>
            </div>
          )}

          {/* Constructeur de règle conditionnelle de capture */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Règles de capture entre pièces (avec ou sans case spéciale ✦)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <select
                value={capAttacker}
                onChange={(e) => setCapAttacker(e.target.value)}
                className="sm:col-span-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2.5 py-2 text-xs"
              >
                <option value="all">Toutes les pièces</option>
                <option value="custom">Pièces personnalisées</option>
                <option value="builtin:P">Pion</option>
                <option value="builtin:N">Cavalier</option>
                <option value="builtin:B">Fou</option>
                <option value="builtin:R">Tour</option>
                <option value="builtin:Q">Dame</option>
                <option value="builtin:K">Roi</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.symbol} {p.name}
                  </option>
                ))}
              </select>

              <select
                value={capCondition}
                onChange={(e) =>
                  setCapCondition(e.target.value as CaptureRestrictionCondition)
                }
                className="sm:col-span-5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2.5 py-2 text-xs"
              >
                <option value="attacker_on_special">
                  ne capture que si l’attaquant est sur ✦
                </option>
                <option value="target_on_special">
                  ne capture que si la cible est sur ✦
                </option>
                <option value="either_on_special">
                  ne capture que si l’un des deux est sur ✦
                </option>
                <option value="never">ne peut jamais capturer</option>
                <option value="target_not_on_special">
                  ne peut pas capturer si la cible est sur ✦
                </option>
                <option value="attacker_not_on_special">
                  ne peut pas capturer depuis une case ✦
                </option>
              </select>

              <select
                value={capTarget}
                onChange={(e) => setCapTarget(e.target.value)}
                className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2.5 py-2 text-xs"
              >
                <option value="all">Toutes</option>
                <option value="custom">Personnalisées</option>
                <option value="builtin:P">Pion</option>
                <option value="builtin:N">Cavalier</option>
                <option value="builtin:B">Fou</option>
                <option value="builtin:R">Tour</option>
                <option value="builtin:Q">Dame</option>
                <option value="builtin:K">Roi</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.symbol} {p.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddCaptureRestriction}
                className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs min-h-[38px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            </div>

            {(ruleConstraints.captureRestrictions?.length || 0) > 0 && (
              <div className="space-y-1.5 pt-1">
                {ruleConstraints.captureRestrictions!.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151c27] text-xs"
                  >
                    <span className="text-slate-700 dark:text-slate-200">
                      {formatCaptureRestrictionLabel(rule, pieces)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCaptureRestriction(rule.id)}
                      className="p-1 rounded text-rose-400 hover:bg-rose-500/15"
                      title="Supprimer cette règle"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Retour en direct du moteur sur les règles comprises */}
        {(compiledRules.activeRules.length > 0 ||
          compiledRules.unrecognizedSentences.length > 0) && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111823] p-4 space-y-2.5">
            {compiledRules.activeRules.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Règles comprises et appliquées par le moteur ({compiledRules.activeRules.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {compiledRules.activeRules.map((badge, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-md text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {compiledRules.unrecognizedSentences.length > 0 && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Phrases non reconnues automatiquement par le moteur :</span>
                </div>
                <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-200/90 space-y-0.5">
                  {compiledRules.unrecognizedSentences.map((s, idx) => (
                    <li key={idx}>« {s} »</li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-600/90 dark:text-amber-300/80">
                  Le moteur n’invente pas de règle ambiguë pour éviter les bugs. Exemples reconnus : « Aucune pièce, sauf le Roi, n’a le droit de reculer », « Les fous ne peuvent manger que les pions », « Un pion ne peut pas être mangé par un cavalier », « Les cavaliers ne peuvent pas sauter », « Les fous ne vont que sur les cases noires », « Les pièces défendues ne peuvent pas être capturées », « Échecs atomiques », « Premier qui fait échec gagne », « Le pat fait gagner ».
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. Mini-plateau de configuration des pièces */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              5. Position de départ (Mini-plateau de configuration)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sélectionnez un camp et une pièce dans le bac, puis touchez une case pour placer (ou touchez une pièce posée pour la retirer).
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleResetStandardSetup}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium min-h-[40px]"
            >
              Position par défaut
            </button>
            <button
              type="button"
              onClick={() => onChangeDraft({ ...draft, setup: {} })}
              className="px-3 py-2 rounded-lg border border-rose-500/40 text-rose-400 text-xs font-medium min-h-[40px]"
            >
              Vider
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Bac des camps et pièces */}
          <div className="lg:col-span-5 space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f151f] p-3.5">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                Camp à placer
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeSides.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSetupSide(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors min-h-[38px] ${
                      setupSide === s
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-white dark:bg-[#151c27] border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {SIDE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                Pièces classiques
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CLASSIC_PIECES.map((cp) => (
                  <button
                    key={cp.id}
                    type="button"
                    onClick={() => setSelectedTrayPiece(cp.id)}
                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-sm min-h-[44px] ${
                      selectedTrayPiece === cp.id
                        ? 'border-sky-500 bg-sky-500/15 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151c27]'
                    }`}
                  >
                    <span className={`text-xl piece-glyph piece-side-${setupSide}`}>
                      {setupSide === 'white' ? cp.symbolWhite : cp.symbolBlack}
                    </span>
                    <span className="text-xs truncate">{cp.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {pieces.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pièces inventées & bibliothèque</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {pieces.map((cp) => (
                    <button
                      key={cp.id}
                      type="button"
                      onClick={() => {
                        setSelectedTrayPiece(cp.id);
                        if (!draft.pieces.includes(cp.id)) {
                          toggleCustomPiece(cp.id);
                        }
                      }}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs min-h-[44px] ${
                        selectedTrayPiece === cp.id
                          ? 'border-sky-500 bg-sky-500/15 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151c27]'
                      }`}
                    >
                      <span className={`text-xl piece-glyph piece-side-${setupSide}`}>{cp.symbol}</span>
                      <span className="truncate">{cp.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Échiquier de placement */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-[#0d121a] p-3">
            <ChessBoard
              board={draft.board}
              setupMap={draft.setup}
              customPieces={pieces}
              settings={settings}
              onCellClick={handleSetupCellClick}
            />
          </div>
        </div>
      </section>

      {/* Barre finale */}
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={handleTestPlay}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-semibold text-sm min-h-[48px]"
        >
          <Play className="w-4 h-4" />
          <span>Tester en partie</span>
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm min-h-[48px]"
        >
          <Save className="w-4 h-4" />
          <span>Enregistrer la variante</span>
        </button>
      </div>
    </div>
  );
};

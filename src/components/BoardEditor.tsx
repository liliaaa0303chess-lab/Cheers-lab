import React, { useState } from 'react';
import { RotateCw, Save, Undo2, RotateCcw, Check } from 'lucide-react';
import { makeDefaultBoard } from '../engine/chessEngine';
import type {
  AppSettings,
  BoardConfig,
  BoardTexture,
  SpecialCellEffectType,
} from '../types/chess';
import { cloneBoardConfig } from '../utils/storage';
import { ChessBoard } from './ChessBoard';

interface BoardEditorProps {
  board: BoardConfig;
  settings: AppSettings;
  canUseGoldNight?: boolean;
  onChange: (next: BoardConfig) => void;
  onSaveBoardToLibrary: (board: BoardConfig, name: string) => void;
  onNotify: (msg: string) => void;
}

type EditTool = 'remove' | 'add' | 'blocked' | 'special';

const SPECIAL_EFFECT_OPTIONS: { value: SpecialCellEffectType; label: string }[] = [
  { value: 'none', label: 'Effet descriptif uniquement' },
  { value: 'teleport', label: 'Téléportation vers une autre case ✦' },
  { value: 'promote', label: 'Promotion en Dame' },
  { value: 'shield', label: 'Octroie un Bouclier (1 coup)' },
  { value: 'double_action', label: '+1 action bonus ce tour' },
  { value: 'freeze', label: 'Gèle la pièce pour 1 tour' },
  { value: 'trap', label: 'Piège (détruit pièce non-royale)' },
  { value: 'king_hill', label: 'Case Royale (victoire si le Roi l’atteint)' },
];

export const BoardEditor: React.FC<BoardEditorProps> = ({
  board,
  settings,
  canUseGoldNight = false,
  onChange,
  onSaveBoardToLibrary,
  onNotify,
}) => {
  const [undoStack, setUndoStack] = useState<BoardConfig[]>([]);
  const [tool, setTool] = useState<EditTool>('blocked');
  const [rowsInput, setRowsInput] = useState(board.rows);
  const [colsInput, setColsInput] = useState(board.cols);
  const [boardNameInput, setBoardNameInput] = useState('');
  const [boardVisibilityInput, setBoardVisibilityInput] = useState<'private' | 'public'>(
    board.visibility === 'public' ? 'public' : 'private'
  );
  const [showSaveName, setShowSaveName] = useState(false);

  const commitChange = (next: BoardConfig) => {
    setUndoStack((prev) => [...prev.slice(-19), cloneBoardConfig(board)]);
    onChange(next);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) {
      onNotify('Aucune modification précédente à annuler.');
      return;
    }
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRowsInput(prev.rows);
    setColsInput(prev.cols);
    onChange(prev);
    onNotify('Dernière modification annulée.');
  };

  const handleReset = () => {
    const fresh = makeDefaultBoard(8, 8);
    setRowsInput(8);
    setColsInput(8);
    commitChange(fresh);
    onNotify('Plateau réinitialisé en 8×8 standard.');
  };

  const applyDimensions = (r: number, c: number) => {
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 2 || c < 2 || r > 16 || c > 16) {
      onNotify('Dimensions autorisées : entre 2 et 16.');
      return;
    }
    const next = makeDefaultBoard(r, c);
    next.texture = board.texture;
    next.light = board.light;
    next.dark = board.dark;
    next.rotation = board.rotation;
    next.specialEffectType = board.specialEffectType;
    next.specialEffect = board.specialEffect;

    for (let y = 0; y < Math.min(r, board.rows); y++) {
      for (let x = 0; x < Math.min(c, board.cols); x++) {
        const oi = y * board.cols + x;
        const ni = y * c + x;
        next.cells[ni] = board.cells[oi] ?? 1;
        if (board.blocked?.includes(oi)) next.blocked.push(ni);
        if (board.special?.includes(oi)) next.special.push(ni);
      }
    }
    setRowsInput(r);
    setColsInput(c);
    commitChange(next);
  };

  const handleCellClick = (index: number) => {
    const next = cloneBoardConfig(board);
    if (tool === 'remove') {
      next.cells[index] = 0;
      next.blocked = next.blocked.filter((x) => x !== index);
      next.special = next.special.filter((x) => x !== index);
    } else if (tool === 'add') {
      next.cells[index] = 1;
    } else if (tool === 'blocked') {
      if (next.cells[index] === 0) {
        onNotify('Ajoutez d’abord cette case pour la bloquer.');
        return;
      }
      next.blocked = next.blocked.includes(index)
        ? next.blocked.filter((x) => x !== index)
        : [...next.blocked, index];
      next.special = next.special.filter((x) => x !== index);
    } else if (tool === 'special') {
      if (next.cells[index] === 0) {
        onNotify('Ajoutez d’abord cette case.');
        return;
      }
      next.special = next.special.includes(index)
        ? next.special.filter((x) => x !== index)
        : [...next.special, index];
      next.blocked = next.blocked.filter((x) => x !== index);
    }
    commitChange(next);
  };

  const toolButtons: { id: EditTool; label: string }[] = [
    { id: 'remove', label: 'Retirer des cases' },
    { id: 'add', label: 'Ajouter des cases' },
    { id: 'blocked', label: 'Cases bloquées' },
    { id: 'special', label: 'Cases spéciales ✦' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => applyDimensions(8, 8)}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 min-h-[44px]"
        >
          Standard 8×8
        </button>
        <button
          type="button"
          onClick={() => applyDimensions(rowsInput, colsInput)}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 min-h-[44px]"
        >
          Appliquer dimensions
        </button>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Lignes (2–16)</span>
          <input
            type="number"
            min={2}
            max={16}
            value={rowsInput}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRowsInput(v);
              if (v >= 2 && v <= 16) applyDimensions(v, colsInput);
            }}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Colonnes (2–16)</span>
          <input
            type="number"
            min={2}
            max={16}
            value={colsInput}
            onChange={(e) => {
              const v = Number(e.target.value);
              setColsInput(v);
              if (v >= 2 && v <= 16) applyDimensions(rowsInput, v);
            }}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm font-mono-num"
          />
        </label>
      </div>

      {/* Outils de manipulation de cases */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {toolButtons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => setTool(btn.id)}
            className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors min-h-[44px] ${
              tool === btn.id
                ? 'bg-sky-500 text-slate-950 border-sky-400 font-semibold'
                : 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Propriétés des cases spéciales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Effet des cases spéciales ✦
          </span>
          <select
            value={board.specialEffectType || 'none'}
            onChange={(e) =>
              commitChange({
                ...cloneBoardConfig(board),
                specialEffectType: e.target.value as SpecialCellEffectType,
              })
            }
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
          >
            {SPECIAL_EFFECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Description des cases spéciales
          </span>
          <input
            type="text"
            value={board.specialEffect || ''}
            onChange={(e) =>
              onChange({
                ...board,
                specialEffect: e.target.value,
              })
            }
            placeholder="Ex. Téléporte la pièce ou donne +1 action"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
          />
        </label>
      </div>

      {/* Apparence et textures */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Texture du plateau</span>
          <select
            value={board.texture || 'plain'}
            onChange={(e) =>
              commitChange({
                ...cloneBoardConfig(board),
                texture: e.target.value as BoardTexture,
              })
            }
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f] px-3 py-2 text-sm"
          >
            <option value="plain">Classique (couleurs unies)</option>
            <option value="wood">Bois</option>
            <option value="stone">Pierre</option>
            <option value="marble">Marbre</option>
            <option value="metal">Métal</option>
            <option value="night">Nuit</option>
            {(canUseGoldNight || board.texture === 'gold_night') && (
              <option value="gold_night">Nuit d’Or</option>
            )}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Couleur claire</span>
          <input
            type="color"
            value={board.light || '#dce5ef'}
            onChange={(e) =>
              onChange({
                ...board,
                light: e.target.value,
              })
            }
            className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Couleur foncée</span>
          <input
            type="color"
            value={board.dark || '#788ba2'}
            onChange={(e) =>
              onChange({
                ...board,
                dark: e.target.value,
              })
            }
            className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
          />
        </label>
      </div>

      {/* Actions Annuler, Rotation, Réinitialiser, Confirmer */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 min-h-[44px]"
        >
          <Undo2 className="w-4 h-4" />
          <span>Annuler</span>
        </button>
        <button
          type="button"
          onClick={() =>
            commitChange({
              ...cloneBoardConfig(board),
              rotation: ((board.rotation || 0) + 45) % 360,
            })
          }
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[44px]"
        >
          <RotateCw className="w-4 h-4" />
          <span>Rotation 45° ({board.rotation || 0}°)</span>
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[44px]"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Réinitialiser</span>
        </button>
        <button
          type="button"
          onClick={() => onNotify('Configuration du plateau confirmée.')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-emerald-600 text-white font-medium min-h-[44px]"
        >
          <Check className="w-4 h-4" />
          <span>Confirmer</span>
        </button>
        <button
          type="button"
          onClick={() => setShowSaveName((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 min-h-[44px]"
        >
          <Save className="w-4 h-4" />
          <span>Sauver plateau</span>
        </button>
      </div>

      {showSaveName && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0f151f]">
          <input
            type="text"
            value={boardNameInput}
            onChange={(e) => setBoardNameInput(e.target.value)}
            placeholder="Nom du plateau (ex. Croix Celtique)"
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-3 py-2 text-sm"
          />
          <select
            value={boardVisibilityInput}
            onChange={(e) =>
              setBoardVisibilityInput(e.target.value === 'public' ? 'public' : 'private')
            }
            aria-label="Visibilité du plateau"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-3 py-2 text-sm"
          >
            <option value="private">Privé</option>
            <option value="public">Public</option>
          </select>
          <button
            type="button"
            onClick={() => {
              const name = boardNameInput.trim() || `Plateau ${board.rows}×${board.cols}`;
              const copy = cloneBoardConfig(board);
              copy.visibility = boardVisibilityInput;
              onSaveBoardToLibrary(copy, name);
              setBoardNameInput('');
              setShowSaveName(false);
            }}
            className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold text-sm min-h-[44px]"
          >
            Enregistrer en bibliothèque
          </button>
        </div>
      )}

      {/* Aperçu en direct interactif */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-[#0d121a] p-3">
        <ChessBoard
          board={board}
          settings={settings}
          onCellClick={handleCellClick}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
          Touchez une case pour appliquer l’outil «{' '}
          {toolButtons.find((b) => b.id === tool)?.label} ». Les cases retirées restent transparentes.
        </p>
      </div>
    </div>
  );
};

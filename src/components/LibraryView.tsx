import React, { useState } from 'react';
import {
  Copy,
  Edit3,
  GitBranch,
  GitFork,
  Link2,
  Play,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { BoardConfig, PieceDef, SavedTheme, Variant } from '../types/chess';
import { fetchVariantLineage } from '../utils/storage';
import { getPublicAppUrl } from '../utils/appUrl';

interface LibraryViewProps {
  variants: Variant[];
  boards: BoardConfig[];
  pieces: PieceDef[];
  savedThemes: SavedTheme[];
  onPlayVariant: (v: Variant) => void;
  onEditVariant: (v: Variant) => void;
  onDuplicateVariant: (v: Variant) => void;
  onDeleteVariant: (id: string) => void;
  onToggleVisibility: (v: Variant, vis: Variant['visibility']) => void;
  onLoadBoardIntoCreator: (b: BoardConfig) => void;
  onDeleteBoard: (id: string) => void;
  onOpenPieceCreator: () => void;
  onDeletePiece: (id: string) => void;
  onApplySavedTheme: (theme: SavedTheme) => void;
  onDeleteSavedTheme: (id: string) => void;
  onNotify: (msg: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  variants,
  boards,
  pieces,
  savedThemes,
  onPlayVariant,
  onEditVariant,
  onDuplicateVariant,
  onDeleteVariant,
  onToggleVisibility,
  onLoadBoardIntoCreator,
  onDeleteBoard,
  onOpenPieceCreator,
  onDeletePiece,
  onApplySavedTheme,
  onDeleteSavedTheme,
  onNotify,
}) => {
  const [lineageModal, setLineageModal] = useState<{
    variant: Variant;
    ancestors: Variant[];
    branches: Variant[];
  } | null>(null);

  const handleOpenLineage = async (v: Variant) => {
    const serverLineage = await fetchVariantLineage(v.id);
    // Merge any local branches
    const localBranches = variants.filter((item) => item.parentId === v.id);
    const branchMap = new Map<string, Variant>();
    for (const b of [...serverLineage.branches, ...localBranches]) {
      branchMap.set(b.id, b);
    }
    setLineageModal({
      variant: v,
      ancestors: serverLineage.ancestors,
      branches: Array.from(branchMap.values()),
    });
  };

  const handleCopyLink = async (v: Variant) => {
    const url = `${getPublicAppUrl()}/?variant=${encodeURIComponent(v.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      onNotify('Lien de partage copié !');
    } catch {
      onNotify(`Lien : ${url}`);
    }
  };

  const visLabel: Record<Variant['visibility'], string> = {
    private: 'Privée',
    public: 'Publique',
    link: 'Par lien',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Bibliothèque personnelle
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Retrouvez, modifiez, dupliquez et partagez vos variantes, plateaux, pièces et thèmes.
        </p>
      </div>

      {/* Variantes */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Variantes ({variants.length})
        </h2>

        {variants.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune variante enregistrée.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {variants.map((v) => {
              const avg =
                v.ratingCount && v.ratingCount > 0 && v.ratingSum
                  ? (v.ratingSum / v.ratingCount).toFixed(1)
                  : '—';
              return (
                <div
                  key={v.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0f151f] space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {v.name}
                      </h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {v.board.rows}×{v.board.cols} · {v.controlledDifficulty || v.difficulty} ·{' '}
                        {visLabel[v.visibility]}
                        {v.parentName && ` · Dérivée de « ${v.parentName} »`}
                      </div>
                    </div>
                    <select
                      value={v.visibility}
                      onChange={(e) =>
                        onToggleVisibility(v, e.target.value as Variant['visibility'])
                      }
                      className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151c27] px-2 py-1 text-xs"
                      aria-label="Visibilité"
                    >
                      <option value="private">Privée</option>
                      <option value="public">Publique</option>
                      <option value="link">Par lien</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                    <span>Popularité : {v.games || 0}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      {avg}/5
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onPlayVariant(v)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-semibold text-xs min-h-[38px]"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Jouer</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditVariant(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateVariant(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Dériver</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenLineage(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>Lignée</span>
                    </button>
                    {v.visibility !== 'private' && (
                      <button
                        type="button"
                        onClick={() => handleCopyLink(v)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs min-h-[38px]"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Lien</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteVariant(v.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/40 text-rose-400 text-xs ml-auto min-h-[38px]"
                      aria-label="Supprimer variante"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Plateaux sauvegardés */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Plateaux personnalisés ({boards.length})
        </h2>
        {boards.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun plateau sauvegardé séparément.</p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {boards.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {b.name || `Plateau ${b.rows}×${b.cols}`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {b.rows}×{b.cols} · Texture : {b.texture} · Rotation : {b.rotation || 0}°
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onLoadBoardIntoCreator(b)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs min-h-[38px]"
                  >
                    Réutiliser
                  </button>
                  <button
                    type="button"
                    onClick={() => b.id && onDeleteBoard(b.id)}
                    className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 min-h-[38px]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pièces personnalisées */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Pièces personnalisées ({pieces.length})
          </h2>
          <button
            type="button"
            onClick={onOpenPieceCreator}
            className="text-xs font-medium text-sky-400 hover:underline min-h-[36px]"
          >
            Gérer / tester
          </button>
        </div>
        {pieces.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune pièce personnalisée.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {pieces.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0f151f]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-2xl">{p.symbol}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {p.powerType !== 'none' ? `Pouvoir : ${p.powerType}` : 'Pièce combinée'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeletePiece(p.id)}
                  className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Thèmes enregistrés */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-5 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Thèmes & textures enregistrés ({savedThemes.length})
        </h2>
        {savedThemes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Enregistrez vos thèmes visuels depuis les Paramètres pour les réutiliser ici.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {savedThemes.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0f151f]"
              >
                <div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500">
                    Plateau : {t.boardTexture} · Pièces : {t.pieceTexture}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onApplySavedTheme(t)}
                    className="px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-semibold text-xs min-h-[36px]"
                  >
                    Appliquer
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSavedTheme(t.id)}
                    className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modale Lignée & Historique des versions */}
      {lineageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-white dark:bg-[#151c27] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <GitFork className="w-4 h-4 text-sky-400" />
                <span>Lignée & Versions — {lineageModal.variant.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setLineageModal(null)}
                className="p-2 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-400">Origine et ancêtres</div>
              {lineageModal.ancestors.length === 0 ? (
                <p className="text-slate-500">
                  {lineageModal.variant.parentName
                    ? `Dérivée de : ${lineageModal.variant.parentName}`
                    : 'Variante originale (aucun ancêtre).'}
                </p>
              ) : (
                lineageModal.ancestors.map((a) => (
                  <div key={a.id} className="p-2 rounded-lg bg-slate-800/60">
                    {a.name} (par {a.creator})
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-400">Branches dérivées</div>
              {lineageModal.branches.length === 0 ? (
                <p className="text-slate-500">Aucune branche dérivée publique.</p>
              ) : (
                lineageModal.branches.map((b) => (
                  <div key={b.id} className="p-2 rounded-lg bg-slate-800/60 flex justify-between">
                    <span>
                      {b.name} (par {b.creator})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLineageModal(null);
                        onPlayVariant(b);
                      }}
                      className="text-sky-400 hover:underline"
                    >
                      Jouer
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-400">Historique des modifications</div>
              {(lineageModal.variant.versions || []).length === 0 ? (
                <p className="text-slate-500">Version initiale.</p>
              ) : (
                (lineageModal.variant.versions || []).map((ver) => (
                  <div key={ver.version} className="p-2 rounded-lg bg-slate-800/60 flex justify-between">
                    <span>
                      v{ver.version} · {ver.summary} ({ver.author})
                    </span>
                    <span className="text-slate-400">
                      {new Date(ver.date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

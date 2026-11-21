import React, { useState } from 'react';
import { ChevronRight, Star, X } from 'lucide-react';
import type { GameRecord } from '../types/chess';

interface HistoryViewProps {
  history: GameRecord[];
  ratings: Record<string, number>;
  onRateVariant: (variantId: string, stars: number) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  ratings,
  onRateVariant,
}) => {
  const [selectedRecord, setSelectedRecord] = useState<GameRecord | null>(null);
  const [editingRating, setEditingRating] = useState(false);

  const resultLabel: Record<GameRecord['result'], { text: string; color: string }> = {
    win: { text: 'Victoire', color: 'text-emerald-400' },
    loss: { text: 'Défaite', color: 'text-rose-400' },
    draw: { text: 'Match nul', color: 'text-amber-400' },
    saved: { text: 'Enregistré', color: 'text-sky-400' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Historique des parties
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ouvrez une partie pour consulter le détail complet du calcul ÉOL et modifier votre note.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] p-8 text-center text-sm text-slate-500">
          Aucune partie ou analyse enregistrée pour le moment.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c27] divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
          {history.map((rec) => {
            const rInfo = resultLabel[rec.result];
            const currentRating = rec.variantId ? ratings[rec.variantId] || 0 : 0;
            const delta = rec.eolBreakdown?.counted ? rec.eolBreakdown.delta : null;

            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => {
                  setSelectedRecord(rec);
                  setEditingRating(false);
                }}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors min-h-[68px]"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {rec.variantName}
                    </span>
                    <span className={`text-xs font-semibold ${rInfo.color}`}>
                      {rInfo.text}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {rec.type} · vs {rec.opponentName} ·{' '}
                    {new Date(rec.date).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {delta !== null && (
                    <span
                      className={`text-sm font-bold font-mono-num ${
                        delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {delta >= 0 ? '+' : ''}
                      {delta} ÉOL
                    </span>
                  )}
                  {currentRating > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-mono-num text-amber-400">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      {currentRating}/5
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Modale détail de partie & modification de la note */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-white dark:bg-[#151c27] p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">{selectedRecord.type}</div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  {selectedRecord.variantName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="p-2 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs p-3.5 rounded-xl bg-slate-50 dark:bg-[#0f151f] border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-400 block">Adversaire</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {selectedRecord.opponentName}
                  {selectedRecord.opponentEol ? ` (${selectedRecord.opponentEol} ÉOL)` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Résultat</span>
                <span className={`font-semibold ${resultLabel[selectedRecord.result].color}`}>
                  {resultLabel[selectedRecord.result].text}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Date</span>
                <span className="font-mono-num text-slate-900 dark:text-slate-100">
                  {new Date(selectedRecord.date).toLocaleString('fr-FR')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Coups joués</span>
                <span className="font-mono-num text-slate-900 dark:text-slate-100">
                  {selectedRecord.movesCount ?? '—'}
                </span>
              </div>
            </div>

            {selectedRecord.reason && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Motif : {selectedRecord.reason}
              </p>
            )}

            {/* Détail du calcul des ÉOL */}
            {selectedRecord.eolBreakdown && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f151f] space-y-2 text-xs">
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  Détail du calcul ÉOL
                </div>
                {selectedRecord.eolBreakdown.counted ? (
                  <div className="space-y-1 text-slate-600 dark:text-slate-300 font-mono-num">
                    <div className="flex justify-between">
                      <span>ÉOL avant → après :</span>
                      <span className="font-bold">
                        {selectedRecord.eolBreakdown.playerEolBefore} →{' '}
                        {selectedRecord.eolBreakdown.playerEolAfter} (
                        {selectedRecord.eolBreakdown.delta >= 0 ? '+' : ''}
                        {selectedRecord.eolBreakdown.delta})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Écart de classement :</span>
                      <span>
                        {selectedRecord.eolBreakdown.gap} (×
                        {selectedRecord.eolBreakdown.gapMultiplier.toFixed(2)})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gain de base :</span>
                      <span>{selectedRecord.eolBreakdown.baseGain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Familiarité ({selectedRecord.eolBreakdown.priorGames} parties) :</span>
                      <span>×{selectedRecord.eolBreakdown.familiarityMultiplier.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Difficulté ({selectedRecord.eolBreakdown.difficultyLabel}) :</span>
                      <span>×{selectedRecord.eolBreakdown.difficultyMultiplier.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Modificateur créateur :</span>
                      <span>×{selectedRecord.eolBreakdown.creatorMultiplier.toFixed(2)}</span>
                    </div>
                    {selectedRecord.eolBreakdown.discoveryLossProtectionApplied && (
                      <div className="text-emerald-400">
                        Protection découverte appliquée (−20 % sur perte)
                      </div>
                    )}
                    {selectedRecord.eolBreakdown.capped && (
                      <div className="text-amber-400">Plafond de bonus appliqué</div>
                    )}
                  </div>
                ) : (
                  <p className="text-amber-400">
                    {selectedRecord.eolBreakdown.reasonIfUncounted}
                  </p>
                )}
              </div>
            )}

            {/* Note attribuée — cliquer sur sa note actuelle pour modifier */}
            {selectedRecord.variantId && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Votre note pour cette variante
                </div>

                {!editingRating ? (
                  <button
                    type="button"
                    onClick={() => setEditingRating(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-amber-400 transition-colors min-h-[44px]"
                  >
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            (ratings[selectedRecord.variantId!] || 0) >= s
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-400'
                          }`}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-sky-400 font-medium">
                      {(ratings[selectedRecord.variantId] || 0) > 0
                        ? `${ratings[selectedRecord.variantId]}/5 — Cliquer pour modifier`
                        : 'Attribuer une note'}
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          onRateVariant(selectedRecord.variantId!, s);
                          setEditingRating(false);
                        }}
                        className="p-2 rounded-lg hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            (ratings[selectedRecord.variantId!] || 0) >= s
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-400'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

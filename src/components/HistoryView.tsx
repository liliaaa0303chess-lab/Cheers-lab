import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  Star,
  X,
} from 'lucide-react';
import {
  applyMove,
  createInitialGameState,
  type GameState,
} from '../engine/chessEngine';
import type {
  AppSettings,
  GameRecord,
  PieceDef,
  Variant,
} from '../types/chess';
import { getStarterVariants } from '../utils/defaultVariants';
import { ChessBoard } from './ChessBoard';

interface HistoryViewProps {
  history: GameRecord[];
  ratings: Record<string, number>;
  variants: Variant[];
  customPieces: PieceDef[];
  settings: AppSettings;
  onRateVariant: (variantId: string, stars: number) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  ratings,
  variants,
  customPieces,
  settings,
  onRateVariant,
}) => {
  const [selectedRecord, setSelectedRecord] = useState<GameRecord | null>(null);
  const [editingRating, setEditingRating] = useState(false);
  const [replayStep, setReplayStep] = useState<number>(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [showReplayBoard, setShowReplayBoard] = useState(false);

  const resultLabel: Record<GameRecord['result'], { text: string; color: string }> = {
    win: { text: 'Victoire', color: 'text-emerald-400' },
    loss: { text: 'Défaite', color: 'text-rose-400' },
    draw: { text: 'Match nul', color: 'text-amber-400' },
    saved: { text: 'Enregistré', color: 'text-sky-400' },
  };

  // Precompute all board snapshots for the currently selected game's replay
  const replaySnapshots: GameState[] = useMemo(() => {
    if (!selectedRecord || !selectedRecord.replayMoves || selectedRecord.replayMoves.length === 0) {
      return [];
    }
    const resolvedVariant =
      selectedRecord.variantSnapshot ||
      variants.find((v) => v.id === selectedRecord.variantId) ||
      getStarterVariants()[0];
    if (!resolvedVariant) return [];

    const combinedPieces = [...customPieces, ...(resolvedVariant.customPieceDefs || [])];
    const frames: GameState[] = [createInitialGameState(resolvedVariant, combinedPieces)];
    for (const move of selectedRecord.replayMoves) {
      const prev = frames[frames.length - 1];
      frames.push(applyMove(prev, move));
    }
    return frames;
  }, [selectedRecord, variants, customPieces]);

  useEffect(() => {
    if (!replayPlaying || replaySnapshots.length === 0) return;
    if (replayStep >= replaySnapshots.length - 1) {
      setReplayPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setReplayStep((s) => Math.min(replaySnapshots.length - 1, s + 1));
    }, 850);
    return () => clearTimeout(timer);
  }, [replayPlaying, replayStep, replaySnapshots.length]);

  const currentReplayState =
    replaySnapshots.length > 0
      ? replaySnapshots[Math.min(replayStep, replaySnapshots.length - 1)]
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Historique des parties
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ouvrez une partie pour la revoir coup par coup sur l’échiquier, consulter le détail ÉOL et modifier votre note.
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
            const hasReplay = Boolean(rec.replayMoves && rec.replayMoves.length > 0);

            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => {
                  setSelectedRecord(rec);
                  setEditingRating(false);
                  setReplayPlaying(false);
                  setReplayStep(0);
                  setShowReplayBoard(hasReplay);
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
                    {hasReplay && (
                      <span className="text-[11px] font-medium text-sky-400">
                        · Replay disponible
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {rec.type}
                    {rec.competitive === false ? ' (Amical)' : ''} · vs {rec.opponentName} ·{' '}
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

      {/* Modale détail + lecteur de replay coup par coup */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div
            className={`w-full ${
              showReplayBoard && currentReplayState ? 'max-w-2xl' : 'max-w-lg'
            } max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-white dark:bg-[#151c27] p-5 sm:p-6 space-y-4 shadow-2xl`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-400">
                  {selectedRecord.type}
                  {selectedRecord.competitive === false ? ' · Amical (sans ÉOL)' : ''}
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  {selectedRecord.variantName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplayPlaying(false);
                  setSelectedRecord(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lecteur interactif de replay coup par coup */}
            {replaySnapshots.length > 0 && currentReplayState && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0d121a] p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReplayBoard((v) => !v);
                      setReplayPlaying(false);
                    }}
                    className="text-xs font-semibold text-sky-400 hover:underline"
                  >
                    {showReplayBoard ? 'Masquer l’échiquier de replay' : 'Revoir la partie sur l’échiquier'}
                  </button>
                  <span className="text-xs font-mono-num text-slate-400">
                    Coup {replayStep} / {replaySnapshots.length - 1}
                  </span>
                </div>

                {showReplayBoard && (
                  <>
                    <ChessBoard
                      board={currentReplayState.board}
                      pieces={currentReplayState.pieces}
                      customPieces={[
                        ...customPieces,
                        ...(currentReplayState.variant.customPieceDefs || []),
                      ]}
                      settings={settings}
                      lastMove={currentReplayState.lastMove}
                      viewerSide={selectedRecord.playerSide || 'white'}
                      compact
                    />

                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayStep(0);
                        }}
                        disabled={replayStep === 0}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-35"
                        aria-label="Début"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayStep((s) => Math.max(0, s - 1));
                        }}
                        disabled={replayStep === 0}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-35"
                        aria-label="Coup précédent"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (replayStep >= replaySnapshots.length - 1) {
                            setReplayStep(0);
                            setReplayPlaying(true);
                          } else {
                            setReplayPlaying((p) => !p);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs min-h-[38px]"
                      >
                        {replayPlaying ? (
                          <>
                            <Pause className="w-4 h-4" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            <span>Lecture</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayStep((s) =>
                            Math.min(replaySnapshots.length - 1, s + 1)
                          );
                        }}
                        disabled={replayStep >= replaySnapshots.length - 1}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-35"
                        aria-label="Coup suivant"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayStep(replaySnapshots.length - 1);
                        }}
                        disabled={replayStep >= replaySnapshots.length - 1}
                        className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-35"
                        aria-label="Fin"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>

                    {currentReplayState.moveHistory.length > 0 && (
                      <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1 pt-1">
                        {replaySnapshots[replaySnapshots.length - 1].moveHistory.map(
                          (notation, idx) => {
                            const moveNum = idx + 1;
                            const isActive = replayStep === moveNum;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setReplayPlaying(false);
                                  setReplayStep(moveNum);
                                }}
                                className={`px-2 py-1 rounded text-xs font-mono-num border transition-colors ${
                                  isActive
                                    ? 'border-sky-400 bg-sky-500/20 text-sky-300 font-semibold'
                                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                {moveNum}. {notation}
                              </button>
                            );
                          }
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

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
                    {selectedRecord.eolBreakdown.modeMultiplier !== undefined &&
                      selectedRecord.eolBreakdown.modeMultiplier < 1 && (
                        <div className="flex justify-between text-sky-400">
                          <span>Modificateur mode (IA / Local) :</span>
                          <span>×{selectedRecord.eolBreakdown.modeMultiplier.toFixed(2)} (−50 %)</span>
                        </div>
                      )}
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

            {/* Note attribuée */}
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

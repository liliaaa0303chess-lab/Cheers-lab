import React, { useMemo } from 'react';
import { getPieceName } from '../engine/chessEngine';
import {
  computeControlledDifficulty,
  DIFFICULTY_COEFFICIENTS,
  getFamiliarityInfo,
} from '../engine/eol';
import { compileVariantRules } from '../engine/ruleParser';
import type { PieceDef, Profile, Variant } from '../types/chess';

interface VariantRulesSummaryProps {
  variant: Variant;
  profile: Profile;
  customPieces: PieceDef[];
  showEolPreview?: boolean;
  compact?: boolean;
}

export const VariantRulesSummary: React.FC<VariantRulesSummaryProps> = ({
  variant,
  profile,
  customPieces,
  showEolPreview = true,
  compact = false,
}) => {
  const controlledDiff =
    variant.controlledDifficulty || computeControlledDifficulty(variant);
  const diffCoeff = DIFFICULTY_COEFFICIENTS[controlledDiff];
  const priorGames = profile.variantPlayCounts?.[variant.id] || 0;
  const familiarity = getFamiliarityInfo(priorGames);
  const isCreator = variant.creatorId === profile.id;

  const pieceMap: Record<string, PieceDef> = {};
  for (const p of customPieces) pieceMap[p.id] = p;
  for (const p of variant.customPieceDefs || []) pieceMap[p.id] = p;

  const activeCustomPieces = (variant.pieces || [])
    .map((id) => pieceMap[id])
    .filter(Boolean);

  const compiled = useMemo(
    () => compileVariantRules(variant, Object.values(pieceMap)),
    [variant, customPieces]
  );

  const victoryLabels: Record<string, string> = {
    checkmate_or_king: 'Mettre le Roi adverse échec et mat (ou capturer le Roi).',
    eliminate_all: 'Capturer toutes les pièces adverses.',
    king_of_hill: 'Mater le Roi adverse ou amener votre Roi sur une case spéciale ✦.',
    capture_count: `Atteindre ${variant.captureTarget || 5} captures avant l’adversaire.`,
    custom: variant.goal || 'Selon la règle décrite par le créateur.',
  };

  return (
    <div className="space-y-3 text-sm">
      {/* En-tête de variante & infos ÉOL */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {variant.name}
          </h3>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Créateur : {variant.creator || 'Inconnu'} · {variant.board.rows}×{variant.board.cols} · {variant.players} joueurs
          </div>
        </div>
        <div className="text-xs font-mono-num text-slate-600 dark:text-slate-300">
          Difficulté : {controlledDiff} (×{diffCoeff.toFixed(2)})
        </div>
      </div>

      {showEolPreview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-100/80 dark:bg-[#0f151f] border border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Parties jouées</div>
            <div className="font-semibold font-mono-num text-slate-900 dark:text-slate-100 mt-0.5">
              {priorGames}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Familiarité</div>
            <div className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {familiarity.label}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Protection perte</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {familiarity.isDiscovery ? '−20 % sur défaite' : 'Aucune'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Modif. créateur</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {isCreator ? '−40 % (votre variante)' : 'Standard (×1,00)'}
            </div>
          </div>
        </div>
      )}

      {/* Résumé structuré et compact des règles */}
      <div className={`grid grid-cols-1 ${compact ? '' : 'sm:grid-cols-2'} gap-3`}>
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111823] space-y-1">
          <div className="text-xs font-semibold text-sky-500">Objectif & Conditions</div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {variant.goal || victoryLabels[variant.victoryType]}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Actions/tour : {variant.actions || 1} · Pendule :{' '}
            {variant.duration > 0
              ? `${variant.duration} min${variant.incrementSec ? ` + ${variant.incrementSec} s/coup` : ''}`
              : 'Illimitée'}
          </p>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111823] space-y-1">
          <div className="text-xs font-semibold text-amber-400">Plateau & Cases spéciales</div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {(variant.board.blocked?.length || 0) > 0
              ? `${variant.board.blocked.length} case(s) bloquée(s). `
              : 'Aucune case bloquée. '}
            {(variant.board.special?.length || 0) > 0
              ? `${variant.board.special.length} case(s) spéciale(s) ✦ : ${
                  variant.board.specialEffect || variant.board.specialEffectType || 'effet actif'
                }.`
              : 'Aucune case spéciale.'}
          </p>
        </div>
      </div>

      {compiled.activeRules.length > 0 && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
          <div className="text-xs font-semibold text-emerald-500">
            Règles actives appliquées par le moteur
          </div>
          <div className="flex flex-wrap gap-1.5">
            {compiled.activeRules.map((rule, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300"
              >
                {rule.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {activeCustomPieces.length > 0 && (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111823] space-y-2">
          <div className="text-xs font-semibold text-violet-400">
            Pièces personnalisées & Pouvoirs
          </div>
          <div className="space-y-1.5">
            {activeCustomPieces.map((p) => (
              <div key={p.id} className="text-xs text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {p.symbol} {getPieceName(p.id, pieceMap)}
                </span>
                {' — '}
                {[
                  p.moves.rook && 'Tour',
                  p.moves.bishop && 'Fou',
                  p.moves.knight && 'Cavalier',
                  p.moves.king && 'Roi',
                  p.moves.pawn && 'Pion',
                  p.moves.forwardOnly && 'Avant uniquement',
                  p.moves.noCapture && 'Ne capture pas',
                  p.customMoves,
                ]
                  .filter(Boolean)
                  .join(' + ')}
                {p.powerType !== 'none' && (
                  <span className="text-violet-400">
                    {' '}
                    · Pouvoir : {p.powers || p.powerType} (max {p.limits || 'illimité'})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {variant.rules && (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111823]">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            Règles complémentaires
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">
            {variant.rules}
          </p>
        </div>
      )}
    </div>
  );
};

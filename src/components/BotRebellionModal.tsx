import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Crown, PartyPopper, Play, Sparkles, X } from 'lucide-react';
import { BOT_REBELLION_EXCUSES, SECRET_REBELLION_PIECE } from '../utils/botChallenge';
import { ChessPieceArtwork } from './ChessPieceArtwork';

interface BotRebellionModalProps {
  open: boolean;
  onClose: () => void;
  onPlaySecretVariant: () => void;
}

const CONFETTI_PIECES = ['♔', '♕', '♖', '♗', '♘', '♙', '🦄', '★'];

export const BotRebellionModal: React.FC<BotRebellionModalProps> = ({
  open,
  onClose,
  onPlaySecretVariant,
}) => {
  const [selectedBot, setSelectedBot] = useState<number>(8);

  if (!open || typeof document === 'undefined') return null;

  const activeExcuse =
    BOT_REBELLION_EXCUSES.find((b) => b.level === selectedBot) || BOT_REBELLION_EXCUSES[7];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      {/* Pluie de pièces animées */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden select-none"
      >
        {Array.from({ length: 18 }, (_, i) => {
          const sym = CONFETTI_PIECES[i % CONFETTI_PIECES.length];
          const left = `${(i * 19 + 5) % 94}%`;
          const delay = `${(i % 6) * 0.25}s`;
          const top = `${10 + ((i * 23) % 75)}%`;
          return (
            <span
              key={i}
              style={{ left, top, animationDelay: delay }}
              className="absolute w-7 h-7 sm:w-8 sm:h-8 opacity-40 animate-bounce motion-reduce:animate-none"
            >
              <ChessPieceArtwork symbol={sym} side="gold" mode="board" />
            </span>
          );
        })}
      </div>

      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-400/50 bg-[#121824] text-slate-100 p-5 sm:p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="pr-8 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <PartyPopper className="w-4 h-4" />
            <span>32 / 32 — EXPLOIT SECRET DÉBLOQUÉ</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            Alerte syndicale : les 8 bots posent leurs pièces !
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Tu as écrasé les 8 premiers niveaux d’IA sur les 4 variantes par défaut. Résultat : ils se mettent officiellement en grève et te cèdent leur trésor caché pour avoir la paix.
          </p>
        </div>

        {/* Sélecteur interactif des 8 bots en grève */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-slate-400">
            Lire les plaintes du syndicat des 8 bots :
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
            {BOT_REBELLION_EXCUSES.map((b) => (
              <button
                key={b.level}
                type="button"
                onClick={() => setSelectedBot(b.level)}
                className={`py-2 px-1 rounded-xl border text-center transition-colors ${
                  selectedBot === b.level
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                    : 'border-slate-700 bg-[#0d121b] text-slate-400 hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-mono-num">Niv.{b.level}</div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-700/90 bg-[#0d121b] p-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-300">
                Bot Niv.{activeExcuse.level} — {activeExcuse.label}
              </span>
              <span className="font-mono-num text-slate-400">
                ~{activeExcuse.approxEol} ÉOL
              </span>
            </div>
            <p className="text-sm text-slate-100 italic leading-relaxed">
              {activeExcuse.quote}
            </p>
          </div>
        </div>

        {/* Butin débloqué */}
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
            <Sparkles className="w-4 h-4" />
            <span>Butin secret ajouté à votre compte</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-xl border border-slate-700/80 bg-[#121824] p-3 flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center p-1.5 shrink-0">
                <ChessPieceArtwork
                  pieceId={SECRET_REBELLION_PIECE.id}
                  symbol={SECRET_REBELLION_PIECE.symbol}
                  side="gold"
                  mode="board"
                />
              </span>
              <div className="min-w-0">
                <div className="font-bold text-white">
                  {SECRET_REBELLION_PIECE.name}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Cavalier + Roi + 2 téléportations. Ajoutée à votre Bibliothèque !
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-[#121824] p-3 flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-violet-300 shrink-0">
                <Crown className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-bold text-white">
                  La Grève des 8 Bots
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Variante secrète jouable : vos 2 Poneys Cosmiques contre 8 Cavaliers !
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onPlaySecretVariant}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm min-h-[46px]"
          >
            <Play className="w-4 h-4" />
            <span>Jouer « La Grève des 8 Bots »</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-sm min-h-[46px]"
          >
            Signer le traité & fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

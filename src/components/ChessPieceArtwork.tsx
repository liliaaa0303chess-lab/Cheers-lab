import React, { useId } from 'react';
import type { PieceTexture, PlayerSide } from '../types/chess';

export interface ChessPieceArtworkProps {
  pieceId?: string;
  symbol?: string;
  side?: PlayerSide;
  texture?: PieceTexture;
  lightColor?: string;
  darkColor?: string;
  mode?: 'board' | 'emblem';
  bgColor?: string;
  className?: string;
}

type CanonicalKind =
  | 'king'
  | 'queen'
  | 'rook'
  | 'bishop'
  | 'knight'
  | 'pawn'
  | 'star'
  | 'bolt'
  | 'sparkle'
  | 'pentagon'
  | 'comet'
  | 'yinyang'
  | 'orb'
  | 'diamond'
  | 'unicorn'
  | 'bot'
  | 'fallback';

function resolvePieceKind(pieceId?: string, symbol?: string): CanonicalKind {
  if (pieceId === 'builtin:K') return 'king';
  if (pieceId === 'builtin:Q') return 'queen';
  if (pieceId === 'builtin:R') return 'rook';
  if (pieceId === 'builtin:B') return 'bishop';
  if (pieceId === 'builtin:N') return 'knight';
  if (pieceId === 'builtin:P') return 'pawn';

  const sym = (symbol || '').trim();
  switch (sym) {
    case '♔':
    case '♚':
      return 'king';
    case '♕':
    case '♛':
      return 'queen';
    case '♖':
    case '♜':
      return 'rook';
    case '♗':
    case '♝':
      return 'bishop';
    case '♘':
    case '♞':
      return 'knight';
    case '♙':
    case '♟':
      return 'pawn';
    case '★':
    case '☆':
      return 'star';
    case '⚡':
      return 'bolt';
    case '✦':
      return 'sparkle';
    case '⬟':
    case '⬠':
      return 'pentagon';
    case '☄':
      return 'comet';
    case '☯':
      return 'yinyang';
    case '●':
    case '◉':
      return 'orb';
    case '◆':
    case '◇':
      return 'diamond';
    case '🦄':
      return 'unicorn';
    case '🤖':
      return 'bot';
    default:
      return 'fallback';
  }
}

function hexLuminance(hex?: string): number | null {
  if (!hex) return null;
  const clean = hex.trim().replace(/^#/, '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

interface PaletteStops {
  top: string;
  mid: string;
  bottom: string;
  stroke: string;
  detail: string;
  highlight: string;
}

function getBoardPalette(
  side: PlayerSide,
  texture: PieceTexture,
  lightColor?: string,
  darkColor?: string
): PaletteStops {
  const customWhite = lightColor && lightColor.toLowerCase() !== '#f8f9fc';
  const customBlack = darkColor && darkColor.toLowerCase() !== '#181d26';

  if (side === 'white' && customWhite) {
    return {
      top: '#ffffff',
      mid: lightColor!,
      bottom: '#b8c3d1',
      stroke: '#18202c',
      detail: '#2d3748',
      highlight: 'rgba(255,255,255,0.85)',
    };
  }
  if (side === 'black' && customBlack) {
    return {
      top: '#4b5563',
      mid: darkColor!,
      bottom: '#0b0e14',
      stroke: '#e8eef7',
      detail: '#cbd5e1',
      highlight: 'rgba(255,255,255,0.28)',
    };
  }

  if (side === 'white') {
    if (texture === 'wood') {
      return {
        top: '#fff5e0',
        mid: '#efd3a0',
        bottom: '#be9155',
        stroke: '#3c2410',
        detail: '#5c3818',
        highlight: 'rgba(255,250,235,0.85)',
      };
    }
    if (texture === 'stone') {
      return {
        top: '#f4f6f8',
        mid: '#d5dbe2',
        bottom: '#9ca6b2',
        stroke: '#1e2530',
        detail: '#374151',
        highlight: 'rgba(255,255,255,0.82)',
      };
    }
    if (texture === 'metal') {
      return {
        top: '#ffffff',
        mid: '#dbe5ef',
        bottom: '#8ea2b8',
        stroke: '#131d2b',
        detail: '#2c3d52',
        highlight: 'rgba(255,255,255,0.95)',
      };
    }
    if (texture === 'marble') {
      return {
        top: '#ffffff',
        mid: '#f0ede6',
        bottom: '#c9c5bc',
        stroke: '#1b2230',
        detail: '#3c4657',
        highlight: 'rgba(255,255,255,0.9)',
      };
    }
    return {
      top: '#ffffff',
      mid: '#f1f5f9',
      bottom: '#cbd5e1',
      stroke: '#151c28',
      detail: '#334155',
      highlight: 'rgba(255,255,255,0.92)',
    };
  }

  if (side === 'black') {
    if (texture === 'wood') {
      return {
        top: '#7d4d2a',
        mid: '#4e2b13',
        bottom: '#261206',
        stroke: '#f5dfc1',
        detail: '#e2bd8b',
        highlight: 'rgba(255,222,179,0.28)',
      };
    }
    if (texture === 'stone') {
      return {
        top: '#606874',
        mid: '#39404b',
        bottom: '#1b2028',
        stroke: '#e5e9f0',
        detail: '#cbd5e1',
        highlight: 'rgba(255,255,255,0.24)',
      };
    }
    if (texture === 'metal') {
      return {
        top: '#64748b',
        mid: '#2c3849',
        bottom: '#0f1623',
        stroke: '#e2e8f0',
        detail: '#cbd5e1',
        highlight: 'rgba(241,245,249,0.34)',
      };
    }
    if (texture === 'marble') {
      return {
        top: '#4c5566',
        mid: '#282f3d',
        bottom: '#10141c',
        stroke: '#eef2f6',
        detail: '#cbd5e1',
        highlight: 'rgba(255,255,255,0.25)',
      };
    }
    return {
      top: '#424c5c',
      mid: '#1d2430',
      bottom: '#0b0f17',
      stroke: '#eef2f8',
      detail: '#cbd5e1',
      highlight: 'rgba(255,255,255,0.28)',
    };
  }

  if (side === 'red') {
    return {
      top: '#fca5a5',
      mid: '#ef4444',
      bottom: '#991b1b',
      stroke: '#2a0808',
      detail: '#fee2e2',
      highlight: 'rgba(255,228,228,0.55)',
    };
  }
  if (side === 'blue') {
    return {
      top: '#bae6fd',
      mid: '#38bdf8',
      bottom: '#0369a1',
      stroke: '#071f33',
      detail: '#e0f2fe',
      highlight: 'rgba(224,242,254,0.6)',
    };
  }
  if (side === 'green') {
    return {
      top: '#a7f3d0',
      mid: '#10b981',
      bottom: '#047857',
      stroke: '#042419',
      detail: '#d1fae5',
      highlight: 'rgba(209,250,229,0.55)',
    };
  }
  // gold
  return {
    top: '#fef08a',
    mid: '#f59e0b',
    bottom: '#92400e',
    stroke: '#2c1702',
    detail: '#fef3c7',
    highlight: 'rgba(255,251,235,0.65)',
  };
}

function getEmblemPalette(bgColor?: string): PaletteStops {
  const lum = hexLuminance(bgColor);
  if (lum !== null && lum > 0.38) {
    // Bright background -> sculpted deep obsidian & steel palette
    return {
      top: '#334155',
      mid: '#0f172a',
      bottom: '#020617',
      stroke: 'rgba(255,255,255,0.55)',
      detail: '#e2e8f0',
      highlight: 'rgba(255,255,255,0.32)',
    };
  }
  // Dark/rich background -> sculpted ivory & warm champagne-gold palette
  return {
    top: '#ffffff',
    mid: '#f1f5f9',
    bottom: '#cbd5e1',
    stroke: '#0f172a',
    detail: '#334155',
    highlight: 'rgba(255,255,255,0.85)',
  };
}

export const ChessPieceArtwork: React.FC<ChessPieceArtworkProps> = ({
  pieceId,
  symbol,
  side = 'white',
  texture = 'plain',
  lightColor,
  darkColor,
  mode = 'board',
  bgColor,
  className = 'w-full h-full',
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `cp-g-${uid}`;
  const accentId = `cp-a-${uid}`;
  const kind = resolvePieceKind(pieceId, symbol);

  const pal =
    mode === 'emblem'
      ? getEmblemPalette(bgColor)
      : getBoardPalette(side, texture, lightColor, darkColor);

  const commonStroke = {
    stroke: pal.stroke,
    strokeWidth: 2.35,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="18%" y1="6%" x2="82%" y2="96%">
          <stop offset="0%" stopColor={pal.top} />
          <stop offset="52%" stopColor={pal.mid} />
          <stop offset="100%" stopColor={pal.bottom} />
        </linearGradient>
        <linearGradient id={accentId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>

      {kind === 'king' && (
        <g>
          {/* Croix royale */}
          <path
            d="M29.5 6.5 H34.5 V11 H39 V15.5 H34.5 V20 H29.5 V15.5 H25 V11 H29.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Couronne & lobes */}
          <path
            d="M15 26 C13 20 20 16.5 26 20.5 L32 17 L38 20.5 C44 16.5 51 20 49 26 L44.5 41 H19.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Arête & reflets */}
          <path
            d="M32 18.5 V40 M21 25 C25 23 29 24.5 32 27.5 C35 24.5 39 23 43 25"
            fill="none"
            stroke={pal.detail}
            strokeWidth={1.7}
            strokeLinecap="round"
            opacity={0.7}
          />
          {/* Collier */}
          <rect
            x="17.5"
            y="41"
            width="29"
            height="5"
            rx="2.5"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Socle double Staunton */}
          <path
            d="M15.5 46 H48.5 L51 51.5 H13 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <rect
            x="11"
            y="51.5"
            width="42"
            height="6"
            rx="2.6"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M16 54.2 H48"
            stroke={pal.highlight}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'queen' && (
        <g>
          {/* Perles au sommet des pointes */}
          {[
            [11.5, 19],
            [21, 13.5],
            [32, 11],
            [43, 13.5],
            [52.5, 19],
          ].map(([cx, cy], idx) => (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={idx === 2 ? 3.2 : 2.6}
              fill={`url(#${gradId})`}
              {...commonStroke}
            />
          ))}
          {/* Diadème à 5 pointes */}
          <path
            d="M12.5 22 L20.5 31.5 L21.5 16.5 L28 29 L32 14.5 L36 29 L42.5 16.5 L43.5 31.5 L51.5 22 L45 41 H19 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Bague & diadème central */}
          <circle cx="32" cy="34.5" r="2.2" fill={pal.detail} opacity={0.65} />
          <rect
            x="17"
            y="41"
            width="30"
            height="5"
            rx="2.5"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M15 46 H49 L51.5 51.5 H12.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <rect
            x="10.5"
            y="51.5"
            width="43"
            height="6"
            rx="2.6"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M16 54.2 H48"
            stroke={pal.highlight}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'rook' && (
        <g>
          {/* Créneaux de forteresse */}
          <path
            d="M16 11 H22.5 V16 H28.5 V11 H35.5 V16 H41.5 V11 H48 V22.5 L43 26.5 V42 H21 V26.5 L16 22.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Détails architecturaux */}
          <path
            d="M21.5 26 H42.5 M25 30 V39 M39 30 V39"
            fill="none"
            stroke={pal.detail}
            strokeWidth={1.7}
            strokeLinecap="round"
            opacity={0.62}
          />
          {/* Socle */}
          <path
            d="M17.5 42 H46.5 L49.5 49.5 H14.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <rect
            x="12"
            y="49.5"
            width="40"
            height="7"
            rx="2.6"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M16.5 52.8 H47.5"
            stroke={pal.highlight}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'bishop' && (
        <g>
          {/* Sphère sommitale */}
          <circle cx="32" cy="10.5" r="3.4" fill={`url(#${gradId})`} {...commonStroke} />
          {/* Mitre sculptée */}
          <path
            d="M32 14 C21.5 20.5 18.5 31 21.5 40.5 H42.5 C45.5 31 42.5 20.5 32 14 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Entaille de la mitre */}
          <path
            d="M37 22 L28.5 30.5 M29.5 23.5 L34.5 28.5"
            stroke={pal.detail}
            strokeWidth={2.2}
            strokeLinecap="round"
            opacity={0.8}
          />
          {/* Collier */}
          <rect
            x="19"
            y="40.5"
            width="26"
            height="4.8"
            rx="2.4"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Pied & socle */}
          <path
            d="M16.5 45.3 H47.5 L50 51.5 H14 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <rect
            x="11.5"
            y="51.5"
            width="41"
            height="6"
            rx="2.6"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M16.5 54.3 H47.5"
            stroke={pal.highlight}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'knight' && (
        <g>
          {/* Silhouette sculptée de cavalier Staunton */}
          <path
            d="M23 45.5 C22 39 25 35.5 29.5 31.5 C26.5 30.5 21 32 17.5 32.5 C14.5 32.8 13.2 30.5 14 28 C15 24.8 19.5 20.5 22.8 18 L22.2 12 L27.5 14.5 L30.5 9.5 C39.5 11.5 47.5 19 48.5 30.5 C49.1 37 47 41.5 44.5 45.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Crinière et œil */}
          <path
            d="M34.5 15 C40.5 18 43.8 24 44.2 32.5 M18.5 28.5 L20.5 27"
            fill="none"
            stroke={pal.detail}
            strokeWidth={1.9}
            strokeLinecap="round"
            opacity={0.78}
          />
          <circle cx="25.5" cy="20.5" r="1.75" fill={pal.stroke} />
          {/* Collier & socle */}
          <path
            d="M17 45.5 H47 L49.5 51.2 H14.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <rect
            x="12"
            y="51.2"
            width="40"
            height="6.2"
            rx="2.6"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M16.5 54 H47.5"
            stroke={pal.highlight}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'pawn' && (
        <g>
          {/* Tête ronde */}
          <circle cx="32" cy="18.5" r="7.5" fill={`url(#${gradId})`} {...commonStroke} />
          <path
            d="M28.5 15.5 A4.5 4.5 0 0 1 34 14.2"
            fill="none"
            stroke={pal.highlight}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          {/* Collerette */}
          <rect
            x="22.5"
            y="26"
            width="19"
            height="4.4"
            rx="2.2"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Corps fuselé */}
          <path
            d="M25.5 30.4 C24 37.5 21 43 17.5 47.5 H46.5 C43 43 40 37.5 38.5 30.4 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {/* Socle */}
          <rect
            x="14"
            y="47.5"
            width="36"
            height="4.5"
            rx="2"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <rect
            x="12"
            y="52"
            width="40"
            height="5.5"
            rx="2.5"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M16.5 54.5 H47.5"
            stroke={pal.highlight}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'star' && (
        <g>
          <path
            d="M32 7 L39.2 21.8 L55.5 24.1 L43.6 35.6 L46.5 51.8 L32 44.1 L17.5 51.8 L20.4 35.6 L8.5 24.1 L24.8 21.8 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M32 16 L35.8 25.5 L45.5 27 L38.5 33.8 L40.2 43.2 L32 38.8 L23.8 43.2 L25.5 33.8 L18.5 27 L28.2 25.5 Z"
            fill="none"
            stroke={pal.detail}
            strokeWidth={1.5}
            opacity={0.55}
          />
        </g>
      )}

      {kind === 'bolt' && (
        <g>
          <path
            d="M36.5 6.5 L14.5 34.5 H30 L25.5 57.5 L49.5 28 H34 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M34 15 L23.5 30.5 H33 L30.5 45.5"
            fill="none"
            stroke={pal.highlight}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'sparkle' && (
        <g>
          <path
            d="M32 6 C34.5 21 43 29.5 58 32 C43 34.5 34.5 43 32 58 C29.5 43 21 34.5 6 32 C21 29.5 29.5 21 32 6 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <circle cx="32" cy="32" r="5" fill={pal.detail} opacity={0.45} />
        </g>
      )}

      {kind === 'pentagon' && (
        <g>
          <path
            d="M32 8 L54.5 24.5 L46 51.5 H18 L9.5 24.5 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M32 16.5 L45.5 26.5 L40.2 43.5 H23.8 L18.5 26.5 Z"
            fill="none"
            stroke={pal.detail}
            strokeWidth={1.6}
            opacity={0.62}
          />
        </g>
      )}

      {kind === 'comet' && (
        <g>
          <path
            d="M11 53 C16 40 24 30 36 22 M17 55 C23 44 31 35 42 28 M24 55 C31 46 38 39 46 34"
            fill="none"
            stroke={pal.stroke}
            strokeWidth={4.2}
            strokeLinecap="round"
            opacity={0.55}
          />
          <path
            d="M11 53 C16 40 24 30 36 22 M17 55 C23 44 31 35 42 28 M24 55 C31 46 38 39 46 34"
            fill="none"
            stroke={pal.mid}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <circle cx="43" cy="21" r="11.5" fill={`url(#${gradId})`} {...commonStroke} />
          <circle cx="40.5" cy="18.5" r="3.5" fill={pal.highlight} />
        </g>
      )}

      {kind === 'yinyang' && (
        <g>
          <circle cx="32" cy="32" r="22.5" fill={`url(#${gradId})`} {...commonStroke} />
          <path
            d="M32 9.5 A11.25 11.25 0 0 1 32 32 A11.25 11.25 0 0 0 32 54.5 A22.5 22.5 0 0 0 32 9.5 Z"
            fill={pal.stroke}
          />
          <circle cx="32" cy="20.75" r="3.6" fill={pal.mid} />
          <circle cx="32" cy="43.25" r="3.6" fill={pal.stroke} />
        </g>
      )}

      {kind === 'orb' && (
        <g>
          <circle cx="32" cy="32" r="20.5" fill={`url(#${gradId})`} {...commonStroke} />
          <circle
            cx="32"
            cy="32"
            r="12"
            fill="none"
            stroke={pal.detail}
            strokeWidth={1.6}
            opacity={0.55}
          />
          <path
            d="M21 24 A13 13 0 0 1 36 16.5"
            fill="none"
            stroke={pal.highlight}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'diamond' && (
        <g>
          <path
            d="M32 6.5 L55.5 32 L32 57.5 L8.5 32 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M32 16 L45.5 32 L32 48 L18.5 32 Z M32 6.5 V57.5 M8.5 32 H55.5"
            fill="none"
            stroke={pal.detail}
            strokeWidth={1.45}
            opacity={0.55}
          />
        </g>
      )}

      {kind === 'unicorn' && (
        <g>
          {/* Corne cosmique en spirale */}
          <path
            d="M27.5 18 L18.5 5.5 L31.5 15.5 Z"
            fill={`url(#${accentId})`}
            stroke={pal.stroke}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          {/* Tête & crinière cosmique */}
          <path
            d="M22 46 C21.5 39.5 25 36 29.5 32.5 C25 32 19.5 33 16 32.5 C13.5 32 12.8 29.5 14 27.2 C15.8 24 20.5 20.2 25 18 L27 12.5 L31.5 15.5 C40.5 16.5 48 23.5 48.5 34 C48.8 39.5 46.5 43.2 44 46 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <path
            d="M35 18.5 C41 21 44.5 26.5 44.5 34.5"
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <circle cx="25.5" cy="22.5" r="1.7" fill={pal.stroke} />
          {/* Socle étoilé */}
          <path
            d="M16.5 46 H47.5 L50 51.5 H14 Z"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          <rect
            x="12"
            y="51.5"
            width="40"
            height="5.8"
            rx="2.6"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
        </g>
      )}

      {kind === 'bot' && (
        <g>
          {/* Antenne */}
          <line x1="32" y1="8.5" x2="32" y2="16" stroke={pal.stroke} strokeWidth={2.6} strokeLinecap="round" />
          <circle cx="32" cy="8.5" r="3" fill={`url(#${accentId})`} stroke={pal.stroke} strokeWidth={1.8} />
          {/* Visière & châssis */}
          <rect x="14" y="16" width="36" height="27" rx="8" fill={`url(#${gradId})`} {...commonStroke} />
          <rect x="19" y="23.5" width="26" height="10" rx="4.5" fill={pal.stroke} />
          <circle cx="26" cy="28.5" r="2.5" fill="#38bdf8" />
          <circle cx="38" cy="28.5" r="2.5" fill="#38bdf8" />
          <path d="M24 38.5 H40" stroke={pal.detail} strokeWidth={2} strokeLinecap="round" />
          <rect x="16" y="46.5" width="32" height="7" rx="3" fill={`url(#${gradId})`} {...commonStroke} />
        </g>
      )}

      {kind === 'fallback' && (
        <g>
          <polygon
            points="32,8 51,21 44,50 20,50 13,21"
            fill={`url(#${gradId})`}
            {...commonStroke}
          />
          {symbol ? (
            <text
              x="32"
              y="38"
              textAnchor="middle"
              fontSize="20"
              fontWeight="800"
              fill={pal.stroke}
            >
              {symbol.slice(0, 2)}
            </text>
          ) : null}
        </g>
      )}
    </svg>
  );
};

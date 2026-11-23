import React, { useMemo } from 'react';

interface VictoryEffectsProps {
  active: boolean;
  confettiEnabled: boolean;
  starburstEnabled: boolean;
  signatureMateEnabled: boolean;
}

const COLORS = [
  '#fbbf24',
  '#38bdf8',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
];

export const VictoryEffects: React.FC<VictoryEffectsProps> = ({
  active,
  confettiEnabled,
  starburstEnabled,
  signatureMateEnabled,
}) => {
  const particles = useMemo(() => {
    const count = signatureMateEnabled ? 42 : starburstEnabled ? 30 : 22;
    return Array.from({ length: count }, (_, idx) => {
      const left = ((idx * 37 + 11) % 94) + 3;
      const delay = ((idx * 17) % 10) * 0.08;
      const duration = 1.9 + ((idx * 13) % 7) * 0.22;
      const color = COLORS[idx % COLORS.length];
      const isStar = (starburstEnabled || signatureMateEnabled) && idx % 3 === 0;
      return { idx, left, delay, duration, color, isStar };
    });
  }, [starburstEnabled, signatureMateEnabled]);

  if (!active || (!confettiEnabled && !starburstEnabled && !signatureMateEnabled)) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      {signatureMateEnabled && (
        <div className="absolute inset-0 bg-radial from-amber-400/20 via-transparent to-transparent animate-pulse" />
      )}
      {particles.map((p) => (
        <span
          key={p.idx}
          className="absolute top-[-24px] select-none animate-confetti-fall motion-reduce:hidden"
          style={{
            left: `${p.left}%`,
            color: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.isStar ? (
            <span className="text-base drop-shadow">✦</span>
          ) : (
            <span
              className="block w-2.5 h-3.5 rounded-xs"
              style={{ backgroundColor: p.color }}
            />
          )}
        </span>
      ))}
    </div>
  );
};

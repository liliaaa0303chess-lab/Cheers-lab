let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function beep(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  const vol = Math.max(0, Math.min(1, volume / 100)) * 0.25;
  if (vol <= 0.001) return;

  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function playChessSound(
  kind: 'move' | 'capture' | 'check' | 'power' | 'win' | 'draw',
  enabled: boolean,
  volume: number
) {
  if (!enabled || volume <= 0) return;
  if (kind === 'move') {
    beep(240, 0.06, 'triangle', volume);
  } else if (kind === 'capture') {
    beep(170, 0.08, 'sawtooth', volume);
    beep(310, 0.05, 'triangle', volume * 0.7, 0.03);
  } else if (kind === 'check') {
    beep(520, 0.09, 'sine', volume);
    beep(680, 0.11, 'sine', volume, 0.07);
  } else if (kind === 'power') {
    beep(420, 0.08, 'sine', volume);
    beep(630, 0.12, 'sine', volume, 0.06);
  } else if (kind === 'win') {
    beep(440, 0.1, 'triangle', volume);
    beep(554, 0.1, 'triangle', volume, 0.09);
    beep(659, 0.18, 'triangle', volume, 0.18);
  } else if (kind === 'draw') {
    beep(392, 0.12, 'sine', volume);
    beep(392, 0.12, 'sine', volume, 0.14);
  }
}

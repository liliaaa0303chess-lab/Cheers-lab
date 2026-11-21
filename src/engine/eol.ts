import type { EolBreakdown, Variant, VariantDifficulty } from '../types/chess';

export const INITIAL_EOL = 400;
const BASE_EOL = 20;
const MAX_COMBINED_MULTIPLIER = 2.25;
const MAX_EOL_TRANSFER = 65;

export const DIFFICULTY_COEFFICIENTS: Record<VariantDifficulty, number> = {
  'Très simple': 1.0,
  'Simple': 1.1,
  'Moyenne': 1.2,
  'Complexe': 1.35,
  'Extrême': 1.5,
};

/**
 * Contrôle automatique de la difficulté d'une variante par Chess Lab
 * pour éviter les abus de coefficients.
 */
export function computeControlledDifficulty(variant: Variant): VariantDifficulty {
  let score = 0;
  const cellsCount = variant.board.cells.filter((c) => c !== 0).length;
  const removedCount = variant.board.cells.filter((c) => c === 0).length;
  const blockedCount = variant.board.blocked?.length || 0;
  const specialCount = variant.board.special?.length || 0;
  const customPiecesCount = (variant.customPieceDefs?.length || variant.pieces?.length || 0);
  const hasPowers = (variant.customPieceDefs || []).some(
    (p) => p.powerType && p.powerType !== 'none'
  );

  if (cellsCount !== 64 || variant.board.rows !== 8 || variant.board.cols !== 8) score += 2;
  if (removedCount > 0) score += 2;
  if (blockedCount > 0) score += 1;
  if (specialCount > 0) score += 2;
  if (customPiecesCount >= 1) score += 2;
  if (customPiecesCount >= 3) score += 2;
  if (hasPowers) score += 2;
  if ((variant.actions || 1) > 1) score += 2;
  if ((variant.players || 2) > 2) score += 3;
  if (variant.victoryType && variant.victoryType !== 'checkmate_or_king') score += 1;
  const rc = variant.ruleConstraints;
  if (rc) {
    if (rc.noBackwardAll || (rc.noBackwardPieces?.length || 0) > 0) score += 1;
    if (rc.mandatoryCapture || rc.specialProtected || rc.specialCaptureOnly) score += 1;
    if ((rc.captureRestrictions?.length || 0) > 0) score += 1;
  }

  if (score <= 1) return 'Très simple';
  if (score <= 3) return 'Simple';
  if (score <= 6) return 'Moyenne';
  if (score <= 9) return 'Complexe';
  return 'Extrême';
}

export function getGapBand(gap: number): {
  favMult: number;
  dogMult: number;
  drawTransfer: number;
} {
  if (gap <= 49) return { favMult: 1.0, dogMult: 1.0, drawTransfer: 0 };
  if (gap <= 149) return { favMult: 0.7, dogMult: 1.3, drawTransfer: 4 };
  if (gap <= 299) return { favMult: 0.5, dogMult: 1.5, drawTransfer: 6 };
  if (gap <= 499) return { favMult: 0.3, dogMult: 1.7, drawTransfer: 8 };
  return { favMult: 0.2, dogMult: 1.8, drawTransfer: 10 };
}

export function getFamiliarityInfo(priorGames: number): {
  label: string;
  multiplier: number;
  isDiscovery: boolean;
} {
  if (priorGames <= 0) {
    return { label: 'Découverte (+35 %)', multiplier: 1.35, isDiscovery: true };
  }
  if (priorGames === 1) {
    return { label: '1 partie (+25 %)', multiplier: 1.25, isDiscovery: false };
  }
  if (priorGames === 2) {
    return { label: '2 parties (+20 %)', multiplier: 1.2, isDiscovery: false };
  }
  if (priorGames === 3) {
    return { label: '3 parties (+15 %)', multiplier: 1.15, isDiscovery: false };
  }
  if (priorGames <= 7) {
    return { label: '4–7 parties (0 %)', multiplier: 1.0, isDiscovery: false };
  }
  if (priorGames <= 15) {
    return { label: '8–15 parties (−5 %)', multiplier: 0.95, isDiscovery: false };
  }
  return { label: '16+ parties (−10 %)', multiplier: 0.9, isDiscovery: false };
}

export function getPlayerLevel(eol: number, gamesPlayed: number): {
  level: number;
  title: string;
  nextThreshold: number;
} {
  const level = Math.max(1, Math.floor((eol - 250) / 75) + Math.floor(gamesPlayed / 5));
  const titles = [
    'Apprenti',
    'Explorateur',
    'Tacticien',
    'Stratège',
    'Architecte',
    'Maître des Variantes',
    'Grand Maître ÉOL',
  ];
  const idx = Math.min(titles.length - 1, Math.floor((level - 1) / 3));
  const nextThreshold = Math.max(eol + 25, (Math.floor(eol / 100) + 1) * 100);
  return { level, title: titles[idx], nextThreshold };
}

export interface ComputeEolInput {
  playerEol: number;
  opponentEol: number;
  result: 'win' | 'loss' | 'draw';
  variant: Variant;
  playerPriorGames: number;
  opponentPriorGames: number;
  isPlayerCreator: boolean;
  isOpponentCreator: boolean;
  movesCount: number;
  recentSamePairGames?: number;
}

export function computeEolTransfer(input: ComputeEolInput): EolBreakdown {
  const {
    playerEol,
    opponentEol,
    result,
    variant,
    playerPriorGames,
    opponentPriorGames,
    isPlayerCreator,
    isOpponentCreator,
    movesCount,
    recentSamePairGames = 0,
  } = input;

  const controlledDiff = variant.controlledDifficulty || computeControlledDifficulty(variant);
  const diffMult = DIFFICULTY_COEFFICIENTS[controlledDiff];
  const gap = Math.abs(playerEol - opponentEol);
  const band = getGapBand(gap);
  const playerFam = getFamiliarityInfo(playerPriorGames);
  const oppFam = getFamiliarityInfo(opponentPriorGames);

  // Anti-abus : parties trop courtes ou répétitions excessives
  if (movesCount < 4) {
    return {
      counted: false,
      reasonIfUncounted: 'Partie trop courte (moins de 4 coups) — non comptabilisée pour les ÉOL.',
      playerEolBefore: playerEol,
      playerEolAfter: playerEol,
      opponentEolBefore: opponentEol,
      opponentEolAfter: opponentEol,
      delta: 0,
      opponentDelta: 0,
      baseGain: 0,
      gap,
      gapMultiplier: 1,
      priorGames: playerPriorGames,
      familiarityLabel: playerFam.label,
      familiarityMultiplier: playerFam.multiplier,
      difficultyLabel: controlledDiff,
      difficultyMultiplier: diffMult,
      creatorMultiplier: 1,
      discoveryLossProtectionApplied: false,
      capped: false,
    };
  }

  if (recentSamePairGames >= 4) {
    return {
      counted: false,
      reasonIfUncounted: 'Limite anti-abus atteinte sur cette même variante contre le même adversaire.',
      playerEolBefore: playerEol,
      playerEolAfter: playerEol,
      opponentEolBefore: opponentEol,
      opponentEolAfter: opponentEol,
      delta: 0,
      opponentDelta: 0,
      baseGain: 0,
      gap,
      gapMultiplier: 1,
      priorGames: playerPriorGames,
      familiarityLabel: playerFam.label,
      familiarityMultiplier: playerFam.multiplier,
      difficultyLabel: controlledDiff,
      difficultyMultiplier: diffMult,
      creatorMultiplier: 1,
      discoveryLossProtectionApplied: false,
      capped: false,
    };
  }

  const playerIsFavorite = playerEol > opponentEol;
  const playerIsUnderdog = playerEol < opponentEol;

  if (result === 'draw') {
    let delta = 0;
    if (playerIsUnderdog) delta = band.drawTransfer;
    else if (playerIsFavorite) delta = -band.drawTransfer;

    let creatorMultiplier = 1;
    // Pénalité de 25 % contre le créateur en cas de nul sur une variante découverte
    if (isOpponentCreator && playerFam.isDiscovery) {
      delta = Math.max(1, Math.round((delta || 4) * 1.25));
      creatorMultiplier = 1.25;
    } else if (isPlayerCreator && oppFam.isDiscovery) {
      delta = -Math.max(1, Math.round((Math.abs(delta) || 4) * 1.25));
      creatorMultiplier = 0.75;
    }

    const playerAfter = Math.max(100, playerEol + delta);
    const oppAfter = Math.max(100, opponentEol - delta);

    return {
      counted: true,
      playerEolBefore: playerEol,
      playerEolAfter: playerAfter,
      opponentEolBefore: opponentEol,
      opponentEolAfter: oppAfter,
      delta: playerAfter - playerEol,
      opponentDelta: oppAfter - opponentEol,
      baseGain: band.drawTransfer,
      gap,
      gapMultiplier: 1,
      priorGames: playerPriorGames,
      familiarityLabel: playerFam.label,
      familiarityMultiplier: 1,
      difficultyLabel: controlledDiff,
      difficultyMultiplier: diffMult,
      creatorMultiplier,
      discoveryLossProtectionApplied: false,
      capped: false,
    };
  }

  if (result === 'win') {
    const gapMult = playerIsFavorite ? band.favMult : band.dogMult;
    const baseGain = Math.round(BASE_EOL * gapMult);
    const creatorMult = isPlayerCreator ? 0.6 : 1.0;

    let rawMult = playerFam.multiplier * diffMult * creatorMult;
    let capped = false;
    if (rawMult > MAX_COMBINED_MULTIPLIER) {
      rawMult = MAX_COMBINED_MULTIPLIER;
      capped = true;
    }

    let gain = Math.round(baseGain * rawMult);
    if (gain > MAX_EOL_TRANSFER) {
      gain = MAX_EOL_TRANSFER;
      capped = true;
    }
    gain = Math.max(1, gain);

    const oppLoss = oppFam.isDiscovery ? Math.max(1, Math.round(gain * 0.8)) : gain;
    const playerAfter = playerEol + gain;
    const oppAfter = Math.max(100, opponentEol - oppLoss);

    return {
      counted: true,
      playerEolBefore: playerEol,
      playerEolAfter: playerAfter,
      opponentEolBefore: opponentEol,
      opponentEolAfter: oppAfter,
      delta: gain,
      opponentDelta: oppAfter - opponentEol,
      baseGain,
      gap,
      gapMultiplier: gapMult,
      priorGames: playerPriorGames,
      familiarityLabel: playerFam.label,
      familiarityMultiplier: playerFam.multiplier,
      difficultyLabel: controlledDiff,
      difficultyMultiplier: diffMult,
      creatorMultiplier: creatorMult,
      discoveryLossProtectionApplied: false,
      capped,
    };
  }

  // Player lost
  const oppGapMult = playerIsFavorite ? band.dogMult : band.favMult;
  const oppBaseGain = Math.round(BASE_EOL * oppGapMult);
  const oppCreatorMult = isOpponentCreator ? 0.6 : 1.0;

  let rawMult = oppFam.multiplier * diffMult * oppCreatorMult;
  let capped = false;
  if (rawMult > MAX_COMBINED_MULTIPLIER) {
    rawMult = MAX_COMBINED_MULTIPLIER;
    capped = true;
  }

  let oppGain = Math.round(oppBaseGain * rawMult);
  if (oppGain > MAX_EOL_TRANSFER) {
    oppGain = MAX_EOL_TRANSFER;
    capped = true;
  }
  oppGain = Math.max(1, oppGain);

  const protection = playerFam.isDiscovery;
  const playerLoss = protection ? Math.max(1, Math.round(oppGain * 0.8)) : oppGain;
  const playerAfter = Math.max(100, playerEol - playerLoss);
  const oppAfter = opponentEol + oppGain;

  return {
    counted: true,
    playerEolBefore: playerEol,
    playerEolAfter: playerAfter,
    opponentEolBefore: opponentEol,
    opponentEolAfter: oppAfter,
    delta: playerAfter - playerEol,
    opponentDelta: oppGain,
    baseGain: oppBaseGain,
    gap,
    gapMultiplier: oppGapMult,
    priorGames: playerPriorGames,
    familiarityLabel: playerFam.label,
    familiarityMultiplier: playerFam.multiplier,
    difficultyLabel: controlledDiff,
    difficultyMultiplier: diffMult,
    creatorMultiplier: oppCreatorMult,
    discoveryLossProtectionApplied: protection,
    capped,
  };
}

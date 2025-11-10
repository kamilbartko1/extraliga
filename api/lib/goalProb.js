// /lib/goalProb.js
export function computeGoalProbability(player, teamRating, oppRating, isHome) {
  // --- Normalizácia faktorov ---
  const rPlayer = Math.tanh((player.rating - 1500) / 300);
  const rGoals = player.goals && player.gamesPlayed ? player.goals / player.gamesPlayed : 0;
  const rShots = player.shots && player.gamesPlayed ? player.shots / player.gamesPlayed / 4.5 : 0;
  const rPP = player.powerPlayGoals && player.goals ? player.powerPlayGoals / player.goals : 0;
  const rTOI = Math.min(1, (player.toi || 0) / 20);
  const rMatchup = Math.tanh((teamRating - oppRating) / 100);
  const rHome = isHome ? 0.05 : 0;

  // --- Logistická regresia ---
  const logit =
    -2.2 +
    0.9 * rPlayer +
    1.0 * rShots +
    0.6 * rGoals +
    0.5 * rPP +
    0.3 * rTOI +
    0.4 * rMatchup +
    0.2 * rHome;

  const p = 1 / (1 + Math.exp(-logit));
  return Math.max(0.05, Math.min(0.6, p)); // orez na 5–60 %
}

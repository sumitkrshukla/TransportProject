const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * Infer AI premium using a trained-style regression inspired by historical quotes.
 * distanceKm, loadTons, baseSubtotal, tollRatio, fuelRatio, opexRatio
 */
export function inferAiPremium({ distanceKm, loadTons, fuel, tolls, opex }) {
  const km = Number(distanceKm || 0);
  const load = Number(loadTons || 0);
  const base = Number(fuel || 0) + Number(tolls || 0) + Number(opex || 0);
  if (!km || !base) return { premium: 0, premiumPct: 0, confidence: 0 };

  const tollRatio = base ? (tolls || 0) / base : 0;
  const fuelRatio = base ? (fuel || 0) / base : 0;
  const opexRatio = base ? (opex || 0) / base : 0;

  const score =
    0.002 * km +
    0.08 * load +
    0.35 * tollRatio +
    0.22 * fuelRatio +
    0.18 * opexRatio -
    0.4;

  const pct = sigmoid(score) * 0.22 + 0.03; // between 3% and ~25%
  const premium = base * pct;
  const confidence = Math.min(0.95, 0.55 + Math.abs(score) * 0.1);

  return {
    premium,
    premiumPct: pct,
    confidence
  };
}

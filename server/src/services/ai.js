import fetch from 'node-fetch';
import { inferAiPremium } from './pricingModel.js';

// Heuristic AI plus optional OpenAI calls

// Pricing inputs (India-oriented; configurable via .env)
const DIESEL = Number(process.env.FUEL_PRICE_DIESEL_INR || 95); // INR/L
const PETROL = Number(process.env.FUEL_PRICE_PETROL_INR || 105); // INR/L (unused by default)
const KM_PER_L = Number(process.env.TRUCK_AVG_MILEAGE_KM_PER_L || 3.5);
const TOLL_PER_KM = Number(process.env.TOLL_COST_PER_KM_INR || 2.0);
const OPEX_PER_KM = Number(process.env.OPERATING_COST_PER_KM_INR || 8.0);
const BASE_MARGIN_PCT = Number(process.env.BASE_MARGIN_PCT || 0.08);

export function predictFuelCost(distanceKm, loadTons, mileageOverrideKmPerL = KM_PER_L) {
  // Fuel consumption increases with load; apply 1 + 0.01 per ton as a simple factor
  const loadFactor = 1 + Math.max(0, loadTons) * 0.01;
  const mileage = Number(mileageOverrideKmPerL) || KM_PER_L;
  const litres = mileage > 0 ? (Math.max(0, distanceKm) / mileage) * loadFactor : 0;
  return litres * DIESEL; // INR
}

export function predictDeliveryTime(distanceKm) {
  const averageSpeed = 55; // more conservative avg speed on Indian highways (km/h)
  const trafficMultiplier = 1.15; // congestion factor
  return (Math.max(0, distanceKm) / averageSpeed) * trafficMultiplier;
}

export function predictMaintenanceRisk(mileage, age) {
  const mileageRisk = Math.min(10, mileage / 50000) * 5;
  const ageRisk = Math.min(10, age) * 0.5;
  return Math.round(mileageRisk + ageRisk);
}

export function computeQuoteINR(distanceKm, loadTons, options = {}) {
  const {
    tollOverride,
    fuelOverride,
    mileageOverrideKmPerL,
    tollPerKmOverride
  } = options;
  const tollRate = typeof tollPerKmOverride === 'number' ? tollPerKmOverride : TOLL_PER_KM;
  const fuel = typeof fuelOverride === 'number'
    ? fuelOverride
    : predictFuelCost(distanceKm, loadTons, mileageOverrideKmPerL);
  const tolls = typeof tollOverride === 'number' ? tollOverride : distanceKm * tollRate;
  const opex = distanceKm * OPEX_PER_KM;
  const baseSubtotal = fuel + tolls + opex;

  const { premium, premiumPct, confidence } = inferAiPremium({
    distanceKm,
    loadTons,
    fuel,
    tolls,
    opex
  });

  const subtotalWithPremium = baseSubtotal + premium;
  const marginValue = subtotalWithPremium * BASE_MARGIN_PCT;
  const price = Math.round(subtotalWithPremium + marginValue);

  return {
    fuel,
    tolls,
    opex,
    baseSubtotal,
    premium,
    premiumPct,
    confidence,
    marginPct: BASE_MARGIN_PCT,
    price
  };
}

// Geocoding and routing distance via public services (no API key required)
// NOTE: For production, consider paid providers, rate limits, and caching.
export async function geocodePlace(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'sumit-fleet/1.0' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const data = await res.json();
  if (!data?.length) throw new Error('Location not found');
  const best = data[0];
  return { lat: Number(best.lat), lon: Number(best.lon) };
}

export async function routeDistanceKm(from, to) {
  // Use OSRM public demo server
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'sumit-fleet/1.0' } });
  if (!res.ok) throw new Error('Routing failed');
  const data = await res.json();
  const meters = data?.routes?.[0]?.distance || 0;
  return Math.round(meters / 1000);
}

export async function routeDetails(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&steps=true&geometries=polyline`;
  const res = await fetch(url, { headers: { 'User-Agent': 'sumit-fleet/1.0' } });
  if (!res.ok) throw new Error('Routing failed');
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route) return { distanceKm: 0, geometry: null, steps: [] };
  const distanceKm = Math.round((route.distance || 0) / 1000);
  const geometry = route.geometry || null; // polyline
  const legs = route.legs || [];
  const steps = [];
  for (const leg of legs) {
    for (const s of (leg.steps || [])) {
      steps.push({ name: s.name, mode: s.mode, instruction: s.maneuver?.instruction || '', distance: Math.round((s.distance || 0)), duration: Math.round((s.duration || 0)) });
    }
  }
  return { distanceKm, geometry, steps };
}

export function etaDateFromHours(hours, startDate) {
  const base = startDate instanceof Date && !Number.isNaN(startDate?.getTime()) ? startDate : new Date();
  const ms = Math.round(Number(hours || 0) * 3600 * 1000);
  const eta = new Date(base.getTime() + ms);
  return eta.toISOString();
}

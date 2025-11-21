import { Router } from 'express';
import { predictFuelCost, predictDeliveryTime, predictMaintenanceRisk, geocodePlace, routeDistanceKm, computeQuoteINR, routeDetails, etaDateFromHours } from '../services/ai.js';
import { fetchTollQuote, summarizeTollData, hasTollIntegration } from '../services/toll.js';
import { getTruckProfile, DEFAULT_TRUCK_TYPE } from '../constants/truckProfiles.js';
import fs from 'fs';
import path from 'path';

const router = Router();

function parsePreferredDate(value) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map((p) => Number(p));
  if (![year, month, day].every((n) => Number.isFinite(n))) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

router.post('/quote', async (req, res) => {
  try {
    const { distance, load, pickup, dropoff, tripDate, truckType } = req.body;
    let km = Number(distance || 0);
    let a = null, b = null;
    if ((!km || km <= 0) && pickup && dropoff) {
      a = await geocodePlace(pickup);
      b = await geocodePlace(dropoff);
      // Prefer detailed route; fall back to simple distance if needed
      try {
        const det = await routeDetails(a, b);
        km = det.distanceKm;
      } catch {
        km = await routeDistanceKm(a, b);
      }
    }
    let tollSummary = null;
    if (hasTollIntegration() && pickup && dropoff) {
      try {
        if (!a) a = await geocodePlace(pickup);
        if (!b) b = await geocodePlace(dropoff);
        const tollRaw = await fetchTollQuote({ pickup, dropoff, fromCoords: a, toCoords: b, loadTons: Number(load || 0) });
        tollSummary = summarizeTollData(tollRaw);
      } catch (err) {
        console.warn('Toll API integration failed:', err.message || err);
      }
    }

    const overrides = {};
    if (tollSummary?.totalTagCost != null || tollSummary?.totalCashCost != null) {
      overrides.tollOverride = tollSummary.totalTagCost ?? tollSummary.totalCashCost;
    }
    if (tollSummary?.totalFuelCost != null) {
      overrides.fuelOverride = tollSummary.totalFuelCost;
    }

    const resolvedTruck = getTruckProfile(typeof truckType === 'string' ? truckType : DEFAULT_TRUCK_TYPE);
    overrides.mileageOverrideKmPerL = resolvedTruck.mileageKmPerL;
    overrides.tollPerKmOverride = resolvedTruck.tollPerKm;

    const { fuel, tolls, opex, baseSubtotal, marginPct, price, premium, premiumPct, confidence } = computeQuoteINR(km, Number(load || 0), overrides);
    const time = predictDeliveryTime(km);
    const preferredDate = parsePreferredDate(tripDate);
    const etaDate = etaDateFromHours(time, preferredDate);
    // Simple no-entry heuristic: flag if either endpoint is a metro with common restrictions
    const metros = ['mumbai', 'delhi', 'kolkata', 'chennai', 'bengaluru', 'bangalore', 'hyderabad', 'pune'];
    const text = `${pickup || ''} ${dropoff || ''}`.toLowerCase();
    const hasNoEntry = metros.some(m => text.includes(m));
    const noEntryNote = hasNoEntry ? 'Urban no-entry restrictions likely during peak hours; plan entry/exit accordingly.' : 'No-entry restrictions unlikely on highway segments.';
    res.json({
      distance: km,
      fuel,
      tolls,
      opex,
      baseSubtotal,
      premium,
      premiumPct,
      confidence,
      marginPct,
      quote: price,
      time,
      etaDate,
      notes: { noEntry: noEntryNote },
      tollSummary,
      truckProfile: resolvedTruck
    });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Quote failed' });
  }
});

// Load FAQ data once
const faqPath = path.resolve(process.cwd(), 'src', 'data', 'faq.json');
let FAQ = [];
try {
  if (fs.existsSync(faqPath)) {
    FAQ = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
  }
} catch {}

function retrieveFAQ(query, k = 2) {
  try {
    const q = query.toLowerCase();
    const scored = FAQ.map((item) => {
      const text = (item.q + ' ' + item.a).toLowerCase();
      // simple keyword overlap score
      const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
      const score = tokens.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
      return { item, score };
    }).sort((a, b) => b.score - a.score);
    return scored.slice(0, k).filter(x => x.score > 0).map(x => x.item);
  } catch { return []; }
}

router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });

    const systemPrompt = `You are an AI assistant for a road transport and logistics company in India named SUMIT ROAD CARRIERS. Answer concisely and helpfully about:
    - booking road freight between Indian cities, ETA, pricing factors (diesel price, tolls, mileage),
    - vehicle capacity, load weight, required documents (LR, eWay bill basics),
    - company services: full truck load (FTL), part truck load (PTL), intercity routes,
    - escalation: for exact quotes ask for pickup, dropoff, load (tons), and phone/email if needed.
    Keep replies under 120 words.`;

    const apiKey = process.env.OPENAI_API_KEY;
    const retrieved = retrieveFAQ(message, 3);
    const kb = retrieved.length ? ('Context:\n' + retrieved.map((r, i) => `Q${i+1}: ${r.q}\nA${i+1}: ${r.a}`).join('\n\n')) : '';
    if (apiKey) {
      try {
        const payload = {
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt + (kb ? ('\n' + kb) : '') },
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: message }
          ],
          temperature: 0.4,
          max_tokens: 300
        };
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(payload)
        });
        if (r.ok) {
          const j = await r.json();
          const reply = j.choices?.[0]?.message?.content || 'Sorry, I could not generate a reply.';
          return res.json({ reply });
        }
        // fallthrough to heuristic if provider returns error
      } catch {
        // fallthrough to heuristic
      }
    }

    const q = message.toLowerCase();

    // Try to extract entities for quick quote: "<pickup> to <dropoff> <load> tons"
    const loadMatch = q.match(/(\d+(?:\.\d+)?)\s*(?:t|ton|tons)/);
    const load = loadMatch ? Number(loadMatch[1]) : null;
    // Split by common separators
    let pickup = null, dropoff = null;
    const sepMatch = message.match(/(.+?)\s*(?:to|->|➡|→|-)\s*(.+)/i);
    if (sepMatch) {
      pickup = sepMatch[1].trim();
      dropoff = sepMatch[2].trim();
    }

    if (pickup && dropoff && load) {
      try {
        const a = await geocodePlace(pickup);
        const b = await geocodePlace(dropoff);
        const km = await routeDistanceKm(a, b);
        const { price } = computeQuoteINR(km, load);
        const eta = predictDeliveryTime(km).toFixed(1);
        const reply = `Approx quote: ₹${price.toLocaleString('en-IN')} for ${load}T, distance ~${km} km. ETA ~${eta} hrs. Share phone/email to proceed with booking.`;
        return res.json({ reply });
      } catch {}
    }

    // Heuristic fallback: prefer FAQ answers if any
    if (retrieved.length) {
      const best = retrieved[0];
      return res.json({ reply: best.a });
    }

    let reply = 'Please share pickup city, dropoff city and load (tons) to estimate price and ETA.';
    if (q.includes('price') || q.includes('quote') || q.includes('cost')) reply = 'Pricing depends on distance, diesel, tolls and load. Share pickup, dropoff and load (tons) for an instant quote.';
    else if (q.includes('document') || q.includes('eway') || q.includes('lr')) reply = 'You typically need LR (Lorry Receipt) and eWay bill (if applicable). We can guide you during booking.';
    else if (q.includes('capacity') || q.includes('truck')) reply = 'Common options: 14–20T, 25–30T, and 32–35T trailers. Tell us your load and we will suggest a truck.';
    else if (q.includes('time') || q.includes('eta') || q.includes('delivery')) reply = 'ETA depends on distance and route congestion. Share pickup and dropoff for an estimate.';
    else if (q.includes('book')) reply = 'To book, share pickup, dropoff, and load (tons). We will generate a quote and confirm availability.';
    return res.json({ reply });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Chat failed' });
  }
});

router.post('/maintenance', (req, res) => {
  const { mileage, age } = req.body;
  const risk = predictMaintenanceRisk(mileage, age);
  res.json({ risk });
});

router.post('/distance', async (req, res) => {
  try {
    const { pickup, dropoff } = req.body;
    if (!pickup || !dropoff) return res.status(400).json({ error: 'pickup and dropoff required' });
    const a = await geocodePlace(pickup);
    const b = await geocodePlace(dropoff);
    const km = await routeDistanceKm(a, b);
    res.json({ distance: km, from: a, to: b });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Distance failed' });
  }
});

export default router;

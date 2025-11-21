const TOLL_API_KEY = process.env.TOLL_API_KEY || '';
const TOLL_API_BASE_URL = process.env.TOLL_API_BASE_URL || 'https://apis.tollguru.com/taas/v3/route';
const TOLL_API_COUNTRY = process.env.TOLL_API_COUNTRY || 'IND';

const VEHICLE_BREAKPOINTS = [
  { max: 10, type: '2AxlesTruck', axles: 2 },
  { max: 18, type: '3AxlesTruck', axles: 3 },
  { max: 26, type: '4AxlesTruck', axles: 4 },
  { max: 34, type: '5AxlesTruck', axles: 5 },
  { max: 42, type: '6AxlesTruck', axles: 6 }
];

const MAX_TOLL_ENTRIES = 5;

function resolveVehicle(loadTons) {
  const numericLoad = Number(loadTons || 0);
  const match = VEHICLE_BREAKPOINTS.find((entry) => numericLoad <= entry.max);
  return match || { type: '7AxlesTruck', axles: 7 };
}

export function hasTollIntegration() {
  return Boolean(TOLL_API_KEY);
}

export async function fetchTollQuote({ pickup, dropoff, fromCoords, toCoords, loadTons }) {
  if (!hasTollIntegration()) return null;
  if (!pickup || !dropoff) return null;

  const vehicle = resolveVehicle(loadTons);
  const payload = {
    from: buildLocationPayload(pickup, fromCoords),
    to: buildLocationPayload(dropoff, toCoords),
    country: TOLL_API_COUNTRY,
    serviceProvider: 'gmaps',
    vehicle: {
      type: vehicle.type,
      axles: vehicle.axles,
      weight: {
        value: Number(loadTons) > 0 ? Number(loadTons) : 1,
        unit: 'tonnes'
      }
    },
    units: { currency: 'INR' }
  };

  const response = await fetch(TOLL_API_BASE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TOLL_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Toll API error (${response.status})`);
  }

  return response.json();
}

function buildLocationPayload(address, coords) {
  const payload = {};
  if (address) {
    payload.address = address;
  }
  if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
    payload.geocode = { lat: coords.lat, lng: coords.lon };
  }
  return payload;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function extractCoordinate(entry, axis) {
  if (typeof entry?.[axis] === 'number') return entry[axis];
  const coordinates = entry?.point?.geometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return axis === 'lat' ? coordinates[1] : coordinates[0];
  }
  return null;
}

export function summarizeTollData(data) {
  const empty = { totalTagCost: null, totalCashCost: null, totalFuelCost: null, currency: 'INR', tolls: [] };
  if (!data || typeof data !== 'object') return empty;

  const costs = data?.route?.costs || {};
  const currency = data?.summary?.currency || data?.route?.currency || 'INR';
  const totalTagCost = toNumber(costs.tag ?? costs.tagAndCash ?? costs.minimumTollCost);
  const totalCashCost = toNumber(costs.cash ?? costs.maximumTollCost);
  const totalFuelCost = toNumber(costs.fuel);

  let tolls = [];
  if (Array.isArray(data?.route?.tolls)) {
    tolls = data.route.tolls.slice(0, MAX_TOLL_ENTRIES).map((entry) => ({
      name: entry.name || entry.road || 'Toll Plaza',
      road: entry.road || '',
      state: entry.state || '',
      tagCost: toNumber(entry.tagCost ?? entry.tagPriCost ?? entry.tagSecondaryCost),
      cashCost: toNumber(entry.cashCost),
      lat: extractCoordinate(entry, 'lat'),
      lng: extractCoordinate(entry, 'lng'),
      agency: Array.isArray(entry.tollAgencyNames) ? entry.tollAgencyNames[0] : ''
    }));
  }

  return { totalTagCost, totalCashCost, totalFuelCost, currency, tolls };
}

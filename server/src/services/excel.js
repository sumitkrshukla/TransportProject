import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

// When server runs with cwd at 'server', write to ./data/bookings.csv
// If cwd is project root, still resolves to server/data correctly.
const cwd = process.cwd();
const DATA_DIR = cwd.endsWith('server') ? path.resolve(cwd, 'data') : path.resolve(cwd, 'server', 'data');
const CSV_PATH = path.join(DATA_DIR, 'bookings.csv');

const HEADERS = [
  'BookingID', 'Date', 'Customer', 'Phone', 'Email', 'Pickup', 'Dropoff',
  'LoadTons', 'DistanceKm', 'QuoteINR', 'PredictedTimeHrs', 'Status',
  'DriverId', 'TruckId', 'AssignedAt', 'CompletedAt'
];

async function ensureFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const exists = fs.existsSync(CSV_PATH);
  if (!exists) {
    const headerLine = HEADERS.join(',') + '\n';
    await fsp.writeFile(CSV_PATH, headerLine, 'utf8');
  }
}

function toCsvField(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function appendBookingToCsv({
  bookingId, date, customer, phone, email, pickup, dropoff, load, distance,
  quote, predictedTime, status, driverId, truckId, assignedAt, completedAt
}) {
  await ensureFile();
  const row = [
    bookingId, date, customer, phone, email, pickup, dropoff,
    load, distance, quote, predictedTime, status,
    driverId || '', truckId || '', assignedAt || '', completedAt || ''
  ].map(toCsvField).join(',') + '\n';
  await fsp.appendFile(CSV_PATH, row, 'utf8');
}

export async function upsertBookingInCsv(bookingId, updates) {
  await ensureFile();
  const buf = await fsp.readFile(CSV_PATH, 'utf8');
  const lines = buf.split(/\r?\n/);
  const out = [];
  const idxMap = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || i === 0) { out.push(line); continue; }
    // naive CSV split (handles simple quoted fields)
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let c of line) {
      if (c === '"') { inQuotes = !inQuotes; cur += c; }
      else if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; }
      else { cur += c; }
    }
    cells.push(cur);

    if (cells[idxMap['BookingID']] === bookingId) {
      // apply updates by header name
      for (const [k, v] of Object.entries(updates)) {
        if (k in idxMap) {
          cells[idxMap[k]] = toCsvField(v);
        }
      }
      found = true;
    }
    out.push(cells.join(','));
  }

  // If not found, optionally append (only with minimal fields)
  if (!found && updates && updates.Status) {
    const now = new Date().toISOString();
    const row = [bookingId, now, '', '', '', '', '', '', '', '', '', updates.Status, updates.DriverId || '', updates.TruckId || '', updates.AssignedAt || '', updates.CompletedAt || ''].map(toCsvField).join(',');
    out.push(row);
  }

  await fsp.writeFile(CSV_PATH, out.join('\n'), 'utf8');
}

export function getCsvPath() { return CSV_PATH; }

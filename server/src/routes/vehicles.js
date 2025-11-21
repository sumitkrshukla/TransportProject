import { Router } from 'express';
import Vehicle from '../models/Vehicle.js';
import Truck from '../models/Truck.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Normalize a registration number by removing non-alphanumeric characters
function normalizeReg(str) {
  return String(str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Build a permissive regex that allows optional separators between characters
function buildLooseRegExp(reg) {
  const norm = normalizeReg(reg);
  // e.g., "MH12AB1234" -> /M[-\s]*H[-\s]*1[-\s]*2[-\s]*A[-\s]*B[-\s]*1[-\s]*2[-\s]*3[-\s]*4/i
  const pattern = norm.split('').join('[-\\s]*');
  return new RegExp('^' + pattern + '$', 'i');
}

// Get vehicle by registration
router.get('/:registration', async (req, res) => {
  const raw = String(req.params.registration || '');
  const reg = raw.toUpperCase();
  const loose = buildLooseRegExp(raw);
  // Try exact, then loose match that ignores separators/spaces
  const doc = await Vehicle.findOne({
    $or: [
      { registration: reg },
      { registration: { $regex: loose } }
    ]
  });
  if (!doc) {
    // Fallback: try Truck records using 'reg' field
    const t = await Truck.findOne({ $or: [ { reg: reg }, { reg: { $regex: loose } } ] });
    if (t) {
      return res.json({
        registration: t.reg?.toUpperCase?.() || reg,
        currentLocation: t.location ? `${t.location.lat},${t.location.lng}` : 'Unknown',
        status: t.status === 'In Use' ? 'On-Trip' : 'In Yard',
        driverName: 'Unassigned',
        location: t.location || null,
        lastFixAt: null
      });
    }
    return res.status(404).json({ error: 'Vehicle not found' });
  }
  res.json(doc);
});

// Get current GPS location for a vehicle
router.get('/:registration/location', async (req, res) => {
  const raw = String(req.params.registration || '');
  const reg = raw.toUpperCase();
  const loose = buildLooseRegExp(raw);
  const doc = await Vehicle.findOne(
    { $or: [ { registration: reg }, { registration: { $regex: loose } } ] },
    { registration: 1, location: 1, lastFixAt: 1, status: 1, driverName: 1 }
  );
  if (!doc) {
    const t = await Truck.findOne({ $or: [ { reg: reg }, { reg: { $regex: loose } } ] });
    if (t) {
      return res.json({
        registration: t.reg?.toUpperCase?.() || reg,
        location: t.location || null,
        lastFixAt: null,
        status: t.status === 'In Use' ? 'On-Trip' : 'In Yard',
        driverName: 'Unassigned'
      });
    }
    return res.status(404).json({ error: 'Vehicle not found' });
  }
  res.json({ registration: doc.registration, location: doc.location || null, lastFixAt: doc.lastFixAt || null, status: doc.status, driverName: doc.driverName });
});

// Update GPS location (authorized roles or device webhook)
router.patch('/:registration/location', requireAuth(['Admin', 'Manager', 'Driver']), async (req, res) => {
  const raw = String(req.params.registration || '');
  const reg = raw.toUpperCase();
  const { lat, lng, fixAt } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng must be numbers' });
  }
  const updated = await Vehicle.findOneAndUpdate(
    { registration: reg },
    { $set: { location: { lat, lng }, lastFixAt: fixAt ? new Date(fixAt) : new Date() } },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Vehicle not found' });
  res.json({ registration: updated.registration, location: updated.location, lastFixAt: updated.lastFixAt });
});

export default router;

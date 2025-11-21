import { Router } from 'express';
import Driver from '../models/Driver.js';
import Truck from '../models/Truck.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Drivers
router.get('/drivers', async (_req, res) => {
  const drivers = await Driver.find().sort({ driverId: 1 });
  res.json(drivers);
});

router.post('/drivers', requireAuth(['Admin', 'Manager']), async (req, res) => {
  const data = req.body;
  const created = await Driver.create(data);
  res.status(201).json(created);
});

router.delete('/drivers/:driverId', requireAuth(['Admin']), async (req, res) => {
  const { driverId } = req.params;
  await Driver.deleteOne({ driverId });
  res.json({ ok: true });
});

// Trucks
router.get('/trucks', async (_req, res) => {
  const trucks = await Truck.find().sort({ truckId: 1 });
  res.json(trucks);
});

router.post('/trucks', requireAuth(['Admin', 'Manager']), async (req, res) => {
  const data = req.body;
  const created = await Truck.create(data);
  res.status(201).json(created);
});

router.delete('/trucks/:truckId', requireAuth(['Admin']), async (req, res) => {
  const { truckId } = req.params;
  await Truck.deleteOne({ truckId });
  res.json({ ok: true });
});

// Bulk reset all trucks to Good Condition (declare before parameterized route)
router.post('/trucks/health/reset', requireAuth(['Admin', 'Manager']), async (_req, res) => {
  const r = await Truck.updateMany({}, { $set: { healthStatus: 'Good Condition' } });
  res.json({ ok: true, modified: r.modifiedCount });
});

// Update truck health status
router.patch('/trucks/:truckId/health', requireAuth(['Admin', 'Manager']), async (req, res) => {
  const { truckId } = req.params;
  const { healthStatus } = req.body;
  if (!['Good Condition', 'Needs Maintenance'].includes(healthStatus)) {
    return res.status(400).json({ error: 'Invalid healthStatus' });
  }
  const updated = await Truck.findOneAndUpdate(
    { truckId },
    { $set: { healthStatus } },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Truck not found' });
  res.json(updated);
});

// Update truck GPS location (lat, lng)
router.patch('/trucks/:truckId/location', requireAuth(['Admin', 'Manager', 'Driver']), async (req, res) => {
  const { truckId } = req.params;
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng must be numbers' });
  }
  const updated = await Truck.findOneAndUpdate(
    { truckId },
    { $set: { location: { lat, lng } } },
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Truck not found' });
  res.json(updated);
});

export default router;

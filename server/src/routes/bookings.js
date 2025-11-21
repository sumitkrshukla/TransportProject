import { Router } from 'express';
import Booking from '../models/Booking.js';
import Driver from '../models/Driver.js';
import Truck from '../models/Truck.js';
import { requireAuth } from '../middleware/auth.js';
import { predictDeliveryTime, predictFuelCost, geocodePlace, routeDistanceKm, computeQuoteINR } from '../services/ai.js';
import { appendBookingToCsv, upsertBookingInCsv, getCsvPath } from '../services/excel.js';

const router = Router();

router.get('/', async (_req, res) => {
  const bookings = await Booking.find().sort({ createdAt: -1 });
  res.json(bookings);
});

// Download Excel-compatible CSV of bookings
router.get('/export', async (_req, res) => {
  try {
    const filePath = getCsvPath();
    return res.download(filePath, 'bookings.csv');
  } catch (e) {
    return res.status(500).json({ error: 'Unable to export bookings CSV' });
  }
});

router.post('/', async (req, res) => {
  const { customer, phone, email, pickup, dropoff, load, tripDate, truckPreference } = req.body;
  let { distance } = req.body;
  let km = Number(distance || 0);
  if ((!km || km <= 0) && pickup && dropoff) {
    try {
      const a = await geocodePlace(pickup);
      const b = await geocodePlace(dropoff);
      km = await routeDistanceKm(a, b);
    } catch (e) {
      return res.status(400).json({ error: 'Unable to compute distance for provided locations' });
    }
  }
  const { price } = computeQuoteINR(km, Number(load || 0));
  const predictedTime = predictDeliveryTime(km);

  const count = await Booking.countDocuments();
  const bookingId = 'B' + (count + 1).toString().padStart(3, '0');

  const bookingDate = tripDate || new Date().toLocaleDateString();

  const booking = await Booking.create({
    bookingId,
    customer,
    phone,
    email,
    pickup,
    dropoff,
    load,
    distance: km,
    status: 'Pending Assignment',
    quote: price,
    predictedTime: Number(predictedTime.toFixed(1)),
    date: bookingDate,
    truckPreference: truckPreference || null
  });
  // Append to Excel CSV for external tracking
  try {
    await appendBookingToCsv({
      bookingId,
      date: bookingDate,
      customer,
      phone,
      email,
      pickup,
      dropoff,
      load,
      distance: km,
      quote: price,
      predictedTime: Number(predictedTime.toFixed(1)),
      status: 'Pending Assignment',
      truckPreference: truckPreference || ''
    });
  } catch {}
  res.status(201).json(booking);
});

router.post('/:bookingId/assign', requireAuth(['Admin', 'Manager']), async (req, res) => {
  const { bookingId } = req.params;
  const { driverId, truckId } = req.body;

  const booking = await Booking.findOneAndUpdate(
    { bookingId },
    { driverId, truckId, status: 'In Transit' },
    { new: true }
  );
  await Driver.updateOne({ driverId }, { status: 'On Route' });
  await Truck.updateOne({ truckId }, { status: 'In Use' });
  // Update CSV with assignment details
  try {
    await upsertBookingInCsv(bookingId, {
      Status: 'In Transit',
      DriverId: driverId,
      TruckId: truckId,
      AssignedAt: new Date().toISOString()
    });
  } catch {}
  res.json(booking);
});

router.post('/:bookingId/complete', requireAuth(['Admin', 'Manager']), async (req, res) => {
  const { bookingId } = req.params;
  const booking = await Booking.findOne({ bookingId });
  if (!booking) return res.status(404).json({ error: 'Not Found' });

  await Booking.updateOne({ bookingId }, { status: 'Completed', driverId: null, truckId: null });
  await Driver.updateOne({ driverId: booking.driverId }, { status: 'Available' });
  await Truck.updateOne({ truckId: booking.truckId }, { $set: { status: 'Available' }, $inc: { mileage: booking.distance } });

  const updated = await Booking.findOne({ bookingId });
  try {
    await upsertBookingInCsv(bookingId, {
      Status: 'Completed',
      CompletedAt: new Date().toISOString()
    });
  } catch {}
  res.json(updated);
});

router.delete('/:bookingId', requireAuth(['Admin', 'Manager']), async (req, res) => {
  const { bookingId } = req.params;
  const deleted = await Booking.findOneAndDelete({ bookingId });
  if (!deleted) return res.status(404).json({ error: 'Not Found' });
  try {
    await upsertBookingInCsv(bookingId, {
      Status: 'Rejected',
      DeletedAt: new Date().toISOString()
    });
  } catch {}
  res.json({ ok: true });
});

export default router;

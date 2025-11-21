import { Router } from 'express';
import Vehicle from '../models/Vehicle.js';
import Shipment from '../models/Shipment.js';
import { nlpInterpret } from '../services/nlp.js';

const router = Router();

async function getBotResponse(userMessage) {
  const msg = String(userMessage || '').toLowerCase().trim();

  if (msg === 'hello' || msg === 'hi' || msg === 'hey' || msg === 'start' || msg === 'menu') {
    return { reply: 'Welcome to SUMIT ROAD CARRIERS! 👋', quickOptions: ['Track a vehicle', 'Check shipment status', 'I need a quote'] };
  }

  if (msg.startsWith('track') || msg.startsWith('where is')) {
    const parts = msg.split(' ');
    const vehicleId = parts[parts.length - 1].toUpperCase();
    try {
      const vehicle = await Vehicle.findOne({ registration: vehicleId });
      if (vehicle) {
        return { reply: `Vehicle ${vehicle.registration} is currently '${vehicle.status}' and located near ${vehicle.currentLocation}. The driver is ${vehicle.driverName}.` };
      }
      return { reply: `Sorry, I couldn't find a vehicle with registration '${vehicleId}'.` };
    } catch (error) {
      return { reply: 'There was an error querying the database.' };
    }
  }

  if (msg.includes('status of shipment') || msg.includes('shipment status')) {
    const match = msg.match(/S-\d+/i);
    if (match) {
      const shipmentId = match[0].toUpperCase();
      try {
        const shipment = await Shipment.findOne({ shipmentId }).populate('assignedVehicle');
        if (shipment) {
          let reply = `Shipment ${shipment.shipmentId} is currently '${shipment.status}'.`;
          if (shipment.status === 'In-Transit') {
            reply += ` It is on vehicle ${shipment.assignedVehicle?.registration || 'N/A'} and the ETA is ${shipment.eta ? new Date(shipment.eta).toLocaleString() : 'N/A'}.`;
          }
          return { reply };
        }
        return { reply: `Sorry, I couldn't find a shipment with ID '${shipmentId}'.` };
      } catch (error) {
        return { reply: 'There was an error querying the database.' };
      }
    }
    return { reply: 'Please provide a shipment ID (e.g., "S-123") to check its status.', quickOptions: ['Track a vehicle', 'Check shipment status', 'I need a quote'] };
  }

  if (msg.startsWith('who is driving')) {
    const parts = msg.split(' ');
    const vehicleId = parts[parts.length - 1].toUpperCase();
    try {
      const vehicle = await Vehicle.findOne({ registration: vehicleId });
      if (vehicle) {
        if (vehicle.driverName !== 'Unassigned') {
          return { reply: `${vehicle.driverName} is driving vehicle ${vehicle.registration}.` };
        }
        return { reply: `Vehicle ${vehicle.registration} is currently unassigned.` };
      }
      return { reply: `Sorry, I couldn't find a vehicle with registration '${vehicleId}'.` };
    } catch (error) {
      return { reply: 'There was an error querying the database.' };
    }
  }

  return { reply: 'Welcome to SUMIT ROAD CARRIERS! 👋', quickOptions: ['Track a vehicle', 'Check shipment status', 'I need a quote'] };
}

router.post('/', async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'No message provided' });
  // NLP first
  try {
    const { intent, entities } = await nlpInterpret(message);
    if (intent === 'greeting') {
      return res.json({ reply: 'Welcome to SUMIT ROAD CARRIERS! 👋', quickOptions: ['Track a vehicle', 'Check shipment status', 'I need a quote'] });
    }
    if (intent === 'tracking' && entities.vehicleReg) {
      const vehicle = await Vehicle.findOne({ registration: entities.vehicleReg.toUpperCase() });
      if (vehicle) {
        return res.json({ reply: `Vehicle ${vehicle.registration} is '${vehicle.status}' near ${vehicle.currentLocation}. Driver: ${vehicle.driverName}.` });
      }
      return res.json({ reply: `Sorry, I couldn't find a vehicle with registration '${entities.vehicleReg}'.` });
    }
    if (intent === 'shipment_status' && entities.shipmentId) {
      const shipment = await Shipment.findOne({ shipmentId: entities.shipmentId.toUpperCase() }).populate('assignedVehicle');
      if (shipment) {
        let reply = `Shipment ${shipment.shipmentId} is '${shipment.status}'.`;
        if (shipment.status === 'In-Transit') {
          reply += ` Vehicle: ${shipment.assignedVehicle?.registration || 'N/A'} | ETA: ${shipment.eta ? new Date(shipment.eta).toLocaleString() : 'N/A'}.`;
        }
        return res.json({ reply });
      }
      return res.json({ reply: `Sorry, I couldn't find a shipment with ID '${entities.shipmentId}'.` });
    }
    if (intent === 'capacity_advice' && entities.weightTons) {
      const w = entities.weightTons;
      let suggestion = 'Trailer 32T';
      if (w <= 7) suggestion = 'LCV 7T';
      else if (w <= 16) suggestion = '10 Wheeler 16T';
      else if (w <= 20) suggestion = '12 Wheeler 20T';
      else if (w <= 25) suggestion = '14 Wheeler 25T';
      return res.json({ reply: `For ~${w} tons, recommended capacity is ${suggestion}.` });
    }
    if (intent === 'documents') {
      return res.json({ reply: 'Typical docs: LR (Lorry Receipt), eWay Bill (if applicable), Invoice/Challan, RC/Insurance/Permit of vehicle, Driver DL, Transit insurance as needed.' });
    }
    if (intent === 'quote_request') {
      const parts = [];
      if (entities.from && entities.to) parts.push(`Route: ${entities.from} → ${entities.to}`);
      if (entities.goods) parts.push(`Goods: ${entities.goods}`);
      return res.json({ reply: parts.length ? `Thanks! ${parts.join(' | ')} — You can get an instant AI quote in the Booking tab.` : 'Please share pickup city, drop city, goods type, and load (tons) for a quote.', quickOptions: ['Track a vehicle', 'Check shipment status'] });
    }
  } catch (e) {
    // fallthrough to legacy handler below
  }

  const legacy = await getBotResponse(message);
  res.json(legacy.reply ? legacy : { reply: legacy });
});

export default router;

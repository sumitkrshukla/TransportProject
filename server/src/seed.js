import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from './models/User.js';
import Driver from './models/Driver.js';
import Truck from './models/Truck.js';
import Booking from './models/Booking.js';
import Vehicle from './models/Vehicle.js';
import Shipment from './models/Shipment.js';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  const force = String(process.env.FORCE_SEED || '').toLowerCase() === '1' || String(process.env.FORCE_SEED || '').toLowerCase() === 'true';

  if (force) {
    console.log('FORCE_SEED enabled: clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Driver.deleteMany({}),
      Truck.deleteMany({}),
      Booking.deleteMany({}),
      Vehicle.deleteMany({}),
      Shipment.deleteMany({})
    ]);
  }

  // Seed users
  const users = [
    { email: 'admin@fleetai.com', password: 'password123', role: 'Admin' },
    { email: 'manager@fleetai.com', password: 'password123', role: 'Manager' }
  ];
  for (const u of users) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      await User.create({ email: u.email, passwordHash, role: u.role });
      console.log('Created user', u.email);
    } else if (force) {
      // Ensure baseline users exist with known password on force seed
      const passwordHash = await bcrypt.hash(u.password, 10);
      await User.updateOne({ email: u.email }, { $set: { passwordHash, role: u.role } }, { upsert: true });
      console.log('Refreshed user', u.email);
    }
  }

  // Seed drivers
  const drivers = [
    { driverId: 'D001', name: 'Ramesh', license: 'A-456', efficiency: 1.1, status: 'On Route', img: '/gettyimages-96252160-612x612.jpg', dob: '1985-05-15', pan: 'ABCDE1234F', dlExpiry: '2027-10-01', medExpiry: '2025-06-01' },
    { driverId: 'D002', name: 'Suresh', license: 'B-789', efficiency: 0.9, status: 'Available', img: '/gettyimages-1476756214-612x612.jpg', dob: '1990-11-20', pan: 'FGHIJ5678K', dlExpiry: '2026-03-25', medExpiry: '2026-01-10' },
    { driverId: 'D003', name: 'Rakesh', license: 'C-012', efficiency: 1.05, status: 'Available', img: '/radio-communication-young-truck-driver-in-casual-clothes-photo.jpg', dob: '1978-01-01', pan: 'LMNOP9012Q', dlExpiry: '2025-01-15', medExpiry: '2025-03-01' }
  ];
  if (force || (await Driver.countDocuments()) === 0) {
    if (!force) console.log('Drivers collection empty: seeding drivers...');
    await Driver.deleteMany({});
    await Driver.insertMany(drivers);
    console.log('Seeded drivers');
  } else {
    const c = await Driver.countDocuments();
    console.log(`Skipping drivers seed (existing docs: ${c})`);
  }

  // Seed trucks (India-specific with detailed permit/insurance)
  const trucks = [
    {
      truckId: 'T001',
      make: 'Tata',
      model: 'LPT 4825 Truck',
      modelYear: 2023,
      mileage: 12000,
      age: 1,
      capacity: 48,
      status: 'Available',
      lastMaintenance: '2025-09-01',
      reg: 'UP-62 HR 7814',
      img: '/3520-8x2-1614064955.jpeg',
      images: [],
      permitType: 'National Permit (NP)',
      permitValidityFrom: '2023-03-10',
      permitValidityTo: '2028-03-09',
      authorizedStates: ['UP','Bihar','Jharkhand','WB','MP','Maharashtra','Rajasthan','Haryana'],
      goodsCategory: 'Steel, cement, FMCG, textile',
      fitnessValidity: '2026-11-21',
      insuranceType: 'Comprehensive + Zero Depreciation',
      insurer: 'Tata AIG General Insurance',
      policyNumber: 'TAIG-TATA4825-61903',
      idv: '₹37,50,000',
      insuranceCoverage: 'Own damage, third-party, PA cover for driver (₹10 lakh), fire/theft, natural calamity',
      insuranceValidFrom: '2024-06-14',
      insuranceValidTo: '2025-06-13',
      location: { lat: 26.8467, lng: 80.9462 }
    },
    {
      truckId: 'T002',
      make: 'Ashok Leyland',
      model: '3120 Haulage',
      modelYear: 2022,
      mileage: 45000,
      age: 3,
      capacity: 31,
      status: 'Available',
      lastMaintenance: '2025-08-15',
      reg: 'BR-07 JX 4429',
      img: '/gettyimages-2171401075-612x612.jpg',
      images: [],
      permitType: 'State Permit + Border Permit',
      authorizedStates: ['Bihar','Jharkhand','Uttar Pradesh','West Bengal'],
      permitValidityFrom: '2022-08-18',
      permitValidityTo: '2027-08-17',
      goodsCategory: 'Industrial goods, agriculture produce, parcels',
      fitnessValidity: '2026-01-08',
      insuranceType: 'Third-Party + OD (Own Damage)',
      insurer: 'HDFC ERGO',
      policyNumber: 'HERGO-L3120-88210',
      idv: '₹24,80,000',
      insuranceCoverage: 'Accident, fire, natural disaster, roadside support',
      insuranceValidFrom: '2024-02-03',
      insuranceValidTo: '2025-02-02',
      location: { lat: 25.5941, lng: 85.1376 }
    },
    {
      truckId: 'T003',
      make: 'Mahindra',
      model: 'Blazo X 28',
      modelYear: 2024,
      mileage: 8000,
      age: 1,
      capacity: 28,
      status: 'In Use',
      lastMaintenance: '2025-09-20',
      reg: 'JH-15 CQ 9972',
      img: '/gettyimages-96252160-612x612.jpg',
      images: [],
      permitType: 'All India Goods Permit (AIGP)',
      permitValidityFrom: '2024-02-11',
      permitValidityTo: '2029-02-10',
      authorizedStates: ['All India'],
      goodsCategory: 'Non-hazardous bulk items, machinery, e-commerce loads',
      fitnessValidity: '2027-12-19',
      insuranceType: 'Comprehensive + Engine Protect + RSA',
      insurer: 'ICICI Lombard',
      policyNumber: 'ICICI-BLAZO-28-55192',
      idv: '₹29,20,000',
      insuranceCoverage: 'Own damage, third-party, towing, engine hydro-lock, PA cover',
      insuranceValidFrom: '2024-07-25',
      insuranceValidTo: '2025-07-24',
      location: { lat: 23.3441, lng: 85.3096 }
    }
  ];
  if (force || (await Truck.countDocuments()) === 0) {
    if (!force) console.log('Trucks collection empty: seeding trucks...');
    await Truck.deleteMany({});
    await Truck.insertMany(trucks);
    console.log('Seeded trucks');
  } else {
    const c = await Truck.countDocuments();
    console.log(`Skipping trucks seed (existing docs: ${c})`);
  }

  // Seed bookings
  const bookings = [
    { bookingId: 'B001', customer: 'Acme Corp', pickup: 'New York', dropoff: 'Chicago', load: 15, distance: 1280, status: 'Pending Assignment', quote: Math.round((1280 * 35 + 1280 * 15 * 1.5) * 2 + 5000), predictedTime: Number(((1280 / 70) * 1.1).toFixed(1)) },
    { bookingId: 'B002', customer: 'Initech LLC', pickup: 'Los Angeles', dropoff: 'Phoenix', load: 8, distance: 600, status: 'In Transit', driverId: 'D001', truckId: 'T003', quote: Math.round((600 * 35 + 600 * 8 * 1.5) * 2 + 3000), predictedTime: Number((((600 / 70) * 1.1) * 1.1).toFixed(1)) },
    { bookingId: 'B003', customer: 'RoadRunner Inc', pickup: 'Dallas', dropoff: 'Miami', load: 25, distance: 2100, status: 'Completed', driverId: 'D002', truckId: 'T002', quote: Math.round((2100 * 35 + 2100 * 25 * 1.5) * 2 + 8000), predictedTime: Number((((2100 / 70) * 1.1) * 1.05).toFixed(1)) }
  ];
  if (force || (await Booking.countDocuments()) === 0) {
    if (!force) console.log('Bookings collection empty: seeding bookings...');
    await Booking.deleteMany({});
    await Booking.insertMany(bookings);
    console.log('Seeded bookings');
  } else {
    const c = await Booking.countDocuments();
    console.log(`Skipping bookings seed (existing docs: ${c})`);
  }

  // Seed vehicles and shipments
  const now = new Date();
  const vehicles = [
    { registration: 'MH-12-AB-1234', currentLocation: 'Nagpur', status: 'On-Trip', driverName: 'Ramesh Kumar', location: { lat: 21.1458, lng: 79.0882 }, lastFixAt: now },
    { registration: 'UP-14-C-5678', currentLocation: 'Lucknow Yard', status: 'In Yard', driverName: 'Suresh Singh', location: { lat: 26.8467, lng: 80.9462 }, lastFixAt: now }
  ];
  if (force || (await Vehicle.countDocuments()) === 0) {
    if (!force) console.log('Vehicles collection empty: seeding vehicles...');
    await Vehicle.deleteMany({});
    const [vehicle1] = await Vehicle.insertMany(vehicles);
    console.log('Seeded vehicles');

    const shipments = [
      { shipmentId: 'S-123', status: 'In-Transit', eta: new Date(Date.now() + 24 * 60 * 60 * 1000), assignedVehicle: vehicle1._id },
      { shipmentId: 'S-456', status: 'Pending' }
    ];
    await Shipment.deleteMany({});
    await Shipment.insertMany(shipments);
    console.log('Seeded shipments');
  } else {
    const vc = await Vehicle.countDocuments();
    const sc = await Shipment.countDocuments();
    console.log(`Skipping vehicles/shipments seed (existing docs: vehicles=${vc}, shipments=${sc})`);
  }

  console.log('Seed complete');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

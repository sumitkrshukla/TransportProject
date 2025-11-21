import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  registration: { type: String, required: true, unique: true, uppercase: true },
  currentLocation: { type: String, default: 'In Yard' },
  status: { type: String, enum: ['In Yard', 'On-Trip', 'Maintenance'], default: 'In Yard' },
  driverName: { type: String, default: 'Unassigned' },
  location: {
    lat: { type: Number },
    lng: { type: Number }
  },
  lastFixAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Vehicle', vehicleSchema);

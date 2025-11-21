import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true, unique: true },
    name: String,
    license: String,
    efficiency: { type: Number, default: 1.0 },
    status: { type: String, enum: ['Available', 'On Route'], default: 'Available' },
    img: String,
    dob: String,
    pan: String,
    dlExpiry: String,
    medExpiry: String
  },
  { timestamps: true }
);

export default mongoose.model('Driver', driverSchema);

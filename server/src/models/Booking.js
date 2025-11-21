import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    customer: String,
    phone: String,
    email: String,
    pickup: String,
    dropoff: String,
    load: Number,
    distance: Number,
    status: { type: String, enum: ['Pending Assignment', 'In Transit', 'Completed'], default: 'Pending Assignment' },
    quote: Number,
    predictedTime: Number,
    driverId: { type: String, default: null },
    truckId: { type: String, default: null },
    truckType: { type: String, default: null },
    date: String
  },
  { timestamps: true }
);

export default mongoose.model('Booking', bookingSchema);

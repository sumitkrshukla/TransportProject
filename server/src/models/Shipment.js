import mongoose from 'mongoose';

const shipmentSchema = new mongoose.Schema({
  shipmentId: { type: String, required: true, unique: true, uppercase: true },
  status: { type: String, enum: ['Pending', 'In-Transit', 'Delivered'], default: 'Pending' },
  eta: { type: Date },
  assignedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' }
}, { timestamps: true });

export default mongoose.model('Shipment', shipmentSchema);

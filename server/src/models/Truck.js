import mongoose from 'mongoose';

const truckSchema = new mongoose.Schema(
  {
    truckId: { type: String, required: true, unique: true },
    make: String,
    model: String,
    modelYear: { type: Number },
    mileage: { type: Number, default: 0 },
    age: { type: Number, default: 1 },
    capacity: Number,
    status: { type: String, enum: ['Available', 'In Use'], default: 'Available' },
    lastMaintenance: String,
    img: String,
    images: [{ type: String }],
    reg: String,
    // Legacy simple fields kept for backward compatibility
    insExpiry: String,
    permitExpiry: String,
    // Permit details
    permitType: { type: String },
    permitValidityFrom: { type: String },
    permitValidityTo: { type: String },
    authorizedStates: [{ type: String }],
    goodsCategory: { type: String },
    fitnessValidity: { type: String },
    // Insurance details
    insuranceType: { type: String },
    insurer: { type: String },
    policyNumber: { type: String },
    idv: { type: String },
    insuranceCoverage: { type: String },
    insuranceValidFrom: { type: String },
    insuranceValidTo: { type: String },
    healthStatus: { type: String, enum: ['Good Condition', 'Needs Maintenance'], default: 'Good Condition' },
    location: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Truck', truckSchema);

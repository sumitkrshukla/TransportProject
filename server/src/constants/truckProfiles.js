export const TRUCK_PRESETS = {
  '10W': {
    key: '10W',
    name: '10-Wheeler · Heavy Trucks (3-Axle)',
    mileageKmPerL: 4.5,
    tollPerKm: 5.5,
    description: 'Low mileage (~4.5 km/l). Toll intensity about ₹5.50 per km.',
    note: 'Best for dense loads up to ~18T with good maneuverability.'
  },
  '12W': {
    key: '12W',
    name: '12-Wheeler · Multi-Axle Truck',
    mileageKmPerL: 3.5,
    tollPerKm: 7.0,
    description: 'Lower mileage (~3.5 km/l). Toll rate around ₹7.00 per km.',
    note: 'Balanced option for 20–24T consignments needing stability.'
  },
  '16W': {
    key: '16W',
    name: '16-Wheeler · Heavy Hauler / Trailer',
    mileageKmPerL: 3.0,
    tollPerKm: 8.5,
    description: 'Very low mileage (~3.0 km/l). Toll estimate ₹8.50 per km.',
    note: 'Ideal for bulk steel, cement, machinery where axle spread is needed.'
  },
  '22W': {
    key: '22W',
    name: '22-Wheeler · Oversized Cargo Carrier',
    mileageKmPerL: 2.0,
    tollPerKm: 11.0,
    description: 'Extremely low mileage (~2.0 km/l). Highest toll band (~₹11.00/km).',
    note: 'Used for project cargo / ODC consignments with escorts.'
  }
};

export const DEFAULT_TRUCK_TYPE = '12W';

export const getTruckProfile = (type) => TRUCK_PRESETS[type] || TRUCK_PRESETS[DEFAULT_TRUCK_TYPE];

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Reveal from './components/Reveal';
import api from './api';
import FastChatWidget from './components/FastChatWidget';

// Utility formatters and AI helpers (mirroring server for instant UI feedback)
const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
const predictFuelCost = (distance, loadWeight) => (distance * 35) + (distance * loadWeight * 1.5);
const predictDeliveryTime = (distance) => (distance / 70) * 1.1;
const predictMaintenanceRisk = (mileage, age) => Math.round(Math.min(10, mileage / 50000) * 5 + Math.min(10, age) * 0.5);

const TRUCK_OPTIONS = [
  {
    key: '10W',
    name: '10-Wheeler · Heavy Trucks (3-Axle)',
    mileage: '~4.5 km/l',
    toll: '~₹5.50/km',
    description: 'Reliable workhorse for dense loads up to ~18T with better city maneuverability.'
  },
  {
    key: '12W',
    name: '12-Wheeler · Multi-Axle Truck',
    mileage: '~3.5 km/l',
    toll: '~₹7.00/km',
    description: 'Balanced option for 20–24T consignments; best all-rounder for SRC operations.'
  },
  {
    key: '16W',
    name: '16-Wheeler · Heavy Hauler / Trailer',
    mileage: '~3.0 km/l',
    toll: '~₹8.50/km',
    description: 'Ideal for steel, cement, and machinery that need axle spread & highway dominance.'
  },
  {
    key: '22W',
    name: '22-Wheeler · Oversized Cargo',
    mileage: '~2.0 km/l',
    toll: '~₹11.00/km',
    description: 'For project cargo / ODC moves needing escorts and highest toll class compliance.'
  }
];

const DRIVER_PROFILES = {
  D001: { name: 'Ramesh', img: '/gettyimages-96252160-612x612.jpg' },
  D002: { name: 'Suresh', img: '/gettyimages-1476756214-612x612.jpg' },
  D003: { name: 'Rakesh', img: '/radio-communication-young-truck-driver-in-casual-clothes-photo.jpg' }
};

const getDriverProfile = (driverId, fallbackName = '', fallbackImg = '') => {
  const profile = driverId ? DRIVER_PROFILES[driverId] : null;
  return {
    name: profile?.name || fallbackName || 'N/A',
    img: profile?.img || fallbackImg || '/logo.svg'
  };
};

const getDriverName = (driverId, fallbackName = '') => getDriverProfile(driverId, fallbackName).name;
const getDriverAvatar = (driverId, fallbackImg = '') => getDriverProfile(driverId, '', fallbackImg).img;

// Lazy loader for Leaflet (CDN)
let leafletLoading = null;
const loadLeaflet = () => {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.body.appendChild(script);
  });
  return leafletLoading;
};

const Card = ({ title, value, colorClass = 'border-primary' }) => (
  <div className={`bg-card-dark p-4 rounded-xl shadow-lg border-t-4 ${colorClass} transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-2xl`}
       role="region">
    <p className="text-sm text-gray-400">{title}</p>
    <p className="text-xl md:text-2xl font-bold">{value}</p>
  </div>
);

const Toast = ({ message, type }) => {
  if (!message) return null;
  const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
  return (<div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-xl z-50 text-white transition-opacity duration-300 ${bgColor}`}>{message}</div>);
};

const LoginModal = ({ onClose, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const handleSubmit = async (e) => { e.preventDefault(); setError(''); await onLogin(email, password, setError); };
  return (
    <div id="login-modal" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target.id === 'login-modal' && onClose()}>
      <div className="bg-card-dark rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <h3 className="text-2xl font-bold text-primary border-b border-gray-700 pb-2">Fleet Management Login</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1">Email / Username</label>
            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-secondary focus:border-secondary" placeholder="e.g., admin@fleetai.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-secondary focus:border-secondary" placeholder="********" />
          </div>
          {error && (<p className="text-sm text-red-400 bg-red-900/30 p-2 rounded-lg">{error}</p>)}
          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-blue-700 transition">Login</button>
          </div>
        </form>
        <div className="text-xs text-gray-500 pt-2 text-center">
          <p className="font-semibold">Test Credentials:</p>
          <p>Admin: admin@fleetai.com / password123</p>
          <p>Manager: manager@fleetai.com / password123</p>
        </div>
      </div>
    </div>
  );
};

const AssignmentModal = ({ booking, drivers, trucks, onClose, onAssign }) => {
  const availableDrivers = drivers.filter(d => d.status === 'Available');
  const suitableTrucks = trucks.filter(t => t.status === 'Available' && t.capacity >= booking.load);

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const driverId = formData.get('driverId');
    const truckId = formData.get('truckId');
    if (driverId && truckId) onAssign(booking.bookingId, driverId, truckId);
  };

  return (
    <div id="assignment-modal" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target.id === 'assignment-modal' && onClose()}>
      <div className="bg-card-dark rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
        <h3 className="text-2xl font-bold text-primary border-b border-gray-700 pb-2">Assign Trip: {booking.bookingId}</h3>
        <p className="text-gray-300">Customer: <span className="font-semibold">{booking.customer}</span> | Load: {booking.load} Tons | Dist: {booking.distance} km</p>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="driverSelect" className="block text-sm font-medium text-gray-400 mb-1">Select Driver ({availableDrivers.length} Available)</label>
            <select id="driverSelect" name="driverId" required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-secondary focus:border-secondary">
              <option value="" disabled>Choose a driver...</option>
              {availableDrivers.map((d) => {
                const displayName = getDriverName(d.driverId, d.name);
                return (
                  <option key={d.driverId} value={d.driverId}>
                    {displayName} (Eff: {d.efficiency}x)
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label htmlFor="truckSelect" className="block text-sm font-medium text-gray-400 mt-4 mb-1">Select Suitable Truck ({suitableTrucks.length} Available)</label>
            <select id="truckSelect" name="truckId" required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-secondary focus:border-secondary">
              <option value="" disabled>Choose a truck...</option>
              {suitableTrucks.map(t => (<option key={t.truckId} value={t.truckId}>{t.make} {t.model} (Cap: {t.capacity} T)</option>))}
            </select>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-secondary text-white font-semibold hover:bg-orange-700 transition">Confirm Assignment</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RemoveAssetModal = ({ onClose, drivers, trucks, onRemoveDriver, onRemoveTruck, initialAssetType }) => {
  const [assetType, setAssetType] = useState(initialAssetType || 'driver');
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const availableDrivers = drivers.filter(d => d.status === 'Available');
  const availableTrucks = trucks.filter(t => t.status === 'Available');
  const options = assetType === 'driver' ? availableDrivers : availableTrucks;
  const assetName = assetType === 'driver' ? 'Driver' : 'Truck';
  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!selectedId) { setError(`Please select an ${assetName} to remove.`); return; }
    const asset = options.find(a => (assetType === 'driver' ? a.driverId : a.truckId) === selectedId);
    if (assetType === 'driver') onRemoveDriver(asset.driverId, asset.name);
    else onRemoveTruck(asset.truckId, asset.make, asset.model);
    onClose();
  };
  return (
    <div id="remove-asset-modal" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target.id === 'remove-asset-modal' && onClose()}>
      <div className="bg-card-dark rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-2xl font-bold text-red-500 border-b border-gray-700 pb-2">Remove/Decommission Asset</h3>
        <p className="text-sm text-gray-400">Warning: This action is irreversible and should only be used to remove retired/separated personnel or decommissioned vehicles.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Asset Type</label>
            <select value={assetType} onChange={(e) => { setAssetType(e.target.value); setSelectedId(''); setError(''); }} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-red-500 focus:border-red-500">
              <option value="driver">Driver (Personnel)</option>
              <option value="truck">Truck (Vehicle)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Select Available {assetName}</label>
            <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setError(''); }} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 focus:ring-red-500 focus:border-red-500">
              <option value="" disabled>Choose {assetName} to remove...</option>
              {options.length > 0 ? (
                options.map(item => (
                  <option key={assetType === 'driver' ? item.driverId : item.truckId} value={assetType === 'driver' ? item.driverId : item.truckId}>
                    {assetType === 'driver' ? `${item.name} (${item.driverId})` : `${item.make} ${item.model} (${item.truckId})`}
                  </option>
                ))
              ) : (
                <option value="" disabled>No Available {assetName}s Found</option>
              )}
            </select>
          </div>
          {error && (<p className="text-sm text-red-400 bg-red-900/30 p-2 rounded-lg">{error}</p>)}
          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500 transition">Cancel</button>
            <button type="submit" disabled={!selectedId} className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition disabled:bg-red-900 disabled:opacity-50">Confirm Removal</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddDriverModal = ({ onClose, onAdd, lastDriverId }) => {
  const [name, setName] = useState('');
  const [license, setLicense] = useState('');
  const [dob, setDob] = useState('');
  const [pan, setPan] = useState('');
  const [dlExpiry, setDlExpiry] = useState('');
  const [medExpiry, setMedExpiry] = useState('');
  const [efficiency, setEfficiency] = useState(1.0);
  const [imgDataUrl, setImgDataUrl] = useState('');
  const onSelectImage = (file) => {
    if (!file) { setImgDataUrl(''); return; }
    const reader = new FileReader();
    reader.onload = () => setImgDataUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextIdNum = parseInt((lastDriverId || 'D000').slice(1)) + 1;
    const newDriverId = 'D' + nextIdNum.toString().padStart(3, '0');
    await onAdd({
      driverId: newDriverId,
      name, license, dob, pan, dlExpiry, medExpiry,
      efficiency: parseFloat(efficiency), status: 'Available',
      img: imgDataUrl || `https://placehold.co/100x100/1e293b/FFFFFF?text=${name.slice(0, 1).toUpperCase()}${name.split(' ')[1]?.slice(0, 1).toUpperCase() || ''}`
    });
    onClose();
  };
  return (
    <div id="add-driver-modal" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target.id === 'add-driver-modal' && onClose()}>
      <div className="bg-card-dark rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold text-secondary border-b border-gray-700 pb-2">Add New Driver Credentials</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date of Birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Driver Photo</label>
            <div className="flex items-center gap-3">
              <input type="file" accept="image/*" onChange={(e) => onSelectImage(e.target.files && e.target.files[0])} className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-600 file:text-white hover:file:bg-gray-500" />
              {imgDataUrl ? (<img src={imgDataUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover border border-gray-600" />) : null}
            </div>
            <p className="mt-1 text-xs text-gray-500">PNG/JPG up to ~2MB. Stored inline for now.</p>
          </div>
          <input type="text" placeholder="Aadhaar/PAN Number" value={pan} onChange={(e) => setPan(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
          <h4 className="text-lg font-semibold text-primary pt-2 border-t border-gray-700/50">Compliance & Expiry</h4>
          <input type="text" placeholder="Driving License Number" value={license} onChange={(e) => setLicense(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">DL Expiry Date</label>
              <input type="date" value={dlExpiry} onChange={(e) => setDlExpiry(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Medical Certificate Expiry</label>
              <input type="date" value={medExpiry} onChange={(e) => setMedExpiry(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
            </div>
          </div>
          <h4 className="text-lg font-semibold text-primary pt-2 border-t border-gray-700/50">Performance Factor</h4>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Fuel Efficiency Factor ({efficiency}x)</label>
            <input type="number" step="0.05" min="0.5" max="1.5" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-secondary text-white font-semibold hover:bg-orange-700 transition">Add Driver to Fleet</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddTruckModal = ({ onClose, onAdd, lastTruckId }) => {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [modelYear, setModelYear] = useState('');
  const [mileage, setMileage] = useState(0);
  const [capacity, setCapacity] = useState(20);
  const [reg, setReg] = useState('');
  const [primaryImg, setPrimaryImg] = useState('');
  const [images, setImages] = useState('');
  const [insExpiry, setInsExpiry] = useState('');
  const [permitExpiry, setPermitExpiry] = useState('');
  const [permitType, setPermitType] = useState('');
  const [permitFrom, setPermitFrom] = useState('');
  const [permitTo, setPermitTo] = useState('');
  const [authorizedStates, setAuthorizedStates] = useState('');
  const [goodsCategory, setGoodsCategory] = useState('');
  const [fitnessValidity, setFitnessValidity] = useState('');
  const [insuranceType, setInsuranceType] = useState('');
  const [insurer, setInsurer] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [idv, setIdv] = useState('');
  const [insuranceCoverage, setInsuranceCoverage] = useState('');
  const [insuranceFrom, setInsuranceFrom] = useState('');
  const [insuranceTo, setInsuranceTo] = useState('');
  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextIdNum = parseInt((lastTruckId || 'T000').slice(1)) + 1;
    const newTruckId = 'T' + nextIdNum.toString().padStart(3, '0');
    const age = Math.floor(Math.random() * 5) + 1;
    await onAdd({
      truckId: newTruckId,
      make,
      model,
      modelYear: modelYear ? parseInt(modelYear) : undefined,
      mileage: parseInt(mileage),
      age,
      capacity: parseInt(capacity),
      status: 'Available',
      lastMaintenance: new Date().toISOString().slice(0, 10),
      reg,
      img: primaryImg || `https://placehold.co/100x100/3b82f6/FFFFFF?text=${newTruckId}`,
      images: images ? images.split(',').map(s => s.trim()).filter(Boolean) : [],
      // legacy
      insExpiry,
      permitExpiry,
      // permit
      permitType,
      permitValidityFrom: permitFrom,
      permitValidityTo: permitTo,
      authorizedStates: authorizedStates ? authorizedStates.split(',').map(s => s.trim()).filter(Boolean) : [],
      goodsCategory,
      fitnessValidity,
      // insurance
      insuranceType,
      insurer,
      policyNumber,
      idv,
      insuranceCoverage,
      insuranceValidFrom: insuranceFrom,
      insuranceValidTo: insuranceTo,
    });
    onClose();
  };
  return (
    <div id="add-truck-modal" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target.id === 'add-truck-modal' && onClose()}>
      <div className="bg-card-dark rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold text-primary border-b border-gray-700 pb-2">Add New Truck Details</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <input type="text" placeholder="Make (e.g., Tata)" value={make} onChange={(e) => setMake(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            <input type="text" placeholder="Model (e.g., LPT 4825)" value={model} onChange={(e) => setModel(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            <input type="number" placeholder="Model Year (e.g., 2023)" value={modelYear} onChange={(e) => setModelYear(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <input type="number" placeholder="Capacity (tons)" value={capacity} onChange={(e) => setCapacity(e.target.value)} required min="5" className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            <input type="number" placeholder="Current Mileage (km)" value={mileage} onChange={(e) => setMileage(e.target.value)} required min="0" className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            <input type="text" placeholder="Registration Number (e.g., UP-62 HR 7814)" value={reg} onChange={(e) => setReg(e.target.value)} required className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-secondary pt-2 border-t border-gray-700/50">Images</h4>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <input type="url" placeholder="Primary Image URL" value={primaryImg} onChange={(e) => setPrimaryImg(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
              <input type="text" placeholder="Additional Image URLs (comma separated)" value={images} onChange={(e) => setImages(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            </div>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-secondary pt-2 border-t border-gray-700/50">Permit</h4>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <input type="text" placeholder="Permit Type (e.g., NP, AIGP)" value={permitType} onChange={(e) => setPermitType(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
              <div>
                <label className="block text-sm text-gray-400 mb-1">Permit From</label>
                <input type="date" value={permitFrom} onChange={(e) => setPermitFrom(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Permit To</label>
                <input type="date" value={permitTo} onChange={(e) => setPermitTo(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <input type="text" placeholder="Authorized States (comma separated)" value={authorizedStates} onChange={(e) => setAuthorizedStates(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
              <input type="text" placeholder="Goods Category" value={goodsCategory} onChange={(e) => setGoodsCategory(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <input type="date" placeholder="Fitness Validity" value={fitnessValidity} onChange={(e) => setFitnessValidity(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
              <input type="date" placeholder="Legacy Permit Expiry (optional)" value={permitExpiry} onChange={(e) => setPermitExpiry(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
            </div>
          </div>
          <div>
            <h4 className="text-lg font-semibold text-secondary pt-2 border-t border-gray-700/50">Insurance</h4>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <input type="text" placeholder="Insurance Type" value={insuranceType} onChange={(e) => setInsuranceType(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
              <input type="text" placeholder="Insurer" value={insurer} onChange={(e) => setInsurer(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <input type="text" placeholder="Policy Number" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
              <input type="text" placeholder="IDV (e.g., ₹37,50,000)" value={idv} onChange={(e) => setIdv(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
              <input type="text" placeholder="Coverage" value={insuranceCoverage} onChange={(e) => setInsuranceCoverage(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600" />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Insurance From</label>
                <input type="date" value={insuranceFrom} onChange={(e) => setInsuranceFrom(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Insurance To</label>
                <input type="date" value={insuranceTo} onChange={(e) => setInsuranceTo(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Legacy Insurance Expiry (optional)</label>
                <input type="date" value={insExpiry} onChange={(e) => setInsExpiry(e.target.value)} className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-300" />
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 bg-gray-600 hover:bg-gray-500 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-blue-700 transition">Add Truck to Fleet</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DashboardView = ({ bookings, trucks, drivers, userRole, renderAssignmentModal, setCurrentView }) => {
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.quote || 0), 0);
  const activeTrips = bookings.filter(b => b.status === 'In Transit').length;
  const availableTrucks = trucks.filter(t => t.status === 'Available').length;
  const maintenanceAlerts = trucks.filter(t => t.healthStatus === 'Needs Maintenance').length;
  const pendingAssignment = bookings.filter(b => b.status === 'Pending Assignment').length;
  const canAssign = userRole === 'Admin' || userRole === 'Manager';
  return (
    <>
      <h2 className="text-3xl font-extrabold mb-6 text-white">Operational Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Reveal><Card title="Total Revenue (YTD)" value={formatCurrency(totalRevenue)} colorClass="border-primary" /></Reveal>
        <Reveal delay={80}><Card title="Active Trips" value={activeTrips} colorClass="border-secondary" /></Reveal>
        <Reveal delay={120}><Card title="Available Trucks" value={`${availableTrucks}/${trucks.length}`} colorClass="border-green-500" /></Reveal>
        <Reveal delay={160}><Card title="Pending Assignments" value={pendingAssignment} colorClass="border-yellow-500" /></Reveal>
        <Reveal delay={200}><Card title="Maintenance Alerts" value={maintenanceAlerts} colorClass={maintenanceAlerts > 0 ? 'border-red-500' : 'border-gray-500'} /></Reveal>
      </div>
      {maintenanceAlerts > 0 && (
        <div className="bg-card-dark p-6 rounded-xl shadow-lg border border-red-500 mb-8">
          <h3 className="text-xl font-bold text-red-500 mb-2">Maintenance Required</h3>
          <p className="text-gray-300 text-sm">
            {trucks.filter(t => t.healthStatus === 'Needs Maintenance').map(t => `${t.make} ${t.model} (${t.truckId})`).join(' | ')}
          </p>
        </div>
      )}
      <h3 className="text-xl font-semibold mb-4 text-white">Recent Bookings ({bookings.length})</h3>
      <Reveal>
      <div className="bg-card-dark rounded-xl shadow-lg overflow-x-auto transition-shadow duration-300 hover:shadow-2xl">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">ID / Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Route</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Load (T) / Time (H)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Quote / Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {bookings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No bookings yet. Create one from the Booking tab to populate the dashboard.
                </td>
              </tr>
            )}
            {bookings.map(b => {
              let statusClass;
              if (b.status === 'In Transit') statusClass = 'bg-green-700 text-green-100';
              else if (b.status === 'Pending Assignment') statusClass = 'bg-yellow-700 text-yellow-100';
              else if (b.status === 'Completed') statusClass = 'bg-blue-700 text-blue-100';
              else statusClass = 'bg-gray-700 text-gray-100';
              return (
                <tr key={b.bookingId} className="hover:bg-gray-700/50 transition">
                  <td className="px-4 py-3 whitespace-nowrap"><div className="font-bold">{b.bookingId}</div><div className="text-sm text-gray-400">{b.customer}</div></td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{b.pickup} → {b.dropoff}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm"><div className="text-yellow-300">{b.load} T</div><div className="text-green-300">{Number(b.predictedTime).toFixed(1)} Hrs</div></td>
                  <td className="px-4 py-3 whitespace-nowrap"><div className="font-bold text-secondary">{formatCurrency(b.quote)}</div><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`}>{b.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Reveal>
    </>
  );
};

const createInitialBookingForm = () => ({
  customer: '',
  phone: '',
  email: '',
  pickup: '',
  dropoff: '',
  load: '',
  goodsType: '',
  tripDate: '',
  truckType: '12W'
});

const createEmptyQuoteState = () => ({
  distance: 0,
  fuel: 0,
  tolls: 0,
  opex: 0,
  time: 0,
  quote: 0,
  etaDate: null,
  notes: {},
  tollSummary: null,
  premium: 0,
  premiumPct: 0,
  baseSubtotal: 0,
  marginPct: 0,
  confidence: 0,
  truckProfile: null
});

const BookingPortalView = ({ handleNewBooking }) => {
  const [form, setForm] = useState(() => createInitialBookingForm());
  const [tempQuote, setTempQuote] = useState(() => createEmptyQuoteState());
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);

  const recalc = async (state) => {
    const { pickup, dropoff, load, tripDate, truckType } = state;
    const numericLoad = Number(load);
    if (!pickup || !dropoff || !numericLoad) {
      setTempQuote(createEmptyQuoteState());
      return;
    }
    try {
      const { data } = await api.post('/ai/quote', { pickup, dropoff, load: numericLoad, tripDate, truckType });
      setTempQuote({
        distance: data.distance || 0,
        fuel: data.fuel || 0,
        tolls: data.tolls || 0,
        opex: data.opex || 0,
        time: data.time || 0,
        quote: data.quote || 0,
        etaDate: data.etaDate || null,
        notes: data.notes || {},
        tollSummary: data.tollSummary || null,
        premium: data.premium || 0,
        premiumPct: data.premiumPct || 0,
        baseSubtotal: data.baseSubtotal || 0,
        marginPct: data.marginPct || 0,
        confidence: data.confidence || 0,
        truckProfile: data.truckProfile || null
      });
    } catch {
      // fallback heuristic (client-side)
      const fuel = predictFuelCost(0, numericLoad);
      const time = predictDeliveryTime(0);
      const quote = Math.round(fuel * 2.2 + 5000);
      setTempQuote({
        ...createEmptyQuoteState(),
        fuel,
        time,
        quote,
        baseSubtotal: fuel,
        premiumPct: 0.12,
        marginPct: 0.08,
        confidence: 0.4,
        truckProfile: null
      });
    }
  };

  const onChange = async (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear any previous quote until user clicks Generate
    setTempQuote(createEmptyQuoteState());
  };

  const handleGenerateQuote = async () => {
    setIsQuoteLoading(true);
    try {
      await recalc(form);
    } finally {
      setIsQuoteLoading(false);
    }
  };

  const GlowCard = ({ title, value, subtitle, icon, gradient = 'from-primary/30 via-transparent to-black', children }) => (
    <div className={`relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br ${gradient} px-5 py-6 shadow-xl transition duration-500 hover:-translate-y-1 hover:shadow-2xl min-h-[150px] flex flex-col justify-between`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-gray-300">
        <span>{title}</span>
        {icon ? <span className="text-lg" aria-hidden>{icon}</span> : null}
      </div>
      <div>
        <div className="mt-2 text-3xl font-black text-white">{value}</div>
        {subtitle ? <p className="text-xs text-gray-300 mt-1">{subtitle}</p> : null}
        {children}
      </div>
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),transparent_55%)]" />
    </div>
  );

  const QuoteOutput = ({ distance, fuel, tolls, opex, time, quote, etaDate, notes, tollSummary, tripDate, premium, premiumPct, baseSubtotal, marginPct, confidence, isLoading, truckProfile }) => {
    if (isLoading) {
      return (
        <div className="bg-card-dark p-8 rounded-2xl border border-primary/40 text-center space-y-4 shadow-xl">
          <div className="mx-auto w-14 h-14 rounded-full border-4 border-secondary border-t-transparent animate-spin"></div>
          <p className="text-lg font-semibold text-secondary tracking-wider uppercase">Processing AI Quote</p>
          <p className="text-sm text-gray-400">Crunching live toll insights, diesel trends, and operating costs…</p>
        </div>
      );
    }
    if (!quote) return <p className="text-gray-400">Enter pickup, dropoff and load to see AI-powered pricing and time estimates.</p>;

    const subtotalBeforeMargin = (baseSubtotal || 0) + (premium || 0);
    const marginValue = subtotalBeforeMargin * (marginPct || 0);
    const km = Number(distance || 0);
    const etaText = etaDate ? new Date(etaDate).toLocaleString() : '-';
    const efficiency = time ? Math.min(99, (km / (time * 80)) * 100).toFixed(1) : '—';
    const highwayUsage = km ? Math.min(95, 55 + km / 30).toFixed(0) : '—';
    const trafficComplexity = time && km ? (time > km / 55 ? 'Moderate' : 'Low') : '—';
    const co2Kg = fuel ? (fuel / 3.785) * 2.68 : 0; // rough diesel emission factor

    return (
      <div className="flex flex-col gap-8 h-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <GlowCard title="Total Cost" value={formatCurrency(quote)} subtitle="Fuel + Tolls + Opex" icon="₹" gradient="from-emerald-500/30 via-primary/20 to-card-dark">
            <p className="text-[11px] text-gray-200 mt-3">AI confidence {Math.round((confidence || 0) * 100)}%. Includes operational buffer & {((marginPct || 0) * 100).toFixed(1)}% margin.</p>
          </GlowCard>
          <GlowCard title="Fuel Cost" value={formatCurrency(fuel)} subtitle={`${(fuel / (km || 1)).toFixed(2)} ₹ / km`} icon="⛽" gradient="from-amber-500/20 via-orange-500/10 to-card-dark" />
          <GlowCard title="Est. Tolls" value={formatCurrency(tolls)} subtitle="Based on NH rates" icon="🛣️" gradient="from-indigo-500/20 via-blue-500/10 to-card-dark" />
          <GlowCard title="Duration" value={`${time.toFixed(1)} hrs`} subtitle={`${km.toFixed(0)} km total`} icon="⏱️" gradient="from-purple-500/20 via-primary/10 to-card-dark">
            <p className="text-[11px] text-gray-200 mt-2">ETA: {etaText}</p>
          </GlowCard>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <GlowCard title="Route Intelligence" value={<span className="text-2xl font-black text-secondary">{highwayUsage !== '—' ? `${highwayUsage}%` : '—'}</span>} subtitle="Highway Usage Estimate" icon="🧠" gradient="from-slate-900 via-primary/10 to-card-dark">
            <div className="mt-3 space-y-1 text-sm text-gray-200">
              <div className="flex items-center justify-between">
                <span>Traffic Complexity</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/30 text-primary">{trafficComplexity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Route Efficiency</span>
                <span className="text-secondary font-bold">{efficiency}%</span>
              </div>
            </div>
          </GlowCard>
          <GlowCard title="Environmental Impact" value={<span className="text-2xl font-black text-green-300">{co2Kg ? co2Kg.toFixed(1) : '—'} kg CO₂</span>} subtitle="Switching to EV could cut this to near-zero." icon="🍃" gradient="from-green-500/20 via-emerald-500/10 to-card-dark" />
        </div>

        <div className="p-6 bg-card-dark/90 rounded-2xl border border-white/5 text-xs text-gray-200 space-y-4 shadow-inner">
          <p className="font-semibold">Detailed Cost Stack</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <p className="text-gray-400 text-[11px]">Operating Expenses</p>
              <p className="font-semibold">{formatCurrency(opex)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-[11px]">Subtotal (pre-premium)</p>
              <p className="font-semibold">{formatCurrency(baseSubtotal)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-[11px]">AI Premium ({((premiumPct || 0) * 100).toFixed(1)}%)</p>
              <p className="font-semibold">{formatCurrency(premium)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-[11px]">Margin ({((marginPct || 0) * 100).toFixed(1)}%)</p>
              <p className="font-semibold">{formatCurrency(marginValue)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-[11px]">Distance</p>
              <p className="font-semibold">{km} km</p>
            </div>
            <div>
              <p className="text-gray-400 text-[11px]">Planned Date</p>
              <p className="font-semibold">{tripDate || 'Not selected yet'}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Final AI quote blends diesel trend projections, toll intensity, driver efficiency data, and wear & tear buffers. Confidence: {Math.round((confidence || 0) * 100)}%.
          </p>
        </div>

        {truckProfile ? (
          <div className="p-5 bg-gradient-to-r from-gray-900 via-card-dark to-gray-900 border border-primary/30 text-sm text-gray-100 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Truck Preference</p>
              <span className="text-secondary font-semibold">{truckProfile.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-300">
              <div>
                <p className="text-gray-500">Mileage Benchmark</p>
                <p className="text-white font-semibold">{truckProfile.mileageKmPerL ? `${truckProfile.mileageKmPerL} km/l` : '—'}</p>
              </div>
              <div>
                <p className="text-gray-500">Toll Band</p>
                <p className="text-white font-semibold">₹{truckProfile.tollPerKm?.toFixed(2)}/km</p>
              </div>
            </div>
            {truckProfile.note ? <p className="mt-3 text-xs text-gray-400">{truckProfile.note}</p> : null}
          </div>
        ) : null}

        {tollSummary && (tollSummary.totalTagCost || tollSummary.totalCashCost) ? (
          <div className="p-3 bg-card-dark rounded-lg text-xs text-gray-200">
            <p className="font-semibold mb-1 text-secondary">Live Toll Insights (Tag vs Cash)</p>
            <p>
              Tag: {tollSummary.totalTagCost ? formatCurrency(tollSummary.totalTagCost) : '—'} | Cash: {tollSummary.totalCashCost ? formatCurrency(tollSummary.totalCashCost) : '—'}
            </p>
            {tollSummary.tolls?.length ? (
              <ul className="mt-2 space-y-1">
                {tollSummary.tolls.map((plaza, idx) => (
                  <li key={`${plaza.name}-${idx}`} className="text-gray-300">
                    {plaza.name}{plaza.state ? ` (${plaza.state})` : ''}: {plaza.tagCost ? formatCurrency(plaza.tagCost) : plaza.cashCost ? formatCurrency(plaza.cashCost) : '—'}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="p-3 bg-card-dark rounded-lg text-sm">
          <p className="text-gray-400 mb-1">No-Entry Advisory</p>
          <p className="font-semibold text-gray-200">{notes?.noEntry || '—'}</p>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-900/20 border border-yellow-600/40">
          <span className="text-yellow-400 text-lg" aria-hidden>⚠️</span>
          <p className="text-xs text-yellow-200">
            Note: The amount shown is an indicative estimate. Final pricing will be confirmed upon mutual agreement with the owner/manager and may vary based on scope, terms, and on-ground conditions.
          </p>
        </div>
      </div>
    );
  };
  return (
    <>
      <Reveal><h2 className="text-3xl font-extrabold mb-6 text-white">Customer & Booking Portal</h2></Reveal>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] gap-8 items-start">
        <Reveal className="contents"><div className="lg:col-span-2 bg-gradient-to-br from-gray-900 via-card-dark to-gray-900 border border-white/5 p-8 rounded-3xl shadow-2xl transition-transform hover:-translate-y-1">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-white tracking-tight">Get an Instant AI Quote & Book</h3>
            <span className="text-xs text-gray-400 uppercase tracking-[0.3em]">Powered by SRC AI</span>
          </div>
          <form onSubmit={(e) => handleNewBooking(e, { ...form, load: Number(form.load) || 0, distance: tempQuote.distance })} id="booking-form" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="customerName" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Customer / Company</label>
                <input type="text" id="customerName" name="customer" value={form.customer} onChange={onChange} placeholder="e.g., Sumit Logistics" required className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm" />
              </div>
              <div>
                <label htmlFor="phone" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Phone Number</label>
                <input type="tel" id="phone" name="phone" value={form.phone} onChange={onChange} placeholder="10-digit mobile" required pattern="^[0-9]{10}$" minLength="10" maxLength="10" className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm" />
              </div>
              <div>
                <label htmlFor="email" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Email</label>
                <input type="email" id="email" name="email" value={form.email} onChange={onChange} placeholder="name@company.com" required className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm" />
              </div>
              <div>
                <label htmlFor="pickup" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Pickup</label>
                <input type="text" id="pickup" name="pickup" value={form.pickup} onChange={onChange} placeholder="City / Pincode" required className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm" />
              </div>
              <div>
                <label htmlFor="dropoff" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Dropoff</label>
                <input type="text" id="dropoff" name="dropoff" value={form.dropoff} onChange={onChange} placeholder="City / Pincode" required className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm" />
              </div>
              <div>
                <label htmlFor="load" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Load (Tons)</label>
                <input type="number" id="load" name="load" value={form.load} onChange={onChange} placeholder="e.g., 18" required min="1" max="50" step="0.1" className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm" />
              </div>
              <div>
                <label htmlFor="goodsType" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Goods Type</label>
                <input type="text" id="goodsType" name="goodsType" value={form.goodsType} onChange={onChange} placeholder="Electronics, Steel, FMCG…" required className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm" />
              </div>
              <div>
                <label htmlFor="tripDate" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Preferred Transport Date</label>
                <input type="date" id="tripDate" name="tripDate" value={form.tripDate} onChange={onChange} required className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm text-gray-100" />
              </div>
              <div>
                <label htmlFor="truckPreference" className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Truck Preference</label>
                <select id="truckPreference" name="truckPreference" value={form.truckPreference} onChange={onChange} required className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-800/70 border border-gray-700 focus:ring-2 focus:ring-secondary focus:border-transparent text-sm">
                  <option value="">Select a truck preference</option>
                  <option value="12W">12W</option>
                  <option value="14W">14W</option>
                  <option value="16W">16W</option>
                  <option value="18W">18W</option>
                  <option value="20W">20W</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <button
                type="button"
                onClick={handleGenerateQuote}
                disabled={isQuoteLoading}
                className={`flex-1 relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 text-white font-semibold px-6 py-3 shadow-lg transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-95 ${isQuoteLoading ? 'opacity-60 cursor-wait' : 'hover:from-gray-500 hover:to-gray-600 hover:-translate-y-0.5'}`}
              >
                {isQuoteLoading ? 'Processing…' : 'Generate Quote'}
              </button>
              <button type="submit" className="flex-1 relative overflow-hidden rounded-xl bg-gradient-to-r from-secondary to-orange-500 text-white font-semibold px-6 py-3 shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
                Book Service
              </button>
            </div>
          </form>
        </div></Reveal>
        <Reveal delay={120} className="contents"><div className="bg-gradient-to-b from-card-dark/90 via-gray-900 to-card-dark border border-white/10 p-8 rounded-3xl shadow-2xl w-full h-full flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-secondary">Quote Prediction</h3>
            <span className="text-[11px] uppercase tracking-[0.3em] text-gray-500">Live AI</span>
          </div>
          <div className="flex-1">
            <QuoteOutput distance={tempQuote.distance} fuel={tempQuote.fuel} tolls={tempQuote.tolls} opex={tempQuote.opex} time={tempQuote.time} quote={tempQuote.quote} etaDate={tempQuote.etaDate} notes={tempQuote.notes} tollSummary={tempQuote.tollSummary} tripDate={form.tripDate} premium={tempQuote.premium} premiumPct={tempQuote.premiumPct} baseSubtotal={tempQuote.baseSubtotal} marginPct={tempQuote.marginPct} confidence={tempQuote.confidence} truckProfile={tempQuote.truckProfile} isLoading={isQuoteLoading} />
          </div>
        </div></Reveal>
      </div>
    </>
  );
}
;

const AboutView = () => (
  <>
    <h2 className="text-3xl font-extrabold mb-2 text-white">About</h2>
    <div className="w-full flex items-center justify-center mb-6">
      <img src="/logo.svg" alt="SRC logo" className="w-32 h-32" />
    </div>
    <div className="w-full flex items-center justify-center mb-6">
      <div className="leading-tight text-center">
        <h3 className="text-2xl md:text-3xl font-extrabold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out drop-shadow-sm">
          SUMIT ROAD CARRIERS
        </h3>
      </div>
    </div>
    <div className="space-y-6">
      <Reveal><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <p className="text-gray-200">
          Sumit Road Carriers (SRC) is a technology-driven surface transport and logistics company built for reliability, transparency, and speed. Headquartered in Nigha, we specialize in end-to-end goods movement across India—covering first-mile pickup, line-haul, hub operations, last-mile delivery, and reverse logistics. From single-pallet PTL (Part Truck Load) to full-truckload and dedicated route contracts, we bring enterprise-grade discipline to every shipment, whether you’re a fast-growing SME or a national brand.
        </p>
      </div></Reveal>
      <Reveal delay={80}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">Our Mission</h3>
        <p className="text-gray-200">To make road transport predictable and effortless—with consistent on-time delivery, real-time visibility, proactive exception handling, and fair, transparent pricing.</p>
      </div></Reveal>
      <Reveal delay={120}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">What We Do</h3>
        <ul className="list-disc ml-6 space-y-2 text-gray-200">
          <li>PTL / LTL & FTL Transport: Door pick-up, hub-to-hub, and door delivery options tailored to your cost–speed needs.</li>
          <li>Scheduled Line-Hauls: Time-bound nightly departures on key lanes for dependable transit.</li>
          <li>Dedicated Fleet & Contract Logistics: Guaranteed capacity and custom SLAs for manufacturers and distributors.</li>
          <li>Express & Priority Cargo: Faster turnarounds on select routes with tight control on handovers.</li>
          <li>Reverse Logistics: Efficient returns, RTOs, and vendor-to-warehouse consolidation.</li>
          <li>Value-Added Services: E-way bill support, ePOD (digital proof of delivery), COD handling, and secure storage at transit hubs.</li>
        </ul>
      </div></Reveal>
      <Reveal delay={160}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">Service Footprint (Current Lanes)</h3>
        <p className="text-gray-200 mb-3">We serve shippers across a pan-India footprint with strong presence in the North, East, West, and Central regions. Our active states include:</p>
        <p className="text-gray-200">Delhi-NCR, Uttar Pradesh, Bihar, Jharkhand, West Bengal, Haryana, Punjab, Rajasthan, Gujarat, Maharashtra, Madhya Pradesh, Chhattisgarh, Odisha, Telangana, Andhra Pradesh, Karnataka, Tamil Nadu.</p>
        <p className="text-gray-300 mt-2 text-sm">If you ship beyond these, talk to us—our partner network enables coverage to additional locations and union territories.</p>
      </div></Reveal>
      <Reveal delay={200}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">On-Time Performance</h3>
        <p className="text-gray-200">Our internal OTIF (On-Time, In-Full) target is 97%+ on core scheduled lanes, measured monthly with route-wise dashboards. (Replace with your latest figure if you prefer a fixed number.)</p>
      </div></Reveal>
      <Reveal delay={240}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">How We Deliver Reliability</h3>
        <ul className="list-disc ml-6 space-y-2 text-gray-200">
          <li>Hub-and-Spoke Discipline: Fixed cut-off times, pre-manifesting, and scheduled departures keep transit predictable—an operating model used by India’s most reliable carriers.</li>
          <li>Real-Time Visibility: GPS-enabled vehicles, geo-fences on critical waypoints, and live milestone updates for customers.</li>
          <li>Digital Proofs & Auditability: ePOD, photo-capture, tamper-evident seals on request, and automated status alerts.</li>
          <li>Exception Management: SLA-backed escalation, alternate routing on disruptions, and proactive consignee coordination.</li>
        </ul>
      </div></Reveal>
      <Reveal delay={280}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">Safety & Compliance—Non-Negotiable</h3>
        <ul className="list-disc ml-6 space-y-2 text-gray-200">
          <li>Vehicle & Driver Safety: Preventive maintenance, fitness compliance, fatigue-management schedules, and mandatory rest periods.</li>
          <li>Visibility & Forensics: Adoption roadmap for Vehicle Location Tracking Devices (VLTD) and Event Data Recorders ahead of the national mandate timeline for applicable categories.</li>
          <li>Night Visibility & Markings: Retro-reflective markings and signage practices as per enforcement advisories to improve roadside safety.</li>
        </ul>
      </div></Reveal>
      <Reveal delay={320}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">Technology You Can Trust</h3>
        <ul className="list-disc ml-6 space-y-2 text-gray-200">
          <li>Customer Portal & APIs: Bookings, tracking, rate cards, invoices, ePOD, and MIS—everything in one place, with API hooks for ERPs and marketplaces.</li>
          <li>Route Intelligence: Lane-wise TAT benchmarking, dynamic re-routing, and capacity planning help control cost per km without compromising SLAs.</li>
          <li>Data Security: Role-based access and audit trails for all transactions.</li>
        </ul>
      </div></Reveal>
      <Reveal delay={360}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">Industries We Serve</h3>
        <p className="text-gray-200">Consumer durables, FMCG, auto-components, agri-inputs, engineering goods, industrial supplies, textiles, e-commerce sellers, and more. We understand varied packaging norms, handling needs, and seasonality patterns.</p>
      </div></Reveal>
      <Reveal delay={400}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">Sustainability in Motion</h3>
        <p className="text-gray-200">We’re actively working to reduce emissions and waste through better load consolidation, route planning, and pilots with alternative fuels & solar-backed facilities—moves increasingly adopted by responsible road transporters in India.</p>
      </div></Reveal>
      <Reveal delay={440}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out">Why Shippers Choose SRC</h3>
        <ul className="list-disc ml-6 space-y-2 text-gray-200">
          <li>Predictable Transit: Scheduled line-hauls and disciplined hubs mean fewer surprises.</li>
          <li>Network Depth: A growing multi-state footprint with dependable last-mile on key trade lanes.</li>
          <li>Transparent Ops: Live tracking, ePOD, and clear SLAs.</li>
          <li>Custom Solutions: From single-pallet PTL to dedicated fleets with driver/vehicle KPIs.</li>
          <li>Safety First: Compliance and proactive risk controls, aligned with evolving national norms.</li>
        </ul>
      </div></Reveal>
    </div>
  </>
);

const FleetManagementView = ({ drivers, trucks, userRole, openAddDriverModal, openAddTruckModal, openRemoveAssetModal, onUpdateHealth }) => {
  const isAuthorized = userRole === 'Admin' || userRole === 'Manager';
  const [openSection, setOpenSection] = useState(null);

  const TruckList = () => (
    <div className="md:col-span-2">
      <h3 className="text-xl font-semibold mb-3 text-primary">Vehicle Status & Maintenance ({trucks.length} Trucks)</h3>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {trucks.map(t => {
          let riskColor, riskText;
          if (t.healthStatus === 'Needs Maintenance') { riskColor = 'bg-red-600'; riskText = 'Needs Maintenance'; }
          else { riskColor = 'bg-green-600'; riskText = 'Good Condition'; }
          return (
            <div key={t.truckId} className={`bg-card-dark p-4 rounded-xl shadow-lg border-l-4 ${t.status === 'In Use' ? 'border-secondary' : 'border-green-500'}`}>
              <div className="flex items-center space-x-4">
                <img src={t.img || (t.images && t.images[0])} alt={`Truck ${t.truckId}`} className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-grow">
                  <p className="text-sm text-gray-300 font-semibold">{t.make} {t.model} {t.modelYear ? `(${t.modelYear})` : ''} — {t.truckId}</p>
                  <p className="text-sm text-gray-400">Reg: {t.reg} | Cap: {t.capacity} T | Maint. Due: {t.healthStatus === 'Needs Maintenance' ? 'Yes' : 'No'}</p>
                </div>
                <div className="text-right flex items-center space-x-3">
                  <div className="text-left">
                    <p className={`text-sm font-semibold ${t.status === 'In Use' ? 'text-secondary' : 'text-green-500'}`}>{t.status}</p>
                    <span className={`px-2 py-0.5 text-xs font-bold text-white rounded-full whitespace-nowrap ${riskColor}`}>{riskText}</span>
                  </div>
                  <div className="min-w-[200px] flex items-end space-x-2">
                    <label className="block text-xs text-gray-400 mb-1">Health</label>
                    <div className="flex-1">
                      <select disabled={!(userRole === 'Admin' || userRole === 'Manager')}
                              value={t.healthStatus || 'Good Condition'}
                              onChange={(e) => onUpdateHealth(t.truckId, e.target.value)}
                              className="w-full p-2 rounded-lg bg-gray-700 border border-gray-600 text-sm">
                        <option value="Good Condition">Good Condition</option>
                        <option value="Needs Maintenance">Needs Maintenance</option>
                      </select>
                    </div>
                    {(userRole === 'Admin' || userRole === 'Manager') && (
                      <button onClick={() => onUpdateHealth(t.truckId, 'Good Condition')} className="px-2 py-2 text-xs bg-green-700 hover:bg-green-600 rounded-lg">Set Good</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-gray-700/40 p-3 rounded-lg">
                  <p className="text-gray-400">Permit</p>
                  <p className="text-gray-200 font-semibold">{t.permitType || '-'}{t.permitValidityFrom && t.permitValidityTo ? ` (${t.permitValidityFrom} → ${t.permitValidityTo})` : ''}</p>
                  <p className="text-gray-300 text-xs">States: {t.authorizedStates && t.authorizedStates.length ? t.authorizedStates.join(', ') : '-'}</p>
                  <p className="text-gray-300 text-xs">Goods: {t.goodsCategory || '-'}</p>
                </div>
                <div className="bg-gray-700/40 p-3 rounded-lg">
                  <p className="text-gray-400">Fitness</p>
                  <p className="text-gray-200 font-semibold">{t.fitnessValidity || '-'}</p>
                </div>
                <div className="bg-gray-700/40 p-3 rounded-lg">
                  <p className="text-gray-400">Insurance</p>
                  <p className="text-gray-200 font-semibold">{t.insuranceType || '-'}{t.insurer ? ` — ${t.insurer}` : ''}</p>
                  <p className="text-gray-300 text-xs">Policy: {t.policyNumber || '-'}</p>
                  <p className="text-gray-300 text-xs">IDV: {t.idv || '-'}</p>
                  <p className="text-gray-300 text-xs">{t.insuranceValidFrom && t.insuranceValidTo ? `${t.insuranceValidFrom} → ${t.insuranceValidTo}` : ''}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between space-x-4 mt-6">
        {isAuthorized ? (
          <button onClick={openAddTruckModal} className="w-1/2 bg-primary/20 text-primary border border-primary p-2 rounded-lg font-semibold hover:bg-primary/30 transition">+ Add New Truck</button>
        ) : (
          <div className="w-1/2" />
        )}
        <div className="w-1/2">
          {userRole === 'Admin' && (
            <button onClick={() => openRemoveAssetModal('truck')} className="w-full bg-red-900/20 text-red-400 border border-red-900 p-2 rounded-lg font-semibold hover:bg-red-900/40 transition">- Remove/Decommission</button>
          )}
        </div>
      </div>
    </div>
  );

  const DriverList = () => (
    <div className="bg-card-dark p-6 rounded-xl shadow-lg">
      <h3 className="text-xl font-semibold mb-3 text-secondary">Driver Availability ({drivers.length})</h3>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
        {drivers.map((d) => {
          const displayName = getDriverName(d.driverId, d.name);
          const avatar = getDriverAvatar(d.driverId, d.img);
          return (
            <div key={d.driverId} className="p-3 bg-gray-700/50 rounded-lg flex items-center space-x-3">
              <img src={avatar} alt={`Driver ${displayName}`} className="w-12 h-12 rounded-full object-cover" />
              <div className="flex-grow">
                <p className="font-semibold">{displayName}</p>
                <p className="text-xs text-gray-400">DL: {d.license} | Eff: {d.efficiency}x</p>
                <p className="text-xs text-red-400">{d.dlExpiry < new Date().toISOString().slice(0, 10) ? 'DL Expired!' : ''}</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${d.status === 'On Route' ? 'bg-secondary/20 text-secondary' : 'bg-green-500/20 text-green-400'}`}>{d.status}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between space-x-4 mt-6">
        {isAuthorized ? (
          <button onClick={openAddDriverModal} className="w-1/2 bg-secondary/20 text-secondary border border-secondary p-2 rounded-lg font-semibold hover:bg-secondary/30 transition">+ Add New Driver</button>
        ) : (
          <div className="w-1/2" />
        )}
        {userRole === 'Admin' && (
          <button onClick={() => openRemoveAssetModal('driver')} className="w-1/2 bg-red-900/20 text-red-400 border border-red-900 p-2 rounded-lg font-semibold hover:bg-red-900/40 transition">- Remove Personnel</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Reveal><h2 className="text-3xl font-extrabold mb-6 text-white">Fleet & Driver Management</h2></Reveal>
      <div className="space-y-4">
        <div className="bg-card-dark rounded-xl shadow-lg border border-gray-700">
          <button
            onClick={() => setOpenSection(openSection === 'trucks' ? null : 'trucks')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/40 transition"
            aria-expanded={openSection === 'trucks'}
          >
            <span className="text-lg font-semibold text-primary">Trucks</span>
            <span className={`transform transition-transform duration-300 ${openSection === 'trucks' ? 'rotate-180' : ''}`}>⌄</span>
          </button>
          <div
            className="overflow-hidden transition-all duration-500 ease-out"
            style={{ maxHeight: openSection === 'trucks' ? 4000 : 0, opacity: openSection === 'trucks' ? 1 : 0 }}
          >
            <div className="p-4">
              <Reveal className="contents"><TruckList /></Reveal>
            </div>
          </div>
        </div>

        <div className="bg-card-dark rounded-xl shadow-lg border border-gray-700">
          <button
            onClick={() => setOpenSection(openSection === 'drivers' ? null : 'drivers')}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/40 transition"
            aria-expanded={openSection === 'drivers'}
          >
            <span className="text-lg font-semibold text-secondary">Drivers</span>
            <span className={`transform transition-transform duration-300 ${openSection === 'drivers' ? 'rotate-180' : ''}`}>⌄</span>
          </button>
          <div
            className="overflow-hidden transition-all duration-500 ease-out"
            style={{ maxHeight: openSection === 'drivers' ? 4000 : 0, opacity: openSection === 'drivers' ? 1 : 0 }}
          >
            <div className="p-4">
              <Reveal className="contents"><DriverList /></Reveal>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const LiveTrackingView = ({ bookings, trucks, drivers, userRole, onCompleteTrip }) => {
  const isAuthorized = userRole === 'Admin' || userRole === 'Manager';
  if (!isAuthorized) return (
    <div className="text-center p-10 bg-card-dark rounded-xl shadow-2xl">
      <h2 className="text-2xl font-bold text-red-400 mb-2">Unauthorized Access</h2>
      <p className="text-gray-400">Please log in as an Admin or Manager to view Live Tracking.</p>
    </div>
  );
  const transitBookings = bookings.filter(b => b.status === 'In Transit');
  const canComplete = isAuthorized;

  const [leafletReady, setLeafletReady] = useState(false);
  const mapRef = React.useRef(null);
  const lmapRef = React.useRef(null);
  const markersLayerRef = React.useRef(null);
  // Single-vehicle tracking state
  const [trackReg, setTrackReg] = useState('');
  const [trackError, setTrackError] = useState('');
  const trackedMarkerRef = React.useRef(null);
  const trackingTimerRef = React.useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled) return;
        if (!lmapRef.current) {
          lmapRef.current = L.map(mapRef.current, { zoomControl: true });
          lmapRef.current.setView([23.2599, 77.4126], 5);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(lmapRef.current);
          markersLayerRef.current = L.layerGroup().addTo(lmapRef.current);
        }
        setLeafletReady(true);
      })
      .catch(() => setLeafletReady(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!leafletReady || !window.L || !lmapRef.current || !markersLayerRef.current) return;
    const L = window.L;
    markersLayerRef.current.clearLayers();
    const locTrucks = trucks.filter(t => t.location && typeof t.location.lat === 'number' && typeof t.location.lng === 'number');
    if (locTrucks.length === 0) return;
    const bounds = L.latLngBounds([]);
    locTrucks.forEach(t => {
      const pos = [t.location.lat, t.location.lng];
      const marker = L.marker(pos, { title: `${t.make} ${t.model} (${t.truckId})` })
        .bindPopup(`<div style="font-size:12px"><b>${t.truckId}</b> — ${t.make} ${t.model}<br/>Status: ${t.status}<br/>Health: ${t.healthStatus || 'Good Condition'}</div>`);
      marker.addTo(markersLayerRef.current);
      bounds.extend(pos);
    });
    lmapRef.current.fitBounds(bounds.pad(0.2));
  }, [leafletReady, trucks]);
  // Start polling for a single vehicle by registration number
  const startTracking = React.useCallback(async (reg) => {
    if (!reg) return;
    const upper = String(reg).toUpperCase().trim();
    setTrackError('');
    setTrackReg(upper);
    if (trackingTimerRef.current) { clearInterval(trackingTimerRef.current); trackingTimerRef.current = null; }
    const tick = async () => {
      try {
        const { data } = await api.get(`/vehicles/${encodeURIComponent(upper)}/location`);
        const loc = data?.location;
        if (!leafletReady || !window.L || !lmapRef.current) return;
        const L = window.L;
        if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
          const latlng = [loc.lat, loc.lng];
          if (!trackedMarkerRef.current) {
            trackedMarkerRef.current = L.marker(latlng, { title: `${upper}` })
              .bindPopup(`<div style="font-size:12px"><b>${upper}</b><br/>Status: ${data.status || ''}<br/>Driver: ${data.driverName || ''}<br/>Time: ${data.lastFixAt ? new Date(data.lastFixAt).toLocaleString() : 'N/A'}</div>`)
              .addTo(lmapRef.current);
          } else {
            trackedMarkerRef.current.setLatLng(latlng);
            trackedMarkerRef.current.setPopupContent(`<div style=\"font-size:12px\"><b>${upper}</b><br/>Status: ${data.status || ''}<br/>Driver: ${data.driverName || ''}<br/>Time: ${data.lastFixAt ? new Date(data.lastFixAt).toLocaleString() : 'N/A'}</div>`);
          }
          lmapRef.current.panTo(latlng, { animate: true, duration: 0.5 });
        } else {
          setTrackError('No GPS fix yet for this vehicle.');
        }
      } catch (_) {
        setTrackError('Vehicle not found or server unavailable.');
      }
    };
    await tick();
    trackingTimerRef.current = setInterval(tick, 8000);
  }, [leafletReady]);

  React.useEffect(() => () => { if (trackingTimerRef.current) clearInterval(trackingTimerRef.current); }, []);
  return (
    <>
      <Reveal><h2 className="text-3xl font-extrabold mb-6 text-white">Live Tracking & Route Optimization</h2></Reveal>
      <Reveal delay={80}><div className="bg-card-dark p-4 rounded-xl shadow-lg mb-6 transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-semibold mb-3 text-primary">Real-Time Fleet View</h3>
        <div className="h-64 rounded-lg overflow-hidden relative">
          <div ref={mapRef} className="absolute inset-0" />
          {!leafletReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-sm">Loading map…</div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Track Vehicle by Registration (e.g., MH-12-AB-1234)</label>
            <div className="flex gap-2">
              <input value={trackReg} onChange={(e) => setTrackReg(e.target.value)} placeholder="Enter vehicle number" className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-gray-100" />
              <button onClick={() => startTracking(trackReg)} className="px-4 py-2 rounded-lg bg-secondary text-white font-semibold hover:bg-orange-700 transition">Track</button>
            </div>
            {trackError ? (<p className="text-xs text-red-400 mt-1">{trackError}</p>) : null}
          </div>
          <div className="text-xs text-gray-400 self-end">GPS updates every 8s. Map pans to the latest position.</div>
        </div>
      </div></Reveal>
      <Reveal delay={140}><h3 className="text-xl font-semibold mb-4 text-white">Active Trips ({transitBookings.length})</h3></Reveal>
      <div className="space-y-4">
        {transitBookings.map(b => {
          const driver = drivers.find(d => d.driverId === b.driverId) || { name: 'N/A', efficiency: 1 };
          const driverName = getDriverName(b.driverId, driver.name);
          const truck = trucks.find(t => t.truckId === b.truckId) || { make: 'N/A', model: 'N/A' };
          const eta = (Number(b.predictedTime || 0) / (driver.efficiency || 1)).toFixed(1);
          return (
            <Reveal key={b.bookingId}><div className="bg-card-dark p-4 rounded-xl shadow-lg border-l-4 border-secondary transition-shadow hover:shadow-2xl">
              <div className="flex justify-between items-center mb-2">
                <p className="text-lg font-bold text-secondary">{b.customer}: {b.pickup} → {b.dropoff}</p>
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-500 text-white">Route Optimized</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-300">
                <div><span className="font-semibold text-gray-400">Driver:</span> {driverName}</div>
                <div><span className="font-semibold text-gray-400">Truck:</span> {truck.make} {truck.model} ({b.truckId})</div>
                <div><span className="font-semibold text-gray-400">Load:</span> {b.load} T</div>
                <div><span className="font-semibold text-gray-400">AI ETA:</span> <span className="text-green-400">{eta} hrs</span></div>
              </div>
              {canComplete && (
                <div className="mt-4 pt-3 border-t border-gray-700 flex justify-end">
                  <button onClick={() => onCompleteTrip(b.bookingId)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition">Mark Trip as Complete</button>
                </div>
              )}
            </div></Reveal>
          );
        })}
      </div>
    </>
  );
};

const AnalyticsView = ({ bookings, drivers, userRole }) => {
  const totalProfit = bookings.reduce((sum, b) => sum + (b.quote - predictFuelCost(b.distance, b.load) * 1.5 - 5000), 0);
  const completedBookings = bookings.filter(b => b.status === 'Completed');
  const onTimeRate = (completedBookings.length / (bookings.length || 1) * 100) || 0;
  const avgFuelEfficiency = drivers.length ? drivers.reduce((sum, d) => sum + d.efficiency, 0) / drivers.length : 0;
  if (userRole !== 'Admin') return (
    <div className="text-center p-10 bg-card-dark rounded-xl shadow-2xl">
      <h2 className="text-2xl font-bold text-red-400 mb-2">Restricted Access</h2>
      <p className="text-gray-400">Only the <b>Admin</b> role can access Financial and Advanced Analytics.</p>
    </div>
  );
  return (
    <>
      <Reveal><h2 className="text-3xl font-extrabold mb-6 text-white">AI-Driven Financial & Performance Analytics</h2></Reveal>
      <Reveal delay={80}><div className="bg-card-dark p-6 rounded-xl shadow-lg mb-8 transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-semibold mb-4 text-primary">Expense & Profit Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-green-900/40 border border-green-700"><p className="text-sm text-green-300">Total Simulated Profit (YTD)</p><p className="text-2xl font-bold">{formatCurrency(totalProfit)}</p></div>
          <div className="p-4 rounded-lg bg-red-900/40 border border-red-700"><p className="text-sm text-red-300">Total Est. Fuel Expense</p><p className="text-2xl font-bold">{formatCurrency(bookings.reduce((sum, b) => sum + predictFuelCost(b.distance, b.load), 0))}</p></div>
          <div className="p-4 rounded-lg bg-blue-900/40 border border-blue-700"><p className="text-sm text-blue-300">Avg. Revenue per Trip</p><p className="text-2xl font-bold">{formatCurrency(bookings.reduce((sum, b) => sum + b.quote, 0) / (bookings.length || 1))}</p></div>
        </div>
      </div></Reveal>
      <Reveal delay={140}><div className="bg-card-dark p-6 rounded-xl shadow-lg transition-shadow hover:shadow-2xl">
        <h3 className="text-xl font-semibold mb-4 text-secondary">Driver Performance Analytics</h3>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-card-dark border border-gray-700"><p className="text-sm text-gray-400">On-Time Delivery Rate</p><p className="text-2xl font-bold text-green-400">{onTimeRate.toFixed(1)}%</p></div>
          <div className="p-4 rounded-lg bg-card-dark border border-gray-700"><p className="text-sm text-gray-400">Avg. Fuel Efficiency Factor</p><p className="text-2xl font-bold text-yellow-400">{avgFuelEfficiency.toFixed(2)}x</p></div>
        </div>
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Driver</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Efficiency Factor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Trips</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {drivers.map(d => (
              <tr key={d.driverId} className="hover:bg-gray-700/50 transition">
                <td className="px-4 py-3 whitespace-nowrap font-semibold">{getDriverName(d.driverId, d.name)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-yellow-300">{d.efficiency.toFixed(2)}x</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{bookings.filter(b => b.driverId === d.driverId).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></Reveal>
    </>
  );
};

const RequestsView = ({ bookings, userRole, renderAssignmentModal, onRejectBooking }) => {
  const pending = bookings.filter(b => b.status === 'Pending Assignment');
  const canAssign = userRole === 'Admin' || userRole === 'Manager';
  return (
    <>
      <Reveal><div className="mb-6 flex items-center justify-between">
        <h2 className="text-3xl font-extrabold text-white">Booked / Requested</h2>
        {canAssign && (
          <a
            href="/api/bookings/export"
            className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-blue-700 transition"
            download
            target="_blank"
            rel="noopener noreferrer"
            title="Download bookings as CSV"
          >
            Download CSV
          </a>
        )}
      </div></Reveal>
      <Reveal delay={120}><div className="bg-card-dark rounded-xl shadow-lg overflow-x-auto transition-shadow hover:shadow-2xl">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">ID / Customer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Route</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Load (T) / Dist (km)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Quote</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {pending.map(b => (
              <tr key={b.bookingId} className="hover:bg-gray-700/50 transition">
                <td className="px-4 py-3 whitespace-nowrap"><div className="font-bold">{b.bookingId}</div><div className="text-sm text-gray-400">{b.customer}</div></td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{b.pickup} → {b.dropoff}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm"><div className="text-yellow-300">{b.load} T</div><div className="text-green-300">{b.distance} km</div></td>
                <td className="px-4 py-3 whitespace-nowrap font-bold text-secondary">{formatCurrency(b.quote)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  {canAssign ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => renderAssignmentModal(b.bookingId)} className="text-primary hover:text-blue-400 font-semibold text-sm">Assign</button>
                      <button onClick={() => onRejectBooking?.(b.bookingId)} className="text-red-400 hover:text-red-200 font-semibold text-sm">Reject</button>
                    </div>
                  ) : (
                    <span className="text-gray-400">Awaiting assignment</span>
                  )}
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">No pending bookings right now.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div></Reveal>
      </>
  );
};

export default function App() {
  const [userRole, setUserRole] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [bookings, setBookings] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [modalBookingId, setModalBookingId] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isAddDriverModalOpen, setIsAddDriverModalOpen] = useState(false);
  const [isAddTruckModalOpen, setIsAddTruckModalOpen] = useState(false);
  const [isRemoveAssetModalOpen, setIsRemoveAssetModalOpen] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 3000);
  }, []);

  const fetchAll = useCallback(async () => {
    const [b, d, t] = await Promise.all([
      api.get('/bookings').then(r => r.data),
      api.get('/assets/drivers').then(r => r.data),
      api.get('/assets/trucks').then(r => r.data)
    ]);
    setBookings(b);
    setDrivers(d);
    setTrucks(t);
  }, []);

  useEffect(() => {
    fetchAll().catch(() => {});
    const saved = localStorage.getItem('role');
    if (saved) setUserRole(saved);
  }, [fetchAll]);

  // Listen to navigation intents from the Chat widget
  useEffect(() => {
    const onNavigate = (e) => {
      const dest = (e && e.detail) || '';
      if (dest === 'booking') setCurrentView('booking');
      else if (dest === 'tracking') setCurrentView('tracking');
    };
    window.addEventListener('app:navigate', onNavigate);
    return () => window.removeEventListener('app:navigate', onNavigate);
  }, []);

  const toggleAuth = () => {
    if (userRole) {
      setUserRole(null);
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      showToast('Logged out successfully.', 'success');
    } else {
      setIsLoginModalOpen(true);
    }
  };

  const handleLogin = async (email, password, setError) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      setUserRole(data.role);
      setIsLoginModalOpen(false);
      showToast(`Welcome, ${data.role}!`, 'success');
      setCurrentView('dashboard');
    } catch (e) {
      setError('Invalid email or password. Please try again.');
    }
  };

  const handleAssignTrip = async (bookingId, driverId, truckId) => {
    await api.post(`/bookings/${bookingId}/assign`, { driverId, truckId });
    await fetchAll();
    setModalBookingId(null);
    showToast(`Booking ${bookingId} assigned successfully!`, 'success');
  };

  const handleCompleteTrip = async (bookingId) => {
    await api.post(`/bookings/${bookingId}/complete`);
    await fetchAll();
    showToast(`Trip ${bookingId} completed. Driver and Truck are now available.`, 'success');
    setCurrentView('dashboard');
  };

  const handleAddDriver = async (newDriver) => {
    await api.post('/assets/drivers', newDriver);
    await fetchAll();
    showToast(`Driver ${newDriver.name} (${newDriver.driverId}) added.`, 'success');
  };

  const handleAddTruck = async (newTruck) => {
    await api.post('/assets/trucks', newTruck);
    await fetchAll();
    showToast(`Truck ${newTruck.truckId} (${newTruck.make} ${newTruck.model}) added.`, 'success');
  };

  const handleUpdateHealth = async (truckId, healthStatus) => {
    try {
      await api.patch(`/assets/trucks/${truckId}/health`, { healthStatus });
      await fetchAll();
      showToast(`Updated health for ${truckId} → ${healthStatus}`, 'success');
    } catch (e) {
      showToast('Failed to update health. Ensure you are logged in.', 'error');
    }
  };

  const handleRemoveDriver = async (driverId, driverName) => {
    if (userRole !== 'Admin') { showToast('Permission denied. Only Admin can remove drivers.', 'error'); return; }
    const isDriverOnTrip = bookings.some(b => b.driverId === driverId && b.status === 'In Transit');
    if (isDriverOnTrip) { showToast(`ERROR: ${driverName} is on an active trip!`, 'error'); return; }
    await api.delete(`/assets/drivers/${driverId}`);
    await fetchAll();
    showToast(`Driver ${driverName} removed successfully.`, 'error');
  };

  const handleRemoveTruck = async (truckId) => {
    if (userRole !== 'Admin') { showToast('Permission denied. Only Admin can remove trucks.', 'error'); return; }
    const isTruckOnTrip = bookings.some(b => b.truckId === truckId && b.status === 'In Transit');
    if (isTruckOnTrip) { showToast(`ERROR: Truck ${truckId} is on an active trip!`, 'error'); return; }
    await api.delete(`/assets/trucks/${truckId}`);
    await fetchAll();
    showToast(`Truck ${truckId} decommissioned successfully.`, 'error');
  };

  const handleRejectBooking = async (bookingId) => {
    if (!bookingId) return;
    await api.delete(`/bookings/${bookingId}`);
    await fetchAll();
    showToast(`Booking ${bookingId} rejected.`, 'error');
  };

  const handleNewBooking = async (event, preset) => {
    event.preventDefault();
    const formEl = event.target;
    const newBooking = preset ?? {
      customer: formEl.customer.value,
      pickup: formEl.pickup.value,
      dropoff: formEl.dropoff.value,
      load: parseFloat(formEl.load.value)
    };
    await api.post('/bookings', newBooking);
    await fetchAll();
    formEl.reset();
    setCurrentView('dashboard');
    showToast(`Booking created and quoted successfully!`, 'success');
  };

  const modalBooking = bookings.find(b => b.bookingId === modalBookingId);
  const lastDriver = drivers[drivers.length - 1];
  const lastTruck = trucks[trucks.length - 1];

  return (
    <div id="app" className="max-w-7xl mx-auto p-4 md:p-6">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="SRC logo" className="w-12 h-12 rounded" />
          <div className="leading-tight">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-red-900 via-yellow-400 to-red-900 bg-[length:200%_100%] bg-[position:0%_0] hover:bg-[position:100%_0] transition-[background-position] duration-700 ease-out drop-shadow-sm">
              SUMIT ROAD CARRIERS
            </h1>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {userRole && <span className="text-sm font-semibold text-gray-300">Role: <span className="text-yellow-400">{userRole}</span></span>}
          <button onClick={toggleAuth} className={`text-white px-4 py-2 rounded-lg text-sm shadow-md transition duration-300 ${userRole ? 'bg-red-500 hover:bg-red-600' : 'bg-secondary hover:bg-orange-700'}`}>
            {userRole ? 'Logout' : 'Admin/Manager Login'}
          </button>
        </div>
      </header>
      <nav className="sticky top-0 z-40 flex space-x-2 md:space-x-4 mb-8 overflow-x-auto pb-2 bg-card-dark/30 backdrop-blur rounded-xl px-2">
        {['dashboard', 'booking', 'requests', 'fleet', 'tracking', 'analytics', 'about'].map(view => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className={`relative group overflow-hidden p-3 text-sm md:text-base font-medium rounded-lg transition-all duration-300 ease-out ${currentView === view ? 'bg-primary text-white shadow-md' : 'text-gray-300 hover:text-white hover:bg-card-dark/80'} hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400`}
          >
            <span className="relative z-10">{view.charAt(0).toUpperCase() + view.slice(1)}</span>
            <span aria-hidden className={`absolute left-3 right-3 bottom-1 h-0.5 rounded-full transition-transform duration-300 origin-left ${currentView === view ? 'bg-yellow-400 scale-x-100' : 'bg-yellow-400 scale-x-0 group-hover:scale-x-100'}`}></span>
          </button>
        ))}
      </nav>
      <main id="content" className="min-h-[60vh]">
        {currentView === 'dashboard' && (
          <DashboardView bookings={bookings} trucks={trucks} drivers={drivers} userRole={userRole} renderAssignmentModal={setModalBookingId} setCurrentView={setCurrentView} />
        )}
        {currentView === 'booking' && (
          <BookingPortalView handleNewBooking={handleNewBooking} />
        )}
        {currentView === 'requests' && (
          <RequestsView bookings={bookings} userRole={userRole} renderAssignmentModal={setModalBookingId} onRejectBooking={handleRejectBooking} />
        )}
        {currentView === 'fleet' && (
          <FleetManagementView drivers={drivers} trucks={trucks} userRole={userRole} onUpdateHealth={handleUpdateHealth} openAddDriverModal={() => setIsAddDriverModalOpen(true)} openAddTruckModal={() => setIsAddTruckModalOpen(true)} openRemoveAssetModal={setIsRemoveAssetModalOpen} />
        )}
        {currentView === 'tracking' && (
          <LiveTrackingView bookings={bookings} drivers={drivers} trucks={trucks} userRole={userRole} onCompleteTrip={handleCompleteTrip} />
        )}
        {currentView === 'analytics' && (
          <AnalyticsView bookings={bookings} drivers={drivers} userRole={userRole} />
        )}
        {currentView === 'about' && (
          <AboutView />
        )}
      </main>

      {isLoginModalOpen && (<LoginModal onClose={() => setIsLoginModalOpen(false)} onLogin={handleLogin} />)}
      {modalBookingId && modalBooking && (
        <AssignmentModal booking={modalBooking} drivers={drivers} trucks={trucks} onClose={() => setModalBookingId(null)} onAssign={handleAssignTrip} />
      )}
      {isAddDriverModalOpen && (
        <AddDriverModal onClose={() => setIsAddDriverModalOpen(false)} onAdd={handleAddDriver} lastDriverId={lastDriver?.driverId} />
      )}
      {isAddTruckModalOpen && (
        <AddTruckModal onClose={() => setIsAddTruckModalOpen(false)} onAdd={handleAddTruck} lastTruckId={lastTruck?.truckId} />
      )}
      {isRemoveAssetModalOpen && (
        <RemoveAssetModal onClose={() => setIsRemoveAssetModalOpen(null)} drivers={drivers} trucks={trucks} onRemoveDriver={handleRemoveDriver} onRemoveTruck={handleRemoveTruck} initialAssetType={isRemoveAssetModalOpen} />
      )}
      <Toast message={toast.message} type={toast.type} />
      <FastChatWidget />
    </div>
  );
}

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your transport assistant. Ask me about bookings, pricing, routes, required documents, or ETAs.' }
  ]);
  const [drag, setDrag] = useState({ dragging: false, offsetX: 0, offsetY: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 1200);
    // initial position: bottom-right
    const init = () => {
      try {
        const w = window.innerWidth;
        const h = window.innerHeight;
        setPos({ x: Math.max(10, w - 380 - 10), y: Math.max(10, h - 420) });
      } catch {}
    };
    init();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.dragging) return;
      setPos((p) => ({ x: Math.max(0, e.clientX - drag.offsetX), y: Math.max(0, e.clientY - drag.offsetY) }));
    };
    const onUp = () => setDrag({ dragging: false, offsetX: 0, offsetY: 0 });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [drag.dragging, drag.offsetX, drag.offsetY]);

  const startDrag = (e) => {
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    setDrag({ dragging: true, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  };

  const send = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    if (!overrideText) setInput('');
    try {
      const { data } = await api.post('/ai/chat', { message: text, history });
      setMessages([...next, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      const hint = 'If this persists, refresh the page and ensure the server is running.';
      setMessages([...next, { role: 'assistant', content: `Sorry, I\'m having trouble reaching the server. ${hint}` }]);
    }
  };

  const topics = [
    { key: '', label: 'Quick help: Select a topic' },
    { key: 'quote', label: 'Get a quote' },
    { key: 'pricing', label: 'Pricing factors' },
    { key: 'docs', label: 'Required documents (LR/eWay bill)' },
    { key: 'capacity', label: 'Truck capacity recommendation' },
    { key: 'booking', label: 'How to place a booking' }
  ];

  const handleTopic = async (e) => {
    const v = e.target.value;
    if (!v) return;
    const prompts = {
      quote: 'Please provide a quote for road freight. I will share pickup, dropoff and load details.',
      pricing: 'What factors affect road freight pricing (diesel, tolls, mileage, load)?',
      docs: 'What documents are required for intercity road transport in India (LR, eWay bill)?',
      capacity: 'Which truck capacity should I choose for 20-25 tons of goods?',
      booking: 'How do I place a booking and what details are needed?'
    };
    const text = prompts[v];
    if (text) await send(text);
    // reset dropdown back to placeholder
    e.target.value = '';
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 bg-primary text-white rounded-full w-12 h-12 shadow-lg">?
        </button>
      )}
      {open && (
        <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 50 }} className="w-80 md:w-96 bg-card-dark border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div onMouseDown={startDrag} className="cursor-move select-none flex items-center justify-between px-4 py-2 bg-primary text-white">
            <div className="font-semibold">Ask SUMIT Assistant</div>
            <button onClick={() => setOpen(false)} className="text-white/90 hover:text-white">×</button>
          </div>
          <div className="h-64 overflow-y-auto p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm p-2 rounded-lg ${m.role === 'assistant' ? 'bg-gray-700 text-white' : 'bg-blue-700 text-white ml-10'}`}>{m.content}</div>
            ))}
          </div>
          <div className="px-3 pt-2 border-t border-gray-700">
            <select onChange={handleTopic} defaultValue="" className="w-full mb-2 p-2 rounded-lg bg-gray-700 border border-gray-600 text-sm text-gray-200">
              {topics.map(t => (<option key={t.key} value={t.key} disabled={!t.key}>{t.label}</option>))}
            </select>
          </div>
          <div className="px-3 pb-3 flex space-x-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key==='Enter' && send()} placeholder="Type your question..." className="flex-1 p-2 rounded-lg bg-gray-700 border border-gray-600 text-white" />
            <button onClick={send} className="px-3 py-2 bg-secondary text-white rounded-lg">Send</button>
          </div>
        </div>
      )}
    </>
  );
}

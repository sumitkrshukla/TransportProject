# SUMIT ROAD CARRIERS - Transport Management + Chatbot

This repository contains a full-stack transport management demo with:
- React (Vite) frontend
- Node.js/Express backend with MongoDB (Mongoose)
- FastAPI microservice for transport chatbot and WhatsApp webhook
- Seed data for drivers, trucks, bookings, vehicles, shipments
- Chatbot powered by node-nlp with a draggable, resizable UI widget

## Quick Start

You can start the entire stack (server, FastAPI, client) with a single command on Windows:

```
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
```

It will open three PowerShell windows and start:
- Server (Node API) on http://localhost:4000
- Backend (FastAPI) on http://localhost:8000
- Client (Vite) on http://localhost:5173

Then open http://localhost:5173

## Manual Start (per service)

- Server (Node, CWD: `server`)
  - `npm install` (first time)
  - `npm run dev`

- Backend (FastAPI, CWD: `backend`)
  - `py -m venv .venv` (first time)
  - ` .\.venv\Scripts\Activate.ps1`
  - `pip install -r requirements.txt` (first time)
  - `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

- Client (Vite, CWD: `client`)
  - `npm install` (first time)
  - `npm run dev`

## After Reopening Your IDE

Run the one-command launcher again:

```
powershell -ExecutionPolicy Bypass -File .\start-all.ps1
```

Or use the Manual Start steps above for each service.

## URLs and Dev Proxy

- App UI: http://localhost:5173
- Node API health: http://localhost:4000/health
- FastAPI root: http://localhost:8000/
- Vite dev proxy (client/vite.config.js):
  - `/api` → http://localhost:4000
  - `/fa` → http://localhost:8000

## Project Structure

```
Transport2/
  start-all.ps1
  client/
    src/
      App.jsx
      api.js
      components/
        Chatbot.jsx
        Chatbot.css
        FastChatWidget.jsx
  server/
    .env
    src/
      index.js
      lib/
        db.js
      models/
        User.js
        Driver.js
        Truck.js
        Booking.js
        Vehicle.js
        Shipment.js
      routes/
        auth.js
        bookings.js
        assets.js
        ai.js
        chatbot.js
      services/
        nlp.js
      seed.js
  backend/
    main.py  # FastAPI Transport Chatbot API (/chat, /quote, /whatsapp/webhook)
    requirements.txt
```

## Prerequisites
- Node.js 18+
- MongoDB running locally (or change `MONGODB_URI` in `server/.env`)

## Configure
Edit `server/.env`:

```
PORT=4000
MONGODB_URI=mongodb://localhost:27017/sumit_fleet
JWT_SECRET=replace_with_strong_secret
OPENAI_API_KEY=sk-...
FUEL_PRICE_DIESEL_INR=95
FUEL_PRICE_PETROL_INR=105
TRUCK_AVG_MILEAGE_KM_PER_L=3.5
TOLL_COST_PER_KM_INR=2.0
OPERATING_COST_PER_KM_INR=8.0
```

## Install & Run

Server:
```
cd server
npm install
# optional: install the NLP library (already installed in this project)
# npm install node-nlp

# Seed database (force reset and reseed)
$env:FORCE_SEED='1'; npm run seed  # PowerShell

npm run dev  # http://localhost:4000
```

Client:
```
cd client
npm install
npm run dev  # http://localhost:5173 (or add -- --port 5174)
```

### FastAPI Chatbot (optional, for multi-channel)
```
cd backend
python -m venv .venv
.\.venv\Scripts\activate  # PowerShell on Windows
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Dev proxy (already configured):
- Vite proxies `/api` -> http://localhost:4000 (Node)
- Vite proxies `/fa` -> http://localhost:8000 (FastAPI)

Mounting the web widget:
- `FastChatWidget` is auto-mounted in `App.jsx` and talks to FastAPI via `/fa/*`.

## Key Backend Files (Source)

### server/src/index.js
```js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDB } from './lib/db.js';
import authRoutes from './routes/auth.js';
import bookingRoutes from './routes/bookings.js';
import assetRoutes from './routes/assets.js';
import aiRoutes from './routes/ai.js';
import chatbotRoutes from './routes/chatbot.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chatbot', chatbotRoutes);

const PORT = process.env.PORT || 4000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
});
```

### server/src/services/nlp.js
```js
import { NlpManager } from 'node-nlp';

let manager;
let trainingPromise;

function getManager() {
  if (!manager) {
    manager = new NlpManager({ languages: ['en'], forceNER: true });
    manager.addDocument('en', 'hello', 'greeting');
    manager.addDocument('en', 'hi', 'greeting');
    manager.addDocument('en', 'hey', 'greeting');

    manager.addDocument('en', 'track %veh%', 'tracking');
    manager.addDocument('en', 'where is %veh%', 'tracking');

    manager.addDocument('en', 'shipment status %ship%', 'shipment_status');
    manager.addDocument('en', 'status of shipment %ship%', 'shipment_status');

    manager.addDocument('en', 'what truck capacity for %wt% tons', 'capacity_advice');
    manager.addDocument('en', 'capacity for %wt% tons', 'capacity_advice');

    manager.addDocument('en', 'what documents are required', 'documents');
    manager.addDocument('en', 'which papers needed', 'documents');

    manager.addDocument('en', 'quote from %from% to %to% for %goods%', 'quote_request');
    manager.addDocument('en', 'price to move %goods% from %from% to %to%', 'quote_request');
  }
  return manager;
}

export async function warmup() {
  const m = getManager();
  if (!trainingPromise) {
    trainingPromise = m.train();
  }
  await trainingPromise;
}

function extractEntities(text) {
  const vehicleReg = (text.match(/[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{4}/i) || [])[0];
  const shipmentId = (text.match(/S-\d+/i) || [])[0];
  const tonsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:t|tons?)/i);
  const weightTons = tonsMatch ? parseFloat(tonsMatch[1]) : undefined;
  const from = (text.match(/from\s+([^,]+?)(?=\s+to\b|$)/i) || [])[1];
  const to = (text.match(/to\s+([^,]+)$/i) || [])[1];
  const goodsList = ['fmcg', 'electronics', 'machinery', 'industrial machinery', 'construction material', 'cement', 'steel', 'automotive parts'];
  const lower = text.toLowerCase();
  const goods = goodsList.find(g => lower.includes(g)) || undefined;
  return { vehicleReg, shipmentId, weightTons, from, to, goods };
}

export async function nlpInterpret(text) {
  await warmup();
  const m = getManager();
  const result = await m.process('en', text);
  const intent = result.intent && result.score >= 0.6 ? result.intent : 'none';
  const entities = extractEntities(text);
  return { intent, entities, score: result.score };
}
```

### server/src/routes/chatbot.js
```js
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
    } catch {
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
      } catch {
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
    } catch {
      return { reply: 'There was an error querying the database.' };
    }
  }

  return { reply: 'Welcome to SUMIT ROAD CARRIERS! 👋', quickOptions: ['Track a vehicle', 'Check shipment status', 'I need a quote'] };
}

router.post('/', async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'No message provided' });
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
    // ignore and fallback
  }
  const legacy = await getBotResponse(message);
  res.json(legacy.reply ? legacy : { reply: legacy });
});

export default router;
```

### server/src/seed.js (excerpt)
```js
await Promise.all([
  User.deleteMany({}), Driver.deleteMany({}), Truck.deleteMany({}), Booking.deleteMany({}), Vehicle.deleteMany({}), Shipment.deleteMany({})
]);
// insert drivers, trucks, bookings ...
await Vehicle.insertMany([
  { registration: 'MH-12-AB-1234', currentLocation: 'Nagpur', status: 'On-Trip', driverName: 'Ramesh Kumar' },
  { registration: 'UP-14-C-5678', currentLocation: 'Lucknow Yard', status: 'In Yard', driverName: 'Suresh Singh' }
]);
await Shipment.insertMany([
  { shipmentId: 'S-123', status: 'In-Transit', eta: new Date(Date.now() + 24*60*60*1000), assignedVehicle: (await Vehicle.findOne({ registration: 'MH-12-AB-1234' }))._id },
  { shipmentId: 'S-456', status: 'Pending' }
]);
```

## Key Frontend Files (Source)

### client/src/components/Chatbot.jsx
```jsx
import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import './Chatbot.css';

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
);
const MinimizeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15"/></svg>
);

export default function Chatbot({ isVisible = true, onClose }) {
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Hello! How can I help with your fleet today?' }
  ]);
  const [input, setInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  const [pos, setPos] = useState({ x: 20, y: 20 });
  const [size, setSize] = useState({ w: 360, h: 520 });
  const dragRef = useRef(null);
  const messagesEndRef = useRef(null);
  const resizing = useRef(false);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    setPos({ x: Math.max(10, w - size.w - 20), y: Math.max(10, h - size.h - 20) });
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (dragging.current) {
        setPos((p) => ({ x: Math.max(0, e.clientX - dragOffset.current.x), y: Math.max(0, e.clientY - dragOffset.current.y) }));
      } else if (resizing.current) {
        setSize((s) => ({ w: Math.max(300, e.clientX - pos.x), h: Math.max(380, e.clientY - pos.y) }));
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pos.x, pos.y]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const startDrag = (e) => {
    if (e.target.closest('button')) return;
    const rect = dragRef.current?.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - (rect?.left || 0), y: e.clientY - (rect?.top || 0) };
    dragging.current = true;
  };
  const startResize = (e) => { e.preventDefault(); resizing.current = true; };

  const sendText = async (text) => {
    const userMessage = { from: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const { data } = await api.post('/chatbot', { message: text });
      const botMessage = { from: 'bot', text: data.reply };
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const errorMessage = { from: 'bot', text: 'Sorry, I am having trouble connecting.' };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    await sendText(text);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={dragRef}
      className={`chatbot-container ${isMinimized ? 'minimized' : ''}`}
      style={{ position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: isMinimized ? '48px' : size.h, zIndex: 40 }}
    >
      <div className="chatbot-header" onMouseDown={startDrag}>
        <h3>SUMIT ROAD CARRIERS - Assistant</h3>
        <div className="chatbot-controls">
          <button onClick={() => setIsMinimized(true)} title="Minimize">-</button>
          <button onClick={onClose} title="Close">x</button>
        </div>
      </div>

      <div className="chatbot-body">
        <div className="chatbot-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.from}`}>
              <p>{msg.text}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chatbot-input-area">
          <form className="chatbot-input-form" onSubmit={handleSubmit}>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a vehicle, shipment, pricing, etc." />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>

      {!isMinimized && (<div className="resize-handle" onMouseDown={startResize} />)}
      {isMinimized && (<div className="minimized-overlay" onClick={() => setIsMinimized(false)}>Click to Restore</div>)}
    </div>
  );
}
```

### client/src/components/Chatbot.css (excerpt)
```css
.chatbot-container { width: 350px; height: 500px; border: 1px solid #374151; border-radius: 8px; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,.3); overflow: hidden; background: #0f172a; }
.chatbot-header { background: #1d4ed8; color: white; padding: 12px 16px; display:flex; justify-content: space-between; align-items:center; cursor: grab; }
.message { padding: 8px 12px; border-radius: 16px; max-width: 80%; }
.message.user { background: #2563eb; color: white; align-self: flex-end; }
.message.bot { background: #374151; color: #f3f4f6; align-self: flex-start; }
.chatbot-input-form { display:flex; border-top:1px solid #374151; padding:10px; background:#0b1220; }
.chatbot-input-form input { flex:1; border:1px solid #334155; background:#111827; color:#e5e7eb; padding:10px; border-radius: 20px; margin-right: 10px; }
.chatbot-input-form button { background:#f97316; color:white; border:none; padding:10px 14px; border-radius:20px; cursor:pointer; }
.resize-handle { position:absolute; right:4px; bottom:4px; width:14px; height:14px; border-right:2px solid #475569; border-bottom:2px solid #475569; cursor:se-resize; }
```

## Services and Libraries Used
- React (Vite) for frontend
- Express, CORS, Helmet, Morgan for backend HTTP and security
- Mongoose (MongoDB) for data models
- bcryptjs for password hashing
- dotenv for configuration
- node-nlp for chatbot intents/entities
- Optional: OpenAI API key for `/api/ai` route logic if configured
- FastAPI + Uvicorn for transport chatbot API (quote, chat, WhatsApp webhook)

## Scripts

- Root launcher
  - `start-all.ps1` — starts Server (4000), FastAPI (8000), Client (5173) in separate windows
  - Run: `powershell -ExecutionPolicy Bypass -File .\start-all.ps1`

- Server (Node) package scripts
  - `npm run dev` — start dev server with file watching
  - `npm run start` — production start
  - `npm run seed` — seed/reset Mongo data

- Client (Vite)
  - `npm run dev` — dev server on port 5173
  - `npm run build` — production build
  - `npm run preview` — preview built app

## Environment Variables

- Server (`server/.env`)
  - `PORT` — Node API port (default 4000)
  - `MONGODB_URI` — Mongo connection string
  - `JWT_SECRET` — JWT signing secret
  - `OPENAI_API_KEY` — optional for `/api/ai` route
  - Pricing knobs (demo): `FUEL_PRICE_DIESEL_INR`, `FUEL_PRICE_PETROL_INR`, `TRUCK_AVG_MILEAGE_KM_PER_L`, `TOLL_COST_PER_KM_INR`, `OPERATING_COST_PER_KM_INR`

- Client (`client/src/api.js`)
  - `VITE_API_BASE` — override API base URL. Defaults to `http://localhost:4000/api`
  - Example `.env` for client (optional):
    ```
    VITE_API_BASE=http://localhost:4000/api
    ```

## API Endpoints Overview

- Node API (http://localhost:4000)
  - `GET /health` — service health
  - `POST /api/auth/login` — login (returns JWT)
  - `POST /api/auth/register` — register user
  - `GET /api/bookings` — list bookings
  - `POST /api/bookings` — create booking
  - `GET /api/assets/vehicles` — list vehicles
  - `GET /api/assets/shipments` — list shipments
  - `POST /api/chatbot` — chatbot message (NLU + DB lookups)
  - `POST /api/ai/*` — optional AI-assisted endpoints (requires `OPENAI_API_KEY`)

- FastAPI (http://localhost:8000)
  - `GET /` — root status
  - `POST /chat` — basic chat intent handler
  - `POST /quote` — returns transport quote estimate
  - `POST /whatsapp/webhook` — Twilio WhatsApp webhook (responds with TwiML)

## Client Configuration Details

- Axios instance: `client/src/api.js`
  - Base URL: `import.meta.env.VITE_API_BASE || 'http://localhost:4000/api'`
  - Adds `Authorization: Bearer <token>` if `localStorage.token` exists
- Dev proxy: `client/vite.config.js`
  - `/api` → Node 4000
  - `/fa` → FastAPI 8000

## Troubleshooting

- Port already in use (EADDRINUSE)
  - Find PID: `netstat -ano | findstr :4000`
  - Kill: `taskkill /PID <PID> /F`
  - Or change `PORT` in `server/.env` and update proxy target in `client/vite.config.js`

- PowerShell cannot run scripts
  - Use: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

- MongoDB connection fails
  - Ensure MongoDB is running locally
  - Verify `MONGODB_URI` in `server/.env`

- FastAPI venv missing
  - From `backend`: `py -m venv .venv && .\.venv\Scripts\Activate.ps1 && pip install -r requirements.txt`

- CORS/proxy issues in browser
  - Always use client origin http://localhost:5173 during development
  - Ensure requests are sent to `/api/*` or `/fa/*` so Vite proxy applies

## Security Notes

- Do not commit real secrets; `.env` values are for local dev only
- Change `JWT_SECRET` to a strong unique value before production
- Enable HTTPS, input validation, and rate limiting for public deployments
- Review and harden CORS policy as needed

## Development Tips

- Seed data quickly before demos: `cd server; $env:FORCE_SEED='1'; npm run seed`
- Add more NLU intents in `server/src/services/nlp.js`
- Extend FastAPI pricing logic in `backend/main.py` (`estimate_quote`)
- Build client for production: `cd client && npm run build && npm run preview`

## WhatsApp (Twilio) Webhook
- Set your Twilio WhatsApp sandbox webhook to: `POST http://<your-host>:8000/whatsapp/webhook`
- Environment (if needed): `TWILIO_AUTH_TOKEN` for request validation (not required in this demo)
- Test phrases:
  - "quote Nigha to Varanasi 1200kg 14ft"
  - "track LR 123456"
  - "book a pickup tomorrow from Nigha"
  - "what documents are needed?"
  - "I want to talk to a human"

## Seeding & Credentials
- Seeder creates Admin and Manager:
  - admin@fleetai.com / password123
  - manager@fleetai.com / password123
  - Vehicles: MH-12-AB-1234, UP-14-C-5678
  - Shipments: S-123, S-456

## Export/Share
To share the entire source:
- Zip the folder in Explorer: right-click `Transport2` → Send to → Compressed (zipped) folder
- Or PowerShell:
```
Compress-Archive -Path c:\Users\ASUS\Desktop\Transport2 -DestinationPath c:\Users\ASUS\Desktop\Transport2.zip
```

---
If you want me to include any additional files inline here (e.g., models or booking/asset routes) say which ones and I’ll append them.

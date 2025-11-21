from fastapi import FastAPI, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
import re, sqlite3, uuid, datetime

app = FastAPI(title="Transport Chatbot API")

# ---- Models ----
class Message(BaseModel):
    user_id: str
    text: str
    channel: str = "web"  # web|whatsapp
    metadata: Optional[Dict[str, Any]] = None

class QuoteRequest(BaseModel):
    origin: str
    destination: str
    weight_kg: float
    vehicle: str = "14ft"
    distance_km: Optional[float] = None

# ---- Simple DB (SQLite) ----
DB = "chatbot.db"

def db():
    return sqlite3.connect(DB)

with db() as con:
    con.execute(
        """
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT, phone TEXT, company TEXT,
      created_at TEXT
    )
    """
    )
    con.execute(
        """
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      origin TEXT, destination TEXT,
      weight_kg REAL, vehicle TEXT,
      price_inr REAL, eta_days INTEGER,
      created_at TEXT
    )
    """
    )

# ---- NLU (rule-first) ----
INTENTS = {
    "quote": r"\b(quote|price|cost|fare|estimate)\b",
    "track": r"\b(track|status|where is|lr\s*\d+)\b",
    "booking": r"\b(book|pickup|schedule|dispatch)\b",
    "faq": r"\b(time|hours|insurance|docs|document|capacity|areas)\b",
    "handoff": r"\b(agent|human|call me|talk to someone)\b",
}

VEHICLE_BASE = {
    "pickup": {"base": 800, "per_km": 18, "max_kg": 1500},
    "14ft":   {"base": 1500, "per_km": 22, "max_kg": 3500},
    "17ft":   {"base": 2200, "per_km": 28, "max_kg": 5500},
    "22ft":   {"base": 3200, "per_km": 35, "max_kg": 9000},
}

# Dummy distance service (you can replace with real API)
CITY_DIST = {("Nigha","Varanasi"): 310, ("Nigha","Lucknow"): 430}


def detect_intent(text: str) -> str:
    t = text.lower()
    for intent, pattern in INTENTS.items():
        if re.search(pattern, t):
            return intent
    return "fallback"


def estimate_quote(q: QuoteRequest):
    distance = q.distance_km or CITY_DIST.get((q.origin, q.destination), 400)
    vehicle = q.vehicle if q.vehicle in VEHICLE_BASE else "14ft"
    cfg = VEHICLE_BASE[vehicle]
    # Simple pricing model
    variable = cfg["per_km"] * distance
    weight_factor = max(1.0, q.weight_kg / cfg["max_kg"])  # overloading factor
    price = round((cfg["base"] + variable) * weight_factor)
    eta_days = max(1, round(distance / 350))
    return price, eta_days, distance, vehicle


@app.post("/chat")
async def chat(msg: Message):
    intent = detect_intent(msg.text)

    if intent == "quote":
        return {"reply": "Please share origin, destination, weight (kg), and vehicle (pickup/14ft/17ft/22ft)."}

    if intent == "track":
        return {"reply": "Share your LR/Booking ID and I'll fetch live status."}

    if intent == "booking":
        return {"reply": "Great! Your pickup city and date? Also a contact number."}

    if intent == "faq":
        return {"reply": "We operate from Nigha across UP & Bihar. 14ft can carry ~3.5T. Pickup 9am–7pm. Insurance available. Need GST + invoice + eWay bill."}

    if intent == "handoff":
        return {"reply": "Connecting you to an agent… Please share your name & number."}

    return {"reply": "I can help with Quotes, Booking, and Tracking. What do you need?"}


@app.post("/quote")
async def quote(q: QuoteRequest):
    price, eta, dist, veh = estimate_quote(q)
    quote_id = str(uuid.uuid4())
    with db() as con:
        con.execute(
            "INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?)",
            (
                quote_id, q.user_id, q.origin, q.destination,
                q.weight_kg, veh, price, eta, datetime.datetime.utcnow().isoformat()
            ),
        )
    return {
        "quote_id": quote_id,
        "price_inr": price,
        "eta_days": eta,
        "distance_km": dist,
        "vehicle": veh,
        "message": f"Estimated ₹{price} • ETA {eta} day(s) for {dist} km"
    }

# ---- WhatsApp webhook (Twilio) ----
@app.post("/whatsapp/webhook")
async def whatsapp_webhook(req: Request):
    form = await req.form()
    from_ = form.get("From", "")
    body = form.get("Body", "")
    user_id = from_.replace("whatsapp:", "")
    intent = detect_intent(body)
    # Return TwiML minimal response
    reply = {
        "quote": "Send: quote Nigha->Varanasi 1200kg 14ft",
        "track": "Send your LR/Booking ID",
    }.get(intent, "Reply with: quote / track / booking / help")

    return (
        f"<?xml version='1.0' encoding='UTF-8'?><Response><Message>{reply}</Message></Response>",
        200, {"Content-Type":"application/xml"}
    )


@app.get("/")
async def root():
    return {"status": "ok", "service": "fastapi-transport-chatbot"}

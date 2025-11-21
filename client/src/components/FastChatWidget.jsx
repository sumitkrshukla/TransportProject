import React, { useEffect, useRef, useState } from 'react';
import { sendMessageToNLP, rephraseForProfessionalTone } from './nlpService';

export default function FastChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const helpOptions = [
    { label: 'Booking', value: 'booking' },
    { label: 'Tracking', value: 'tracking' },
    { label: 'Contact Owner/Manager', value: 'contact_owner' }
  ];
  const [msgs, setMsgs] = useState([
    { from: 'bot', text: "👋 Welcome! We're excited to help you." },
    { from: 'bot', text: 'How can we assist you today?', options: helpOptions }
  ]);
  // position and size state for moveable/resizable widget
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 360, h: 420 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizing = useRef(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactAnim, setContactAnim] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 1000);
    // initial position: bottom-right
    const init = () => {
      try {
        const w = window.innerWidth;
        const h = window.innerHeight;
        setPos({ x: Math.max(8, w - size.w - 20), y: Math.max(8, h - size.h - 20) });
      } catch {}
    };
    init();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (dragging.current) {
        setPos((p) => ({
          x: Math.max(0, e.clientX - dragOffset.current.x),
          y: Math.max(0, e.clientY - dragOffset.current.y)
        }));
      } else if (resizing.current) {
        setSize((s) => ({
          w: Math.max(300, e.clientX - pos.x),
          h: Math.max(360, e.clientY - pos.y)
        }));
      }
    };
    const onUp = () => { dragging.current = false; resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pos.x, pos.y]);

  const startDrag = (e) => {
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragging.current = true;
  };
  const startResize = (e) => { e.preventDefault(); resizing.current = true; };

  async function send() {
    const text = input.trim();
    if (!text) return;
    const userMsg = { from: 'user', text };
    setMsgs((m) => [...m, userMsg]);
    setInput('');
    try {
      const res = await fetch('/fa/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'web-user', text, channel: 'web' })
      });
      const data = await res.json();
      const bot = rephraseForProfessionalTone(data.reply);
      setMsgs((m) => [...m, { from: 'bot', text: bot }]);
    } catch (e) {
      // Fallback to local NLP when API is unreachable
      const local = await sendMessageToNLP(text);
      const bot = rephraseForProfessionalTone(local);
      setMsgs((m) => [...m, { from: 'bot', text: bot }]);
    }
  }

  async function quickQuote(origin, destination, weight_kg, vehicle = '14ft') {
    try {
      const res = await fetch('/fa/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'web-user', origin, destination, weight_kg, vehicle })
      });
      const data = await res.json();
      const bot = rephraseForProfessionalTone(data.message);
      setMsgs((m) => [...m, { from: 'bot', text: bot }]);
    } catch (e) {
      setMsgs((m) => [...m, { from: 'bot', text: 'Quote service unavailable.' }]);
    }
  }

  async function handleOptionClick(option) {
    // Echo user selection
    setMsgs((m) => [...m, { from: 'user', text: option.label }]);
    // App navigation for high-priority intents
    if (option.value === 'booking' || option.value === 'tracking') {
      try {
        window.dispatchEvent(new CustomEvent('app:navigate', { detail: option.value }));
      } catch {}
      const bot = rephraseForProfessionalTone(`Taking you to ${option.label}...`);
      setMsgs((m) => [...m, { from: 'bot', text: bot }]);
      return;
    }
    if (option.value === 'contact_owner') {
      setContactOpen(true);
      // next tick: trigger animation
      setTimeout(() => setContactAnim(true), 0);
      return;
    }
    try {
      // Prefer FastAPI chat for consistent orchestration
      const res = await fetch('/fa/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'web-user', text: option.value, channel: 'web' })
      });
      const data = await res.json();
      const bot = rephraseForProfessionalTone(data.reply);
      setMsgs((m) => [...m, { from: 'bot', text: bot }]);
    } catch (e) {
      // Local NLP fallback
      const local = await sendMessageToNLP(option.value);
      const bot = rephraseForProfessionalTone(local);
      setMsgs((m) => [...m, { from: 'bot', text: bot }]);
    }
  }

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg z-50">💬</button>
      )}
      {open && (
        <div
          className="rounded-2xl shadow-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700 flex flex-col overflow-hidden"
          style={{ position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 50 }}
        >
          <div
            className="p-3 font-semibold border-b border-gray-200 dark:border-gray-700 flex items-center justify-between cursor-move select-none"
            onMouseDown={startDrag}
          >
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="SRC logo" className="w-5 h-5" />
              <span>Transport Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-900">×</button>
          </div>
          <div className="p-3 overflow-y-auto space-y-2 flex-1">
            {msgs.map((m, i) => (
              <div key={i} className={m.from === 'bot' ? 'text-sm' : 'text-right'}>
                <span className={`inline-block px-3 py-2 rounded-2xl ${m.from === 'bot' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'bg-blue-100 text-blue-900'}`}>
                  {m.text}
                </span>
                {m.options && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.options.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleOptionClick(opt)}
                        className="bg-violet-300 text-violet-900 rounded px-3 py-1 hover:bg-violet-400 transition shadow text-xs"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="px-3 pb-3">
            <div className="flex gap-2">
              <input className="flex-1 border rounded-xl px-3 py-2 dark:bg-gray-800 dark:border-gray-700" value={input}
                     placeholder="Type a message…" onChange={(e)=>setInput(e.target.value)}
                     onKeyDown={(e)=> e.key === 'Enter' && send()} />
              <button className="px-3 py-2 rounded-xl bg-blue-600 text-white" onClick={send}>Send</button>
            </div>
          </div>
          <div
            onMouseDown={startResize}
            className="absolute right-1 bottom-1 w-3.5 h-3.5 border-r-2 border-b-2 border-gray-400 dark:border-gray-600 cursor-se-resize"
            title="Resize"
          />
          {contactOpen && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50" onMouseDown={() => { setContactAnim(false); setTimeout(()=>setContactOpen(false), 200); }}>
              <div
                className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-[88%] max-w-sm p-4 transform transition-transform transition-opacity duration-300 ease-out ${contactAnim ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg font-semibold">Contact</div>
                  <button onClick={() => { setContactAnim(false); setTimeout(()=>setContactOpen(false), 200); }} className="text-gray-500 hover:text-gray-900">×</button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl p-3 border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-blue-900 dark:text-blue-200">Sumit</div>
                        <div className="text-xs text-blue-800/80 dark:text-blue-300/80">Owner</div>
                        <div className="text-sm text-blue-900 dark:text-blue-200 mt-1">8637088429</div>
                      </div>
                      <div className="flex gap-2">
                        <a href="tel:8637088429" className="px-3 py-1 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition">Call</a>
                        <button onClick={() => { try { navigator.clipboard && navigator.clipboard.writeText('8637088429'); } catch {} setMsgs(m=>[...m,{from:'bot', text: rephraseForProfessionalTone('Owner number copied.')}]); if (toastTimer.current) clearTimeout(toastTimer.current); setToastMsg('Owner number copied'); toastTimer.current = setTimeout(()=>setToastMsg(''), 1500); }} className="px-3 py-1 rounded-lg bg-blue-100 text-blue-900 text-sm hover:bg-blue-200 transition">Copy</button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl p-3 border border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-900/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-violet-900 dark:text-violet-200">Shalwin</div>
                        <div className="text-xs text-violet-800/80 dark:text-violet-300/80">Manager</div>
                        <div className="text-sm text-violet-900 dark:text-violet-200 mt-1">987987985656</div>
                      </div>
                      <div className="flex gap-2">
                        <a href="tel:987987985656" className="px-3 py-1 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition">Call</a>
                        <button onClick={() => { try { navigator.clipboard && navigator.clipboard.writeText('987987985656'); } catch {} setMsgs(m=>[...m,{from:'bot', text: rephraseForProfessionalTone('Manager number copied.')}]); if (toastTimer.current) clearTimeout(toastTimer.current); setToastMsg('Manager number copied'); toastTimer.current = setTimeout(()=>setToastMsg(''), 1500); }} className="px-3 py-1 rounded-lg bg-violet-100 text-violet-900 text-sm hover:bg-violet-200 transition">Copy</button>
                      </div>
                    </div>
                  </div>
                </div>
                {toastMsg && (
                  <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-4 px-3 py-2 rounded-lg text-sm font-medium shadow-lg transition-opacity duration-300 ${toastMsg ? 'opacity-100' : 'opacity-0'} bg-black/70 text-white`}>{toastMsg}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

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
  const [currentOptions, setCurrentOptions] = useState(['Track a vehicle', 'Check shipment status', 'I need a quote']);
  const [input, setInput] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  // Drag + resize state
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCurrentOptions([]);
    try {
      const { data } = await api.post('/chatbot', { message: text });
      const botMessage = { from: 'bot', text: data.reply };
      setMessages((prev) => [...prev, botMessage]);
      setCurrentOptions(data.quickOptions || []);
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

  const handleChipClick = (text) => { setInput(''); sendText(text); };

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
          <button onClick={() => setIsMinimized(true)} title="Minimize"><MinimizeIcon /></button>
          <button onClick={onClose} title="Close"><CloseIcon /></button>
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

"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, UserCircle2 } from "lucide-react";

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isSelf: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatPanel({ isOpen, onClose }: Props) {
  const [name, setName] = useState("");
  const [isNameSet, setIsNameSet] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load name from local storage on mount
  useEffect(() => {
    const savedName = localStorage.getItem("adhure_chat_name");
    if (savedName) {
      setName(savedName);
      setIsNameSet(true);
    }
    
    // Some dummy messages to populate the room
    setMessages([
      { id: "1", sender: "Adarsh", text: "This theme looks crazy at night.", timestamp: new Date(Date.now() - 1000 * 60 * 5), isSelf: false },
      { id: "2", sender: "Riya", text: "Listening to K.K. just hits different...", timestamp: new Date(Date.now() - 1000 * 60 * 2), isSelf: false },
    ]);
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    localStorage.setItem("adhure_chat_name", name.trim());
    setIsNameSet(true);
  };

  const handleChangeName = () => {
    setIsNameSet(false);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !isNameSet) return;
    
    const newMsg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: name,
      text: inputText,
      timestamp: new Date(),
      isSelf: true
    };
    
    setMessages(prev => [...prev, newMsg]);
    setInputText("");
    
    // Simulate someone replying occasionally
    if (Math.random() > 0.5) {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          sender: "Anonymous",
          text: "Yeah, true that.",
          timestamp: new Date(),
          isSelf: false
        }]);
      }, 3000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            className="chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          />
          <motion.div
            className="chat-panel"
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{ 
              position: 'fixed', top: '80px', right: '40px', bottom: '80px', width: '380px',
              background: 'rgba(20, 16, 28, 0.85)', backdropFilter: 'blur(16px)',
              border: '1px solid var(--tb)', borderRadius: '24px', zIndex: 101,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: '1px solid var(--tb)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--tp)' }}>Room Chat</span>
                <span style={{ fontSize: '10px', background: 'var(--ta)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>LIVE</span>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ts)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!isNameSet ? (
                <div style={{ margin: 'auto 0', textAlign: 'center' }}>
                  <UserCircle2 size={48} color="var(--ta)" style={{ margin: '0 auto 16px', opacity: 0.8 }} />
                  <h3 style={{ color: 'var(--tp)', marginBottom: '8px', fontSize: '18px' }}>Who's listening?</h3>
                  <p style={{ color: 'var(--tm)', fontSize: '12px', marginBottom: '24px', lineHeight: 1.5 }}>
                    Enter a name to join the global listening room and chat with others playing right now.
                  </p>
                  <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input 
                      type="text" 
                      placeholder="Your name..." 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--tb)', 
                        padding: '12px 16px', borderRadius: '12px', color: 'var(--tp)', outline: 'none' 
                      }}
                      autoFocus
                    />
                    <button type="submit" style={{ 
                      background: 'var(--ta)', color: '#fff', border: 'none', 
                      padding: '12px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' 
                    }}>
                      Join Room
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--tm)', marginBottom: '10px' }}>
                    Joined as <span style={{ color: 'var(--ts)', fontWeight: 600 }}>{name}</span> • <button onClick={handleChangeName} style={{ background:'none', border:'none', color:'var(--ta)', cursor:'pointer', textDecoration:'underline' }}>Change</button>
                  </div>
                  {messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.isSelf ? 'flex-end' : 'flex-start' }}>
                      <span style={{ fontSize: '10px', color: 'var(--tm)', marginBottom: '4px', padding: '0 4px' }}>
                        {msg.isSelf ? 'You' : msg.sender} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div style={{
                        background: msg.isSelf ? 'var(--ta)' : 'rgba(255,255,255,0.08)',
                        color: msg.isSelf ? '#fff' : 'var(--tp)',
                        padding: '10px 14px',
                        borderRadius: '16px',
                        borderBottomRightRadius: msg.isSelf ? '4px' : '16px',
                        borderBottomLeftRadius: msg.isSelf ? '16px' : '4px',
                        maxWidth: '85%',
                        fontSize: '14px',
                        lineHeight: 1.4
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            {isNameSet && (
              <form onSubmit={handleSendMessage} style={{ padding: '16px', borderTop: '1px solid var(--tb)', display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)' }}>
                <input 
                  type="text"
                  placeholder="Say something nice..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--tb)', 
                    padding: '12px 16px', borderRadius: '24px', color: 'var(--tp)', outline: 'none'
                  }}
                />
                <button type="submit" disabled={!inputText.trim()} style={{
                  background: inputText.trim() ? 'var(--ta)' : 'rgba(255,255,255,0.1)',
                  color: inputText.trim() ? '#fff' : 'var(--tm)',
                  border: 'none', width: '42px', height: '42px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: inputText.trim() ? 'pointer' : 'default', transition: 'all 0.2s'
                }}>
                  <Send size={18} />
                </button>
              </form>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

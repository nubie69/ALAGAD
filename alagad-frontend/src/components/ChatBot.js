import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { chatAPI } from '../utils/api';
import useVoiceRecognition from '../hooks/useVoiceRecognition';
import { MicIcon, DeleteIcon, CloseIcon, SendIcon } from '../utils/icons';
import './ChatBot.css';

// Language translations
const translations = {
  en: {
    title: 'Campus Assistant',
    greeting: "Hi! I'm your campus assistant. How can I help you today?",
    placeholder: 'Type your question...',
    send: 'Send',
    clear: 'Clear chat',
    close: 'Close',
    language: 'Language',
  },
  tl: {
    title: 'Campus Assistant',
    greeting: 'Hi! Ako ang iyong campus assistant. Paano kita matutulungan?',
    placeholder: 'Iketik ang iyong tanong...',
    send: 'Magpadala',
    clear: 'Limasin ang chat',
    close: 'Isara',
    language: 'Wika',
  },
  ceb: {
    title: 'Campus Assistant',
    greeting: 'Kumusta! Ako ang imong campus assistant. Unsa akong matabang?',
    placeholder: 'Isulat ang iyong pangutana...',
    send: 'Ipadala',
    clear: 'Limpyohan ang chat',
    close: 'Isara',
    language: 'Pinulongan',
  }
};

// Typewriter effect component
const TypewriterText = ({ text, speed = 30 }) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (currentIndex === text.length && !isComplete) {
      setIsComplete(true);
    }
  }, [currentIndex, text, speed, isComplete]);

  return (
    <span className={isComplete ? 'typewriter-complete' : 'typewriter-active'}>
      {displayText}
    </span>
  );
};

function ChatBot({ onOpenChange, buildings = [], onNavigate }) {
  // Load language preference from localStorage, default to 'en'
  const [language, setLanguage] = useState(() => {
    const savedLanguage = localStorage.getItem('chatbot-language');
    return savedLanguage || 'en';
  });
  const t = translations[language];
  
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: t.greeting,
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpenRaw] = useState(false);
  const isOpenRef = useRef(false);
  const setIsOpen = useCallback((val) => {
    setIsOpenRaw((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      isOpenRef.current = next;
      if (onOpenChange) onOpenChange(next);
      return next;
    });
  }, [onOpenChange]);
  const [animatingMessageId, setAnimatingMessageId] = useState(1);
  const [showGreeting, setShowGreeting] = useState(false);
  const messagesEndRef = useRef(null);
  
  // Map chatbot language → speech recognition BCP-47 code
  const VOICE_LANG_MAP = { en: 'en-US', tl: 'fil-PH', ceb: 'ceb' };

  // Voice recognition with hold-to-talk
  const handleVoiceResult = (transcript) => {
    setInputValue(transcript);
  };
  
  const { isListening, isSupported: voiceSupported, startListening, stopListening, setLanguage: setVoiceLang } = useVoiceRecognition(
    handleVoiceResult,
    (error) => console.error('Voice error:', error),
    VOICE_LANG_MAP[language] || 'en-US'
  );

  // Sync voice recognition language when chatbot language changes
  useEffect(() => {
    setVoiceLang(VOICE_LANG_MAP[language] || 'en-US');
  }, [language, setVoiceLang]);

  // Draggable trigger button position (ignore saved position on mobile to prevent off-screen placement)
  const [triggerPos, setTriggerPos] = useState(() => {
    try {
      if (window.innerWidth <= 768) return null;
      const saved = localStorage.getItem('chatbot-trigger-pos');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false });

  const clampPosition = useCallback((x, y, elWidth, elHeight) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: Math.max(0, Math.min(x, vw - elWidth)),
      y: Math.max(0, Math.min(y, vh - elHeight)),
    };
  }, []);

  // Drag handlers for the trigger FAB
  const handleDragStart = useCallback((clientX, clientY) => {
    const el = triggerBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      startX: clientX,
      startY: clientY,
      startLeft: rect.left,
      startTop: rect.top,
      moved: false,
    };
  }, []);

  const handleDragMove = useCallback((clientX, clientY) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    const dx = clientX - d.startX;
    const dy = clientY - d.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const el = triggerBtnRef.current;
    if (!el) return;
    const size = el.offsetWidth;
    const clamped = clampPosition(d.startLeft + dx, d.startTop + dy, size, size);
    el.style.left = `${clamped.x}px`;
    el.style.top = `${clamped.y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }, [clampPosition]);

  const handleDragEnd = useCallback(() => {
    const d = dragRef.current;
    d.dragging = false;
    if (!d.moved) return;
    const el = triggerBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pos = { x: rect.left, y: rect.top };
    setTriggerPos(pos);
    try { localStorage.setItem('chatbot-trigger-pos', JSON.stringify(pos)); } catch {}
  }, []);

  // Mouse events
  const onMouseDown = useCallback((e) => { handleDragStart(e.clientX, e.clientY); }, [handleDragStart]);
  const onMouseMove = useCallback((e) => { handleDragMove(e.clientX, e.clientY); }, [handleDragMove]);
  const onMouseUp = useCallback(() => { handleDragEnd(); }, [handleDragEnd]);

  // Touch events
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    handleDragStart(t.clientX, t.clientY);
  }, [handleDragStart]);
  const onTouchMove = useCallback((e) => {
    const t = e.touches[0];
    handleDragMove(t.clientX, t.clientY);
  }, [handleDragMove]);
  const onTouchEnd = useCallback(() => { handleDragEnd(); }, [handleDragEnd]);

  // Attach/detach global listeners while dragging
  useEffect(() => {
    const mm = (e) => onMouseMove(e);
    const mu = () => onMouseUp();
    const tm = (e) => onTouchMove(e);
    const tu = () => onTouchEnd();
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    window.addEventListener('touchmove', tm, { passive: false });
    window.addEventListener('touchend', tu);
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
      window.removeEventListener('touchmove', tm);
      window.removeEventListener('touchend', tu);
    };
  }, [onMouseMove, onMouseUp, onTouchMove, onTouchEnd]);

  const triggerBtnRef = useRef(null);

  // Detect mobile
  const [isMobileChat, setIsMobileChat] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobileChat(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Compute chatbot container position based on trigger button (desktop only)
  const getChatPosition = useCallback(() => {
    if (isMobileChat) return {}; // mobile uses CSS full-screen
    // Desktop: right-side panel, no custom positioning needed (CSS handles it)
    return {};
  }, [isMobileChat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save language preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('chatbot-language', language);
    // Update the initial greeting message when language changes
    setMessages(prevMessages => {
      if (prevMessages.length === 1 && prevMessages[0].id === 1) {
        return [{
          id: 1,
          text: t.greeting,
          sender: 'bot',
          timestamp: new Date(),
        }];
      }
      return prevMessages;
    });
  }, [language, t.greeting]);

  // Periodic greeting animation when chatbot is closed
  useEffect(() => {
    if (!isOpen) {
      const greetingInterval = setInterval(() => {
        setShowGreeting(true);
        setTimeout(() => setShowGreeting(false), 3000); // Show for 3 seconds
      }, 10000); // Every 10 seconds

      // Show greeting after initial delay
      const initialTimeout = setTimeout(() => {
        setShowGreeting(true);
        setTimeout(() => setShowGreeting(false), 3000);
      }, 3000);

      return () => {
        clearInterval(greetingInterval);
        clearTimeout(initialTimeout);
      };
    } else {
      setShowGreeting(false);
    }
  }, [isOpen]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Add user message
    const userMessage = {
      id: messages.length + 1,
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      const response = await chatAPI.sendMessage(inputValue, language);

      // Detect building names mentioned in the reply
      const mentionedBuildings = buildings.filter(b =>
        b.name && response.reply.toLowerCase().includes(b.name.toLowerCase())
      );

      const botMessage = {
        id: messages.length + 2,
        text: response.reply,
        sender: 'bot',
        timestamp: new Date(),
        mentionedBuildings: mentionedBuildings.length > 0 ? mentionedBuildings : undefined,
      };

      setMessages((prev) => [...prev, botMessage]);
      setAnimatingMessageId(botMessage.id);
    } catch (error) {
      const errorMessage = {
        id: messages.length + 2,
        text: `Sorry, I encountered an error: ${error.message}. Please make sure the OpenAI API key is configured.`,
        sender: 'bot',
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setAnimatingMessageId(errorMessage.id);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceMouseDown = () => {
    if (voiceSupported) {
      startListening();
    }
  };

  const handleVoiceMouseUp = () => {
    stopListening();
  };

  const clearChat = () => {
    setMessages([
      {
        id: 1,
        text: t.greeting,
        sender: 'bot',
        timestamp: new Date(),
      },
    ]);
  };

  // Mascot animation phase: 'idle' → 'anticipate' → 'peek' → 'float' → 'retract' → 'land'
  const [mascotPhase, setMascotPhase] = useState('idle');
  const phaseTimerRef = useRef(null);

  // Drive the mascot animation cycle when greeting triggers
  useEffect(() => {
    if (showGreeting && !isOpen) {
      // Start: compress down (anticipation), then pop up
      setMascotPhase('anticipate');
      phaseTimerRef.current = setTimeout(() => {
        setMascotPhase('peek');
        phaseTimerRef.current = setTimeout(() => {
          setMascotPhase('float');
        }, 200);
      }, 250);
    } else if (!showGreeting && mascotPhase !== 'idle') {
      // Greeting ended — retract then land
      setMascotPhase('retract');
      phaseTimerRef.current = setTimeout(() => {
        setMascotPhase('land');
        phaseTimerRef.current = setTimeout(() => {
          setMascotPhase('idle');
        }, 350);
      }, 400);
    }
    return () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGreeting, isOpen]);

  // Spring configs for each phase
  const robotVariants = {
    idle:       { y: 8, scaleX: 1, scaleY: 1, rotate: 0 },
    anticipate: { y: 12, scaleX: 1.08, scaleY: 0.92, rotate: 0 },
    peek:       { y: -12, scaleX: 0.96, scaleY: 1.06, rotate: 0 },
    float:      { y: -14, scaleX: 1, scaleY: 1, rotate: 2 },
    retract:    { y: 4, scaleX: 1, scaleY: 1, rotate: 0 },
    land:       { y: 10, scaleX: 1.06, scaleY: 0.94, rotate: 0 },
  };

  const robotTransitions = {
    idle:       { type: 'spring', stiffness: 120, damping: 14, mass: 0.8 },
    anticipate: { type: 'spring', stiffness: 300, damping: 20, mass: 0.6 },
    peek:       { type: 'spring', stiffness: 180, damping: 12, mass: 0.7 },
    float:      { type: 'spring', stiffness: 80,  damping: 10, mass: 1 },
    retract:    { type: 'spring', stiffness: 200, damping: 18, mass: 0.7 },
    land:       { type: 'spring', stiffness: 300, damping: 15, mass: 0.6 },
  };

  const showSpeechBubble = mascotPhase === 'peek' || mascotPhase === 'float';

  return (
    <>
      {/* Mascot trigger — visible when chatbot is closed */}
      {!isOpen && (
        <div
          ref={triggerBtnRef}
          className="chatbot-mascot-wrapper"
          style={triggerPos ? { left: `${triggerPos.x}px`, top: `${triggerPos.y}px`, right: 'auto', bottom: 'auto' } : undefined}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {/* Speech bubble — Framer Motion AnimatePresence */}
          <AnimatePresence>
            {showSpeechBubble && (
              <motion.div
                className="mascot-speech-bubble"
                initial={{ opacity: 0, y: 8, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, mass: 0.6 }}
              >
                <span>Hello 👋</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trigger area with pulsing glow rings */}
          <div className="chatbot-trigger-container">
            <div className="chatbot-trigger-ring" aria-hidden="true" />
            <div className="chatbot-trigger-ring chatbot-trigger-ring--2" aria-hidden="true" />
            <button
              className="chatbot-trigger"
              onClick={() => { if (!dragRef.current.moved) setIsOpen(true); }}
              title="Open Campus Assistant (drag to move)"
            >
              {/* Mascot robot — spring animated */}
              <motion.div
                className="mascot-robot"
                variants={robotVariants}
                animate={mascotPhase}
                transition={robotTransitions[mascotPhase]}
              >
              <svg width="48" height="48" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="mg_body" cx="38%" cy="25%" r="72%">
                    <stop offset="0%" stopColor="#ff7373"/>
                    <stop offset="42%" stopColor="#dc2626"/>
                    <stop offset="100%" stopColor="#7f1d1d"/>
                  </radialGradient>
                  <radialGradient id="mg_face" cx="50%" cy="35%" r="75%">
                    <stop offset="0%" stopColor="#fff1f2"/>
                    <stop offset="100%" stopColor="#fecaca"/>
                  </radialGradient>
                  <radialGradient id="mg_eye" cx="32%" cy="28%" r="65%">
                    <stop offset="0%" stopColor="#475569"/>
                    <stop offset="100%" stopColor="#020617"/>
                  </radialGradient>
                  <radialGradient id="mg_cup" cx="38%" cy="30%" r="68%">
                    <stop offset="0%" stopColor="#4b5563"/>
                    <stop offset="100%" stopColor="#0f172a"/>
                  </radialGradient>
                  <radialGradient id="mg_ant" cx="38%" cy="32%" r="65%">
                    <stop offset="0%" stopColor="#fca5a5"/>
                    <stop offset="55%" stopColor="#f87171"/>
                    <stop offset="100%" stopColor="#991b1b"/>
                  </radialGradient>
                  <linearGradient id="mg_gloss" x1="5%" y1="5%" x2="75%" y2="65%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.50"/>
                    <stop offset="55%" stopColor="white" stopOpacity="0.10"/>
                    <stop offset="100%" stopColor="white" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="mg_rim" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="transparent"/>
                    <stop offset="100%" stopColor="#0f172a" stopOpacity="0.35"/>
                  </linearGradient>
                </defs>

                {/* Ambient aura */}
                <ellipse cx="32" cy="33" rx="20" ry="18" fill="#dc2626" opacity="0.10"/>

                {/* Headset band */}
                <path d="M16 20 Q32 6 48 20" stroke="#0f172a" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
                <path d="M16 20 Q32 6 48 20" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.55"/>

                {/* Left earmuff */}
                <ellipse cx="16" cy="25" rx="4.5" ry="6" fill="url(#mg_cup)"/>
                <ellipse cx="16" cy="25" rx="2.6" ry="3.8" fill="#0f172a"/>
                <ellipse cx="15.2" cy="23" rx="1.3" ry="0.9" fill="white" opacity="0.28"/>

                {/* Right earmuff */}
                <ellipse cx="48" cy="25" rx="4.5" ry="6" fill="url(#mg_cup)"/>
                <ellipse cx="48" cy="25" rx="2.6" ry="3.8" fill="#0f172a"/>
                <ellipse cx="47.2" cy="23" rx="1.3" ry="0.9" fill="white" opacity="0.28"/>

                {/* Microphone arm */}
                <path d="M48 28 Q54 32 50 38" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <ellipse cx="49.5" cy="39.5" rx="3.2" ry="2.2" fill="#0f172a"/>
                <ellipse cx="49.5" cy="39.5" rx="2" ry="1.3" fill="#334155"/>
                <ellipse cx="49" cy="38.9" rx="0.8" ry="0.5" fill="white" opacity="0.35"/>

                {/* Body */}
                <rect x="16" y="22" width="32" height="26" rx="10" fill="url(#mg_body)"/>
                <rect x="16" y="22" width="32" height="26" rx="10" fill="url(#mg_rim)"/>

                {/* Head */}
                <rect x="18" y="14" width="28" height="22" rx="11" fill="url(#mg_body)"/>
                <rect x="18" y="14" width="28" height="22" rx="11" fill="url(#mg_rim)"/>

                {/* Face panel */}
                <rect x="22" y="18" width="20" height="14" rx="7" fill="url(#mg_face)"/>

                {/* Left eye */}
                <circle cx="28" cy="24" r="3.5" fill="url(#mg_eye)"/>
                <circle cx="29.3" cy="22.7" r="1.4" fill="white" opacity="0.65"/>
                <circle cx="28.7" cy="22.3" r="0.6" fill="white" opacity="0.90"/>

                {/* Right eye */}
                <circle cx="36" cy="24" r="3.5" fill="url(#mg_eye)"/>
                <circle cx="37.3" cy="22.7" r="1.4" fill="white" opacity="0.65"/>
                <circle cx="36.7" cy="22.3" r="0.6" fill="white" opacity="0.90"/>

                {/* Smile */}
                <path d="M27.5 29 Q32 33.5 36.5 29" stroke="#b91c1c" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                <path d="M27.5 29 Q32 33.5 36.5 29" stroke="#fecaca" strokeWidth="0.7" strokeLinecap="round" fill="none" opacity="0.5"/>

                {/* Cheek blush */}
                <ellipse cx="24" cy="29.5" rx="2.8" ry="1.7" fill="#fca5a5" opacity="0.45"/>
                <ellipse cx="40" cy="29.5" rx="2.8" ry="1.7" fill="#fca5a5" opacity="0.45"/>

                {/* Antenna */}
                <line x1="32" y1="14" x2="32" y2="8" stroke="#991b1b" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="32" cy="7" r="5" fill="#ef4444" opacity="0.22"/>
                <circle cx="32" cy="7" r="3" fill="url(#mg_ant)"/>
                <circle cx="31.3" cy="6.3" r="1" fill="white" opacity="0.60"/>

                {/* Gloss highlights */}
                <rect x="18" y="14" width="28" height="14" rx="11" fill="url(#mg_gloss)"/>
                <rect x="16" y="22" width="32" height="10" rx="10" fill="url(#mg_gloss)" opacity="0.55"/>
              </svg>
            </motion.div>
          </button>
        </div>

          {/* Decorative chevron pulse beneath */}
          <motion.div
            className="mascot-chevron"
            animate={{ y: [0, 4, 0], opacity: [0.7, 0.3, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
              <path d="M2 2L12 10L22 2" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.div>
        </div>
      )}

      {/* Chat container — animated open/close */}
      <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`chatbot-container ${isMobileChat ? 'chatbot-mobile' : 'chatbot-desktop'}`}
          style={getChatPosition()}
          initial={isMobileChat ? { opacity: 0, y: '100%' } : { opacity: 0, x: 30, scale: 0.97 }}
          animate={isMobileChat ? { opacity: 1, y: 0 } : { opacity: 1, x: 0, scale: 1 }}
          exit={isMobileChat ? { opacity: 0, y: '100%' } : { opacity: 0, x: 30, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
      {/* Mobile: full-width top header with back button */}
      {isMobileChat && (
        <div className="chatbot-mobile-header">
          <button
            className="chatbot-mobile-back-btn"
            onClick={() => setIsOpen(false)}
            title="Back to map"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h3 className="chatbot-mobile-title">{t.title}</h3>
          <div className="chatbot-mobile-actions">
            <select
              className="chatbot-language-selector chatbot-language-selector-mobile"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              title={t.language}
            >
              <option value="en">EN</option>
              <option value="tl">TL</option>
              <option value="ceb">CEB</option>
            </select>
            <button
              className="chatbot-clear-btn"
              onClick={clearChat}
              title={t.clear}
            >
              <DeleteIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Desktop: original header */}
      {!isMobileChat && (
      <div className="chatbot-header">
        <h3>{t.title}</h3>
        <div className="chatbot-controls">
          <select
            className="chatbot-language-selector"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            title={t.language}
          >
            <option value="en">English</option>
            <option value="tl">Tagalog</option>
            <option value="ceb">Cebuano</option>
          </select>
          <button
            className="chatbot-clear-btn"
            onClick={clearChat}
            title={t.clear}
          >
            <DeleteIcon size={16} />
          </button>
          <button
            className="chatbot-close-btn"
            onClick={() => setIsOpen(false)}
            title={t.close}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
      )}

      <div className="chatbot-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.sender} ${message.isError ? 'error' : ''}`}
          >
            <div className="message-content">
              {message.sender === 'bot' && (
                <span className="bot-avatar">
                  {/* Friendly Campus Robot Assistant */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    {/* Robot head */}
                    <rect x="6" y="6" width="12" height="10" rx="2" fill="currentColor" />
                    {/* Antenna */}
                    <line x1="12" y1="3" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="2.5" r="1" fill="currentColor" />
                    {/* Eyes */}
                    <circle cx="9.5" cy="10" r="1.2" fill="white" />
                    <circle cx="14.5" cy="10" r="1.2" fill="white" />
                    {/* Smile */}
                    <path d="M9,13 Q12,15 15,13" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                    {/* Location pin indicator */}
                    <path d="M12,18 L12,21 M10,21 L14,21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
              )}
              <div className="message-text">
                {message.sender === 'bot' && message.id === animatingMessageId ? (
                  <TypewriterText text={message.text} speed={30} />
                ) : (
                  message.text
                )}
                {/* Navigate buttons for mentioned buildings */}
                {message.sender === 'bot' && message.mentionedBuildings && message.mentionedBuildings.length > 0 && (
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {message.mentionedBuildings.map((building) => (
                      <button
                        key={building._id}
                        onClick={() => onNavigate && onNavigate(building, building.name)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          background: '#16a34a',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#15803d'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#16a34a'; }}
                        title={`Navigate to ${building.name}`}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                        Navigate to {building.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {message.sender === 'user' && <span className="user-avatar">👤</span>}
            </div>
            <div className="message-time">
              {message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message bot">
            <div className="message-content">
              <span className="bot-avatar">
                {/* Friendly Campus Robot Assistant */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  {/* Robot head */}
                  <rect x="6" y="6" width="12" height="10" rx="2" fill="currentColor" />
                  {/* Antenna */}
                  <line x1="12" y1="3" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="2.5" r="1" fill="currentColor" />
                  {/* Eyes */}
                  <circle cx="9.5" cy="10" r="1.2" fill="white" />
                  <circle cx="14.5" cy="10" r="1.2" fill="white" />
                  {/* Smile */}
                  <path d="M9,13 Q12,15 15,13" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                  {/* Location pin indicator */}
                  <path d="M12,18 L12,21 M10,21 L14,21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <div className="message-text typing">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chatbot-input-area">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t.placeholder}
          disabled={loading}
          rows="2"
        />
        <div className="chatbot-button-group">
          {voiceSupported && (
            <button
              className={`chatbot-voice-btn ${isListening ? 'listening' : ''}`}
              onMouseDown={handleVoiceMouseDown}
              onMouseUp={handleVoiceMouseUp}
              onMouseLeave={handleVoiceMouseUp}
              disabled={loading}
              title="Hold to talk"
            >
              <MicIcon size={18} />
            </button>
          )}
          <button
            onClick={handleSendMessage}
            disabled={loading || !inputValue.trim()}
            className="chatbot-send-btn"
          >
            {loading ? '...' : <SendIcon size={18} />}
          </button>
        </div>
      </div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}

export default ChatBot;

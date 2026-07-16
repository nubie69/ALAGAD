import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { chatAPI } from '../utils/api';
import useVoiceRecognition from '../hooks/useVoiceRecognition';
import { MicIcon, DeleteIcon, CloseIcon, SendIcon } from '../utils/icons';
import './ChatBot.css';

// Map chatbot language → speech recognition BCP-47 code
// Note: Web Speech API support varies; Cebuano isn't consistently available, so we fall back to a PH locale.
const VOICE_LANG_MAP = { en: 'en-US', tl: 'fil-PH', ceb: 'en-PH' };
const MIN_SUGGESTION_QUERY_LENGTH = 2;
const SUGGESTION_DEBOUNCE_MS = 180;

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
    navQuestion: 'Do you want me to navigate you there?',
    navButton: 'Navigate',
  },
  tl: {
    title: 'Campus Assistant',
    greeting: 'Hi! Ako ang iyong campus assistant. Paano kita matutulungan?',
    placeholder: 'Iketik ang iyong tanong...',
    send: 'Magpadala',
    clear: 'Limasin ang chat',
    close: 'Isara',
    language: 'Wika',
    navQuestion: 'Do you want me to navigate you there?',
    navButton: 'Mag-navigate',
  },
  ceb: {
    title: 'Campus Assistant',
    greeting: 'Kumusta! Ako ang imong campus assistant. Unsa akong matabang?',
    placeholder: 'Isulat ang iyong pangutana...',
    send: 'Ipadala',
    clear: 'Limpyohan ang chat',
    close: 'Isara',
    language: 'Pinulongan',
    navQuestion: 'Do you want me to navigate you there?',
    navButton: 'Mag-navigate',
  }
};

const detectLanguageClient = (message) => {
  const text = (message || '').toLowerCase();
  if (/\b(asa|ngano|unsa|pila|adto|dinhi|palihog|salamat)\b/.test(text)) return 'ceb';
  if (/\b(saan|paano|ano|nasaan|pakisuyo|salamat|opo|po)\b/.test(text)) return 'tl';
  return 'en';
};

const buildAppendOnlyInput = (currentText, suggestion) => {
  const base = String(currentText || '');
  const appendText = String(suggestion?.append_text || '');
  const suggestedQuery = String(suggestion?.suggested_query || '').trim();

  if (appendText) {
    const next = `${base}${appendText}`;
    return next;
  }

  if (!base.trim()) {
    return suggestedQuery;
  }

  if (suggestedQuery && suggestedQuery.toLowerCase().startsWith(base.toLowerCase())) {
    return `${base}${suggestedQuery.slice(base.length)}`;
  }

  if (suggestedQuery) {
    return `${base}${base.endsWith(' ') ? '' : ' '}${suggestedQuery}`;
  }

  const fallback = String(suggestion?.display_name || suggestion?.canonical_name || '').trim();
  if (!fallback) return base;
  return `${base}${base.endsWith(' ') ? '' : ' '}${fallback}`;
};

const extractServiceParts = (replyText) => {
  const text = typeof replyText === 'string' ? replyText : '';
  const serviceMatch = text.match(/(^|\n)\s*Service\s*:\s*(.+)\s*(\n|$)/i);
  const officeMatch = text.match(/(^|\n)\s*Office\s*:\s*(.+)\s*(\n|$)/i);
  const locationMatch = text.match(/(^|\n)\s*Location\s*:\s*(.+)\s*(\n|$)/i);
  return {
    serviceName: serviceMatch ? serviceMatch[2].trim() : null,
    locationLabel: officeMatch ? officeMatch[2].trim() : (locationMatch ? locationMatch[2].trim() : null),
  };
};

const isNoInfoDatabaseReply = (replyText) => /^(no information found\.?|i don['’]t have that info in the campus database\.?|sorry,\s*i\s*can[’']t find that information in the system\.?|sorry\s+i\s+couldnt\s+find\s+that\s+information\.?|sorry\s+i\s+dont\s+have\s+the\s+information\.?)$/i.test(String(replyText || '').trim());

// Typewriter effect component
const TypewriterText = ({ text, speed = 18, onComplete }) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const completionNotifiedRef = useRef(false);

  useEffect(() => {
    setDisplayText('');
    setCurrentIndex(0);
    setIsComplete(false);
    completionNotifiedRef.current = false;
  }, [text]);

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

  useEffect(() => {
    if (!isComplete || completionNotifiedRef.current) return;
    completionNotifiedRef.current = true;
    if (typeof onComplete === 'function') {
      onComplete();
    }
  }, [isComplete, onComplete]);

  return (
    <span className={isComplete ? 'typewriter-complete' : 'typewriter-active'}>
      {displayText}
    </span>
  );
};

function ChatBot({ onOpenChange, buildings = [], offices = [], rooms = [], onNavigate }) {
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
  const nextMessageIdRef = useRef(2);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const suggestionRequestSeqRef = useRef(0);
  const suggestionBlurTimeoutRef = useRef(null);
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
  const [completedBotMessageIds, setCompletedBotMessageIds] = useState(() => new Set());
  const [showGreeting, setShowGreeting] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const previousIsOpenRef = useRef(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    // Prefer scrolling the container to avoid layout shifts
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleSendMessage = useCallback(async (overrideText, options = {}) => {
    const textToSend = (typeof overrideText === 'string' ? overrideText : inputValue).trim();
    const selectedSuggestionForSubmit = options.selectedSuggestion || selectedSuggestion || null;
    if (!textToSend) return;

    setShouldAutoScroll(true);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);

    // Detect language for reply hint only; keep the UI language unchanged.
    const detectedLang = detectLanguageClient(textToSend);

    // Add user message
    const userMessage = {
      id: nextMessageIdRef.current++,
      text: textToSend,
      sender: 'user',
      language: detectedLang,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      const conversationHistory = messages
        .slice(-10)
        .map((msg) => ({
          sender: msg?.sender === 'bot' ? 'bot' : 'user',
          text: String(msg?.text || '').trim(),
          intent: String(msg?.intent || '').trim() || null,
          locationName: String(msg?.locationName || '').trim() || null,
          entityName: String(msg?.entityName || '').trim() || null,
          language: String(msg?.language || '').trim() || detectLanguageClient(String(msg?.text || '')),
        }))
        .filter((msg) => msg.text);

      // Send detected query language as reply hint; backend still auto-detects from the message.
      const response = await chatAPI.sendMessage(
        textToSend,
        detectedLang,
        selectedSuggestionForSubmit,
        conversationHistory
      );

      const intent = response.intent || 'information';
      const replyText = response.reply || '';
      const rawLocationName = response.location || null;
      const parsedParts = extractServiceParts(replyText);
      const locationName = rawLocationName || parsedParts.locationLabel || null;
      const entityName = String(response.entityName || parsedParts.serviceName || '').trim() || null;
      const responseLanguage = String(response.responseLanguage || '').trim() || detectLanguageClient(replyText);

      const shouldSuppressNavigation = isNoInfoDatabaseReply(replyText);
      const navigation = !shouldSuppressNavigation && (response.navigation === true || intent === 'navigation' || intent === 'service');
      const steps = Array.isArray(response.steps) ? response.steps.filter(s => typeof s === 'string' && s.trim()) : [];

      // Try to resolve a navigation target entity (building/office/room) based on the model's location field
      const normalize = (s) => (typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() : '');
      const locKey = normalize(locationName);

      const resolveByName = (items) => {
        if (!Array.isArray(items) || !locKey) return null;

        const exact = items.find((item) => normalize(item?.name) === locKey);
        if (exact) return exact;

        const partial = items.find((item) => {
          const itemKey = normalize(item?.name);
          return itemKey && (itemKey.includes(locKey) || locKey.includes(itemKey));
        });

        return partial || null;
      };

      let navigationTargetEntity = null;
      if (locKey) {
        navigationTargetEntity = resolveByName(buildings);
        if (!navigationTargetEntity) {
          navigationTargetEntity = resolveByName(offices);
        }
        if (!navigationTargetEntity) {
          navigationTargetEntity = resolveByName(rooms);
        }
      }

      const botMessage = {
        id: nextMessageIdRef.current++,
        text: replyText,
        sender: 'bot',
        language: responseLanguage,
        timestamp: new Date(),
        intent,
        locationName,
        entityName,
        navigation,
        steps,
        navigationTargetEntity,
      };

      setMessages((prev) => [...prev, botMessage]);
      setAnimatingMessageId(botMessage.id);
    } catch (error) {
      const errorMessage = {
        id: nextMessageIdRef.current++,
        text: `Sorry, I encountered an error: ${error.message}. Please make sure the AI API key is configured on the server.`,
        sender: 'bot',
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setAnimatingMessageId(errorMessage.id);
    } finally {
      setLoading(false);
      setSelectedSuggestion(null);
    }
  }, [buildings, inputValue, messages, offices, rooms, selectedSuggestion]);

  const applySuggestion = useCallback((suggestion, partialQuery = '') => {
    if (!suggestion) return;
    const nextText = buildAppendOnlyInput(partialQuery, suggestion);
    if (!nextText) return;

    setInputValue(nextText);
    setSelectedSuggestion({
      ...suggestion,
      applied_query: nextText,
    });
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);

    chatAPI.logSuggestionSelection(partialQuery, suggestion).catch(() => {});
  }, []);

  // Voice recognition: insert transcript and auto-send
  const handleVoiceResult = useCallback((transcript) => {
    const text = (transcript || '').trim();
    if (!text) return;
    setInputValue(text);
    // Auto-send transcript
    handleSendMessage(text);
  }, [handleSendMessage]);
  
  const { isListening, isSupported: voiceSupported, startListening, stopListening, setLanguage: setVoiceLang } = useVoiceRecognition(
    handleVoiceResult,
    (error) => console.error('Voice error:', error),
    VOICE_LANG_MAP[language] || 'en-US'
  );

  // Sync voice recognition language when chatbot language changes
  useEffect(() => {
    setVoiceLang(VOICE_LANG_MAP[language] || 'en-US');
  }, [language, setVoiceLang]);

  useEffect(() => () => {
    if (suggestionBlurTimeoutRef.current) {
      clearTimeout(suggestionBlurTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const query = String(inputValue || '').trim();
    if (!isOpen || loading || query.length < MIN_SUGGESTION_QUERY_LENGTH) {
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestionIndex(-1);
      return;
    }

    if (selectedSuggestion) {
      const selectedText = String(selectedSuggestion.applied_query || selectedSuggestion.suggested_query || '').trim();
      if (selectedText && selectedText.toLowerCase() === query.toLowerCase()) {
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        return;
      }
    }

    const seq = suggestionRequestSeqRef.current + 1;
    suggestionRequestSeqRef.current = seq;

    const timer = setTimeout(async () => {
      try {
        const detectedLang = detectLanguageClient(query) || language;
        const data = await chatAPI.getSuggestions(query, detectedLang, 1);
        if (seq !== suggestionRequestSeqRef.current) return;

        const nextSuggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(nextSuggestions);
        setShowSuggestions(isInputFocused && nextSuggestions.length > 0);
        setActiveSuggestionIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch (_error) {
        if (seq !== suggestionRequestSeqRef.current) return;
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [inputValue, isInputFocused, isOpen, language, loading, selectedSuggestion]);

  // Draggable trigger button position (ignore saved position on mobile to prevent off-screen placement)
  const [triggerPos, setTriggerPos] = useState(() => {
    try {
      if (window.innerWidth <= 768) return null;
      const saved = localStorage.getItem('chatbot-trigger-pos');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
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

  // Keep saved desktop trigger position inside viewport to prevent accidental off-screen placement.
  useEffect(() => {
    if (isMobileChat || !triggerPos) return;
    const size = triggerBtnRef.current?.offsetWidth || 64;
    const clamped = clampPosition(triggerPos.x, triggerPos.y, size, size);
    if (clamped.x !== triggerPos.x || clamped.y !== triggerPos.y) {
      setTriggerPos(clamped);
      try { localStorage.setItem('chatbot-trigger-pos', JSON.stringify(clamped)); } catch {}
    }
  }, [clampPosition, isMobileChat, triggerPos]);

  // Compute chatbot container position based on trigger button (desktop only)
  const getChatPosition = useCallback(() => {
    if (isMobileChat) return {}; // mobile uses CSS full-screen
    // Desktop: right-side panel, no custom positioning needed (CSS handles it)
    return {};
  }, [isMobileChat]);

  useEffect(() => {
    if (shouldAutoScroll) scrollToBottom('smooth');
  }, [messages, shouldAutoScroll, scrollToBottom]);

  useEffect(() => {
    if (isOpen) {
      setShouldAutoScroll(true);
      // immediate scroll on open to avoid animation jank
      scrollToBottom('auto');
    }
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    // If the panel is closed while a response is animating, mark it complete
    // so reopening the chatbot does not replay the typewriter animation.
    if (previousIsOpenRef.current && !isOpen && animatingMessageId) {
      setCompletedBotMessageIds((prev) => {
        if (prev.has(animatingMessageId)) return prev;
        const animatingMessage = messages.find(
          (item) => item.sender === 'bot' && item.id === animatingMessageId
        );
        if (!animatingMessage) return prev;
        const next = new Set(prev);
        next.add(animatingMessageId);
        return next;
      });
    }
    previousIsOpenRef.current = isOpen;
  }, [animatingMessageId, isOpen, messages]);

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

  // handleSendMessage is defined above (useCallback)

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => {
        if (prev < 0) return 0;
        return Math.min(prev + 1, suggestions.length - 1);
      });
      setShowSuggestions(true);
      return;
    }

    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
      setShowSuggestions(true);
      return;
    }

    if (e.key === 'Tab' && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      const selected = suggestions[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0];
      applySuggestion(selected, String(inputValue || ''));
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        const selected = suggestions[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0];
        if (selected) {
          applySuggestion(selected, String(inputValue || ''));
          return;
        }
      }
      handleSendMessage();
    }
  };

  const handleVoiceToggle = () => {
    if (!voiceSupported) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const clearChat = () => {
    nextMessageIdRef.current = 2;
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
    setSelectedSuggestion(null);
    setCompletedBotMessageIds(new Set());
    setAnimatingMessageId(1);
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
                    <stop offset="0%" stopColor="#8deaf6"/>
                    <stop offset="42%" stopColor="#0ac4e0"/>
                    <stop offset="100%" stopColor="#067d90"/>
                  </radialGradient>
                  <radialGradient id="mg_face" cx="50%" cy="35%" r="75%">
                    <stop offset="0%" stopColor="#f3fcff"/>
                    <stop offset="100%" stopColor="#d6f6fb"/>
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
                    <stop offset="0%" stopColor="#66ddf0"/>
                    <stop offset="55%" stopColor="#0ac4e0"/>
                    <stop offset="100%" stopColor="#067d90"/>
                  </radialGradient>
                  <linearGradient id="mg_gloss" x1="5%" y1="5%" x2="75%" y2="65%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.50"/>
                    <stop offset="55%" stopColor="white" stopOpacity="0.10"/>
                    <stop offset="100%" stopColor="white" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="mg_rim" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="transparent"/>
                    <stop offset="100%" stopColor="#045c6b" stopOpacity="0.24"/>
                  </linearGradient>
                </defs>

                {/* Ambient aura */}
                <ellipse cx="32" cy="33" rx="20" ry="18" fill="#0ac4e0" opacity="0.14"/>

                {/* Headset band */}
                <path d="M16 20 Q32 6 48 20" stroke="#0b3b66" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
                <path d="M16 20 Q32 6 48 20" stroke="#3e7d8f" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.55"/>

                {/* Left earmuff */}
                <ellipse cx="16" cy="25" rx="4.5" ry="6" fill="url(#mg_cup)"/>
                <ellipse cx="16" cy="25" rx="2.6" ry="3.8" fill="#0f172a"/>
                <ellipse cx="15.2" cy="23" rx="1.3" ry="0.9" fill="white" opacity="0.28"/>

                {/* Right earmuff */}
                <ellipse cx="48" cy="25" rx="4.5" ry="6" fill="url(#mg_cup)"/>
                <ellipse cx="48" cy="25" rx="2.6" ry="3.8" fill="#0f172a"/>
                <ellipse cx="47.2" cy="23" rx="1.3" ry="0.9" fill="white" opacity="0.28"/>

                {/* Microphone arm */}
                <path d="M48 28 Q54 32 50 38" stroke="#0b3b66" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
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
                <path d="M27.5 29 Q32 33.5 36.5 29" stroke="#067d90" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                <path d="M27.5 29 Q32 33.5 36.5 29" stroke="#bdeff7" strokeWidth="0.7" strokeLinecap="round" fill="none" opacity="0.6"/>

                {/* Cheek blush */}
                <ellipse cx="24" cy="29.5" rx="2.8" ry="1.7" fill="#8deaf6" opacity="0.32"/>
                <ellipse cx="40" cy="29.5" rx="2.8" ry="1.7" fill="#8deaf6" opacity="0.32"/>

                {/* Antenna */}
                <line x1="32" y1="14" x2="32" y2="8" stroke="#067d90" strokeWidth="2.5" strokeLinecap="round"/>
                <circle cx="32" cy="7" r="5" fill="#0ac4e0" opacity="0.24"/>
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
              <path d="M2 2L12 10L22 2" stroke="#0ac4e0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
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
          initial={isMobileChat ? { opacity: 0 } : { opacity: 0, x: 30, scale: 0.97 }}
          animate={isMobileChat ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
          exit={isMobileChat ? { opacity: 0 } : { opacity: 0, x: 30, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
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
          <div className="chatbot-mobile-header-mascot">
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <rect x="16" y="22" width="32" height="26" rx="10" fill="#fff" opacity="0.9"/>
              <rect x="18" y="14" width="28" height="22" rx="11" fill="#fff" opacity="0.9"/>
              <rect x="22" y="18" width="20" height="14" rx="7" fill="#e8f8fc"/>
              <circle cx="28" cy="24" r="3" fill="#0b3b66"/><circle cx="29" cy="23" r="1.2" fill="white" opacity="0.7"/>
              <circle cx="36" cy="24" r="3" fill="#0b3b66"/><circle cx="37" cy="23" r="1.2" fill="white" opacity="0.7"/>
              <path d="M28 29 Q32 33 36 29" stroke="#067d90" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <line x1="32" y1="14" x2="32" y2="9" stroke="#0ac4e0" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="32" cy="8" r="2.5" fill="#0ac4e0"/>
            </svg>
          </div>
          <h3 className="chatbot-mobile-title">{t.title}</h3>
          <div className="chatbot-mobile-actions">
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

      <div
        className="chatbot-messages"
        ref={messagesContainerRef}
        onScroll={() => {
          const el = messagesContainerRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          setShouldAutoScroll(distanceFromBottom < 80);
        }}
      >
        <div className="chatbot-messages-inner">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.sender} ${message.isError ? 'error' : ''}`}
            >
              <div className="message-content">
                {message.sender === 'bot' && (
                  <span className="bot-avatar">
                  <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <radialGradient id="ba_body" cx="38%" cy="25%" r="72%"><stop offset="0%" stopColor="#8deaf6"/><stop offset="42%" stopColor="#0ac4e0"/><stop offset="100%" stopColor="#067d90"/></radialGradient>
                      <radialGradient id="ba_face" cx="50%" cy="35%" r="75%"><stop offset="0%" stopColor="#f3fcff"/><stop offset="100%" stopColor="#d6f6fb"/></radialGradient>
                      <radialGradient id="ba_eye" cx="32%" cy="28%" r="65%"><stop offset="0%" stopColor="#475569"/><stop offset="100%" stopColor="#020617"/></radialGradient>
                    </defs>
                    <rect x="16" y="22" width="32" height="26" rx="10" fill="url(#ba_body)"/>
                    <rect x="18" y="14" width="28" height="22" rx="11" fill="url(#ba_body)"/>
                    <rect x="22" y="18" width="20" height="14" rx="7" fill="url(#ba_face)"/>
                    <circle cx="28" cy="24" r="3.5" fill="url(#ba_eye)"/>
                    <circle cx="29.3" cy="22.7" r="1.4" fill="white" opacity="0.65"/>
                    <circle cx="36" cy="24" r="3.5" fill="url(#ba_eye)"/>
                    <circle cx="37.3" cy="22.7" r="1.4" fill="white" opacity="0.65"/>
                    <path d="M27.5 29 Q32 33.5 36.5 29" stroke="#067d90" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                    <ellipse cx="24" cy="29.5" rx="2.8" ry="1.7" fill="#8deaf6" opacity="0.32"/>
                    <ellipse cx="40" cy="29.5" rx="2.8" ry="1.7" fill="#8deaf6" opacity="0.32"/>
                    <line x1="32" y1="14" x2="32" y2="8" stroke="#067d90" strokeWidth="2.5" strokeLinecap="round"/>
                    <circle cx="32" cy="7" r="3" fill="#0ac4e0"/>
                    <circle cx="31.3" cy="6.3" r="1" fill="white" opacity="0.6"/>
                  </svg>
                  </span>
                )}
                <div className="message-text">
                {(() => {
                  const text = typeof message.text === 'string' ? message.text : '';
                  const shouldAnimateThisMessage = message.sender === 'bot'
                    && message.id === animatingMessageId
                    && !completedBotMessageIds.has(message.id);
                  return shouldAnimateThisMessage
                    ? (
                      <TypewriterText
                        text={text}
                        speed={18}
                        onComplete={() => {
                          setCompletedBotMessageIds((prev) => {
                            if (prev.has(message.id)) return prev;
                            const next = new Set(prev);
                            next.add(message.id);
                            return next;
                          });
                          setAnimatingMessageId((prev) => (prev === message.id ? null : prev));
                        }}
                      />
                    )
                    : text;
                })()}
                {/* Navigation confirmation when AI detects navigation intent */}
                {(() => {
                  const isAnimatingThisMessage = message.sender === 'bot' && message.id === animatingMessageId;
                  const isResponseFullyShown = !isAnimatingThisMessage || completedBotMessageIds.has(message.id);
                  const shouldSuppressNavigation = isNoInfoDatabaseReply(message.text);
                  return message.sender === 'bot' && !shouldSuppressNavigation && message.navigation === true && message.navigationTargetEntity && isResponseFullyShown;
                })() && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#4b5563' }}>
                      {message.intent === 'service' ? t.navQuestion : 'Do you want me to navigate there?'}
                    </span>
                    <button
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate(message.navigationTargetEntity, message.navigationTargetEntity.name);
                        }
                        setIsOpen(false);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        alignSelf: 'flex-start',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        transition: 'background 0.15s ease, transform 0.1s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#15803d'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.transform = 'translateY(0)'; }}
                      title={t.navButton}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                      {t.navButton}
                    </button>
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
                <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <radialGradient id="ba_body2" cx="38%" cy="25%" r="72%"><stop offset="0%" stopColor="#8deaf6"/><stop offset="42%" stopColor="#0ac4e0"/><stop offset="100%" stopColor="#067d90"/></radialGradient>
                    <radialGradient id="ba_face2" cx="50%" cy="35%" r="75%"><stop offset="0%" stopColor="#f3fcff"/><stop offset="100%" stopColor="#d6f6fb"/></radialGradient>
                    <radialGradient id="ba_eye2" cx="32%" cy="28%" r="65%"><stop offset="0%" stopColor="#475569"/><stop offset="100%" stopColor="#020617"/></radialGradient>
                  </defs>
                  <rect x="16" y="22" width="32" height="26" rx="10" fill="url(#ba_body2)"/>
                  <rect x="18" y="14" width="28" height="22" rx="11" fill="url(#ba_body2)"/>
                  <rect x="22" y="18" width="20" height="14" rx="7" fill="url(#ba_face2)"/>
                  <circle cx="28" cy="24" r="3.5" fill="url(#ba_eye2)"/>
                  <circle cx="29.3" cy="22.7" r="1.4" fill="white" opacity="0.65"/>
                  <circle cx="36" cy="24" r="3.5" fill="url(#ba_eye2)"/>
                  <circle cx="37.3" cy="22.7" r="1.4" fill="white" opacity="0.65"/>
                  <path d="M27.5 29 Q32 33.5 36.5 29" stroke="#067d90" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                  <ellipse cx="24" cy="29.5" rx="2.8" ry="1.7" fill="#8deaf6" opacity="0.32"/>
                  <ellipse cx="40" cy="29.5" rx="2.8" ry="1.7" fill="#8deaf6" opacity="0.32"/>
                  <line x1="32" y1="14" x2="32" y2="8" stroke="#067d90" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="32" cy="7" r="3" fill="#0ac4e0"/>
                  <circle cx="31.3" cy="6.3" r="1" fill="white" opacity="0.6"/>
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
      </div>

      {/* Voice listening indicator */}
      {isListening && (
        <div className="chatbot-voice-indicator">
          <div className="chatbot-voice-indicator-dot" />
          <span>Listening...</span>
        </div>
      )}

      <div className="chatbot-input-area">
        <div className="chatbot-input-stack">
          {showSuggestions && suggestions.length > 0 && (
            <div className="chatbot-suggestions" role="listbox" aria-label="Chat suggestions">
              {suggestions.map((suggestion, index) => {
                const aliasList = Array.isArray(suggestion.aliases_display) && suggestion.aliases_display.length > 0
                  ? suggestion.aliases_display
                  : (Array.isArray(suggestion.aliases) ? suggestion.aliases : []);
                const aliasPreview = aliasList.length > 0 ? String(aliasList[0]) : '';
                const category = String(suggestion.category_display || suggestion.category || '').trim();
                const suggestionName = String(
                  suggestion.suggested_query
                  || suggestion.display_name
                  || suggestion.canonical_name
                  || ''
                ).trim();
                const isActive = index === activeSuggestionIndex;

                return (
                  <button
                    key={`${suggestion.id || suggestionName}-${index}`}
                    type="button"
                    className={`chatbot-suggestion-item ${isActive ? 'active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySuggestion(suggestion, String(inputValue || ''))}
                  >
                    <span className="chatbot-suggestion-name">{suggestionName}</span>
                    <span className="chatbot-suggestion-meta">
                      {category}
                      {aliasPreview ? ` | ${aliasPreview}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <textarea
            value={inputValue}
            onChange={(e) => {
              const nextValue = e.target.value;
              setInputValue(nextValue);
              setSelectedSuggestion(null);
              const detected = detectLanguageClient(nextValue);
              if (detected && detected !== language) setLanguage(detected);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setIsInputFocused(true);
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => {
              setIsInputFocused(false);
              if (suggestionBlurTimeoutRef.current) {
                clearTimeout(suggestionBlurTimeoutRef.current);
              }
              suggestionBlurTimeoutRef.current = setTimeout(() => {
                setShowSuggestions(false);
              }, 120);
            }}
            placeholder={isListening ? 'Listening...' : t.placeholder}
            disabled={loading}
            rows="1"
          />
        </div>
        <div className="chatbot-button-group">
          {voiceSupported && (
            <button
              className={`chatbot-voice-btn ${isListening ? 'listening' : ''}`}
              onClick={handleVoiceToggle}
              disabled={loading}
              title={isListening ? 'Tap to stop' : 'Tap to speak'}
            >
              {isListening ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <MicIcon size={18} />
              )}
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

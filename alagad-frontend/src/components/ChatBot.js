import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { chatAPI, publicFaqsAPI } from '../utils/api';
import useVoiceRecognition from '../hooks/useVoiceRecognition';
import { MicIcon, DeleteIcon, CloseIcon, SendIcon, NavigationIcon } from '../utils/icons';
import './ChatBot.css';

// Show one fully opaque atlas pose at a time to avoid ghosting while flying.
const MASCOT_ATLAS = `${process.env.PUBLIC_URL}/images/campus-mascot-flight-sprite.png`;
const CampusMascot = ({ portrait = false }) => (
  <span className={`campus-mascot ${portrait ? 'campus-mascot--portrait' : ''}`} aria-hidden="true">
    <span className="campus-mascot-frames">
      {(portrait ? [0] : [0, 1, 2, 3]).map((frame) => (
        <span className="campus-mascot-frame" key={frame} style={{ '--wing-frame': frame }}>
          <span className="campus-mascot-sprite" style={{ backgroundImage: `url(${MASCOT_ATLAS})`, backgroundPosition: `${frame * 100 / 3}% 0%` }} />
          <span className="campus-mascot-sprite campus-mascot-sprite--blink" style={{ backgroundImage: `url(${MASCOT_ATLAS})`, backgroundPosition: `${frame * 100 / 3}% 100%` }} />
        </span>
      ))}
    </span>
  </span>
);


// Map chatbot language → speech recognition BCP-47 code
// Note: Web Speech API support varies; Cebuano isn't consistently available, so we fall back to a PH locale.
const VOICE_LANG_MAP = { en: 'en-US', tl: 'fil-PH', ceb: 'en-PH' };

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
    navStart: 'Choose your starting point on the map to calculate the route.',
    viewMap: 'View on map',
    navButton: 'Navigate',
    contactHelpDesk: 'Contact Help Desk',
    findHelpDesk: 'Find Help Desk',
    noHelpDeskContact: 'Help Desk contact is not configured yet.',
  },
  tl: {
    title: 'Campus Assistant',
    greeting: 'Hi! Ako ang iyong campus assistant. Paano kita matutulungan?',
    placeholder: 'Iketik ang iyong tanong...',
    send: 'Magpadala',
    clear: 'Limasin ang chat',
    close: 'Isara',
    language: 'Wika',
    navQuestion: 'Gusto mo bang mag-navigate papunta roon?',
    navStart: 'Piliin ang panimulang lugar sa mapa para kalkulahin ang ruta.',
    viewMap: 'Tingnan sa mapa',
    navButton: 'Mag-navigate',
    contactHelpDesk: 'Contact Help Desk',
    findHelpDesk: 'Hanapin ang Help Desk',
    noHelpDeskContact: 'Hindi pa naka-configure ang Help Desk contact.',
  },
  ceb: {
    title: 'Campus Assistant',
    greeting: 'Kumusta! Ako ang imong campus assistant. Unsa akong matabang?',
    placeholder: 'Isulat ang iyong pangutana...',
    send: 'Ipadala',
    clear: 'Limpyohan ang chat',
    close: 'Isara',
    language: 'Pinulongan',
    navQuestion: 'Gusto nimo nga mag-navigate padulong didto?',
    navStart: 'Pilia ang sinugdanan sa mapa aron makalkula ang ruta.',
    viewMap: 'Tan-awa sa mapa',
    navButton: 'Mag-navigate',
    contactHelpDesk: 'Contact Help Desk',
    findHelpDesk: 'Pangitaa ang Help Desk',
    noHelpDeskContact: 'Wala pa na-configure ang Help Desk contact.',
  }
};

const messageTranslations = (message) => translations[({ english: 'en', tagalog: 'tl', cebuano: 'ceb' }[message.language] || message.language)] || translations.en;

const detectLanguageClient = (message) => {
  const text = (message || '').toLowerCase();
  if (/\b(asa|ngano|unsa|unsaon|unsang|unsay|kinsa|pila|adto|makaadto|makakuha|didto|dinhi|nako|akong|imong|palihog)\b/.test(text)) return 'ceb';
  if (/\b(saan|saang|paano|ano|anong|sino|nasaan|kumuha|kukuha|mahahanap|makikita|doon|yung|pakisuyo|salamat|opo|po)\b/.test(text)) return 'tl';
  return 'en';
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

const isNoInfoDatabaseReply = (replyText) => /^(no information found\.?|i don['’]t have that info in the campus database\.?|sorry,\s*i\s*can[’']t find that information in the system\.?|sorry\s+i\s+couldnt\s+find\s+that\s+information\.?|sorry\s+i\s+dont\s+have\s+the\s+information\.?|i['’]?m unable to verify\b.*help desk\.?)$/i.test(String(replyText || '').trim());
const REFERRAL_RESPONSE_TYPES = new Set(['HELP_DESK_REFERRAL', 'PARTIAL_INFORMATION', 'NO_MATCH', 'CONFLICTING_INFORMATION']);

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

function ChatBot({ onOpenChange, buildings = [], offices = [], rooms = [], onNavigate, onViewLocation }) {
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
  const [loading, setLoading] = useState(false);
  const [activeMode, setActiveMode] = useState('ask');
  const [faqSearch, setFaqSearch] = useState('');
  const [publicFaqs, setPublicFaqs] = useState([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqError, setFaqError] = useState('');
  const [expandedFaqId, setExpandedFaqId] = useState(null);
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

  useEffect(() => {
    const handleOpenChatbot = () => setIsOpen(true);
    window.addEventListener('alagad:open-chatbot', handleOpenChatbot);
    return () => window.removeEventListener('alagad:open-chatbot', handleOpenChatbot);
  }, [setIsOpen]);

  useEffect(() => {
    if (!isOpen || activeMode !== 'faqs') return;

    let cancelled = false;
    const loadFaqs = async () => {
      setFaqLoading(true);
      setFaqError('');
      try {
        const data = await publicFaqsAPI.getAll();
        if (!cancelled) {
          setPublicFaqs(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          setFaqError(error.message || 'Unable to load verified FAQs.');
        }
      } finally {
        if (!cancelled) {
          setFaqLoading(false);
        }
      }
    };

    loadFaqs();

    return () => {
      cancelled = true;
    };
  }, [activeMode, isOpen]);

  const normalizeFaqText = useCallback((value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim(), []);

  const filteredFaqs = useMemo(() => {
    const query = normalizeFaqText(faqSearch);
    return publicFaqs
      .filter((faq) => {
        if (!query) return true;
        const searchable = normalizeFaqText([
          faq?.name,
          faq?.question,
          faq?.verifiedAnswer,
          faq?.answer,
          faq?.category,
          ...(Array.isArray(faq?.keywords) ? faq.keywords : []),
          ...(Array.isArray(faq?.alternativeQuestions) ? faq.alternativeQuestions : []),
          faq?.office?.name,
          faq?.department?.name,
        ].filter(Boolean).join(' '));
        return searchable.includes(query);
      })
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [faqSearch, normalizeFaqText, publicFaqs]);

  const resolveFaqOffice = useCallback((faq) => {
    const office = faq?.office;
    if (!office) return null;
    const officeId = office._id || office.id;
    const officeName = normalizeFaqText(office.name);
    return offices.find((item) => (
      (officeId && String(item._id || item.id) === String(officeId))
      || (officeName && normalizeFaqText(item.name) === officeName)
    )) || office;
  }, [normalizeFaqText, offices]);

  const handleModeChange = useCallback((mode) => {
    setActiveMode(mode);
    if (mode === 'ask') {
      setExpandedFaqId(null);
    }
  }, []);

  const handleFaqViewOffice = useCallback((faq) => {
    const office = resolveFaqOffice(faq);
    if (!office) return;
    if (onViewLocation) {
      onViewLocation(office, 'office', office.building || faq?.office?.building || null);
      setIsOpen(false);
    }
  }, [onViewLocation, resolveFaqOffice, setIsOpen]);

  const handleFaqNavigateOffice = useCallback((faq) => {
    const office = resolveFaqOffice(faq);
    if (!office) return;
    if (onNavigate) {
      onNavigate(office, office.name || faq?.office?.name || 'Office', office.building || faq?.office?.building || null);
      setIsOpen(false);
    }
  }, [onNavigate, resolveFaqOffice, setIsOpen]);

  const openHelpDeskContact = useCallback((helpDesk) => {
    const contact = helpDesk || {};
    const link = String(contact.officialLink || '').trim();
    const email = String(contact.email || '').trim();
    const phone = String(contact.phone || '').trim();

    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }

    if (email) {
      window.location.href = `mailto:${email}`;
      return;
    }

    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  }, []);

  const findHelpDesk = useCallback((helpDesk) => {
    const officeLocation = String(helpDesk?.officeLocation || '').trim();
    if (!officeLocation || !onNavigate) return;

    const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const targetKey = normalize(officeLocation);
    const candidates = [...offices, ...buildings, ...rooms];
    const target = candidates.find((item) => {
      const itemKey = normalize(item?.name);
      return itemKey && (itemKey === targetKey || itemKey.includes(targetKey) || targetKey.includes(itemKey));
    });

    if (target) {
      onNavigate(target, target.name);
      setIsOpen(false);
    }
  }, [buildings, offices, onNavigate, rooms, setIsOpen]);
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

  const handleSendMessage = useCallback(async (overrideText) => {
    const textToSend = (typeof overrideText === 'string' ? overrideText : inputValue).trim();
    if (!textToSend) return;

    setShouldAutoScroll(true);

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
        null,
        conversationHistory
      );

      const intent = response.intent || 'information';
      const replyText = response.reply || '';
      const rawLocationName = response.location || null;
      const parsedParts = extractServiceParts(replyText);
      const locationName = rawLocationName || parsedParts.locationLabel || null;
      const entityName = String(response.entityName || parsedParts.serviceName || '').trim() || null;
      const responseLanguage = String(response.responseLanguage || '').trim() || detectLanguageClient(replyText);
      const responseLocale = { english: 'en', tagalog: 'tl', cebuano: 'ceb', en: 'en', tl: 'tl', ceb: 'ceb' }[responseLanguage];
      if (responseLocale) setLanguage(responseLocale);
      const responseType = String(response.responseType || response.metadata?.responseType || '').trim();
      const isReferralResponse = REFERRAL_RESPONSE_TYPES.has(responseType);

      const shouldSuppressNavigation = isReferralResponse || isNoInfoDatabaseReply(replyText);
      const navigation = !shouldSuppressNavigation && response.navigation === true;
      const steps = Array.isArray(response.steps) ? response.steps.filter(s => typeof s === 'string' && s.trim()) : [];

      // Try to resolve a navigation target entity (building/office/room) based on the model's location field
      const normalize = (s) => (typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() : '');
      const locKey = normalize(response.navigationTarget?.name || locationName);

      const resolveByName = (items) => {
        if (!Array.isArray(items) || !locKey) return null;

        const exact = items.find((item) => normalize(item?.name) === locKey);
        if (exact) return exact;

        const partial = items.filter((item) => {
          const itemKey = normalize(item?.name);
          return itemKey && (itemKey.includes(locKey) || locKey.includes(itemKey));
        });

        return partial.length === 1 ? partial[0] : null;
      };

      let navigationTargetEntity = null;
      if (response.navigationTarget) {
        const target = response.navigationTarget;
        const items = target.type === 'building' ? buildings : target.type === 'room' ? rooms : offices;
        const matches = items.filter((item) => target.id
          ? String(item._id || item.id) === String(target.id)
          : normalize(item.name) === normalize(target.name));
        navigationTargetEntity = matches.length === 1 ? matches[0] : null;
      } else if (locKey) {
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
        languageStyle: response.language_style || 'single',
        timestamp: new Date(),
        intent,
        locationName,
        entityName,
        navigation,
        steps,
        navigationTargetEntity,
        responseType,
        verificationStatus: response.verificationStatus || response.metadata?.verificationStatus || null,
        helpDesk: response.helpDesk || null,
        faq: response.faq || null,
        relatedFaqs: Array.isArray(response.relatedFaqs) ? response.relatedFaqs : [],
        resources: Array.isArray(response.resources) ? response.resources : [],
        metadata: response.metadata || null,
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
    }
  }, [buildings, inputValue, messages, offices, rooms]);

  // Voice recognition: insert transcript into the text box as the user speaks
  const handleVoiceResult = useCallback((transcript) => {
    const text = (transcript || '').trim();
    if (!text) return;
    setInputValue(text);
  }, []);
  
  const { isListening, isSupported: voiceSupported, startListening, stopListening, setLanguage: setVoiceLang } = useVoiceRecognition(
    handleVoiceResult,
    (error) => console.error('Voice error:', error),
    VOICE_LANG_MAP[language] || 'en-US',
    handleVoiceResult
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
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      const x = Number(parsed?.x);
      const y = Number(parsed?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    } catch { return null; }
  });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false });
  const reduceMotion = useReducedMotion();


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
    const clamped = clampPosition(
      d.startLeft + dx, d.startTop + dy,
      el.offsetWidth, el.offsetHeight
    );
    el.style.left = `${clamped.x}px`;
    el.style.top = `${clamped.y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }, [clampPosition]);

  const handleDragEnd = useCallback(() => {
    const d = dragRef.current;
    if (!d.dragging) return;
    d.dragging = false;
    if (!d.moved) return;
    const el = triggerBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pos = { x: rect.left, y: rect.top };
    // Keep the mascot at the user-selected drop point.
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
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
    window.addEventListener('touchcancel', tu);
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
      window.removeEventListener('touchmove', tm);
      window.removeEventListener('touchend', tu);
      window.removeEventListener('touchcancel', tu);
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
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

  const showSpeechBubble = mascotPhase === 'peek' || mascotPhase === 'float';
  const bubbleOnRight = triggerPos !== null && triggerPos.x < 190;
  const bubbleBelow = isMobileChat || (triggerPos !== null && triggerPos.y < 90);

  return (
    <>
      {/* Mascot trigger — visible when chatbot is closed */}
      {!isOpen && (
        <motion.div
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
                className={`mascot-speech-bubble${bubbleOnRight ? ' mascot-speech-bubble--right' : ''}${bubbleBelow ? ' mascot-speech-bubble--below' : ''}`}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 4, scale: reduceMotion ? 1 : 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
              >
                <strong>Hi there!</strong>
                <span>Looking for something?</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transparent 3D mascot launcher */}
          <div className="chatbot-trigger-container">
            <button
              className="chatbot-trigger"
              onClick={() => { if (!dragRef.current.moved) setIsOpen(true); }}
              title="Open Campus Assistant (drag to move)"
              aria-label="Open Campus Assistant"
            >
              <span className="campus-mascot-flight"><CampusMascot /></span>
          </button>
        </div>


        </motion.div>
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
            <CampusMascot portrait />
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
        <h3><span className="chatbot-header-avatar"><CampusMascot portrait /></span>{t.title}</h3>
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

      <div className="chatbot-mode-switch" role="tablist" aria-label="Chatbot mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'ask'}
          className={`chatbot-mode-btn ${activeMode === 'ask' ? 'active' : ''}`}
          onClick={() => handleModeChange('ask')}
        >
          Ask ALAGAD
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'faqs'}
          className={`chatbot-mode-btn ${activeMode === 'faqs' ? 'active' : ''}`}
          onClick={() => handleModeChange('faqs')}
        >
          FAQs
        </button>
      </div>

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
          {activeMode === 'faqs' ? (
            <div className="chatbot-faq-mode">
              <div className="chatbot-faq-heading">
                <h4>Frequently Asked Questions</h4>
                <p>Browse verified answers created by ALAGAD administrators.</p>
              </div>

              <input
                type="search"
                className="chatbot-faq-search"
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
                placeholder="Search FAQs..."
                aria-label="Search verified FAQs"
              />

              {faqLoading && (
                <div className="chatbot-faq-empty">
                  <strong>Loading verified FAQs...</strong>
                  <span>Please wait while the FAQ list loads.</span>
                </div>
              )}

              {faqError && !faqLoading && (
                <div className="chatbot-faq-empty">
                  <strong>Unable to load FAQs.</strong>
                  <span>{faqError}</span>
                </div>
              )}

              {!faqLoading && !faqError && publicFaqs.length === 0 && (
                <div className="chatbot-faq-empty">
                  <strong>No verified FAQs are currently available.</strong>
                  <span>You can still use Ask ALAGAD for campus assistance.</span>
                  <button type="button" onClick={() => handleModeChange('ask')}>Ask ALAGAD</button>
                </div>
              )}

              {!faqLoading && !faqError && publicFaqs.length > 0 && filteredFaqs.length === 0 && (
                <div className="chatbot-faq-empty">
                  <strong>No matching FAQ found.</strong>
                  <span>Try asking ALAGAD instead.</span>
                  <button type="button" onClick={() => handleModeChange('ask')}>Ask ALAGAD</button>
                </div>
              )}

              {!faqLoading && !faqError && filteredFaqs.length > 0 && (
                <div className="chatbot-faq-list">
                  {filteredFaqs.map((faq) => {
                    const faqId = faq.id || faq._id || faq.name;
                    const expanded = expandedFaqId === faqId;
                    const officeName = String(faq?.office?.name || '').trim();
                    const departmentName = String(faq?.department?.name || faq?.office?.department || '').trim();
                    const office = resolveFaqOffice(faq);
                    const relatedFaqs = Array.isArray(faq.relatedFaqs) ? faq.relatedFaqs : [];
                    const downloadableResources = Array.isArray(faq.downloadableResources)
                      ? faq.downloadableResources
                      : (Array.isArray(faq.resources) ? faq.resources : []);
                    const linkedResources = downloadableResources.filter((resource) => (
                      String(resource?.url || '').trim()
                    ));
                    const responsibleOffice = officeName || departmentName;

                    return (
                      <article className={`chatbot-faq-card ${expanded ? 'open' : ''}`} key={faqId}>
                        <button
                          type="button"
                          className="chatbot-faq-question"
                          aria-expanded={expanded}
                          onClick={() => setExpandedFaqId(expanded ? null : faqId)}
                        >
                          <span>{faq.name}</span>
                          <span aria-hidden="true">{expanded ? '-' : '+'}</span>
                        </button>

                        {expanded && (
                          <div className="chatbot-faq-answer">
                            <div className="chatbot-faq-answer-label">Verified Answer</div>
                            <p>{faq.verifiedAnswer}</p>
                            {relatedFaqs.length > 0 && (
                              <div className="chatbot-knowledge-section">
                                <div className="chatbot-knowledge-title">Related FAQs</div>
                                <div className="chatbot-related-list">
                                  {relatedFaqs.map((relatedFaq) => (
                                    <button
                                      type="button"
                                      className="chatbot-related-question"
                                      key={relatedFaq.id || relatedFaq.question}
                                      onClick={() => setExpandedFaqId(relatedFaq.id || relatedFaq._id || relatedFaq.question)}
                                    >
                                      {relatedFaq.question || relatedFaq.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {linkedResources.length > 0 && (
                              <div className="chatbot-knowledge-section">
                                <div className="chatbot-knowledge-title">Visit link</div>
                                {linkedResources.map((resource) => (
                                  <div className="chatbot-resource-card" key={resource.id || resource.url}>
                                    <div className="chatbot-resource-main">
                                      <strong>{resource.title || resource.name || 'Attached link'}</strong>
                                      {resource.description && <span>{resource.description}</span>}
                                    </div>
                                    <a
                                      className="chatbot-resource-link"
                                      href={resource.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label={`Visit ${resource.title || resource.name || 'attached link'}`}
                                    >
                                      Visit
                                    </a>
                                  </div>
                                ))}
                              </div>
                            )}
                            {responsibleOffice && (
                              <div className="chatbot-knowledge-section">
                                <div className="chatbot-knowledge-title">Responsible Office</div>
                                <div className="chatbot-faq-meta">
                                  <span>{responsibleOffice}</span>
                                </div>
                              </div>
                            )}
                            {(officeName || departmentName) && (
                              <div className="chatbot-faq-meta">
                                {officeName && <span>Office: {officeName}</span>}
                                {departmentName && <span>Department: {departmentName}</span>}
                              </div>
                            )}
                            {officeName && office && (
                              <div className="chatbot-faq-actions">
                                <button
                                  type="button"
                                  className="chatbot-faq-action secondary"
                                  onClick={() => handleFaqViewOffice(faq)}
                                >
                                  View Office
                                </button>
                                <button
                                  type="button"
                                  className="chatbot-faq-action primary"
                                  onClick={() => handleFaqNavigateOffice(faq)}
                                >
                                  Navigate
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.sender} ${message.isError ? 'error' : ''}`}
            >
              <div className="message-content">
                {message.sender === 'bot' && (
                  <span className="bot-avatar">
                  <CampusMascot portrait />
                  </span>
                )}
                <div className="message-text" lang={{ english: 'en', tagalog: 'fil', cebuano: 'ceb', tl: 'fil' }[message.language] || message.language || undefined}>
                {(() => {
                  const rawText = typeof message.text === 'string' ? message.text : '';
                  const text = message.sender === 'bot' ? rawText.replace(/\*\*/g, '"') : rawText;
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
                {(() => {
                  const isAnimatingThisMessage = message.sender === 'bot' && message.id === animatingMessageId;
                  const isResponseFullyShown = !isAnimatingThisMessage || completedBotMessageIds.has(message.id);
                  if (message.sender !== 'bot' || !isResponseFullyShown) return null;

                  const isReferralResponse = REFERRAL_RESPONSE_TYPES.has(String(message.responseType || ''));
                  const helpDesk = message.helpDesk || {};
                  const hasContact = Boolean(helpDesk.officialLink || helpDesk.email || helpDesk.phone);
                  const canFindHelpDesk = Boolean(helpDesk.officeLocation);

                  return (
                    <>
                      {message.faq && Array.isArray(message.resources) && message.resources.length === 0 && (
                        <div className="chatbot-knowledge-section">
                          <div className="chatbot-knowledge-title">Downloadable Forms</div>
                          <div className="chatbot-faq-meta">
                            <span>N/A</span>
                          </div>
                        </div>
                      )}

                      {Array.isArray(message.resources) && message.resources.length > 0 && (
                        <div className="chatbot-knowledge-section">
                          <div className="chatbot-knowledge-title">Downloadable Forms</div>
                          {message.resources.map((resource) => (
                            <div className="chatbot-resource-card" key={resource.id || resource.url}>
                              <div className="chatbot-resource-main">
                                <strong>{resource.title || resource.name}</strong>
                                {resource.description && <span>{resource.description}</span>}
                              </div>
                              <a
                                className="chatbot-resource-link"
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Download ${resource.title || resource.name}`}
                              >
                                {String(resource.type || '').toUpperCase().includes('FORM') ? 'Download Form' : 'Download'}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}

                      {Array.isArray(message.relatedFaqs) && message.relatedFaqs.length > 0 && (
                        <div className="chatbot-knowledge-section">
                          <div className="chatbot-knowledge-title">Related FAQs</div>
                          <div className="chatbot-related-list">
                            {message.relatedFaqs.map((faq) => (
                              <button
                                type="button"
                                className="chatbot-related-question"
                                key={faq.id || faq.question}
                                onClick={() => handleSendMessage(faq.question)}
                              >
                                {faq.question}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {isReferralResponse && (
                        <div className="chatbot-helpdesk-actions">
                          <button
                            type="button"
                            className="chatbot-helpdesk-btn primary"
                            onClick={() => openHelpDeskContact(helpDesk)}
                            disabled={!hasContact}
                            title={hasContact ? t.contactHelpDesk : t.noHelpDeskContact}
                          >
                            {t.contactHelpDesk}
                          </button>
                          {canFindHelpDesk && (
                            <button
                              type="button"
                              className="chatbot-helpdesk-btn secondary"
                              onClick={() => findHelpDesk(helpDesk)}
                              title={t.findHelpDesk}
                            >
                              {t.findHelpDesk}
                            </button>
                          )}
                          {!hasContact && (
                            <span className="chatbot-helpdesk-empty">{t.noHelpDeskContact}</span>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
                {/* Navigation confirmation when AI detects navigation intent */}
                {(() => {
                  const isAnimatingThisMessage = message.sender === 'bot' && message.id === animatingMessageId;
                  const isResponseFullyShown = !isAnimatingThisMessage || completedBotMessageIds.has(message.id);
                  const shouldSuppressNavigation = REFERRAL_RESPONSE_TYPES.has(String(message.responseType || '')) || isNoInfoDatabaseReply(message.text);
                  return message.sender === 'bot' && !shouldSuppressNavigation && message.navigation === true && message.navigationTargetEntity && isResponseFullyShown;
                })() && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#4b5563' }}>
                      {message.intent === 'navigation' ? messageTranslations(message).navStart : messageTranslations(message).navQuestion}
                    </span>
                    {onViewLocation && (
                      <button onClick={() => {
                        const target = message.navigationTargetEntity;
                        const type = rooms.includes(target) ? 'room' : offices.includes(target) ? 'office' : 'building';
                        onViewLocation(target, type, target.building || null);
                        setIsOpen(false);
                      }}>{messageTranslations(message).viewMap}</button>
                    )}
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
                      title={messageTranslations(message).navButton}
                    >
                      <NavigationIcon size={12} />
                      {messageTranslations(message).navButton}
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
                <CampusMascot portrait />
                </span>
                <div className="message-text typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Voice listening indicator */}
      {activeMode === 'ask' && isListening && (
        <div className="chatbot-voice-indicator">
          <div className="chatbot-voice-indicator-dot" />
          <span>Listening...</span>
        </div>
      )}

      {activeMode === 'ask' && (
      <div className="chatbot-input-area">
        <div className="chatbot-input-stack">
          <textarea
            value={inputValue}
            onChange={(e) => {
              const nextValue = e.target.value;
              setInputValue(nextValue);
              const detected = detectLanguageClient(nextValue);
              if (detected && detected !== language) setLanguage(detected);
            }}
            onKeyDown={handleKeyDown}
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
      )}
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}

export default ChatBot;

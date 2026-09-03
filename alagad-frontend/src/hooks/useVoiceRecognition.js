import { useState, useEffect, useRef, useCallback } from 'react';

const useVoiceRecognition = (onResult, onError, language = 'en-US', onInterimResult) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onInterimResultRef = useRef(onInterimResult);
  const finalTranscriptRef = useRef('');

  // Keep refs up to date
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onInterimResultRef.current = onInterimResult;
  }, [onInterimResult]);

  useEffect(() => {
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language;
      
      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim();
          } else {
            interimTranscript += transcript;
          }
        }

        const liveTranscript = `${finalTranscriptRef.current} ${interimTranscript}`.trim();
        if (liveTranscript && onInterimResultRef.current) {
          onInterimResultRef.current(liveTranscript);
        }

        if (finalTranscriptRef.current && !interimTranscript.trim()) {
          setIsListening(false);
          if (onResultRef.current) {
            onResultRef.current(finalTranscriptRef.current);
          }
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        setIsListening(false);
        setError(event.error);
        if (onErrorRef.current) {
          onErrorRef.current(event.error);
        }
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setIsSupported(false);
      setError('Speech recognition not supported in this browser');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition not supported');
      return;
    }
    
    setError(null);
    try {
      finalTranscriptRef.current = '';
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      setError(err.message);
      setIsListening(false);
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const setLanguage = useCallback((newLanguage) => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = newLanguage;
    }
  }, []);

  return {
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    setLanguage
  };
};

export default useVoiceRecognition;

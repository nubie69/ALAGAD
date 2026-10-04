import { useState, useEffect, useRef, useCallback } from 'react';
import { speechAPI } from '../utils/api';
import { VoiceCapture, supportedRecording } from '../utils/voiceCapture';

const useVoiceRecognition = (onResult, language = 'auto', enabled = true) => {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [checking, setChecking] = useState(true);
  const resultRef = useRef(onResult); resultRef.current = onResult;
  const captureRef = useRef(null);
  const mounted = useRef(false);
  const configRequest = useRef(null);

  const checkConfig = useCallback(async () => {
    configRequest.current?.abort();
    const controller = new AbortController(); configRequest.current = controller;
    setChecking(true); setError('');
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      if (!supportedRecording()) throw new Error('Voice input requires HTTPS and a browser with microphone recording support. You can type your question instead.');
      const next = await speechAPI.getConfig(controller.signal);
      if (mounted.current && configRequest.current === controller) {
        setConfig(next);
        if (!next.enabled) setError('Voice input is not configured. You can type your question instead.');
      }
    } catch (err) {
      if (mounted.current && configRequest.current === controller) {
        setConfig(null); setError('Voice input is unavailable. Check your connection and retry, or type your question.');
        if (!supportedRecording()) setError(err.message);
      }
    } finally {
      clearTimeout(timeout);
      if (mounted.current && configRequest.current === controller) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    captureRef.current = new VoiceCapture({ transcribe: speechAPI.transcribe,
      onState: next => { if (mounted.current) setState(next); },
      onError: message => { if (mounted.current) setError(message); },
      onResult: text => { if (mounted.current) resultRef.current(text); },
    });
    checkConfig();
    return () => {
      mounted.current = false; configRequest.current?.abort(); captureRef.current?.cancel();
    };
  }, [checkConfig]);

  const cancelRecording = useCallback(() => captureRef.current?.cancel(), []);
  useEffect(() => { if (!enabled) cancelRecording(); }, [enabled, cancelRecording]);
  const startListening = useCallback(() => {
    if (!enabled || !config?.enabled || checking) return;
    setError(''); captureRef.current?.start(language);
  }, [config, checking, enabled, language]);
  const stopListening = useCallback(() => captureRef.current?.stop(), []);
  const retry = useCallback(() => {
    if (!config?.enabled) checkConfig(); else startListening();
  }, [checkConfig, config, startListening]);
  const isBusy = ['requesting', 'recording', 'processing'].includes(state);
  const isCaptureBusy = useCallback(() => ['requesting', 'recording', 'processing'].includes(captureRef.current?.state), []);
  return { state, error, checking, config, isBusy, isCaptureBusy, isListening: state === 'recording',
    isSupported: Boolean(config?.enabled && supportedRecording()), startListening, stopListening,
    cancelRecording, retry };
};

export default useVoiceRecognition;

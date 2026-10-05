import { useState, useEffect, useRef, useCallback } from 'react';
import { speechAPI } from '../utils/api';
import { VoiceCapture, supportedRecording } from '../utils/voiceCapture';

const useVoiceRecognition = (onResult, language = 'auto', enabled = true) => {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [checking, setChecking] = useState(true);
  const resultRef = useRef(onResult); resultRef.current = onResult;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const captureRef = useRef(null);
  const mounted = useRef(false);
  const configRequest = useRef(null);

  const checkConfig = useCallback(async (showError = false) => {
    configRequest.current?.abort();
    const controller = new AbortController(); configRequest.current = controller;
    setChecking(true); setError('');
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      if (!supportedRecording()) throw new Error('Voice input requires HTTPS and a browser with microphone recording support. You can type your question instead.');
      const next = await speechAPI.getConfig(controller.signal);
      if (mounted.current && configRequest.current === controller) {
        setConfig(next);
        if (!next.enabled && showError) setError('Voice input is temporarily unavailable. Please try again later.');
      }
      return configRequest.current === controller ? next : null;
    } catch (err) {
      if (mounted.current && configRequest.current === controller) {
        setConfig(null);
        if (showError) setError(!supportedRecording() ? err.message
          : 'Voice input is unavailable. Check your connection and retry.');
      }
      return null;
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
  const startListening = useCallback(async () => {
    if (!enabled || checking) return;
    setError('');
    if (!config?.enabled) {
      // Check again only when the user asks to record, keeping setup notices out of chat.
      const next = await checkConfig(true);
      if (mounted.current && enabledRef.current && next?.enabled) captureRef.current?.start(language);
      return;
    }
    captureRef.current?.start(language);
  }, [config, checking, enabled, language, checkConfig]);
  const stopListening = useCallback(() => captureRef.current?.stop(), []);
  const retry = useCallback(() => {
    startListening();
  }, [startListening]);
  const isBusy = ['requesting', 'recording', 'processing'].includes(state);
  const isCaptureBusy = useCallback(() => ['requesting', 'recording', 'processing'].includes(captureRef.current?.state), []);
  return { state, error, checking, config, isBusy, isCaptureBusy, isListening: state === 'recording',
    isSupported: Boolean(config?.enabled && supportedRecording()), startListening, stopListening,
    cancelRecording, retry };
};

export default useVoiceRecognition;

export const recordingErrorMessage = error => ({
  NotAllowedError: 'Microphone permission was denied. Allow microphone access in your browser and try again.',
  SecurityError: 'Microphone access is blocked. Open the chatbot over HTTPS and try again.',
  NotFoundError: 'No microphone was found. Connect a microphone and try again.',
  NotReadableError: 'The microphone is unavailable or in use. Check it and try again.',
  AbortError: 'Recording was interrupted. Please try again.',
}[error?.name] || error?.message || 'Could not start recording. Please try again.');

export const supportedRecording = () => Boolean(window.isSecureContext
  && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

// One owned session at a time. Cancellation invalidates late permission and network results.
export class VoiceCapture {
  constructor({ transcribe, onState, onResult, onError }) {
    Object.assign(this, { transcribe, onState, onResult, onError });
    this.state = 'idle'; this.session = 0;
  }
  setState(state) { this.state = state; this.onState(state); }
  releaseMicrophone() {
    clearTimeout(this.recordTimer); clearInterval(this.meterTimer);
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    this.audioContext?.close().catch(() => {}); this.audioContext = null;
  }
  cancel() {
    this.session += 1;
    this.controller?.abort(); clearTimeout(this.processTimer);
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null; this.recorder.stop();
    }
    this.releaseMicrophone(); this.recorder = null;
    this.setState('stopped');
  }
  fail(message) { this.cancel(); this.setState('error'); this.onError(message); }
  async start(language = 'auto') {
    if (['requesting', 'recording', 'processing'].includes(this.state)) return;
    if (!supportedRecording()) return this.fail('Voice input requires HTTPS and a browser with microphone recording support. You can type your question instead.');
    const session = ++this.session;
    this.setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      if (session !== this.session) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
      const mimeType = candidates.find(type => window.MediaRecorder.isTypeSupported?.(type));
      this.recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const recorder = this.recorder;
      const chunks = []; let bytes = 0;
      this.energyFrames = 0; this.meterAvailable = false;
      // This conservative energy check rejects near-digital silence, not background noise.
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioContext = new AudioContext();
          await this.audioContext.resume();
          if (session !== this.session) return;
          const analyser = this.audioContext.createAnalyser(); analyser.fftSize = 2048;
          this.audioContext.createMediaStreamSource(stream).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          this.meterAvailable = true;
          this.meterTimer = setInterval(() => {
            analyser.getByteTimeDomainData(samples);
            const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
            if (rms > 0.008) this.energyFrames += 1;
          }, 50);
        }
      } catch { this.meterAvailable = false; }
      if (session !== this.session) return;
      recorder.ondataavailable = event => {
        if (session !== this.session || !event.data.size) return;
        chunks.push(event.data); bytes += event.data.size;
        if (bytes > 6 * 1024 * 1024) this.fail('The recording is too large. Please record a shorter question.');
      };
      recorder.onerror = () => { if (session === this.session) this.fail('Recording was interrupted. Please try again.'); };
      recorder.onstop = async () => {
        if (session !== this.session) return;
        this.releaseMicrophone();
        if (!chunks.length || (this.meterAvailable && this.energyFrames < 3)) {
          this.fail('No speech was detected. Move closer to the microphone and try again.'); return;
        }
        const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0].type });
        this.setState('processing');
        this.controller = new AbortController();
        const processTimer = setTimeout(() => this.controller.abort(), 65000);
        this.processTimer = processTimer;
        try {
          const result = await this.transcribe(audio, language, this.controller.signal);
          if (session !== this.session) return;
          if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No speech was recognized. Please try again.');
          this.setState('stopped'); this.onResult(result.text);
        } catch (error) {
          if (session === this.session) this.fail(error.name === 'AbortError'
            ? 'Transcription timed out. Please try again.'
            : error instanceof TypeError ? 'Could not connect for transcription. Check your connection and try again.' : error.message);
        } finally { clearTimeout(processTimer); }
      };
      recorder.start(250);
      this.setState('recording');
      this.recordTimer = setTimeout(() => this.stop(), 45000);
    } catch (error) {
      if (session === this.session) this.fail(recordingErrorMessage(error));
    }
  }
  stop() {
    if (this.state === 'requesting') { this.cancel(); return; }
    if (this.state !== 'recording') return;
    this.setState('processing');
    try { this.recorder.stop(); }
    catch { this.fail('Recording could not be completed. Please try again.'); }
    // Release immediately; onstop finishes collecting the buffered audio.
    this.releaseMicrophone();
  }
}

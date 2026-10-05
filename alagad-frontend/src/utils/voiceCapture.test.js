import { VoiceCapture } from './voiceCapture';

// These tests simulate browser capture. They do not measure speech accuracy.
describe('Voice capture lifecycle', () => {
  let track, stream, capture, transcribe, onResult, onError, instances;
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  beforeEach(() => {
    jest.useFakeTimers(); instances = [];
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    track = { stop: jest.fn() }; stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
      value: { getUserMedia: jest.fn().mockResolvedValue(stream) } });
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type === 'audio/mp4'; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/mp4'; instances.push(this); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['recorded bytes'], { type: this.mimeType }) });
        this.stopped = this.onstop?.();
      }
    };
    window.AudioContext = undefined;
    transcribe = jest.fn().mockResolvedValue({ text: 'Unsa ang requirements para sa enrollment?' });
    onResult = jest.fn(); onError = jest.fn();
    capture = new VoiceCapture({ transcribe, onResult, onError, onState: jest.fn() });
  });
  afterEach(() => { capture.cancel(); jest.clearAllTimers(); jest.useRealTimers(); });
  test('defaults to Auto, supports MP4 capture, releases tracks and leaves original text for review', async () => {
    await capture.start();
    expect(capture.state).toBe('recording');
    capture.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(capture.state).toBe('processing');
    await instances[0].stopped;
    expect(transcribe.mock.calls[0][1]).toBe('auto');
    expect(transcribe.mock.calls[0][0].type).toBe('audio/mp4');
    expect(onResult).toHaveBeenCalledWith('Unsa ang requirements para sa enrollment?');
    expect(capture.state).toBe('stopped');
  });
  test('prevents concurrent recording and duplicate uploads', async () => {
    const first = capture.start(); const second = capture.start(); await Promise.all([first, second]);
    capture.stop(); capture.stop(); await instances[0].stopped;
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
  test('cancels a pending permission request and releases late-arriving tracks', async () => {
    let resolve;
    navigator.mediaDevices.getUserMedia.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = capture.start(); capture.cancel(); resolve(stream); await pending;
    expect(track.stop).toHaveBeenCalled(); expect(instances).toHaveLength(0);
  });
  test('cancellation discards late transcription results', async () => {
    let resolve;
    transcribe.mockImplementation(() => new Promise(done => { resolve = done; }));
    await capture.start(); capture.stop(); capture.cancel();
    resolve({ text: 'Late result' }); await instances[0].stopped;
    expect(onResult).not.toHaveBeenCalled();
  });
  test.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])('reports %s and permits retry', async name => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce({ name });
    await capture.start(); expect(capture.state).toBe('error'); expect(onError).toHaveBeenCalled();
    await capture.start(); expect(capture.state).toBe('recording');
  });
  test('rejects silent audio without uploading it', async () => {
    window.AudioContext = class {
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return { fftSize: 2048, getByteTimeDomainData: samples => samples.fill(128) }; }
    };
    await capture.start(); jest.advanceTimersByTime(500); capture.stop(); await instances[0].stopped;
    expect(transcribe).not.toHaveBeenCalled(); expect(onResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('No speech'));
  });
  test('rejects empty transcription and network failure', async () => {
    transcribe.mockResolvedValueOnce({ text: ' ' });
    await capture.start(); capture.stop(); await instances[0].stopped;
    expect(onResult).not.toHaveBeenCalled(); expect(capture.state).toBe('error');
    transcribe.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await capture.start(); capture.stop(); await instances[1].stopped;
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining('connection'));
  });
  test('reports disconnected microphones and stops capture', async () => {
    await capture.start(); track.onended();
    expect(capture.state).toBe('error'); expect(track.stop).toHaveBeenCalled();
  });
  test('automatically stops long recordings', async () => {
    await capture.start(); jest.advanceTimersByTime(45000); await flush();
    expect(track.stop).toHaveBeenCalled(); expect(transcribe).toHaveBeenCalledTimes(1);
  });
  test('explains unsupported or insecure browsers', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    await capture.start(); expect(onError).toHaveBeenCalledWith(expect.stringContaining('HTTPS'));
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});

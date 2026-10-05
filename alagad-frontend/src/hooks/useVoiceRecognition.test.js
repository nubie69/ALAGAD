import { act, renderHook, waitFor } from '@testing-library/react';
import useVoiceRecognition from './useVoiceRecognition';
import { speechAPI } from '../utils/api';
import { VoiceCapture } from '../utils/voiceCapture';

jest.mock('../utils/api', () => ({ speechAPI: { getConfig: jest.fn(), transcribe: jest.fn() } }));
jest.mock('../utils/voiceCapture', () => ({ supportedRecording: () => true, VoiceCapture: jest.fn() }));

describe('Voice hook automatic language defaults and cleanup', () => {
  let capture;
  beforeEach(() => {
    capture = { state: 'idle', start: jest.fn(), stop: jest.fn(), cancel: jest.fn() };
    VoiceCapture.mockImplementation(() => capture);
    speechAPI.getConfig.mockResolvedValue({ enabled: true, autoDetection: true });
  });
  test('defaults capture to Auto instead of the chatbot display language', async () => {
    const { result } = renderHook(() => useVoiceRecognition(jest.fn()));
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => { await result.current.startListening(); });
    expect(capture.start).toHaveBeenCalledWith('auto');
  });
  test('uses an explicit language only when the user selects it', async () => {
    const { result } = renderHook(() => useVoiceRecognition(jest.fn(), 'ceb'));
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => { await result.current.startListening(); });
    expect(capture.start).toHaveBeenCalledWith('ceb');
  });
  test('cancels recording when closing the voice interface and on unmount', async () => {
    const { result, rerender, unmount } = renderHook(({ enabled }) => useVoiceRecognition(jest.fn(), 'auto', enabled),
      { initialProps: { enabled: true } });
    await waitFor(() => expect(result.current.checking).toBe(false));
    rerender({ enabled: false });
    expect(capture.cancel).toHaveBeenCalledTimes(1);
    unmount(); expect(capture.cancel).toHaveBeenCalledTimes(2);
  });
  test('keeps configuration notices hidden until a user attempts recording', async () => {
    speechAPI.getConfig.mockResolvedValue({ enabled: false, autoDetection: true });
    const { result } = renderHook(() => useVoiceRecognition(jest.fn()));
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.error).toBe('');
    await act(async () => { await result.current.startListening(); });
    expect(result.current.error).toBe('Voice input is temporarily unavailable. Please try again later.');
    expect(capture.start).not.toHaveBeenCalled();
  });
  test('recovers when backend voice configuration becomes available', async () => {
    speechAPI.getConfig.mockResolvedValueOnce({ enabled: false }).mockResolvedValue({ enabled: true, autoDetection: true });
    const { result } = renderHook(() => useVoiceRecognition(jest.fn()));
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => { await result.current.startListening(); });
    expect(capture.start).toHaveBeenCalledWith('auto');
  });
});

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatBot from './ChatBot';
import useVoiceRecognition from '../hooks/useVoiceRecognition';
import { chatAPI } from '../utils/api';

jest.mock('../hooks/useVoiceRecognition');
jest.mock('../utils/api', () => ({ chatAPI: { sendMessage: jest.fn() }, publicFaqsAPI: { getAll: jest.fn() } }));
jest.mock('framer-motion', () => {
  const React = require('react');
  const Div = React.forwardRef(({ initial, animate, exit, transition, whileHover, whileTap, ...props }, ref) => <div ref={ref} {...props} />);
  return { motion: { div: Div }, AnimatePresence: ({ children }) => children, useReducedMotion: () => true };
});

describe('Chatbot voice review and automatic language selection', () => {
  let voice, callback;
  beforeEach(() => {
    localStorage.clear();
    HTMLElement.prototype.scrollTo = jest.fn();
    voice = { state: 'idle', error: '', checking: false, config: { autoDetection: true },
      isBusy: false, isCaptureBusy: () => false, isListening: false, isSupported: true,
      startListening: jest.fn(), stopListening: jest.fn(), cancelRecording: jest.fn(), retry: jest.fn() };
    useVoiceRecognition.mockImplementation(onResult => { callback = onResult; return voice; });
    chatAPI.sendMessage.mockReset(); chatAPI.sendMessage.mockResolvedValue({ reply: 'Sample response' });
  });
  const open = () => fireEvent(window, new Event('alagad:open-chatbot'));
  test.each([390, 1280])('keeps automatic detection invisible at viewport %s', width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    render(<ChatBot />); open();
    expect(screen.queryByRole('combobox', { name: 'Spoken language' })).not.toBeInTheDocument();
    expect(screen.queryByText('Auto detect')).not.toBeInTheDocument();
    expect(screen.queryByText(/Recording stopped|not configured/)).not.toBeInTheDocument();
    expect(useVoiceRecognition).toHaveBeenLastCalledWith(expect.any(Function), 'auto', true);
  });
  test('changing typed-message language does not force voice to use that language', () => {
    render(<ChatBot />); open();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Saan ang registrar?' } });
    expect(screen.queryByRole('combobox', { name: 'Spoken language' })).not.toBeInTheDocument();
    expect(useVoiceRecognition).toHaveBeenLastCalledWith(expect.any(Function), 'auto', true);
  });
  test('shows no idle voice banner after stopping or while unavailable', () => {
    voice.state = 'stopped'; voice.isSupported = false;
    render(<ChatBot />); open();
    expect(screen.queryByText(/Recording stopped|Review the text|Spoken language|Auto detect|not configured/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record a question' })).toBeEnabled();
  });
  test('allows editing a mixed-language transcript and only submits through the existing Send action', async () => {
    render(<ChatBot />); open();
    act(() => callback('Unsa ang requirements para sa enrollment?'));
    expect(screen.getByRole('textbox')).toHaveValue('Unsa ang requirements para sa enrollment?');
    expect(chatAPI.sendMessage).not.toHaveBeenCalled();
    const edited = 'Unsa ang requirements para sa enrollment sa BukSU?';
    fireEvent.change(screen.getByRole('textbox'), { target: { value: edited } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(chatAPI.sendMessage).toHaveBeenCalledTimes(1));
    expect(chatAPI.sendMessage.mock.calls[0][0]).toBe(edited);
  });
  test('prevents sends while recording or processing', () => {
    voice.isBusy = true; voice.state = 'processing'; voice.isCaptureBusy = () => true;
    render(<ChatBot />); open();
    act(() => callback('Existing question'));
    expect(screen.getByRole('textbox')).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(chatAPI.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
  test('provides an explicit retry action for microphone errors', () => {
    voice.error = 'Microphone permission was denied.';
    render(<ChatBot />); open();
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone permission was denied.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(voice.retry).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid="send-button"
    >
      {props.children}
    </button>
  ),
}));

// Mock tabler icons
jest.mock('lucide-react', () => ({
  Send: () => <span data-testid="icon-send">Send</span>,
}));

import { ChatInput } from '../ChatInput';

describe('ChatInput', () => {
  it('renders the textarea input', () => {
    render(<ChatInput onSend={jest.fn()} />);
    
    const textarea = screen.getByPlaceholderText('Ask anything…');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('renders with custom placeholder', () => {
    render(<ChatInput onSend={jest.fn()} placeholder="Type here..." />);
    expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
  });

  it('submits on Enter key', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    fireEvent.change(textarea, { target: { value: 'Hello world' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('Hello world');
  });

  it('does not submit on Shift+Enter (newline)', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    fireEvent.change(textarea, { target: { value: 'line 1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not submit empty messages', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not submit whitespace-only messages', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables textarea and button when disabled prop is true', () => {
    render(<ChatInput onSend={jest.fn()} disabled={true} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    expect(textarea).toBeDisabled();

    const button = screen.getByTestId('send-button');
    expect(button).toBeDisabled();
  });

  it('clears input after successful submit', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('test message');
    expect(textarea.value).toBe('');
  });

  it('submits on button click', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    fireEvent.change(textarea, { target: { value: 'click send' } });

    const button = screen.getByTestId('send-button');
    fireEvent.click(button);

    expect(onSend).toHaveBeenCalledWith('click send');
  });

  it('send button is disabled when input is empty', () => {
    render(<ChatInput onSend={jest.fn()} />);

    const button = screen.getByTestId('send-button');
    expect(button).toBeDisabled();
  });

  it('trims whitespace before sending', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Ask anything…');
    fireEvent.change(textarea, { target: { value: '  hello  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('hello');
  });
});

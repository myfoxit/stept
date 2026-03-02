import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock all tabler icons used
jest.mock('lucide-react', () => ({
  Wrench: (props: any) => <span data-testid="icon-tool" className={props.className}>Tool</span>,
  Check: (props: any) => <span data-testid="icon-check" className={props.className}>Check</span>,
  X: (props: any) => <span data-testid="icon-x" className={props.className}>X</span>,
  Loader2: (props: any) => <span data-testid="icon-loader" className={props.className}>Loading</span>,
  File: (props: any) => <span data-testid="icon-file" className={props.className}>File</span>,
  Folder: (props: any) => <span data-testid="icon-folder" className={props.className}>Folder</span>,
  Pencil: (props: any) => <span data-testid="icon-edit" className={props.className}>Edit</span>,
  GitMerge: (props: any) => <span data-testid="icon-merge" className={props.className}>Merge</span>,
  BarChart3: (props: any) => <span data-testid="icon-chart" className={props.className}>Chart</span>,
  List: (props: any) => <span data-testid="icon-list" className={props.className}>List</span>,
  Search: (props: any) => <span data-testid="icon-search" className={props.className}>Search</span>,
}));

import { ChatMessage } from '../ChatMessage';

describe('ChatMessage', () => {
  it('renders a user message', () => {
    render(
      <ChatMessage
        message={{
          role: 'user',
          content: 'Hello, how are you?',
        }}
      />
    );

    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
  });

  it('renders an assistant message', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'I am doing well, thank you!',
        }}
      />
    );

    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
  });

  it('renders markdown-like bold text', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'This is **bold** text',
        }}
      />
    );

    expect(screen.getByText('bold')).toBeInTheDocument();
    // The bold text should be wrapped in <strong>
    const strong = screen.getByText('bold');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders inline code', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'Use the `command` to run it',
        }}
      />
    );

    expect(screen.getByText('command')).toBeInTheDocument();
    const code = screen.getByText('command');
    expect(code.tagName).toBe('CODE');
  });

  it('renders code blocks', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: '```\nconsole.log("hello")\n```',
        }}
      />
    );

    expect(screen.getByText('console.log("hello")')).toBeInTheDocument();
  });

  it('shows blinking cursor when streaming (no content, no tools)', () => {
    const { container } = render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: '',
        }}
      />
    );

    // The blinking cursor is a span with animate-pulse class
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).toBeInTheDocument();
  });

  it('does not show cursor when there is content', () => {
    const { container } = render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'Some text',
        }}
      />
    );

    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).not.toBeInTheDocument();
  });

  it('renders tool call cards', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tc-1',
              name: 'create_folder',
              arguments: '{"name": "Reports"}',
              status: 'completed',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Creating folder')).toBeInTheDocument();
  });

  it('renders tool call in executing state', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tc-1',
              name: 'list_workflows',
              arguments: '{}',
              status: 'executing',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Listing workflows')).toBeInTheDocument();
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
  });

  it('renders tool results', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'Here are the results.',
          tool_results: [
            {
              tool_call_id: 'tc-1',
              result: { success: true, message: 'Folder created successfully' },
              status: 'completed',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Folder created successfully')).toBeInTheDocument();
    expect(screen.getByText('Here are the results.')).toBeInTheDocument();
  });

  it('renders tool result errors', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: '',
          tool_results: [
            {
              tool_call_id: 'tc-1',
              result: { error: 'Something went wrong' },
              status: 'error',
            },
          ],
        }}
      />
    );

    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it('renders user message with correct styling alignment', () => {
    const { container } = render(
      <ChatMessage
        message={{
          role: 'user',
          content: 'User message',
        }}
      />
    );

    // User messages should be right-aligned (justify-end)
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-end');
  });

  it('renders assistant message with correct styling alignment', () => {
    const { container } = render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'Assistant message',
        }}
      />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('justify-start');
  });

  it('renders multiline content with line breaks', () => {
    const { container } = render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'Line 1\nLine 2\nLine 3',
        }}
      />
    );

    // Text is in a single span but separated by <br> elements
    const textContent = container.textContent;
    expect(textContent).toContain('Line 1');
    expect(textContent).toContain('Line 2');
    expect(textContent).toContain('Line 3');
    // Check that <br> elements exist for line breaks
    const brs = container.querySelectorAll('br');
    expect(brs.length).toBe(2);
  });
});

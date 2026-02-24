/**
 * AI command definitions for the slash menu.
 */

import type { AICommand } from '@/api/inlineAI';

export interface AICommandDef {
  title: string;
  command: AICommand;
  description: string;
  /** Whether this command needs user prompt input */
  needsPrompt: boolean;
  /** Whether this command operates on selected/surrounding text */
  needsContext: boolean;
}

export const AI_COMMANDS: AICommandDef[] = [
  {
    title: 'AI Write',
    command: 'write',
    description: 'Generate text from a prompt',
    needsPrompt: true,
    needsContext: false,
  },
  {
    title: 'AI Summarize',
    command: 'summarize',
    description: 'Summarize text',
    needsPrompt: false,
    needsContext: true,
  },
  {
    title: 'AI Improve',
    command: 'improve',
    description: 'Rewrite text to be clearer',
    needsPrompt: false,
    needsContext: true,
  },
  {
    title: 'AI Expand',
    command: 'expand',
    description: 'Expand with more detail',
    needsPrompt: false,
    needsContext: true,
  },
  {
    title: 'AI Simplify',
    command: 'simplify',
    description: 'Simplify text',
    needsPrompt: false,
    needsContext: true,
  },
  {
    title: 'AI Translate',
    command: 'translate',
    description: 'Translate text',
    needsPrompt: false,
    needsContext: true,
  },
  {
    title: 'AI Explain',
    command: 'explain',
    description: 'Explain a concept',
    needsPrompt: false,
    needsContext: true,
  },
];

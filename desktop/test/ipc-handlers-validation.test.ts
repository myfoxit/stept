import { describe, expect, it } from 'vitest';

import {
  validateBounds,
  validateCaptureArea,
  validateChatMessages,
  validateExternalUrl,
  validateId,
  validateSettingsUpdate,
} from '../src/main/ipc-validation';

describe('ipc handler validation helpers', () => {
  describe('validateCaptureArea', () => {
    it('accepts single-display payloads with valid bounds', () => {
      expect(() => validateCaptureArea({
        type: 'single-display',
        displayId: '697341',
        displayName: 'Studio Display',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      })).not.toThrow();
    });

    it('rejects unknown capture area types', () => {
      expect(() => validateCaptureArea({ type: 'tab' })).toThrow(
        'captureArea.type must be all-displays, single-display, or window',
      );
    });

    it('rejects invalid window handles', () => {
      expect(() => validateCaptureArea({ type: 'window', windowHandle: '1234' })).toThrow(
        'captureArea.windowHandle must be a finite number',
      );
    });
  });

  describe('validateBounds', () => {
    it('rejects zero-sized rectangles', () => {
      expect(() => validateBounds({ x: 0, y: 0, width: 0, height: 1080 })).toThrow(
        'bounds width/height must be positive',
      );
    });

    it('rejects absurdly large rectangles', () => {
      expect(() => validateBounds({ x: 0, y: 0, width: 30000, height: 1080 })).toThrow(
        'bounds dimensions exceed maximum',
      );
    });
  });

  describe('validateSettingsUpdate', () => {
    it('accepts known settings keys with matching types', () => {
      expect(() => validateSettingsUpdate({
        cloudEndpoint: 'https://api.stept.ai/api/v1',
        minimizeOnRecord: true,
        recordingShortcut: 'Ctrl+Shift+R',
        audioEnabled: false,
      })).not.toThrow();
    });

    it('rejects unexpected settings keys', () => {
      expect(() => validateSettingsUpdate({ hiddenDangerMode: true })).toThrow(
        'Unknown settings key: hiddenDangerMode',
      );
    });
  });

  describe('validateChatMessages', () => {
    it('accepts a bounded renderer chat payload', () => {
      expect(() => validateChatMessages([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Summarize the release notes.' },
      ])).not.toThrow();
    });

    it('rejects empty message arrays', () => {
      expect(() => validateChatMessages([])).toThrow('messages must not be empty');
    });

    it('rejects invalid roles', () => {
      expect(() => validateChatMessages([{ role: 'tool', content: 'hi' }])).toThrow(
        'message.role must be system, user, or assistant',
      );
    });
  });

  describe('validateExternalUrl', () => {
    it('allows https and mailto links', () => {
      expect(() => validateExternalUrl('https://stept.ai/docs')).not.toThrow();
      expect(() => validateExternalUrl('mailto:hello@stept.ai')).not.toThrow();
    });

    it('blocks file and javascript protocols', () => {
      expect(() => validateExternalUrl('file:///tmp/secrets.txt')).toThrow(
        'Protocol file: is not allowed. Only https: and mailto: are permitted.',
      );
      expect(() => validateExternalUrl('javascript:alert(1)')).toThrow(
        'Protocol javascript: is not allowed. Only https: and mailto: are permitted.',
      );
    });
  });

  describe('validateId', () => {
    it('accepts compact workflow ids and rejects traversal-ish ids', () => {
      expect(() => validateId('workflow_123-abc', 'resourceId')).not.toThrow();
      expect(() => validateId('../etc/passwd', 'resourceId')).toThrow(
        'resourceId must be alphanumeric (with hyphens/underscores), max 128 chars',
      );
    });
  });
});

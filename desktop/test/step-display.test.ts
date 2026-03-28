import { describe, expect, it } from 'vitest';

import { getStepSubtitle, getStepTitle, isAiAnnotated } from '../src/renderer/utils/stepDisplay';

describe('stepDisplay utilities', () => {
  describe('getStepTitle', () => {
    it('prefers AI generated titles when present', () => {
      expect(getStepTitle({ isAnnotated: true, generatedTitle: 'Open the billing tab', actionType: 'Left Click' })).toBe(
        'Open the billing tab'
      );
    });

    it('formats typed text and truncates long values', () => {
      expect(
        getStepTitle({
          actionType: 'Type',
          textTyped: 'this is a deliberately long string that should be truncated in the title',
        })
      ).toBe('Type "this is a deliberately long string that …"');
    });

    it('formats right click and double click actions with element names', () => {
      expect(getStepTitle({ actionType: 'Right Click', elementName: 'Project menu', elementRole: 'AXButton' })).toBe(
        'Right-click "Project menu"'
      );
      expect(getStepTitle({ actionType: 'Double Click', elementName: 'Quarterly report', elementRole: 'AXRow' })).toBe(
        'Double Click "Quarterly report"'
      );
    });

    it('falls back to cleaned window titles when element metadata is noisy', () => {
      expect(
        getStepTitle({
          actionType: 'Left Click',
          elementName: 'Group',
          elementRole: 'AXGroup',
          windowTitle: 'Settings - Google Chrome',
        })
      ).toBe('Click in Settings');
    });

    it('uses meaningful roles when there is no element name', () => {
      expect(getStepTitle({ actionType: 'Left Click', elementRole: 'AXButton' })).toBe('Click Button');
    });

    it('describes scroll direction from delta', () => {
      expect(getStepTitle({ actionType: 'Scroll', scrollDelta: 25 })).toBe('Scroll down');
      expect(getStepTitle({ actionType: 'Scroll', scrollDelta: -10 })).toBe('Scroll up');
    });
  });

  describe('getStepSubtitle', () => {
    it('uses short app names and cleaned window titles together', () => {
      expect(
        getStepSubtitle({
          ownerApp: 'Google Chrome',
          windowTitle: 'Release checklist - Google Chrome',
        })
      ).toBe('Chrome — Release checklist');
    });

    it('keeps both app and window title when the raw window label differs from the mapped app name', () => {
      expect(
        getStepSubtitle({
          ownerApp: 'System Settings',
          windowTitle: 'System Settings',
        })
      ).toBe('Settings — System Settings');
    });

    it('returns the raw window title when nothing else is available', () => {
      expect(getStepSubtitle({ windowTitle: 'Unknown host app dialog' })).toBe('Unknown host app dialog');
    });
  });

  describe('isAiAnnotated', () => {
    it('requires both the flag and generated title', () => {
      expect(isAiAnnotated({ isAnnotated: true, generatedTitle: 'Rename the document' })).toBe(true);
      expect(isAiAnnotated({ isAnnotated: true, generatedTitle: '' })).toBe(false);
      expect(isAiAnnotated({ isAnnotated: false, generatedTitle: 'Rename the document' })).toBe(false);
    });
  });
});

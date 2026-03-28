
import {
  getCharForKeycode,
  getNamedKey,
  isModifierKey,
  isFlushKey,
  isF9,
  classifyKeyEvent,
  TypeAccumulator,
  buildShortcutCombo,
  Platform,
} from '../src/main/recording-utils';

// =====================================================================
// macOS CGKeyCode → character
// =====================================================================

describe('macOS keycode → character', () => {
  const p: Platform = 'darwin';

  it.each([
    [0, 'a'], [1, 's'], [2, 'd'], [3, 'f'], [4, 'h'], [5, 'g'],
    [6, 'z'], [7, 'x'], [8, 'c'], [9, 'v'], [11, 'b'],
    [12, 'q'], [13, 'w'], [14, 'e'], [15, 'r'],
    [16, 'y'], [17, 't'],
    [31, 'o'], [34, 'i'], [35, 'p'],
    [37, 'l'], [38, 'j'], [40, 'k'],
    [45, 'n'], [46, 'm'],
    [49, ' '],
  ])('keycode %i → %s', (keycode, expected) => {
    expect(getCharForKeycode(keycode, p)).toBe(expected);
  });

  it.each([
    [18, '1'], [19, '2'], [20, '3'], [21, '4'], [23, '5'],
    [22, '6'], [26, '7'], [28, '8'], [25, '9'], [29, '0'],
  ])('number keycode %i → %s', (keycode, expected) => {
    expect(getCharForKeycode(keycode, p)).toBe(expected);
  });

  it.each([
    [24, '='], [27, '-'], [30, ']'], [33, '['],
    [39, "'"], [41, ';'], [42, '\\'], [43, ','], [44, '/'],
    [47, '.'], [50, '`'],
  ])('punctuation keycode %i → %s', (keycode, expected) => {
    expect(getCharForKeycode(keycode, p)).toBe(expected);
  });

  it('unknown keycode returns empty string', () => {
    expect(getCharForKeycode(999, p)).toBe('');
  });

  it('every printable ASCII char is mapped', () => {
    const allChars = new Set<string>();
    for (let kc = 0; kc < 128; kc++) {
      const c = getCharForKeycode(kc, p);
      if (c) allChars.add(c);
    }
    // Full lowercase alphabet
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      expect(allChars.has(c)).toBe(true);
    }
    // Digits
    for (const c of '0123456789') {
      expect(allChars.has(c)).toBe(true);
    }
    // Space
    expect(allChars.has(' ')).toBe(true);
  });
});

// =====================================================================
// macOS named keys
// =====================================================================

describe('macOS named keys', () => {
  const p: Platform = 'darwin';

  it.each([
    [36, 'Enter'], [48, 'Tab'], [51, 'Backspace'], [53, 'Escape'],
    [117, 'Delete'], [115, 'Home'], [119, 'End'],
    [116, 'PageUp'], [121, 'PageDown'],
    [123, 'Left'], [124, 'Right'], [125, 'Down'], [126, 'Up'],
  ])('keycode %i → %s', (keycode, expected) => {
    expect(getNamedKey(keycode, p)).toBe(expected);
  });

  it.each([
    [122, 'F1'], [120, 'F2'], [99, 'F3'], [118, 'F4'],
    [96, 'F5'], [97, 'F6'], [98, 'F7'], [100, 'F8'],
    [101, 'F9'], [109, 'F10'], [103, 'F11'], [111, 'F12'],
  ])('function key %i → %s', (keycode, expected) => {
    expect(getNamedKey(keycode, p)).toBe(expected);
  });
});

// =====================================================================
// Windows VK → character
// =====================================================================

describe('Windows VK → character', () => {
  const p: Platform = 'win32';

  it('maps VK_A through VK_Z', () => {
    for (let i = 0; i < 26; i++) {
      const vk = 0x41 + i;
      const expected = String.fromCharCode(97 + i); // lowercase
      expect(getCharForKeycode(vk, p)).toBe(expected);
    }
  });

  it('maps VK_0 through VK_9', () => {
    for (let i = 0; i < 10; i++) {
      expect(getCharForKeycode(0x30 + i, p)).toBe(String(i));
    }
  });

  it.each([
    [0xBA, ';'], [0xBB, '='], [0xBC, ','], [0xBD, '-'],
    [0xBE, '.'], [0xBF, '/'], [0xC0, '`'],
    [0xDB, '['], [0xDC, '\\'], [0xDD, ']'], [0xDE, "'"],
    [0x20, ' '],
  ])('VK 0x%x → %s', (vk, expected) => {
    expect(getCharForKeycode(vk, p)).toBe(expected);
  });
});

// =====================================================================
// Windows named keys
// =====================================================================

describe('Windows named keys', () => {
  const p: Platform = 'win32';

  it.each([
    [0x08, 'Backspace'], [0x09, 'Tab'], [0x0D, 'Enter'], [0x1B, 'Escape'],
    [0x2E, 'Delete'], [0x2D, 'Insert'], [0x24, 'Home'], [0x23, 'End'],
    [0x21, 'PageUp'], [0x22, 'PageDown'],
    [0x25, 'Left'], [0x26, 'Up'], [0x27, 'Right'], [0x28, 'Down'],
    [0x2C, 'PrintScreen'], [0x13, 'Pause'],
  ])('VK 0x%x → %s', (vk, expected) => {
    expect(getNamedKey(vk, p)).toBe(expected);
  });

  it('maps F1–F12', () => {
    const expected = ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
    for (let i = 0; i < 12; i++) {
      expect(getNamedKey(0x70 + i, p)).toBe(expected[i]);
    }
  });
});

// =====================================================================
// Modifier key detection
// =====================================================================

describe('isModifierKey', () => {
  it('macOS modifiers', () => {
    for (const kc of [54, 55, 56, 57, 58, 59, 60, 61, 62, 63]) {
      expect(isModifierKey(kc, 'darwin')).toBe(true);
    }
    expect(isModifierKey(0, 'darwin')).toBe(false); // 'a' is not a modifier
  });

  it('Windows modifiers', () => {
    // VK_SHIFT=0x10, VK_CONTROL=0x11, VK_MENU=0x12, VK_LWIN=0x5B, VK_RWIN=0x5C, CapsLock=0x14
    for (const vk of [0x10, 0x11, 0x12, 0x5B, 0x5C, 0x14]) {
      expect(isModifierKey(vk, 'win32')).toBe(true);
    }
    // Left/Right specific
    for (const vk of [0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5]) {
      expect(isModifierKey(vk, 'win32')).toBe(true);
    }
    expect(isModifierKey(0x41, 'win32')).toBe(false); // 'A' is not a modifier
  });
});

// =====================================================================
// Flush key detection
// =====================================================================

describe('isFlushKey', () => {
  it('macOS: Enter, Tab, Escape flush', () => {
    expect(isFlushKey(36, 'darwin')).toBe(true);  // Enter
    expect(isFlushKey(48, 'darwin')).toBe(true);  // Tab
    expect(isFlushKey(53, 'darwin')).toBe(true);  // Escape
    expect(isFlushKey(0, 'darwin')).toBe(false);  // 'a'
  });

  it('Windows: Enter, Tab, Escape flush', () => {
    expect(isFlushKey(0x0D, 'win32')).toBe(true);  // Enter
    expect(isFlushKey(0x09, 'win32')).toBe(true);  // Tab
    expect(isFlushKey(0x1B, 'win32')).toBe(true);  // Escape
    expect(isFlushKey(0x41, 'win32')).toBe(false);  // 'A'
  });
});

// =====================================================================
// F9 toggle detection
// =====================================================================

describe('isF9', () => {
  it('macOS F9 = CGKeyCode 101', () => {
    expect(isF9(101, 'darwin')).toBe(true);
    expect(isF9(100, 'darwin')).toBe(false);
  });

  it('Windows F9 = VK_F9 = 0x78', () => {
    expect(isF9(0x78, 'win32')).toBe(true);
    expect(isF9(0x77, 'win32')).toBe(false);
  });
});

// =====================================================================
// classifyKeyEvent — the big one
// =====================================================================

describe('classifyKeyEvent', () => {
  describe('macOS', () => {
    const p: Platform = 'darwin';

    it('F9 → toggle-pause', () => {
      expect(classifyKeyEvent({ keycode: 101, modifiers: [] }, p)).toEqual({ type: 'toggle-pause' });
    });

    it('pure modifier press → ignore', () => {
      // Command key (55)
      expect(classifyKeyEvent({ keycode: 55, modifiers: [] }, p)).toEqual({ type: 'ignore' });
      // Shift (56)
      expect(classifyKeyEvent({ keycode: 56, modifiers: [] }, p)).toEqual({ type: 'ignore' });
    });

    it('Enter → flush', () => {
      expect(classifyKeyEvent({ keycode: 36, modifiers: [] }, p)).toEqual({ type: 'flush' });
    });

    it('Tab → flush', () => {
      expect(classifyKeyEvent({ keycode: 48, modifiers: [] }, p)).toEqual({ type: 'flush' });
    });

    it('Escape → flush', () => {
      expect(classifyKeyEvent({ keycode: 53, modifiers: [] }, p)).toEqual({ type: 'flush' });
    });

    it('Cmd+C → shortcut', () => {
      const result = classifyKeyEvent({ keycode: 8, modifiers: ['meta'] }, p); // 8 = 'c'
      expect(result).toEqual({ type: 'shortcut', combo: 'Cmd+C' });
    });

    it('Cmd+Shift+S → shortcut with multiple modifiers', () => {
      const result = classifyKeyEvent({ keycode: 1, modifiers: ['meta', 'shift'] }, p); // 1 = 's'
      expect(result).toEqual({ type: 'shortcut', combo: 'Cmd+Shift+S' });
    });

    it('Ctrl+A → shortcut', () => {
      const result = classifyKeyEvent({ keycode: 0, modifiers: ['ctrl'] }, p); // 0 = 'a'
      expect(result).toEqual({ type: 'shortcut', combo: 'Ctrl+A' });
    });

    it('Option+letter → shortcut', () => {
      const result = classifyKeyEvent({ keycode: 14, modifiers: ['alt'] }, p); // 14 = 'e'
      expect(result).toEqual({ type: 'shortcut', combo: 'Option+E' });
    });

    it('regular letter → char', () => {
      expect(classifyKeyEvent({ keycode: 0, modifiers: [] }, p)).toEqual({ type: 'char', char: 'a' });
      expect(classifyKeyEvent({ keycode: 49, modifiers: [] }, p)).toEqual({ type: 'char', char: ' ' });
    });

    it('number → char', () => {
      expect(classifyKeyEvent({ keycode: 18, modifiers: [] }, p)).toEqual({ type: 'char', char: '1' });
    });

    it('punctuation → char', () => {
      expect(classifyKeyEvent({ keycode: 43, modifiers: [] }, p)).toEqual({ type: 'char', char: ',' });
    });

    it('Backspace (51) → backspace', () => {
      expect(classifyKeyEvent({ keycode: 51, modifiers: [] }, p)).toEqual({ type: 'backspace' });
    });

    it('Delete (117) → named-key', () => {
      expect(classifyKeyEvent({ keycode: 117, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Delete' });
    });

    it('arrow keys → named-key', () => {
      expect(classifyKeyEvent({ keycode: 123, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Left' });
      expect(classifyKeyEvent({ keycode: 124, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Right' });
      expect(classifyKeyEvent({ keycode: 125, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Down' });
      expect(classifyKeyEvent({ keycode: 126, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Up' });
    });

    it('F1–F12 → named-key (except F9)', () => {
      expect(classifyKeyEvent({ keycode: 122, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'F1' });
      expect(classifyKeyEvent({ keycode: 111, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'F12' });
    });

    it('Home/End/PageUp/PageDown → named-key', () => {
      expect(classifyKeyEvent({ keycode: 115, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Home' });
      expect(classifyKeyEvent({ keycode: 119, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'End' });
      expect(classifyKeyEvent({ keycode: 116, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'PageUp' });
      expect(classifyKeyEvent({ keycode: 121, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'PageDown' });
    });

    it('unknown keycode → ignore', () => {
      expect(classifyKeyEvent({ keycode: 999, modifiers: [] }, p)).toEqual({ type: 'ignore' });
    });

    it('Cmd+unknown → ignore', () => {
      expect(classifyKeyEvent({ keycode: 999, modifiers: ['meta'] }, p)).toEqual({ type: 'ignore' });
    });

    it('shift alone does NOT make a shortcut — shift is a modifier key', () => {
      expect(classifyKeyEvent({ keycode: 56, modifiers: ['shift'] }, p)).toEqual({ type: 'ignore' });
    });
  });

  describe('Windows', () => {
    const p: Platform = 'win32';

    it('F9 (0x78) → toggle-pause', () => {
      expect(classifyKeyEvent({ keycode: 0x78, modifiers: [] }, p)).toEqual({ type: 'toggle-pause' });
    });

    it('pure modifier press → ignore', () => {
      expect(classifyKeyEvent({ keycode: 0x11, modifiers: [] }, p)).toEqual({ type: 'ignore' }); // Ctrl
      expect(classifyKeyEvent({ keycode: 0x10, modifiers: [] }, p)).toEqual({ type: 'ignore' }); // Shift
      expect(classifyKeyEvent({ keycode: 0x12, modifiers: [] }, p)).toEqual({ type: 'ignore' }); // Alt
      expect(classifyKeyEvent({ keycode: 0x5B, modifiers: [] }, p)).toEqual({ type: 'ignore' }); // LWin
      expect(classifyKeyEvent({ keycode: 0x14, modifiers: [] }, p)).toEqual({ type: 'ignore' }); // CapsLock
    });

    it('Enter (0x0D) → flush', () => {
      expect(classifyKeyEvent({ keycode: 0x0D, modifiers: [] }, p)).toEqual({ type: 'flush' });
    });

    it('Tab → flush', () => {
      expect(classifyKeyEvent({ keycode: 0x09, modifiers: [] }, p)).toEqual({ type: 'flush' });
    });

    it('Ctrl+C → shortcut', () => {
      const result = classifyKeyEvent({ keycode: 0x43, modifiers: ['ctrl'] }, p);
      expect(result).toEqual({ type: 'shortcut', combo: 'Ctrl+C' });
    });

    it('Ctrl+Shift+S → shortcut', () => {
      const result = classifyKeyEvent({ keycode: 0x53, modifiers: ['ctrl', 'shift'] }, p);
      expect(result).toEqual({ type: 'shortcut', combo: 'Ctrl+Shift+S' });
    });

    it('Alt+F4 → shortcut with named key', () => {
      const result = classifyKeyEvent({ keycode: 0x73, modifiers: ['alt'] }, p);
      expect(result).toEqual({ type: 'shortcut', combo: 'Alt+F4' });
    });

    it('Win+D → shortcut', () => {
      const result = classifyKeyEvent({ keycode: 0x44, modifiers: ['meta'] }, p);
      expect(result).toEqual({ type: 'shortcut', combo: 'Win+D' });
    });

    it('regular letter → char', () => {
      expect(classifyKeyEvent({ keycode: 0x41, modifiers: [] }, p)).toEqual({ type: 'char', char: 'a' });
      expect(classifyKeyEvent({ keycode: 0x5A, modifiers: [] }, p)).toEqual({ type: 'char', char: 'z' });
    });

    it('space → char', () => {
      expect(classifyKeyEvent({ keycode: 0x20, modifiers: [] }, p)).toEqual({ type: 'char', char: ' ' });
    });

    it('Backspace (0x08) → backspace', () => {
      expect(classifyKeyEvent({ keycode: 0x08, modifiers: [] }, p)).toEqual({ type: 'backspace' });
    });

    it('Delete → named-key', () => {
      expect(classifyKeyEvent({ keycode: 0x2E, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Delete' });
    });

    it('arrows → named-key', () => {
      expect(classifyKeyEvent({ keycode: 0x25, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Left' });
      expect(classifyKeyEvent({ keycode: 0x26, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Up' });
      expect(classifyKeyEvent({ keycode: 0x27, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Right' });
      expect(classifyKeyEvent({ keycode: 0x28, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Down' });
    });

    it('Insert → named-key', () => {
      expect(classifyKeyEvent({ keycode: 0x2D, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'Insert' });
    });

    it('F1 → named-key', () => {
      expect(classifyKeyEvent({ keycode: 0x70, modifiers: [] }, p)).toEqual({ type: 'named-key', name: 'F1' });
    });
  });
});

// =====================================================================
// buildShortcutCombo
// =====================================================================

describe('buildShortcutCombo', () => {
  it('macOS Cmd+C', () => {
    expect(buildShortcutCombo(8, ['meta'], 'darwin')).toBe('Cmd+C');
  });

  it('macOS Cmd+Shift+Option+Z', () => {
    expect(buildShortcutCombo(6, ['meta', 'shift', 'alt'], 'darwin')).toBe('Cmd+Option+Shift+Z');
  });

  it('macOS Ctrl+A', () => {
    expect(buildShortcutCombo(0, ['ctrl'], 'darwin')).toBe('Ctrl+A');
  });

  it('Windows Ctrl+V', () => {
    expect(buildShortcutCombo(0x56, ['ctrl'], 'win32')).toBe('Ctrl+V');
  });

  it('Windows Ctrl+Shift+Delete', () => {
    expect(buildShortcutCombo(0x2E, ['ctrl', 'shift'], 'win32')).toBe('Ctrl+Shift+Delete');
  });

  it('Windows Alt+F4', () => {
    expect(buildShortcutCombo(0x73, ['alt'], 'win32')).toBe('Alt+F4');
  });

  it('Windows Win+E', () => {
    expect(buildShortcutCombo(0x45, ['meta'], 'win32')).toBe('Win+E');
  });

  it('returns null for unknown keycode', () => {
    expect(buildShortcutCombo(999, ['ctrl'], 'darwin')).toBeNull();
  });
});

// =====================================================================
// TypeAccumulator
// =====================================================================

describe('TypeAccumulator', () => {
  it('accumulates characters', () => {
    const acc = new TypeAccumulator();
    acc.appendChar('h');
    acc.appendChar('e');
    acc.appendChar('l');
    acc.appendChar('l');
    acc.appendChar('o');
    expect(acc.text).toBe('hello');
    expect(acc.hasText).toBe(true);
  });

  it('flush returns and clears text', () => {
    const acc = new TypeAccumulator();
    acc.appendChar('h');
    acc.appendChar('i');
    const flushed = acc.flush();
    expect(flushed).toBe('hi');
    expect(acc.text).toBe('');
    expect(acc.hasText).toBe(false);
  });

  it('flush on empty returns empty string', () => {
    const acc = new TypeAccumulator();
    expect(acc.flush()).toBe('');
  });

  it('backspace appends [⌫] notation', () => {
    const acc = new TypeAccumulator();
    acc.appendChar('h');
    acc.appendChar('e');
    acc.appendBackspace();
    acc.appendChar('l');
    expect(acc.flush()).toBe('he[⌫]l');
  });

  it('multiple backspaces', () => {
    const acc = new TypeAccumulator();
    acc.appendChar('a');
    acc.appendBackspace();
    acc.appendBackspace();
    expect(acc.flush()).toBe('a[⌫][⌫]');
  });

  it('typing a full sentence', () => {
    const acc = new TypeAccumulator();
    for (const c of 'Hello, world!') {
      acc.appendChar(c);
    }
    expect(acc.flush()).toBe('Hello, world!');
  });
});

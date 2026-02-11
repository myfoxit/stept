// VariableExtension.ts
import { Node, mergeAttributes, InputRule } from '@tiptap/core';

export const vars = {
  company: 'Wusel',
  first_name: 'Ada',
  signup_link: 'https://example.com/signup',
} satisfies Record<string, string>;

// Regex: {{ key }}
const variableRegex = /\{\{\s?([a-zA-Z0-9_-]+)\s?\}\}$/;

export interface VariableOptions {
  className: string; // e.g. ‘variable’
}

export const VariableExtension = Node.create<VariableOptions>({
  name: 'variable',
  inline: true,
  group: 'inline',
  // ⚠️ NOT atom → marks like textStyle can wrap it
  atom: false,

  addOptions() {
    return { className: 'variable' };
  },

  addAttributes() {
    return {
      key: { default: null }, // stored in document
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-var]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-var': node.attrs.key,
        class: this.options.className,
      }),
      `{{${node.attrs.key}}}`, // fallback if JS is disabled
    ];
  },

  // --- Commands ------------------------------------------------------------
  addCommands() {
    return {
      insertVariable:
        (key: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { key } }),
    };
  },

  // --- Input rule: user types {{ key }} ------------------------------------
  addInputRules() {
    return [
      new InputRule({
        find: variableRegex,
        handler: ({ match, range, chain }) => {
          const [, key] = match;
          chain()
            .deleteRange(range) // remove the literal braces
            .insertVariable(key) // insert our node
            .run();
        },
      }),
    ];
  },

  // --- NodeView: show the live value ---------------------------------------
  addNodeView() {
    return ({ node }) => {
      const span = document.createElement('span');
      span.dataset.var = node.attrs.key;

      const render = () => {
        span.textContent = vars[node.attrs.key] ?? `{{${node.attrs.key}}}`;
      };
      render();

      // Hot‑swap value if the dictionary changes
      const observer = new MutationObserver(render);
      observer.observe(span, { attributes: true });

      return {
        dom: span,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          span.dataset.var = updatedNode.attrs.key;
          render();
          return true;
        },
        destroy: () => observer.disconnect(),
      };
    };
  },
});

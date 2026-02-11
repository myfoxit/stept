import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ButtonNodeComponent } from './ButtonNodeComponent.js';

const ButtonNode = Node.create({
  name: "button-node",
  group: "block",
  atom: true, // behaves like a single inline object

  addAttributes() {
    return {
      label: { default: "Click me" },
      action: { default: "none" },
    };
  },

  parseHTML() {
    return [{ tag: "button-node" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["button-node", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ButtonNodeComponent);
  },

  /**
   * ⌘ + ↵  → insert a fresh button node
   */
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () =>
        this.editor
          .chain()
          .insertContentAt(this.editor.state.selection.head, {
            type: this.type.name,
          })
          .focus()
          .run(),
    };
  },
});

export default ButtonNode;

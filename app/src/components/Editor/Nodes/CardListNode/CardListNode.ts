import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CardListNodeComponent } from './CardListNodeComponent.js';

export default Node.create({
  name: 'card-node',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'react-component',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['react-component', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CardListNodeComponent);
  },
});

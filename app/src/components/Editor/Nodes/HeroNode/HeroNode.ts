import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { HeroNodeComponent } from './HeroNodeComponent.js';

export default Node.create({
  name: 'hero-node',

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
    return ReactNodeViewRenderer(HeroNodeComponent);
  },
});

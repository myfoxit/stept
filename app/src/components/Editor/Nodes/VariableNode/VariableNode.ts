// Nodes/VariableNode/VariableNode.ts
import { Node, mergeAttributes, ReactNodeViewRenderer } from '@tiptap/react';
import { VariableNodeComponent } from './VariableNodeComponent';

export const VariableNode = Node.create({
  name: 'variable-node',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  marks: '_',

  addAttributes() {
    return {
      label: { default: '' },
      colId: {
        default: null,
        // Ensure this attribute is included in the serialization
        parseHTML: (element) => element.getAttribute('data-col-id'),
        renderHTML: (attributes) => {
          if (!attributes.colId) {
            return {};
          }
          return {
            'data-col-id': attributes.colId,
          };
        },
      },
      rowId: {
        default: null,
        // This can be removed as rowId comes from global store
        parseHTML: (element) => element.getAttribute('data-row-id'),
        renderHTML: (attributes) => {
          if (!attributes.rowId) {
            return {};
          }
          return {
            'data-row-id': attributes.rowId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-variable-node]' },
      { tag: 'span[data-col-id]' }, // Also parse from data-col-id
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-variable-node': '',
        'data-col-id': node.attrs.colId,
        'data-row-id': node.attrs.rowId,
        'data-static-label': node.attrs.label,
        contenteditable: 'false',
        class: 'variable-node',
      }),
      node.attrs.label || '[Variable]',
    ];
  },

  addNodeView() {
    /* No need to pass rows/cols as props; they’re in storage */
    return ReactNodeViewRenderer(VariableNodeComponent);
  },
});

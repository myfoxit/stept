import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DataTableNodeView } from './DataTableNodeView';

export interface DataTableAttributes {
  tableId: string;
  tableName?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dataTable: {
      insertDataTable: (attrs: DataTableAttributes) => ReturnType;
    };
  }
}

export const DataTableNode = Node.create({
  name: 'dataTable',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      tableId: {
        default: '',
      },
      tableName: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="data-table"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'data-table' }, HTMLAttributes)];
  },

  addCommands() {
    return {
      insertDataTable:
        (attrs: DataTableAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DataTableNodeView);
  },
});

export default DataTableNode;

// Extensions/VariableStore.ts
import { Extension } from '@tiptap/core';

//       👇 1) no dash → easier dot‑access
export const VariableStore = Extension.create({
  name: 'variableStore',

  addStorage() {
    return {
      cols: [] as unknown[],
      rows: [] as unknown[],
      rowId: null as string | null,
    };
  },

  addCommands() {
    return {
      setVariableData:
        (payload: { cols: unknown[]; rows: unknown[]; rowId: string }) =>
        () => {
          // 👈 2) always write via this.storage
          this.storage.cols = payload.cols;
          this.storage.rows = payload.rows;
          this.storage.rowId = payload.rowId;

          // trigger a very light re‑render of all node‑views
          this.editor.view.dispatch(
            this.editor.state.tr.setMeta('variableStore', Date.now())
          );
          return true;
        },
    };
  },
});

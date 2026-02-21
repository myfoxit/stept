import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { apiClient } from '@/lib/apiClient';

export interface PiiEntity {
  start: number;
  end: number;
  type: string;
  value: string;
}

const piiHighlightKey = new PluginKey('piiHighlight');

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentEntities: PiiEntity[] = [];
let isEnabled = false;

async function analyzeDocument(text: string): Promise<PiiEntity[]> {
  try {
    const { data } = await apiClient.post('/privacy/analyze', { text });
    return data.entities || [];
  } catch {
    return [];
  }
}

export const PiiHighlight = Extension.create({
  name: 'piiHighlight',

  addOptions() {
    return {
      enabled: false,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: piiHighlightKey,

        state: {
          init() {
            return DecorationSet.empty;
          },

          apply(tr, oldSet) {
            // If entities were updated externally, rebuild decorations
            const meta = tr.getMeta(piiHighlightKey);
            if (meta?.entities !== undefined) {
              if (!meta.entities.length) return DecorationSet.empty;

              const doc = tr.doc;
              const decorations: Decoration[] = [];

              // Walk through text nodes to map entity offsets to document positions
              let textOffset = 0;
              doc.descendants((node, pos) => {
                if (node.isText && node.text) {
                  const nodeText = node.text;
                  for (const entity of meta.entities as PiiEntity[]) {
                    // Entity offset is within this text node's range
                    if (entity.start >= textOffset && entity.end <= textOffset + nodeText.length) {
                      const from = pos + (entity.start - textOffset);
                      const to = pos + (entity.end - textOffset);
                      decorations.push(
                        Decoration.inline(from, to, {
                          class: 'pii-highlight',
                          'data-pii-type': entity.type,
                          title: `PII: ${entity.type}`,
                        })
                      );
                    }
                  }
                  textOffset += nodeText.length;
                } else if (node.isBlock && pos > 0) {
                  textOffset += 1; // newline between blocks
                }
                return true;
              });

              return DecorationSet.create(doc, decorations);
            }

            // Map existing decorations through document changes
            if (tr.docChanged) {
              return oldSet.map(tr.mapping, tr.doc);
            }

            return oldSet;
          },
        },

        props: {
          decorations(state) {
            return piiHighlightKey.getState(state);
          },
        },

        view(editorView) {
          function scheduleAnalysis() {
            if (!isEnabled) return;

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              const text = editorView.state.doc.textContent;
              if (!text.trim()) {
                currentEntities = [];
                editorView.dispatch(
                  editorView.state.tr.setMeta(piiHighlightKey, { entities: [] })
                );
                return;
              }

              const entities = await analyzeDocument(text);
              currentEntities = entities;
              editorView.dispatch(
                editorView.state.tr.setMeta(piiHighlightKey, { entities })
              );
            }, 1500); // 1.5s debounce
          }

          return {
            update(view, prevState) {
              if (view.state.doc !== prevState.doc) {
                scheduleAnalysis();
              }
            },
            destroy() {
              if (debounceTimer) clearTimeout(debounceTimer);
            },
          };
        },
      }),
    ];
  },
});

/** Enable/disable PII highlighting programmatically */
export function setPiiHighlightEnabled(enabled: boolean) {
  isEnabled = enabled;
}

/** Get current entities (for external consumers) */
export function getPiiEntities(): PiiEntity[] {
  return currentEntities;
}

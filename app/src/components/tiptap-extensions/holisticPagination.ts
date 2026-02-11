import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Editor } from '@tiptap/core';

// --- Predefined Page Formats (in pixels at 96 DPI) ---
const PAGE_FORMATS = {
  A4: {
    width: 794,
    height: 1123,
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
  },
  Letter: {
    width: 816,
    height: 1056,
    margins: { top: 96, right: 96, bottom: 96, left: 96 },
  },
};

export interface HolisticPaginationOptions {
  pageFormat: 'A4' | 'Letter' | { width: number; height: number; margins: { top: number; right: number; bottom: number; left: number } };
  pageGap: number;
  header: (currentPage: number, totalPages: number) => string;
  footer: (currentPage: number, totalPages: number) => string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    holisticPagination: {
      /**
       * Sets the page format for the document.
       * @param format 'A4', 'Letter', or a custom format object.
       */
      setPageFormat: (format: HolisticPaginationOptions['pageFormat']) => ReturnType;
    };
  }
}

const pluginKey = new PluginKey('holisticPagination');

/**
 * Calculates the total number of pages required based on the editor's content height.
 */
function calculatePageCount(view: EditorView, settings: { height: number; margins: { top: number; bottom: number } }): number {
  if (!view.dom.parentElement) return 1;

  const contentHeight = view.dom.scrollHeight;
  const pageInnerHeight = settings.height - settings.margins.top - settings.margins.bottom;

  if (pageInnerHeight <= 0) return 1;

  const pages = Math.ceil(contentHeight / pageInnerHeight);
  return Math.max(1, pages); // Always have at least one page
}

/**
 * Creates the DOM element that holds all the page break decorations.
 */
function createPaginationWidget(editor: Editor): HTMLElement {
  const { storage } = editor.getExtension('holisticPagination');
  const settings = { ...PAGE_FORMATS.A4, ...storage.settings };
  const pageCount = storage.pageCount as number;
  
  const container = document.createElement('div');
  container.setAttribute('data-pagination-container', 'true');
  container.setAttribute('aria-hidden', 'true'); // Hide from screen readers

  for (let i = 0; i < pageCount; i++) {
    const pageNumber = i + 1;

    const pageBreak = document.createElement('div');
    pageBreak.className = 'page-break';
    // The visual break is positioned absolutely relative to the page content
    pageBreak.style.top = `${settings.height * pageNumber}px`;

    // 1. Footer for the current page
    const footer = document.createElement('div');
    footer.className = 'page-footer';
    footer.innerHTML = storage.options.footer(pageNumber, pageCount);
    pageBreak.appendChild(footer);

    // 2. Gap between pages
    const gap = document.createElement('div');
    gap.className = 'page-gap';
    pageBreak.appendChild(gap);

    // 3. Header for the *next* page
    if (pageNumber < pageCount) {
      const header = document.createElement('div');
      header.className = 'page-header';
      header.innerHTML = storage.options.header(pageNumber + 1, pageCount);
      pageBreak.appendChild(header);
    }
    
    container.appendChild(pageBreak);
  }

  return container;
}

/**
 * Injects or updates the dynamic stylesheet for pagination.
 */
function injectOrUpdateStyles(storage: any): void {
  const settings = { ...PAGE_FORMATS.A4, ...storage.settings };
  
  // Remove old stylesheet if it exists
  if (storage.styleElement && storage.styleElement.parentNode) {
    storage.styleElement.parentNode.removeChild(storage.styleElement);
  }

  const style = document.createElement('style');
  style.id = `pagination-styles-${storage.uniqueId}`;
  style.textContent = `
    .${storage.uniqueId} {
      /* Base page styling */
      width: ${settings.width}px;
      padding: ${settings.margins.top}px ${settings.margins.right}px ${settings.margins.bottom}px ${settings.margins.left}px;
      margin: 2rem auto; /* Center the "paper" */
      background: white;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
      position: relative; /* Crucial for positioning breaks */
      counter-reset: page-number; /* Initialize CSS counter */
    }

    .${storage.uniqueId} [data-pagination-container] {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      user-select: none;
      pointer-events: none; /* Make it non-interactive */
    }

    .${storage.uniqueId} .page-break {
      position: absolute;
      left: ${settings.margins.left}px;
      right: ${settings.margins.right}px;
      width: calc(100% - ${settings.margins.left + settings.margins.right}px);
    }
    
    .${storage.uniqueId} .page-footer, .${storage.uniqueId} .page-header {
      position: absolute;
      left: 0;
      right: 0;
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 1rem; /* Inner padding for header/footer content */
      box-sizing: border-box;
      font-size: 0.8em;
      color: #888;
    }

    .${storage.uniqueId} .page-footer {
      bottom: -${settings.margins.bottom}px; /* Position below content area */
      height: ${settings.margins.bottom}px;
      counter-increment: page-number; /* Increment for each footer */
    }

    .${storage.uniqueId} .page-header {
      top: 0;
      height: ${settings.margins.top}px; /* Position above content area of next page */
    }
    
    .${storage.uniqueId} .page-gap {
      height: ${storage.options.pageGap}px;
      background: #f0f0f0;
      border-top: 1px dashed #ccc;
      border-bottom: 1px dashed #ccc;
      position: absolute;
      width: calc(100% + ${settings.margins.left + settings.margins.right}px);
      left: -${settings.margins.left}px;
      box-sizing: content-box;
    }

    .${storage.uniqueId} .page-number::before {
      content: counter(page-number); /* Display the counter value */
    }
  `;

  document.head.appendChild(style);
  storage.styleElement = style;
}


export const HolisticPagination = Extension.create<HolisticPaginationOptions>({
  name: 'holisticPagination',

  addOptions() {
    return {
      pageFormat: 'A4',
      pageGap: 48,
      header: (currentPage, totalPages) => `<div>Header for Page ${currentPage}</div>`,
      footer: (currentPage, totalPages) => `<div><span class="page-number"></span> / ${totalPages}</div>`,
    };
  },

  addStorage() {
    return {
      pageCount: 1,
      styleElement: null as HTMLStyleElement | null,
      observer: null as MutationObserver | null,
      uniqueId: `tiptap-pagination-${Date.now()}`,
      settings: {},
      options: this.options,
    };
  },

  onCreate() {
    this.storage.settings = typeof this.options.pageFormat === 'string'
      ? PAGE_FORMATS[this.options.pageFormat]
      : this.options.pageFormat;
    
    this.editor.view.dom.classList.add(this.storage.uniqueId);
    injectOrUpdateStyles(this.storage);
    
    // Setup the observer to react to content changes
    const observer = new MutationObserver(() => {
        const view = this.editor.view;
        const newPageCount = calculatePageCount(view, this.storage.settings);
        
        if (newPageCount !== this.storage.pageCount) {
          this.storage.pageCount = newPageCount;
          // Dispatch a transaction with a meta flag to trigger decoration update
          const tr = view.state.tr.setMeta(pluginKey, { recalculate: true });
          view.dispatch(tr);
        }
    });

    observer.observe(this.editor.view.dom, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    this.storage.observer = observer;
  },
  
  onDestroy() {
    this.storage.observer?.disconnect();
    if (this.storage.styleElement && this.storage.styleElement.parentNode) {
      this.storage.styleElement.parentNode.removeChild(this.storage.styleElement);
    }
  },

  addCommands() {
    return {
      setPageFormat: (format) => ({ editor, dispatch }) => {
        const extension = editor.getExtension('holisticPagination');
        
        extension.storage.settings = typeof format === 'string'
          ? PAGE_FORMATS[format]
          : format;
        
        injectOrUpdateStyles(extension.storage);

        // Force a recalculation
        if (dispatch) {
            const tr = editor.view.state.tr.setMeta(pluginKey, { recalculate: true });
            editor.view.dispatch(tr);
        }
        return true;
      },
    };
  },
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_, state) => {
            return DecorationSet.create(state.doc, [
              Decoration.widget(0, () => createPaginationWidget(this.editor), { side: -1 }),
            ]);
          },
          apply: (tr, oldDecorations) => {
            // Only update decorations if our meta flag is present or the doc changed size
            const meta = tr.getMeta(pluginKey);
            if (meta?.recalculate || tr.docChanged) {
              return DecorationSet.create(tr.doc, [
                 Decoration.widget(0, () => createPaginationWidget(this.editor), { side: -1 }),
              ]);
            }
            return oldDecorations.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
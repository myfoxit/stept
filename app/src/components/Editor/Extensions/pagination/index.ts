// Unminimized, readable source reconstructed from the provided bundle
// This file defines:
// - PAGE_FORMATS and helpers (cmToPixels, inchToPixels)
// - Pages extension (pagination UI + page tracker utilities)
// - TableKit extension (table, header, row, cell with CSS Grid layout)
// - PageKit (composition of Pages + optional TableKit)

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Extension, mergeAttributes } from '@tiptap/core'
import {
  Table as BaseTable,
  TableCell as BaseTableCell,
  TableHeader as BaseTableHeader,
  TableRow as BaseTableRow,
  type TableKitOptions as OriginalTableKitOptions,
} from '@tiptap/extension-table'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

// -----------------------
// Utilities
// -----------------------

const PAGINATION_CONTAINER_SELECTOR = '[data-ondoki-pagination]'

function getRenderedPageCount(view: EditorView): number {
  const container = view.dom.querySelector(PAGINATION_CONTAINER_SELECTOR)
  return container ? container.children.length : 0
}

function currentDPI(): number {
  if (typeof window !== 'undefined' && (window as any).devicePixelRatio) {
    return Math.round(96 * (window as any).devicePixelRatio)
  }
  return 96
}

export function cmToPixels(cm: number, dpi: number = currentDPI()): number {
  return Math.round((cm * dpi) / 2.54)
}

export function inchToPixels(inches: number, dpi: number = 96): number {
  return inches * dpi
}

// -----------------------
// Page formats
// -----------------------

export const PAGE_FORMATS = {
  A4: {
    id: 'A4',
    width: cmToPixels(21, 96),
    height: cmToPixels(29.7, 96),
    margins: {
      top: cmToPixels(2.5, 96),
      right: cmToPixels(2, 96),
      bottom: cmToPixels(2.5, 96),
      left: cmToPixels(2, 96),
    },
  },
  A3: {
    id: 'A3',
    width: cmToPixels(29.7, 96),
    height: cmToPixels(42, 96),
    margins: {
      top: cmToPixels(2.5, 96),
      right: cmToPixels(2, 96),
      bottom: cmToPixels(2.5, 96),
      left: cmToPixels(2, 96),
    },
  },
  A5: {
    id: 'A5',
    width: cmToPixels(14.8, 96),
    height: cmToPixels(21, 96),
    margins: {
      top: cmToPixels(2, 96),
      right: cmToPixels(1.5, 96),
      bottom: cmToPixels(2, 96),
      left: cmToPixels(1.5, 96),
    },
  },
  Letter: {
    id: 'Letter',
    width: cmToPixels(21.59, 96),
    height: cmToPixels(27.94, 96),
    margins: {
      top: cmToPixels(2.54, 96),
      right: cmToPixels(2.54, 96),
      bottom: cmToPixels(2.54, 96),
      left: cmToPixels(2.54, 96),
    },
  },
  Legal: {
    id: 'Legal',
    width: cmToPixels(21.59, 96),
    height: cmToPixels(35.56, 96),
    margins: {
      top: cmToPixels(2.54, 96),
      right: cmToPixels(2.54, 96),
      bottom: cmToPixels(2.54, 96),
      left: cmToPixels(2.54, 96),
    },
  },
  Tabloid: {
    id: 'Tabloid',
    width: cmToPixels(27.94, 96),
    height: cmToPixels(43.18, 96),
    margins: {
      top: cmToPixels(2.54, 96),
      right: cmToPixels(2.54, 96),
      bottom: cmToPixels(2.54, 96),
      left: cmToPixels(2.54, 96),
    },
  },
} as const

export type PageFormat = keyof typeof PAGE_FORMATS | CustomPageFormat
export type PageMargins = { top: number; right: number; bottom: number; left: number }
export type CustomPageFormat = { id: string; width: number; height: number; margins: PageMargins }

// -----------------------
// Pagination option normalization
// -----------------------

type PagesHeaderFooter = ((pageNumber: number, totalPages: number) => string) | string

export interface PagesOptions {
  pageFormat: PageFormat
  headerHeight?: number
  footerHeight?: number
  pageGap?: number
  footer: PagesHeaderFooter
  header: PagesHeaderFooter
  pageBreakBackground?: string
  onPageFormatChange?: (page: PageFormat) => void
}

export interface PagesStorage {
  pageFormat: PageFormat
  footer: PagesHeaderFooter
  header: PagesHeaderFooter
  pageGap: number
  headerHeight: number
  footerHeight: number
  pageBreakBackground: string
  uniqueId: string
  styleElement: HTMLStyleElement | null
  pageTracker: PageTracker
  paginationEnabled: boolean // added
  // helpers added onCreate
  getCurrentPage?: (debug?: boolean) => number
  getPageForPosition?: (pos: number) => number
  getNodesOnPage?: (pageNumber: number) => any[]
  getPageStats?: () => any
  doesRangeSpanPages?: (from: number, to: number) => any
  getPageCount?: () => number
}

function resolvePageOptions(opts: {
  pageFormat: PageFormat
  headerHeight?: number
  footerHeight?: number
  pageGap?: number
  footer: PagesHeaderFooter
  header: PagesHeaderFooter
  pageBreakBackground?: string
}): {
  width: number
  height: number
  margins: PageMargins
  headerHeight: number
  footerHeight: number
  pageGap: number
  footer: PagesHeaderFooter
  header: PagesHeaderFooter
  pageBreakBackground: string
} {
  const preset = typeof opts.pageFormat === 'string' ? PAGE_FORMATS[opts.pageFormat] : opts.pageFormat

  return {
    width: preset.width,
    height: preset.height,
    margins: preset.margins,
    headerHeight: opts.headerHeight ?? 50,
    footerHeight: opts.footerHeight ?? 50,
    pageGap: opts.pageGap ?? 50,
    footer: opts.footer,
    header: opts.header,
    pageBreakBackground: opts.pageBreakBackground ?? '#fff',
  }
}

// -----------------------
// Page counting & layout helpers
// -----------------------

function computePageCount({ view, options, storage }: { view: EditorView; options: PagesOptions; storage: PagesStorage }): number {
  const cfg = resolvePageOptions({ ...options, pageFormat: storage.pageFormat })
  const root = view.dom as HTMLElement

  const contentHeight = cfg.height - (cfg.margins.top + cfg.margins.bottom)
  const paginationContainer = root.querySelector(PAGINATION_CONTAINER_SELECTOR)
  const rendered = getRenderedPageCount(view)

  if (paginationContainer) {
    const last = root.lastElementChild as HTMLElement | null
    const lastBreaker = (paginationContainer.lastElementChild as HTMLElement | null)?.querySelector('.breaker') as HTMLElement | null

    if (last && lastBreaker) {
      const delta = last.getBoundingClientRect().bottom - lastBreaker.getBoundingClientRect().bottom
      if (delta > 0) {
        const overflowPages = Math.ceil(delta / contentHeight)
        return rendered + overflowPages
      }

      const nearZero = -10
      const beyondOnePage = -(cfg.height - 10)

      if (delta > beyondOnePage && delta < nearZero) return rendered
      if (delta < beyondOnePage) {
        const pageSpan = cfg.height + 50
        const missing = Math.floor(delta / pageSpan)
        return rendered + missing
      }
      return rendered
    }
    return 1
  }

  const scrollHeight = (root as HTMLElement).scrollHeight
  const est = Math.ceil(scrollHeight / contentHeight)
  return est <= 0 ? 1 : est
}

function ensureMinHeightMatchesLastBreaker(root: HTMLElement): void {
  const container = root.querySelector(PAGINATION_CONTAINER_SELECTOR)
  if (!container) return
  const lastBreaker = (container.lastElementChild as HTMLElement | null)?.querySelector('.breaker') as HTMLElement | null
  if (!lastBreaker) return
  const bottom = lastBreaker.offsetTop + lastBreaker.offsetHeight
  ;(root as HTMLElement).style.minHeight = `${bottom}px`
}

const PAGE_COUNT_META_KEY = 'PAGE_COUNT_META_KEY'
let observer: MutationObserver | null = null

function beginMutationWatch({ view, options, storage }: { view: EditorView; options: PagesOptions; storage: PagesStorage }) {
  const handler: MutationCallback = (records) => {
    if (records.length > 0 && records[0].target) {
      const target = records[0].target as HTMLElement
      if (target.classList.contains(storage.uniqueId)) {
        const prev = getRenderedPageCount(view)
        const next = computePageCount({ view, options, storage })
        if (prev !== next) {
          const tr = view.state.tr.setMeta(PAGE_COUNT_META_KEY, Date.now())
          view.dispatch(tr)
        }
        ensureMinHeightMatchesLastBreaker(target)
      }
    }
  }

  if (!observer) {
    observer = new MutationObserver(handler)
    observer.observe(view.dom, { attributes: true })
  }
}

function stopMutationWatch() {
  if (observer) {
    observer.disconnect()
    observer = null
  }
}

function injectStyles({ view, options, storage }: { view: EditorView; options: PagesOptions; storage: PagesStorage }) {
  const root = view.dom as HTMLElement

  // clear old style if any
  if (storage.styleElement && storage.styleElement.parentNode) {
    storage.styleElement.parentNode.removeChild(storage.styleElement)
    storage.styleElement = null
  }

  // when disabled, remove unique class and observers, and bail
  if (!storage.paginationEnabled) {
    root.classList.remove(storage.uniqueId)
    stopMutationWatch()
    // clear min-height added previously
    ;(root as HTMLElement).style.minHeight = ''
    return
  }

  if (!root.classList.contains(storage.uniqueId)) root.classList.add(storage.uniqueId)

  const cfg = resolvePageOptions({
    ...options,
    pageFormat: storage.pageFormat,
    pageGap: storage.pageGap,
    headerHeight: storage.headerHeight,
    footerHeight: storage.footerHeight,
    footer: storage.footer,
    header: storage.header,
    pageBreakBackground: storage.pageBreakBackground,
  })

  const style = document.createElement('style')
  style.dataset.ondokiPaginationStyle = storage.uniqueId

  const scope = `.${storage.uniqueId}`
  style.textContent = `
${scope} {
  width: ${cfg.width}px;
  margin: 0px auto;
  background-color: #fff;
  border: 1px solid #e5e5e5;
  padding: ${cfg.margins.top - (cfg.headerHeight ?? 0) * 0.5}px ${cfg.margins.right}px ${cfg.margins.bottom - (cfg.footerHeight ?? 0)}px ${cfg.margins.left}px;
}

/* Remote caret */
${scope} .collaboration-carets__caret {
  border-left: 1px solid #0d0d0d;
  border-right: 1px solid #0d0d0d;
  margin-left: -1px;
  margin-right: -1px;
  pointer-events: none;
  position: relative;
  word-break: normal;
}

/* Username above caret */
${scope} .collaboration-carets__label {
  border-radius: 3px 3px 3px 0;
  color: #0d0d0d;
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  left: -1px;
  line-height: normal;
  padding: 0.1rem 0.3rem;
  position: absolute;
  top: -1.4em;
  user-select: none;
  white-space: nowrap;
}

${scope} .ondoki-pagination-gap {
  border-top: 1px solid #e5e5e5;
  border-bottom: 1px solid #e5e5e5;
}

${scope} .ondoki-page-footer::after {
  color: #6b7280;
}

${scope} .ondoki-page-footer,
${scope} .ondoki-page-header {
  background-color: hsl(var(--background));
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 ${cfg.margins.right}px 0 ${cfg.margins.left}px;
}

${scope} .ondoki-page-header-center,
${scope} .ondoki-page-footer-center {
  flex: 1;
  text-align: center;
}

${scope} { counter-reset: page-number; }
${scope} .ondoki-page-footer { counter-increment: page-number; }

${scope} .ondoki-page-break:last-child .ondoki-pagination-gap { display: none; }
${scope} .ondoki-page-break:last-child .ondoki-page-header { display: none; }

${scope} p:has(br.ProseMirror-trailingBreak:only-child) {
  display: table;
  width: 100%;
}

${scope} .ondoki-page-number::before { content: counter(page-number); }

${scope} .ondoki-first-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
${scope} .ondoki-page-header-center { flex: 1; text-align: center; }

/* Table normalization : render using CSS Grid to support colwidth */
${scope} table { border-collapse: collapse; width: 100%; display: contents; }
${scope} table tbody { width: 100%; display: contents; }
${scope} table tbody tr, ${scope} table tr {
  width: 100%;
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
}
${scope} table tbody tr td,
${scope} table tbody tr th,
${scope} table tr td,
${scope} table tr th {
  box-sizing: border-box;
  position: relative;
}
`
  document.head.appendChild(style)
  storage.styleElement = style

  beginMutationWatch({ view, options, storage })
  ensureMinHeightMatchesLastBreaker(view.dom as HTMLElement)
}

// -----------------------
// Decorations (visual page breaks + header/footer)
// -----------------------

function pageDecorations({ options, isInitial = false, storage }: { options: PagesOptions; isInitial?: boolean; storage: PagesStorage }) {
  if (!storage.paginationEnabled) {
    return []
  }
  const cfg = resolvePageOptions({
    ...options,
    pageFormat: storage.pageFormat,
    pageGap: storage.pageGap,
    headerHeight: storage.headerHeight,
    footerHeight: storage.footerHeight,
    footer: storage.footer,
    header: storage.header,
    pageBreakBackground: storage.pageBreakBackground,
  })

  const pagesWidget = Decoration.widget(
    0,
    (view) => {
      const gap = cfg.pageGap
      const headerH = cfg.headerHeight
      const footerH = cfg.footerHeight
      const contentHeight = cfg.height - (cfg.margins.top + cfg.margins.bottom)
      const bg = cfg.pageBreakBackground ?? '#ffffff'
      const pageWidth = cfg.width

      const container = document.createElement('div')
      container.dataset.ondokiPagination = 'true'

      const pageBreak = ({ firstPage = false, pageNumber = 0, totalPages = 0 }: { firstPage?: boolean; pageNumber?: number; totalPages?: number }) => {
        const wrapper = document.createElement('div')
        wrapper.classList.add('ondoki-page-break')

        const page = document.createElement('div')
        page.classList.add('page')
        page.style.position = 'relative'
        page.style.float = 'left'
        page.style.clear = 'both'
        page.style.marginTop = firstPage ? `calc(${headerH}px + ${contentHeight}px)` : `${contentHeight}px`

        const breaker = document.createElement('div')
        breaker.classList.add('breaker')
        breaker.style.width = `calc(${pageWidth}px)`
        breaker.style.marginLeft = `calc(calc(calc(${pageWidth}px - 100%) / 2) - calc(${pageWidth}px - 100%))`
        breaker.style.marginRight = `calc(calc(calc(${pageWidth}px - 100%) / 2) - calc(${pageWidth}px - 100%))`
        breaker.style.position = 'relative'
        breaker.style.float = 'left'
        breaker.style.clear = 'both'
        breaker.style.left = '0px'
        breaker.style.right = '0px'
        breaker.style.zIndex = '2'

        const footer = document.createElement('div')
        footer.classList.add('ondoki-page-footer')
        footer.style.height = `${footerH + cfg.margins.bottom}px`
        footer.style.padding = `0 ${cfg.margins.right}px 0 ${cfg.margins.left}px`
        const footerHTML = typeof cfg.footer === 'function' ? cfg.footer(pageNumber, totalPages) : cfg.footer.replace('{page}', `${pageNumber}`).replace('{total}', `${totalPages}`)
        footer.innerHTML = footerHTML

        const gapDiv = document.createElement('div')
        gapDiv.classList.add('ondoki-pagination-gap')
        gapDiv.style.height = `${gap}px`
        gapDiv.style.borderLeft = '1px solid'
        gapDiv.style.borderRight = '1px solid'
        gapDiv.style.position = 'relative'
        gapDiv.style.setProperty('width', 'calc(100% + 2px)', 'important')
        gapDiv.style.left = '-1px'
        gapDiv.style.backgroundColor = '#fbfbfb'
        gapDiv.style.borderLeftColor = '#fbfbfb'
        gapDiv.style.borderRightColor = '#fbfbfb'

        const header = document.createElement('div')
        header.classList.add('ondoki-page-header')
        header.style.height = `${headerH + cfg.margins.top}px`
        header.style.padding = `0 ${cfg.margins.right}px 0 ${cfg.margins.left}px`
        const headerHTML = typeof cfg.header === 'function' ? cfg.header(pageNumber + 1, totalPages) : cfg.header.replace('{page}', `${pageNumber + 1}`).replace('{total}', `${totalPages}`)
        header.innerHTML = headerHTML

        breaker.append(footer, gapDiv, header)
        wrapper.append(page, breaker)
        return wrapper
      }

      const frag = document.createDocumentFragment()
      const count = computePageCount({ view, options, storage })

      for (let i = 0; i < count; i++) {
        const el = pageBreak({ firstPage: i === 0, pageNumber: i + 1, totalPages: count })
        frag.appendChild(el.cloneNode(true))
      }

      container.append(frag)
      container.id = 'pages'
      return container
    },
    { side: -1 },
  )

  const firstHeaderWidget = Decoration.widget(
    0,
    (view) => {
      const count = computePageCount({ view, options, storage })
      const firstHeader = document.createElement('div')
      firstHeader.style.position = 'relative'
      firstHeader.classList.add('ondoki-first-page-header')
      firstHeader.style.height = `${cfg.headerHeight}px`
      firstHeader.style.marginTop = '-10px'
      const html = typeof cfg.header === 'function' ? cfg.header(1, count) : cfg.header.replace('{page}', '1').replace('{total}', `${count}`)
      firstHeader.innerHTML = html
      return firstHeader
    },
    { side: -1 },
  )

  return isInitial ? [pagesWidget] : [pagesWidget, firstHeaderWidget]
}

// -----------------------
// PageTracker
// -----------------------

export interface PageNodeInfo {
  node: PMNode
  pos: number
  page: number
}

/** Stateless page tracker that calculates which nodes belong to which pages */
export class PageTracker {
  getNodesOnPage(pageNumber: number, view: EditorView): PageNodeInfo[] {
    const root = view.dom as HTMLElement
    const container = root.querySelector(PAGINATION_CONTAINER_SELECTOR)
    if (!container) return pageNumber === 1 ? this.getAllNodesOnSinglePage(view, 1) : []

    const pageBreakBottoms = this.getPageBreakPositions(root, container as HTMLElement)
    if (!pageBreakBottoms.length) return pageNumber === 1 ? this.getAllNodesOnSinglePage(view, 1) : []

    const result: PageNodeInfo[] = []
    view.state.doc.descendants((node, pos) => {
      if (!node.isBlock) return true
      const page = this.calculateNodePage(node, pos, pageBreakBottoms, view, root)
      if (page === pageNumber) {
        result.push({ node, pos, page })
        return false
      }
      return true
    })
    return result
  }

  getPageForPosition(pos: number, view: EditorView, debug = false): number {
    const root = view.dom as HTMLElement
    const container = root.querySelector(PAGINATION_CONTAINER_SELECTOR)
    if (debug) console.log(`[PageTracker] getPageForPosition pos=${pos}, hasContainer=${!!container}`)
    if (!container) return 1

    const breaks = this.getPageBreakPositions(root, container as HTMLElement)
    if (debug) console.log('[PageTracker] break bottoms:', breaks)
    if (!breaks.length) return 1

    const page = this.calculatePageForPosition(pos, breaks, view, root, debug)
    if (debug) console.log('[PageTracker] page=', page)
    return page
  }

  getCurrentPage(view: EditorView, debug = false): number {
    const { from } = view.state.selection
    if (debug) console.log(`[PageTracker] selection.from=${from}`)
    const page = this.getPageForPosition(from, view, debug)
    if (debug) console.log(`[PageTracker] current page=${page}`)
    return page
  }

  getPageCount(view: EditorView): number {
    const container = view.dom.querySelector(PAGINATION_CONTAINER_SELECTOR)
    return container ? Array.from(container.querySelectorAll('.breaker')).length + 1 : 1
  }

  getPages(view: EditorView): number[] {
    const count = this.getPageCount(view)
    const pages: number[] = []
    for (let i = 1; i <= count; i++) {
      if (this.getNodesOnPage(i, view).length > 0) pages.push(i)
    }
    return pages
  }

  doesRangeSpanPages(from: number, to: number, view: EditorView): { spans: boolean; pages: number[] } {
    const a = this.getPageForPosition(from, view)
    const b = this.getPageForPosition(to, view)
    if (a === b) return { spans: false, pages: [a] }
    const arr: number[] = []
    for (let p = a; p <= b; p++) arr.push(p)
    return { spans: true, pages: arr }
  }

  getPageStats(view: EditorView) {
    const totalPages = this.getPageCount(view)
    const pages = this.getPages(view)
    const nodesPerPage: Record<number, number> = {}
    let totalNodes = 0
    for (const p of pages) {
      const n = this.getNodesOnPage(p, view).length
      nodesPerPage[p] = n
      totalNodes += n
    }
    const averageNodesPerPage = totalPages > 0 ? Math.round((totalNodes / totalPages) * 100) / 100 : 0
    return { totalPages, totalNodes, nodesPerPage, averageNodesPerPage }
  }

  getAllNodesWithPages(view: EditorView): PageNodeInfo[] {
    const res: PageNodeInfo[] = []
    const pages = this.getPages(view)
    for (const p of pages) {
      const nodes = this.getNodesOnPage(p, view)
      res.push(...nodes)
    }
    return res.sort((a, b) => a.pos - b.pos)
  }

  getClosestNodeOnSamePage(targetPos: number, view: EditorView): PageNodeInfo | undefined {
    const page = this.getPageForPosition(targetPos, view)
    const nodes = this.getNodesOnPage(page, view)
    if (nodes.length === 0) return undefined
    let closest = nodes[0]
    let best = Math.abs(closest.pos - targetPos)
    for (const n of nodes) {
      const d = Math.abs(n.pos - targetPos)
      if (d < best) {
        best = d
        closest = n
      }
    }
    return closest
  }

  private getPageBreakPositions(root: HTMLElement, container: HTMLElement): number[] {
    const breakers = Array.from(container.querySelectorAll('.breaker')) as HTMLElement[]
    if (!breakers.length) return []
    const rootBox = root.getBoundingClientRect()
    return breakers.map((b) => b.getBoundingClientRect().bottom - rootBox.top + root.scrollTop)
  }

  private calculatePageForPosition(pos: number, bottoms: number[], view: EditorView, root: HTMLElement, debug = false): number {
    try {
      const coords = view.coordsAtPos(pos)
      const rootBox = root.getBoundingClientRect()
      const top = coords.top - rootBox.top + root.scrollTop
      if (debug) console.log('[PageTracker] posTop=', top, 'bottoms=', bottoms)
      let page = 1
      for (let i = 0; i < bottoms.length; i++) {
        if (top >= bottoms[i]) page = i + 2
        else break
      }
      return page
    } catch (err) {
      if (debug) console.log('[PageTracker] coordsAtPos error, fallback', err)
      return this.estimatePageForPosition(pos, bottoms, view)
    }
  }

  private calculateNodePage(node: PMNode, pos: number, bottoms: number[], view: EditorView, root: HTMLElement, debug = false): number {
    try {
      const coords = view.coordsAtPos(pos)
      const rootBox = root.getBoundingClientRect()
      const top = coords.top - rootBox.top + root.scrollTop
      if (debug) console.log('[PageTracker] nodeTop=', top, 'bottoms=', bottoms)
      let page = 1
      for (let i = 0; i < bottoms.length; i++) {
        if (top >= bottoms[i]) page = i + 2
        else break
      }
      return page
    } catch (err) {
      if (debug) console.log('[PageTracker] node coords error, fallback', err)
      return this.estimateNodePage(node, pos, bottoms, view)
    }
  }

  private estimatePageForPosition(pos: number, bottoms: number[], view: EditorView): number {
    const totalHeight = (view.dom as HTMLElement).scrollHeight
    const approxTop = (pos / view.state.doc.content.size) * totalHeight
    let page = 1
    for (let i = 0; i < bottoms.length && approxTop >= bottoms[i]; i++) page = i + 2
    return page
  }

  private estimateNodePage(_node: PMNode, pos: number, bottoms: number[], view: EditorView): number {
    const totalHeight = (view.dom as HTMLElement).scrollHeight
    const approxTop = (pos / view.state.doc.content.size) * totalHeight
    let page = 1
    for (let i = 0; i < bottoms.length && approxTop >= bottoms[i]; i++) page = i + 2
    return page
  }

  private getAllNodesOnSinglePage(view: EditorView, page: number): PageNodeInfo[] {
    const res: PageNodeInfo[] = []
    view.state.doc.descendants((node, pos) => {
      if (node.isBlock) res.push({ node, pos, page })
      return true
    })
    return res
  }
}

function newUniqueClass(): string {
  const a = Date.now().toString(36)
  const b = Math.random().toString(36).substring(2, 9)
  return `ondoki-pages-${a}-${b}`
}

// Validation helpers
function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}
function isNonNegative(x: unknown): x is number {
  return isFiniteNumber(x) && x >= 0
}
function isPositive(x: unknown): x is number {
  return isFiniteNumber(x) && x > 0
}
function isMargins(m: any): m is PageMargins {
  return !!m && typeof m === 'object' && isNonNegative(m.top) && isNonNegative(m.right) && isNonNegative(m.bottom) && isNonNegative(m.left)
}

function validateCustomFormat(fmt: any): { valid: boolean; code?: string; message?: string } {
  if (!fmt || typeof fmt !== 'object') return { valid: false, code: 'INVALID_TYPE', message: 'Expected a page format object.' }
  if (typeof fmt.id !== 'string' || fmt.id.trim().length === 0) return { valid: false, code: 'INVALID_ID', message: 'Page format id must be a non-empty string.' }
  if (!isPositive(fmt.width)) return { valid: false, code: 'INVALID_WIDTH', message: 'Page width must be a positive finite number (pixels).' }
  if (!isPositive(fmt.height)) return { valid: false, code: 'INVALID_HEIGHT', message: 'Page height must be a positive finite number (pixels).' }
  if (!isMargins(fmt.margins)) return { valid: false, code: 'INVALID_MARGINS', message: 'Margins must be an object with non-negative finite numbers for top, right, bottom, and left (pixels).' }
  const innerW = fmt.width - (fmt.margins.left + fmt.margins.right)
  const innerH = fmt.height - (fmt.margins.top + fmt.margins.bottom)
  if (innerW <= 0 || innerH <= 0) return { valid: false, code: 'NEGATIVE_CONTENT_SIZE', message: 'Sum of horizontal or vertical margins exceeds page dimensions, leaving no content area.' }
  return { valid: true }
}

function validatePageFormat(fmt: PageFormat): { valid: boolean; code?: string; message?: string } {
  if (typeof fmt === 'string') {
    return Object.prototype.hasOwnProperty.call(PAGE_FORMATS, fmt) ? { valid: true } : { valid: false, code: 'UNKNOWN_PRESET', message: `Unknown page format preset: ${fmt}` }
  }
  return validateCustomFormat(fmt)
}

function isValidFormat(fmt: PageFormat): boolean {
  return validatePageFormat(fmt).valid
}

function metaChanges(tr: any) {
  return (
    tr.getMeta('unique-id-change') ||
    tr.getMeta('page-format-change') ||
    tr.getMeta('footer-change') ||
    tr.getMeta('header-change') ||
    tr.getMeta('page-gap-change') ||
    tr.getMeta('header-height-change') ||
    tr.getMeta('footer-height-change') ||
    tr.getMeta('page-break-background-change') ||
    tr.getMeta('pagination-enabled-change') // added
  )
}

// -----------------------
// Pages Extension
// -----------------------

export const Pages = Extension.create<PagesOptions, PagesStorage>({
  name: 'pages',

  addOptions() {
    return {
      pageFormat: 'A4',
      headerHeight: 50,
      footerHeight: 50,
      pageGap: 50,
      footer: '{page}',
      header: '',
      onPageFormatChange: () => {},
      pageBreakBackground: '#ffffff',
    }
  },

  addStorage() {
    return {
      pageFormat: this.options.pageFormat,
      footer: this.options.footer,
      header: this.options.header,
      pageGap: this.options.pageGap ?? 50,
      headerHeight: this.options.headerHeight ?? 50,
      footerHeight: this.options.footerHeight ?? 50,
      pageBreakBackground: this.options.pageBreakBackground ?? '#ffffff',
      uniqueId: newUniqueClass(),
      styleElement: null,
      pageTracker: new PageTracker(),
      paginationEnabled: true, // added
    }
  },

  onCreate() {
    const tr = this.editor.view.state.tr.setMeta('unique-id-change', Date.now())
    this.editor.view.dispatch(tr)

    injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })

    // attach helpers
    this.storage.getCurrentPage = (debug?: boolean) => this.storage.pageTracker.getCurrentPage(this.editor.view, debug)
    this.storage.getPageForPosition = (pos: number) => this.storage.pageTracker.getPageForPosition(pos, this.editor.view)
    this.storage.getNodesOnPage = (n: number) => this.storage.pageTracker.getNodesOnPage(n, this.editor.view)
    this.storage.getPageStats = () => this.storage.pageTracker.getPageStats(this.editor.view)
    this.storage.doesRangeSpanPages = (from: number, to: number) => this.storage.pageTracker.doesRangeSpanPages(from, to, this.editor.view)
    this.storage.getPageCount = () => this.storage.pageTracker.getPageCount(this.editor.view)
  },

  addCommands() {
    return {
      setPageFormat:
        (pageFormat: PageFormat) => () => {
          if (!isValidFormat(pageFormat)) {
            console.warn('Rejected invalid page format input. No change applied.')
            return false
          }
          this.storage.pageFormat = pageFormat
          const tr = this.editor.view.state.tr.setMeta('page-format-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          this.options.onPageFormatChange?.(pageFormat)
          return true
        },

      setFooter:
        (footer: PagesHeaderFooter) => () => {
          this.storage.footer = footer
          const tr = this.editor.view.state.tr.setMeta('footer-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          return true
        },

      setHeader:
        (header: PagesHeaderFooter) => () => {
          this.storage.header = header
          const tr = this.editor.view.state.tr.setMeta('header-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          return true
        },

      setPageGap:
        (pageGap: number) => () => {
          if (typeof pageGap !== 'number') pageGap = parseInt(pageGap as any, 10)
          if ((pageGap as number) <= 0) {
            console.warn('Page gap must be greater than 0')
            return false
          }
          this.storage.pageGap = pageGap as number
          const tr = this.editor.view.state.tr.setMeta('page-gap-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          return true
        },

      setHeaderHeight:
        (headerHeight: number = 50) => () => {
          if (typeof headerHeight !== 'number') headerHeight = parseInt(headerHeight as any, 10)
          if (headerHeight <= 0) {
            console.warn('Header height must be greater than 0')
            return false
          }
          this.storage.headerHeight = headerHeight
          const tr = this.editor.view.state.tr.setMeta('header-height-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          return true
        },

      setFooterHeight:
        (footerHeight: number = 50) => () => {
          if (typeof footerHeight !== 'number') footerHeight = parseInt(footerHeight as any, 10)
          if (footerHeight <= 0) {
            console.warn('Footer height must be greater than 0')
            return false
          }
          this.storage.footerHeight = footerHeight
          const tr = this.editor.view.state.tr.setMeta('footer-height-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          return true
        },

      setPageBreakBackground:
        (pageBreakBackground: string) => () => {
          this.storage.pageBreakBackground = pageBreakBackground
          const tr = this.editor.view.state.tr.setMeta('page-break-background-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          return true
        },

      setPaginationEnabled:
        (enabled: boolean) => () => {
          this.storage.paginationEnabled = !!enabled
          const tr = this.editor.view.state.tr.setMeta('pagination-enabled-change', Date.now())
          this.editor.view.dispatch(tr)
          injectStyles({ view: this.editor.view, options: this.options, storage: this.storage })
          return true
        },

      // Convenience readers
      getCurrentPage: () => ({ editor }) => this.storage.getCurrentPage?.(),
      getPageForPosition: (pos: number) => ({ editor }) => this.storage.getPageForPosition?.(pos),
      getNodesOnPage: (n: number) => ({ editor }) => this.storage.getNodesOnPage?.(n),
      getPageStats: () => ({ editor }) => this.storage.getPageStats?.(),
      doesRangeSpanPages: (from: number, to: number) => ({ editor }) => this.storage.doesRangeSpanPages?.(from, to),
    }
  },

  onDestroy() {
    stopMutationWatch()
    if (this.storage.styleElement && this.storage.styleElement.parentNode) {
      this.storage.styleElement.parentNode.removeChild(this.storage.styleElement)
      this.storage.styleElement = null
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    const editor = this.editor
    const storage = this.storage

    return [
      new Plugin<{ decos: DecorationSet }>({
        key: new PluginKey('pagination'),
        state: {
          init(_config, state) {
            // if disabled, render no decorations
            const decos = storage.paginationEnabled ? pageDecorations({ options, storage, isInitial: true }) : []
            return DecorationSet.create(state.doc, decos)
          },
          apply(tr, oldDecos, oldState, newState) {
            if (!storage.paginationEnabled) {
              return DecorationSet.empty
            }
            const nextCount = computePageCount({ view: editor.view, options, storage })
            const currentRendered = getRenderedPageCount(editor.view)
            if (nextCount !== currentRendered || metaChanges(tr)) {
              const decos = pageDecorations({ options, storage })
              return DecorationSet.create(newState.doc, [...decos])
            }
            return oldDecos
          },
        },
        props: {
          decorations(state) {
            return (this as any).getState(state)
          },
        },
      }),
    ]
  },
})

// -----------------------
// TableKit (custom table pieces + CSS Grid row)
// -----------------------

// Custom Table node (uses mergeAttributes and ensures content === tableRow+)
const Table = BaseTable.extend({
  content: 'tableRow+',
  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {}), 0]
  },
})

// td node view that provides a contentDOM
const TableCell = BaseTableCell.extend({
  name: 'tableCell',
  addNodeView() {
    return () => {
      const td = document.createElement('td')
      return { dom: td, contentDOM: td }
    }
  },
})

// th renderHTML that merges attributes
const TableHeader = BaseTableHeader.extend({
  name: 'tableHeader',
  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
})

// tr node view that renders a CSS Grid row with column sizes from colwidth attrs
const TableRow = BaseTableRow.extend({
  addNodeView() {
    return ({ node }) => {
      const tr = document.createElement('tr')
      const columns = (node as any).content.content.map((c: any) =>
        ((c.type.name === 'tableCell' || c.type.name === 'tableHeader') && c.attrs.colwidth ? `${c.attrs.colwidth}px` : '1fr'),
      )
      tr.style.display = 'grid'
      tr.style.gridTemplateColumns = columns.join(' ')
      // if a custom style is present at row attrs, prefer it
      tr.style.gridTemplateColumns = (node as any).attrs.style

      const refresh = () => {
        const cols = (node as any).content.content.map((c: any) =>
          ((c.type.name === 'tableCell' || c.type.name === 'tableHeader') && c.attrs.colwidth ? `${c.attrs.colwidth}px` : '1fr'),
        )
        tr.style.gridTemplateColumns = cols.join(' ')
        tr.style.gridTemplateColumns = (node as any).attrs.style
      }

      return { dom: tr, contentDOM: tr, update: () => void refresh() }
    }
  },
})

export type TableKitOptions = OriginalTableKitOptions

export const TableKit = Extension.create<TableKitOptions>({
  name: 'TableKit',
  addExtensions() {
    const exts: any[] = []
    if (this.options.table !== false) exts.push(Table.configure((this.options as any).table))
    if (this.options.tableCell !== false) exts.push(TableCell.configure((this.options as any).tableCell))
    if (this.options.tableHeader !== false) exts.push(TableHeader.configure((this.options as any).tableHeader))
    if (this.options.tableRow !== false) exts.push(TableRow.configure((this.options as any).tableRow))
    return exts
  },
})

// -----------------------
// PageKit (compose Pages + optional TableKit)
// -----------------------

export interface PageKitOptions {
  pages: PagesOptions
  table: TableKitOptions | false
}

export const PageKit = Extension.create<PageKitOptions>({
  name: 'PageKit',
  addExtensions() {
    const out: any[] = [Pages.configure(this.options.pages)]
    if (this.options.table) out.push(TableKit.configure(this.options.table))
    return out
  },
})

// -----------------------
// Module augmentation for commands/storage
// -----------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pages: {
      setPageFormat: (pageFormat: PageFormat) => ReturnType
      setFooter: (footer: PagesHeaderFooter) => ReturnType
      setHeader: (header: PagesHeaderFooter) => ReturnType
      setPageBreakBackground: (pageBreakBackground: string) => ReturnType
      setPageGap: (pageGap: number) => ReturnType
      setHeaderHeight: (headerHeight: number) => ReturnType
      setFooterHeight: (footerHeight: number) => ReturnType
      setPaginationEnabled: (enabled: boolean) => ReturnType // added
      getCurrentPage: () => ReturnType
      getPageForPosition: (pos: number) => ReturnType
      getNodesOnPage: (pageNumber: number) => ReturnType
      getPageStats: () => ReturnType
      doesRangeSpanPages: (from: number, to: number) => ReturnType
    }
  }
  interface Storage {
    pages: PagesStorage
  }
}


// End of file

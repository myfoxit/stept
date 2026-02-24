import { NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state'
import type { Attrs, Node } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { isTextSelection, isNodeSelection, posToDOMRect } from '@tiptap/react'
import { findNodePosition, isValidPosition } from './editor-utils'

const NODE_TYPE_LABELS: Record<string, string> = {
  paragraph: 'text',
  codeBlock: 'Codeblock',
}

export type OverflowPosition = 'none' | 'top' | 'bottom' | 'both'

export const getNodeDisplayName = (editor: Editor | null): string => {
  if (!editor) return 'Node'
  const { selection } = editor.state
  if (selection instanceof NodeSelection) {
    const nodeType = selection.node.type.name
    return NODE_TYPE_LABELS[nodeType] || nodeType.toLowerCase()
  }
  const { $anchor } = selection
  const nodeType = $anchor.parent.type.name
  return NODE_TYPE_LABELS[nodeType] || nodeType.toLowerCase()
}

export function getElementOverflowPosition(
  targetElement: Element,
  containerElement: HTMLElement
): OverflowPosition {
  const targetBounds = targetElement.getBoundingClientRect()
  const containerBounds = containerElement.getBoundingClientRect()
  const isOverflowingTop = targetBounds.top < containerBounds.top
  const isOverflowingBottom = targetBounds.bottom > containerBounds.bottom
  if (isOverflowingTop && isOverflowingBottom) return 'both'
  if (isOverflowingTop) return 'top'
  if (isOverflowingBottom) return 'bottom'
  return 'none'
}

export const isSelectionValid = (
  editor: Editor | null,
  selection?: Selection,
  excludedNodeTypes: string[] = ['imageUpload']
): boolean => {
  if (!editor) return false
  if (!selection) selection = editor.state.selection
  const { state } = editor
  const { doc } = state
  const { empty, from, to } = selection
  const isEmptyTextBlock =
    !doc.textBetween(from, to).length && isTextSelection(selection)
  const isCodeBlock =
    selection.$from.parent.type.spec.code ||
    (isNodeSelection(selection) && selection.node.type.spec.code)
  const isExcludedNode =
    isNodeSelection(selection) &&
    excludedNodeTypes.includes(selection.node.type.name)
  return !empty && !isEmptyTextBlock && !isCodeBlock && !isExcludedNode
}

export const isTextSelectionValid = (editor: Editor | null): boolean => {
  if (!editor) return false
  const { state } = editor
  const { selection } = state
  return (
    isTextSelection(selection) &&
    !selection.empty &&
    !selection.$from.parent.type.spec.code &&
    !isNodeSelection(selection)
  )
}

export const getSelectionBoundingRect = (editor: Editor): DOMRect | null => {
  const { state } = editor.view
  const { selection } = state
  const { ranges } = selection
  const from = Math.min(...ranges.map((range) => range.$from.pos))
  const to = Math.max(...ranges.map((range) => range.$to.pos))
  if (isNodeSelection(selection)) {
    const node = editor.view.nodeDOM(from) as HTMLElement
    if (node) return node.getBoundingClientRect()
  }
  return posToDOMRect(editor.view, from, to)
}

export const getAvatar = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  const randomFraction = (Math.abs(hash) % 1000000) / 1000000
  const id = 1 + Math.floor(randomFraction * 20)
  const idString = id.toString().padStart(2, '0')
  return `/avatars/memoji_${idString}.png`
}

export function chunkArray<T>(array: Array<T>, size: number): Array<Array<T>> {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
    array.slice(index * size, index * size + size)
  )
}

export function getActiveMarkAttrs(
  editor: Editor | null,
  markName: string
): Attrs | null {
  if (!editor) return null
  const { state } = editor
  const { from, to, empty, $from } = state.selection
  if (empty) {
    const mark = $from.marks().find((m) => m.type.name === markName)
    return mark?.attrs ?? null
  }
  const seen = new Set<string>()
  let foundAttrs: Attrs | null = null
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type.name === markName && !seen.has(mark.type.name)) {
        seen.add(mark.type.name)
        foundAttrs = mark.attrs
      }
    }
  })
  return foundAttrs
}

export function hasContentAbove(editor: Editor | null): {
  hasContent: boolean
  content: string
} {
  if (!editor) return { hasContent: false, content: '' }
  const { state } = editor
  const { $from } = state.selection
  for (let i = $from.index(0) - 1; i >= 0; i--) {
    const node = state.doc.child(i)
    const content = node.textContent.trim()
    if (content) return { hasContent: true, content }
  }
  return { hasContent: false, content: '' }
}

export function selectionHasText(editor: Editor | null): boolean {
  if (!editor) return false
  const { state } = editor
  const { selection, doc } = state
  if (selection.empty) return false
  const text = doc.textBetween(selection.from, selection.to, '\n', '\0')
  return text.trim().length > 0
}

export function getSelectedDOMElement(editor: Editor): HTMLElement | null {
  const { state, view } = editor
  const { selection } = state

  if (selection instanceof NodeSelection) {
    return view.nodeDOM(selection.from) as HTMLElement | null
  }

  if (selection instanceof TextSelection) {
    const $anchor = selection.$anchor
    if ($anchor.depth >= 1) {
      const dom = view.nodeDOM($anchor.before(1))
      if (dom instanceof HTMLElement) {
        return dom
      }
    }
  }

  return null
}

export function findSelectionPosition(params: {
  editor: Editor
  node?: Node | null
  nodePos?: number | null
}): number | null {
  const { editor, node, nodePos } = params
  if (isValidPosition(nodePos)) return nodePos
  if (node) {
    const found = findNodePosition({ editor, node })
    if (found) return found.pos
  }
  const { selection } = editor.state
  if (!selection.empty) return null
  const resolvedPos = selection.$anchor
  const nodeDepth = 1
  const selectedNode = resolvedPos.node(nodeDepth)
  return selectedNode ? resolvedPos.before(nodeDepth) : null
}

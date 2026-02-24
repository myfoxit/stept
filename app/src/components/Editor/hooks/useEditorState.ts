import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'

type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6
type TextAlign = 'left' | 'center' | 'right' | 'justify'

export interface EditorFormatState {
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  isStrikethrough: boolean
  isCode: boolean
  isSubscript: boolean
  isSuperscript: boolean
  isHighlight: boolean
  isBulletList: boolean
  isOrderedList: boolean
  isTaskList: boolean
  isBlockquote: boolean
  isCodeBlock: boolean
  isLink: boolean
  headingLevel: HeadingLevel
  textAlign: TextAlign
}

const defaultState: EditorFormatState = {
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrikethrough: false,
  isCode: false,
  isSubscript: false,
  isSuperscript: false,
  isHighlight: false,
  isBulletList: false,
  isOrderedList: false,
  isTaskList: false,
  isBlockquote: false,
  isCodeBlock: false,
  isLink: false,
  headingLevel: 0,
  textAlign: 'left',
}

function getHeadingLevel(editor: Editor): HeadingLevel {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive('heading', { level })) return level
  }
  return 0
}

function getTextAlign(editor: Editor): TextAlign {
  if (editor.isActive({ textAlign: 'center' })) return 'center'
  if (editor.isActive({ textAlign: 'right' })) return 'right'
  if (editor.isActive({ textAlign: 'justify' })) return 'justify'
  return 'left'
}

export function useEditorState(editor: Editor | null): EditorFormatState {
  const [state, setState] = useState<EditorFormatState>(defaultState)

  const updateState = useCallback(() => {
    if (!editor) {
      setState(defaultState)
      return
    }

    setState({
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isUnderline: editor.isActive('underline'),
      isStrikethrough: editor.isActive('strike'),
      isCode: editor.isActive('code'),
      isSubscript: editor.isActive('subscript'),
      isSuperscript: editor.isActive('superscript'),
      isHighlight: editor.isActive('highlight'),
      isBulletList: editor.isActive('bulletList'),
      isOrderedList: editor.isActive('orderedList'),
      isTaskList: editor.isActive('taskList'),
      isBlockquote: editor.isActive('blockquote'),
      isCodeBlock: editor.isActive('codeBlock'),
      isLink: editor.isActive('link'),
      headingLevel: getHeadingLevel(editor),
      textAlign: getTextAlign(editor),
    })
  }, [editor])

  useEffect(() => {
    if (!editor) return

    updateState()

    editor.on('selectionUpdate', updateState)
    editor.on('transaction', updateState)

    return () => {
      editor.off('selectionUpdate', updateState)
      editor.off('transaction', updateState)
    }
  }, [editor, updateState])

  return state
}

import { ImageUploadNode } from '@/components/Editor/Nodes/image-upload-node'
import { MAX_FILE_SIZE, handleImageUpload } from '@/components/Editor/utils/editor-utils'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import TextAlign from '@tiptap/extension-text-align'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import Typography from '@tiptap/extension-typography'
import UniqueID from '@tiptap/extension-unique-id'
import { ResizableImage } from '@/components/Editor/Nodes/ResizableImage'
import { Placeholder, Selection } from '@tiptap/extensions'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Highlight } from '@tiptap/extension-highlight'
import ProcessRecordingNode from '@/components/Editor/Nodes/ProcessRecordingNode/ProcessRecordingNode'
import { Pages } from '@/components/Editor/Extensions/pagination'
import { createSlashMenuExtension } from '@/components/Editor/SlashMenu'

export function useSteptEditor({ readOnly = false }: { readOnly?: boolean } = {}) {
  return useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'stept-editor',
      },
    },
    extensions: [
      StarterKit.configure({
        undoRedo: {},
        horizontalRule: false,
        dropcursor: {
          width: 2,
        },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          },
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),

      Placeholder.configure({
        placeholder: 'Start writing...',
        emptyNodeClass: 'is-empty with-slash',
      }),

      Color,
      TextStyle,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Selection,

      ResizableImage,
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error: unknown) => console.error('Upload failed:', error),
      }),
      UniqueID,
      Typography,
      ProcessRecordingNode,
      createSlashMenuExtension(),
      Pages.configure({
        pageFormat: 'A4',
        headerHeight: 1,
        pageBreakBackground: '#fbfbfb',
        footerHeight: 0,
        pageGap: 50,
        header: '',
        footer: '',
      }),
    ],
  })
}

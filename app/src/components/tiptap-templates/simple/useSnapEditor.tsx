import { VariableStore } from '@/components/Editor/Extensions/VariableStore';
import ButtonNode from '@/components/Editor/Nodes/ButtonNode/ButtonNode';
import CardListNode from '@/components/Editor/Nodes/CardListNode/CardListNode';
import HeroNode from '@/components/Editor/Nodes/HeroNode/HeroNode';
import { UiState } from '@/components/tiptap-extensions/ui-state-extension';
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node';
import { MAX_FILE_SIZE, handleImageUpload } from '@/lib/tiptap-utils';
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Mathematics from '@tiptap/extension-mathematics';
import Mention from '@tiptap/extension-mention';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Typography from '@tiptap/extension-typography';
import UniqueID from '@tiptap/extension-unique-id';
import { Placeholder } from '@tiptap/extensions';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Superscript, Subscript } from 'lucide-react';
import { Highlight } from '@tiptap/extension-highlight';
import { VariableNode } from '@/components/Editor/Nodes/VariableNode/VariableNode';
import DataTableNode from '@/components/Editor/Nodes/DataTableNode/DataTableNode';
import ProcessRecordingNode from '@/components/Editor/Nodes/ProcessRecordingNode/ProcessRecordingNode';
import { Pages } from '@/components/tiptap-extensions/pagination';

export function useSnapEditor({}) {
  return useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'notion-like-editor',
      },
    },
    extensions: [
      StarterKit.configure({
        undoRedo: true,
        horizontalRule: false,
        dropcursor: {
          width: 2,
        },
        link: { openOnClick: false },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),

      Placeholder.configure({
        placeholder: 'Start writing...',
        emptyNodeClass: 'is-empty with-slash',
      }),
      Mention,
      Emoji.configure({
        emojis: gitHubEmojis.filter(
          (emoji) => !emoji.name.includes('regional')
        ),
        forceFallbackImages: true,
      }),
      Mathematics,
      Superscript,
      Subscript,
      Color,
      TextStyle,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Selection,
      CardListNode,
      ButtonNode,
      HeroNode,

      Image,
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error('Upload failed:', error),
      }),
      UniqueID,
      Typography,
      UiState,
      VariableStore,
      VariableNode,
      DataTableNode,
      ProcessRecordingNode,
      Pages.configure({
        pageFormat: 'A4',
        headerHeight: 1,
        pageBreakColor: '#fbfbfb',
        footerHeight: 0,
        pageGap: 50,
        header: '',
        footer: '',
      }),
    ],
  });
}

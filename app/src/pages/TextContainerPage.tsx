import { Link, useParams } from 'react-router-dom';
import { NotionEditor } from '@/components/tiptap-templates/simple/notion-editor';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { IconPlus } from '@tabler/icons-react';
import { TextContainerEditor } from '@/components/tiptap-templates/simple/text-container-editor';

export default function EditorPage() {
  const { tableId, rowId } = useParams<{ tableId: string; rowId: string }>();

  return (
    <div>
      <TextContainerEditor />
    </div>
  );
}

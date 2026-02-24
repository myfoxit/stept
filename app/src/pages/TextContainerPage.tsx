import { Link, useParams } from 'react-router-dom';
import { OndokiEditor } from "@/components/Editor/OndokiEditor";
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { IconPlus } from '@tabler/icons-react';
import { TextContainerEditor } from '@/components/Editor/TextContainerEditor';

export default function EditorPage() {
  const { tableId, rowId } = useParams<{ tableId: string; rowId: string }>();

  return (
    <div>
      <TextContainerEditor />
    </div>
  );
}

import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface ReindexCardProps {
  projectId: string;
}

export function ReindexCard({ projectId }: ReindexCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleReindex = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const { data } = await apiClient.post(`/search/reindex?project_id=${projectId}`);
      setStatus('success');
      setMessage(`Indexed ${data.embeddings_created} embeddings`);
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.response?.data?.detail || 'Reindex failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Knowledge Base Index</CardTitle>
        <CardDescription>
          Rebuild the AI search index for all documents and workflows in this project.
          This enables semantic RAG search in the chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Button
          onClick={handleReindex}
          disabled={status === 'loading'}
          variant={status === 'error' ? 'destructive' : 'outline'}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${status === 'loading' ? 'animate-spin' : ''}`} />
          {status === 'loading' ? 'Indexing...' : 'Reindex Knowledge Base'}
        </Button>
        {status === 'success' && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> {message}
          </span>
        )}
        {status === 'error' && (
          <span className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" /> {message}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

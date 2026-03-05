import { useEffect, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileTypeIcon, getFileTypeLabel } from '@/components/ui/file-type-icon';
import { apiClient } from '@/lib/apiClient';

interface FileViewerProps {
  docId: string;
  mime: string;
  fileName?: string | null;
}

/**
 * Fetch the file as a blob with auth headers and return an object URL.
 * Needed because iframes/img tags can't send auth headers.
 */
function useAuthenticatedFileUrl(docId: string) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    apiClient.get(`/documents/${docId}/file`, { responseType: 'blob' })
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId]);

  return url;
}

function handleDownload(docId: string, fileName?: string | null) {
  apiClient.get(`/documents/${docId}/file`, { responseType: 'blob' })
    .then((res) => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'download';
      a.click();
      URL.revokeObjectURL(url);
    });
}

export function FileViewer({ docId, mime, fileName }: FileViewerProps) {
  const blobUrl = useAuthenticatedFileUrl(docId);
  const label = getFileTypeLabel(mime) || 'File';

  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="rounded-lg border bg-card">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileTypeIcon mime={mime} className="size-5" />
            <span className="font-medium text-foreground">{fileName || 'Uploaded file'}</span>
            <span className="text-xs opacity-60">({label})</span>
          </div>
          <div className="flex items-center gap-2">
            {isPdf && blobUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={blobUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" />
                  Open
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => handleDownload(docId, fileName)}>
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        </div>

        {/* Preview area */}
        <div className="p-4">
          {isImage && blobUrl && (
            <img
              src={blobUrl}
              alt={fileName || 'Uploaded image'}
              className="mx-auto max-h-[600px] rounded-md object-contain"
            />
          )}

          {isPdf && blobUrl && (
            <iframe
              src={blobUrl}
              title={fileName || 'PDF preview'}
              className="h-[700px] w-full rounded-md border-0"
            />
          )}

          {!isImage && !isPdf && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <FileTypeIcon mime={mime} className="size-12 opacity-50" />
              <p className="text-sm">Preview not available for {label} files.</p>
              <Button variant="default" size="sm" onClick={() => handleDownload(docId, fileName)}>
                <Download className="size-3.5" />
                Download {fileName || 'file'}
              </Button>
            </div>
          )}

          {(isImage || isPdf) && !blobUrl && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading preview…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

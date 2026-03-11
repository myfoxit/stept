import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SettingsLayout } from '@/components/settings-layout';
import { apiClient } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileVideo, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface ImportSession {
  session_id: string;
  name: string;
  video_filename: string;
  video_size_bytes: number;
  processing_stage: string | null;
  processing_progress: number;
  processing_error: string | null;
  is_processed: boolean;
  created_at: string | null;
}

interface UploadStatus {
  stage: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  sessionId: string | null;
  error: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  uploading: 'Uploading video...',
  queued: 'Queued for processing...',
  extracting_audio: 'Extracting audio...',
  transcribing: 'Transcribing narration...',
  extracting_frames: 'Extracting key frames...',
  analyzing: 'Analyzing screenshots...',
  generating: 'Generating guide steps...',
  done: 'Complete!',
  failed: 'Processing failed',
};

export function VideoImportPage() {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    stage: 'idle', progress: 0, sessionId: null, error: null,
  });
  const [imports, setImports] = useState<ImportSession[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchImports = useCallback(async () => {
    try {
      const res = await apiClient.get('/video-import/list');
      setImports(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  // Poll for processing status
  useEffect(() => {
    if (uploadStatus.stage !== 'processing' || !uploadStatus.sessionId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get(`/video-import/status/${uploadStatus.sessionId}`);
        const data = res.data;
        const progress = data.processing_progress ?? 0;
        const stage = data.processing_stage ?? 'queued';

        if (stage === 'done' || data.is_processed) {
          setUploadStatus({ stage: 'done', progress: 100, sessionId: uploadStatus.sessionId, error: null });
          fetchImports();
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (stage === 'failed') {
          setUploadStatus({ stage: 'error', progress, sessionId: uploadStatus.sessionId, error: data.processing_error || 'Processing failed' });
          fetchImports();
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else {
          setUploadStatus(prev => ({ ...prev, progress }));
        }
      } catch { /* ignore polling errors */ }
    }, 2000);

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [uploadStatus.stage, uploadStatus.sessionId, fetchImports]);

  const handleUpload = useCallback(async (file: File) => {
    const allowedExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setUploadStatus({ stage: 'error', progress: 0, sessionId: null, error: `Unsupported file type: ${ext}` });
      return;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setUploadStatus({ stage: 'error', progress: 0, sessionId: null, error: 'File too large. Maximum size is 2 GB.' });
      return;
    }

    setUploadStatus({ stage: 'uploading', progress: 0, sessionId: null, error: null });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post('/video-import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            setUploadStatus(prev => ({ ...prev, progress: Math.round((e.loaded / e.total!) * 100) }));
          }
        },
      });
      setUploadStatus({ stage: 'processing', progress: 0, sessionId: res.data.session_id, error: null });
      fetchImports();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Upload failed';
      setUploadStatus({ stage: 'error', progress: 0, sessionId: null, error: msg });
    }
  }, [fetchImports]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  }, [handleUpload]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const isUploading = uploadStatus.stage === 'uploading' || uploadStatus.stage === 'processing';

  return (
    <SettingsLayout title="Video \u2192 Guide" description="Upload a screen recording to automatically generate a step-by-step guide.">
      {/* Upload area */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
              isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
          >
            {uploadStatus.stage === 'idle' && (
              <>
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Drop a video file here or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">
                  MP4, MOV, AVI, MKV, WebM, M4V &mdash; up to 2 GB
                </p>
              </>
            )}
            {uploadStatus.stage === 'uploading' && (
              <>
                <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
                <p className="text-lg font-medium">Uploading... {uploadStatus.progress}%</p>
                <div className="w-full max-w-xs mx-auto mt-3 bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${uploadStatus.progress}%` }} />
                </div>
              </>
            )}
            {uploadStatus.stage === 'processing' && (
              <>
                <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
                <p className="text-lg font-medium">{STAGE_LABELS[uploadStatus.sessionId ? 'queued' : 'processing'] || 'Processing...'}</p>
                <p className="text-sm text-muted-foreground mt-1">Progress: {uploadStatus.progress}%</p>
                <div className="w-full max-w-xs mx-auto mt-3 bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${uploadStatus.progress}%` }} />
                </div>
              </>
            )}
            {uploadStatus.stage === 'done' && (
              <>
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
                <p className="text-lg font-medium text-green-600">Guide generated successfully!</p>
                <Button variant="outline" className="mt-3" onClick={(e) => { e.stopPropagation(); setUploadStatus({ stage: 'idle', progress: 0, sessionId: null, error: null }); }}>
                  Upload another
                </Button>
              </>
            )}
            {uploadStatus.stage === 'error' && (
              <>
                <XCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
                <p className="text-lg font-medium text-destructive">Error</p>
                <p className="text-sm text-muted-foreground mt-1">{uploadStatus.error}</p>
                <Button variant="outline" className="mt-3" onClick={(e) => { e.stopPropagation(); setUploadStatus({ stage: 'idle', progress: 0, sessionId: null, error: null }); }}>
                  Try again
                </Button>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.avi,.mkv,.webm,.m4v"
            className="hidden"
            onChange={onFileSelect}
          />
        </CardContent>
      </Card>

      {/* Previous imports */}
      {imports.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Previous Imports</h2>
          <div className="space-y-2">
            {imports.map((imp) => (
              <Card key={imp.session_id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <FileVideo className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{imp.name || imp.video_filename}</p>
                    <p className="text-sm text-muted-foreground">
                      {imp.video_size_bytes ? formatSize(imp.video_size_bytes) : ''}{' '}
                      {imp.created_at ? `\u2022 ${new Date(imp.created_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-sm">
                    {imp.is_processed && (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" /> Done
                      </span>
                    )}
                    {imp.processing_stage === 'failed' && (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <XCircle className="h-4 w-4" /> Failed
                      </span>
                    )}
                    {!imp.is_processed && imp.processing_stage !== 'failed' && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {STAGE_LABELS[imp.processing_stage || ''] || imp.processing_stage || 'Queued'}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}

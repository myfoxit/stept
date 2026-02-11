import * as React from 'react';
import {
  IconX,
  IconCopy,
  IconDownload,
  IconFileText,
  IconLoader2,
  IconCheck,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { streamGuide, getGuide } from '@/api/processing';

interface GuidePanelProps {
  open: boolean;
  onClose: () => void;
  recordingId: string;
  existingGuide?: string | null;
}

/** Simple markdown to HTML renderer (handles headers, bold, italic, lists, blockquotes, code). */
function renderMarkdown(md: string): string {
  let html = md
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.slice(3, -3).replace(/^\w+\n/, '');
      return `<pre class="bg-slate-900 text-slate-100 rounded-lg p-4 text-sm overflow-x-auto my-3"><code>${code}</code></pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded text-sm">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2 text-slate-800">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3 text-slate-900">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4 text-slate-900">$1</h1>')
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-indigo-300 bg-indigo-50 pl-4 py-2 my-3 text-sm text-indigo-800 italic">$1</blockquote>')
    // Numbered lists
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-6 list-decimal my-1">$2</li>')
    // Bullet lists
    .replace(/^[*-] (.+)$/gm, '<li class="ml-6 list-disc my-1">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="my-2">')
    .replace(/\n/g, '<br/>');

  return `<div class="prose prose-sm max-w-none"><p class="my-2">${html}</p></div>`;
}

export function GuidePanel({ open, onClose, recordingId, existingGuide }: GuidePanelProps) {
  const [guideContent, setGuideContent] = React.useState(existingGuide || '');
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Load existing guide when opening
  React.useEffect(() => {
    if (open && !guideContent && !isStreaming) {
      setIsLoading(true);
      getGuide(recordingId)
        .then((resp) => {
          if (resp.guide_markdown) {
            setGuideContent(resp.guide_markdown);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [open, recordingId]);

  // Reset when recordingId changes
  React.useEffect(() => {
    setGuideContent(existingGuide || '');
  }, [recordingId, existingGuide]);

  const handleStream = () => {
    setGuideContent('');
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    streamGuide(
      recordingId,
      (chunk) => {
        setGuideContent((prev) => prev + chunk);
      },
      () => setIsStreaming(false),
      (error) => {
        console.error('Guide streaming error:', error);
        setIsStreaming(false);
      },
      controller.signal,
    );
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(guideContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([guideContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guide.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <IconFileText className="h-5 w-5 text-indigo-600" />
              Generated Guide
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b bg-slate-50 flex-shrink-0">
          {!isStreaming ? (
            <Button size="sm" onClick={handleStream} variant="default" className="bg-indigo-600 hover:bg-indigo-700">
              <IconFileText className="mr-1.5 h-3.5 w-3.5" />
              {guideContent ? 'Regenerate' : 'Generate Guide'}
            </Button>
          ) : (
            <Button size="sm" onClick={handleStop} variant="destructive">
              <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Stop
            </Button>
          )}

          {guideContent && (
            <>
              <Button size="sm" variant="ghost" onClick={handleCopy}>
                {copied ? <IconCheck className="mr-1.5 h-3.5 w-3.5" /> : <IconCopy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDownloadMd}>
                <IconDownload className="mr-1.5 h-3.5 w-3.5" />
                Download MD
              </Button>
            </>
          )}
        </div>

        {/* Guide content */}
        <ScrollArea className="flex-1 px-6 py-4" ref={scrollRef}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <IconLoader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading guide…
            </div>
          ) : guideContent ? (
            <div
              className="text-sm text-slate-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(guideContent) }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <IconFileText className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No guide generated yet</p>
              <p className="text-xs mt-1">Click "Generate Guide" to create a polished documentation</p>
            </div>
          )}

          {isStreaming && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-500">
              <IconLoader2 className="h-3 w-3 animate-spin" />
              Writing…
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

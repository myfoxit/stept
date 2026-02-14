import React, { useState, useEffect } from 'react';
import { AnnotatedStep, RecordedStep } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { X, Copy, Save, RefreshCw, Loader2, AlertTriangle, FileText, Code2 } from 'lucide-react';
import { getStepTitle } from '../utils/stepDisplay';

interface GuidePreviewProps {
  steps: any[];
  onClose: () => void;
}

interface GuideSection {
  title: string;
  content: string;
  steps: number[];
}

const GuidePreview: React.FC<GuidePreviewProps> = ({ steps, onClose }) => {
  const electronAPI = useElectronAPI();
  const [guide, setGuide] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown'>('preview');

  useEffect(() => { generateGuide(); }, []);

  const generateGuide = async () => {
    if (!electronAPI) { setError('Electron API not available'); return; }
    if (steps.length === 0) { setError('No steps available'); return; }
    try {
      setIsGenerating(true); setIsStreaming(true); setError(null); setGuide('');
      const recordedSteps = steps.map(step => ({
        stepNumber: step.stepNumber, timestamp: step.timestamp, actionType: step.actionType,
        windowTitle: step.windowTitle, description: step.description, screenshotPath: step.screenshotPath,
        globalMousePosition: step.globalMousePosition, relativeMousePosition: step.relativeMousePosition,
        windowSize: step.windowSize, screenshotRelativeMousePosition: step.screenshotRelativeMousePosition,
        screenshotSize: step.screenshotSize, textTyped: step.textTyped, scrollDelta: step.scrollDelta,
        elementName: step.elementName,
      }));
      const generatedGuide = await electronAPI.generateGuide(recordedSteps);
      await simulateStreaming(generatedGuide);
      setIsStreaming(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate guide');
      setIsStreaming(false);
    } finally { setIsGenerating(false); }
  };

  const simulateStreaming = async (fullGuide: string) => {
    const words = fullGuide.split(' ');
    let current = '';
    for (let i = 0; i < words.length; i++) {
      current += (i > 0 ? ' ' : '') + words[i];
      setGuide(current);
      await new Promise(r => setTimeout(r, 50));
    }
  };

  const parseGuide = (text: string): GuideSection[] => {
    const lines = text.split('\n');
    const sections: GuideSection[] = [];
    let cur: GuideSection | null = null;
    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ')) {
        if (cur) sections.push(cur);
        cur = { title: line.replace(/^#+\s*/, ''), content: '', steps: [] };
      } else if (cur) {
        cur.content += line + '\n';
        const matches = line.match(/step\s+(\d+)/gi);
        if (matches) matches.forEach(m => {
          const n = parseInt(m.replace(/step\s+/i, ''));
          if (!cur!.steps.includes(n)) cur!.steps.push(n);
        });
      }
    }
    if (cur) sections.push(cur);
    return sections;
  };

  const renderMarkdown = (text: string) => {
    return text
      .replace(/^### (.*$)/gim, '<h3 class="text-[13px] font-semibold text-gray-800 mt-3 mb-1">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-[14px] font-semibold text-gray-800 mt-4 mb-1.5">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-[16px] font-bold text-gray-900 mt-5 mb-2">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 text-gray-700 px-1 py-0.5 rounded text-[12px] font-mono">$1</code>')
      .replace(/^\d+\.\s(.*)$/gim, '<li class="mb-0.5 text-[13px]">$1</li>')
      .replace(/^-\s(.*)$/gim, '<li class="mb-0.5 text-[13px]">$1</li>')
      .replace(/\n/g, '<br>');
  };

  const copyToClipboard = async () => {
    try { await navigator.clipboard.writeText(guide); } catch {}
  };

  const sections = guide ? parseGuide(guide) : [];

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-4xl" style={{ height: '75vh' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-gray-800">Guide Preview</h2>
            <p className="text-[11px] text-gray-400">{steps.length} steps</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-md p-0.5">
              <button onClick={() => setActiveTab('preview')}
                className={`px-2.5 py-1 text-[12px] rounded transition-colors ${activeTab === 'preview' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                <FileText className="h-3 w-3 inline mr-1" />Preview
              </button>
              <button onClick={() => setActiveTab('markdown')}
                className={`px-2.5 py-1 text-[12px] rounded transition-colors ${activeTab === 'markdown' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
                <Code2 className="h-3 w-3 inline mr-1" />Markdown
              </button>
            </div>
            <button onClick={onClose} className="btn-icon"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {isGenerating && !guide && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500 mb-2" />
              <p className="text-[13px] font-medium text-gray-700">Generating Guide...</p>
              <p className="text-xs text-gray-400">{steps.length} steps</p>
            </div>
          )}

          {error && !guide && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-[13px] font-medium text-gray-700 mb-1">Generation Failed</p>
              <p className="text-xs text-gray-400 mb-3">{error}</p>
              <button onClick={generateGuide} className="btn-primary">Try Again</button>
            </div>
          )}

          {guide && (
            <>
              <div className="flex-1 p-4 overflow-y-auto scrollbar-thin">
                {activeTab === 'preview' ? (
                  <div>
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(guide) }} />
                    {isStreaming && (
                      <div className="flex items-center gap-1.5 mt-3">
                        <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                        <span className="text-[11px] text-gray-400">Generating...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="text-[12px] bg-gray-50 p-3 rounded-md overflow-auto whitespace-pre-wrap font-mono text-gray-700">{guide}</pre>
                )}
              </div>

              {sections.length > 0 && activeTab === 'preview' && (
                <div className="w-48 border-l p-3 overflow-y-auto scrollbar-thin">
                  <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">Sections</h4>
                  <div className="space-y-1.5">
                    {sections.map((s, i) => (
                      <div key={i} className="text-[12px] text-gray-600">{s.title}</div>
                    ))}
                  </div>
                  <hr className="my-2" />
                  <h4 className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-2">Steps</h4>
                  <div className="space-y-1">
                    {steps.slice(0, 10).map(step => (
                      <div key={step.stepNumber} className="text-[11px] bg-gray-50 p-1.5 rounded">
                        <span className="font-medium text-gray-600">#{step.stepNumber}</span>
                        <span className="text-gray-400 ml-1 truncate block">
                          {getStepTitle(step)}
                        </span>
                      </div>
                    ))}
                    {steps.length > 10 && <p className="text-[11px] text-gray-400 text-center">+{steps.length - 10} more</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {guide && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <span className="text-[11px] text-gray-400">{guide.split(' ').length} words</span>
            <div className="flex gap-1.5">
              <button onClick={copyToClipboard} className="btn-secondary btn-sm gap-1"><Copy className="h-3 w-3" /> Copy</button>
              <button onClick={generateGuide} disabled={isGenerating} className="btn-secondary btn-sm gap-1">
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
              <button onClick={onClose} className="btn-primary btn-sm">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuidePreview;

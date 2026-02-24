/**
 * Render TipTap JSON content to React elements.
 * Lightweight — no TipTap editor dependency, works for public pages.
 */
import React from 'react';
import { getApiBaseUrl } from '@/lib/apiClient';

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  attrs?: Record<string, any>;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}

function renderMarks(text: string, marks?: Array<{ type: string; attrs?: Record<string, any> }>): React.ReactNode {
  if (!marks || marks.length === 0) return text;

  let node: React.ReactNode = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'strike':
        node = <s>{node}</s>;
        break;
      case 'code':
        node = <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{node}</code>;
        break;
      case 'link':
        node = (
          <a href={mark.attrs?.href} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
            {node}
          </a>
        );
        break;
      case 'highlight':
        node = <mark className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">{node}</mark>;
        break;
      case 'textStyle':
        node = <span style={{ color: mark.attrs?.color }}>{node}</span>;
        break;
      case 'superscript':
        node = <sup>{node}</sup>;
        break;
      case 'subscript':
        node = <sub>{node}</sub>;
        break;
      default:
        break;
    }
  }
  return node;
}

// ---------------------------------------------------------------------------
// Embedded Workflow component — fetches workflow data + renders inline
// ---------------------------------------------------------------------------

interface WorkflowStep {
  step_number: number;
  step_type?: string;
  description?: string;
  window_title?: string;
  generated_title?: string;
  generated_description?: string;
  text_typed?: string;
  key_pressed?: string;
}

interface WorkflowData {
  id: string;
  name?: string;
  steps: WorkflowStep[];
  total_steps: number;
  guide_markdown?: string;
}

function EmbeddedWorkflow({ sessionId, documentShareToken }: { sessionId: string; documentShareToken?: string }) {
  const [data, setData] = React.useState<WorkflowData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);

  React.useEffect(() => {
    if (!sessionId || !documentShareToken) {
      setLoading(false);
      setError(true);
      return;
    }
    const baseUrl = getApiBaseUrl().replace('/api/v1', '');
    fetch(`${baseUrl}/api/v1/public/document/${documentShareToken}/embedded-workflow/${sessionId}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [sessionId, documentShareToken]);

  if (loading) {
    return (
      <div className="border rounded-lg p-6 bg-muted/30 mb-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-3"></div>
        <div className="h-48 bg-muted rounded"></div>
      </div>
    );
  }

  if (error || !data || data.steps.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-muted/20 mb-4 text-center text-muted-foreground text-sm">
        <p>This workflow is not available.</p>
      </div>
    );
  }

  const baseUrl = getApiBaseUrl().replace('/api/v1', '');
  const step = data.steps[currentStep];
  const imageUrl = `${baseUrl}/api/v1/public/document/${documentShareToken}/embedded-workflow/${sessionId}/image/${step.step_number}`;
  const screenshotSteps = data.steps.filter(s =>
    !s.step_type || ['screenshot', 'capture', 'gif', 'video'].includes(s.step_type)
  );

  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-sm mb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950 dark:to-indigo-950 px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-sm">{data.name || 'Workflow'}</h4>
          <p className="text-xs text-muted-foreground">{data.total_steps} steps</p>
        </div>
      </div>

      {/* Step content */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900 text-xs font-semibold text-violet-700 dark:text-violet-300">
            {currentStep + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {step.generated_title || step.description || 'Step ' + step.step_number}
            </p>
            {step.window_title && (
              <p className="text-xs text-muted-foreground truncate">{step.window_title}</p>
            )}
          </div>
        </div>

        {step.generated_description && (
          <p className="text-sm text-muted-foreground">{step.generated_description}</p>
        )}

        <img
          src={imageUrl}
          alt={`Step ${step.step_number}`}
          className="w-full rounded-lg border"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        {/* Navigation */}
        {data.steps.length > 1 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="text-xs text-muted-foreground">
              {currentStep + 1} / {data.steps.length}
            </span>
            <button
              onClick={() => setCurrentStep(Math.min(data.steps.length - 1, currentStep + 1))}
              disabled={currentStep === data.steps.length - 1}
              className="px-3 py-1.5 text-xs font-medium rounded-md border bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node renderer
// ---------------------------------------------------------------------------

function renderNode(node: TipTapNode, index: number, ctx?: { documentShareToken?: string }): React.ReactNode {
  const children = node.content?.map((child, i) => renderNode(child, i, ctx));

  switch (node.type) {
    case 'doc':
      return <>{children}</>;

    case 'paragraph':
      return <p key={index} className="mb-3 leading-relaxed">{children || '\u00A0'}</p>;

    case 'heading': {
      const level = node.attrs?.level || 1;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      const sizes: Record<number, string> = {
        1: 'text-3xl font-bold mt-8 mb-4',
        2: 'text-2xl font-semibold mt-6 mb-3',
        3: 'text-xl font-semibold mt-5 mb-2',
        4: 'text-lg font-medium mt-4 mb-2',
        5: 'text-base font-medium mt-3 mb-1',
        6: 'text-sm font-medium mt-3 mb-1',
      };
      return <Tag key={index} className={sizes[level] || sizes[1]}>{children}</Tag>;
    }

    case 'bulletList':
      return <ul key={index} className="list-disc pl-6 mb-3 space-y-1">{children}</ul>;

    case 'orderedList':
      return <ol key={index} className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>;

    case 'listItem':
      return <li key={index}>{children}</li>;

    case 'taskList':
      return <ul key={index} className="space-y-1 mb-3">{children}</ul>;

    case 'taskItem': {
      const checked = node.attrs?.checked ?? false;
      return (
        <li key={index} className="flex items-start gap-2">
          <input type="checkbox" checked={checked} readOnly className="mt-1.5 rounded" />
          <div className={checked ? 'line-through text-muted-foreground' : ''}>{children}</div>
        </li>
      );
    }

    case 'blockquote':
      return (
        <blockquote key={index} className="border-l-4 border-violet-300 pl-4 italic text-muted-foreground mb-3">
          {children}
        </blockquote>
      );

    case 'codeBlock':
      return (
        <pre key={index} className="bg-muted rounded-lg p-4 overflow-x-auto mb-3">
          <code className="text-sm font-mono">{children}</code>
        </pre>
      );

    case 'horizontalRule':
      return <hr key={index} className="my-6 border-border" />;

    case 'image':
      return (
        <figure key={index} className="mb-4">
          <img
            src={node.attrs?.src}
            alt={node.attrs?.alt || ''}
            title={node.attrs?.title}
            className="max-w-full rounded-lg border"
          />
        </figure>
      );

    case 'table':
      return (
        <div key={index} className="overflow-x-auto mb-4">
          <table className="w-full border-collapse border border-border rounded-lg">
            <tbody>{children}</tbody>
          </table>
        </div>
      );

    case 'tableRow':
      return <tr key={index} className="border-b border-border">{children}</tr>;

    case 'tableHeader':
      return <th key={index} className="border border-border bg-muted px-3 py-2 text-left font-semibold text-sm">{children}</th>;

    case 'tableCell':
      return <td key={index} className="border border-border px-3 py-2 text-sm">{children}</td>;

    case 'hardBreak':
      return <br key={index} />;

    case 'text':
      return <React.Fragment key={index}>{renderMarks(node.text || '', node.marks)}</React.Fragment>;

    case 'process-recording-node':
      return (
        <EmbeddedWorkflow
          key={index}
          sessionId={node.attrs?.sessionId}
          documentShareToken={ctx?.documentShareToken}
        />
      );

    default:
      // Unknown node type — try to render children
      if (children) {
        return <div key={index}>{children}</div>;
      }
      return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface EditorRendererProps {
  content: any; // TipTap JSON (string or object)
  className?: string;
  /** Share token of the parent document — needed to load embedded workflows */
  documentShareToken?: string;
}

export function EditorRenderer({ content, className, documentShareToken }: EditorRendererProps) {
  const doc = React.useMemo(() => {
    if (!content) return null;
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        // Plain text fallback
        return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] };
      }
    }
    return content;
  }, [content]);

  if (!doc) {
    return <p className="text-muted-foreground italic">No content</p>;
  }

  return (
    <div className={`prose dark:prose-invert max-w-none ${className || ''}`}>
      {renderNode(doc, 0, { documentShareToken })}
    </div>
  );
}

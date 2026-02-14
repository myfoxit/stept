/**
 * Render TipTap JSON content to React elements.
 * Lightweight — no TipTap editor dependency, works for public pages.
 */
import React from 'react';

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

function renderNode(node: TipTapNode, index: number): React.ReactNode {
  const children = node.content?.map((child, i) => renderNode(child, i));

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
      // Embedded workflow — show a link/placeholder
      return (
        <div key={index} className="border rounded-lg p-4 bg-muted/30 mb-3">
          <p className="text-sm text-muted-foreground">📋 Embedded workflow</p>
        </div>
      );

    default:
      // Unknown node type — try to render children
      if (children) {
        return <div key={index}>{children}</div>;
      }
      return null;
  }
}

interface TipTapRendererProps {
  content: any; // TipTap JSON (string or object)
  className?: string;
}

export function TipTapRenderer({ content, className }: TipTapRendererProps) {
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
      {renderNode(doc, 0)}
    </div>
  );
}

import { FileText, FileSpreadsheet, Image, Code, Presentation, File } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIME_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  'application/pdf': { icon: FileText, color: 'text-red-500', label: 'PDF' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: FileText, color: 'text-blue-500', label: 'Word' },
  'application/msword': { icon: FileText, color: 'text-blue-500', label: 'Word' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { icon: Presentation, color: 'text-orange-500', label: 'PowerPoint' },
  'application/vnd.ms-powerpoint': { icon: Presentation, color: 'text-orange-500', label: 'PowerPoint' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: FileSpreadsheet, color: 'text-green-600', label: 'Excel' },
  'application/vnd.ms-excel': { icon: FileSpreadsheet, color: 'text-green-600', label: 'Excel' },
  'text/csv': { icon: FileSpreadsheet, color: 'text-green-600', label: 'CSV' },
  'text/html': { icon: Code, color: 'text-cyan-500', label: 'HTML' },
  'text/plain': { icon: FileText, color: 'text-gray-400', label: 'Text' },
  'text/markdown': { icon: FileText, color: 'text-gray-400', label: 'Markdown' },
  'text/x-markdown': { icon: FileText, color: 'text-gray-400', label: 'Markdown' },
  'image/jpeg': { icon: Image, color: 'text-purple-500', label: 'Image' },
  'image/jpg': { icon: Image, color: 'text-purple-500', label: 'Image' },
  'image/png': { icon: Image, color: 'text-purple-500', label: 'Image' },
  'image/gif': { icon: Image, color: 'text-purple-500', label: 'Image' },
  'image/webp': { icon: Image, color: 'text-purple-500', label: 'Image' },
};

interface FileTypeIconProps {
  mime?: string | null;
  className?: string;
}

export function FileTypeIcon({ mime, className }: FileTypeIconProps) {
  const config = mime ? MIME_CONFIG[mime] : null;
  if (!config) {
    return <File className={cn('size-4', className)} />;
  }
  const Icon = config.icon;
  return <Icon className={cn('size-4', config.color, className)} />;
}

export function getFileTypeLabel(mime?: string | null): string | null {
  if (!mime) return null;
  return MIME_CONFIG[mime]?.label ?? null;
}

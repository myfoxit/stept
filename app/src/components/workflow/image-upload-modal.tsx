import * as React from 'react';
import { X, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageUploadModalProps {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, replace?: boolean) => Promise<void>;  // Add replace parameter
  stepNumber: number;
  isReplacement?: boolean;  // NEW: indicate if this is a replacement
}

export function ImageUploadModal({ 
  open, 
  onClose, 
  onUpload, 
  stepNumber,
  isReplacement = false  // NEW: default false
}: ImageUploadModalProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.includes('gif')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file, isReplacement);  // Pass replacement flag
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isReplacement ? 'Replace image' : 'Add an image'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          <div className="text-sm text-muted-foreground">
            JPG, PNG, GIF, or WebP File (5 MB or less)
          </div>
          
          <div
            className={cn(
              "mt-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isDragOver ? "border-primary bg-primary/5" : "border-gray-300",
              isUploading && "pointer-events-none opacity-50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.gif"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />
            
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div className="mt-2 text-sm text-gray-600">
              Drag and drop or{' '}
              <button className="text-primary hover:text-primary">
                choose a file
              </button>
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <Button
              variant="default"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? 'Uploading...' : 'Save Image'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

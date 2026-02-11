import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { IconLink } from '@tabler/icons-react';

interface DocumentLinkDialogProps {
  docId: string;
}

/**
 * Document link dialog — table linking functionality was removed.
 * This component is a placeholder for future document-to-document linking.
 */
export function DocumentLinkDialog({ docId }: DocumentLinkDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <IconLink className="h-4 w-4 mr-2" />
          Link Document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Link Document</DialogTitle>
          <DialogDescription>
            Document linking will be available in a future update.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

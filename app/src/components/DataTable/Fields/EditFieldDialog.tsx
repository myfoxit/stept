import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SingleSelectSettings } from '../Settings/SingleSelectSettings';
import { MultiSelectSettings } from '../Settings/MultiSelectSettings'; 

import { Skeleton } from '@/components/ui/skeleton';
import { useUpdateColumn } from '@/hooks/api/columns';
import { useSelectOptions } from '@/hooks/api/select_options';

interface EditFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnId: string;
  tableId: string;
  uiType?: string;
  currentName: string;
}

export function EditFieldDialog({
  open,
  onOpenChange,
  columnId,
  tableId,
  uiType,
  currentName,
}: EditFieldDialogProps) {
  const [name, setName] = useState(currentName);
  const { data: options, isLoading } = useSelectOptions(
    uiType === 'single_select' ? columnId : undefined
  );
  const updateColumnMutation = useUpdateColumn();

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSave = async (updatedName?: string) => {
    if (updatedName && updatedName !== currentName) {
      await updateColumnMutation.mutateAsync({
        columnId,
        tableId,
        name: updatedName,
      });
    }
    handleClose();
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      );
    }

    switch (uiType) {
      case 'single_select':
        return (
          <SingleSelectSettings
            tableId={tableId}
            columnId={columnId}
            name={name}
            onNameChange={setName}
            onCancel={handleClose}
            onSave={handleSave}
            editMode={true}
            existingOptions={options as any}
          />
        );

      case 'multi_select': 
        return (
          <MultiSelectSettings
            tableId={tableId}
            columnId={columnId}
            name={name}
            onNameChange={setName}
            onCancel={handleClose}
            onSave={handleSave}
            editMode={true}
            existingOptions={options as any}
          />
        );


      default:
        return (
          <div className="text-sm text-muted-foreground">
            Field type "{uiType}" editing not yet supported.
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Field Settings</DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}

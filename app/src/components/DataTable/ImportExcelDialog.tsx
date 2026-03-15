import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IconUpload, IconFileSpreadsheet, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { uploadExcel, getImportStatus, confirmColumnMapping } from '@/api/imports';
import type { ColumnRead } from '@/types/openapi';

interface ImportExcelDialogProps {
  tableId?: string;
  existingColumns?: ColumnRead[];
  projectId?: string;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ColumnMapping {
  sourceColumn: string;
  targetColumn: string | 'new' | 'skip';
  newColumnName?: string;
}

export function ImportExcelDialog({
  tableId,
  existingColumns = [],
  projectId,
  onClose,
  onImportComplete,
}: ImportExcelDialogProps) {
  const [mode, setMode] = useState<'new' | 'existing'>(tableId ? 'existing' : 'new');
  const [file, setFile] = useState<File | null>(null);
  const [newTableName, setNewTableName] = useState('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string>('idle');
  const [rowsProcessed, setRowsProcessed] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please select a valid Excel (.xlsx, .xls) or CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (mode === 'new' && !newTableName) {
      setError('Please enter a table name');
      return;
    }
    if (mode === 'new' && !projectId) {
      setError('Cannot create new table: Project ID is missing');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      if (mode === 'existing' && tableId) {
        formData.append('table_id', tableId);
      } else if (mode === 'new' && projectId) {  // Only append if projectId exists
        formData.append('table_name', newTableName);
        formData.append('project_id', projectId);
      }

      const response = await uploadExcel(formData);
      setUploadId(response.upload_id);
      setPreviewData(response.preview);
      
      // Auto-generate mappings - try to match columns intelligently
      const autoMappings = response.preview.columns.map((col: string) => {
        // Try exact match first
        let existingCol = existingColumns.find(
          (ec) => ec.name === col
        );
        
        // Try case-insensitive match
        if (!existingCol) {
          existingCol = existingColumns.find(
            (ec) => ec.name.toLowerCase() === col.toLowerCase()
          );
        }
        
        return {
          sourceColumn: col,
          targetColumn: existingCol ? existingCol.name : 'new',
          newColumnName: existingCol ? undefined : col,
        };
      });
      setColumnMappings(autoMappings);
      setImportStatus('preview');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to upload file');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!uploadId) return;

    // Validate mappings
    const hasValidMappings = columnMappings.some(m => m.targetColumn !== 'skip');
    if (!hasValidMappings) {
      setError('Please map at least one column');
      return;
    }

    // Check for new columns without names
    const invalidNewColumns = columnMappings.filter(
      m => m.targetColumn === 'new' && !m.newColumnName?.trim()
    );
    if (invalidNewColumns.length > 0) {
      setError('Please provide names for all new columns');
      return;
    }

    setIsUploading(true);
    setError(null);
    setImportStatus('processing');

    try {
      await confirmColumnMapping(uploadId, {
        mappings: columnMappings,
        skip_unmapped: false,
      });
      
      // Start polling for status
      const pollStatus = setInterval(async () => {
        try {
          const status = await getImportStatus(uploadId);
          setUploadProgress(status.progress);
          setImportStatus(status.status);
          
          if (status.rows_processed !== undefined) {
            setRowsProcessed(status.rows_processed);
          }
          
          if (status.status === 'completed') {
            clearInterval(pollStatus);
            setTimeout(() => {
              onImportComplete();
            }, 1000);
          } else if (status.status === 'failed') {
            clearInterval(pollStatus);
            setError(status.error || 'Import failed');
            setImportStatus('idle');
          }
        } catch (err) {
          clearInterval(pollStatus);
          setError('Failed to get import status');
          setImportStatus('idle');
        }
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to start import');
      setImportStatus('idle');
    } finally {
      setIsUploading(false);
    }
  };

  const updateMapping = (index: number, field: keyof ColumnMapping, value: string) => {
    setColumnMappings((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Excel/CSV</DialogTitle>
          <DialogDescription>
            Upload an Excel or CSV file to import data into your table
          </DialogDescription>
        </DialogHeader>

        {importStatus === 'idle' && (
          <div className="space-y-4">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'new' | 'existing')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing" id="existing" disabled={!tableId} />
                <Label htmlFor="existing">Import to current table</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new" disabled={!projectId} />
                <Label htmlFor="new">
                  Create new table
                  {!projectId && <span className="text-xs text-muted-foreground ml-1">(Project required)</span>}
                </Label>
              </div>
            </RadioGroup>

            {mode === 'new' && (
              <div>
                <Label htmlFor="tableName">Table Name</Label>
                <Input
                  id="tableName"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Enter table name"
                />
              </div>
            )}

            <div>
              <Label htmlFor="file">Select File</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
              />
              {file && (
                <div className="mt-2 flex items-center gap-2">
                  <IconFileSpreadsheet size={16} />
                  <span className="text-sm">{file.name}</span>
                  <Badge variant="secondary">{(file.size / 1024).toFixed(2)} KB</Badge>
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <IconAlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {importStatus === 'preview' && previewData && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Column Mapping</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Map Excel columns to table columns or create new ones
              </p>
              <div className="space-y-2">
                {columnMappings.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Badge variant="outline" className="min-w-[120px]">
                      {mapping.sourceColumn}
                    </Badge>
                    <span>→</span>
                    <Select
                      value={mapping.targetColumn}
                      onValueChange={(value) => updateMapping(index, 'targetColumn', value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Skip column</SelectItem>
                        <SelectItem value="new">Create new column</SelectItem>
                        {existingColumns.map((col) => (
                          <SelectItem key={col.id} value={col.name}>
                            {col.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping.targetColumn === 'new' && (
                      <Input
                        className="w-[180px]"
                        placeholder="New column name"
                        value={mapping.newColumnName || ''}
                        onChange={(e) => updateMapping(index, 'newColumnName', e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Preview</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      {previewData.columns.map((col: string) => (
                        <th key={col} className="px-2 py-1 text-left">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.slice(0, 5).map((row: any, idx: number) => (
                      <tr key={idx} className="border-t">
                        {previewData.columns.map((col: string) => (
                          <td key={col} className="px-2 py-1">
                            {row[col] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.total_rows > 5 && (
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    ... and {previewData.total_rows - 5} more rows
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {importStatus === 'processing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <IconUpload className="animate-pulse" />
              <span>Importing data...</span>
            </div>
            <Progress value={uploadProgress} />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {uploadProgress}% complete
              </p>
              {rowsProcessed > 0 && (
                <p className="text-sm text-muted-foreground">
                  {rowsProcessed} rows imported
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                This may take a while for large files. You can close this dialog - the import will continue in the background.
              </p>
            </div>
          </div>
        )}

        {importStatus === 'completed' && (
          <Alert>
            <IconCheck className="h-4 w-4" />
            <AlertDescription>Import completed successfully!</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {importStatus === 'idle' && (
            <Button onClick={handleUpload} disabled={!file || isUploading}>
              {isUploading ? 'Uploading...' : 'Upload & Preview'}
            </Button>
          )}
          {importStatus === 'preview' && (
            <Button onClick={handleConfirmImport} disabled={isUploading}>
              Start Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

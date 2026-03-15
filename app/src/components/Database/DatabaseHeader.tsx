import * as React from 'react';
import { Database } from 'lucide-react';
import type { DatabaseRead } from '@/api/databases';

interface DatabaseHeaderProps {
  database: DatabaseRead;
  onUpdateName: (name: string) => void;
  onUpdateDescription: (description: string) => void;
}

export function DatabaseHeader({ database, onUpdateName, onUpdateDescription }: DatabaseHeaderProps) {
  const [editingName, setEditingName] = React.useState(false);
  const [nameValue, setNameValue] = React.useState(database.name);
  const [editingDesc, setEditingDesc] = React.useState(false);
  const [descValue, setDescValue] = React.useState(database.description || '');

  React.useEffect(() => {
    setNameValue(database.name);
    setDescValue(database.description || '');
  }, [database.name, database.description]);

  return (
    <div className="px-6 py-4 border-b border-border">
      <div className="flex items-center gap-2">
        <Database className="size-5 text-primary" />
        {editingName ? (
          <input
            autoFocus
            className="text-xl font-semibold bg-transparent border-b border-primary outline-none"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              if (nameValue.trim() && nameValue !== database.name) {
                onUpdateName(nameValue.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setEditingName(false);
                if (nameValue.trim() && nameValue !== database.name) {
                  onUpdateName(nameValue.trim());
                }
              } else if (e.key === 'Escape') {
                setEditingName(false);
                setNameValue(database.name);
              }
            }}
          />
        ) : (
          <h1
            className="text-xl font-semibold cursor-pointer hover:text-primary transition-colors"
            onClick={() => setEditingName(true)}
          >
            {database.name}
          </h1>
        )}
      </div>
      {editingDesc ? (
        <input
          autoFocus
          className="mt-1 ml-7 text-sm text-muted-foreground bg-transparent border-b border-muted outline-none w-full max-w-md"
          value={descValue}
          placeholder="Add a description..."
          onChange={(e) => setDescValue(e.target.value)}
          onBlur={() => {
            setEditingDesc(false);
            if (descValue !== (database.description || '')) {
              onUpdateDescription(descValue);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setEditingDesc(false);
              if (descValue !== (database.description || '')) {
                onUpdateDescription(descValue);
              }
            } else if (e.key === 'Escape') {
              setEditingDesc(false);
              setDescValue(database.description || '');
            }
          }}
        />
      ) : (
        <p
          className="mt-1 ml-7 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
          onClick={() => setEditingDesc(true)}
        >
          {database.description || 'Add a description...'}
        </p>
      )}
    </div>
  );
}

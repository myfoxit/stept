import React, { useState, ChangeEvent } from "react";
import { v4 as uuid } from "uuid";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  ChevronDown,
  Plus,
  Trash2,
  Heading,
  LayoutGrid,
  MousePointerClick,
  List, 
} from "lucide-react";
import { MoreVertical } from "lucide-react";
import { SingleCellBlock } from "./Blocks/SingleCellBlock";
import { useColumns } from "@/hooks/columns";
import { useRows } from "@/hooks";


const Hero: React.FC<{ title?: string; subtitle?: string }> = ({
  title = "A Wonderful Headline",
  subtitle = "And an inspiring sub‑headline.",
}) => (
  <section className="flex flex-col items-center justify-center gap-4 py-16 text-center bg-secondary/50 rounded-2xl">
    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
      {title}
    </h1>
    <p className="max-w-xl text-lg opacity-80">{subtitle}</p>
  </section>
);

const Grid: React.FC<{ items?: string[] }> = ({
  items = ["First", "Second", "Third", "Fourth"],
}) => (
  <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {items.map((it) => (
      <Card key={it} className="min-h-[120px] flex items-center justify-center">
        <CardContent>{it}</CardContent>
      </Card>
    ))}
  </section>
);

const ButtonBlock: React.FC<{ label?: string }> = ({ label = "Click Me" }) => (
  <Button>{label}</Button>
);

const DropdownBlock: React.FC<{ label?: string; items?: string[] }> = ({
  label = "Options",
  items = ["One", "Two", "Three"],
}) => (
  <div className="relative inline-block text-left">
    <Button variant="outline" className="flex items-center gap-1">
      {label}
      <ChevronDown className="w-4 h-4" />
    </Button>
    {/* TODO: real pop‑over list */}
  </div>
);

const blockRegistry = {
  hero: Hero,
  grid: Grid,
  button: ButtonBlock,
  singleCell: SingleCellBlock,
  dropdown: DropdownBlock,
  paragraph: ({ text = "" }: { text?: string }) => (
    <p
      className="min-h-[24px] outline-none"
      contentEditable
      suppressContentEditableWarning
    >
      {text}
    </p>
  ),
} as const;

type BlockType = keyof typeof blockRegistry;

interface BlockInstance {
  id: string;
  type: BlockType;
  props?: Record<string, any>;
}

const DEFAULT_BLOCKS: BlockInstance[] = [
  { id: uuid(), type: "hero", props: { title: "Welcome to Snaprow" } },
  {
    id: uuid(),
    type: "grid",
    props: { items: ["Item 1", "Item 2", "Item 3", "Item 4"] },
  },
  { id: uuid(), type: "button", props: { label: "Click Me" } },
];

const commandOptions: {
  id: BlockType;
  label: string;
  keywords: string[];
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
}[] = [
  { id: "hero", label: "Hero", keywords: ["banner", "header"], icon: Heading },
  {
    id: "grid",
    label: "Grid",
    keywords: ["gallery", "cards"],
    icon: LayoutGrid,
  },
  {
    id: "button",
    label: "Button",
    keywords: ["cta", "action"],
    icon: MousePointerClick,
  },
  {
    id: "dropdown",
    label: "Dropdown",
    keywords: ["menu", "select"],
    icon: List,
  },
  {
  id: 'singleCell',
  label: 'Cell',
  keywords: ['field', 'column', 'table'],
  icon: LayoutGrid,              
}
];


type SettingsProps<T> = {
  value: T;
  onChange: (value: T) => void;
};

const HeroSettings: React.FC<SettingsProps<{ title?: string; subtitle?: string }>> = ({
  value,
  onChange,
}) => (
  <div className="grid gap-4 py-2">
    <div className="grid gap-2">
      <label className="text-sm font-medium">Title</label>
      <Input
        value={value.title ?? ""}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange({ ...value, title: e.target.value })
        }
      />
    </div>
    <div className="grid gap-2">
      <label className="text-sm font-medium">Subtitle</label>
      <Input
        value={value.subtitle ?? ""}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange({ ...value, subtitle: e.target.value })
        }
      />
    </div>
  </div>
);

const GridSettings: React.FC<SettingsProps<{ items?: string[] }>> = ({ value, onChange }) => (
  <div className="grid gap-2 py-2">
    <label className="text-sm font-medium">Items (comma separated)</label>
    <Textarea
      value={(value.items ?? []).join(", ")}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
        onChange({ ...value, items: e.target.value.split(/\s*,\s*/) })
      }
      rows={3}
    />
  </div>
);

const ButtonSettings: React.FC<SettingsProps<{ label?: string }>> = ({ value, onChange }) => (
  <div className="grid gap-2 py-2">
    <label className="text-sm font-medium">Label</label>
    <Input
      value={value.label ?? ""}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        onChange({ ...value, label: e.target.value })
      }
    />
  </div>
);

const DropdownSettings: React.FC<SettingsProps<{ label?: string; items?: string[] }>> = ({
  value,
  onChange,
}) => (
  <div className="grid gap-4 py-2">
    <div className="grid gap-2">
      <label className="text-sm font-medium">Label</label>
      <Input
        value={value.label ?? ""}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange({ ...value, label: e.target.value })
        }
      />
    </div>
    <div className="grid gap-2">
      <label className="text-sm font-medium">Items (comma separated)</label>
      <Textarea
        value={(value.items ?? []).join(", ")}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
          onChange({ ...value, items: e.target.value.split(/\s*,\s*/) })
        }
        rows={3}
      />
    </div>
  </div>
);

const ParagraphSettings: React.FC<SettingsProps<{ text?: string }>> = ({ value, onChange }) => (
  <div className="grid gap-2 py-2">
    <label className="text-sm font-medium">Text</label>
    <Textarea
      value={value.text ?? ""}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
        onChange({ ...value, text: e.target.value })
      }
      rows={4}
    />
  </div>
);

const settingsRegistry: {
  [K in BlockType]: React.FC<SettingsProps<any>>;
} = {
  hero: HeroSettings,
  grid: GridSettings,
  button: ButtonSettings,
  dropdown: DropdownSettings,
  paragraph: ParagraphSettings,
};


export const ComponentEditor: React.FC = ({
                              tableId
                          }: {
    tableId: string
}) => {
  /* ---------------- state ----------------- */
  const [blocks, setBlocks] = useState<BlockInstance[]>(DEFAULT_BLOCKS);
  const [addOpen, setAddOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [tempProps, setTempProps] = useState<Record<string, any>>({});
  const { data: cols,       isLoading: colsLoading } = useColumns(tableId)
  const { data: rows = [],  isLoading: rowsLoading } = useRows(tableId)

  const addBlock = (type: BlockType) => {
    const newBlock: BlockInstance = { id: uuid(), type, props: {} };
    setBlocks((prev) => [...prev, newBlock]);
    setAddOpen(false);
  };

  const deleteBlock = (idx: number) => {
    setBlocks((prev) => {
      if (prev.length === 1) {
        // never leave the document empty
        return [{ ...prev[0], type: "paragraph", props: { text: "" } }];
      }
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
  };

  const openEditor = (idx: number) => {
    setEditingIdx(idx);
    setTempProps(blocks[idx].props ?? {});
  };

  const closeEditor = () => {
    setEditingIdx(null);
    setTempProps({});
  };

  const saveChanges = () => {
    if (editingIdx === null) return;
    setBlocks((prev) =>
      prev.map((b, i) => (i === editingIdx ? { ...b, props: tempProps } : b))
    );
    closeEditor();
  };

  /* --------------- render --------------- */
  return (
    <div className="relative w-full mx-auto">
      {/* blocks */}
      <div className="flex flex-col gap-4 py-4">
        {blocks.map((block, idx) => {
          const Comp = blockRegistry[block.type];
          return (
            <div key={block.id} className="relative group">
              <div
                id={block.id}
                tabIndex={0}
                contentEditable={block.type === "paragraph"}
                suppressContentEditableWarning
                className="focus:outline-none"
              >
                <Comp {...block.props} />
              </div>

              {/* block menu */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="p-1">
                  <Button
                    variant="ghost"
                    className="justify-start w-full"
                    onClick={() => openEditor(idx)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="justify-start w-full"
                    onClick={() => deleteBlock(idx)}
                  >
                    Delete
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-center">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add component
            </Button>
          </PopoverTrigger>

          <PopoverContent side="bottom" align="center" className="p-0 w-72">
            <Command>
              <CommandInput
                placeholder="Search components…"
                autoFocus
                className="h-9"
              />
              <CommandList className="max-h-64 overflow-y-auto">
                {commandOptions.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    onSelect={() => addBlock(cmd.id)}
                    className="gap-2 px-2 py-1.5"
                  >
                    <cmd.icon className="w-4 h-4 opacity-70" />
                    {cmd.label}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* settings dialog */}
      <Dialog open={editingIdx !== null} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="sm:max-w-lg">
          {editingIdx !== null && (
            <>
              <DialogHeader>
                <DialogTitle>Edit {blocks[editingIdx].type} block</DialogTitle>
              </DialogHeader>
              {(() => {
                const SettingsComp = settingsRegistry[blocks[editingIdx].type];
                return (
                  <SettingsComp value={tempProps} onChange={setTempProps} />
                );
              })()}
              <DialogFooter className="flex justify-end gap-2 pt-4">
                <Button variant="ghost" onClick={closeEditor}>
                  Cancel
                </Button>
                <Button onClick={saveChanges}>Save</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

import React, { useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { MoreVertical } from "lucide-react";

/** ----------------------------------------------------------------
 *  <ButtonNodeComponent/>
 *  ---------------------------------------------------------------- */
export const ButtonNodeComponent = ({
  node,
  updateAttributes,
}: {
  // Props that Tiptap passes to every React NodeView
  node: any;
  updateAttributes: (attrs: Record<string, any>) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string>(node.attrs.label ?? "Click me");
  const [action, setAction] = useState<string>(node.attrs.action ?? "none");

  const save = () => {
    updateAttributes({ label, action });
    setOpen(false);
  };

  return (
    <NodeViewWrapper className="relative inline-flex items-center space-x-1">
      {/* Actual button rendered inside the editor */}
      <Button
        className="h-10 rounded-md shadow"
        onClick={() => {
          /* mock action handler */
          if (import.meta.env.DEV) console.log(`Run action: ${action}`);
        }}
      >
        {label}
      </Button>

      {/* ───────────────────────── Menu ───────────────────────── */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Edit button">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-4">
          {/* Label field */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Label</p>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Button label"
            />
          </div>

          {/* Action select (mock) */}
          <div className="space-y-1">
            <p className="text-sm font-medium">Action</p>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="submit">Submit</SelectItem>
                <SelectItem value="link">Link</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};
import * as React from "react";
import { icons } from "lucide-react";
import type { Workflow } from "@/types/workflow";
import { IconPickerModal } from "./icon-picker-modal";
import { cn } from "@/lib/utils";

interface WorkflowHeaderProps {
  workflow: Workflow;
  stepCount: number;
  durationLabel?: string | null;
  isEditMode?: boolean;
  onUpdateIcon?: (
    type: "tabler" | "favicon",
    value: string,
    color?: string,
  ) => void;
  // NEW: prefer this over workflow fields when provided
  iconOverride?: { type: "tabler" | "favicon"; value: string; color?: string };
  // NEW: update title callback
  onUpdateTitle?: (title: string) => void;
  // Translation preview
  translatedName?: string;
}

export function WorkflowHeader({
  workflow,
  stepCount,
  durationLabel,
  isEditMode = false,
  onUpdateIcon,
  iconOverride,
  onUpdateTitle,
  translatedName,
}: WorkflowHeaderProps) {
  const [showIconPicker, setShowIconPicker] = React.useState(false);
  // NEW: local draft title for inline editing
  const [titleDraft, setTitleDraft] = React.useState<string>(
    workflow.title ?? "Untitled workflow",
  );

  React.useEffect(() => {
    setTitleDraft(workflow.title ?? "Untitled workflow");
  }, [workflow.title]);

  // Prefer override; fallback to workflow; then defaults
  const iconType =
    iconOverride?.type || (workflow as any).icon_type || "tabler";
  const iconValue =
    iconOverride?.value || (workflow as any).icon_value || "Pencil";
  const iconColor =
    iconOverride?.color || (workflow as any).icon_color || "#3ab08a";

  const renderIcon = () => {
    if (iconType === "favicon" && iconValue) {
      return (
        <img
          src={iconValue}
          alt="Workflow icon"
          className="h-8 w-8"
          onError={(e) => {
            // Fallback to default icon if favicon fails
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      );
    } else {
      const lucideName = iconValue.replace(/^Icon/, '');
      const IconComponent = icons[lucideName as keyof typeof icons] || icons['Pencil'];

      return <IconComponent className="h-8 w-8 text-white" />;
    }
  };

  const handleIconSelect = (
    type: "tabler" | "favicon",
    value: string,
    color?: string,
  ) => {
    onUpdateIcon?.(type, value, color);
  };

  // NEW: submit title changes
  const submitTitle = () => {
    const next = (titleDraft || "").trim();
    const curr = workflow.title ?? "Untitled workflow";
    if (next && next !== curr) {
      onUpdateTitle?.(next);
    }
  };

  return (
    <>
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => isEditMode && setShowIconPicker(true)}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl shadow-md",
            isEditMode &&
              "cursor-pointer hover:opacity-90 hover:shadow-lg transition-all",
            !isEditMode && "cursor-default",
          )}
          style={{
            backgroundColor: iconType === "tabler" ? iconColor : "#f3f4f6",
          }}
        >
          {renderIcon()}
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          {/* NEW: make title editable in edit mode */}
          {isEditMode ? (
            <input
              className="w-full bg-transparent text-2xl font-bold text-slate-900 outline-none rounded-md focus:ring-2 focus:ring-primary/30 px-1"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={submitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  setTitleDraft(workflow.title ?? "Untitled workflow");
                  e.currentTarget.blur();
                }
              }}
              placeholder="Untitled workflow"
              aria-label="Workflow title"
            />
          ) : (
            <h1 className="text-2xl font-bold text-slate-900 truncate">
              {translatedName ?? workflow.title ?? "Untitled workflow"}
            </h1>
          )}
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="font-medium">
              {workflow.created_by?.name ?? "Anonymous"}
            </span>
            <span>•</span>
            <span>{stepCount} steps</span>
            {durationLabel && (
              <>
                <span>•</span>
                <span>{durationLabel}</span>
              </>
            )}
          </div>
          {workflow.description && (
            <p className="mt-2 text-sm text-slate-600">
              {workflow.description}
            </p>
          )}
        </div>
      </div>

      {isEditMode && (
        <IconPickerModal
          open={showIconPicker}
          onClose={() => setShowIconPicker(false)}
          onSelect={handleIconSelect}
          currentIcon={{
            // NEW: pass the same values used for rendering
            type: iconType,
            value: iconValue,
            color: iconColor,
          }}
        />
      )}
    </>
  );
}

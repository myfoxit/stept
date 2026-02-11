import React from 'react';

import type { ColumnRead } from '@/types/openapi';

import { SingleRelationField } from '@/components/DataTable/Fields/SingleRelationField';
import { MultiRelationField } from '@/components/DataTable/Fields/MultiRelationField';
import TagSelectField from '@/components/DataTable/Fields/TagSelectField';
import { LookUpColumnField } from '@/components/DataTable/Fields/LookUpField';

/** --------------------------------------------------------------
 *  SingleCellBlock
 *  --------------------------------------------------------------
 *  A self‑contained component that mimics the behaviour of the
 *  cells rendered inside the DataTable grid but can freely live
 *  anywhere on the page.  It shows the column label above the
 *  value / field and re‑uses the exact same field renderers, so
 *  all the business‑logic (relations, look‑ups, tagging …) keeps
 *  working out of the box.
 *
 *  Props
 *  -----
 *  label      – The human readable column/header label.
 *  value      – Raw cell value coming from your record.
 *  column     – (Optional) Column meta as returned from the API.
 *                Required for relation-, lookup‑ or select‑fields
 *                so we know which specialised component to render.
 *  rowId      – (Optional) id of the current record; only needed
 *                for relation fields so the field components can
 *                perform updates.
 *
 *  Example
 *  -------
 *  <SingleCellBlock
 *    label="Status"
 *    value={item.status}
 *    column={columnsMeta.find(c => c.name === 'status')}
 *    rowId={item.id}
 *  />
 * --------------------------------------------------------------*/

export interface SingleCellBlockProps {
  label: string;
  value: unknown;
  column?: ColumnRead | null;
  rowId?: string;
}

export const SingleCellBlock: React.FC<SingleCellBlockProps> = ({
  label,
  value,
  column,
  rowId,
}) => {
  /* util ───────────────────────────────────────────────────────*/
  const safeJsonParse = (raw: unknown): Record<string, any> | null => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw as Record<string, any>;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return null;
  };

  /* renderer ───────────────────────────────────────────────────*/
  const renderField = () => {
    if (!column) return <div>{value ?? '-'}</div>;

    switch (column.ui_type) {
      case 'oo_relation': {
        return (
          <SingleRelationField
            column={column}
            value={safeJsonParse(value)}
            leftItemId={rowId ?? ''}
            onChange={() => null}
          />
        );
      }
      case 'single_select':
        return (
          <TagSelectField
            column={column}
            value={value}
            rowId={rowId}
            onChange={() => null}
          />
        );
      case 'lookup':
        return <LookUpColumnField value={value} />;

      case 'om_relation':
      case 'mm_relation_left':
      case 'mm_relation_right': {
        return (
          <MultiRelationField
            column={column}
            value={safeJsonParse(value)}
            leftItemId={rowId ?? ''}
            onChange={() => null}
          />
        );
      }
      // default: single_line_text etc.
      default:
        return <div>{value ?? '-'}</div>;
    }
  };

  /* ui ─────────────────────────────────────────────────────────*/
  return (
    <div className="flex flex-col gap-1">
      {/* label / header */}
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {/* value / interactive field */}
      {renderField()}
    </div>
  );
};

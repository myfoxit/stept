import React from 'react';

type RollupPayload = {
  id?: string;
  relation_column_id?: string;
  aggregate_func?: string;
};


const RollupField: React.FC<{ value: unknown }> = ({ value }) => {
  const cfg = ((): RollupPayload | null => {
    if (!value) return null;
    if (typeof value === 'object') return value as RollupPayload;
    try {
      return JSON.parse(String(value)) as RollupPayload;
    } catch {
      return null;
    }
  })();

  return (
    <div className="text-right tabular-nums">
      {cfg?.aggregate_func?.toUpperCase() ?? '—'}
    </div>
  );
};

export default RollupField;

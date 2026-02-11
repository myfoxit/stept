// utils/getCellDisplay.ts
export const getCellDisplay = (
  row: Record<string, any>,
  col: { name: string; ui_type: string }
) => {
  const raw = row[col.name];

  // 1) plain text
  if (raw == null || typeof raw === 'string' || typeof raw === 'number') {
    return raw ?? ''; // '', not undefined
  }

  // 2) single‑select
  if (col.ui_type === 'single_select' && typeof raw === 'object') {
    return raw.name ?? '';
  }

  // 3) relation: prefer mirror (…_r_rrf) if backend provides it
  if (col.ui_type?.includes('relation')) {
    const mirror = row[`${col.name}_r_rrf`];
    if (mirror != null) return mirror;
    return raw.name ?? '';
  }

  // fallback: JSON stringify to avoid crashing
  return JSON.stringify(raw);
};

export const relationUiTypes = [
  'oo_relation',
  'om_relation',
  'mm_relation_left',
  'mm_relation_right',
] as const;

export function isRelationUiType(
  uiType?: string
): uiType is (typeof relationUiTypes)[number] {
  return !!uiType && (relationUiTypes as readonly string[]).includes(uiType);
}

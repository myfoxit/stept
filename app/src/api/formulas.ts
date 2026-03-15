import { request } from '../lib/apiClient';
import { type FormulaCreate, type FormulaRead } from '../types/openapi';

// Extend FormulaCreate to include position parameters
export type FormulaCreateWithPosition = FormulaCreate & {
  position?: string;
  reference_column_id?: string;
};

/** Formulas */
export const addFormula = (body: FormulaCreateWithPosition) =>
  request<FormulaRead, FormulaCreateWithPosition>({
    method: 'POST',
    url: '/datatable/formulas/',
    data: body,
  });

export const listFormulas = (columnId: string) =>
  request<FormulaRead[]>({
    method: 'GET',
    url: `/datatable/formulas/${columnId}`,
  });

export const deleteFormula = (formulaId: string) =>
  request<void>({
    method: 'DELETE',
    url: `/datatable/formulas/${formulaId}`,
  });

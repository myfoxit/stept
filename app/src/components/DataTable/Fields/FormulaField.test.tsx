import React from 'react';
import { render, screen } from '@testing-library/react';
import FormulaField, { FormulaFieldProps } from './FormulaField';


jest.mock('@/utils/formulaEvaluator', () => ({
  evaluateFormula: jest.fn().mockReturnValue(42),
}));

const mockColumns = [
  { id: 'c1', name: 'a', display_name: 'A', column_type: 'physical' },
  { id: 'c2', name: 'b', display_name: 'B', column_type: 'physical' },
] as any[];

describe('FormulaField', () => {
  it('renders evaluated value', () => {
    render(
      <FormulaField
        column={{ id: 'cX' } as any}
        rowData={{ a: 1, b: 2 }}
        columnsMeta={mockColumns}
      />
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});

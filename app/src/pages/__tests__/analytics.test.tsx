import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockUseProject = jest.fn();
const mockUseAnalyticsOverview = jest.fn();
const mockUseGuidesAnalytics = jest.fn();
const mockExportAnalytics = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('@/providers/project-provider', () => ({
  useProject: () => mockUseProject(),
}));

jest.mock('@/hooks/api/analytics', () => ({
  useAnalyticsOverview: (...args: unknown[]) => mockUseAnalyticsOverview(...args),
  useGuidesAnalytics: (...args: unknown[]) => mockUseGuidesAnalytics(...args),
}));

jest.mock('@/api/analytics', () => ({
  exportAnalytics: (...args: unknown[]) => mockExportAnalytics(...args),
}));

jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

jest.mock('@/components/ui/select', () => {
  const React = require('react');

  return {
    Select: ({ value, onValueChange, children }: any) => {
      const items = React.Children.toArray(children).find((child: any) => child?.type?.displayName === 'MockSelectContent');
      const options = React.Children.toArray(items?.props?.children ?? []).map((child: any) => ({
        value: child.props.value,
        label: child.props.children,
      }));

      return (
        <label>
          <span>Analytics period</span>
          <select aria-label="Analytics period" value={value} onChange={(e) => onValueChange(e.target.value)}>
            {options.map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    },
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => <>{placeholder}</>,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ children }: any) => <option>{children}</option>,
  };
});

(require('@/components/ui/select').SelectContent as any).displayName = 'MockSelectContent';

import { AnalyticsPage } from '@/pages/analytics';

const overviewData = {
  active_guides: 2,
  guide_starts: 10,
  guide_completions: 7,
  completion_rate: 70,
  users_guided: 4,
  self_healing_count: 0,
  self_healing_success_rate: 0,
  period: '30d' as const,
};

const guidesData = {
  guides: [
    {
      guide_id: 'guide-1',
      name: 'Onboarding tour',
      views: 6,
      completions: 4,
      abandonments: 2,
      step_views: 10,
      step_completions: 8,
      completion_rate: 66.7,
      step_completion_rate: 80,
      avg_time_ms: 120000,
    },
    {
      guide_id: 'guide-2',
      name: 'Settings walkthrough',
      views: 4,
      completions: 3,
      abandonments: 1,
      step_views: 5,
      step_completions: 2,
      completion_rate: 75,
      step_completion_rate: 40,
      avg_time_ms: 45000,
    },
  ],
};

describe('AnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseProject.mockReturnValue({
      selectedProjectId: 'project-1',
      selectedProject: { id: 'project-1', name: 'Growth Team' },
      userRole: 'admin',
    });

    mockUseAnalyticsOverview.mockReturnValue({
      data: overviewData,
      isLoading: false,
    });

    mockUseGuidesAnalytics.mockReturnValue({
      data: guidesData,
      isLoading: false,
    });
  });

  it('asks the user to pick a project when none is selected', () => {
    mockUseProject.mockReturnValue({
      selectedProjectId: null,
      selectedProject: null,
      userRole: null,
    });

    render(<AnalyticsPage />);

    expect(screen.getByText('Select a project')).toBeInTheDocument();
    expect(screen.getByText(/choose one from the sidebar first/i)).toBeInTheDocument();
  });

  it('renders overview cards, trust callout, and guide rows', () => {
    render(<AnalyticsPage />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Guide starts')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('70.0%')).toBeInTheDocument();
    expect(screen.getByText(/self-healing is not widely emitted/i)).toBeInTheDocument();
    expect(screen.getAllByText('Onboarding tour').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings walkthrough').length).toBeGreaterThan(0);
    expect(screen.getByText('Derived from 10 completed steps across 15 viewed steps.')).toBeInTheDocument();
  });

  it('switches the queried period when the selector changes', async () => {
    render(<AnalyticsPage />);

    const selector = screen.getByLabelText('Analytics period');
    fireEvent.change(selector, { target: { value: '90d' } });

    await waitFor(() => {
      expect(mockUseAnalyticsOverview).toHaveBeenLastCalledWith('project-1', '90d');
      expect(mockUseGuidesAnalytics).toHaveBeenLastCalledWith('project-1', '90d');
    });
  });

  it('disables export for non-admin roles', () => {
    mockUseProject.mockReturnValue({
      selectedProjectId: 'project-1',
      selectedProject: { id: 'project-1', name: 'Growth Team' },
      userRole: 'member',
    });

    render(<AnalyticsPage />);

    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled();
  });

  it('exports analytics and shows a success toast', async () => {
    mockExportAnalytics.mockResolvedValue(undefined);

    render(<AnalyticsPage />);

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => {
      expect(mockExportAnalytics).toHaveBeenCalledWith('project-1', '30d');
      expect(mockToastSuccess).toHaveBeenCalledWith('Analytics export downloaded');
    });
  });

  it('shows an error toast when export fails', async () => {
    mockExportAnalytics.mockRejectedValue(new Error('boom'));

    render(<AnalyticsPage />);

    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to export analytics');
    });
  });

  it('shows the empty state when no guide rows are available', () => {
    mockUseGuidesAnalytics.mockReturnValue({
      data: { guides: [] },
      isLoading: false,
    });

    render(<AnalyticsPage />);

    expect(screen.getByText('No guide data yet')).toBeInTheDocument();
    expect(screen.getByText(/No analytics events landed for this project/i)).toBeInTheDocument();
  });
});

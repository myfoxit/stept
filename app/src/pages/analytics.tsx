import React from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';
import { formatDistanceStrict } from 'date-fns';
import { toast } from 'sonner';

import { exportAnalytics, type AnalyticsPeriod, type GuideAnalyticsRow } from '@/api/analytics';
import { useAnalyticsOverview, useGuidesAnalytics } from '@/hooks/api/analytics';
import { useProject } from '@/providers/project-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(ms: number) {
  if (!ms) return '—';
  return formatDistanceStrict(0, ms, { unit: ms >= 3_600_000 ? 'hour' : ms >= 60_000 ? 'minute' : 'second' });
}

function MetricCard({
  title,
  value,
  caption,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: string;
  caption: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning';
}) {
  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription>{title}</CardDescription>
            <CardTitle className="mt-2 text-3xl font-semibold tracking-tight">{value}</CardTitle>
          </div>
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border',
              tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-600',
              tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-600',
              tone === 'default' && 'border-violet-200 bg-violet-50 text-violet-600'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

function GuideCompletionBars({ guides }: { guides: GuideAnalyticsRow[] }) {
  const topGuides = guides.slice(0, 5);
  const maxViews = Math.max(...topGuides.map((guide) => guide.views), 1);

  return (
    <div className="space-y-4">
      {topGuides.map((guide) => (
        <div key={guide.guide_id} className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{guide.name}</div>
              <div className="text-xs text-muted-foreground">
                {guide.views} starts · {guide.completions} completions
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0 rounded-full px-2.5 py-1 font-medium">
              {formatPercent(guide.completion_rate)}
            </Badge>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-violet-200"
              style={{ width: `${(guide.views / maxViews) * 100}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-violet-600"
              style={{ width: `${(guide.views / maxViews) * (guide.completion_rate / 100) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {topGuides.length === 0 && <p className="text-sm text-muted-foreground">No guide activity in this period yet.</p>}
    </div>
  );
}

export function AnalyticsPage() {
  const { selectedProjectId, selectedProject, userRole } = useProject();
  const [period, setPeriod] = React.useState<AnalyticsPeriod>('30d');
  const [isExporting, setIsExporting] = React.useState(false);

  const overviewQuery = useAnalyticsOverview(selectedProjectId, period);
  const guidesQuery = useGuidesAnalytics(selectedProjectId, period);

  const overview = overviewQuery.data;
  const guides = guidesQuery.data?.guides ?? [];
  const isLoading = overviewQuery.isLoading || guidesQuery.isLoading;

  const trustworthyCallout = React.useMemo(() => {
    if (!overview) return 'Normalizing widget traffic so starts, completions, and step progression reflect real guide usage.';
    if (overview.self_healing_count === 0) {
      return 'Self-healing is not widely emitted by the current widget/runtime yet, so the dashboard focuses on guide starts, completions, step progression, and derived time-to-complete.';
    }
    return 'Core usage metrics are based on observed guide and step events. Self-healing is shown because matching events were present in this period.';
  }, [overview]);

  const topGuide = guides[0];
  const stepReliability = guides.reduce((sum, guide) => sum + guide.step_views, 0) > 0
    ? (guides.reduce((sum, guide) => sum + guide.step_completions, 0) / guides.reduce((sum, guide) => sum + guide.step_views, 0)) * 100
    : 0;

  async function handleExport() {
    if (!selectedProjectId) return;
    setIsExporting(true);
    try {
      await exportAnalytics(selectedProjectId, period);
      toast.success('Analytics export downloaded');
    } catch (error) {
      toast.error('Failed to export analytics');
    } finally {
      setIsExporting(false);
    }
  }

  if (!selectedProjectId) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Select a project</CardTitle>
            <CardDescription>Analytics is scoped to a project, so choose one from the sidebar first.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-xs font-medium">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Guide analytics
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {selectedProject?.name ?? 'Current project'} performance at a glance — pragmatic metrics sourced from actual guide walkthrough events.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={period} onValueChange={(value) => setPeriod(value as AnalyticsPeriod)}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={isExporting || !selectedProjectId || (userRole !== 'owner' && userRole !== 'admin')}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </div>

        <Card className="border-violet-200/70 bg-gradient-to-r from-violet-50 via-background to-background">
          <CardContent className="flex flex-col gap-3 py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-violet-700">What’s trustworthy here</div>
              <p className="max-w-3xl text-sm text-muted-foreground">{trustworthyCallout}</p>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-700">
              Data window: {PERIOD_OPTIONS.find((option) => option.value === period)?.label}
            </Badge>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Guide starts"
            value={overview ? String(overview.guide_starts) : '—'}
            caption="Sessions that actually launched a guide in the selected period."
            icon={Activity}
          />
          <MetricCard
            title="Completion rate"
            value={overview ? formatPercent(overview.completion_rate) : '—'}
            caption={`${overview?.guide_completions ?? 0} of ${overview?.guide_starts ?? 0} guide starts reached completion.`}
            icon={CheckCircle2}
            tone="success"
          />
          <MetricCard
            title="People guided"
            value={overview ? String(overview.users_guided) : '—'}
            caption="Distinct external users when the widget identified them."
            icon={Users}
          />
          <MetricCard
            title="Active guides"
            value={overview ? String(overview.active_guides) : '—'}
            caption="Guides with any tracked activity in the selected period."
            icon={Workflow}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Guide performance</CardTitle>
              <CardDescription>Completions are shown against guide starts, with step progression as a supporting signal.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading analytics…</p>
              ) : (
                <GuideCompletionBars guides={guides} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quality snapshot</CardTitle>
              <CardDescription>A compact read on flow health and data coverage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Step completion rate</div>
                    <div className="mt-1 text-2xl font-semibold">{formatPercent(stepReliability)}</div>
                  </div>
                  {stepReliability >= 70 ? (
                    <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ArrowDownRight className="h-5 w-5 text-amber-600" />
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Derived from {guides.reduce((sum, guide) => sum + guide.step_completions, 0)} completed steps across {guides.reduce((sum, guide) => sum + guide.step_views, 0)} viewed steps.
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Fastest signal</div>
                    <div className="mt-1 text-lg font-semibold">{topGuide?.name ?? 'No guide data yet'}</div>
                  </div>
                  <BarChart3 className="h-5 w-5 text-violet-600" />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {topGuide
                    ? `${formatPercent(topGuide.completion_rate)} completion rate across ${topGuide.views} starts.`
                    : 'Run a guide to start seeing performance highlights.'}
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Self-healing events</div>
                    <div className="mt-1 text-2xl font-semibold">{overview ? overview.self_healing_count : '—'}</div>
                  </div>
                  <Clock3 className="h-5 w-5 text-slate-600" />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {overview?.self_healing_count
                    ? `${formatPercent(overview.self_healing_success_rate)} success rate on observed recovery attempts.`
                    : 'No recovery events were observed in this window, so treat this as unavailable rather than “good”.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Guide breakdown</CardTitle>
            <CardDescription>Detailed view of starts, completions, step progression, and derived completion time by guide.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading guide rows…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guide</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead>Completions</TableHead>
                    <TableHead>Completion rate</TableHead>
                    <TableHead>Step progress</TableHead>
                    <TableHead>Avg. time</TableHead>
                    <TableHead>Drop-off</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guides.map((guide) => (
                    <TableRow key={guide.guide_id}>
                      <TableCell className="font-medium">{guide.name}</TableCell>
                      <TableCell>{guide.views}</TableCell>
                      <TableCell>{guide.completions}</TableCell>
                      <TableCell>{formatPercent(guide.completion_rate)}</TableCell>
                      <TableCell>
                        {guide.step_completions}/{guide.step_views}{' '}
                        <span className="text-muted-foreground">({formatPercent(guide.step_completion_rate)})</span>
                      </TableCell>
                      <TableCell>{formatDuration(guide.avg_time_ms)}</TableCell>
                      <TableCell>{guide.views - guide.completions}</TableCell>
                    </TableRow>
                  ))}
                  {guides.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No analytics events landed for this project in the selected period yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

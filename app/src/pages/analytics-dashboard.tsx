import { useState } from 'react';
import { SettingsLayout } from '@/components/settings-layout';
import {
  IconChartBar,
  IconClock,
  IconQuestionMark,
  IconSearch,
  IconDeviceDesktop,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject } from '@/providers/project-provider';
import {
  useTopAccessed,
  useAccessByChannel,
  useStaleResources,
  useQueryLog,
  useKnowledgeGaps,
} from '@/hooks/api/analytics';

const DAYS_OPTIONS = [7, 30, 90] as const;

export function AnalyticsDashboardPage() {
  const { selectedProjectId } = useProject();
  const [days, setDays] = useState<number>(30);
  const pid = selectedProjectId ?? '';

  const { data: topAccessed } = useTopAccessed(pid, days);
  const { data: channels } = useAccessByChannel(pid);
  const { data: stale } = useStaleResources(pid);
  const { data: queries } = useQueryLog(pid);
  const { data: gaps } = useKnowledgeGaps(pid);

  return (
    <SettingsLayout title="Analytics" description="Track document access, search queries, and knowledge gaps.">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div />
          <div className="flex gap-2">
            {DAYS_OPTIONS.map((d) => (
              <Button
                key={d}
                variant={days === d ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top accessed */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconChartBar className="h-4 w-4" />
                Top Accessed Resources
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topAccessed?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topAccessed.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{r.resource_name ?? r.resource_id}</TableCell>
                        <TableCell className="text-right">{r.access_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Access by channel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconDeviceDesktop className="h-4 w-4" />
                Access by Channel
              </CardTitle>
            </CardHeader>
            <CardContent>
              {channels?.length ? (
                <div className="space-y-3">
                  {channels.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <Badge variant="outline">{c.channel}</Badge>
                      <span className="font-mono font-medium">{c.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No data</p>
              )}
            </CardContent>
          </Card>

          {/* Stale resources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconClock className="h-4 w-4" />
                Stale Resources
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stale?.length ? (
                <ul className="space-y-2">
                  {stale.map((r: any, i: number) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span>{r.resource_name ?? r.resource_id}</span>
                      <span className="text-muted-foreground">
                        {r.last_accessed
                          ? new Date(r.last_accessed).toLocaleDateString()
                          : 'Never'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">No stale resources</p>
              )}
            </CardContent>
          </Card>

          {/* Knowledge gaps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconQuestionMark className="h-4 w-4" />
                Knowledge Gaps
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gaps?.length ? (
                <ul className="space-y-2">
                  {gaps.map((g: any, i: number) => (
                    <li key={i} className="text-sm flex justify-between">
                      <span className="truncate mr-2">{g.query}</span>
                      <Badge variant="secondary">{g.count}×</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">No gaps detected</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent queries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconSearch className="h-4 w-4" />
              Recent Queries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {queries?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queries.map((q: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-[300px] truncate">{q.query}</TableCell>
                      <TableCell>{q.channel ?? '—'}</TableCell>
                      <TableCell>{q.result_count ?? '—'}</TableCell>
                      <TableCell>
                        {q.created_at
                          ? new Date(q.created_at).toLocaleString()
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-sm">No queries yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}

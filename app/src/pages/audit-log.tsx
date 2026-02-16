import { useState } from 'react';
import {
  IconShieldCheck,
  IconDownload,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SiteHeader } from '@/components/site-header';
import { useProject } from '@/providers/project-provider';
import { useAuditLogs, useAuditStats } from '@/hooks/api/audit';
import { exportAuditLogs } from '@/api/audit';
import { toast } from 'sonner';

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  read: 'bg-gray-100 text-gray-800',
};

export function AuditLogPage() {
  const { selectedProjectId } = useProject();
  const [actionFilter, setActionFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filters = {
    ...(actionFilter && actionFilter !== 'all' ? { action: actionFilter } : {}),
    ...(fromDate ? { from_date: fromDate } : {}),
    ...(toDate ? { to_date: toDate } : {}),
  };

  const { data: logs, isLoading } = useAuditLogs(selectedProjectId ?? '', filters);
  const { data: stats } = useAuditStats(selectedProjectId ?? '');

  const handleExport = async () => {
    if (!selectedProjectId) return;
    try {
      const blob = await exportAuditLogs({ project_id: selectedProjectId, ...filters });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-logs.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <>
      <SiteHeader />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <IconShieldCheck className="h-6 w-6" />
            Audit Log
          </h1>
          <Button variant="outline" onClick={handleExport}>
            <IconDownload className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats).map(([action, count]) => (
              <Card key={action}>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground capitalize">{action}</p>
                  <p className="text-2xl font-bold">{count}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Action type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="From"
            />
          </div>
          <div>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="To"
            />
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : !logs?.length ? (
              <p className="text-center py-8 text-muted-foreground">No audit logs found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge
                          className={ACTION_COLORS[entry.action ?? ''] ?? ''}
                          variant="secondary"
                        >
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.user_id ?? '—'}</TableCell>
                      <TableCell>
                        {entry.resource_name ?? entry.resource_id ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {entry.detail ?? '—'}
                      </TableCell>
                      <TableCell>
                        {entry.created_at
                          ? new Date(entry.created_at).toLocaleString()
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

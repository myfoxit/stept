import React, { useState, useEffect } from 'react';
import { BarChart3, Coins, MessageSquare, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/apiClient';

interface UsageData {
  days: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  request_count: number;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function AiUsageCard() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  useEffect(() => {
    setLoading(true);
    apiClient
      .get(`/chat/usage?days=${days}`)
      .then((res) => setUsage(res.data))
      .catch(() => setUsage(null))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            AI Usage
          </CardTitle>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !usage ? (
          <p className="text-sm text-muted-foreground">Unable to load usage data.</p>
        ) : usage.request_count === 0 ? (
          <p className="text-sm text-muted-foreground">No AI usage recorded yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                Requests
              </p>
              <p className="text-lg font-semibold">{formatNumber(usage.request_count)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Tokens
              </p>
              <p className="text-lg font-semibold">{formatNumber(usage.total_tokens)}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatNumber(usage.total_input_tokens)} in / {formatNumber(usage.total_output_tokens)} out
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Coins className="h-3 w-3" />
                Est. Cost
              </p>
              <p className="text-lg font-semibold">
                ${usage.estimated_cost_usd.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

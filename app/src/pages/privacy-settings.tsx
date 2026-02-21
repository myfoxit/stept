import React, { useEffect, useState } from 'react';
import { SettingsLayout } from '@/components/settings-layout';
import { useProject } from '@/providers/project-provider';
import { apiClient } from '@/api/client';
import { Shield, ShieldCheck, ShieldOff, Eye, AlertTriangle } from 'lucide-react';

interface PrivacyStats {
  enabled: boolean;
  error?: string;
  status?: string;
  entities_detected?: Record<string, number>;
  requests_processed?: number;
  uptime?: string;
}

interface PiiEntity {
  start: number;
  end: number;
  type: string;
  value: string;
}

export function PrivacySettingsPage() {
  const { selectedProjectId } = useProject();
  const [stats, setStats] = useState<PrivacyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [testText, setTestText] = useState('');
  const [entities, setEntities] = useState<PiiEntity[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const { data } = await apiClient.get('/privacy/status');
      setStats(data);
    } catch {
      setStats({ enabled: false, error: 'Failed to reach privacy service' });
    } finally {
      setLoading(false);
    }
  }

  async function analyzeText() {
    if (!testText.trim()) return;
    setAnalyzing(true);
    try {
      const { data } = await apiClient.post('/privacy/analyze', { text: testText });
      setEntities(data.entities || []);
    } catch {
      setEntities([]);
    } finally {
      setAnalyzing(false);
    }
  }

  function renderHighlightedText() {
    if (!entities.length) return <span className="text-muted-foreground">{testText}</span>;

    const sorted = [...entities].sort((a, b) => a.start - b.start);
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    sorted.forEach((entity, i) => {
      if (entity.start > lastEnd) {
        parts.push(<span key={`t-${i}`}>{testText.slice(lastEnd, entity.start)}</span>);
      }
      parts.push(
        <span
          key={`e-${i}`}
          className="bg-purple-200 dark:bg-purple-900/50 text-purple-900 dark:text-purple-200 rounded px-0.5 relative group cursor-help"
          title={entity.type}
        >
          {testText.slice(entity.start, entity.end)}
          <span className="absolute -top-6 left-0 bg-foreground text-background text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            {entity.type}
          </span>
        </span>
      );
      lastEnd = entity.end;
    });

    if (lastEnd < testText.length) {
      parts.push(<span key="tail">{testText.slice(lastEnd)}</span>);
    }

    return <div className="leading-relaxed">{parts}</div>;
  }

  return (
    <SettingsLayout
      title="Privacy"
      description="PII protection for AI interactions"
    >
      <div className="space-y-6">
        {/* Status Card */}
        <div className="rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-4">
            {loading ? (
              <Shield className="size-5 text-muted-foreground animate-pulse" />
            ) : stats?.enabled ? (
              <ShieldCheck className="size-5 text-green-500" />
            ) : (
              <ShieldOff className="size-5 text-muted-foreground" />
            )}
            <div>
              <h3 className="font-semibold text-lg">SendCloak PII Protection</h3>
              <p className="text-sm text-muted-foreground">
                {loading
                  ? 'Checking status...'
                  : stats?.enabled
                    ? 'Active — personal data is automatically obfuscated before reaching AI providers'
                    : 'Disabled — AI providers receive unmodified text'}
              </p>
            </div>
          </div>

          {stats?.enabled && !stats?.error && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-2xl font-bold">
                  {stats.requests_processed ?? '—'}
                </div>
                <div className="text-xs text-muted-foreground">Requests Protected</div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-2xl font-bold">
                  {stats.entities_detected
                    ? Object.values(stats.entities_detected).reduce((a, b) => a + b, 0)
                    : '—'}
                </div>
                <div className="text-xs text-muted-foreground">Entities Detected</div>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <div className="text-2xl font-bold text-green-500">
                  <ShieldCheck className="size-6 inline" />
                </div>
                <div className="text-xs text-muted-foreground">Status: Healthy</div>
              </div>
            </div>
          )}

          {stats?.error && (
            <div className="flex items-center gap-2 mt-4 text-amber-500 text-sm">
              <AlertTriangle className="size-4" />
              <span>{stats.error}</span>
            </div>
          )}

          {!stats?.enabled && !loading && (
            <div className="mt-4 rounded-md bg-muted/50 p-4 text-sm">
              <p className="font-medium mb-2">How to enable:</p>
              <div className="space-y-1 text-muted-foreground font-mono text-xs">
                <p># Docker Compose:</p>
                <p>SENDCLOAK_ENABLED=true docker compose --profile privacy up</p>
                <p className="mt-2"># Or add to .env:</p>
                <p>SENDCLOAK_ENABLED=true</p>
              </div>
            </div>
          )}
        </div>

        {/* Entity Types Reference */}
        {stats?.enabled && stats.entities_detected && Object.keys(stats.entities_detected).length > 0 && (
          <div className="rounded-lg border p-6">
            <h3 className="font-semibold mb-3">Detected Entity Types</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.entities_detected).map(([type, count]) => (
                <div
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30 px-3 py-1 text-xs font-medium text-purple-800 dark:text-purple-200"
                >
                  <span>{type}</span>
                  <span className="text-purple-500">×{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI View Analyzer */}
        <div className="rounded-lg border p-6">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="size-4 text-purple-500" />
            <h3 className="font-semibold">AI View — See What Gets Protected</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Paste text below to see what SendCloak would detect and obfuscate before sending to an AI provider.
          </p>

          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Paste text to analyze for PII... e.g. 'Contact Dr. Müller at john.mueller@hospital.at, IBAN AT483200000012345864'"
            className="w-full h-32 rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={analyzeText}
              disabled={analyzing || !testText.trim() || !stats?.enabled}
              className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Eye className="size-3.5" />
              {analyzing ? 'Analyzing...' : 'Analyze'}
            </button>
            {entities.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Found {entities.length} entit{entities.length === 1 ? 'y' : 'ies'}
              </span>
            )}
          </div>

          {entities.length > 0 && (
            <div className="mt-4 rounded-md bg-muted/50 p-4 text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Highlighted = would be obfuscated before reaching AI
              </div>
              {renderHighlightedText()}
            </div>
          )}
        </div>
      </div>
    </SettingsLayout>
  );
}

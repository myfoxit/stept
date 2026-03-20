import React, { useEffect } from 'react';
import { sendToBackground } from '@/shared/messages';
import type { AppState, GuideData } from '../App';
import SearchBar from './SearchBar';
import ContextLinks from './ContextLinks';
import RecentWorkflows from './RecentWorkflows';
import GuideStepsPanel from './GuideStepsPanel';

interface SetupPanelProps {
  appState: AppState;
  onProjectChange: (projectId: string) => void;
  onStartRecording: (projectId: string) => void;
  onLogout: () => void;
  contextMatches: any[];
  setContextMatches: (matches: any[]) => void;
  activeGuide: { guide: GuideData; currentIndex: number; stepStatus?: string } | null;
  setActiveGuide: (
    guide: { guide: GuideData; currentIndex: number; stepStatus?: string } | null,
  ) => void;
  showToast: (text: string, duration?: number) => void;
  refreshState: () => Promise<void>;
}

export default function SetupPanel({
  appState,
  onProjectChange,
  onStartRecording,
  onLogout,
  contextMatches,
  setContextMatches,
  activeGuide,
  setActiveGuide,
  showToast,
  refreshState,
}: SetupPanelProps) {
  const { selectedProjectId, currentUser, userProjects } = appState;
  const displayName = currentUser?.name || currentUser?.email || 'User';

  // Load context matches on mount
  useEffect(() => {
    (async () => {
      const result = await sendToBackground<any>({ type: 'GET_CONTEXT_MATCHES' });
      setContextMatches(result.matches || []);
    })();
  }, [setContextMatches]);

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onProjectChange(e.target.value);
  };

  const handleStart = () => {
    if (selectedProjectId) {
      onStartRecording(selectedProjectId);
    }
  };

  return (
    <div id="spSetupPanel" className="sp-auth-panel">
      <div className="sp-setup-content">
        {/* Header project selector is rendered in Header, but we also need
            the selector visible in setup. The original HTML had the select
            in both the header-center AND used spProjectSelector id.
            We replicate the same structure. */}
        <div id="headerProjectSelector">
          <select
            id="spProjectSelector"
            className="header-select"
            value={selectedProjectId}
            onChange={handleProjectChange}
          >
            <option value="">Select project</option>
            {userProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <p id="spGreeting" className="sp-greeting">
          Hello, {displayName}
        </p>

        <button
          id="spStartBtn"
          className="btn btn-cta"
          disabled={!selectedProjectId}
          onClick={handleStart}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
          </svg>
          Start Capture
        </button>

        <SearchBar selectedProjectId={selectedProjectId} />

        <ContextLinks matches={contextMatches} />

        {!activeGuide && (
          <RecentWorkflows
            selectedProjectId={selectedProjectId}
            onPlayGuide={async (workflowId) => {
              try {
                const result = await sendToBackground<any>({
                  type: 'FETCH_WORKFLOW_GUIDE',
                  workflowId,
                });
                if (!result.success || !result.guide) {
                  showToast('No guide found for this workflow');
                  return;
                }
                setActiveGuide({
                  guide: result.guide,
                  currentIndex: 0,
                });
                await sendToBackground({ type: 'START_GUIDE', guide: result.guide });
              } catch {
                showToast('Failed to start guide');
              }
            }}
          />
        )}

        {activeGuide && (
          <GuideStepsPanel
            guide={activeGuide.guide}
            currentIndex={activeGuide.currentIndex}
            stepStatus={activeGuide.stepStatus}
            onStop={() => {
              sendToBackground({ type: 'STOP_GUIDE' });
              setActiveGuide(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { sendToBackground } from '@/shared/messages';

interface ContextMatch {
  resource_type: string;
  resource_id: string;
  resource_name?: string;
  match_type?: string;
}

interface ContextLinksProps {
  matches: ContextMatch[];
}

export default function ContextLinks({ matches }: ContextLinksProps) {
  const handleClick = async (match: ContextMatch) => {
    const settings = await sendToBackground<any>({ type: 'GET_SETTINGS' });
    const webAppUrl =
      settings.frontendUrl ||
      settings.apiBaseUrl.replace('/api/v1', '');
    const type =
      match.resource_type === 'workflow' ? 'workflows' : 'documents';
    chrome.tabs.create({
      url: `${webAppUrl}/${type}/${match.resource_id}`,
    });
  };

  return (
    <div className="context-panel" id="contextPanel">
      <div className="context-header">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3AB08A"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <span>Related Content</span>
      </div>

      <div className="context-list" id="contextList">
        {matches.map((m) => {
          const icon = m.resource_type === 'workflow' ? '\uD83D\uDCCB' : '\uD83D\uDCC4';
          return (
            <div
              key={m.resource_id}
              className="context-item"
              data-resource-type={m.resource_type}
              data-resource-id={m.resource_id}
              onClick={() => handleClick(m)}
            >
              <span className="context-item-icon">{icon}</span>
              <div className="context-item-info">
                <span className="context-item-name">
                  {m.resource_name || 'Untitled'}
                </span>
              </div>
              <span className="context-item-badge">
                {m.match_type || 'match'}
              </span>
            </div>
          );
        })}
      </div>

      {matches.length === 0 && (
        <div className="context-empty" id="contextEmpty">
          <span>No related content for this page</span>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Settings, ChatMessage } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { OndokiLogoSmall } from './OndokiLogo';

interface LlmSetupWizardProps {
  onClose: () => void;
  onComplete: (settings: Settings) => void;
}

type WizardStep = 1 | 2 | 3;
type Provider = 'ondoki' | 'openai' | 'claude' | 'gemini' | 'custom';

const PROVIDERS: { id: Provider; name: string; sub: string; dotBg: string; dotColor: string; icon: React.ReactNode }[] = [
  { id: 'ondoki', name: 'Ondoki (Default)', sub: 'No setup needed · Included free', dotBg: 'rgba(108,92,231,0.08)', dotColor: '#6C5CE7', icon: <OndokiLogoSmall /> },
  { id: 'openai', name: 'OpenAI', sub: 'GPT-4o · Requires API key', dotBg: '#E8F5E8', dotColor: '#10A37F', icon: <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>G</span> },
  { id: 'claude', name: 'Claude (Anthropic)', sub: 'Sonnet, Opus · Requires API key', dotBg: '#FFF0E6', dotColor: '#D97706', icon: <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>C</span> },
  { id: 'gemini', name: 'Gemini (Google)', sub: 'Pro, Flash · Requires API key', dotBg: '#E8F0FE', dotColor: '#4285F4', icon: <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>G</span> },
  { id: 'custom', name: 'Custom (Ollama)', sub: 'Self-hosted · Local inference', dotBg: '#F0F0F4', dotColor: '#555', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 8v8M8 12h8"/></svg>
  )},
];

const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-sonnet-4-5-20250514', 'claude-opus-4-5-20250414', 'claude-haiku-4-5-20250414'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
};

const ENDPOINT_DEFAULTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1',
  custom: 'http://localhost:11434',
};

const LlmSetupWizard: React.FC<LlmSetupWizardProps> = ({ onClose, onComplete }) => {
  const electronAPI = useElectronAPI();
  const [step, setStep] = useState<WizardStep>(1);
  const [provider, setProvider] = useState<Provider>('ondoki');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [testState, setTestState] = useState<'idle' | 'loading' | 'success' | 'fail'>('idle');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (step === 2) {
      setEndpoint(ENDPOINT_DEFAULTS[provider] || '');
      const models = MODEL_OPTIONS[provider];
      if (models && models.length > 0) setModel(models[0]);
    }
    if (step === 3) setTestState('idle');
  }, [step, provider]);

  const handleNext = async () => {
    if (step === 1 && provider === 'ondoki') {
      // Save ondoki as provider and close
      await saveAndComplete('ondoki', '', '', '');
      return;
    }
    if (step < 3) {
      setStep((step + 1) as WizardStep);
    } else {
      // Finish
      const llmProvider = provider === 'claude' ? 'anthropic' : provider;
      await saveAndComplete(llmProvider, apiKey, model, endpoint);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as WizardStep);
  };

  const saveAndComplete = async (llmProvider: string, llmApiKey: string, llmModel: string, llmBaseUrl: string) => {
    if (!electronAPI) return;
    try {
      setIsLoading(true);
      const currentSettings = await electronAPI.getSettings();
      const updated = { ...currentSettings, llmProvider, llmApiKey, llmModel, llmBaseUrl } as Settings;
      await electronAPI.saveSettings(updated);
      onComplete(updated);
    } catch (e) {
      console.error('Failed to save:', e);
    } finally { setIsLoading(false); }
  };

  const runTest = async () => {
    if (!electronAPI) return;
    setTestState('loading');
    try {
      const currentSettings = await electronAPI.getSettings();
      const llmProvider = provider === 'claude' ? 'anthropic' : provider;
      const testSettings = { ...currentSettings, llmProvider, llmApiKey: apiKey, llmModel: model, llmBaseUrl: endpoint };
      await electronAPI.saveSettings(testSettings as Settings);
      const testMessages: ChatMessage[] = [{ role: 'user', content: 'Hello, can you respond with just "AI connection successful"?' }];
      await electronAPI.sendChatMessage(testMessages);
      setTestState('success');
    } catch {
      setTestState('fail');
    }
  };

  const getNextLabel = () => {
    if (step === 1 && provider === 'ondoki') return 'Done';
    if (step === 3) return 'Finish';
    return 'Next';
  };

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wizard">
        {/* Header */}
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: 'var(--dark)', letterSpacing: '-0.02em' }}>
            AI Setup Wizard
          </span>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Steps progress */}
        <div style={{ display: 'flex', gap: 6, padding: '18px 24px 0' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className={`wiz-step ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`} />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Step 1: Choose provider */}
          {step === 1 && (
            <>
              <span className="section-title">Choose your AI provider</span>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Select which AI model will power documentation generation, summarization, and smart suggestions.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PROVIDERS.map(p => (
                  <div key={p.id} className={`provider-opt ${provider === p.id ? 'sel' : ''}`} onClick={() => setProvider(p.id)}>
                    <div className="provider-dot" style={{ background: p.dotBg, color: p.dotColor }}>{p.icon}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span className="provider-name">{p.name}</span>
                      <span className="provider-sub">{p.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Step 2: Configure */}
          {step === 2 && (
            <>
              <span className="section-title">Configure connection</span>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {provider === 'custom' ? 'Point Ondoki to your local Ollama instance.' : 'Enter your API credentials to connect.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div className="config-label" style={{ marginBottom: 4 }}>API Endpoint</div>
                  <input className="text-input" value={endpoint} onChange={e => setEndpoint(e.target.value)}
                    placeholder={ENDPOINT_DEFAULTS[provider] || ''} style={{ fontSize: '0.82rem' }} />
                </div>
                {provider !== 'custom' && (
                  <div>
                    <div className="config-label" style={{ marginBottom: 4 }}>API Key</div>
                    <input className="text-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-..." style={{ fontSize: '0.82rem' }} />
                  </div>
                )}
                {provider !== 'custom' && MODEL_OPTIONS[provider] && (
                  <div>
                    <div className="config-label" style={{ marginBottom: 4 }}>Model</div>
                    <div style={{ position: 'relative' }}>
                      <select className="custom-select" value={model} onChange={e => setModel(e.target.value)} style={{ fontSize: '0.82rem' }}>
                        {MODEL_OPTIONS[provider]?.map(m => <option key={m}>{m}</option>)}
                      </select>
                      <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}
                        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 3: Test */}
          {step === 3 && (
            <>
              <span className="section-title">Test connection</span>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Let's verify everything is working correctly.
              </p>
              {testState === 'loading' && (
                <div className="test-result loading">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </path>
                  </svg>
                  Testing connection...
                </div>
              )}
              {testState === 'success' && (
                <div className="test-result success">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  Connected successfully!
                </div>
              )}
              {testState === 'fail' && (
                <div className="test-result fail">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  Connection failed. Check your credentials.
                </div>
              )}
              <button className="btn-primary" style={{ marginTop: 4 }} onClick={runTest}>
                {testState === 'idle' ? 'Test Connection' : testState === 'loading' ? 'Testing...' : 'Test Again'}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn-sm ghost" onClick={handleBack} style={{ visibility: step > 1 ? 'visible' : 'hidden' }}>Back</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm ghost" onClick={onClose}>Cancel</button>
            <button className="btn-sm primary" onClick={handleNext}
              disabled={isLoading || (step === 3 && testState !== 'success')}>
              {isLoading ? 'Saving...' : getNextLabel()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LlmSetupWizard;

// Side panel auth elements
const spLoginPanel = document.getElementById('spLoginPanel');
const spSetupPanel = document.getElementById('spSetupPanel');
const spLoginBtn = document.getElementById('spLoginBtn');
const spLoginError = document.getElementById('spLoginError');
const spGreeting = document.getElementById('spGreeting');
const spProjectSelector = document.getElementById('spProjectSelector');
const spStartBtn = document.getElementById('spStartBtn');
const spLogoutBtn = document.getElementById('spLogoutBtn');
const headerProjectSelector = document.getElementById('headerProjectSelector');
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');

const stepsList = document.getElementById('stepsList');
const emptyState = document.getElementById('emptyState');
const badgeStepCount = document.getElementById('badgeStepCount');
const recordingTimeEl = document.getElementById('recordingTime');
const recordingBadge = document.getElementById('recordingBadge');
const recordingStatus = document.getElementById('recordingStatus');
const pauseBtn = document.getElementById('pauseBtn');
const pauseIcon = document.getElementById('pauseIcon');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const completeBtn = document.getElementById('completeBtn');
const footer = document.getElementById('footer');

// Upload panel elements
const uploadPanel = document.getElementById('uploadPanel');
const uploadTitle = document.getElementById('uploadTitle');
const uploadMessage = document.getElementById('uploadMessage');
const uploadStepCount = document.getElementById('uploadStepCount');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const uploadStatus = document.getElementById('uploadStatus');
const uploadActions = document.getElementById('uploadActions');
const uploadDoneActions = document.getElementById('uploadDoneActions');
const backBtn = document.getElementById('backBtn');
const uploadBtn = document.getElementById('uploadBtn');
const newCaptureBtn = document.getElementById('newCaptureBtn');

let recordingInterval = null;
let steps = [];

// Settings slide-in panel
function openSettings() {
  settingsPanel.classList.add('open');
  settingsBackdrop.classList.add('open');
  loadSettingsValues();
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsBackdrop.classList.remove('open');
}

settingsToggleBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsBackdrop.addEventListener('click', closeSettings);

async function loadSettingsValues() {
  const settings = await sendMessage({ type: 'GET_SETTINGS' });

  if (settings.apiBaseUrl) spApiUrlInput.value = settings.apiBaseUrl;
  if (settings.frontendUrl) {
    const frontendInput = document.getElementById('spFrontendUrlInput');
    if (frontendInput) frontendInput.value = settings.frontendUrl;
  }

  // Hide API URL section in cloud mode
  const apiSection = document.getElementById('apiUrlSection');
  if (apiSection && settings.buildMode === 'cloud') {
    apiSection.style.display = 'none';
  }

  const mode = settings.displayMode || 'sidepanel';
  spModeSidePanelBtn.classList.toggle('active', mode === 'sidepanel');
  spModeDockBtn.classList.toggle('active', mode === 'dock');

  // Auto-upload toggle
  document.getElementById('settingsAutoUpload').checked = settings.autoUpload !== false;
}

// Save auto-upload setting on change
document.getElementById('settingsAutoUpload').addEventListener('change', (e) => {
  sendMessage({ type: 'SET_SETTINGS', autoUpload: e.target.checked });
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await refreshState();
});

async function refreshState() {
  const state = await sendMessage({ type: 'GET_STATE' });

  if (!state.isAuthenticated) {
    // Show login panel
    spLoginPanel.classList.remove('hidden');
    spSetupPanel.classList.add('hidden');
    stepsList.classList.add('hidden');
    footer.classList.add('hidden');
    recordingBadge.classList.remove('visible');
    headerProjectSelector.classList.add('hidden');
    return;
  }

  if (!state.isRecording) {
    // Show setup panel (project selector + start)
    spLoginPanel.classList.add('hidden');
    spSetupPanel.classList.remove('hidden');
    stepsList.classList.add('hidden');
    footer.classList.add('hidden');
    recordingBadge.classList.remove('visible');
    headerProjectSelector.classList.remove('hidden');

    const displayName = state.currentUser?.name || state.currentUser?.email || 'User';
    spGreeting.textContent = `Hello, ${displayName}`;

    // Populate projects
    spProjectSelector.innerHTML = '<option value="">Select project</option>';
    if (state.userProjects?.length) {
      state.userProjects.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === state.selectedProjectId) opt.selected = true;
        spProjectSelector.appendChild(opt);
      });
      spStartBtn.disabled = !state.selectedProjectId;
    }

    // Load context matches for current tab
    loadContextMatches();
    loadRecentWorkflows();

    return;
  }

  // Recording state — show steps
  spLoginPanel.classList.add('hidden');
  spSetupPanel.classList.add('hidden');
  stepsList.classList.remove('hidden');
  footer.classList.remove('hidden');
  recordingBadge.classList.add('visible');
  headerProjectSelector.classList.add('hidden');

  const stepsResult = await sendMessage({ type: 'GET_STEPS' });
  steps = stepsResult.steps || [];
  updateUI(state);
  renderSteps();

  if (state.isRecording && state.recordingStartTime) {
    startRecordingTimer(state.recordingStartTime);
  }
}

function updateUI(state) {
  // Update badge with step count
  badgeStepCount.textContent = `${steps.length} steps`;

  if (state.isPaused) {
    recordingBadge.classList.add('paused');
    recordingStatus.textContent = 'Paused';
    pauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    pauseBtn.title = 'Resume';
  } else {
    recordingBadge.classList.remove('paused');
    recordingStatus.textContent = 'Recording';
    pauseIcon.innerHTML =
      '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    pauseBtn.title = 'Pause';
  }
}

function renderSteps() {
  if (steps.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  // Clear existing steps (except empty state)
  const existingCards = stepsList.querySelectorAll('.step-card');
  const existingStepNumbers = new Set();
  existingCards.forEach((card) => {
    existingStepNumbers.add(parseInt(card.dataset.stepNumber));
  });

  // Add new steps
  steps.forEach((step, index) => {
    if (!existingStepNumbers.has(step.stepNumber)) {
      const card = createStepCard(step, index === steps.length - 1);
      stepsList.appendChild(card);
    }
  });

  // Scroll to bottom
  stepsList.scrollTop = stepsList.scrollHeight;
}

function createStepCard(step, isNew) {
  const card = document.createElement('div');
  card.className = 'step-card' + (isNew ? ' new' : '');
  card.dataset.stepNumber = step.stepNumber;

  card.innerHTML = `
    <div class="step-top-row">
      <span class="step-number">${step.stepNumber}</span>
      <div class="step-text">
        <p class="step-description">${escapeHtml(step.description || step.actionType)}</p>
        ${step.url ? `<p class="step-url">${escapeHtml(step.url)}</p>` : ''}
      </div>
    </div>
    ${step.screenshotDataUrl ? `
      <div class="step-screenshot-container">
        <img class="step-screenshot" src="${step.screenshotDataUrl}" alt="Step ${step.stepNumber}">
        ${step.screenshotRelativeMousePosition && step.screenshotSize ? `
          <div class="click-marker" style="left: ${(step.screenshotRelativeMousePosition.x / step.screenshotSize.width) * 100}%; top: ${(step.screenshotRelativeMousePosition.y / step.screenshotSize.height) * 100}%;">
            <div class="click-marker-pulse"></div>
            <div class="click-marker-ring"></div>
            <div class="click-marker-dot"></div>
          </div>
        ` : ''}
      </div>
    ` : ''}
    <button class="step-delete" data-step="${step.stepNumber}" title="Delete step">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A8A29E" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
  `;

  card.querySelector('.step-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    await sendMessage({ type: 'DELETE_STEP', stepNumber: step.stepNumber });
    card.remove();
    await refreshState();
  });

  // Zoom screenshot on click
  const screenshotEl = card.querySelector('.step-screenshot');
  if (screenshotEl) {
    screenshotEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const overlay = document.createElement('div');
      overlay.className = 'screenshot-overlay';
      overlay.innerHTML = `<img src="${step.screenshotDataUrl}" alt="Step ${step.stepNumber}">`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
  }

  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function startRecordingTimer(startTime) {
  stopRecordingTimer();

  const updateTime = () => {
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    recordingTimeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  updateTime();
  recordingInterval = setInterval(updateTime, 1000);
}

function stopRecordingTimer() {
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
}

function showUploadPanel() {
  stepsList.classList.add('hidden');
  footer.classList.add('hidden');
  uploadPanel.classList.remove('hidden');

  uploadStepCount.textContent = steps.length;
  uploadTitle.textContent = 'Ready to Upload';
  uploadMessage.innerHTML = `<span id="uploadStepCount">${steps.length}</span> steps captured`;
  uploadStatus.textContent = '';
  uploadStatus.className = 'upload-status';
  progressBar.classList.add('hidden');
  progressFill.style.width = '0%';
  uploadActions.classList.remove('hidden');
  uploadDoneActions.classList.add('hidden');

  stopRecordingTimer();
}

function hideUploadPanel() {
  stepsList.classList.remove('hidden');
  footer.classList.remove('hidden');
  uploadPanel.classList.add('hidden');
}

async function performUpload() {
  uploadBtn.disabled = true;
  backBtn.disabled = true;
  uploadTitle.textContent = 'Uploading...';
  uploadMessage.textContent = 'Please wait while we upload your capture';
  progressBar.classList.remove('hidden');
  uploadStatus.textContent = 'Preparing upload...';

  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += 10;
    if (progress <= 90) {
      progressFill.style.width = progress + '%';
    }
  }, 500);

  const result = await sendMessage({ type: 'UPLOAD' });

  clearInterval(progressInterval);
  progressFill.style.width = '100%';

  if (result.success) {
    await sendMessage({ type: 'CLEAR_STEPS' });
    steps = [];

    // Redirect to the new workflow
    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    const webAppUrl = settings.frontendUrl || (settings.apiBaseUrl || '').replace('/api/v1', '');
    if (result.sessionId && webAppUrl) {
      chrome.tabs.create({ url: `${webAppUrl}/workflow/${result.sessionId}` });
    }

    // Close the side panel
    window.close();
  } else {
    uploadTitle.textContent = 'Upload Failed';
    uploadMessage.textContent = 'There was a problem uploading your capture';
    uploadStatus.textContent = result.error || 'Unknown error occurred';
    uploadStatus.classList.add('upload-error');
    uploadBtn.disabled = false;
    backBtn.disabled = false;
  }
}

// Event listeners
pauseBtn.addEventListener('click', async () => {
  const state = await sendMessage({ type: 'GET_STATE' });

  if (state.isPaused) {
    await sendMessage({ type: 'RESUME_RECORDING' });
  } else {
    await sendMessage({ type: 'PAUSE_RECORDING' });
  }

  await refreshState();
});

// Smart Blur toggle in recording footer
const redactionToggleBtn = document.getElementById('redactionToggleBtn');
let smartBlurOpen = false;

redactionToggleBtn.addEventListener('click', async () => {
  const result = await sendMessage({ type: 'TOGGLE_SMART_BLUR' });
  smartBlurOpen = result?.isOpen || false;
  updateSmartBlurButton();
});

function updateSmartBlurButton() {
  redactionToggleBtn.classList.toggle('redaction-active', smartBlurOpen);
  redactionToggleBtn.title = smartBlurOpen ? 'Smart Blur: ON' : 'Smart Blur';
  document.getElementById('blurIconOff').style.display = smartBlurOpen ? 'none' : '';
  document.getElementById('blurIconOn').style.display = smartBlurOpen ? '' : 'none';
}

deleteAllBtn.addEventListener('click', async () => {
  if (confirm('Delete this entire capture?')) {
    await sendMessage({ type: 'STOP_RECORDING' });
    await sendMessage({ type: 'CLEAR_STEPS' });
    await refreshState();
  }
});

completeBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'STOP_RECORDING' });
  // Auto-upload immediately
  showUploadPanel();
  uploadActions.classList.add('hidden');
  uploadTitle.textContent = 'Uploading...';
  uploadMessage.textContent = 'Please wait while we upload your capture';
  await performUpload();
});

backBtn.addEventListener('click', async () => {
  const state = await sendMessage({ type: 'GET_STATE' });
  if (!state.isRecording && steps.length > 0) {
    hideUploadPanel();
  } else {
    await sendMessage({
      type: 'START_RECORDING',
      projectId: state.selectedProjectId,
    });
    hideUploadPanel();
    await refreshState();
  }
});

uploadBtn.addEventListener('click', performUpload);

newCaptureBtn.addEventListener('click', async () => {
  const state = await sendMessage({ type: 'GET_STATE' });
  const projectId = state.selectedProjectId;

  if (projectId) {
    await sendMessage({ type: 'CLEAR_STEPS' });
    await sendMessage({ type: 'START_RECORDING', projectId });
  }

  hideUploadPanel();
  stepsList.innerHTML = '';
  steps = [];
  const emptyStateEl = document.getElementById('emptyState');
  if (emptyStateEl) {
    emptyStateEl.style.display = 'flex';
  }
  badgeStepCount.textContent = '0 steps';
  recordingTimeEl.textContent = '00:00';
  await refreshState();
});

// Side panel auth event listeners
spLoginBtn.addEventListener('click', async () => {
  spLoginBtn.disabled = true;
  spLoginBtn.textContent = 'Signing in...';
  spLoginError.classList.add('hidden');
  try {
    const result = await sendMessage({ type: 'LOGIN' });
    if (result.success) {
      await refreshState();
    } else {
      spLoginError.textContent = 'Login failed: ' + (result.error || 'Unknown error');
      spLoginError.classList.remove('hidden');
    }
  } catch (e) {
    spLoginError.textContent = 'Login failed: ' + e.message;
    spLoginError.classList.remove('hidden');
  } finally {
    spLoginBtn.disabled = false;
    spLoginBtn.textContent = 'Sign In';
  }
});

spLogoutBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'LOGOUT' });
  await refreshState();
});

spProjectSelector.addEventListener('change', () => {
  spStartBtn.disabled = !spProjectSelector.value;
  loadRecentWorkflows();
});

spStartBtn.addEventListener('click', async () => {
  const projectId = spProjectSelector.value;
  if (!projectId) return;
  await sendMessage({ type: 'START_RECORDING', projectId });
  await refreshState();
});

// Settings in side panel
const spModeSidePanelBtn = document.getElementById('spModeSidePanel');
const spModeDockBtn = document.getElementById('spModeDock');
const spApiUrlInput = document.getElementById('spApiUrlInput');
const spSaveSettingsBtn = document.getElementById('spSaveSettingsBtn');

spModeSidePanelBtn.addEventListener('click', async () => {
  spModeSidePanelBtn.classList.add('active');
  spModeDockBtn.classList.remove('active');
  await sendMessage({ type: 'SET_DISPLAY_MODE', displayMode: 'sidepanel' });
});

spModeDockBtn.addEventListener('click', async () => {
  spModeDockBtn.classList.add('active');
  spModeSidePanelBtn.classList.remove('active');
  await sendMessage({ type: 'SET_DISPLAY_MODE', displayMode: 'dock' });
});

spSaveSettingsBtn.addEventListener('click', async () => {
  const url = spApiUrlInput.value.trim();
  if (url) {
    await sendMessage({ type: 'SET_SETTINGS', apiBaseUrl: url });
    spSaveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => { spSaveSettingsBtn.textContent = 'Save'; }, 1500);
  }
});

// Frontend URL save handler
const spSaveFrontendBtn = document.getElementById('spSaveFrontendBtn');
const spFrontendUrlInput = document.getElementById('spFrontendUrlInput');
if (spSaveFrontendBtn && spFrontendUrlInput) {
  spSaveFrontendBtn.addEventListener('click', async () => {
    const url = spFrontendUrlInput.value.trim();
    if (url) {
      await sendMessage({ type: 'SET_SETTINGS', frontendUrl: url });
      spSaveFrontendBtn.textContent = 'Saved!';
      setTimeout(() => { spSaveFrontendBtn.textContent = 'Save'; }, 1500);
    }
  });
}

// ===== SEARCH =====
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchSpinner = document.getElementById('searchSpinner');
let searchDebounceTimer = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  const query = searchInput.value.trim();
  if (query.length === 0) {
    searchResults.classList.add('hidden');
    searchSpinner.classList.add('hidden');
    document.getElementById('workflowEmptyState').style.display = '';
    return;
  }
  searchSpinner.classList.remove('hidden');
  searchDebounceTimer = setTimeout(() => performSearch(query), 300);
});

async function performSearch(query) {
  try {
    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    const state = await sendMessage({ type: 'GET_STATE' });
    if (!state.isAuthenticated) return;

    const params = new URLSearchParams({ q: query, limit: '10' });
    if (state.selectedProjectId) params.append('project_id', state.selectedProjectId);

    const results = await sendMessage({
      type: 'API_FETCH',
      url: `${settings.apiBaseUrl}/search/search?${params}`,
    });

    searchSpinner.classList.add('hidden');

    if (!results) {
      searchResults.innerHTML = '<div class="search-no-results">Search failed</div>';
      searchResults.classList.remove('hidden');
      return;
    }

    renderSearchResults(results, settings.frontendUrl || settings.apiBaseUrl.replace('/api/v1', ''));
  } catch (e) {
    searchSpinner.classList.add('hidden');
    searchResults.innerHTML = '<div class="search-no-results">Search failed</div>';
    searchResults.classList.remove('hidden');
  }
}

function renderSearchResults(data, frontendUrl) {
  const results = data.results || [];

  if (results.length === 0) {
    searchResults.innerHTML = '<div class="search-no-results">No results found</div>';
    searchResults.classList.remove('hidden');
    return;
  }

  const webAppUrl = frontendUrl;
  searchResults.innerHTML = results.map((r) => {
    const title = escapeHtml(r.name || r.generated_title || 'Untitled');
    const snippet = r.snippet || r.summary || '';
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
    const id = r.recording_id || r.id;
    return `
      <div class="search-result-item" data-url="${webAppUrl}/workflow/${id}">
        <span class="search-result-title">${title}</span>
        ${snippet ? `<span class="search-result-snippet">${snippet}</span>` : ''}
        ${date ? `<span class="search-result-meta">${date}</span>` : ''}
      </div>
    `;
  }).join('');

  searchResults.querySelectorAll('.search-result-item').forEach((item) => {
    item.addEventListener('click', () => {
      chrome.tabs.create({ url: item.dataset.url });
    });
  });

  searchResults.classList.remove('hidden');
}

// ===== CONTEXT LINKS =====
const contextPanel = document.getElementById('contextPanel');
const contextList = document.getElementById('contextList');
const contextEmpty = document.getElementById('contextEmpty');

async function loadContextMatches() {
  const result = await sendMessage({ type: 'GET_CONTEXT_MATCHES' });
  renderContextMatches(result.matches || []);
}

function renderContextMatches(matches) {
  if (!matches || matches.length === 0) {
    contextList.innerHTML = '';
    contextEmpty.classList.remove('hidden');
    return;
  }

  contextEmpty.classList.add('hidden');

  contextList.innerHTML = matches.map((m) => {
    const icon = m.resource_type === 'workflow' ? '\uD83D\uDCCB' : '\uD83D\uDCC4';
    return `
      <div class="context-item" data-resource-type="${m.resource_type}" data-resource-id="${m.resource_id}">
        <span class="context-item-icon">${icon}</span>
        <div class="context-item-info">
          <span class="context-item-name">${escapeHtml(m.resource_name || 'Untitled')}</span>
        </div>
        <span class="context-item-badge">${escapeHtml(m.match_type || 'match')}</span>
      </div>
    `;
  }).join('');

  contextList.querySelectorAll('.context-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const settings = await sendMessage({ type: 'GET_SETTINGS' });
      const webAppUrl = settings.frontendUrl || settings.apiBaseUrl.replace('/api/v1', '');
      const type = item.dataset.resourceType === 'workflow' ? 'workflows' : 'documents';
      chrome.tabs.create({ url: `${webAppUrl}/${type}/${item.dataset.resourceId}` });
    });
  });
}

// Load context matches when setup panel is shown
// (called from refreshState when not recording)

// ===== RECENT WORKFLOWS =====
const recentList = document.getElementById('recentList');
const recentLoading = document.getElementById('recentLoading');

async function loadRecentWorkflows() {
  if (!recentList) return;

  const projectId = spProjectSelector.value;
  if (!projectId) {
    recentList.innerHTML = '<div class="recent-empty">Select a project to see workflows</div>';
    return;
  }

  recentList.innerHTML = '<div class="recent-loading">Loading...</div>';

  try {
    const apiBaseUrl = await sendMessage({ type: 'GET_SETTINGS' }).then(s => s.apiBaseUrl || 'http://localhost:8000/api/v1');
    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    const webAppUrl = settings.frontendUrl || apiBaseUrl.replace('/api/v1', '');

    const result = await sendMessage({
      type: 'API_FETCH',
      url: `${apiBaseUrl}/process-recording/workflows/filtered?project_id=${projectId}&limit=10&sort_by=created_at&sort_order=desc`,
    });

    if (!result || !Array.isArray(result)) {
      recentList.innerHTML = '<div class="recent-empty">No workflows yet</div>';
      return;
    }

    if (result.length === 0) {
      recentList.innerHTML = '<div class="recent-empty">No workflows yet</div>';
      return;
    }

    recentList.innerHTML = result.map((w) => {
      const title = w.name || 'Untitled workflow';
      const date = w.created_at ? timeAgo(new Date(w.created_at)) : '';
      const steps = w.total_steps || 0;
      const id = w.id;
      return `
        <a class="recent-item" href="#" data-url="${webAppUrl}/workflow/${id}">
          <div class="recent-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#78716C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
          </div>
          <div class="recent-item-info">
            <div class="recent-item-title">${escapeHtml(title)}</div>
            <div class="recent-item-meta">${steps} steps · ${date}</div>
          </div>
        </a>
      `;
    }).join('');

    recentList.querySelectorAll('.recent-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: item.dataset.url });
      });
    });
  } catch (e) {
    console.error('Failed to load recent workflows:', e);
    recentList.innerHTML = '<div class="recent-empty">Failed to load workflows</div>';
  }
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// MISS-C002: Show a temporary error toast in the side panel
function showToast(text, duration = 4000) {
  const existing = document.querySelector('.toast-error');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-error';
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// Listen for step updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STEP_ADDED') {
    steps.push(message.step);
    badgeStepCount.textContent = `${steps.length} steps`;
    renderSteps();
  } else if (message.type === 'SCREENSHOT_FAILED') {
    showToast('Screenshot failed \u2014 try again');
  } else if (message.type === 'MAX_STEPS_REACHED') {
    showToast(`Maximum steps reached (${message.limit}). Stop recording to save.`, 6000);
  } else if (message.type === 'RECORDING_STATE_CHANGED') {
    smartBlurOpen = false;
    updateSmartBlurButton();
    refreshState();
  } else if (message.type === 'CONTEXT_MATCHES_UPDATED') {
    renderContextMatches(message.matches || []);
  }
});

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

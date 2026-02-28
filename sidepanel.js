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
const settingsAccordion = document.getElementById('settingsAccordion');

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

// Settings gear toggles the settings accordion in setup panel
settingsToggleBtn.addEventListener('click', () => {
  if (settingsAccordion && spSetupPanel && !spSetupPanel.classList.contains('hidden')) {
    settingsAccordion.open = !settingsAccordion.open;
  }
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
    uploadTitle.textContent = 'Upload Complete!';
    uploadMessage.textContent = 'Your capture has been saved to the cloud';
    uploadStatus.textContent = '\u2713 Successfully uploaded';
    uploadStatus.classList.add('upload-success');
    uploadActions.classList.add('hidden');
    uploadDoneActions.classList.remove('hidden');

    await sendMessage({ type: 'CLEAR_STEPS' });
    steps = [];
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

// Load settings
sendMessage({ type: 'GET_SETTINGS' }).then((settings) => {
  if (settings.apiBaseUrl) spApiUrlInput.value = settings.apiBaseUrl;
  const mode = settings.displayMode || 'sidepanel';
  spModeSidePanelBtn.classList.toggle('active', mode === 'sidepanel');
  spModeDockBtn.classList.toggle('active', mode === 'dock');
});

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
    refreshState();
  }
});

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

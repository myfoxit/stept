// DOM Elements
const loginPanel = document.getElementById('loginPanel');
const userPanel = document.getElementById('userPanel');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const greeting = document.getElementById('greeting');
const projectSelector = document.getElementById('projectSelector');
const startBtn = document.getElementById('startBtn');
const idlePanel = document.getElementById('idlePanel');
const recordingPanel = document.getElementById('recordingPanel');
const previewPanel = document.getElementById('previewPanel');
const uploadPanel = document.getElementById('uploadPanel');
const pauseBtn = document.getElementById('pauseBtn');
const pauseIcon = document.getElementById('pauseIcon');
const pauseText = document.getElementById('pauseText');
const deleteBtn = document.getElementById('deleteBtn');
const completeBtn = document.getElementById('completeBtn');
const statusText = document.getElementById('statusText');
const stepCount = document.getElementById('stepCount');
const recordingTime = document.getElementById('recordingTime');
const recordingIndicator = document.getElementById('recordingIndicator');
const stepsContainer = document.getElementById('stepsContainer');
const closePreviewBtn = document.getElementById('closePreviewBtn');
const uploadBtn = document.getElementById('uploadBtn');
const progressFill = document.getElementById('progressFill');
const uploadStatus = document.getElementById('uploadStatus');
const apiUrlInput = document.getElementById('apiUrlInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

let recordingInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshState();
});

async function loadSettings() {
  const settings = await sendMessage({ type: 'GET_SETTINGS' });
  if (settings.apiBaseUrl) {
    apiUrlInput.value = settings.apiBaseUrl;
  }
}

// Refresh state from background
async function refreshState() {
  const state = await sendMessage({ type: 'GET_STATE' });
  updateUI(state);
}

// Update UI based on state
function updateUI(state) {
  if (state.isAuthenticated) {
    loginPanel.classList.add('hidden');
    userPanel.classList.remove('hidden');

    const displayName =
      state.currentUser?.name || state.currentUser?.email || 'User';
    greeting.textContent = `Hello, ${displayName}!`;

    populateProjects(state.userProjects, state.selectedProjectId);

    if (state.isRecording) {
      showRecordingPanel(state);
    } else {
      showIdlePanel();
    }
  } else {
    loginPanel.classList.remove('hidden');
    userPanel.classList.add('hidden');
  }
}

function populateProjects(projects, selectedId) {
  projectSelector.innerHTML = '<option value="">Select project</option>';

  if (projects && projects.length > 0) {
    projects.forEach((project) => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      if (project.id === selectedId) {
        option.selected = true;
      }
      projectSelector.appendChild(option);
    });
    startBtn.disabled = !selectedId;
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No projects available';
    option.disabled = true;
    projectSelector.appendChild(option);
    startBtn.disabled = true;
  }
}

function showIdlePanel() {
  idlePanel.classList.remove('hidden');
  recordingPanel.classList.add('hidden');
  previewPanel.classList.add('hidden');
  uploadPanel.classList.add('hidden');
  stopRecordingTimer();
}

function showRecordingPanel(state) {
  idlePanel.classList.add('hidden');
  recordingPanel.classList.remove('hidden');
  previewPanel.classList.add('hidden');
  uploadPanel.classList.add('hidden');

  stepCount.textContent = `${state.stepCount} steps recorded`;

  if (state.isPaused) {
    statusText.textContent = 'Paused';
    recordingIndicator.classList.add('paused');
    pauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    pauseText.textContent = 'Resume';
  } else {
    statusText.textContent = 'Capturing...';
    recordingIndicator.classList.remove('paused');
    pauseIcon.innerHTML =
      '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    pauseText.textContent = 'Pause';
  }

  startRecordingTimer(state.recordingStartTime);
}

function showPreviewPanel(steps) {
  idlePanel.classList.add('hidden');
  recordingPanel.classList.add('hidden');
  previewPanel.classList.remove('hidden');
  uploadPanel.classList.add('hidden');
  stopRecordingTimer();

  renderSteps(steps);
}

function showUploadPanel() {
  previewPanel.classList.add('hidden');
  uploadPanel.classList.remove('hidden');
}

function renderSteps(steps) {
  stepsContainer.innerHTML = '';

  steps.forEach((step) => {
    const stepEl = document.createElement('div');
    stepEl.className = 'step-item';
    stepEl.innerHTML = `
      <img class="step-thumbnail" src="${step.screenshotDataUrl || ''}" alt="Step ${step.stepNumber}">
      <div class="step-info">
        <div class="step-number">Step ${step.stepNumber}</div>
        <div class="step-action">${step.actionType}</div>
        <div class="step-desc">${step.description}</div>
      </div>
    `;
    stepsContainer.appendChild(stepEl);
  });
}

function startRecordingTimer(startTime) {
  stopRecordingTimer();

  const updateTime = () => {
    const elapsed = Date.now() - startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    recordingTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

// Event Listeners
loginBtn.addEventListener('click', async () => {
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';

  try {
    const result = await sendMessage({ type: 'LOGIN' });
    if (result.success) {
      await refreshState();
    } else {
      alert('Login failed: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Login failed: ' + error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
});

logoutBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'LOGOUT' });
  await refreshState();
});

projectSelector.addEventListener('change', () => {
  startBtn.disabled = !projectSelector.value;
});

startBtn.addEventListener('click', async () => {
  const projectId = projectSelector.value;
  if (!projectId) return;

  await sendMessage({ type: 'START_RECORDING', projectId });
  await sendMessage({ type: 'OPEN_SIDE_PANEL' });
  window.close();
});

pauseBtn.addEventListener('click', async () => {
  const state = await sendMessage({ type: 'GET_STATE' });

  if (state.isPaused) {
    await sendMessage({ type: 'RESUME_RECORDING' });
  } else {
    await sendMessage({ type: 'PAUSE_RECORDING' });
  }

  await refreshState();
});

deleteBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to delete this capture?')) {
    await sendMessage({ type: 'STOP_RECORDING' });
    await sendMessage({ type: 'CLEAR_STEPS' });
    await refreshState();
  }
});

completeBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'STOP_RECORDING' });
  const result = await sendMessage({ type: 'GET_STEPS' });
  showPreviewPanel(result.steps || []);
});

closePreviewBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'CLEAR_STEPS' });
  showIdlePanel();
});

uploadBtn.addEventListener('click', async () => {
  showUploadPanel();
  progressFill.style.width = '0%';
  uploadStatus.textContent = 'Starting upload...';

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
    uploadStatus.textContent = 'Upload complete!';
    setTimeout(async () => {
      await sendMessage({ type: 'CLEAR_STEPS' });
      showIdlePanel();
    }, 2000);
  } else {
    uploadStatus.textContent =
      'Upload failed: ' + (result.error || 'Unknown error');
  }
});

saveSettingsBtn.addEventListener('click', async () => {
  const url = apiUrlInput.value.trim();
  if (url) {
    await sendMessage({ type: 'SET_SETTINGS', apiBaseUrl: url });
    saveSettingsBtn.textContent = 'Saved!';
    setTimeout(() => { saveSettingsBtn.textContent = 'Save'; }, 1500);
  }
});

// Listen for step updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STEP_ADDED') {
    refreshState();
  } else if (message.type === 'MAX_STEPS_REACHED') {
    // MISS-C003: Show warning when step limit is reached
    stepCount.textContent = `Maximum steps reached (${message.limit}). Stop recording to save.`;
    stepCount.style.color = '#dc2626';
  }
});

// Helper function to send messages to background
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

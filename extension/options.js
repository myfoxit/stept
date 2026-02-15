document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.sync.get(['apiUrl', 'appUrl', 'authToken', 'projectId']);
  document.getElementById('apiUrl').value = data.apiUrl || '';
  document.getElementById('appUrl').value = data.appUrl || '';
  document.getElementById('authToken').value = data.authToken || '';
  document.getElementById('projectId').value = data.projectId || '';

  document.getElementById('save').addEventListener('click', async () => {
    await chrome.storage.sync.set({
      apiUrl: document.getElementById('apiUrl').value.replace(/\/$/, ''),
      appUrl: document.getElementById('appUrl').value.replace(/\/$/, ''),
      authToken: document.getElementById('authToken').value,
      projectId: document.getElementById('projectId').value,
    });
    const el = document.getElementById('saved');
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 2000);
  });
});

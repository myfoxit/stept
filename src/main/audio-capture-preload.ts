import { contextBridge, ipcRenderer } from 'electron';

let mediaRecorder: MediaRecorder | null = null;
let audioStream: MediaStream | null = null;

// Bridge for main process to control audio capture
ipcRenderer.on('audio-capture:start', async (_event, options: { deviceId?: string }) => {
  try {
    const constraints: MediaStreamConstraints = {
      audio: options.deviceId
        ? { deviceId: { exact: options.deviceId } }
        : true,
      video: false,
    };

    audioStream = await navigator.mediaDevices.getUserMedia(constraints);

    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        event.data.arrayBuffer().then((buffer) => {
          ipcRenderer.send('audio-capture:chunk', buffer);
        });
      }
    };

    mediaRecorder.onerror = (event: any) => {
      ipcRenderer.send('audio-capture:error', event.error?.message || 'Unknown MediaRecorder error');
    };

    // Collect data every 250ms for low latency
    mediaRecorder.start(250);
    ipcRenderer.send('audio-capture:started');
  } catch (error: any) {
    ipcRenderer.send('audio-capture:error', error.message || 'Failed to start audio capture');
  }
});

ipcRenderer.on('audio-capture:stop', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = () => {
      cleanup();
      ipcRenderer.send('audio-capture:stopped');
    };
    mediaRecorder.stop();
  } else {
    cleanup();
    ipcRenderer.send('audio-capture:stopped');
  }
});

ipcRenderer.on('audio-capture:pause', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
  }
});

ipcRenderer.on('audio-capture:resume', () => {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
  }
});

ipcRenderer.on('audio-capture:list-devices', async () => {
  try {
    // Request permission first (needed to get labels)
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${d.deviceId.substring(0, 8)}`,
        kind: d.kind,
      }));
    ipcRenderer.send('audio-capture:devices-result', audioInputs);
  } catch (error: any) {
    ipcRenderer.send('audio-capture:devices-result', []);
  }
});

function cleanup(): void {
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
  }
  mediaRecorder = null;
}

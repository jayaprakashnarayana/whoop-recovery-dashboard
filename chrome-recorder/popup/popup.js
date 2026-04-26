document.addEventListener('DOMContentLoaded', async () => {
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');
  const pauseIcon = document.getElementById('pauseIcon');
  const pauseText = document.getElementById('pauseText');

  // Check initial state
  const { isRecording, isPaused } = await chrome.storage.local.get(['isRecording', 'isPaused']);
  let currentPausedState = isPaused || false;
  updateUI(isRecording, currentPausedState);

  // Listen for messages from background/offscreen
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'recording_started') {
      updateUI(true, false);
    } else if (message.type === 'recording_paused') {
      currentPausedState = true;
      updateUI(true, true);
    } else if (message.type === 'recording_resumed') {
      currentPausedState = false;
      updateUI(true, false);
    } else if (message.type === 'processing_started') {
      statusEl.textContent = '⏳ Uploading & Transcribing AI...';
      statusEl.style.color = '#a855f7';
      startBtn.disabled = true;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
    } else if (message.type === 'transcription_complete') {
      statusEl.textContent = '✅ Transcription Complete!';
      statusEl.style.color = '#10b981';
      document.getElementById('transcriptContainer').style.display = 'block';
      document.getElementById('transcriptText').value = message.text;
      startBtn.disabled = false;
      chrome.storage.local.set({ isRecording: false, isPaused: false });
    } else if (message.type === 'recording_canceled' || message.type === 'recording_error') {
      updateUI(false, false);
      chrome.storage.local.set({ isRecording: false, isPaused: false });
      if (message.error) {
        if (message.error === 'SERVER_OFFLINE') {
          statusEl.innerHTML = `❌ <b>AI Server Offline!</b><br>Open your terminal and run:<br><code style="display:block;background:#333;color:#10b981;padding:8px;margin-top:8px;border-radius:4px;font-size:11px;text-align:left;word-break:break-all;">cd /Users/jnaguboina/.gemini/antigravity/scratch/chrome-transcriber-backend && python3 server.py</code>`;
        } else {
          statusEl.textContent = message.error;
        }
        statusEl.style.color = '#ef4444'; // Red for error
      }
    }
  });

  // Handle saving the transcript
  document.getElementById('saveTranscriptBtn').addEventListener('click', () => {
    const text = document.getElementById('transcriptText').value;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: `Transcript-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    });
  });

  startBtn.addEventListener('click', async () => {
    statusEl.textContent = 'Checking AI server connection...';
    startBtn.disabled = true;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;

    // Pre-flight check to see if Python server is running
    try {
      const res = await fetch('http://localhost:8085/health', { method: 'GET' });
      if (!res.ok) throw new Error('Server not ready');
    } catch (err) {
      statusEl.innerHTML = `❌ <b>AI Server Offline!</b><br>Open your terminal and run:<br><code style="display:block;background:#333;color:#10b981;padding:8px;margin-top:8px;border-radius:4px;font-size:11px;text-align:left;word-break:break-all;">cd /Users/jnaguboina/.gemini/antigravity/scratch/chrome-transcriber-backend && python3 server.py</code>`;
      statusEl.style.color = '#ef4444';
      return; // Stop here, do not start recording
    }

    statusEl.textContent = 'Starting capture...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || activeTab.url.startsWith('chrome://')) {
        statusEl.textContent = 'Cannot record chrome:// internal pages.';
        statusEl.style.color = '#ef4444';
        startBtn.disabled = false;
        return;
      }

      chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
        if (!streamId || chrome.runtime.lastError) {
          statusEl.textContent = 'Error: ' + (chrome.runtime.lastError?.message || 'Failed to get stream ID');
          statusEl.style.color = '#ef4444';
          startBtn.disabled = false;
          return;
        }
        chrome.runtime.sendMessage({ type: 'start_recording', streamId: streamId });
      });
    });
  });

  pauseBtn.addEventListener('click', () => {
    if (currentPausedState) {
      chrome.runtime.sendMessage({ type: 'resume_recording' });
    } else {
      chrome.runtime.sendMessage({ type: 'pause_recording' });
    }
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'stop_recording' });
    updateUI(false, false);
  });

  function updateUI(recording, paused) {
    if (recording) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      pauseBtn.disabled = false;
      
      if (paused) {
        statusEl.textContent = 'Recording Paused ⏸️';
        statusEl.classList.remove('recording');
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Resume';
      } else {
        statusEl.textContent = 'Recording in progress...';
        statusEl.classList.add('recording');
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'Pause';
      }
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      pauseBtn.disabled = true;
      statusEl.textContent = 'Ready to record';
      statusEl.classList.remove('recording');
      pauseIcon.textContent = '⏸️';
      pauseText.textContent = 'Pause';
      currentPausedState = false;
    }
  }
});

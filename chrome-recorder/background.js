const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start_recording') {
    startOffscreenRecording(message.streamId);
  } else if (message.type === 'stop_recording') {
    stopOffscreenRecording();
  } else if (message.type === 'pause_recording') {
    pauseOffscreenRecording();
  } else if (message.type === 'resume_recording') {
    resumeOffscreenRecording();
  } else if (message.type === 'download_file') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      conflictAction: 'uniquify',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Download failed:", chrome.runtime.lastError);
      } else if (downloadId) {
        chrome.downloads.show(downloadId);
      }
    });
  }
});

async function startOffscreenRecording(streamId) {
  try {
    await setupOffscreenDocument();

    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'start_offscreen_recording',
      data: streamId
    });
    
    chrome.storage.local.set({ isRecording: true });
  } catch (error) {
    console.error('Failed to start recording flow:', error);
    chrome.runtime.sendMessage({ type: 'recording_error', error: error.toString() });
  }
}

async function stopOffscreenRecording() {
  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'stop_offscreen_recording'
  });
  chrome.storage.local.set({ isRecording: false, isPaused: false });
}

function pauseOffscreenRecording() {
  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'pause_offscreen_recording'
  });
  chrome.storage.local.set({ isPaused: true });
}

function resumeOffscreenRecording() {
  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'resume_offscreen_recording'
  });
  chrome.storage.local.set({ isPaused: false });
}

let creating; // Promise state to prevent race conditions
async function setupOffscreenDocument() {
  if (await hasDocument()) return;
  if (creating) {
    await creating;
    return;
  }
  
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['DISPLAY_MEDIA', 'AUDIO_PLAYBACK'], 
    justification: 'Recording screen and outputting audio back to user.'
  }).catch(err => {
    // Ignore if already created
    if (!err.message.includes('Only a single offscreen')) throw err;
  });

  try {
    await creating;
  } finally {
    creating = null;
  }
}

async function hasDocument() {
  if ('getContexts' in chrome.runtime) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return contexts.length > 0;
  }
  return false;
}

let mediaRecorder;
let recordedChunks = [];
let audioCtx;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start_offscreen_recording') {
    startRecording(message.data);
  } else if (message.type === 'stop_offscreen_recording') {
    stopRecording();
  } else if (message.type === 'pause_offscreen_recording') {
    pauseRecording();
  } else if (message.type === 'resume_offscreen_recording') {
    resumeRecording();
  }
});

async function startRecording(streamId) {
  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });
    } catch(err) {
      if (err.name === 'OverconstrainedError' || err.name === 'NotReadableError' || err.message.toLowerCase().includes('audio')) {
        throw new Error('Audio stream not found! This tab might not be playing audio.');
      }
      throw err;
    }

    // Route the captured audio back to the system speakers so the user can hear it!
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(audioCtx.destination);
    
    // If the user reloads the tab, Chrome violently kills the stream.
    // We MUST catch this and force the video to securely save instead of disappearing!
    stream.getTracks().forEach(track => {
      track.onended = () => {
        console.warn("Stream track ended automatically (page may have reloaded). Stopping recorder safely.");
        stopRecording();
      };
    });

    // Notify the background or popup that recording has started
    chrome.runtime.sendMessage({ type: 'recording_started' });

    recordedChunks = [];
    // Optimize bitrates explicitly for 4-hour long sessions to prevent memory bloat/crashing
    const options = { 
      mimeType: 'video/webm;codecs=vp9,opus',
      videoBitsPerSecond: 2500000, // 2.5 Mbps is highly optimal for screen recordings
      audioBitsPerSecond: 128000
    };
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop all tracks inside the stream
      stream.getTracks().forEach(track => track.stop());
      if (audioCtx) {
        audioCtx.close();
      }
      
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const filename = `Recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      
      // 🚨 SAFETY BACKUP: Always immediately download the raw video to the browser
      // just in case the Python backend server is offline or crashes!
      chrome.runtime.sendMessage({
        type: 'download_file',
        url: url,
        filename: `Raw-${filename}`
      });

      // Notify popup that processing/uploading has started
      chrome.runtime.sendMessage({ type: 'processing_started' });

      try {
        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetch('http://localhost:8085/process', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Backend Error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        if (result.status === 'success') {
          chrome.runtime.sendMessage({ type: 'transcription_complete', text: result.transcript });
        } else {
          throw new Error(result.message || JSON.stringify(result));
        }
      } catch (err) {
        console.error("Upload/Processing error:", err);
        
        let errorMessage = 'Transcription failed: ' + err.message;
        // Detect if the server is completely offline
        if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
          errorMessage = 'SERVER_OFFLINE';
        }
        
        chrome.runtime.sendMessage({ type: 'recording_error', error: errorMessage });
      }
    };

    mediaRecorder.start(1000); // collect chunks every second
  } catch (error) {
    console.error("Error starting recording:", error);
    chrome.runtime.sendMessage({ type: 'recording_error', error: error.toString() });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    chrome.runtime.sendMessage({ type: 'recording_paused' });
  }
}

function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    chrome.runtime.sendMessage({ type: 'recording_resumed' });
  }
}

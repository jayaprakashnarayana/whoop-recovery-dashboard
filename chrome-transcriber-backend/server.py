import os
import shutil
import whisper
from datetime import datetime
import subprocess
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

@app.get("/health")
async def health_check():
    return {"status": "online"}

# Allow connections from the Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (Chrome Extensions can have dynamic origins like chrome-extension://...)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the whisper model globally so it's ready for fast inference
print("Loading Whisper Model...")
model = whisper.load_model("base")
print("Whisper Model Loaded!")

@app.post("/process")
async def process_video(file: UploadFile = File(...)):
    # Create a unique timestamped folder for this recording
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_dir = os.path.join("recordings", timestamp)
    os.makedirs(output_dir, exist_ok=True)
    
    # Define file paths inside the new folder
    webm_path = os.path.join(output_dir, "raw_recording.webm")
    mp4_path = os.path.join(output_dir, "converted_recording.mp4")
    txt_path = os.path.join(output_dir, "transcript.txt")
    
    try:
        # 1. Save the incoming WebM blob to disk
        print(f"[{timestamp}] Receiving file into folder: {output_dir}")
        with open(webm_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Convert WebM to MP4 using raw FFmpeg (MoviePy crashes on missing Chrome WebM headers)
        print(f"[{timestamp}] Converting WebM to MP4...")
        subprocess.run([
            "ffmpeg", "-y", "-i", webm_path,
            "-c:v", "libx264", "-c:a", "aac", mp4_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        
        # 3. Transcribe the MP4 using Whisper
        print(f"[{timestamp}] Transcribing audio with Whisper...")
        result = model.transcribe(mp4_path, fp16=False)
        transcript_text = result["text"].strip()
        
        # 4. Save the transcript to a text file right next to the videos
        print(f"[{timestamp}] Saving transcript to text file...")
        with open(txt_path, "w", encoding="utf-8") as text_file:
            text_file.write(transcript_text)
        
        print(f"[{timestamp}] ✅ All files successfully saved to: {output_dir}")
        
        return {
            "status": "success", 
            "transcript": transcript_text,
            "folder": output_dir
        }
        
    except Exception as e:
        print(f"[{timestamp}] ERROR: {str(e)}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8085, reload=True)

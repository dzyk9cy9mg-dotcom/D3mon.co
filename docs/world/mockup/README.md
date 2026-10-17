# Mockup prototype

The throwaway prototype behind the sample videos. **Not the real build:** sample data, no live API, written for recording, not for visitors.

This folder is the prototype behind the sample videos sent to the owner (52 s, sample data, labelled as a mockup). It's for reference only, not the real build.

- `index.html`: the three.js scene, with a camera path, overlays and sample battle data. It runs one frame per `window.frame(t)` call.
- `capture.mjs`: records it with Playwright frame by frame.
- `sound.py`: the synthesized eerie soundtrack (numpy). The owner asked for **no water or wave-like noise**.

To rebuild a video:

1. `npm install three@0.169.0` in this folder.
2. Serve the folder on port 8765.
3. Run `node capture.mjs video frames 30 0 52`.
4. Join the frames into an MP4 with ffmpeg, and mux in `python3 sound.py score.wav` (the echo filters used were `aecho=0.8:0.6:380|820|1450:0.28|0.18|0.1,highpass=f=28,loudnorm=I=-18:TP=-1.5:LRA=14`).

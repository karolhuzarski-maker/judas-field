# SAR synchronized video pair

Upload the two MP4 files from the SVANTOVID synthetic flyover into this folder **on the main branch**, preserving these exact names:

- `sar-rgb.mp4`: RGB UAV flyover, 1280 × 720, 30 fps, 10 seconds.
- `sar-lwir.mp4`: corresponding frame-aligned synthetic LWIR, 1280 × 720, 30 fps, 10 seconds.

Once both files exist in this folder, the SAR / SYNCHRONIZED VIDEO PAIR source mode automatically loads them on GitHub Pages. Nothing needs to be changed in `index.html`.

Choose RGB, LWIR or RGB + LWIR to view synchronized video. If these files are not hosted, manual local MP4 selection remains available.

**Scientific limitation:** thermal footage is synthetic and non-radiometric. The existing stress sliders/AI scores are illustrative and are not detections performed on the MP4 streams. This video preview never claims actual thermal measurements or model inference.

This directory intentionally contains **no binary MP4 files yet**. Do not treat a green deployment as proof the videos are uploaded.

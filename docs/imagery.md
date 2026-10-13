# Field imagery and annotation provenance

The six WebP assets in `assets/scenes/` were created with OpenAI's built-in image generation on 2026-10-13. They depict fictional staged field exercises. They are not photographs from an actual incident, flight, organization, customer or sensor.

RGB images were generated independently for MCI (5 people), TCCC (4) and SAR (3). Each thermal-style image was generated as an edit of its RGB reference, preserving composition and subject positions. All are 1672 × 941 pixels and converted to WebP at quality 88 without cropping or resizing. Full generation instructions are saved in `assets/scene-prompts.json`.

`scenarios.js` contains manually reviewed normalized `[x, y, width, height]` boxes. The same boxes cover visible body extents in the paired RGB and thermal images, with small margins for generative contour differences. Shadows are excluded and fully hidden anatomy is not inferred. These are illustrative spatially aligned pairs, not measured sensor registration. Model outputs that use full-body or different annotation conventions need corresponding reference annotations before scores are comparable.

Thermal views are synthetic monochrome representations, not radiometric data, calibrated temperature measurements, or evidence of seeing through occluders. No actual DJI recording is used. Registered real field recordings are a future data source.

The simulator zooms the complete image and its annotations together. Smoke, fog, motion, light and partial obstruction are lightweight visual illustrations, not validated sensor physics. Imported predictions are evaluated on the original full reference image without these effects. Download that original from Evaluate your model before running an external detector.

Ground truth is a separate overlay. Simulated predictions use target IDs to resolve the image-specific boxes. False alarms use separately recorded non-person boxes, and misses are shown after the observation completes. The synthetic scoring equations retain their original illustrative assumptions; they have not been fitted to these images.

These public examples support transparent format and evaluation experiments. They do not constitute a hidden, independently validated benchmark or evidence of real-world generalization.

# JUDAS FIELD v0.3.0

**FIND YOUR AI'S BREAKING POINT.**  
Independent stress testing for Physical AI in unfamiliar real-world conditions. By **GRIM SIGNAL LABS**.

[Live demo](https://karolhuzarski-maker.github.io/judas-field/?v=0.3.0) · [Repository](https://github.com/karolhuzarski-maker/judas-field)

We help AI developers discover where their models fail before those failures happen in operational environments. Initial specialization: MCI, TCCC and SAR.

## Two clearly separated workflows

**SYNTHETIC MODEL DEMO** illustrates a stress-testing methodology using deterministic mathematical profiles A/B. No neural network or real inference is running. Choose MCI (5 subjects), TCCC / Tactical Casualty Observation (4), or SAR (3); change conditions; scan; run a stress suite; find the first tested non-pass; compare identical A/B conditions; export the session.

**IMPORTED MODEL PREDICTIONS** evaluates an external detector's existing JSON or CSV predictions against the fixed annotated reference image. Files are read locally and never uploaded. Download a reference image, run your detector elsewhere, then import its predictions. This workflow computes actual one-to-one IoU matches on those supplied boxes; it does not run the model. Both imported sets must use the same scenario, sensor and thresholds.

Scores on these small synthetic examples are not evidence of real-world performance, certification or independent blind validation. No diagnosis, breathing assessment, triage or treatment recommendations are made.

## UAV observation geometry

Altitude and ground speed are the canonical physical inputs. The **Target Visibility Time** control changes speed using the inverse geometry; it is no longer an independent scoring duration. Changing altitude keeps speed fixed and recalculates the footprint and visibility. The live **UAV OBSERVATION GEOMETRY** panel shows the viewing cone, footprint, target and distance travelled. **UNDERSTAND THE VARIABLES** explains the competing effects of dwell time, target scale and motion stability.

The illustrative camera looks straight down with a configurable **60° along-track field of view**. For a stationary target on a central straight-line flyover:

```text
footprint = 2 × altitude × tan(FOV / 2)
target visibility = footprint / speed
effective observation = min(target visibility, observation cap)
```

The default cap is **30 s**. At zero speed, geometric visibility is **Continuous / Hover** and effective observation is the cap. The cap cannot lengthen a brief flyover. At 30 m altitude, 12 m/s gives approximately 2.89 s, 5 m/s gives 6.93 s, and requesting 10 s sets speed to approximately 3.46 m/s. Infeasible visibility requests are clamped to the allowed flight range and explained in the interface.

The engine gates synthetic acquisition by this effective time, while retaining separate target-scale, motion-stability, occlusion, smoke, fog, lighting and sensor effects. The former short-window and brief-exposure difficulty penalties have been removed to avoid counting the same loss of visibility time twice. Longer visibility and higher altitude do not guarantee better detection. Suites, matched comparisons, charts, history and exports use normalized geometry for every run.

**60° is a demonstrator assumption, not a verified DJI Matrice 4TD specification.** This model does not account for gimbal tracking, off-centre target paths or real camera calibration. See [calculation details, compatibility and limitations](docs/observation-geometry.md).

## Guided presentation

Click **RUN 60-SECOND DEMO**. In approximately 60 seconds of active viewing it introduces SAR, runs a real baseline, increases occlusion, explains the first failed acceptance level, runs matched A/B tests and opens the AI Stress Report. It records 19 completed simulated runs in the existing application history. Skip advances narration after the current scoring finishes. Restart cancels the previous flow; End demo retains completed runs only. Hidden-tab time does not consume narration, so leaving the tab can lengthen the total wall-clock presentation.

The guide uses 30 m altitude, 4 m/s, a 60° assumed FOV and a 30 s cap: the actual calculated effective observation is approximately **8.66 s**. Its occlusion sweep keeps these physical inputs fixed. Narrated failure boundaries come from completed results, rather than stored claims about either profile.

## Field imagery and annotations

Six optimized WebP assets provide photorealistic generated RGB scenes and corresponding synthetic thermal representations at 1672 × 941 pixels. [Imagery provenance](docs/imagery.md) and [generation prompts](assets/scene-prompts.json) document their origin. `scenarios.js` contains image-specific normalized `[x, y, width, height]` annotations reviewed across the paired views. Ground truth, model predictions, misses and false alarms use separate layers in a shared image-coordinate frame.

Thermal variants are illustrative, not calibrated radiometric data or measured sensor registration. Small generative contour variations are included in shared annotation margins. They do not show through solid occluders. Real registered DJI RGB/thermal field recordings are a future data source.

Altitude zooms the whole image and overlays together. Motion, localized smoke, depth-varying fog, RGB darkness and texture-based partial occlusion illustrate the selected stressors. These effects and the scoring equations are not a physically validated optical simulator and have not been fitted to the images.

**Fly-by speed controls scan pace:** hover takes 6 seconds, 4 m/s takes 3 seconds, and 12 m/s takes 1.5 seconds. Suites use a faster preview with the same relationship recalculated per step. Pause freezes progress and camera drift. This compressed preview duration is distinct from the physical target visibility and effective observation used for scoring; a six-second hover preview can represent a 30-second capped observation.

**Run current settings** and **Scan current scene** preserve the displayed configuration. **Reset & run baseline** is the explicit action that restores clear conditions. Completed session history is retained until the page is closed or reloaded; export it before leaving when needed.

## Import predictions

Read the full [schema and matching rule](docs/predictions.md). A [downloadable MCI JSON example](examples/mci-predictions.json) is also included; the interface creates an example for any selected scenario and sensor. Examples copy reference boxes to demonstrate the format and are explicitly identified as such, not as real inference.

- Coordinates are normalized `[x, y, width, height]`, relative to the **original full reference image**.
- Default confidence threshold: 0.25. Default IoU threshold: 0.50. Both are recorded in reports.
- Predictions are processed by descending confidence. Each takes the highest-IoU unmatched reference above the IoU threshold. Confidence ties keep input order; IoU ties keep manifest order.
- Duplicate or unmatched predictions are FP; unmatched reference subjects are FN. Below-confidence predictions are excluded and audited.
- Precision = TP / (TP + FP), defined as 0 with no retained predictions. Recall = TP / (TP + FN).
- Malformed data, incompatible schemas/sensors/scenarios, invalid boxes, repeated IDs and excessive files are rejected with actionable messages. Limits: 2 MiB and 2,000 predictions per file.
- No degradation curve or breaking point is inferred from one imported image. Multi-condition claims require a controlled dataset.

## Reports and benchmark scope

The **AI Stress Report** includes test/session identification, conditions, source, sensor, TP/FP/FN, precision/recall, first tested quality-threshold failure, degradation curves, matched comparisons, worst cases, validation priorities and provenance. Every synthetic run records altitude, ground speed, assumed FOV, footprint, geometric visibility, observation cap and effective observation, together with the relevant trade-offs. Hover visibility is represented as `null` with an explicit hover flag in structured data, rather than a non-finite JSON number. JSON and CSV preserve the underlying audit; Print / save PDF uses the browser print dialog. Imported results have their own clearly labelled report and exports; a single imported image does not establish detection latency or a flyover experiment.

The open examples and references are available now. **Blind benchmark is planned**, not active: all current annotations and scoring remain publicly visible in browser source. A future independent service requires held-out scenarios and field data.

The pilot partner contact action currently opens a GitHub enquiry. It can be changed to a confirmed business email or form without altering the application.

## Local use and tests

Open `index.html` in a modern browser, or serve this folder with any static server. There is no build step, backend, API key, runtime dependency, analytics or third-party data upload.

```sh
python -m http.server 8080
node --test tests/*.test.cjs
```

Tests cover physical geometry and inverse control, hover/cap behaviour, canonical normalization, deterministic scoring, import validation, IoU matching, matched comparisons, report audit, reference geometry, separate layers, scan timing/pause/reset, suite transitions and guided flow timing/cancellation. Browser QA remains necessary for slider interaction, the live diagram, desktop/mobile layout, image decoding, file pickers, downloads and the complete presentation.

## Files

| File / directory | Responsibility |
| --- | --- |
| index.html, style.css | Existing dashboard, navigation, business presentation and print styles |
| engine.js | Observation geometry, inverse visibility control, canonical configuration and deterministic synthetic scoring |
| scenarios.js | Asset manifest and reviewed reference boxes |
| assets/scenes/ | Three RGB and three thermal-style WebP frames |
| scene.js, scene.css | Photo rendering, coordinate transforms, stress effects and independent overlays |
| app.js | Runs, controls, history, curves, synthetic report and guided integration |
| observation.js, observation.css | Live UAV geometry schematic and interactive variable explanations |
| guided.js, guided.css | Timed presentation using real application runs |
| evaluation.js | Dependency-free local parsing, IoU matching, comparison and exports |
| evaluation-ui.js, evaluation.css | Local import workflow, image audit and imported reports |
| docs/, examples/ | Schemas, provenance and example input |
| tests/ | Engine, scan, scene, guided and evaluation regression tests |

## GitHub Pages and future domain

The existing repository publishes from **main / root**, without a build command or `CNAME`. All asset paths remain relative so the same application can move to a Grim Signal Labs domain later. Set the confirmed domain in GitHub Pages, configure its DNS, and verify HTTPS when domain ownership/access is available. No domain or DNS changes are part of this release.

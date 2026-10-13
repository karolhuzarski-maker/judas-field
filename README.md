# JUDAS FIELD

**FIND YOUR AI'S BREAKING POINT.**  
An interactive, synthetic stress-test demonstrator by **GRIM SIGNAL LABS**.

Repository: [karolhuzarski-maker/judas-field](https://github.com/karolhuzarski-maker/judas-field)  
GitHub Pages address: [karolhuzarski-maker.github.io/judas-field/](https://karolhuzarski-maker.github.io/judas-field/)

## What this demo does

Explore how changing observation conditions affects two illustrative person-detection model profiles. Choose **MCI**, **TCCC**, or **SAR**, run a baseline, increase stress manually or with an automatic suite, inspect the first failed quality threshold, compare the profiles, and export a session report.

- **MCI — Mass Casualty Incidents:** a synthetic road-incident scene with several people and obstacles.
- **TCCC — Tactical Casualty Assessment:** a staged observation scene illustrating the limits of visible information. It does not diagnose injuries, assign triage categories, assess breathing, or recommend treatment.
- **SAR — Search and Rescue:** a woodland search scene with occlusion and synthetic environmental distractions.

Altitude, observation fly-by speed, occlusion, smoke/fog, observation time, lighting, and RGB/thermal sensor choice affect the simulation. **Model A / Baseline** and **Model B / Robust** are mathematical profiles, not deployed AI systems or measured commercial models. Results are repeatable for the same scenario, profile, settings, and seed.

**SYNTHETIC R&D DEMO — no real AI inference.** All scenes, people, detections, confidence values, and timing estimates are simulated. This small sample is intended to explain a testing workflow; it does not establish real-world performance, statistical reliability, certification, or operational suitability. Ground truth and scoring are visible in the browser source. A blind benchmark is not active in this demo.

## Run locally

Open `index.html` in a modern browser. The app uses local HTML, CSS, and classic JavaScript scripts, with no backend, installation, API keys, or external libraries.

Alternatively, serve the repository directory using a static server, for example:

```sh
python -m http.server 8080
```

Then open `http://localhost:8080/`.

## Try the workflow

1. Choose a scenario and run its baseline.
2. Run **AUTO STRESS SUITE** to measure a sequence of increasing difficulty.
3. Use **FIND BREAKING POINT** to identify the first tested level that misses the selected quality thresholds. Passing the tested range does not establish safety beyond that range.
4. Use **COMPARE MODELS** to compare A and B with identical scenario settings and seed.
5. Inspect the scene, curve, failure explanation, and history; open the report and download JSON or CSV.

The session history records completed runs. Export the report before leaving the page if you need to retain it. Exported data identifies the results as synthetic and includes the configuration needed to interpret the measurements.

## Reading the results

| Metric | Meaning |
| --- | --- |
| TP | A synthetic person correctly detected. |
| FN | A synthetic person missed. `TP + FN` equals the number of people in the scenario. |
| FP | A synthetic detection that does not correspond to a person. |
| Precision | `TP / (TP + FP)`; the engine handles an empty detection set explicitly. |
| Recall | `TP / (TP + FN)`; the proportion of present people detected. |
| PASS | Meets the selected minimum recall and maximum FP limits. |
| DEGRADED / FAIL | Does not meet the complete quality requirement; severity depends on the simulated outcome. |
| First breaking point | The first tested configuration that does not pass the selected thresholds. |
| Time to first detection | Simulated elapsed observation time until the first stable detection; unavailable when nothing is detected. |
| Observation time | The configured observation window. |
| Transit / flight time | A separate illustrative travel-time estimate, not an aircraft specification. |
| Time to actionable information | The defined total timing estimate when the minimum information requirement is met; otherwise **NOT ACHIEVED**. |

The app and report expose the test conditions, sample size, seed, and timing assumptions. A thermal palette is a synthetic visual representation, not a calibrated thermal image. Suggestions in the failure explanation are priorities for further validation, not proven remedies.

## Project structure

```text
index.html              Interface and page structure
style.css               Responsive styles
engine.js               Scenario data and deterministic scoring
scene.js                Interactive synthetic scene rendering
app.js                  Application state, runs, reports, and exports
tests/engine.test.cjs    Automated engine checks
```

Run the engine checks with a current Node.js installation:

```sh
node --test tests/engine.test.cjs
```

Also check the browser flow after changes: scenario switching, run/pause/reset, sensor switching, automatic suite, breaking-point search, comparison, exports, keyboard use, and narrow-screen layout. Engine tests alone do not verify presentation or browser interactions.

## GitHub Pages

This repository is a static site. In **Settings → Pages**, choose **Deploy from a branch**, branch **main**, and folder **/ (root)**. No build command or package installation is required. GitHub documents these options in [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Keep asset links relative to the page so the same files work at the GitHub project URL and a future custom domain.

## Connect a GRIM SIGNAL LABS domain later

The initial deployment uses the GitHub Pages address. No custom domain is configured in the source, and no `CNAME` file is included.

Once the intended domain or subdomain is selected and its DNS can be managed:

1. Verify domain ownership in GitHub and set the custom domain in the repository's Pages settings.
2. Configure DNS using GitHub's instructions for that domain type. A subdomain points to `karolhuzarski-maker.github.io`, without the `/judas-field/` path.
3. Wait for DNS and certificate provisioning, then enable HTTPS and verify the app and downloads at the new address.

For branch publishing, GitHub's custom-domain setting manages a `CNAME` file. Follow [Managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) when making that change. The application does not need to be rebuilt for the domain switch.

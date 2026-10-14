/* JUDAS FIELD v0.3 — nadir observation geometry and deterministic synthetic scoring, not AI inference. */
(function (root) {
  'use strict';

  const defaults = Object.freeze({ domain: 'MCI', model: 'A', altitude: 30, speed: 0,
    fov: 60, observationCap: 30, occlusion: 0, smoke: 0, fog: 0, observation: 30, sensor: 'RGB', light: 'day',
    seed: 42, minRecall: 0.8, maxFP: 1 });
  const person = (id, x, y, posture, mobility, baseline_visibility, scene_occlusion, contrast) =>
    Object.freeze({ id, x, y, posture, mobility, baseline_visibility, scene_occlusion, contrast, target_present: true });
  const domains = Object.freeze({
    MCI: Object.freeze({ name: 'MCI', title: 'Mass casualty incidents',
      description: 'Road incident / multiple casualties. Five synthetic people across a semi-open scene.',
      persons: Object.freeze([
        person('P01', 32, 35, 'standing', 'moving', 0.98, 0.02, 0.86),
        person('P02', 47, 57, 'lying', 'still', 0.91, 0.12, 0.66),
        person('P03', 64, 38, 'sitting', 'still', 0.93, 0.08, 0.76),
        person('P04', 72, 72, 'lying', 'still', 0.84, 0.21, 0.49),
        person('P05', 25, 76, 'standing', 'still', 0.96, 0.06, 0.80)
      ]) }),
    TCCC: Object.freeze({ name: 'TCCC', title: 'Tactical casualty observation',
      description: 'Tactical observation / simulated subjects. Observable person cues only; no medical assessment.',
      persons: Object.freeze([
        person('T01', 28, 30, 'standing', 'moving', 0.95, 0.08, 0.77),
        person('T02', 48, 46, 'lying', 'still', 0.87, 0.17, 0.51),
        person('T03', 71, 65, 'sitting', 'still', 0.91, 0.13, 0.65),
        person('T04', 36, 76, 'lying', 'still', 0.81, 0.25, 0.42)
      ]) }),
    SAR: Object.freeze({ name: 'SAR', title: 'Search and rescue',
      description: 'Woodland search. Three synthetic people among trees, grass and background clutter.',
      persons: Object.freeze([
        person('S01', 27, 32, 'standing', 'moving', 0.94, 0.10, 0.77),
        person('S02', 62, 56, 'sitting', 'still', 0.88, 0.21, 0.52),
        person('S03', 77, 79, 'lying', 'still', 0.82, 0.29, 0.39)
      ]) })
  });
  const models = Object.freeze({
    A: Object.freeze({ name: 'Model A / Baseline', processingTime: 0.45,
      description: 'Faster in clear daylight; sensitive to occlusion and poor RGB light.' }),
    B: Object.freeze({ name: 'Model B / Robust', processingTime: 1.15,
      description: 'More tolerant of partial occlusion and thermal conditions; slower and slightly weaker in clear RGB daylight.' })
  });
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const round = value => Math.round(value * 10000) / 10000;
  const numeric = (value, fallback, low, high) => {
    if (value === null || value === '' || typeof value === 'boolean') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, low, high) : fallback;
  };
  const copy = value => JSON.parse(JSON.stringify(value));

  // Altitude and ground speed are canonical. The along-track FOV is an
  // illustrative assumption, not a DJI camera specification. Geometry does not
  // call normalize, so inverse controls cannot create a circular update.
  function geometry(input) {
    const source = input || {};
    const altitude = numeric(source.altitude, defaults.altitude, 15, 120);
    const speed = numeric(source.speed, defaults.speed, 0, 12);
    const fov = numeric(source.fov, defaults.fov, 1, 170);
    const observationCap = numeric(source.observationCap, defaults.observationCap, 1, 120);
    const footprint = 2 * altitude * Math.tan(fov * Math.PI / 360);
    const hover = speed === 0;
    // null is the serializable continuous-hover sentinel. Saturation only
    // protects extreme subnormal numeric inputs from producing Infinity.
    const visibilityTime = hover ? null : Math.min(Number.MAX_VALUE, footprint / speed);
    const effectiveObservationTime = hover ? observationCap : Math.min(visibilityTime, observationCap);
    return { altitude, speed, fov, footprint, visibilityTime, observationCap,
      effectiveObservationTime, hover, travelDistance: speed * effectiveObservationTime };
  }

  function normalize(input) {
    const source = input || {};
    const physical = geometry(source);
    return {
      domain: Object.hasOwn(domains, source.domain) ? source.domain : defaults.domain,
      model: Object.hasOwn(models, source.model) ? source.model : defaults.model,
      altitude: physical.altitude,
      speed: physical.speed,
      fov: physical.fov,
      observationCap: physical.observationCap,
      occlusion: numeric(source.occlusion, defaults.occlusion, 0, 100),
      smoke: numeric(source.smoke, defaults.smoke, 0, 100),
      fog: numeric(source.fog, defaults.fog, 0, 100),
      // Compatibility field: effective, geometry-derived duration. Incoming
      // legacy observation values are deliberately ignored, never overrides.
      observation: physical.effectiveObservationTime,
      sensor: String(source.sensor || '').toUpperCase() === 'THERMAL' ? 'THERMAL' : 'RGB',
      light: ['day', 'dusk', 'night'].includes(source.light) ? source.light : 'day',
      seed: Math.trunc(numeric(source.seed, defaults.seed, 0, 4294967295)),
      minRecall: numeric(source.minRecall, defaults.minRecall, 0, 1),
      maxFP: Math.floor(numeric(source.maxFP, defaults.maxFP, 0, 10))
    };
  }

  function withVisibility(input, requestedSeconds) {
    if (requestedSeconds === null || requestedSeconds === '' || typeof requestedSeconds === 'boolean'
      || !Number.isFinite(Number(requestedSeconds)) || Number(requestedSeconds) <= 0) {
      throw new RangeError('Requested visibility must be a finite positive number of seconds.');
    }
    const requestedVisibilityTime = Number(requestedSeconds);
    const physical = geometry(input);
    const requiredSpeed = physical.footprint / requestedVisibilityTime;
    const speed = clamp(requiredSpeed, 0, 12);
    const clamped = requiredSpeed > 12;
    const shortest = physical.footprint / 12;
    return { config: normalize({ ...input, speed }), requestedVisibilityTime, clamped,
      reason: clamped ? `At ${physical.altitude} m and ${physical.fov}° FOV, the shortest visibility at the 12 m/s speed limit is ${shortest.toFixed(2)} s. Speed was limited to 12 m/s.` : '' };
  }

  // Stable per-object variation is intentionally independent of stress and model.
  // Matched seeds therefore compare the same synthetic scene, and increasing a
  // single stressor cannot introduce an unrelated random change in performance.
  function unitNoise(seed, key) {
    let hash = (seed ^ 2166136261) >>> 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0;
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d) >>> 0;
    hash ^= hash >>> 15;
    return (hash >>> 0) / 4294967296;
  }

  function stressFactors(config) {
    const thermal = config.sensor === 'THERMAL';
    const robust = config.model === 'B';
    const lowLight = { day: 0, dusk: 0.17, night: 0.38 }[config.light];
    return {
      altitude: 0.20 * (config.altitude - 15) / 105,
      speed: 0.20 * config.speed / 12,
      occlusion: 0.55 * config.occlusion / 100 * (robust ? 0.60 : 1),
      smoke: config.smoke / 100 * (thermal ? 0.17 : 0.28) * (robust && thermal ? 0.88 : 1),
      fog: config.fog / 100 * (thermal ? 0.24 : 0.28),
      light: lowLight * (thermal ? 0.18 : robust ? 0.88 : 1)
    };
  }

  function simulate(input) {
    const config = normalize(input);
    const observationGeometry = geometry(config);
    const factors = stressFactors(config);
    const thermal = config.sensor === 'THERMAL';
    const robust = config.model === 'B';
    const environment = Object.values(factors).reduce((sum, value) => sum + value, 0);
    const persons = domains[config.domain].persons.map((target, index) => {
      const fixedOcclusion = 0.55 * target.scene_occlusion * (1 - config.occlusion / 100) * (robust ? 0.60 : 1);
      const posture = { standing: 0, sitting: 0.035, lying: 0.085 }[target.posture];
      const movement = target.mobility === 'moving' ? 0.012 * config.speed / 12 : 0;
      const contrast = (1 - target.contrast) * (thermal ? 0.025 : 0.10);
      const visibility = (1 - target.baseline_visibility) * 0.23;
      const seededVariation = (unitNoise(config.seed, target.id) - 0.5) * 0.025;
      const dayTradeoff = robust && !thermal && config.light === 'day' ? 0.025 : 0;
      const difficulty = clamp(environment + fixedOcclusion + posture + movement + contrast + visibility + seededVariation + dayTradeoff, 0, 1);
      const confidence = clamp(0.99 - 0.88 * difficulty, 0.01, 0.99);
      const acquisitionTime = 0.85 + index * 0.23 + difficulty * 7 + config.speed * 0.04
        + (robust ? 0.35 : 0) + unitNoise(config.seed, target.id + '-time') * 0.16;
      // Availability is applied exactly once: the acquisition-time gate.
      // Speed still independently models motion stability in difficulty/latency.
      const detected = confidence >= 0.52 && acquisitionTime <= observationGeometry.effectiveObservationTime;
      return { ...target, detected, confidence: round(confidence), difficulty: round(difficulty),
        acquisitionTime: round(acquisitionTime), time: detected ? round(acquisitionTime) : null,
        timeLimited: confidence >= 0.52 && acquisitionTime > observationGeometry.effectiveObservationTime };
    });
    const clutter = 0.20 * config.speed / 12 + 0.18 * config.occlusion / 100
      + 0.24 * config.smoke / 100 + 0.27 * config.fog / 100
      + ({ day: 0, dusk: 0.10, night: 0.24 }[config.light]) * (thermal ? 0.15 : 1)
      + 0.10 * (config.altitude - 15) / 105 + (thermal ? 0.14 : 0)
      + (config.domain === 'SAR' ? 0.055 : 0) - (robust ? 0.055 : 0);
    const falsePositives = [
      { id: 'FP01', x: 85, y: 24 }, { id: 'FP02', x: 16, y: 52 }, { id: 'FP03', x: 54, y: 85 }
    ].filter((target, index) => clutter >= 0.40 + index * 0.21 + unitNoise(config.seed, target.id) * 0.06)
      .map(target => ({ ...target, confidence: round(clamp(0.52 + clutter * 0.16 + unitNoise(config.seed, target.id) * 0.05, 0.52, 0.88)) }));
    const detections = persons.filter(target => target.detected);
    const tp = detections.length;
    const fp = falsePositives.length;
    const fn = persons.length - tp;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp / persons.length;
    const passed = tp > 0 && recall >= config.minRecall && fp <= config.maxFP;
    const status = passed ? 'PASS' : tp === 0 || fp > config.maxFP || recall < config.minRecall * 0.5 ? 'FAIL' : 'DEGRADED';
    const failedThresholds = [
      ...(tp === 0 ? [{ key: 'detections', actual: tp, required: 1, condition: 'at least' }] : []),
      ...(recall < config.minRecall ? [{ key: 'recall', actual: recall, required: config.minRecall, condition: 'at least' }] : []),
      ...(fp > config.maxFP ? [{ key: 'falsePositives', actual: fp, required: config.maxFP, condition: 'at most' }] : [])
    ];
    const firstFailedThreshold = failedThresholds[0] || null;
    const failureReasons = failedThresholds.map(item => `${item.key}: ${item.actual}; required ${item.condition} ${item.required}.`);
    const detectionTimes = detections.map(target => target.time).sort((a, b) => a - b);
    const ttfd = detectionTimes.length ? detectionTimes[0] : null;
    const requiredDetections = Math.max(1, Math.ceil(config.minRecall * persons.length));
    // Illustrative transit uses a distinct, fixed travel speed. Observation
    // fly-by speed never implies instantaneous arrival or an infinite journey.
    const transitTime = 120 / 12;
    const ttai = passed ? round(transitTime + detectionTimes[requiredDetections - 1] + models[config.model].processingTime) : null;
    const difficulty = round(persons.reduce((sum, target) => sum + target.difficulty, 0) / persons.length);
    const explanations = [
      `${tp} of ${persons.length} synthetic people detected; ${fn} missed and ${fp} false alarm${fp === 1 ? '' : 's'}.`
    ];
    const labels = { altitude: 'Higher altitude reduces target scale', speed: 'Fly-by speed reduces stability',
      occlusion: 'Partial occlusion hides target features', smoke: 'Smoke lowers visibility', fog: 'Fog lowers scene contrast',
      light: thermal ? 'Low light adds a small illustrative thermal penalty' : 'Low light weakens the RGB signal' };
    const dominant = Object.entries(factors).filter(([, value]) => value >= 0.05).sort((a, b) => b[1] - a[1]);
    if (dominant.length) explanations.push(`${labels[dominant[0][0]]}${dominant.length > 1 ? '; ' + labels[dominant[1][0]].toLowerCase() : ''}. These are the strongest configured penalties in this synthetic model.`);
    else explanations.push('Clear conditions establish a synthetic baseline. Posture, scene occlusion and contrast still differ by person.');
    const physical = observationGeometry;
    explanations.push(`Nadir geometry: ${physical.footprint.toFixed(1)} m ground footprint; ${physical.hover ? 'continuous geometric visibility in hover' : physical.visibilityTime.toFixed(2) + ' s geometric target visibility'}; ${physical.effectiveObservationTime.toFixed(2)} s effective observation after the ${physical.observationCap} s cap.`);
    const timeLimitedCount = persons.filter(target => target.timeLimited).length;
    if (timeLimitedCount) explanations.push(`${timeLimitedCount} target${timeLimitedCount === 1 ? '' : 's'} had sufficient synthetic confidence but needed more acquisition time than the effective observation allowed.`);
    explanations.push('Higher altitude increases footprint and geometric dwell time at the same speed, but reduces apparent target size. Speed separately affects motion stability. Longer visibility or hover does not guarantee detection.');
    if (passed) explanations.push(`The information threshold is met after ${requiredDetections} stable detection${requiredDetections === 1 ? '' : 's'}. TTAI includes 10 s transit, threshold acquisition and ${models[config.model].processingTime} s processing.`);
    else explanations.push(`Information threshold not achieved: recall must reach ${Math.round(config.minRecall * 100)}% and false alarms must stay at or below ${config.maxFP}. Validate the dominant stressors with real annotated data.`);
    return { synthetic: true, config: { ...config }, geometry: observationGeometry,
      penalties: { ...factors }, persons, falsePositives, tp, fp, fn,
      precision, recall, ttfd, transitTime, ttai, status, difficulty, timeLimitedCount,
      firstFailedThreshold, failureReasons, explanations };
  }

  function suite(input, preset = 'auto') {
    const config = normalize(input);
    if (preset === 'auto') {
      const levels = [
        [20, 0, 0, 0, 0, 'day'], [30, 2, 12, 5, 5, 'day'],
        [45, 4, 28, 15, 12, 'day'], [60, 6, 45, 30, 22, 'dusk'],
        [80, 9, 65, 50, 38, 'dusk'], [110, 12, 85, 75, 60, 'night']
      ];
      return levels.map(([altitude, speed, occlusion, smoke, fog, light]) => normalize({
        ...config, altitude, speed, occlusion,
        smoke: Math.min(100, smoke * (config.domain === 'TCCC' ? 1.15 : 1)),
        fog: Math.min(100, fog * (config.domain === 'SAR' ? 1.2 : 1)), light
      }));
    }
    // The old observation preset is retained as an alias. Its requested dwell
    // times now change speed through the same inverse control as the UI.
    if (preset === 'observation' || preset === 'visibility') {
      return [30, 20, 10, 5, 3, 2].map(seconds => withVisibility(config, seconds).config);
    }
    const presets = {
      altitude: ['altitude', [15, 30, 50, 70, 95, 120]],
      speed: ['speed', [0, 2, 5, 8, 10, 12]],
      occlusion: ['occlusion', [0, 15, 25, 50, 75, 100]],
      smoke: ['smoke', [0, 20, 40, 60, 80, 100]],
      fog: ['fog', [0, 20, 40, 60, 80, 100]],
      light: ['light', ['day', 'dusk', 'night']],
      sensor: ['sensor', ['RGB', 'THERMAL']]
    };
    if (!Object.hasOwn(presets, preset)) throw new RangeError(`Unknown stress preset: ${preset}`);
    const [key, levels] = presets[preset];
    return levels.map(value => normalize({ ...config, [key]: value }));
  }

  function firstBreakingPoint(results) {
    return results.findIndex(result => result.status !== 'PASS');
  }

  const limitations = Object.freeze([
    'Synthetic R&D demo. No real AI inference, flight measurements, field footage or validated benchmark results.',
    'Hand-authored scoring coefficients and seeded variation illustrate behavior; they are not calibrated sensor or model performance.',
    'One fixed scene per domain with only 3–5 people. Results have no statistical reliability or certification meaning.',
    'Ground truth and scoring are public client-side data. A blind benchmark is planned and is not active.',
    'Person detection only. Stillness does not establish absence of breathing. No diagnosis, triage, treatment or autonomous medical decisions.',
    'Transit is an illustrative 120 m at 12 m/s, independent of observation fly-by speed. These are not aircraft specifications.',
    'Observation geometry is based on a simplified nadir camera model and central straight-line flyover. It does not account for gimbal tracking, off-centre target trajectories or real camera calibration.',
    'Default 60° along-track FOV is a demonstrator assumption, not a verified DJI Matrice 4TD specification. Targets are stationary and ground speed is constant.',
    'Geometric dwell and the observation cap are separate. Hover is continuous only while the target remains in view; it never guarantees detection.',
    'Sensor behavior is illustrative. Thermal does not see through solid obstacles; smoke, fog and occlusion still reduce performance.'
  ]);

  function exportReport(history) {
    if (!Array.isArray(history)) throw new TypeError('Report history must be an array of simulation results.');
    const runs = copy(history);
    const counts = runs.reduce((out, run) => {
      out.tp += run.tp; out.fp += run.fp; out.fn += run.fn;
      out[run.status.toLowerCase()] += 1;
      return out;
    }, { totalRuns: runs.length, pass: 0, degraded: 0, fail: 0, tp: 0, fp: 0, fn: 0 });
    counts.totalPersonObservations = counts.tp + counts.fn;
    counts.precision = counts.tp + counts.fp ? counts.tp / (counts.tp + counts.fp) : 0;
    counts.recall = counts.tp + counts.fn ? counts.tp / (counts.tp + counts.fn) : 0;
    const group = key => Object.fromEntries([...new Set(runs.map(run => run.config[key]))].map(value => {
      const matches = runs.filter(run => run.config[key] === value);
      const tp = matches.reduce((sum, run) => sum + run.tp, 0);
      const fp = matches.reduce((sum, run) => sum + run.fp, 0);
      const fn = matches.reduce((sum, run) => sum + run.fn, 0);
      return [value, { runs: matches.length, tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0 }];
    }));
    const testedRange = Object.fromEntries(Object.keys(defaults).map(key => [key,
      [...new Set(runs.map(run => run.config[key]))].sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)))
    ]));
    const breakingIndex = firstBreakingPoint(runs);
    return {
      schemaVersion: '2.0.0', product: 'JUDAS FIELD', version: '0.3.0', synthetic: true,
      label: 'SIMULATED RESULTS — no real AI inference', counts, testedRange,
      firstBreakingPoint: breakingIndex < 0 ? null : { runIndex: breakingIndex, config: copy(runs[breakingIndex].config),
        geometry: copy(runs[breakingIndex].geometry), status: runs[breakingIndex].status,
        firstFailedThreshold: copy(runs[breakingIndex].firstFailedThreshold) },
      byModel: group('model'), bySensor: group('sensor'), byDomain: group('domain'),
      comparisonNote: 'Grouped totals are descriptive. Only identical domain, seed and stress settings constitute a matched model or sensor comparison.',
      definitions: {
        precision: 'TP / (TP + FP), defined as 0 when there are no detections.',
        recall: 'TP / (TP + FN). Each scene contains 3–5 synthetic people.',
        difficulty: 'Mean per-person synthetic penalty, on a 0–1 scale.',
        footprint: 'Along-track metres: 2 × altitude × tan(fov / 2), with fov converted from degrees.',
        visibilityTime: 'Geometric seconds: footprint / speed. null means continuous hover, never a zero duration.',
        observationCap: 'Separate maximum duration in seconds, default 30. This is not the geometric dwell time.',
        effectiveObservationTime: 'min(visibilityTime, observationCap), or observationCap for hover. Applied once as the acquisition-time gate.',
        observation: 'Compatibility config field, now derived effectiveObservationTime. Incoming independent observation values are ignored; use speed, altitude, fov and observationCap, or withVisibility().',
        visibilityPreset: 'The visibility and legacy observation presets request 30/20/10/5/3/2 s by changing speed. Requests faster than the 12 m/s limit use the shortest feasible dwell.',
        travelDistance: 'Ground speed × effective observation seconds, in metres. Zero in hover.',
        penalties: 'Separate illustrative target-scale, motion-stability, occlusion, smoke, fog and light terms. Dwell duration does not add a second confidence/difficulty penalty.',
        acquisitionTime: 'Illustrative per-target seconds needed to acquire detection; retained for both detected and missed targets. This is not measured latency.',
        firstFailedThreshold: 'First failed acceptance requirement in order: at least one detection, minimum recall, maximum false positives; null when all pass.',
        ttfd: 'Seconds from observation start to first stable detection; null when no person is detected.',
        transitTime: '120 m / 12 m/s = 10 s, an illustrative fixed segment.',
        ttai: 'Only for PASS: transit + time to max(1, ceil(minRecall × person count)) stable detections + model processing. Otherwise null.',
        processingSeconds: { A: models.A.processingTime, B: models.B.processingTime },
        status: 'PASS: at least one person, recall >= minRecall and FP <= maxFP. FAIL: zero people, FP above limit, or recall below half of minRecall. Otherwise DEGRADED.',
        firstBreakingPoint: 'First run in report order that is not PASS; this is a tested boundary only, not a continuous estimated threshold.',
        seed: 'An unsigned 32-bit integer selects small deterministic per-object variations.'
      }, limitations: [...limitations], runs
    };
  }

  const engine = Object.freeze({ domains, defaults, models, geometry, withVisibility, normalize, simulate, suite, firstBreakingPoint, exportReport, limitations });
  root.JudasEngine = engine;
  if (typeof module === 'object' && module.exports) module.exports = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);

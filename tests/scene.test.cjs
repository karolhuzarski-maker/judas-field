'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const engine = require('../engine.js');
const manifest = require('../scenarios.js');
const scene = require('../scene.js');
const world = svg => svg.match(/data-scene-world transform="([^"]+)"/)[1];
const annotations = svg => [...svg.matchAll(/data-annotation="([^"]+)" data-detected="([^"]+)" data-layer="([^"]+)" data-bbox="([^"]+)"/g)].map(match => ({ id: match[1], detected: match[2] === 'true', layer: match[3], bbox: match[4].split(',').map(Number) }));

test('each photo uses its own manifest coordinates, not legacy engine positions', () => {
  for (const domain of ['MCI', 'TCCC', 'SAR']) {
    const reference = manifest.scenarios[domain], config = { ...engine.defaults, domain, altitude: 120 }, result = engine.simulate(config);
    const svg = scene.render(config, result, { groundTruth: true });
    assert.ok(svg.includes(`viewBox="0 0 ${reference.width} ${reference.height}"`));
    assert.ok(svg.includes(`<image href="${reference.rgb}"`));
    assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
    assert.doesNotMatch(svg, /xMidYMid slice/);
    for (const target of reference.targets) {
      const layers = annotations(svg).filter(item => item.id === target.id);
      assert.equal(layers.length, 2);
      layers.forEach(item => assert.deepEqual(item.bbox, target.bbox));
      assert.ok(layers.some(item => item.layer === 'ground-truth'));
      assert.ok(layers.some(item => item.layer === 'prediction' || item.layer === 'missed'));
    }
    assert.match(svg, /data-photo-layer[\s\S]*data-ground-truth-layer[\s\S]*data-prediction-layer/);
  }
});

test('registered RGB and thermal share exact boxes and camera geometry', () => {
  for (const domain of ['MCI', 'TCCC', 'SAR']) {
    const config = { ...engine.defaults, domain, altitude: 55, speed: 4 };
    const result = engine.simulate(config);
    const rgb = scene.render(config, result, { groundTruth: true, progress: .37 });
    const thermal = scene.render({ ...config, sensor: 'THERMAL' }, result, { groundTruth: true, progress: .37 });
    assert.deepEqual(annotations(rgb), annotations(thermal));
    assert.equal(world(rgb), world(thermal));
    assert.ok(thermal.includes(`href="${manifest.scenarios[domain].thermal}"`));
    assert.match(thermal, /NOT RADIOMETRIC/);
  }
});

test('ground truth is an independent layer even for detected people', () => {
  const config = { ...engine.defaults }, result = engine.simulate(config);
  const withTruth = annotations(scene.render(config, result, { groundTruth: true }));
  const withoutTruth = annotations(scene.render(config, result, { groundTruth: false }));
  assert.equal(withTruth.filter(a => a.layer === 'ground-truth').length, 5);
  assert.equal(withoutTruth.filter(a => a.layer === 'ground-truth').length, 0);
  assert.deepEqual(withTruth.filter(a => a.layer !== 'ground-truth'), withoutTruth);
});

test('acquisition and pause reveal only reached detections; misses and false alarms wait until completion', () => {
  const config = { ...engine.defaults, domain: 'SAR', occlusion: 30, speed: 4 }, result = engine.simulate(config);
  result.falsePositives = [{ id: 'FP-LATE', bbox: [.1, .2, .04, .05], confidence: .65 }];
  for (const progress of [0, .15, .4, .8, 1]) {
    const options = { progress, playback: true, running: true };
    const moving = scene.render(config, result, options), paused = scene.render(config, result, { ...options, running: false, paused: true });
    const expected = result.persons.filter(p => p.detected && p.time <= progress * config.observation).map(p => p.id);
    for (const svg of [moving, paused]) {
      assert.deepEqual(annotations(svg).filter(a => a.detected).map(a => a.id), expected);
      assert.equal(svg.includes('FP-LATE'), progress === 1);
      assert.equal(annotations(svg).filter(a => a.layer === 'missed').length, progress === 1 ? result.fn : 0);
    }
    assert.equal(world(moving), world(paused));
    assert.match(paused, /OBSERVATION PAUSED/);
  }
});

test('zoom transforms photograph and annotation layers together; scan ends at its original camera position', () => {
  const near = scene.render({ ...engine.defaults, altitude: 15, speed: 9 });
  const far = scene.render({ ...engine.defaults, altitude: 120, speed: 9 });
  assert.match(world(near), /scale\(1.30\)/);
  assert.match(world(far), /scale\(1.00\)/);
  assert.equal(world(near), world(scene.render({ ...engine.defaults, altitude: 15, speed: 9 }, null, { progress: 1 })));
  assert.notEqual(world(near), world(scene.render({ ...engine.defaults, altitude: 15, speed: 9 }, null, { progress: .125 })));
  assert.match(near, /data-scene-world transform="[^"]+"><g data-photo-layer>/);
});

test('stress effects are localized or depth graded, and thermal is not darkened for nighttime RGB', () => {
  const config = { ...engine.defaults, smoke: 60, fog: 70, occlusion: 50, light: 'night', speed: 10 };
  const rgb = scene.render(config), thermal = scene.render({ ...config, sensor: 'THERMAL' });
  for (const effect of ['smoke', 'fog', 'occlusion']) {
    assert.ok(rgb.includes(`data-effect="${effect}"`));
    assert.ok(thermal.includes(`data-effect="${effect}"`));
  }
  assert.match(rgb, /data-effect="low-light"/);
  assert.doesNotMatch(thermal, /data-effect="low-light"/);
  assert.match(rgb, /fill="url\(#jf-fog-depth\)"/);
  assert.equal([...rgb.matchAll(/data-occlusion-target=/g)].length, 5);
  assert.equal([...thermal.matchAll(/data-occlusion-target=/g)].length, 5);
  assert.match(thermal, /jf-obstruction-thermal/);
  assert.match(rgb, /NOT OPTICALLY CALIBRATED/);
});

test('missing photographic annotation manifest displays an honest unavailable state', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scene.js'), 'utf8'), context);
  const result = context.JudasScene.render({ domain: 'MCI' });
  assert.match(result, /Observation asset unavailable/);
  assert.doesNotMatch(result, /<svg|<image|<canvas/);
});

test('occlusion texture samples a person-free photo region instead of procedural leaf drawings', () => {
  for (const domain of ['MCI', 'TCCC', 'SAR']) {
    const reference = manifest.scenarios[domain];
    // Sampled top-left extent is x .02–.16, y .03–.19 in both registered views.
    for (const target of reference.targets) {
      const [x, y, w, h] = target.bbox;
      assert.ok(x >= .16 || y >= .19 || x + w <= .02 || y + h <= .03, `${domain} texture must not repeat a human subject`);
    }
    for (const sensor of ['RGB', 'THERMAL']) {
      const svg = scene.render({ ...engine.defaults, domain, sensor, occlusion: 70 });
      const texture = svg.match(/<pattern id="jf-obstruction-[\s\S]*?<\/pattern>/)[0];
      assert.match(texture, /data-texture-source="registered-observation"/);
      assert.ok(texture.includes(`href="${sensor === 'RGB' ? reference.rgb : reference.thermal}"`));
      assert.match(texture, /viewBox="[^"]+"/);
      assert.doesNotMatch(texture, /<ellipse|<rect|<path/);
    }
  }
});

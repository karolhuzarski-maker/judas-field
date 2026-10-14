'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine.js');
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('60° nadir geometry matches required altitude and speed examples', () => {
  for (const [altitude, speed, expected] of [[30, 12, 2.89], [30, 5, 6.93], [30, 2, 17.32], [60, 12, 5.77]]) {
    const physical = engine.geometry({ altitude, speed, fov: 60 });
    near(physical.visibilityTime, expected, 0.005);
    near(physical.footprint, altitude * 2 / Math.sqrt(3));
    near(physical.effectiveObservationTime, physical.visibilityTime);
    near(physical.travelDistance, physical.footprint);
    assert.equal(physical.hover, false);
  }
});

test('inverse visibility changes canonical speed without rounding away physical precision', () => {
  const result = engine.withVisibility({ altitude: 30, speed: 12, model: 'B', occlusion: 35 }, 10);
  near(result.config.speed, 3.4641016151377544);
  near(engine.geometry(result.config).visibilityTime, 10);
  assert.equal(result.config.observation, 10);
  assert.equal(result.requestedVisibilityTime, 10);
  assert.equal(result.config.altitude, 30);
  assert.equal(result.config.model, 'B');
  assert.equal(result.config.occlusion, 35);
  assert.equal(result.clamped, false);
  assert.equal(result.reason, '');
});

test('changing altitude retains speed and recomputes footprint and dwell from canonical state', () => {
  const low = engine.withVisibility({ altitude: 30 }, 10).config;
  const high = engine.normalize({ ...low, altitude: 60 });
  assert.equal(high.speed, low.speed);
  near(engine.geometry(high).footprint, engine.geometry(low).footprint * 2);
  near(high.observation, 20);
  assert.equal(engine.normalize({ ...high, speed: 12 }).observation, engine.geometry({ altitude: 60, speed: 12 }).visibilityTime);
});

test('hover uses a serializable continuous sentinel and only the cap controls effective duration', () => {
  for (const observationCap of [1, 30, 120]) {
    const physical = engine.geometry({ altitude: 30, speed: 0, observationCap });
    assert.equal(physical.hover, true);
    assert.equal(physical.visibilityTime, null);
    assert.equal(physical.effectiveObservationTime, observationCap);
    assert.equal(physical.travelDistance, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(physical)), physical);
  }
  const tinySpeed = engine.geometry({ speed: Number.MIN_VALUE });
  assert.equal(tinySpeed.hover, false);
  assert.ok(Number.isFinite(tinySpeed.visibilityTime));
  assert.ok(Number.isFinite(tinySpeed.travelDistance));
});

test('a long requested dwell remains geometric duration rather than becoming the observation cap', () => {
  const config = engine.withVisibility({ altitude: 30, observationCap: 30 }, 60).config;
  const physical = engine.geometry(config);
  near(physical.visibilityTime, 60);
  assert.equal(physical.observationCap, 30);
  assert.equal(physical.effectiveObservationTime, 30);
  near(physical.travelDistance, physical.footprint / 2);
  assert.equal(config.observation, 30);
  assert.equal(engine.normalize({ ...config, observationCap: 120 }).observation, 60);
});

test('physical bounds, finite fallbacks and decimal speeds are consistent in normalize and geometry', () => {
  const low = engine.normalize({ altitude: -1, speed: -1, fov: -1, observationCap: -1 });
  assert.deepEqual([low.altitude, low.speed, low.fov, low.observationCap, low.observation], [15, 0, 1, 1, 1]);
  const high = engine.normalize({ altitude: 1000, speed: 100, fov: 360, observationCap: 1000 });
  assert.deepEqual([high.altitude, high.speed, high.fov, high.observationCap], [120, 12, 170, 120]);
  const invalid = engine.normalize({ altitude: NaN, speed: Infinity, fov: null, observationCap: 'no', observation: -99 });
  assert.equal(invalid.altitude, 30);
  assert.equal(invalid.speed, 0);
  assert.equal(invalid.fov, 60);
  assert.equal(invalid.observationCap, 30);
  assert.equal(invalid.observation, 30);
  assert.equal(engine.normalize({ speed: 0.001 }).speed, 0.001);
  assert.equal(engine.normalize({ speed: 3.464101615 }).speed, 3.464101615);
  assert.deepEqual(engine.geometry(high), engine.geometry({ altitude: 120, speed: 12, fov: 170, observationCap: 120 }));
});

test('infeasible requested visibility clamps to the shortest achievable dwell and explains the speed limit', () => {
  const result = engine.withVisibility({ altitude: 120, fov: 60 }, 2);
  assert.equal(result.config.speed, 12);
  assert.equal(result.requestedVisibilityTime, 2);
  assert.equal(result.clamped, true);
  near(engine.geometry(result.config).visibilityTime, 11.547005383792515);
  assert.match(result.reason, /shortest visibility.*12 m\/s.*11\.55 s/);
  const exactLimit = engine.withVisibility({ altitude: 120 }, engine.geometry({ altitude: 120, speed: 12 }).visibilityTime);
  near(exactLimit.config.speed, 12);
  assert.equal(exactLimit.clamped, false);
  for (const invalid of [0, -3, Infinity, NaN, null, '', true, 'bad']) {
    assert.throws(() => engine.withVisibility({}, invalid), RangeError);
  }
});

test('legacy independent observation values cannot override geometry; normalization is idempotent', () => {
  const base = { altitude: 30, speed: 12, observationCap: 30 };
  const first = engine.normalize({ ...base, observation: 30 });
  const second = engine.normalize({ ...base, observation: 0.1 });
  assert.deepEqual(first, second);
  near(first.observation, 2.8867513459481287);
  assert.deepEqual(engine.normalize(first), first);
  assert.deepEqual(engine.simulate({ ...base, observation: 30 }), engine.simulate({ ...base, observation: 0.1 }));
});

test('effective duration gates acquisition once without lowering confidence or changing scene difficulty', () => {
  const short = engine.simulate({ altitude: 30, speed: 2, observationCap: 1 });
  const long = engine.simulate({ altitude: 30, speed: 2, observationCap: 30 });
  assert.equal(short.tp, 0);
  assert.equal(long.tp, 5);
  assert.deepEqual(short.penalties, long.penalties);
  assert.equal(short.difficulty, long.difficulty);
  assert.equal(short.fp, long.fp);
  assert.deepEqual(short.persons.map(p => [p.confidence, p.difficulty, p.acquisitionTime]), long.persons.map(p => [p.confidence, p.difficulty, p.acquisitionTime]));
  assert.equal(short.timeLimitedCount, 5);
  assert.equal(long.timeLimitedCount, 0);
  assert.equal(Object.hasOwn(short.penalties, 'observation'), false);
  assert.equal(Object.hasOwn(short.penalties, 'exposure'), false);
  for (const person of long.persons.filter(p => p.detected)) assert.ok(person.time <= long.geometry.effectiveObservationTime + 0.00005);
});

test('configurable FOV changes dwell and results without inventing a camera-specific or duplicate duration penalty', () => {
  const narrow = engine.simulate({ altitude: 30, speed: 12, fov: 30 });
  const wide = engine.simulate({ altitude: 30, speed: 12, fov: 90 });
  near(wide.geometry.footprint, 60);
  assert.ok(wide.geometry.visibilityTime > narrow.geometry.visibilityTime);
  assert.ok(wide.tp > narrow.tp);
  assert.deepEqual(wide.penalties, narrow.penalties);
  assert.deepEqual(wide.persons.map(p => p.confidence), narrow.persons.map(p => p.confidence));
});

test('altitude has competing effects: longer dwell can recover detections while still reducing apparent-scale confidence', () => {
  const low = engine.simulate({ altitude: 30, speed: 12 });
  const middle = engine.simulate({ altitude: 60, speed: 12 });
  const high = engine.simulate({ altitude: 120, speed: 12 });
  assert.ok(middle.geometry.visibilityTime > low.geometry.visibilityTime);
  assert.ok(middle.recall > low.recall);
  assert.ok(middle.persons.every((person, i) => person.confidence < low.persons[i].confidence));
  assert.ok(high.geometry.visibilityTime > middle.geometry.visibilityTime);
  assert.ok(high.recall < middle.recall, 'longer dwell must not guarantee better detection');
  assert.ok(high.penalties.altitude > middle.penalties.altitude);
});

test('all automatic and legacy visibility suites return normalized physically possible configurations', () => {
  for (const domain of ['MCI', 'TCCC', 'SAR']) {
    for (const preset of ['auto', 'altitude', 'speed', 'occlusion', 'smoke', 'fog', 'light', 'sensor', 'observation', 'visibility']) {
      const configs = engine.suite({ domain, altitude: 120, observation: 1000, observationCap: 12, fov: 75 }, preset);
      for (const config of configs) {
        assert.deepEqual(config, engine.normalize(config), `${domain}/${preset} is normalized`);
        assert.equal(config.observation, engine.geometry(config).effectiveObservationTime);
        assert.equal(config.fov, 75);
        assert.equal(config.observationCap, 12);
        assert.ok(config.speed >= 0 && config.speed <= 12);
        const result = engine.simulate(config);
        assert.deepEqual(result.geometry, engine.geometry(config));
      }
    }
  }
  assert.deepEqual(engine.suite({}, 'observation'), engine.suite({}, 'visibility'));
  const visibility = engine.suite({}, 'visibility');
  near(visibility[0].speed, 2 / Math.sqrt(3));
  assert.equal(visibility.at(-1).speed, 12);
  assert.ok(engine.geometry(visibility.at(-1)).visibilityTime > 2);
});

test('matched A/B suites retain identical physical availability while each model retains its own response', () => {
  for (const preset of ['auto', 'altitude', 'speed', 'visibility', 'occlusion']) {
    const a = engine.suite({ domain: 'SAR', model: 'A', speed: 4.5, fov: 65, observationCap: 22, seed: 196 }, preset);
    const b = engine.suite({ domain: 'SAR', model: 'B', speed: 4.5, fov: 65, observationCap: 22, seed: 196 }, preset);
    for (let i = 0; i < a.length; i++) {
      assert.deepEqual(engine.geometry(a[i]), engine.geometry(b[i]));
      const { model: modelA, ...conditionsA } = a[i];
      const { model: modelB, ...conditionsB } = b[i];
      assert.deepEqual(conditionsA, conditionsB);
      assert.equal(modelA, 'A'); assert.equal(modelB, 'B');
    }
  }
});

test('reports retain each geometry snapshot, transparent definitions, and the first failed acceptance threshold', () => {
  const history = [engine.simulate({ speed: 0 }), engine.simulate({ altitude: 30, speed: 12 })];
  const report = engine.exportReport(history);
  assert.equal(report.schemaVersion, '2.0.0');
  assert.equal(report.version, '0.3.0');
  assert.equal(report.runs[0].geometry.visibilityTime, null);
  assert.equal(report.runs[0].firstFailedThreshold, null);
  assert.equal(report.firstBreakingPoint.runIndex, 1);
  assert.deepEqual(report.firstBreakingPoint.geometry, history[1].geometry);
  assert.equal(report.firstBreakingPoint.firstFailedThreshold.key, 'detections');
  assert.equal(report.runs[1].failureReasons.length, 2);
  for (const field of ['footprint', 'visibilityTime', 'observationCap', 'effectiveObservationTime', 'observation', 'travelDistance', 'penalties', 'firstFailedThreshold']) {
    assert.ok(report.definitions[field], field);
  }
  assert.match(report.definitions.observation, /Incoming independent observation values are ignored/);
  assert.ok(report.limitations.some(note => note.includes('not a verified DJI Matrice 4TD')));
  assert.ok(report.limitations.some(note => note.includes('off-centre target trajectories')));
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.equal(JSON.stringify(report), JSON.stringify(engine.exportReport(history)));
});

test('repeated inverse and altitude controls stay synchronized without mutating caller state', () => {
  const source = { ...engine.defaults, speed: 5, observation: 500 };
  const before = JSON.stringify(source);
  let config = engine.normalize(source);
  for (const altitude of [15, 30, 60, 120]) {
    config = engine.normalize({ ...config, altitude });
    for (const seconds of [2, 10, 30, 60, 120]) {
      const inverse = engine.withVisibility(config, seconds);
      config = inverse.config;
      const physical = engine.geometry(config);
      assert.equal(config.altitude, altitude);
      assert.equal(config.observation, physical.effectiveObservationTime);
      near(physical.visibilityTime, inverse.clamped ? physical.footprint / 12 : seconds);
      assert.deepEqual(engine.normalize(config), config);
    }
  }
  assert.equal(JSON.stringify(source), before);
});

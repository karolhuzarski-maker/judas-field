'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine.js');

test('all scene baselines pass; coordinates, counts and metrics match ground truth', () => {
  for (const [domain, count] of [['MCI', 5], ['TCCC', 4], ['SAR', 3]]) {
    const result = engine.simulate({ domain });
    assert.equal(result.persons.length, count);
    assert.equal(result.status, 'PASS');
    assert.equal(result.tp + result.fn, count);
    assert.equal(result.tp, result.persons.filter(person => person.detected).length);
    assert.equal(result.fp, result.falsePositives.length);
    assert.equal(result.precision, result.tp / (result.tp + result.fp));
    assert.equal(result.recall, result.tp / count);
    for (const person of result.persons) {
      assert.ok(person.x >= 0 && person.x <= 100 && person.y >= 0 && person.y <= 100);
      assert.ok(person.confidence >= 0 && person.confidence <= 1);
    }
  }
});

test('identical settings and seeds produce byte-identical results without mutating inputs', () => {
  const input = { ...engine.defaults, occlusion: 52, seed: 1976 };
  const before = JSON.stringify(input);
  const first = engine.simulate(input);
  const second = engine.simulate(input);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(JSON.stringify(first), JSON.stringify(engine.simulate({ ...input, seed: 1977 })));
  first.persons[0].x = 999;
  assert.notEqual(engine.simulate(input).persons[0].x, 999);
});

test('single stress sweeps at baseline hover raise difficulty without raising recall', () => {
  for (const domain of ['MCI', 'TCCC', 'SAR']) {
    for (const model of ['A', 'B']) {
      for (const preset of ['altitude', 'speed', 'occlusion', 'smoke', 'fog', 'light', 'observation', 'auto']) {
        const results = engine.suite({ domain, model }, preset).map(engine.simulate);
        for (let index = 1; index < results.length; index += 1) {
          assert.ok(results[index].difficulty >= results[index - 1].difficulty, `${domain}/${model}/${preset}: difficulty`);
          assert.ok(results[index].recall <= results[index - 1].recall, `${domain}/${model}/${preset}: recall`);
          assert.ok(results[index].fp >= results[index - 1].fp, `${domain}/${model}/${preset}: FP`);
        }
      }
    }
  }
});

test('auto suite has six levels, reaches a tested boundary, and preserves comparison conditions', () => {
  for (const domain of ['MCI', 'TCCC', 'SAR']) {
    const a = engine.suite({ domain, model: 'A', seed: 9 });
    const b = engine.suite({ domain, model: 'B', seed: 9 });
    assert.equal(a.length, 6);
    assert.deepEqual(a.map(({ model, ...config }) => config), b.map(({ model, ...config }) => config));
    const results = a.map(engine.simulate);
    const breaking = engine.firstBreakingPoint(results);
    assert.equal(results[0].status, 'PASS');
    assert.ok(breaking > 0 && breaking < 6);
    assert.ok(results.slice(0, breaking).every(result => result.status === 'PASS'));
    assert.notEqual(results[breaking].status, 'PASS');
  }
  assert.equal(engine.firstBreakingPoint([]), -1);
  assert.equal(engine.firstBreakingPoint([engine.simulate({})]), -1);
});

test('severe conditions produce misses, zero precision, null acquisition times and no NaN', () => {
  const result = engine.simulate({ altitude: 120, speed: 12, smoke: 100, fog: 100, occlusion: 100,
    observationCap: 2, light: 'night', minRecall: 0, maxFP: 10 });
  assert.equal(result.tp, 0);
  assert.equal(result.precision, 0);
  assert.equal(result.recall, 0);
  assert.equal(result.ttfd, null);
  assert.equal(result.ttai, null);
  assert.equal(result.status, 'FAIL');
  assert.ok(result.persons.every(person => person.time === null));
  assert.ok(!JSON.stringify(result).includes('NaN'));
  // No true or false detections is also defined, with no division by zero.
  const empty = engine.simulate({ observationCap: 1, altitude: 120 });
  assert.equal(empty.tp, 0);
  assert.equal(empty.fp, 0);
  assert.equal(empty.precision, 0);
});

test('operator thresholds change acceptance without changing detections', () => {
  const configs = engine.suite({ domain: 'MCI' }, 'occlusion');
  const partial = configs.map(engine.simulate).find(result => result.tp > 0 && result.fn > 0);
  assert.ok(partial, 'occlusion sweep includes a partial result');
  const strict = engine.simulate({ ...partial.config, minRecall: 1 });
  const lenient = engine.simulate({ ...partial.config, minRecall: partial.recall, maxFP: partial.fp });
  assert.deepEqual(strict.persons, lenient.persons);
  assert.notEqual(strict.status, 'PASS');
  assert.equal(strict.ttai, null);
  assert.equal(lenient.status, 'PASS');
  const cluttered = engine.suite({ sensor: 'THERMAL', domain: 'SAR', minRecall: 0.1 }, 'fog')
    .map(engine.simulate).find(result => result.tp > 0 && result.fp > 0);
  assert.ok(cluttered);
  assert.equal(engine.simulate({ ...cluttered.config, maxFP: 0 }).status, 'FAIL');
});

test('TTAI waits for the required number of people, includes processing, and separates transit speed', () => {
  const result = engine.simulate({ minRecall: 0.8 });
  const times = result.persons.filter(person => person.detected).map(person => person.time).sort((a, b) => a - b);
  assert.equal(result.ttfd, times[0]);
  assert.equal(result.transitTime, 10);
  assert.equal(result.ttai, Math.round((10 + times[3] + 0.45) * 10000) / 10000);
  assert.ok(result.ttai > 10 + result.ttfd + 0.45);
  assert.equal(engine.simulate({ speed: 12 }).transitTime, 10);
});

test('Model B has an occlusion advantage with a clear-day speed/performance tradeoff', () => {
  const baselineA = engine.simulate({ model: 'A' });
  const baselineB = engine.simulate({ model: 'B' });
  assert.ok(baselineB.ttai > baselineA.ttai);
  assert.ok(baselineB.persons[0].confidence < baselineA.persons[0].confidence);
  const a = engine.simulate({ model: 'A', occlusion: 75 });
  const b = engine.simulate({ model: 'B', occlusion: 75 });
  assert.ok(b.recall > a.recall);
  assert.ok(b.difficulty < a.difficulty);
});

test('thermal helps poor light while physical occlusion continues to penalize it', () => {
  const rgb = engine.simulate({ domain: 'SAR', light: 'night' });
  const thermal = engine.simulate({ domain: 'SAR', light: 'night', sensor: 'THERMAL' });
  const covered = engine.simulate({ domain: 'SAR', light: 'night', sensor: 'THERMAL', occlusion: 100 });
  assert.ok(thermal.recall > rgb.recall);
  assert.ok(thermal.difficulty < rgb.difficulty);
  assert.ok(covered.recall < thermal.recall);
});

test('export is complete, reproducible JSON with synthetic tag and count summaries', () => {
  const history = engine.suite({ seed: 196 }).map(engine.simulate);
  const report = engine.exportReport(history);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.equal(report.synthetic, true);
  assert.equal(report.schemaVersion, '2.0.0');
  assert.equal(report.version, '0.3.0');
  assert.equal(report.runs.length, 6);
  assert.deepEqual(report.runs, history);
  assert.equal(report.counts.totalPersonObservations, 30);
  assert.equal(report.counts.tp + report.counts.fn, 30);
  assert.equal(report.counts.pass + report.counts.degraded + report.counts.fail, 6);
  assert.equal(report.firstBreakingPoint.runIndex, engine.firstBreakingPoint(history));
  assert.ok(report.limitations.some(text => text.includes('blind benchmark')));
  assert.ok(report.limitations.some(text => text.includes('No diagnosis')));
  assert.equal(JSON.stringify(report), JSON.stringify(engine.exportReport(history)));
  report.runs[0].persons[0].x = 111;
  assert.notEqual(history[0].persons[0].x, 111);
  const empty = engine.exportReport([]);
  assert.equal(empty.firstBreakingPoint, null);
  assert.equal(empty.counts.recall, 0);
  assert.equal(empty.counts.precision, 0);
});

test('invalid input is bounded and preset overrides remain independent', () => {
  const result = engine.simulate({ domain: '__proto__', model: 'bad', speed: Infinity, altitude: -300,
    observation: 'bad', seed: -3, minRecall: 10, maxFP: -10, sensor: 'thermal' });
  assert.equal(result.config.domain, 'MCI');
  assert.equal(result.config.model, 'A');
  assert.equal(result.config.speed, 0);
  assert.equal(result.config.altitude, 15);
  assert.equal(result.config.observation, 30);
  assert.equal(result.config.minRecall, 1);
  assert.equal(result.config.maxFP, 0);
  assert.equal(result.config.sensor, 'THERMAL');
  const configs = engine.suite({}, 'sensor');
  assert.deepEqual(configs.map(config => config.sensor), ['RGB', 'THERMAL']);
  configs[0].altitude = 90;
  assert.equal(configs[1].altitude, engine.defaults.altitude);
  assert.throws(() => engine.suite({}, 'unknown'), RangeError);
});

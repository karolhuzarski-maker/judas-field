'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../evaluation.js');
const scenario = { id: 'mci-v02', domain: 'MCI', width: 1600, height: 900, rgb: 'mci-rgb.webp', thermal: 'mci-thermal.webp', provenance: 'Synthetic test fixture.', targets: [{ id: 'P01', bbox: [0.1, 0.1, 0.2, 0.2] }, { id: 'P02', bbox: [0.6, 0.6, 0.1, 0.2] }] };
const prediction = (id, bbox, confidence = 0.9) => ({ id, bbox, confidence, class: 'person' });
const data = (predictions = [], overrides = {}) => ({ schema_version: E.schemaVersion, scenario_id: scenario.id, coordinate_system: E.coordinateSystem, sensor: 'RGB', model_name: 'Detector A', predictions, ...overrides });
const header = 'schema_version,scenario_id,coordinate_system,sensor,model_name,id,x,y,width,height,confidence,class';
const csv = row => `${header}\r\n${row}\r\n`;

test('exact matches, background detections, duplicate detections, and misses yield independent audit records', () => {
  const result = E.evaluate(data([prediction('a', scenario.targets[0].bbox), prediction('duplicate', scenario.targets[0].bbox, .8), prediction('background', [.8, .1, .1, .1], .7)]), scenario);
  assert.deepEqual([result.tp, result.fp, result.fn], [1, 2, 1]);
  assert.equal(result.precision, 1 / 3); assert.equal(result.recall, .5);
  assert.deepEqual(result.targets.map(t => [t.id, t.outcome, t.prediction_id]), [['P01', 'TP', 'a'], ['P02', 'FN', null]]);
  assert.deepEqual(result.predictions.map(p => p.outcome), ['TP', 'FP', 'FP']);
});

test('confidence ordering takes priority over input order and the same target cannot match twice', () => {
  const result = E.evaluate(data([prediction('low-first', scenario.targets[0].bbox, .5), prediction('high-later', [.11, .1, .2, .2], .9)]), scenario);
  assert.equal(result.targets[0].prediction_id, 'high-later');
  assert.equal(result.predictions[1].outcome, 'FP');
});

test('confidence and IoU boundary equality are included; below-threshold boxes are audited but not FP', () => {
  const result = E.evaluate(data([prediction('half-box', [.1, .1, .1, .2], .25), prediction('ignored', scenario.targets[1].bbox, .249)]), scenario, { confidenceThreshold: .25, iouThreshold: .5 });
  assert.deepEqual([result.tp, result.fp, result.fn, result.ignored_count], [1, 0, 1, 1]);
  assert.equal(result.predictions[0].iou, .5);
  assert.equal(result.ignored_predictions[0].outcome, 'BELOW_THRESHOLD');
  const stricter = E.evaluate(data([prediction('half-box', [.1, .1, .1, .2])]), scenario, { iouThreshold: .51 });
  assert.deepEqual([stricter.tp, stricter.fp], [0, 1]);
});

test('equal-confidence input order and equal-IoU reference order are deterministic', () => {
  const overlapping = { ...scenario, targets: [{ id: 'first', bbox: [.1, .1, .2, .2] }, { id: 'second', bbox: [.1, .1, .2, .2] }] };
  const result = E.evaluate(data([prediction('first-input', [.1, .1, .2, .2]), prediction('second-input', [.1, .1, .2, .2])]), overlapping);
  assert.deepEqual(result.predictions.map(p => [p.id, p.target_id]), [['first-input', 'first'], ['second-input', 'second']]);
});

test('matcher takes highest IoU among available references, rather than first qualifying reference', () => {
  const overlapping = { ...scenario, targets: [{ id: 'weaker', bbox: [.12, .1, .2, .2] }, { id: 'exact', bbox: [.1, .1, .2, .2] }] };
  assert.equal(E.evaluate(data([prediction('p', [.1, .1, .2, .2])]), overlapping).predictions[0].target_id, 'exact');
});

test('empty JSON outputs and all-excluded predictions are valid, with defined zero precision', () => {
  const result = E.evaluate(E.parse(JSON.stringify(data()), 'json'), scenario);
  assert.deepEqual([result.tp, result.fp, result.fn, result.precision, result.recall], [0, 0, 2, 0, 0]);
  assert.deepEqual(E.evaluate(data([prediction('p', [.1, .1, .2, .2], .1)]), scenario).evaluated_count, 0);
});

test('CSV supports UTF-8 BOM, CRLF, quoted names, escaped quotes, and decimal exponent notation', () => {
  const parsed = E.parse('\uFEFF' + csv('judas-predictions-v1,mci-v02,normalized_xywh,RGB,"Model, ""A""",p1,1e-1,0.1,0.2,0.2,0.9,person'), 'csv');
  assert.equal(parsed.model_name, 'Model, "A"');
  assert.deepEqual(parsed.predictions[0].bbox, [.1, .1, .2, .2]);
  assert.equal(E.evaluate(parsed, scenario).tp, 1);
});

test('CSV supports a metadata-only empty output without accepting missing prediction fields', () => {
  assert.equal(E.parse(csv('judas-predictions-v1,mci-v02,normalized_xywh,RGB,Model A,,,,,,,'), 'csv').predictions.length, 0);
  assert.throws(() => E.parse(csv('judas-predictions-v1,mci-v02,normalized_xywh,RGB,Model A,p1,,.1,.2,.2,.9,person'), 'csv'), /missing prediction fields/);
});

test('malformed CSV structures and incompatible row metadata are rejected', () => {
  const prefix = 'judas-predictions-v1,mci-v02,normalized_xywh,RGB,Model A';
  assert.throws(() => E.parse('scenario_id,confidence\nmci-v02,.9', 'csv'), /exactly these columns/);
  assert.throws(() => E.parse(csv(`${prefix},p1,.1,.1,.2,.2,.9`), 'csv'), /fields/);
  assert.throws(() => E.parse(csv(`${prefix},"unterminated,.1,.1,.2,.2,.9,person`), 'csv'), /unterminated/);
  assert.throws(() => E.parse(csv(`${prefix},"p1"oops,.1,.1,.2,.2,.9,person`), 'csv'), /unexpected text/);
  assert.throws(() => E.parse(csv(`${prefix},p1,.1,.1,.2,.2,0x1,person`), 'csv'), /decimal/);
  assert.throws(() => E.parse(csv(`${prefix},p1,.1,.1,.2,.2,.9,person\n${prefix.replace('RGB', 'THERMAL')},p2,.1,.1,.2,.2,.8,person`), 'csv'), /changes scenario/);
});

test('invalid JSON, unsupported schemas, extra fields, invalid classes, and duplicate ids are rejected', () => {
  assert.throws(() => E.parse('{bad}', 'json'), /Invalid JSON/);
  for (const overrides of [{ schema_version: 'coco' }, { coordinate_system: 'xyxy' }, { sensor: 'ir' }, { extra: true }, { predictions: null }]) assert.throws(() => E.validate(data([], overrides)));
  assert.throws(() => E.validate(data([prediction('same', [.1, .1, .1, .1]), prediction('same', [.3, .3, .1, .1])])), /duplicate id/);
  assert.throws(() => E.validate(data([{ ...prediction('p', [.1, .1, .1, .1]), class: 'car' }])), /class must be/);
  assert.throws(() => E.validate(data([{ ...prediction('p', [.1, .1, .1, .1]), confidence: '.9' }])), /finite number/);
});

test('normalization rejects pixels, off-image boxes, zero areas, infinity, and NaN', () => {
  for (const bbox of [[1, 2, 30, 40], [-.1, .1, .2, .2], [.9, .1, .2, .2], [.1, .1, 0, .2], [.1, .1, .2, NaN], [.1, Infinity, .2, .2], [.1, .2, .3]]) assert.throws(() => E.validate(data([prediction('p', bbox)])));
  assert.throws(() => E.evaluate(data(), scenario, { confidenceThreshold: NaN }), /finite/);
  assert.throws(() => E.evaluate(data(), scenario, { iouThreshold: 0 }), /0.01/);
});

test('file size and prediction count are capped before expensive scoring', () => {
  assert.throws(() => E.parse(' '.repeat(E.MAX_BYTES + 1), 'json'), /too large/);
  const predictions = Array.from({ length: E.MAX_PREDICTIONS + 1 }, (_, i) => prediction(String(i), [.1, .1, .1, .1]));
  assert.throws(() => E.validate(data(predictions)), /at most 2000/);
});

test('wrong scenario and cross-sensor comparison fail clearly; identical conditions compare correctly', () => {
  assert.throws(() => E.evaluate(data([], { scenario_id: 'sar-v02' }), scenario), /matching scenario/);
  assert.throws(() => E.compare(data(), data([], { sensor: 'THERMAL' }), scenario), /same sensor/);
  const report = E.compare(data(), E.example(scenario), scenario, { confidenceThreshold: .8, iouThreshold: .75 });
  assert.equal(report.results[0].confidence_threshold, report.results[1].confidence_threshold);
  assert.deepEqual(report.delta_b_minus_a, { tp: 2, fp: 0, fn: -2, precision: 1, recall: 1 });
});

test('example is tied to manifest geometry and marked as reference-copy format demonstration', () => {
  const example = E.example(scenario, 'THERMAL');
  assert.equal(example.sensor, 'THERMAL');
  assert.match(example.model_name, /not model inference/);
  assert.deepEqual(example.predictions.map(p => p.bbox), scenario.targets.map(t => t.bbox));
  assert.equal(E.evaluate(example, scenario).recall, 1);
});

test('scoring is deterministic, does not mutate inputs, and publishes complete provenance and thresholds', () => {
  const input = E.example(scenario), before = JSON.stringify({ input, scenario });
  const first = E.evaluate(input, scenario), second = E.evaluate(input, scenario);
  assert.deepEqual(first, second); assert.equal(JSON.stringify({ input, scenario }), before);
  assert.equal(first.provenance, scenario.provenance);
  assert.equal(first.image.asset, scenario.rgb);
  assert.equal(first.source_type, 'IMPORTED MODEL PREDICTIONS');
  assert.equal(first.iou_threshold, .5); assert.equal(first.confidence_threshold, .25);
});

test('CSV report includes misses, ignored detections, matching thresholds, and formula-safe imported text', () => {
  const report = E.evaluate(data([prediction('=HYPERLINK("bad")', [.1, .1, .2, .2], .9), prediction('ignored', [.6, .6, .1, .2], .1)], { model_name: '=SUM(1,1)' }), scenario);
  const output = E.toCSV(report);
  assert.match(output, /confidence_threshold/); assert.match(output, /iou_threshold/);
  assert.match(output, /BELOW_THRESHOLD/); assert.match(output, /FN/);
  assert.match(output, /'\=SUM/); assert.match(output, /'\=HYPERLINK/);
  assert.equal(output.split('\r\n').length, 6);
});

test('untrusted display text stays data and control characters are rejected', () => {
  const markup = '<img src=x onerror=alert(1)>';
  const parsed = E.parse(JSON.stringify(data([], { model_name: markup })), 'json');
  assert.equal(parsed.model_name, markup);
  assert.throws(() => E.validate(data([], { model_name: 'bad\nname' })), /control characters/);
});

test('each published scene and both registered sensor variants round-trip through the exact import contract', () => {
  const { scenarios } = require('../scenarios.js');
  for (const manifest of Object.values(scenarios)) {
    assert.ok(manifest.width > 0 && manifest.height > 0);
    for (const sensor of ['RGB', 'THERMAL']) {
      const imported = E.parse(JSON.stringify(E.example(manifest, sensor)), 'json');
      const result = E.evaluate(imported, manifest);
      assert.equal(result.tp, manifest.targets.length); assert.equal(result.fp, 0); assert.equal(result.fn, 0);
      assert.equal(result.image.asset, sensor === 'RGB' ? manifest.rgb : manifest.thermal);
      assert.equal(result.annotation_policy, manifest.annotationPolicy);
    }
  }
});

// Minimal DOM event harness: exercise asynchronous file state and export ownership,
// without duplicating the evaluator or depending on a browser automation library.
function evaluationUI() {
  const fs = require('node:fs'), vm = require('node:vm');
  const nodes = new Map(), downloads = [];
  function element(id) {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', hidden: true, disabled: false, checked: true, innerHTML: '', textContent: '', options: [{}, {}], listeners: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, addEventListener(type, handler) { this.listeners[type] = handler; }, insertAdjacentHTML(_, html) { this.innerHTML += html; }, click() {}, remove() {} });
    return nodes.get(id);
  }
  const clearButtons = [0, 1].map(index => { const button = element(`clear-${index}`); button.dataset.evaluationClear = String(index); return button; });
  const container = element('evaluation-root');
  container.querySelector = selector => element(selector.slice(1));
  container.querySelectorAll = () => clearButtons;
  for (const [id, value] of Object.entries({ 'evaluation-scenario': 'MCI', 'evaluation-sensor': 'RGB', 'evaluation-confidence': '0.25', 'evaluation-iou': '0.5' })) element(id).value = value;
  const document = { getElementById: element, body: { appendChild() {}, classList: { add() {}, remove() {} } }, createElement: () => element('download-link') };
  const context = { JudasEvaluation: E, JudasScenarios: { scenarios: { MCI: scenario } }, document, window: { addEventListener() {}, print() {} }, Blob, URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:local-test'; }, revokeObjectURL() {} }, setTimeout() {}, Date };
  vm.runInNewContext(fs.readFileSync(require.resolve('../evaluation-ui.js'), 'utf8'), context);
  return {
    element, downloads,
    load(index, file) { return element(`evaluation-file-${index}`).listeners.change({ target: { files: [file] } }); },
    submit() { element('evaluation-form').listeners.submit({ preventDefault() {} }); },
    clear(index) { clearButtons[index].listeners.click(); },
    exportJSON() { element('evaluation-json').listeners.click(); return downloads.at(-1).text().then(JSON.parse); }
  };
}

test('evaluation waits for pending file reads so reports never name an unscored set', async () => {
  const ui = evaluationUI(), sourceA = E.example(scenario), sourceB = { ...E.example(scenario), model_name: 'Detector B' };
  await ui.load(0, { name: 'A.json', size: 100, text: async () => JSON.stringify(sourceA) });
  ui.submit(); assert.equal(ui.element('evaluation-result').hidden, false);
  let resolveB;
  const readingB = ui.load(1, { name: 'B.json', size: 100, text: () => new Promise(resolve => { resolveB = resolve; }) });
  assert.equal(ui.element('evaluation-run').disabled, true);
  ui.submit();
  assert.equal(ui.element('evaluation-result').hidden, true);
  assert.match(ui.element('evaluation-feedback').textContent, /finish loading/);
  resolveB(JSON.stringify(sourceB)); await readingB;
  assert.equal(ui.element('evaluation-run').disabled, false);
  assert.equal(ui.element('evaluation-result').hidden, true);
  ui.submit();
  const report = await ui.exportJSON();
  assert.deepEqual(report.source_files, ['A.json', 'B.json']);
  assert.equal(report.results.length, 2);
  assert.equal(report.results[1].model_name, 'Detector B');
});

test('clearing a pending file prevents its stale completion from changing a later report', async () => {
  const ui = evaluationUI(), source = E.example(scenario);
  await ui.load(0, { name: 'A.json', size: 100, text: async () => JSON.stringify(source) });
  let resolveB;
  const readingB = ui.load(1, { name: 'discarded-B.json', size: 100, text: () => new Promise(resolve => { resolveB = resolve; }) });
  ui.clear(1); assert.equal(ui.element('evaluation-run').disabled, false);
  ui.submit();
  resolveB(JSON.stringify(source)); await readingB;
  assert.equal(ui.element('evaluation-result').hidden, false);
  const report = await ui.exportJSON();
  assert.deepEqual(report.source_files, ['A.json']);
  assert.equal(report.results, undefined);
  assert.equal(report.tp, 2);
});

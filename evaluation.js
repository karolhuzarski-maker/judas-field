/* Local prediction evaluation. No inference, network requests, or dependencies. */
(function (root) {
  'use strict';
  const schemaVersion = 'judas-predictions-v1';
  const coordinateSystem = 'normalized_xywh';
  const MAX_BYTES = 2 * 1024 * 1024, MAX_PREDICTIONS = 2000;
  const columns = ['schema_version', 'scenario_id', 'coordinate_system', 'sensor', 'model_name', 'id', 'x', 'y', 'width', 'height', 'confidence', 'class'];
  const fail = message => { throw new Error(message); };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function text(value, name, max = 160) {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(`${name} must be nonempty text, at most ${max} characters, without control characters.`);
    return value.trim();
  }
  function number(value, name, min = 0, max = 1) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${name} must be a finite number between ${min} and ${max}.`);
    return value;
  }
  function box(value, name) {
    if (!Array.isArray(value) || value.length !== 4) fail(`${name} must be [x, y, width, height] in normalized image coordinates.`);
    value.forEach((v, i) => number(v, `${name}[${i}]`));
    if (value[2] <= 0 || value[3] <= 0) fail(`${name} width and height must be greater than zero.`);
    if (value[0] + value[2] > 1 + 1e-9 || value[1] + value[3] > 1 + 1e-9) fail(`${name} extends outside the image. Use normalized coordinates, not pixels.`);
    return value.slice();
  }
  function allowedKeys(value, allowed, name) {
    if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${name} contains unsupported fields. See the prediction schema.`);
  }
  function validate(dataset, options = {}) {
    if (!object(dataset)) fail('The JSON root must be an object containing scenario metadata and predictions.');
    allowedKeys(dataset, ['schema_version', 'scenario_id', 'coordinate_system', 'sensor', 'model_name', 'predictions'], 'The input');
    if (dataset.schema_version !== schemaVersion) fail(`schema_version must be "${schemaVersion}".`);
    if (dataset.coordinate_system !== coordinateSystem) fail('coordinate_system must be "normalized_xywh": top-left x/y and width/height, each on a 0–1 image scale.');
    const scenario_id = text(dataset.scenario_id, 'scenario_id', 100);
    if (!['RGB', 'THERMAL'].includes(dataset.sensor)) fail('sensor must be RGB or THERMAL.');
    const model_name = text(dataset.model_name, 'model_name');
    if (!Array.isArray(dataset.predictions)) fail('predictions must be an array. An empty array is a valid model output.');
    const cap = Math.min(options.maxPredictions ?? MAX_PREDICTIONS, MAX_PREDICTIONS);
    if (dataset.predictions.length > cap) fail(`This browser demo accepts at most ${cap} predictions per file.`);
    const ids = new Set();
    const predictions = dataset.predictions.map((prediction, index) => {
      const label = `Prediction ${index + 1}`;
      if (!object(prediction)) fail(`${label} must be an object.`);
      allowedKeys(prediction, ['id', 'bbox', 'confidence', 'class'], label);
      const id = text(prediction.id, `${label} id`, 100);
      if (ids.has(id)) fail(`${label} has a duplicate id. Every prediction needs a unique id.`);
      ids.add(id);
      if (prediction.class !== 'person') fail(`${label} class must be "person". This evaluator scores person detection only.`);
      return { id, bbox: box(prediction.bbox, `${label} bbox`), confidence: number(prediction.confidence, `${label} confidence`), class: 'person' };
    });
    return { schema_version: schemaVersion, scenario_id, coordinate_system: coordinateSystem, sensor: dataset.sensor, model_name, predictions };
  }
  function csvRows(source) {
    const rows = []; let row = [], field = '', quoted = false, closed = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') { quoted = false; closed = true; }
        else field += char;
      } else if (char === '"') {
        if (field || closed) fail('Malformed CSV: a quote must begin a field.');
        quoted = true;
      } else if (char === ',' || char === '\n' || char === '\r') {
        row.push(field); field = ''; closed = false;
        if (char !== ',') { rows.push(row); row = []; if (char === '\r' && source[i + 1] === '\n') i++; }
      } else {
        if (closed) fail('Malformed CSV: unexpected text after a quoted field.');
        field += char;
      }
    }
    if (quoted) fail('Malformed CSV: an unterminated quoted field.');
    if (field || row.length || closed) { row.push(field); rows.push(row); }
    return rows.filter(values => !(values.length === 1 && values[0].trim() === ''));
  }
  function parseCSV(source) {
    const rows = csvRows(source);
    if (!rows.length) fail('The CSV file is empty.');
    const headers = rows.shift().map(value => value.trim());
    if (headers.length !== columns.length || new Set(headers).size !== columns.length || columns.some(column => !headers.includes(column))) fail(`CSV requires exactly these columns: ${columns.join(', ')}.`);
    if (!rows.length) fail('CSV needs at least one metadata row. For zero predictions, leave all prediction fields empty in that row.');
    if (rows.length > MAX_PREDICTIONS) fail(`This browser demo accepts at most ${MAX_PREDICTIONS} prediction rows.`);
    let dataset; const predictions = [];
    rows.forEach((values, index) => {
      if (values.length !== headers.length) fail(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
      const entry = Object.fromEntries(headers.map((header, col) => [header, values[col].trim()]));
      const metadata = Object.fromEntries(columns.slice(0, 5).map(key => [key, entry[key]]));
      if (!dataset) dataset = metadata;
      else if (columns.slice(0, 5).some(key => entry[key] !== dataset[key])) fail(`CSV row ${index + 2} changes scenario, sensor, or model metadata. Each file must describe one model on one image.`);
      const predictionFields = columns.slice(5);
      if (predictionFields.every(key => entry[key] === '')) {
        if (rows.length !== 1) fail('An empty-output metadata row must be the only CSV data row.');
        return;
      }
      if (predictionFields.some(key => entry[key] === '')) fail(`CSV row ${index + 2} has missing prediction fields.`);
      const numeric = key => {
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(entry[key])) fail(`CSV row ${index + 2}: ${key} must be a decimal number.`);
        return Number(entry[key]);
      };
      predictions.push({ id: entry.id, bbox: ['x', 'y', 'width', 'height'].map(numeric), confidence: numeric('confidence'), class: entry.class });
    });
    return { ...dataset, predictions };
  }
  function parse(source, format = 'json', options = {}) {
    if (typeof source !== 'string') fail('File contents must be text.');
    const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(source).length : source.length * 2;
    if (bytes > Math.min(options.maxBytes ?? MAX_BYTES, MAX_BYTES)) fail('The file is too large. Maximum upload size is 2 MiB.');
    source = source.replace(/^\uFEFF/, '');
    let dataset;
    if (format.toLowerCase() === 'json') {
      try { dataset = JSON.parse(source); } catch (_) { fail('Invalid JSON. Use the downloadable example and check commas, quotes, and brackets.'); }
    } else if (format.toLowerCase() === 'csv') dataset = parseCSV(source);
    else fail('Unsupported file type. Choose a .json or .csv prediction file.');
    return validate(dataset, options);
  }
  function iou(a, b) {
    const width = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    const height = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    const intersection = width * height;
    return intersection / (a[2] * a[3] + b[2] * b[3] - intersection);
  }
  function reference(scenario) {
    if (!object(scenario) || !Array.isArray(scenario.targets)) fail('The selected scenario has no compatible reference annotations.');
    text(scenario.id, 'Reference scenario id', 100);
    const ids = new Set();
    return scenario.targets.map((target, index) => {
      const id = text(target.id, `Reference target ${index + 1} id`, 100);
      if (ids.has(id)) fail('Reference annotations contain duplicate target ids.');
      ids.add(id);
      return { id, bbox: box(target.bbox, `Reference target ${id} bbox`) };
    });
  }
  function evaluate(input, scenario, options = {}) {
    const dataset = validate(input), targets = reference(scenario);
    if (dataset.scenario_id !== scenario.id) fail(`This file targets ${dataset.scenario_id}. Select its matching scenario; the current image is ${scenario.id}.`);
    const confidenceThreshold = number(options.confidenceThreshold ?? 0.25, 'Confidence threshold');
    const iouThreshold = number(options.iouThreshold ?? 0.5, 'IoU threshold', 0.01, 1);
    const remaining = new Set(targets.map((_, index) => index));
    const matched = new Map();
    const accepted = dataset.predictions.map((prediction, index) => ({ ...prediction, inputIndex: index })).filter(prediction => prediction.confidence >= confidenceThreshold).sort((a, b) => b.confidence - a.confidence || a.inputIndex - b.inputIndex);
    const scored = accepted.map(prediction => {
      let bestIndex = -1, bestIoU = -1;
      for (const index of remaining) {
        const overlap = iou(prediction.bbox, targets[index].bbox);
        if (overlap >= iouThreshold && overlap > bestIoU) { bestIndex = index; bestIoU = overlap; }
      }
      if (bestIndex < 0) return { ...prediction, outcome: 'FP', target_id: null, iou: null };
      remaining.delete(bestIndex);
      const result = { ...prediction, outcome: 'TP', target_id: targets[bestIndex].id, iou: bestIoU };
      matched.set(bestIndex, result);
      return result;
    });
    const tp = matched.size, fp = accepted.length - tp, fn = targets.length - tp;
    return {
      schema_version: 'judas-evaluation-v1', source_type: 'IMPORTED MODEL PREDICTIONS', scenario_id: scenario.id, domain: scenario.domain,
      sensor: dataset.sensor, model_name: dataset.model_name, coordinate_system: coordinateSystem,
      confidence_threshold: confidenceThreshold, iou_threshold: iouThreshold,
      matching_rule: 'Confidence descending; confidence ties keep input order. Each prediction takes the highest-IoU unmatched reference at or above the IoU threshold; IoU ties keep manifest order. Each reference can match once.',
      tp, fp, fn, precision: accepted.length ? tp / accepted.length : 0, recall: targets.length ? tp / targets.length : 0,
      reference_count: targets.length, prediction_count: dataset.predictions.length, evaluated_count: accepted.length,
      ignored_count: dataset.predictions.length - accepted.length,
      predictions: scored, ignored_predictions: dataset.predictions.filter(prediction => prediction.confidence < confidenceThreshold).map(prediction => ({ ...prediction, outcome: 'BELOW_THRESHOLD' })),
      targets: targets.map((target, index) => ({ ...target, outcome: matched.has(index) ? 'TP' : 'FN', prediction_id: matched.get(index)?.id ?? null, iou: matched.get(index)?.iou ?? null })),
      image: { width: scenario.width, height: scenario.height, asset: dataset.sensor === 'THERMAL' ? scenario.thermal : scenario.rgb },
      provenance: scenario.provenance ?? 'Synthetic scene with public reference annotations.',
      annotation_policy: scenario.annotationPolicy ?? 'Use the published reference boxes for this image.',
      validation_priorities: ['Audit missed targets, false positives, and duplicate detections.', 'Evaluate larger held-out datasets across terrain, light, sensors, motion, and occlusion.', 'Verify annotation quality and sensor registration; report uncertainty before operational conclusions.'],
      limitations: ['Evaluation on one synthetic example, not proof of real-world performance.', 'Public reference annotations; this is an open benchmark, not independent blind validation.', 'No model inference is run. Imported confidence values are supplied by the model and are not verified or calibrated.', 'Scores apply to the unmodified reference image. Simulator stress controls do not alter imported evaluation.', 'Precision is defined as 0 when there are no retained predictions; recall is 0 when there are no reference targets.']
    };
  }
  function compare(a, b, scenario, options = {}) {
    const first = evaluate(a, scenario, options), second = evaluate(b, scenario, options);
    if (first.sensor !== second.sensor) fail('Comparison requires the same sensor image in both files. RGB and THERMAL predictions cannot be compared as identical test conditions.');
    return { schema_version: 'judas-comparison-v1', source_type: 'IMPORTED MODEL PREDICTIONS', scenario_id: scenario.id, sensor: first.sensor, confidence_threshold: first.confidence_threshold, iou_threshold: first.iou_threshold, results: [first, second], delta_b_minus_a: { tp: second.tp - first.tp, fp: second.fp - first.fp, fn: second.fn - first.fn, precision: second.precision - first.precision, recall: second.recall - first.recall } };
  }
  function example(scenario, sensor = 'RGB') {
    const targets = reference(scenario);
    if (!['RGB', 'THERMAL'].includes(sensor)) fail('Example sensor must be RGB or THERMAL.');
    return { schema_version: schemaVersion, scenario_id: scenario.id, coordinate_system: coordinateSystem, sensor, model_name: 'Format example — exact reference boxes, not model inference', predictions: targets.map((target, index) => ({ id: `example-${index + 1}`, bbox: target.bbox.slice(), confidence: 0.9, class: 'person' })) };
  }
  function csvCell(value) {
    let str = value == null ? '' : String(value);
    if (/^[\s]*[=+\-@]/.test(str) && typeof value !== 'number') str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  }
  function toCSV(report) {
    const reports = report.results || [report];
    const scoreFields = ['source_type', 'scenario_id', 'sensor', 'model_name', 'confidence_threshold', 'iou_threshold', 'tp', 'fp', 'fn', 'precision', 'recall', 'prediction_count', 'ignored_count'];
    const fields = ['test_id', 'recorded_at', 'source_file', 'set', ...scoreFields, 'record_type', 'id', 'outcome', 'matched_id', 'confidence', 'iou', 'x', 'y', 'width', 'height'];
    const rows = [fields];
    reports.forEach((result, index) => {
      const common = [report.test_id, report.recorded_at, report.source_files?.[index], String.fromCharCode(65 + index), ...scoreFields.map(key => result[key])];
      rows.push([...common, 'summary']);
      result.targets.forEach(target => rows.push([...common, 'reference', target.id, target.outcome, target.prediction_id, '', target.iou, ...target.bbox]));
      [...result.predictions, ...result.ignored_predictions].forEach(prediction => rows.push([...common, 'prediction', prediction.id, prediction.outcome, prediction.target_id, prediction.confidence, prediction.iou, ...prediction.bbox]));
    });
    return rows.map(row => Array.from({ length: fields.length }, (_, index) => csvCell(row[index])).join(',')).join('\r\n');
  }
  const api = { schemaVersion, coordinateSystem, MAX_BYTES, MAX_PREDICTIONS, parse, validate, evaluate, compare, iou, example, toCSV };
  root.JudasEvaluation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

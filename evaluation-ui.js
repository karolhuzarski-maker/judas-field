/* Browser-only, local prediction import. The simulator never supplies these scores. */
(function (root) {
  'use strict';
  const E = root.JudasEvaluation, container = document.getElementById('evaluation-root');
  if (!container || !E) return;
  const scenarios = root.JudasScenarios?.scenarios;
  if (!scenarios || !Object.keys(scenarios).length) { container.textContent = 'Reference scenarios are unavailable. Reload the page or check that scenarios.js has loaded.'; return; }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const pct = value => `${(value * 100).toFixed(1)}%`;
  const state = { files: [null, null], names: ['', ''], reads: [0, 0], pending: [false, false], report: null, overlay: 0, reportId: '', recordedAt: '' };
  const byId = id => container.querySelector(`#${id}`);
  const domains = Object.keys(scenarios);
  container.innerHTML = `
    <div class="evaluation-intro"><span class="badge">IMPORTED MODEL PREDICTIONS</span><p>Evaluate your detector’s exported boxes against a fixed, annotated reference image. Files are read locally in this browser. No upload, inference, or simulated model profile is involved.</p></div>
    <div class="evaluation-steps" aria-label="Evaluation workflow"><span><b>01</b> Download the reference image</span><span><b>02</b> Run your detector elsewhere</span><span><b>03</b> Import its person predictions</span></div>
    <form id="evaluation-form" class="panel evaluation-form">
      <div class="evaluation-settings"><label>Reference scenario<select id="evaluation-scenario">${domains.map(domain => `<option value="${esc(domain)}">${esc(domain)} / ${esc(scenarios[domain].id)}</option>`).join('')}</select></label><label>Reference sensor<select id="evaluation-sensor"><option value="RGB">RGB</option><option value="THERMAL">THERMAL · synthetic</option></select></label><label>Confidence threshold<input id="evaluation-confidence" type="number" min="0" max="1" step="0.01" value="0.25" required></label><label>IoU threshold<input id="evaluation-iou" type="number" min="0.01" max="1" step="0.01" value="0.5" required></label></div>
      <div class="evaluation-resources"><a class="button subtle" id="evaluation-image" download>↓ Reference image</a><button class="button subtle" type="button" id="evaluation-example">↓ Example prediction JSON</button><a href="./docs/predictions.md" target="_blank" rel="noopener" class="text-button">Input schema &amp; matching rule ↗</a></div>
      <p class="evaluation-caption">Use the original image, without simulator effects or cropping. Boxes use normalized <b>[x, y, width, height]</b> coordinates. The example copies reference boxes to demonstrate the format; it is not model inference.</p>
      <div class="evaluation-files">${[0, 1].map((index) => `<div class="evaluation-file"><label for="evaluation-file-${index}"><span class="eyebrow">PREDICTION SET ${index ? 'B / OPTIONAL COMPARISON' : 'A / REQUIRED'}</span><input id="evaluation-file-${index}" type="file" accept=".json,.csv,application/json,text/csv"><span id="evaluation-file-label-${index}">Choose a local JSON or CSV file · max 2 MiB / 2,000 predictions</span></label><button type="button" class="text-button" data-evaluation-clear="${index}">Clear set ${index ? 'B' : 'A'}</button></div>`).join('')}</div>
      <div class="evaluation-submit"><button type="submit" class="button primary" id="evaluation-run">Evaluate imported predictions</button><p>Comparison uses the same scenario image, sensor, confidence threshold, and IoU threshold for both sets.</p></div>
      <p id="evaluation-feedback" class="evaluation-feedback" role="status" aria-live="polite">Choose a reference image and import prediction set A to begin.</p>
    </form>
    <section id="evaluation-result" hidden aria-label="Imported prediction evaluation report">
      <div class="evaluation-result-heading"><div><p class="eyebrow">AI STRESS REPORT / IMPORTED PREDICTIONS</p><h2>Evaluation on a synthetic example.</h2><p id="evaluation-record" class="evaluation-caption"></p></div><div class="report-actions"><button class="button" id="evaluation-json">↓ JSON report</button><button class="button" id="evaluation-csv">↓ CSV report</button><button class="button" id="evaluation-print">Print / save PDF</button></div></div>
      <div id="evaluation-metrics" class="evaluation-metrics"></div>
      <div class="panel evaluation-image-panel"><div class="panel-header"><h3>REFERENCE IMAGE / IMPORTED OVERLAY</h3><div class="evaluation-overlay-controls"><label>Show set<select id="evaluation-overlay"><option value="0">A</option><option value="1">B</option></select></label><label class="check"><input type="checkbox" id="evaluation-ground-truth" checked> Ground truth</label></div></div><div id="evaluation-scene" class="evaluation-scene"></div><div class="evaluation-legend"><span class="evaluation-key gt">Dashed: reference</span><span class="evaluation-key tp">Solid green: matched prediction</span><span class="evaluation-key fp">Solid amber: false positive</span><span class="evaluation-key fn">Dashed red: missed reference</span></div></div>
      <div id="evaluation-tables"></div>
      <div id="evaluation-limitations" class="panel evaluation-limitations"></div>
    </section>`;
  function scenario() { return scenarios[byId('evaluation-scenario').value]; }
  function message(value, error = false) { const element = byId('evaluation-feedback'); element.textContent = value; element.classList.toggle('error', error); }
  function clearReport() { state.report = null; byId('evaluation-result').hidden = true; }
  function syncPending() { byId('evaluation-run').disabled = state.pending.some(Boolean); }
  function resource() {
    const selected = scenario(), sensor = byId('evaluation-sensor').value;
    byId('evaluation-image').href = sensor === 'THERMAL' ? selected.thermal : selected.rgb;
    byId('evaluation-image').download = `${selected.id}-${sensor.toLowerCase()}.webp`;
  }
  function download(name, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reports() { return state.report?.results || (state.report ? [state.report] : []); }
  function overlay() {
    const result = reports()[state.overlay] || reports()[0];
    if (!result) return;
    const selected = scenario(), width = selected.width, height = selected.height;
    const asset = result.sensor === 'THERMAL' ? selected.thermal : selected.rgb;
    const scale = width / 1600, font = 19 * scale;
    const boxes = (items, reference) => items.map(item => {
      const [x, y, w, h] = item.bbox.map((value, i) => value * (i % 2 ? height : width));
      const color = reference ? (item.outcome === 'FN' ? '#ff8792' : '#9ce4ef') : item.outcome === 'TP' ? '#72edb1' : '#ffc66e';
      const label = reference ? `REF ${item.id}${item.outcome === 'FN' ? ' / MISSED' : ''}` : `${item.id} / ${item.outcome} / ${Math.round(item.confidence * 100)}%`;
      const labelY = reference ? Math.max(font + 5, y - 7 * scale) : Math.min(height - font * .3, y + h + font * 1.2);
      return `<g data-evaluation-layer="${reference ? 'reference' : 'prediction'}" data-outcome="${item.outcome}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${(reference ? 2 : 3) * scale}"${reference ? ` stroke-dasharray="${8 * scale} ${5 * scale}"` : ''}/><text x="${Math.min(Math.max(4, x), width - label.length * font * .55)}" y="${labelY}" fill="${color}" stroke="#101419" stroke-width="${4 * scale}" paint-order="stroke" font-size="${font}" font-family="Consolas,monospace">${esc(label)}</text></g>`;
    }).join('');
    byId('evaluation-scene').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(result.sensor)} reference image with imported set ${state.overlay ? 'B' : 'A'} predictions"><title>${esc(result.model_name)}: ${result.tp} true positives, ${result.fp} false positives, ${result.fn} missed targets</title><image href="${esc(asset)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>${byId('evaluation-ground-truth').checked ? boxes(result.targets, true) : ''}${boxes(result.predictions, false)}</svg>`;
  }
  function render() {
    const results = reports();
    byId('evaluation-result').hidden = false;
    byId('evaluation-record').textContent = `${state.reportId} · ${state.recordedAt} · ${scenario().id} · ${results[0].sensor} · Confidence ≥ ${results[0].confidence_threshold} · IoU ≥ ${results[0].iou_threshold}`;
    byId('evaluation-overlay').options[1].disabled = results.length < 2;
    if (state.overlay >= results.length) state.overlay = 0;
    byId('evaluation-overlay').value = String(state.overlay);
    byId('evaluation-metrics').innerHTML = results.map((result, index) => `<article class="panel evaluation-card"><span class="eyebrow">SET ${index ? 'B' : 'A'} / IMPORTED PREDICTIONS</span><h3>${esc(result.model_name)}</h3><p class="evaluation-caption">Source: ${esc(state.names[index])}</p><div class="evaluation-score-grid">${[['TP', result.tp], ['FP', result.fp], ['FN', result.fn], ['PRECISION', pct(result.precision)], ['RECALL', pct(result.recall)]].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p class="evaluation-caption">${result.evaluated_count} of ${result.prediction_count} predictions retained · ${result.ignored_count} below confidence threshold · ${result.reference_count} reference subjects</p></article>`).join('');
    if (state.report.results) {
      const delta = state.report.delta_b_minus_a, sign = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`;
      byId('evaluation-metrics').insertAdjacentHTML('beforeend', `<p class="evaluation-comparison">B minus A under identical scoring rules: recall ${sign(delta.recall)}, precision ${sign(delta.precision)}, false positives ${delta.fp >= 0 ? '+' : ''}${delta.fp}. This is one synthetic image, not a general model ranking.</p>`);
    }
    byId('evaluation-tables').innerHTML = results.map((result, index) => `<section class="panel evaluation-table"><div class="panel-header"><h3>SET ${index ? 'B' : 'A'} / SUBJECT OUTCOMES</h3><span class="mono">REFERENCE TARGETS</span></div><div class="table-wrap"><table><thead><tr><th>Subject</th><th>Outcome</th><th>Matched prediction</th><th>IoU</th></tr></thead><tbody>${result.targets.map(target => `<tr><td>${esc(target.id)}</td><td><span class="badge ${target.outcome === 'TP' ? 'pass' : 'fail'}">${target.outcome === 'TP' ? 'DETECTED / TP' : 'MISSED / FN'}</span></td><td>${esc(target.prediction_id || '—')}</td><td>${target.iou === null ? '—' : target.iou.toFixed(3)}</td></tr>`).join('')}</tbody></table></div><details><summary>Prediction audit · ${result.prediction_count} imported boxes</summary><p class="evaluation-caption">Showing up to 100 boxes; JSON and CSV reports include every prediction, including those below threshold.</p><div class="table-wrap"><table><thead><tr><th>Prediction</th><th>Outcome</th><th>Confidence</th><th>Matched subject</th><th>IoU</th></tr></thead><tbody>${[...result.predictions, ...result.ignored_predictions].slice(0, 100).map(prediction => `<tr><td>${esc(prediction.id)}</td><td>${esc(prediction.outcome)}</td><td>${pct(prediction.confidence)}</td><td>${esc(prediction.target_id || '—')}</td><td>${prediction.iou == null ? '—' : prediction.iou.toFixed(3)}</td></tr>`).join('')}</tbody></table></div></details></section>`).join('');
    byId('evaluation-limitations').innerHTML = `<h3>METHOD, PROVENANCE &amp; NEXT VALIDATION</h3><p>${esc(results[0].matching_rule)}</p><p>Confidence threshold ≥ ${results[0].confidence_threshold}; IoU threshold ≥ ${results[0].iou_threshold}. A prediction can match only one person. Duplicate detections are false positives. Predictions below the confidence threshold are excluded.</p><p><b>Reference provenance:</b> ${esc(typeof scenario().provenance === 'string' ? scenario().provenance : JSON.stringify(scenario().provenance))}</p><ul>${results[0].limitations.map(limitation => `<li>${esc(limitation)}</li>`).join('')}</ul><p><b>Next validation priorities:</b> audit missed and duplicate detections; test more independent images, changing terrain, light, sensor, and occlusion; use held-out real recordings and report uncertainty before drawing operational conclusions.</p><p>No degradation curve or breaking point is inferred from this single fixed image. Use a controlled multi-condition dataset for those claims.</p>`;
    overlay();
  }
  function evaluate() {
    clearReport();
    if (state.pending.some(Boolean)) { message('Wait until the selected prediction files finish loading.'); return; }
    if (!state.files[0]) { message('Import prediction set A first. An optional set B enables a comparison.', true); return; }
    try {
      const selectedSensor = byId('evaluation-sensor').value;
      state.files.filter(Boolean).forEach((dataset, index) => {
        if (dataset.sensor !== selectedSensor) throw new Error(`Set ${index ? 'B' : 'A'} contains ${dataset.sensor} predictions. Select the matching reference sensor (${dataset.sensor}).`);
      });
      const confidenceRaw = byId('evaluation-confidence').value, iouRaw = byId('evaluation-iou').value;
      if (confidenceRaw === '' || iouRaw === '') throw new Error('Enter both scoring thresholds.');
      const options = { confidenceThreshold: Number(confidenceRaw), iouThreshold: Number(iouRaw) };
      state.report = state.files[1] ? E.compare(state.files[0], state.files[1], scenario(), options) : E.evaluate(state.files[0], scenario(), options);
      state.recordedAt = new Date().toISOString(); state.reportId = `JF-IMPORT-${state.recordedAt.replace(/[-:.]/g, '')}`;
      render();
      message(`${state.files[1] ? 'Both sets evaluated under identical rules.' : 'Prediction set A evaluated.'} Results below use imported predictions on the selected synthetic reference image.`);
    } catch (error) { message(error.message, true); }
  }
  byId('evaluation-form').addEventListener('submit', event => { event.preventDefault(); evaluate(); });
  [0, 1].forEach(index => byId(`evaluation-file-${index}`).addEventListener('change', async event => {
    const file = event.target.files[0], read = ++state.reads[index];
    state.pending[index] = Boolean(file); syncPending();
    state.files[index] = null; state.names[index] = ''; clearReport();
    if (!file) { byId(`evaluation-file-label-${index}`).textContent = 'No file selected.'; return; }
    byId(`evaluation-file-label-${index}`).textContent = `Reading ${file.name}…`;
    try {
      if (file.size > E.MAX_BYTES) throw new Error('The file is too large. Maximum upload size is 2 MiB.');
      const format = file.name.toLowerCase().split('.').pop();
      if (!['json', 'csv'].includes(format)) throw new Error('Unsupported file type. Choose a .json or .csv prediction file.');
      const contents = await file.text();
      if (read !== state.reads[index]) return;
      const dataset = E.parse(contents, format);
      clearReport();
      state.files[index] = dataset; state.names[index] = file.name;
      byId(`evaluation-file-label-${index}`).textContent = `${file.name} · ${dataset.predictions.length} predictions · ${dataset.scenario_id} · ${dataset.sensor}`;
      message(`Set ${index ? 'B' : 'A'} is valid. Select Evaluate imported predictions to score it against the selected image.`);
    } catch (error) {
      if (read !== state.reads[index]) return;
      byId(`evaluation-file-label-${index}`).textContent = `${file.name} · rejected`;
      message(`Set ${index ? 'B' : 'A'}: ${error.message}`, true);
    } finally {
      if (read === state.reads[index]) { state.pending[index] = false; syncPending(); }
    }
  }));
  container.querySelectorAll('[data-evaluation-clear]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.evaluationClear); state.reads[index]++; state.files[index] = null; state.names[index] = '';
    state.pending[index] = false; syncPending();
    byId(`evaluation-file-${index}`).value = ''; byId(`evaluation-file-label-${index}`).textContent = 'No file selected.';
    clearReport(); message(`Set ${index ? 'B' : 'A'} cleared.`);
  }));
  ['evaluation-scenario', 'evaluation-sensor', 'evaluation-confidence', 'evaluation-iou'].forEach(id => byId(id).addEventListener('change', () => {
    clearReport(); resource(); message('Reference or scoring settings changed. Evaluate the imported predictions again to produce a report.');
  }));
  byId('evaluation-example').addEventListener('click', () => download(`${scenario().id}-${byId('evaluation-sensor').value.toLowerCase()}-example.json`, JSON.stringify(E.example(scenario(), byId('evaluation-sensor').value), null, 2), 'application/json'));
  byId('evaluation-overlay').addEventListener('change', event => { state.overlay = Number(event.target.value); overlay(); });
  byId('evaluation-ground-truth').addEventListener('change', overlay);
  function exportReport() { return { ...state.report, test_id: state.reportId, recorded_at: state.recordedAt, source_files: state.names.filter(Boolean), test_conditions: 'Unmodified fixed reference image; simulator stress settings do not apply.' }; }
  byId('evaluation-json').addEventListener('click', () => { if (state.report) download(`${scenario().id}-imported-report.json`, JSON.stringify(exportReport(), null, 2), 'application/json'); });
  byId('evaluation-csv').addEventListener('click', () => { if (state.report) download(`${scenario().id}-imported-report.csv`, E.toCSV(exportReport()), 'text/csv;charset=utf-8'); });
  byId('evaluation-print').addEventListener('click', () => {
    document.body.classList.add('printing-evaluation');
    try { window.print(); } finally { document.body.classList.remove('printing-evaluation'); }
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-evaluation'));
  resource();
})(globalThis);

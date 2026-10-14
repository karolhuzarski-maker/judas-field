/* Registered raster observations and reference-aligned overlays. Effects are illustrative. */
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const number = value => (Math.abs(value) < .00001 ? 0 : value).toFixed(2);
  const confidence = value => `${Math.round(clamp(value, 0, 1) * 100)}%`;
  function validBox(box) { return Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) && box[0] >= 0 && box[1] >= 0 && box[2] > 0 && box[3] > 0 && box[0] + box[2] <= 1.00001 && box[1] + box[3] <= 1.00001; }
  function pixels(box, width, height) { return { x: box[0] * width, y: box[1] * height, w: box[2] * width, h: box[3] * height }; }
  function boxMarkup(id, box, width, height, type, score) {
    const { x, y, w, h } = pixels(box, width, height), detected = type === 'prediction', gt = type === 'ground-truth';
    const color = gt ? '#77d7e1' : detected ? '#a3e2ad' : type === 'false-positive' ? '#f0c37c' : '#ff9a9e';
    const label = `${id} · ${gt ? 'GT' : detected ? confidence(score) : type === 'false-positive' ? 'FP ' + confidence(score) : 'MISSED'}`;
    const font = width / 108, stroke = width / 650, corner = Math.min(w, h) * .24;
    const labelY = gt ? Math.min(height - font * 1.5, y + h + font * .35) : Math.max(font * 1.7, y) - font * 1.65;
    const labelWidth = label.length * font * .61 + font * .8, labelX = Math.max(2, Math.min(width - labelWidth - 2, x));
    const outline = detected
      ? `<rect x="${number(x)}" y="${number(y)}" width="${number(w)}" height="${number(h)}" fill="${color}" fill-opacity=".035" stroke-opacity=".4"/><path d="M${number(x + corner)} ${number(y)}h-${number(corner)}v${number(corner)} M${number(x + w - corner)} ${number(y)}h${number(corner)}v${number(corner)} M${number(x)} ${number(y + h - corner)}v${number(corner)}h${number(corner)} M${number(x + w - corner)} ${number(y + h)}h${number(corner)}v-${number(corner)}"/>`
      : `<rect x="${number(x)}" y="${number(y)}" width="${number(w)}" height="${number(h)}" stroke-dasharray="${gt ? '8 7' : '4 4'}"/>`;
    return `<g data-annotation="${esc(id)}" data-detected="${detected}" data-layer="${type}" data-bbox="${box.join(',')}" fill="none" stroke="${color}" stroke-width="${number(stroke)}">${outline}<rect x="${number(labelX)}" y="${number(labelY)}" width="${number(labelWidth)}" height="${number(font * 1.45)}" fill="#10171b" fill-opacity=".88" stroke="none"/><text x="${number(labelX + font * .4)}" y="${number(labelY + font * 1.05)}" fill="${color}" stroke="none" font-family="Consolas,monospace" font-size="${number(font)}">${esc(label)}</text></g>`;
  }
  function obstruction(target, amount, width, height, thermal) {
    if (amount <= 0) return '';
    const { x, y, w, h } = pixels(target.bbox, width, height), left = x + w * (1 - amount), right = x + w * 1.12, top = y - h * .12, bottom = y + h * 1.12;
    return `<g data-occlusion-target="${esc(target.id)}" opacity="${number(.5 + amount * .46)}"><path d="M${number(left)} ${number(top)}Q${number(left - w * .12)} ${number(y + h * .12)} ${number(left + w * .06)} ${number(y + h * .29)}T${number(left - w * .08)} ${number(y + h * .65)}Q${number(left + w * .06)} ${number(y + h * .9)} ${number(left)} ${number(bottom)}L${number(right)} ${number(bottom)}V${number(top)}Z" fill="url(#jf-obstruction-${thermal ? 'thermal' : 'rgb'})" filter="url(#jf-soft-edge)"/></g>`;
  }
  function render(config, result = null, options = {}) {
    const cfg = { domain: 'MCI', sensor: 'RGB', altitude: 30, speed: 0, occlusion: 0, smoke: 0, fog: 0, light: 'day', observation: 10, ...config };
    const domain = String(cfg.domain).toUpperCase(), manifest = root.JudasScenarios?.scenarios?.[domain];
    const thermal = cfg.sensor === 'THERMAL', source = thermal ? manifest?.thermal : manifest?.rgb;
    if (!manifest || !source || !manifest.width || !manifest.height || !Array.isArray(manifest.targets) || !manifest.targets.every(target => validBox(target.bbox))) {
      return `<div class="scene-unavailable" role="status"><strong>Observation asset unavailable</strong><p>The ${esc(domain)} ${thermal ? 'thermal' : 'RGB'} photograph and its matching annotations must be supplied before this scene can be evaluated.</p></div>`;
    }
    const W = manifest.width, H = manifest.height;
    const { groundTruth = false, progress = 0, running = false, paused = false, playback = running || paused } = options;
    const position = clamp(progress > 1 ? progress / 100 : progress, 0, 1), done = !!result && (!playback || position >= 1);
    const visible = person => !!person?.detected && (!playback || (Number.isFinite(person.time) && person.time <= position * cfg.observation));
    const people = result?.persons || [], targets = manifest.targets;
    const count = people.filter(person => targets.some(target => target.id === person.id) && visible(person)).length;
    const speed = clamp(cfg.speed, 0, 12), zoom = 1 + (120 - clamp(cfg.altitude, 15, 120)) / 105 * .30;
    const drift = Math.sin(position * Math.PI * 4) * speed * W * .0005;
    const smoke = clamp(cfg.smoke, 0, 100) / 100, fog = clamp(cfg.fog, 0, 100) / 100;
    const darkness = thermal ? 0 : cfg.light === 'night' ? .77 : cfg.light === 'dusk' ? .36 : 0;
    const font = W / 114;
    let effects = '';
    if (darkness) effects += `<rect data-effect="low-light" width="${W}" height="${H}" fill="#061018" opacity="${darkness}"/>`;
    if (cfg.occlusion > 0) effects += `<g data-effect="occlusion">${targets.map(target => obstruction(target, clamp(cfg.occlusion, 0, 100) / 100, W, H, thermal)).join('')}</g>`;
    if (smoke > 0) effects += `<g data-effect="smoke" opacity="${number(smoke * (thermal ? .51 : .78))}" filter="url(#jf-wisps)"><path d="M${W * .2} ${H * .87}Q${W * .49} ${H * .46} ${W * .7} ${H * .42}T${W * 1.08} ${H * .07}" stroke="${thermal ? '#83888b' : '#b9b8ab'}" stroke-width="${number(H * (.02 + smoke * .15))}" fill="none"/><ellipse cx="${W * .43}" cy="${H * .62}" rx="${W * (.1 + smoke * .09)}" ry="${H * .09}" fill="${thermal ? '#797e82' : '#9fa69c'}"/><ellipse cx="${W * .75}" cy="${H * .28}" rx="${W * (.07 + smoke * .1)}" ry="${H * .095}" fill="${thermal ? '#a8adaf' : '#d2d1c7'}"/></g>`;
    if (fog > 0) effects += `<g data-effect="fog" opacity="${number(fog * (thermal ? .7 : .95))}"><rect width="${W}" height="${H}" fill="url(#jf-fog-depth)"/><ellipse cx="${W * .35}" cy="${H * .34}" rx="${W * .46}" ry="${H * .15}" fill="#dce1dc" opacity=".2" filter="url(#jf-wisps)"/></g>`;
    const anchors = targets.map(target => { const box = pixels(target.bbox, W, H); return `<g data-person-id="${esc(target.id)}" transform="translate(${number(box.x)} ${number(box.y)})" data-bbox="${target.bbox.join(',')}"><title>Reference subject ${esc(target.id)}</title></g>`; }).join('');
    const groundTruthLayer = groundTruth ? targets.map(target => boxMarkup(target.id, target.bbox, W, H, 'ground-truth')).join('') : '';
    const predictions = targets.map(target => {
      const person = people.find(item => item.id === target.id);
      // Geometry comes from the image-specific annotation, never the former vector scene.
      if (visible(person)) return boxMarkup(target.id, target.bbox, W, H, 'prediction', person.confidence);
      if (done && person && !person.detected) return boxMarkup(target.id, target.bbox, W, H, 'missed');
      return '';
    }).join('');
    const falsePositives = done && Array.isArray(result.falsePositives) ? result.falsePositives.map((fp, index) => {
      const fallback = [clamp(Number(fp.x) / 100 - .018, 0, .964), clamp(Number(fp.y) / 100 - .025, 0, .95), .036, .05];
      const box = validBox(fp.bbox) ? fp.bbox : Number.isFinite(fp.x) && Number.isFinite(fp.y) ? fallback : null;
      return box ? boxMarkup(fp.id || `FP${index + 1}`, box, W, H, 'false-positive', fp.confidence) : '';
    }).join('') : '';
    const scanY = position * H;
    const status = playback ? `${paused ? 'OBSERVATION PAUSED' : 'ACQUIRING'}  ${Math.round(position * 100)}%` : result ? 'OBSERVATION COMPLETE' : 'AWAITING OBSERVATION';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="scene-svg" role="img" aria-label="Synthetic ${esc(domain)} aerial observation, ${thermal ? 'thermal representation' : 'RGB'}${result ? `, ${count} persons detected` : ''}. Generated imagery and illustrative conditions; no real inference." preserveAspectRatio="xMidYMid meet"><defs>
      <filter id="jf-motion" x="-2%" y="-2%" width="104%" height="104%"><feGaussianBlur stdDeviation="${number(speed * W / 17000)} ${number(speed * W / 80000)}"/></filter>
      <filter id="jf-wisps" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="${number(W * .018)}"/></filter>
      <filter id="jf-soft-edge"><feGaussianBlur stdDeviation="${number(W * .0006)}"/></filter>
      <linearGradient id="jf-fog-depth" x1="0" y1="0" x2=".12" y2="1"><stop stop-color="#d5ddd9" stop-opacity=".71"/><stop offset=".54" stop-color="#c2ceca" stop-opacity=".29"/><stop offset="1" stop-color="#c2ceca" stop-opacity=".055"/></linearGradient>
      <linearGradient id="jf-status-shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#070d10" stop-opacity=".7"/><stop offset="1" stop-color="#070d10" stop-opacity="0"/></linearGradient>
      <linearGradient id="jf-scan" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b1e8d4" stop-opacity="0"/><stop offset="1" stop-color="#b1e8d4" stop-opacity=".13"/></linearGradient>
      <pattern id="jf-obstruction-${thermal ? 'thermal' : 'rgb'}" data-texture-source="registered-observation" patternUnits="userSpaceOnUse" width="${number(W * .14)}" height="${number(H * .16)}" viewBox="${number(W * .02)} ${number(H * .03)} ${number(W * .14)} ${number(H * .16)}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><image href="${esc(source)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/></pattern>
      </defs><g data-scene-world transform="translate(${number(drift)} 0) translate(${W / 2} ${H / 2}) scale(${number(zoom)}) translate(${-W / 2} ${-H / 2})"><g data-photo-layer><image href="${esc(source)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" filter="url(#jf-motion)"/>${effects}</g><g data-reference-anchors>${anchors}</g><g data-ground-truth-layer>${groundTruthLayer}</g><g data-prediction-layer>${predictions}${falsePositives}</g></g>
      ${playback ? `<g data-scan-progress="${position}" aria-hidden="true"><rect y="${number(scanY - H * .11)}" width="${W}" height="${number(H * .11)}" fill="url(#jf-scan)"/><path d="M0 ${number(scanY)}H${W}" stroke="#b5e9da" stroke-opacity=".85" stroke-width="${number(W / 900)}"/></g>` : ''}
      <rect width="${W}" height="${H * .13}" fill="url(#jf-status-shade)"/><rect y="${H * .935}" width="${W}" height="${H * .065}" fill="#0a1014" fill-opacity=".72"/>
      <g fill="#e2e9ea" font-family="Consolas,monospace" font-size="${number(font)}"><text x="${W * .021}" y="${H * .045}">${esc(domain)} · ${thermal ? 'THERMAL / SYNTHETIC' : 'RGB / GENERATED IMAGE'}</text><text x="${W * .979}" y="${H * .045}" text-anchor="end">${Math.round(cfg.altitude)} M · ${Number(speed.toFixed(2))} M/S</text><text x="${W * .021}" y="${H * .975}" font-size="${number(font * .85)}">${thermal ? 'ILLUSTRATIVE · NOT RADIOMETRIC' : 'ILLUSTRATIVE CONDITIONS · NOT OPTICALLY CALIBRATED'}</text><text x="${W * .979}" y="${H * .975}" text-anchor="end" font-size="${number(font * .85)}">${status}</text></g></svg>`;
  }
  const scene = { render };
  root.JudasScene = scene;
  if (typeof module === 'object' && module.exports) module.exports = scene;
})(typeof globalThis !== 'undefined' ? globalThis : this);

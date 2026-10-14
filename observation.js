/* Learning schematic for the shared nadir observation model. No scoring or UI state. */
(function (root) {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmt = (value, digits = 1) => Number(value.toFixed(digits)).toString();
  const n = value => Number(value.toFixed(4));
  function learning(g, changedKey) {
    if (g.hover && (changedKey === 'speed' || changedKey === 'observation' || changedKey === 'initial')) return `Hovering removes the flyover-induced time limit. The experiment still uses a ${fmt(g.observationCap)} s cap. A target can remain in view continuously, but occlusion, image quality and model limitations can still prevent detection.`;
    if (changedKey === 'altitude') return `At ${fmt(g.altitude)} m, the along-track footprint is ${fmt(g.footprint)} m. Raising altitude widens this footprint; at unchanged speed, visibility lasts longer. The same target also appears smaller, so extra dwell time does not necessarily improve detection.`;
    if (changedKey === 'speed') return `At ${fmt(g.speed, 2)} m/s, the target crosses the ${fmt(g.footprint)} m footprint in ${fmt(g.visibilityTime, 2)} s. Faster flight shortens this geometric window. Motion stability remains a separate illustrative effect in the synthetic model.`;
    if (changedKey === 'observation') return g.hover ? `Hover is continuous; the experiment uses the ${fmt(g.observationCap)} s cap.` : `The visibility control sets the speed needed for a flyover. The current ${fmt(g.visibilityTime, 2)} s geometric window corresponds to ${fmt(g.speed, 2)} m/s. The experiment uses only ${fmt(g.effectiveObservationTime, 2)} s after applying its separate cap.`;
    if (changedKey === 'observationCap') return `The ${fmt(g.observationCap)} s cap limits how long the experiment observes. It does not change the footprint, flight speed or geometric visibility. ${g.hover ? 'During hover, the cap sets the entire effective observation time.' : `This pass provides ${fmt(g.visibilityTime, 2)} s of geometric visibility and ${fmt(g.effectiveObservationTime, 2)} s of effective observation.`}`;
    return `A nadir camera at ${fmt(g.altitude)} m covers ${fmt(g.footprint)} m along the flight path. ${g.hover ? 'Hover keeps a stationary target in view, subject to the separate experiment cap.' : `At ${fmt(g.speed, 2)} m/s, a central stationary target remains inside that footprint for ${fmt(g.visibilityTime, 2)} s.`} Change altitude, speed or requested visibility to explore their relationship.`;
  }
  function metric(name, label, value, unit, note) {
    return `<div class="geo-metric" data-geometry-metric="${name}"><span>${label}</span><strong>${esc(value)}${unit ? ` <small>${unit}</small>` : ''}</strong><small>${note}</small></div>`;
  }
  function render(config, options = {}) {
    const engine = root.JudasEngine || (typeof require === 'function' ? require('./engine.js') : null);
    if (!engine || typeof engine.geometry !== 'function') return '<p class="empty">Observation geometry is unavailable.</p>';
    const g = engine.geometry(config);
    // Equal horizontal and vertical metres; retain one scale over the usual
    // 10–120 m / 60° range. Wide future FOVs fit by scaling both axes together.
    const scale = Math.min(2, 360 / g.footprint, 240 / g.altitude);
    const cx = 280, ground = 276, top = ground - g.altitude * scale;
    const half = g.footprint * scale / 2, left = cx - half, right = cx + half;
    const travel = g.travelDistance * scale, travelEnd = left + travel;
    const dimensionX = Math.max(34, left - 28), labelX = dimensionX - 6;
    const capped = !g.hover && g.effectiveObservationTime < g.visibilityTime - .000001;
    const visibility = g.hover ? 'Continuous / Hover' : fmt(g.visibilityTime, 2);
    const preview = g.hover ? 'Hover: no ground travel. Effective observation is limited by the cap.' : `Distance-only preview: ${fmt(g.travelDistance)} m in ${fmt(g.effectiveObservationTime, 2)} s at ${fmt(g.speed, 2)} m/s. Each loop uses real time.`;
    const conePoints = `${n(cx)},${n(top)} ${n(left)},${ground} ${n(right)},${ground}`;
    const angularScale = 30 / g.altitude;
    return `<div class="panel geo-panel">
      <div class="panel-header"><h3>UAV OBSERVATION GEOMETRY</h3><span class="mono">NADIR · CENTRAL FLYOVER · ILLUSTRATIVE</span></div>
      <div class="geo-metrics">
        ${metric('altitude', 'ALTITUDE', fmt(g.altitude), 'm', 'Above level ground')}
        ${metric('speed', 'FLY-BY SPEED', fmt(g.speed, 2), 'm/s', g.hover ? 'Hover / stationary UAV' : 'Constant ground speed')}
        ${metric('fov', 'CAMERA FOV', fmt(g.fov), '°', 'Assumed along-track angle')}
        ${metric('footprint', 'GROUND FOOTPRINT', fmt(g.footprint), 'm', 'Along the flight path')}
        ${metric('visibility', 'TARGET VISIBILITY TIME', visibility, g.hover ? '' : 's', 'Geometric window, before cap')}
        ${metric('effective', 'EFFECTIVE OBSERVATION', fmt(g.effectiveObservationTime, 2), 's', 'Time available to the experiment')}
      </div>
      <div class="geo-cap"><span>MAXIMUM OBSERVATION CAP <b>${fmt(g.observationCap)} s</b></span><p>${g.hover ? 'Continuous geometry → capped experiment.' : capped ? 'The cap ends observation before the target crosses the full footprint.' : 'The target leaves the footprint before, or at, the cap.'}</p></div>
      <div class="geo-explanation-grid">
        <div class="geo-preview">
          <input type="checkbox" id="geometry-preview"${g.hover ? ' disabled' : ''}><label for="geometry-preview">Animate timing preview</label>
          <figure class="geo-figure">
            <svg class="geo-diagram" viewBox="0 0 560 368" role="img" aria-labelledby="geometry-diagram-title geometry-diagram-desc" data-geometry-scale="${n(scale)}" data-geometry-altitude="${g.altitude}" data-geometry-footprint="${g.footprint}" data-geometry-travel="${g.travelDistance}">
              <title id="geometry-diagram-title">Side view of a nadir camera and stationary ground target</title>
              <desc id="geometry-diagram-desc">${esc(`Altitude ${fmt(g.altitude)} metres. Camera FOV ${fmt(g.fov)} degrees. Footprint ${fmt(g.footprint)} metres. ${g.hover ? 'Hover gives continuous geometric visibility.' : `Visibility ${fmt(g.visibilityTime, 2)} seconds.`} Effective observation ${fmt(g.effectiveObservationTime, 2)} seconds. ${preview} Equal horizontal and vertical scale. Vehicle and target icons are symbolic.`)}</desc>
              <defs><marker id="geo-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L6 3L0 6" fill="currentColor"/></marker></defs>
              <text x="24" y="19" class="geo-svg-label">CENTRAL-OVERHEAD SNAPSHOT</text>
              <path d="M418 35H520" class="geo-flight" marker-end="url(#geo-arrow)"/>
              <text x="418" y="23" class="geo-svg-label">${g.hover ? 'HOVER · NO TRAVEL' : 'FLIGHT DIRECTION'}</text>
              <polygon class="geo-cone" data-geometry-cone points="${conePoints}"/>
              <line class="geo-nadir" x1="${cx}" y1="${n(top)}" x2="${cx}" y2="${ground}"/>
              <g class="geo-uav" transform="translate(${cx} ${n(top)})" aria-hidden="true"><path d="M-17 0H17M-11 -4L-5 4M11 -4L5 4"/><ellipse cx="-17" cy="-2" rx="9" ry="2"/><ellipse cx="17" cy="-2" rx="9" ry="2"/><rect x="-5" y="-3" width="10" height="7" rx="2"/><path d="M-2 5H2L0 8Z"/></g>
              <text x="${cx + 34}" y="${n(top - 9)}" class="geo-svg-label">UAV · ${fmt(g.fov)}° FOV</text>
              <path d="M${n(dimensionX)} ${n(top)}V${ground}" class="geo-dimension" marker-start="url(#geo-arrow)" marker-end="url(#geo-arrow)"/>
              <text x="${n(labelX)}" y="${n(top + (ground - top) / 2)}" text-anchor="end" class="geo-svg-value">${fmt(g.altitude)} m</text>
              <path class="geo-ground" d="M24 ${ground}H536"/>
              <path class="geo-footprint" data-geometry-footprint-line d="M${n(left)} ${ground}H${n(right)}"/>
              <g class="geo-target" transform="translate(${cx} ${ground})" aria-hidden="true"><circle cx="0" cy="-7" r="2"/><path d="M0 -5V-3M-3 -3L0 -5L3 -3M0 -3L-3 0M0 -3L3 0"/></g>
              <text x="${cx}" y="294" text-anchor="middle" class="geo-svg-label">STATIONARY TARGET</text>
              <path class="geo-dimension" d="M${n(left)} 311H${n(right)}M${n(left)} 306V316M${n(right)} 306V316"/>
              <text x="${cx}" y="330" text-anchor="middle" class="geo-svg-value">FOOTPRINT ${fmt(g.footprint)} m</text>
              <line class="geo-travel-base" x1="${n(left)}" y1="350" x2="${n(right)}" y2="350"/>
              <line class="geo-travel" data-geometry-travel-line x1="${n(left)}" y1="350" x2="${n(travelEnd)}" y2="350"/>
              <g class="geo-timing-marker${g.hover ? ' geo-hover' : ''}" style="--geo-distance:${n(travel)}px;--geo-duration:${g.effectiveObservationTime}s"><circle cx="${n(left)}" cy="350" r="4"/></g>
            </svg>
            <figcaption><span class="geo-travel-key"></span>${esc(preview)} <span class="geo-reduced-note">Motion is disabled by your reduced-motion preference.</span></figcaption>
          </figure>
        </div>
        <div class="geo-formula">
          <span class="control-caption">HOW THIS PASS IS CALCULATED</span>
          <p><b>Footprint</b><code>2 × ${fmt(g.altitude)} × tan(${fmt(g.fov / 2)}°) = ${fmt(g.footprint)} m</code></p>
          <p><b>Geometric visibility</b><code>${g.hover ? 'Continuous / Hover' : `${fmt(g.footprint)} m ÷ ${fmt(g.speed, 2)} m/s = ${fmt(g.visibilityTime, 2)} s`}</code></p>
          <p><b>Effective observation</b><code>${g.hover ? `Hover → cap = ${fmt(g.effectiveObservationTime, 2)} s` : `min(${fmt(g.visibilityTime, 2)}, ${fmt(g.observationCap)}) = ${fmt(g.effectiveObservationTime, 2)} s`}</code></p>
          <p class="geo-scale-note">Equal scale on both axes. Vehicle and target icons are symbolic. The cone is an overhead snapshot; the lower track shows distance travelled during effective observation.</p>
        </div>
      </div>
      <details id="geometry-learning" class="geo-learning">
        <summary>UNDERSTAND THE VARIABLES <span>Explore the trade-offs +</span></summary>
        <div class="geo-learning-body">
          <p class="geo-live-explanation" data-geometry-explanation="${esc(options.changedKey || 'initial')}">${esc(learning(g, options.changedKey || 'initial'))}</p>
          <div class="geo-tradeoffs">
            <div><h4>TIME IN VIEW</h4><b>${g.hover ? 'Continuous geometry' : `${fmt(g.visibilityTime, 2)} s geometric`}</b><p>The experiment can use ${fmt(g.effectiveObservationTime, 2)} s after the ${fmt(g.observationCap)} s cap. Longer observation provides opportunity, not guaranteed detections.</p></div>
            <div><h4>APPARENT TARGET SIZE</h4><b>${fmt(angularScale, 2)}× the scale at 30 m</b><p>Relative image-size proxy ∝ 1 / altitude, at fixed optics. Higher altitude reduces target detail. This is not calibrated pixel size, GSD or an optical simulation.</p></div>
            <div><h4>MOTION &amp; STABILITY</h4><b>${g.hover ? 'No flyover motion' : `${fmt(g.speed, 2)} m/s ground speed`}</b><p>Blur and tracking also depend on exposure, frame rate, image scale and stabilization. The model keeps a separate illustrative motion penalty; this diagram does not calculate real blur.</p></div>
          </div>
        </div>
      </details>
      <p class="geo-model-note">Simplified nadir camera, stationary target and central straight-line flyover over level ground. No active gimbal tracking or off-centre trajectory. The 60° default is a demonstrator assumption, not a verified DJI camera specification. Synthetic AI results are not empirically calibrated.</p>
    </div>`;
  }
  const api = { render };
  root.JudasObservation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

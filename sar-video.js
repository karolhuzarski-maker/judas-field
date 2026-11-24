/* SAR synchronized RGB / synthetic LWIR video preview. No real model inference. */
(function () {
  'use strict';
  const field = document.getElementById('field');
  if (!field) return;
  const panel = field.closest('.field-panel');
  const sourceBar = document.createElement('section');
  sourceBar.id = 'sar-video-source';
  sourceBar.className = 'sar-video-source';
  sourceBar.hidden = true;
  sourceBar.setAttribute('aria-label', 'SAR observation source');
  sourceBar.innerHTML = [
    '<div class="sar-video-source-buttons" role="group" aria-label="Observation source">',
    '<button type="button" data-sar-source="frame" class="active" aria-pressed="true">REFERENCE FRAME</button>',
    '<button type="button" data-sar-source="video" aria-pressed="false">SYNCHRONIZED VIDEO PAIR</button></div>',
    '<span class="sar-video-source-caption">SAR ONLY / LOCAL MEDIA / NO UPLOAD</span>'
  ].join('');
  field.before(sourceBar);

  const stage = document.createElement('section');
  stage.id = 'sar-video-stage';
  stage.className = 'sar-video-stage';
  stage.setAttribute('aria-label', 'Synchronized RGB and thermal aerial videos');
  stage.hidden = true;
  stage.innerHTML = [
    '<div class="sar-video-header">',
    '<div class="sar-video-views" role="group" aria-label="Video viewing mode">',
    '<button type="button" data-sar-view="rgb" class="active" aria-pressed="true">RGB</button>',
    '<button type="button" data-sar-view="thermal" aria-pressed="false">LWIR</button>',
    '<button type="button" data-sar-view="split" aria-pressed="false">RGB + LWIR</button></div>',
    '<span id="sar-video-badge" class="sar-video-badge">10 S RECORDING / VISUAL PREVIEW</span></div>',
    '<div class="sar-video-files">',
    '<label>RGB MP4 <input id="sar-rgb-upload" type="file" accept="video/mp4,.mp4" aria-label="Select RGB MP4"></label>',
    '<label>LWIR MP4 <input id="sar-thermal-upload" type="file" accept="video/mp4,.mp4" aria-label="Select LWIR MP4"></label>',
    '</div>',
    '<div id="sar-video-picture" class="sar-video-picture sar-view-rgb">',
    '<div class="sar-video-lane sar-video-rgb"><video id="sar-rgb" muted playsinline preload="metadata" aria-label="RGB aerial recording"></video><span>RGB / SOURCE</span><div class="sar-video-haze"></div><div class="sar-video-fog"></div><div class="sar-video-obscuration"></div></div>',
    '<div class="sar-video-lane sar-video-thermal"><video id="sar-thermal" muted playsinline preload="metadata" aria-label="Synthetic LWIR aerial recording"></video><span>LWIR / SYNTHETIC</span><div class="sar-video-haze"></div><div class="sar-video-fog"></div><div class="sar-video-obscuration"></div></div>',
    '<div id="sar-video-scan" class="sar-video-scan" aria-hidden="true" hidden></div>',
    '<div id="sar-video-results" class="sar-video-results" role="status" aria-live="polite" hidden></div>',
    '<div id="sar-video-empty" class="sar-video-empty" role="status">Choose your synchronized RGB and LWIR MP4 files to start the video preview.</div>',
    '</div>',
    '<div class="sar-video-transport"><button id="sar-video-play" type="button" disabled>▶ Play</button>',
    '<input id="sar-video-seek" type="range" min="0" max="1000" value="0" aria-label="Video timeline" disabled>',
    '<output id="sar-video-clock">00:00 / 00:10</output>',
    '<button id="sar-video-restart" type="button" disabled aria-label="Rewind video">↺</button></div>',
    '<p id="sar-video-message" class="sar-video-message" role="status">Files remain on your device. No files are transferred to the server.</p>',
    '<p class="sar-video-disclosure">VIDEO PREVIEW ONLY · The RGB/LWIR recording keeps its original camera path. Altitude adds an illustrative digital crop, without creating new detail. Fly-by speed and inverse visibility change playback pace, not measured flight speed. Fog, smoke, lighting and occlusion are display effects. The green sweep shows illustrative scan progress. End-of-playback S01–S03 labels are synthetic results for the separate reference image; the clips are not frame-registered, so there are no target boxes or model detections on video. LWIR is synthetic, not measured radiometry.</p>'
  ].join('');
  field.after(stage);

  const $ = id => document.getElementById(id);
  const videos = {rgb: $('sar-rgb'), thermal: $('sar-thermal')};
  const input = {rgb: $('sar-rgb-upload'), thermal: $('sar-thermal-upload')};
  const urls = {rgb: null, thermal: null};
  const present = {rgb: false, thermal: false};
  let source = 'frame', view = 'rgb', playing = false, raf = 0, hostedChecked = false, modelWasRunning = false;
  const position = $('sar-video-seek');
  const picture = $('sar-video-picture');
  const message = $('sar-video-message');
  const empty = $('sar-video-empty');
  const clock = $('sar-video-clock');
  const playButton = $('sar-video-play');
  const restartButton = $('sar-video-restart');
  const scan = $('sar-video-scan');
  const endResults = $('sar-video-results');
  const badge = $('sar-video-badge');

  const selectedDomain = () => document.querySelector('.domain.active')?.dataset.domain === 'SAR';
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const duration = () => {
    const values = Object.values(videos).filter(v => v.readyState >= 1 && Number.isFinite(v.duration)).map(v => v.duration);
    return values.length ? Math.min(...values) : 10;
  };
  const master = () => present.rgb ? videos.rgb : videos.thermal;
  const getTime = () => master().currentTime || 0;
  const timeLabel = seconds => {
    const n = Math.floor(clamp(seconds, 0, 5999));
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  };
  const isReady = () => {
    if (view === 'split') return present.rgb && present.thermal;
    return present[view];
  };
  function report(text) { message.textContent = text; }
  function syncPicture() {
    picture.className = 'sar-video-picture sar-view-' + view;
    document.querySelectorAll('[data-sar-view]').forEach(button => {
      const active = button.dataset.sarView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const ready = isReady();
    playButton.disabled = !ready;
    position.disabled = !ready;
    restartButton.disabled = !ready;
    empty.hidden = ready;
    if (!ready) empty.textContent = view === 'split'
      ? 'Choose both RGB and LWIR files. They must describe the same ten-second flyover.'
      : 'Choose the ' + (view === 'rgb' ? 'RGB' : 'LWIR') + ' MP4 file to preview this channel.';
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    Object.values(videos).forEach(video => video.pause());
    playButton.textContent = '▶ Play';
    syncScan();
  }
  function hideEndResults() { endResults.hidden = true; }
  function referenceConfig(sensor) {
    const value = id => Number($(id)?.value);
    return globalThis.JudasEngine.normalize({
      ...globalThis.JudasEngine.defaults, domain: 'SAR', sensor,
      model: $('model').value, altitude: value('altitude'), speed: value('speed'),
      occlusion: value('occlusion'), smoke: value('smoke'), fog: value('fog'),
      light: $('light').value, observationCap: value('observationCap'),
      seed: value('seed'), minRecall: value('minRecall'), maxFP: value('maxFP')
    });
  }
  function showEndResults() {
    if (source !== 'video' || !selectedDomain() || stage.hidden || !isReady() || !$('pause').disabled || !globalThis.JudasEngine) {
      hideEndResults();
      return;
    }
    const channels = view === 'split' ? ['RGB', 'THERMAL'] : [view === 'thermal' ? 'THERMAL' : 'RGB'];
    endResults.innerHTML = '<strong>REFERENCE IMAGE / SYNTHETIC MODEL ' + $('model').value + '</strong>'
      + '<div class="sar-video-result-columns">' + channels.map(sensor => {
        const result = globalThis.JudasEngine.simulate(referenceConfig(sensor));
        return '<div class="sar-video-result-channel"><span>' + (sensor === 'THERMAL' ? 'LWIR' : 'RGB')
          + ' · ' + result.tp + '/' + result.persons.length + ' DETECTED · ' + result.status + '</span><div class="sar-video-result-targets">'
          + result.persons.map(person => '<span class="' + (person.detected ? 'detected' : 'missed') + '">'
            + person.id + ' · ' + (person.detected ? Math.round(person.confidence * 100) + '%' : 'MISSED') + '</span>').join('')
          + '</div></div>';
      }).join('') + '</div><small>Reference still only · no video inference or registered video boxes</small>';
    endResults.hidden = false;
  }
  function syncScan() {
    const active = source === 'video' && selectedDomain() && !stage.hidden;
    const modelRunning = active && !$('pause').disabled;
    const previewRunning = active && playing && !modelRunning;
    const progress = modelRunning ? clamp(parseFloat($('progress').style.width) / 100 || 0, 0, 1)
      : previewRunning ? clamp(getTime() / duration(), 0, 1) : 0;
    scan.hidden = !(modelRunning || previewRunning);
    scan.style.setProperty('--scan-y', (progress * 100).toFixed(2) + '%');
    scan.dataset.scanProgress = progress.toFixed(3);
    if (modelRunning) hideEndResults();
    else if (modelWasRunning && active && !playing && $('result-status').textContent !== 'AWAITING TEST') showEndResults();
    modelWasRunning = modelRunning;
  }
  function syncTransport() {
    const d = duration(), t = Math.min(getTime(), d);
    position.value = d > 0 ? String(Math.round(t / d * 1000)) : '0';
    clock.textContent = timeLabel(t) + ' / ' + timeLabel(d);
  }
  function setTime(t) {
    const next = clamp(t, 0, duration());
    Object.values(videos).forEach(video => {
      if (video.readyState >= 1) {
        try { video.currentTime = Math.min(next, video.duration || next); }
        catch { /* Browser has not made a seekable frame available yet. */ }
      }
    });
    syncTransport();
    syncScan();
    if (next >= duration() - .015 && !playing) showEndResults();
    else hideEndResults();
  }
  function pairedCompatible() {
    if (!present.rgb || !present.thermal) return false;
    const r = videos.rgb, t = videos.thermal;
    return Math.abs(r.duration - t.duration) <= .15
      && r.videoWidth === t.videoWidth && r.videoHeight === t.videoHeight;
  }
  function tick() {
    if (!playing) return;
    const m = master(), slave = m === videos.rgb ? videos.thermal : videos.rgb;
    if (present.rgb && present.thermal && Math.abs(slave.currentTime - m.currentTime) > .07) {
      try { slave.currentTime = m.currentTime; } catch { /* Not seekable yet. */ }
    }
    if (m.ended || getTime() >= duration() - .015) { pause(); syncTransport(); if ($('pause').disabled) showEndResults(); return; }
    syncTransport();
    syncScan();
    raf = requestAnimationFrame(tick);
  }
  async function start() {
    if (!isReady()) return;
    hideEndResults();
    if (present.rgb && present.thermal && !pairedCompatible()) {
      report('The files do not match in duration or resolution. Choose the synchronized pair (10 s, 1280 × 720).');
      return;
    }
    if (getTime() >= duration() - .04) setTime(0);
    const t = getTime();
    Object.values(videos).forEach(video => {
      if (video.readyState >= 1 && Math.abs(video.currentTime - t) > .05) video.currentTime = t;
    });
    try {
      await Promise.all(Object.values(videos).filter(video => video.readyState >= 1).map(video => video.play()));
      playing = true;
      playButton.textContent = 'Ⅱ Pause';
      tick();
    } catch {
      pause();
      report('Playback is not available. Check that both files use browser-compatible H.264 MP4.');
    }
  }
  function setView(next) {
    if (!['rgb', 'thermal', 'split'].includes(next)) return;
    if (playing) pause();
    const resultsVisible = !endResults.hidden;
    view = next;
    syncPicture();
    syncTransport();
    syncScan();
    if (next !== 'split') {
      const button = document.querySelector('[data-sensor="' + (next === 'rgb' ? 'RGB' : 'THERMAL') + '"]');
      if (button && !button.classList.contains('selected') && !button.disabled) button.click();
    }
    if (resultsVisible) showEndResults();
  }
  function refreshSource() {
    const sar = selectedDomain();
    sourceBar.hidden = !sar;
    const on = sar && source === 'video';
    field.hidden = on;
    stage.hidden = !on;
    document.querySelectorAll('[data-sar-source]').forEach(button => {
      const active = button.dataset.sarSource === source;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (!on) { pause(); hideEndResults(); }
    if (on) { syncPicture(); effects(); void loadHostedPair(); }
    syncScan();
  }
  function effects() {
    const value = id => Number($(id)?.value) || 0;
    const smoke = clamp(value('smoke') / 100, 0, 1);
    const fog = clamp(value('fog') / 100, 0, 1);
    const occlusion = clamp(value('occlusion') / 100, 0, 1);
    const light = $('light')?.value || 'day';
    const brightness = light === 'night' ? .23 : light === 'dusk' ? .58 : 1;
    const altitude = clamp(value('altitude'), 15, 120);
    const speed = clamp(value('speed'), 0, 12);
    const scale = 1 + (120 - altitude) / 105 * .30;
    const pace = .5 + speed / 12 * 1.5;
    Object.values(videos).forEach(video => {
      video.style.transform = 'scale(' + scale.toFixed(3) + ')';
      video.playbackRate = pace;
    });
    badge.textContent = '10 S SOURCE · PREVIEW ' + pace.toFixed(2) + '× · DIGITAL CROP ' + scale.toFixed(2) + '×';
    videos.rgb.style.filter = 'brightness(' + brightness + ') contrast(' + (1 - fog * .32) + ') blur(' + (occlusion * 1.5 + fog * .7).toFixed(2) + 'px)';
    videos.thermal.style.filter = 'contrast(' + (1 - fog * .12) + ') blur(' + (occlusion * 1.2).toFixed(2) + 'px)';
    picture.querySelectorAll('.sar-video-lane').forEach(lane => {
      const thermal = lane.classList.contains('sar-video-thermal');
      lane.querySelector('.sar-video-haze').style.opacity = String(smoke * (thermal ? .26 : .7));
      lane.querySelector('.sar-video-fog').style.opacity = String(fog * (thermal ? .45 : .8));
      lane.querySelector('.sar-video-obscuration').style.opacity = String(occlusion * .55);
    });
  }
  async function loadHostedPair() {
    if (hostedChecked) return;
    hostedChecked = true;
    const files = { rgb: './assets/videos/sar-rgb.mp4', thermal: './assets/videos/sar-lwir.mp4' };
    const checks = await Promise.all(Object.entries(files).map(async ([channel, path]) => {
      try {
        const response = await fetch(path, { method: 'HEAD' });
        const type = response.headers.get('content-type') || '';
        return { channel, path, ok: response.ok && (type.includes('video/') || type.includes('octet-stream')) };
      } catch { return { channel, path, ok: false }; }
    }));
    for (const { channel, path, ok } of checks) {
      if (!ok || present[channel] || input[channel].files?.length) continue;
      videos[channel].src = path;
      videos[channel].load();
    }
    if (checks.every(entry => entry.ok)) report('GitHub-hosted RGB/LWIR files found. Loading synchronized pair automatically.');
    else report('Videos are not yet hosted in this repository. Use the file selectors or upload both MP4 files to assets/videos/ on GitHub.');
  }
  function acceptFile(channel, file) {
    if (!file) return;
    const validType = file.type === 'video/mp4' || /\.mp4$/i.test(file.name);
    if (!validType || file.size > 300 * 1024 * 1024) {
      report('Choose an MP4 smaller than 300 MB.'); input[channel].value = ''; return;
    }
    pause();
    if (urls[channel]) URL.revokeObjectURL(urls[channel]);
    present[channel] = false;
    urls[channel] = URL.createObjectURL(file);
    const video = videos[channel];
    video.src = urls[channel];
    video.load();
    report('Loaded ' + channel.toUpperCase() + ' locally: ' + file.name + '. No upload.');
    syncPicture();
  }
  Object.entries(input).forEach(([channel, element]) => element.addEventListener('change', () => acceptFile(channel, element.files?.[0])));
  Object.entries(videos).forEach(([channel, video]) => {
    video.addEventListener('loadedmetadata', () => {
      present[channel] = true;
      if (present.rgb && present.thermal) {
        if (pairedCompatible()) report('Synchronized RGB / LWIR pair ready. ' + timeLabel(duration()) + ' · ' + video.videoWidth + ' × ' + video.videoHeight + ' · local playback.');
        else report('WARNING: Duration or image size differs. Select a matching RGB/LWIR pair.');
      }
      syncPicture(); syncTransport(); effects();
    });
    video.addEventListener('error', () => {
      present[channel] = false;
      pause(); syncPicture();
      report('Could not decode ' + channel.toUpperCase() + '. Use H.264 MP4.');
    });
  });
  sourceBar.addEventListener('click', event => {
    const button = event.target.closest('[data-sar-source]');
    if (!button) return;
    source = button.dataset.sarSource;
    refreshSource();
  });
  stage.addEventListener('click', event => {
    const button = event.target.closest('[data-sar-view]');
    if (button) setView(button.dataset.sarView);
  });
  playButton.addEventListener('click', () => playing ? pause() : start());
  restartButton.addEventListener('click', () => { pause(); setTime(0); });
  position.addEventListener('input', () => setTime(Number(position.value) / 1000 * duration()));
  document.addEventListener('click', event => {
    if (event.target.closest('[data-domain]')) requestAnimationFrame(refreshSource);
    if (event.target.closest('[data-sensor]')) requestAnimationFrame(() => {
      if (source === 'video' && selectedDomain() && view !== 'split') {
        view = document.querySelector('[data-sensor].selected')?.dataset.sensor === 'THERMAL' ? 'thermal' : 'rgb';
        syncPicture();
      }
    });
  });
  const controlsChanged = () => { effects(); hideEndResults(); };
  document.addEventListener('input', controlsChanged);
  document.addEventListener('change', controlsChanged);
  document.addEventListener('judas:controls-updated', controlsChanged);
  const scanObserver = new MutationObserver(syncScan);
  scanObserver.observe($('progress'), {attributes: true, attributeFilter: ['style']});
  scanObserver.observe($('pause'), {attributes: true, attributeFilter: ['disabled'], childList: true});
  addEventListener('beforeunload', () => { scanObserver.disconnect(); pause(); Object.values(urls).forEach(url => {if (url) URL.revokeObjectURL(url);}); });
  refreshSource();
  syncPicture();
  effects();
})();

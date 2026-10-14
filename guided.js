/* Guided narration consumes completed application runs; it never invents results. */
(function (root) {
  'use strict';

  const percent = value => `${Math.round(value * 100)}%`;
  const stageNames = ['The question', 'Establish a baseline', 'Increase difficulty', 'Find the tested boundary', 'Compare like for like', 'Read the evidence'];
  const budgets = [5000, 8000, 16000, 7000, 16000, 8000];

  function makePlan(engine) {
    const baseline = engine.normalize({ ...engine.defaults, domain: 'SAR', model: 'A', sensor: 'RGB',
      altitude: 30, speed: 4, fov: 60, observationCap: 30, occlusion: 0, smoke: 0, fog: 0,
      light: 'day', seed: 42, minRecall: 0.8, maxFP: 1 });
    const sweep = engine.suite(baseline, 'occlusion');
    return { baseline, sweep, comparison: sweep.flatMap(config => [{ ...config, model: 'A' }, { ...config, model: 'B' }]) };
  }

  function describeBoundary(results) {
    const first = results.findIndex(result => result.status !== 'PASS');
    if (first < 0) return 'All completed levels met acceptance. A breaking point was not reached in this tested range.';
    const failed = results[first], previous = results[first - 1];
    return `First failed acceptance: ${failed.config.occlusion}% target occlusion, ${failed.tp}/${failed.persons.length} found (${percent(failed.recall)} recall), ${failed.fp} false alarms. ` +
      (previous ? `The preceding tested level, ${previous.config.occlusion}%, passed. ` : '') +
      'This is a tested boundary, not an exact physical limit. Occlusion is the only changing stressor.';
  }

  function describeComparison(results) {
    return ['A', 'B'].map(model => {
      const completed = results.filter(result => result.config.model === model);
      const failed = completed.find(result => result.status !== 'PASS');
      return `Model ${model}: ${failed ? `first failed acceptance at ${failed.config.occlusion}% occlusion` : 'no failed acceptance in the completed levels'}`;
    }).join('. ') + '. Both synthetic profiles see identical conditions and seeds; this demonstrates a comparison method, not a ranking of real products.';
  }

  function createController(api, ui = {}, suppliedClock = {}) {
    const engine = api.engine || root.JudasEngine;
    const clock = {
      now: () => root.performance ? root.performance.now() : Date.now(),
      setTimeout: (fn, delay) => root.setTimeout(fn, delay),
      clearTimeout: id => root.clearTimeout(id),
      isVisible: () => true,
      ...suppliedClock
    };
    let generation = 0, timer = null, waiting = null, lastTime = 0, stageElapsed = 0, skipRequested = false;
    let snapshot = { active: false, complete: false, visible: false, stage: 0, elapsed: 0, running: false,
      title: stageNames[0], message: '', detail: '', stages: stageNames.length, progress: 0 };
    const render = () => ui.render?.({ ...snapshot });
    const valid = token => token === generation && snapshot.active;
    function pulse() {
      if (!snapshot.active) return;
      const now = clock.now();
      if (clock.isVisible() && !api.getState?.().paused) {
        const delta = Math.max(0, now - lastTime);
        snapshot.elapsed += delta;
        stageElapsed += delta;
      }
      lastTime = now;
      snapshot.progress = Math.min(0.99, (snapshot.stage + Math.min(1, stageElapsed / budgets[snapshot.stage])) / stageNames.length);
      if (waiting && (stageElapsed >= budgets[snapshot.stage] || skipRequested)) {
        const release = waiting;
        waiting = null;
        release();
      }
      ui.time?.({ ...snapshot });
      timer = clock.setTimeout(pulse, 250);
    }
    function stage(index, message, detail = '') {
      stageElapsed = 0;
      skipRequested = false;
      snapshot = { ...snapshot, stage: index, title: stageNames[index], message, detail, running: false };
      render();
    }
    function hold(token) {
      if (!valid(token) || skipRequested || stageElapsed >= budgets[snapshot.stage]) return Promise.resolve();
      return new Promise(resolve => { waiting = resolve; });
    }
    async function run(token, configs, label, kind) {
      snapshot.running = true;
      render();
      const results = await api.run(configs, label, kind);
      if (!valid(token)) return null;
      snapshot.running = false;
      if (!Array.isArray(results) || results.length !== configs.length) throw new Error('The scan ended before all planned tests completed. Completed results remain in the session report.');
      return results;
    }
    function releaseTimers() {
      clock.clearTimeout(timer);
      timer = null;
      if (waiting) { const release = waiting; waiting = null; release(); }
    }
    function cancel(hide = false) {
      const wasActive = snapshot.active;
      generation += 1;
      releaseTimers();
      snapshot = { ...snapshot, active: false, running: false, visible: !hide && snapshot.visible,
        title: snapshot.complete ? 'Demo complete' : 'Demo stopped',
        message: snapshot.complete ? snapshot.message : 'Completed tests stay in your session. You can continue exploring or restart the guided demo.', detail: '' };
      if (wasActive) api.stopRun();
      api.setGuidedBusy(false);
      render();
    }
    async function start() {
      // Invalidate before stopping: a completed old promise cannot start its next scan.
      cancel(true);
      const token = ++generation;
      const plan = makePlan(engine);
      const geometry = engine.geometry(plan.baseline);
      const observation = `${geometry.effectiveObservationTime.toFixed(2)} s`;
      snapshot = { ...snapshot, active: true, complete: false, visible: true, elapsed: 0, progress: 0 };
      api.stopRun();
      api.setGuidedBusy(true);
      api.showView('bench');
      api.configure(plan.baseline);
      stage(0, 'Where does a working detector stop being reliable?',
        'A woodland search, three reference subjects, two synthetic model profiles. This guided run takes about 60 seconds.');
      lastTime = clock.now();
      pulse();
      ui.reveal?.();
      try {
        await hold(token);
        if (!valid(token)) return;
        stage(1, 'Start with a physically defined baseline.', `At 30 m and 4 m/s, the assumed 60° camera provides ${observation} of target visibility. The 30 s observation cap does not extend it. Acceptance: at least 80% recall and no more than one false alarm.`);
        ui.focus?.('field');
        const baseline = await run(token, [plan.baseline], 'Guided · SAR baseline', 'guided');
        if (!valid(token)) return;
        const base = baseline[0];
        snapshot.message = `Baseline: ${base.tp}/${base.persons.length} reference subjects found, ${percent(base.recall)} recall, ${base.fp} false alarms — ${base.status}.`;
        snapshot.detail = `Effective observation: ${observation}. ${base.status === 'PASS' ? 'The detector passes these configured conditions.' : 'The detector does not meet acceptance under these configured conditions.'} This synthetic result says nothing about conditions not yet tested.`;
        render();
        await hold(token);
        if (!valid(token)) return;
        stage(2, 'Now hide more of each subject.', `Six occlusion levels, 0–100%. Altitude, speed, camera FOV, observation cap, light and seed stay fixed. Geometry therefore keeps effective observation at ${observation}; only occlusion changes.`);
        const sweep = await run(token, plan.sweep, 'Guided · occlusion sweep', 'guided');
        if (!valid(token)) return;
        const last = sweep.at(-1);
        snapshot.message = `At the hardest tested level: ${last.tp}/${last.persons.length} found, ${last.fn} missed, ${last.fp} false alarms.`;
        snapshot.detail = 'These are deterministic simulated results. More difficulty is visible in both the scene and the measured recall.';
        render();
        await hold(token);
        if (!valid(token)) return;
        stage(3, 'A failure becomes a testable validation priority.', describeBoundary(sweep));
        ui.focus?.('curve');
        await hold(token);
        if (!valid(token)) return;
        stage(4, 'Would another model fail under the same conditions?', 'Model A and Model B run at every identical occlusion level. No changing seeds or easier scenes for one profile.');
        ui.focus?.('field');
        const comparison = await run(token, plan.comparison, 'Guided · matched occlusion comparison', 'comparison');
        if (!valid(token)) return;
        snapshot.message = 'A matched comparison makes different failure patterns visible.';
        snapshot.detail = describeComparison(comparison);
        render();
        await hold(token);
        if (!valid(token)) return;
        api.showView('report');
        stage(5, 'Your AI Stress Report turns a demo into a next experiment.',
          'Review the tested boundary, missed subjects, observation geometry and matched model comparison. Higher altitude can increase dwell time while reducing target size; more time does not guarantee detection. Next: repeat on held-out, annotated field data. Exports preserve the evidence.');
        ui.reveal?.();
        await hold(token);
        if (!valid(token)) return;
        snapshot = { ...snapshot, active: false, complete: true, progress: 1, title: 'Demo complete — evidence before deployment',
          message: 'You saw where the synthetic detector first missed its acceptance target and how another profile behaved on the same tests.',
          detail: 'The commercial goal: find unfamiliar failure conditions before operational use. This public demo is not independent blind validation. Explore the report or evaluate your own prediction files.' };
        releaseTimers();
        api.setGuidedBusy(false);
        render();
      } catch (error) {
        if (!valid(token)) return;
        cancel(false);
        snapshot = { ...snapshot, title: 'Demo paused by an incomplete test', message: error.message || 'The guided test could not complete.', detail: 'No missing results were filled in. Restart to try again.' };
        render();
      }
    }
    function skip() {
      if (!snapshot.active) return;
      skipRequested = true;
      if (snapshot.running) {
        snapshot.detail = 'Narration skipped. The current tests will finish so the report contains completed results only.';
        render();
      }
      if (waiting) { const release = waiting; waiting = null; release(); }
    }
    return { start, restart: start, cancel, skip, getState: () => ({ ...snapshot }) };
  }

  function mount(api) {
    const document = root.document;
    const panel = document.getElementById('guided-demo'), launch = document.getElementById('guided-start');
    if (!panel || !launch) return null;
    panel.classList.add('guided-demo');
    panel.hidden = true;
    panel.innerHTML = '<div class="guided-copy"><div class="guided-meta"><span>GUIDED DEMO · SYNTHETIC RESULTS</span><span id="guided-position"></span></div><div class="guided-narration" aria-live="polite" aria-atomic="true"><h2 id="guided-title"></h2><p id="guided-message"></p><p id="guided-detail"></p></div></div><div class="guided-actions"><button type="button" class="button primary" id="guided-skip">Next step →</button><button type="button" class="button subtle" id="guided-restart">Restart</button><button type="button" class="button subtle" id="guided-end">End demo</button></div><div class="guided-track"><div id="guided-progress"></div></div>';
    const element = id => document.getElementById(id);
    function time(state) {
      element('guided-position').textContent = `${state.complete ? 'COMPLETE' : `STEP ${state.stage + 1}/${state.stages}`} · ${Math.floor(state.elapsed / 1000)}s`;
      element('guided-progress').style.width = `${state.progress * 100}%`;
    }
    const reducedMotion = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const reveal = () => panel.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'instant' : 'smooth' });
    const controller = createController(api, {
      time, reveal,
      focus: id => document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'instant' : 'smooth' }),
      render(state) {
        panel.hidden = !state.visible;
        panel.dataset.active = String(state.active);
        ['title', 'message', 'detail'].forEach(key => element(`guided-${key}`).textContent = state[key]);
        element('guided-skip').hidden = !state.active;
        element('guided-skip').textContent = state.running ? 'Skip narration →' : 'Next step →';
        element('guided-end').textContent = state.active ? 'End demo' : 'Close guide';
        launch.disabled = state.active;
        time(state);
      }
    }, { isVisible: () => document.visibilityState !== 'hidden' });
    launch.addEventListener('click', () => { void controller.start(); });
    element('guided-skip').addEventListener('click', controller.skip);
    element('guided-restart').addEventListener('click', () => { void controller.restart(); });
    element('guided-end').addEventListener('click', () => controller.cancel(true));
    return controller;
  }

  const moduleApi = Object.freeze({ mount, createController, makePlan, describeBoundary, describeComparison });
  root.JudasGuided = moduleApi;
  if (typeof module === 'object' && module.exports) module.exports = moduleApi;
})(typeof globalThis !== 'undefined' ? globalThis : this);

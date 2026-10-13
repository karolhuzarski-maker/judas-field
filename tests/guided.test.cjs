'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine.js');
const guided = require('../guided.js');

function harness() {
  let now = 0, id = 0, visible = true, paused = false, pending = null, busy = false;
  const timers = new Map(), calls = [], snapshots = [], history = [], views = [];
  const clock = { now: () => now, isVisible: () => visible,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, { fn, at: now + delay }); return key; },
    clearTimeout(key) { timers.delete(key); } };
  const api = { engine,
    getState: () => ({ running: !!pending, paused, history }),
    configure(config) { calls.push({ type: 'configure', config }); },
    showView(view) { views.push(view); },
    setGuidedBusy(value) { busy = value; },
    stopRun() { if (pending) { clock.clearTimeout(pending.timer); const release = pending.resolve; pending = null; release([]); } },
    run(configs, label, kind) {
      assert.equal(pending, null, 'guided scans must never overlap');
      calls.push({ type: 'run', configs, label, kind });
      return new Promise(resolve => {
        pending = { resolve, timer: clock.setTimeout(() => {
          const results = configs.map(engine.simulate);
          history.push(...results);
          pending = null;
          resolve(results);
        }, configs.length === 1 ? 3000 : configs.length * 1200) };
      });
    }
  };
  const controller = guided.createController(api, { render: snapshot => snapshots.push(snapshot) }, clock);
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      for (let tick = 0; tick < 12; tick++) await Promise.resolve();
      const entry = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at;
      timers.delete(entry[0]);
      entry[1].fn();
    }
    now = end;
    for (let tick = 0; tick < 12; tick++) await Promise.resolve();
  }
  return { controller, api, clock, advance, calls, snapshots, history, views,
    get busy() { return busy; }, get pendingTimers() { return timers.size; },
    visible(value) { visible = value; }, paused(value) { paused = value; } };
}

test('guided plan changes only occlusion and pairs both models on identical settings', () => {
  const plan = guided.makePlan(engine);
  assert.equal(plan.baseline.domain, 'SAR');
  assert.equal(engine.simulate(plan.baseline).status, 'PASS');
  assert.equal(plan.sweep.length, 6);
  for (const config of plan.sweep) assert.deepEqual({ ...config, occlusion: 0 }, plan.baseline);
  for (let index = 0; index < plan.comparison.length; index += 2) {
    assert.equal(plan.comparison[index].model, 'A');
    assert.equal(plan.comparison[index + 1].model, 'B');
    assert.deepEqual({ ...plan.comparison[index], model: 'B' }, plan.comparison[index + 1]);
  }
});

test('full demo finishes in the promised window, using actual results and opening the report', async () => {
  const h = harness();
  const finished = h.controller.start();
  await h.advance(61000);
  await finished;
  const state = h.controller.getState();
  assert.equal(state.complete, true);
  assert.equal(state.active, false);
  assert.ok(state.elapsed >= 45000 && state.elapsed <= 75000, `duration ${state.elapsed}`);
  assert.equal(h.history.length, 19);
  assert.equal(h.calls.filter(call => call.type === 'run').length, 3);
  assert.equal(h.calls.filter(call => call.type === 'run').at(-1).kind, 'comparison');
  assert.deepEqual(h.views, ['bench', 'report']);
  assert.equal(h.busy, false);
  assert.equal(h.pendingTimers, 0);
  assert.ok(h.snapshots.some(s => s.detail.includes('25% target occlusion, 2/3 found')));
  assert.ok(h.snapshots.some(s => s.detail.includes('Model B: first failed acceptance at 50% occlusion')));
  assert.ok(h.history.every(result => JSON.stringify(result) === JSON.stringify(engine.simulate(result.config))));
});

test('skip advances narration but does not manufacture results from an unfinished scan', async () => {
  const h = harness();
  const finished = h.controller.start();
  h.controller.skip();
  await h.advance(1);
  assert.equal(h.controller.getState().stage, 1);
  h.controller.skip();
  await h.advance(2000);
  assert.equal(h.history.length, 0);
  assert.equal(h.controller.getState().stage, 1);
  assert.equal(h.controller.getState().running, true);
  await h.advance(1001);
  assert.equal(h.history.length, 1);
  assert.equal(h.controller.getState().stage, 2);
  h.controller.cancel();
  await finished;
});

test('cancel during a scan unlocks controls and blocks stale continuations', async () => {
  const h = harness();
  const finished = h.controller.start();
  await h.advance(5100);
  h.controller.cancel();
  await h.advance(80000);
  await finished;
  assert.equal(h.controller.getState().active, false);
  assert.equal(h.controller.getState().complete, false);
  assert.equal(h.busy, false);
  assert.equal(h.history.length, 0);
  assert.equal(h.calls.filter(call => call.type === 'run').length, 1);
  assert.deepEqual(h.views, ['bench']);
  assert.equal(h.pendingTimers, 0);
});

test('restart during a scan abandons the old flow and completes exactly one new flow', async () => {
  const h = harness();
  const previous = h.controller.start();
  await h.advance(5100);
  const current = h.controller.restart();
  await h.advance(61000);
  await Promise.all([previous, current]);
  assert.equal(h.controller.getState().complete, true);
  assert.equal(h.history.length, 19);
  assert.equal(h.calls.filter(call => call.type === 'run').length, 4);
  assert.deepEqual(h.views, ['bench', 'bench', 'report']);
  assert.equal(h.pendingTimers, 0);
});

test('hidden or paused time does not consume narration', async () => {
  const h = harness();
  const finished = h.controller.start();
  h.visible(false);
  await h.advance(20000);
  assert.equal(h.controller.getState().elapsed, 0);
  assert.equal(h.calls.filter(call => call.type === 'run').length, 0);
  h.visible(true);
  h.paused(true);
  await h.advance(10000);
  assert.equal(h.controller.getState().elapsed, 0);
  h.paused(false);
  await h.advance(61000);
  await finished;
  assert.equal(h.controller.getState().complete, true);
  assert.ok(h.controller.getState().elapsed < 75000);
});

test('incomplete run never produces a success or a fabricated report', async () => {
  const h = harness();
  h.api.run = async () => [];
  const finished = h.controller.start();
  await h.advance(6000);
  await finished;
  assert.equal(h.controller.getState().complete, false);
  assert.equal(h.controller.getState().active, false);
  assert.match(h.controller.getState().message, /before all planned tests completed/);
  assert.equal(h.history.length, 0);
  assert.deepEqual(h.views, ['bench']);
  assert.equal(h.busy, false);
});

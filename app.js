/* Buildless browser UI. Completed results are immutable session snapshots. */
(() => {
  'use strict';
  const E = globalThis.JudasEngine, S = globalThis.JudasScene;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = n => `${Math.round(n * 100)}%`;
  const secs = n => n == null ? '—' : `${n.toFixed(1)} <small>s</small>`;
  const badge = s => `<span class="badge ${s.toLowerCase()}">${s}</span>`;
  const state = { config: {...E.defaults}, result: null, playbackResult: null, history: [], series: [], seriesLabel: '', running: false, paused: false, progress: 0, queue: [], queueIndex: 0, elapsed: 0, lastFrame: 0, duration: 6000, stopAtFailure: false, view: 'bench', sessionId: new Date().toISOString(), sequence: 0, raf: 0 };
  const ranges = [
    ['altitude','Observation altitude',15,120,1,'m','15 m','120 m'],
    ['speed','Fly-by speed',0,12,1,'m/s','HOVER','12 m/s'],
    ['occlusion','Target occlusion',0,100,1,'%','CLEAR','OBSCURED'],
    ['smoke','Smoke density',0,100,1,'%','NONE','DENSE'],
    ['fog','Fog / mist',0,100,1,'%','CLEAR','DENSE'],
    ['observation','Observation window',2,30,1,'s','2 s','30 s']
  ];
  $('sliders').innerHTML = ranges.map(([key,label,min,max,step,unit,left,right]) => `<div class="slider-control"><label for="${key}">${label}<output id="${key}-value" for="${key}"></output></label><input type="range" id="${key}" min="${min}" max="${max}" step="${step}" value="${state.config[key]}"><div class="range-labels"><span>${left}</span><span>${right}</span></div></div>`).join('');
  function announce(message) { $('announcement').textContent = message; }
  function syncControls() {
    ranges.forEach(([key,,,,,unit]) => { $(key).value=state.config[key]; $(`${key}-value`).innerHTML=`${state.config[key]} <small>${unit}</small>`; });
    ['model','light','seed','minRecall','maxFP'].forEach(key => $(key).value=state.config[key]);
    document.querySelectorAll('[data-domain]').forEach(b => {const active=b.dataset.domain===state.config.domain;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
    document.querySelectorAll('[data-sensor]').forEach(b => {const active=b.dataset.sensor===state.config.sensor;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active);});
  }
  function setBusy(busy) {
    state.running = busy;
    const locked=busy||!!state.guidedBusy;
    ['baseline','run-top','run','auto','breaking','compare','model','preset'].forEach(id => $(id).disabled=locked);
    $('control-fields').disabled=locked;
    $('reset').disabled=!!state.guidedBusy;
    document.querySelectorAll('[data-domain]').forEach(b => b.disabled=locked);
    document.querySelectorAll('button[data-view]').forEach(b => b.disabled=!!state.guidedBusy);
    $('pause').disabled=!busy||!!state.guidedBusy;
    $('pause').textContent=state.paused?'▶ Resume':'Ⅱ Pause';
  }
  function renderScene() {
    $('field').innerHTML = S.render(state.config,state.running?state.playbackResult:state.result,{groundTruth:$('ground-truth').checked,progress:state.progress,playback:state.running,paused:state.paused,running:state.running&&!state.paused});
    $('scene-title').textContent=E.domains[state.config.domain].title;
    $('scene-meta').textContent=`${state.config.sensor} / ${state.config.altitude} M / ${state.config.speed} M/S · SEED ${state.config.seed}`;
  }
  function metric(label,value,foot) {return `<div class="metric"><span class="metric-label">${label}</span><span class="metric-value">${value}</span><span class="metric-foot">${foot}</span></div>`;}
  function renderOutput() {
    const r=state.result;
    $('result-status').className=`badge ${r?r.status.toLowerCase():'neutral'}`;
    $('result-status').textContent=r?r.status:'AWAITING TEST';
    $('metrics').innerHTML = [
      metric('TRUE POSITIVES',r?`${r.tp}<small> / ${r.persons.length}</small>`:'—','PEOPLE DETECTED'),
      metric('RECALL',r?pct(r.recall):'—',r?`${r.fn} MISSED / ${pct(r.config.minRecall)} REQUIRED`:'TP / (TP + FN)'),
      metric('PRECISION',r?pct(r.precision):'—',r?`${r.fp} FALSE ALARM${r.fp===1?'':'S'}`:'TP / (TP + FP)'),
      metric('FIRST DETECTION',r?secs(r.ttfd):'—',r&&r.ttfd==null?'NOT DETECTED':'OBSERVATION ELAPSED'),
      metric('OBSERVATION',r?`${r.config.observation}<small> s</small>`:'—','CONFIGURED WINDOW'),
      metric('ACTIONABLE INFO',r?secs(r.ttai):'—',r&&r.ttai==null?'NOT ACHIEVED':'INCLUDES 10 s TRANSIT')
    ].join('');
    $('targets').innerHTML=r?r.persons.map(p=>`<span class="target ${p.detected?'detected':'missed'}">${esc(p.id)} · ${p.detected?`DETECTED ${pct(p.confidence)}`:'MISSED'}</span>`).join('')+r.falsePositives.map(p=>`<span class="target missed">${esc(p.id)} · FALSE ALARM</span>`).join(''):'';
    $('explainer').innerHTML=r?r.explanations.map((p,i)=>`<p class="observation"><span>0${i+1}</span>${esc(p)}</p>`).join(''):`<div class="empty">The test will identify the strongest configured stressors and show what prevented the information threshold from being reached.<br><br>Start with a baseline. Then turn up the pressure.</div>`;
  }
  function chartMarkup(runs) {
    const W=650,H=210,L=43,R=18,T=22,B=35;
    const models=[...new Set(runs.map(r=>r.config.model))];
    const groups=models.map(model=>({model,runs:runs.filter(r=>r.config.model===model)}));
    const count=Math.max(6,...groups.map(g=>g.runs.length));
    const x=i=>L+i*(W-L-R)/(count-1),y=n=>T+(1-n)*(H-T-B);
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Recall by test step. ${runs.length?runs.map(r=>`Model ${r.config.model} step ${r.step}: ${pct(r.recall)}`).join('; '):'No tests yet.'}">`;
    [0,.25,.5,.75,1].forEach(n=>{svg+=`<line x1="${L}" x2="${W-R}" y1="${y(n)}" y2="${y(n)}" stroke="#2a3842" stroke-dasharray="3 5"/><text x="${L-9}" y="${y(n)+3}" text-anchor="end" fill="#6d8493" font-family="Consolas,monospace" font-size="9">${n*100}%</text>`;});
    const threshold=runs.length?runs[0].config.minRecall:state.config.minRecall;
    svg+=`<line x1="${L}" x2="${W-R}" y1="${y(threshold)}" y2="${y(threshold)}" stroke="#a97543" stroke-dasharray="6 5"/><text x="${W-R}" y="${y(threshold)-6}" fill="#d4a469" font-family="Consolas,monospace" font-size="8" text-anchor="end">ACCEPTANCE ${pct(threshold)}</text>`;
    for(let i=0;i<count;i++)svg+=`<text x="${x(i)}" y="${H-12}" fill="#6d8493" font-family="Consolas,monospace" text-anchor="middle" font-size="9">${String(i+1).padStart(2,'0')}</text>`;
    groups.forEach(({model,runs})=>{const color=model==='A'?'#e55762':'#74cccd';svg+=`<polyline points="${runs.map((r,i)=>`${x(i)},${y(r.recall)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;runs.forEach((r,i)=>{svg+=`<circle cx="${x(i)}" cy="${y(r.recall)}" r="4" fill="${color}" stroke="#17232b" stroke-width="2"><title>Model ${model}, step ${i+1}: ${pct(r.recall)} recall, ${r.fp} FP, ${r.status}</title></circle>`;});});
    if(!runs.length)svg+=`<text x="${W/2}" y="${H/2+20}" text-anchor="middle" fill="#8fa4b1" font-family="Consolas,monospace" font-size="11">AWAITING STRESS SUITE</text>`;
    groups.forEach(({model,runs})=>{const first=E.firstBreakingPoint(runs);if(first<0)return;const r=runs[first];svg+=`<line x1="${x(first)}" x2="${x(first)}" y1="${T}" y2="${H-B}" stroke="#e7b36b" stroke-dasharray="3 4" opacity=".5"/><circle cx="${x(first)}" cy="${y(r.recall)}" r="8" fill="none" stroke="#e7b36b" stroke-width="2"><title>Model ${model}: first tested non-pass, step ${first+1}, ${r.config.altitude}m, ${r.config.occlusion}% occlusion, ${r.fp} false positives</title></circle>`;});
    svg+='</svg>';
    if(runs.length)svg+=`<div class="mono" style="padding:0 0 10px">${models.map(m=>`<span style="color:${m==='A'?'#e55762':'#74cccd'}">● MODEL ${m}</span>`).join(' &nbsp; ')} &nbsp; ${esc(state.seriesLabel)} · ${runs[0].config.domain} · SEED ${runs[0].config.seed}</div>`;
    return svg;
  }
  function renderCurve() {
    $('curve').innerHTML=chartMarkup(state.series);
    if(!state.series.length){$('breaking-label').textContent='Run an automatic suite to reveal the first threshold crossing.';return;}
    const models=[...new Set(state.series.map(r=>r.config.model))];
    $('breaking-label').innerHTML=models.map(model=>{const runs=state.series.filter(r=>r.config.model===model),i=E.firstBreakingPoint(runs);return i<0?`Model ${model}: ${state.running?'no threshold crossing in completed steps.':'<b>Not reached in tested range.</b>'}`:`Model ${model}: <b>first tested non-pass at step ${i+1}</b> — ${pct(runs[i].recall)} recall, ${runs[i].fp} FP. ${runs[i].config.altitude}m · ${runs[i].config.speed}m/s · ${runs[i].config.occlusion}% occlusion.<br>${esc(runs[i].explanations[1])}`;}).join('<br>')+'<br><span class="boundary-note">A boundary among tested conditions, not an exact physical failure limit.</span>';
  }
  function tableMarkup(runs,interactive=false) {
    if(!runs.length)return '<div class="empty">No completed tests yet. Your session results will appear here.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>RUN / DOMAIN</th><th>PROFILE / SENSOR</th><th>CONDITIONS</th><th>TP / FP / FN</th><th>RECALL</th><th>RESULT</th>${interactive?'<th>REPLAY</th>':''}</tr></thead><tbody>${runs.map(r=>`<tr><td>${String(r.runNumber).padStart(2,'0')} / ${r.config.domain}</td><td>${r.config.model} / ${r.config.sensor}</td><td>${r.config.altitude}m · ${r.config.speed}m/s · ${r.config.occlusion}% OCC</td><td>${r.tp} / ${r.fp} / ${r.fn}</td><td class="${r.status==='PASS'?'recall-good':''}">${pct(r.recall)}</td><td>${badge(r.status)}</td>${interactive?`<td><button class="text-button" data-history="${r.runNumber}" aria-label="Inspect run ${r.runNumber}">Inspect ↗</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
  }
  function renderHistory() {$('history').innerHTML=tableMarkup(state.history.slice(-8).reverse(),true);$('history-count').textContent=String(state.history.length).padStart(2,'0');$('report-count').textContent=state.history.length;}
  function reportData() {return {...E.exportReport(state.history),applicationVersion:'0.2.0',source:'SYNTHETIC MODEL DEMO',sessionId:state.sessionId,exportedAt:new Date().toISOString(),provenance:'AI-generated training imagery; manually annotated visible person extents; deterministic illustrative model profiles. Thermal imagery is synthetic and not radiometric. Confidence is an uncalibrated synthetic score. Environmental effects are illustrative, not a validated optical simulator.',lastSeries:{label:state.seriesLabel,runNumbers:state.series.map(r=>r.runNumber)}};}
  function renderReport() {
    ['download-json','download-csv','print'].forEach(id=>$(id).disabled=!state.history.length);
    if(!state.history.length){$('report-body').innerHTML='<div class="panel empty">No results yet. Run a baseline or an automatic suite in the test bench to build your report.</div>';return;}
    const report=reportData(),c=report.counts;
    const failed=state.history.filter(r=>r.status!=='PASS').sort((a,b)=>a.recall-b.recall||b.fp-a.fp);
    const worst=failed.slice(0,3),range=report.testedRange;
    const comparisonIds=[...new Set(state.history.filter(r=>r.kind==='comparison').map(r=>r.sequenceId))];
    const lastId=comparisonIds.at(-1),comparisonRuns=state.history.filter(r=>r.kind==='comparison'&&r.sequenceId===lastId);
    const pairedSteps=new Set(comparisonRuns.filter(r=>r.config.model==='A'&&comparisonRuns.some(other=>other.step===r.step&&other.config.model==='B')).map(r=>r.step));
    const matched=comparisonRuns.filter(r=>pairedSteps.has(r.step));
    const matchedGroups=['A','B'].map(model=>{const runs=matched.filter(r=>r.config.model===model);return {model,runs,mean:runs.length?runs.reduce((sum,r)=>sum+r.recall,0)/runs.length:0};});
    $('report-body').innerHTML=`<div class="report-identity"><span class="badge neutral">SYNTHETIC MODEL DEMO</span><p>Test ID: JF-${esc(state.sessionId)}<br>Generated ${esc(report.exportedAt)} · JUDAS FIELD 0.2.0 · ${state.history.length} completed runs</p></div><div class="metrics">${metric('COMPLETED RUNS',c.totalRuns,'CURRENT SESSION')}${metric('PERSON OBSERVATIONS',c.totalPersonObservations,'REPEATED SYNTHETIC TARGETS')}${metric('PASS',c.pass,'ACCEPTANCE MET')}${metric('DEGRADED',c.degraded,'PARTIAL DETECTION')}${metric('FAIL',c.fail,'ACCEPTANCE NOT MET')}${metric('POOLED RECALL',pct(c.recall),'DESCRIPTIVE ONLY')}</div>
      <div class="report-grid"><article class="panel report-card"><h2>Test conditions</h2><p>Domains: ${range.domain.join(', ')} · Seeds: ${range.seed.join(', ')}<br>Altitude: ${Math.min(...range.altitude)}–${Math.max(...range.altitude)} m · Fly-by: ${Math.min(...range.speed)}–${Math.max(...range.speed)} m/s<br>Occlusion: ${Math.min(...range.occlusion)}–${Math.max(...range.occlusion)}% · Smoke: ${Math.min(...range.smoke)}–${Math.max(...range.smoke)}% · Fog: ${Math.min(...range.fog)}–${Math.max(...range.fog)}%<br>Windows: ${range.observation.join(', ')} s · Sensors: ${range.sensor.join(', ')}<br>Recall thresholds: ${range.minRecall.map(pct).join(', ')} · FP limits: ${range.maxFP.join(', ')}</p></article><article class="panel report-card"><h2>First non-pass in session</h2>${report.firstBreakingPoint?`<p>Run ${report.firstBreakingPoint.runIndex+1} · ${report.firstBreakingPoint.config.domain} · Model ${report.firstBreakingPoint.config.model}<br>${report.firstBreakingPoint.config.altitude} m / ${report.firstBreakingPoint.config.speed} m/s / ${report.firstBreakingPoint.config.occlusion}% occlusion</p><br>${badge(report.firstBreakingPoint.status)}`:'<p>Not reached in tested range.</p>'}<p style="margin-top:10px">The first non-pass in chronological session order. Each suite’s boundary is shown in the curve below.</p></article></div>
      <h2 class="report-heading">Latest test series</h2><div class="panel report-card">${chartMarkup(state.series)}<p>${$('breaking-label').innerHTML}</p></div>
      <div class="report-grid"><article class="panel report-card"><h2>Model A vs B</h2>${matched.length?`<p>Latest matched comparison: ${matched[0].config.domain}, seed ${matched[0].config.seed}. ${matchedGroups[0].runs.length} completed A steps and ${matchedGroups[1].runs.length} completed B steps. Only completed A/B pairs are included.</p>${matchedGroups.map(g=>`<p>Model ${g.model}: ${pct(g.mean)} mean step recall · ${g.runs.filter(r=>r.status==='PASS').length}/${g.runs.length} passed</p>`).join('')}<p>Profiles are synthetic; these are descriptive results, not real model rankings.</p>`:'<p>Use “Compare models” to run both profiles on the exact same settings and seed.</p>'}</article><article class="panel report-card"><h2>RGB / thermal observations</h2>${Object.entries(report.bySensor).map(([sensor,g])=>`<p>${sensor}: ${g.runs} runs · ${pct(g.recall)} pooled recall · ${g.fp} false positives</p>`).join('')}<p>Session totals may contain different conditions. Use Sensor challenge for a paired sensor test.</p></article></div>
      <h2 class="report-heading">Worst failure cases</h2><div class="panel">${worst.length?tableMarkup(worst):'<div class="empty">No failed quality thresholds in the completed tests.</div>'}</div>
      <h2 class="report-heading">Next validation priorities</h2><div class="panel report-card"><ul>${worst.length?[...new Set(worst.map(r=>r.explanations[1]))].map(e=>`<li>${esc(e)}</li>`).join(''):'<li>Expand the tested range and add held-out real field observations. Passing this demo does not validate a real model.</li>'}</ul></div>
      <h2 class="report-heading">Complete session log</h2><div class="panel">${tableMarkup(state.history)}</div>
      <div class="report-warning"><b>SIMULATED RESULTS — synthetic: true</b><br>${esc(report.provenance)}<br>No real AI inference. ${esc(E.limitations[2])}<br>Transit: 120 m / 12 m/s = 10 s. TTAI = transit + time to required stable detections + profile processing. It is unavailable when thresholds fail.<br>Blind benchmark is planned and not active. No diagnosis, triage, treatment recommendations or certification. Imported model predictions have their own report in Evaluate your model.</div>`;
  }
  function refresh(){syncControls();renderScene();renderOutput();renderCurve();renderHistory();if(state.view==='report')renderReport();}
  function simulateScene(config) {
    const result=E.simulate(config),reference=globalThis.JudasScenarios?.scenarios[config.domain];
    if(!reference)return result;
    return {...result,source:'SYNTHETIC MODEL DEMO',scenarioId:reference.id,coordinateSystem:'normalized_xywh',reference:{width:reference.width,height:reference.height,image:config.sensor==='THERMAL'?reference.thermal:reference.rgb,provenance:reference.provenance},confidenceMeaning:'Uncalibrated synthetic model score',persons:result.persons.map(person=>{const annotation=reference.targets.find(t=>t.id===person.id);return annotation?{...person,bbox:[...annotation.bbox],x:(annotation.bbox[0]+annotation.bbox[2]/2)*100,y:(annotation.bbox[1]+annotation.bbox[3]/2)*100}:person;}),falsePositives:result.falsePositives.map(fp=>({...fp,bbox:[fp.x/100-.018,fp.y/100-.025,.036,.05]}))};
  }
  function settleRun(){const resolve=state.resolveRun;state.resolveRun=null;if(resolve)resolve(state.series.slice());}
  function stopRun(){cancelAnimationFrame(state.raf);state.paused=false;setBusy(false);settleRun();$('run-status').textContent='TEST STOPPED';$('run-detail').textContent='Only completed tests are retained in the report.';renderScene();}
  function setConfig(key,value){if(state.running)return;state.config=E.normalize({...state.config,[key]:value});state.result=null;state.playbackResult=null;state.progress=0;$('progress').style.width='0%';$('run-status').textContent='CONFIGURATION UPDATED';$('run-detail').textContent='Scan the current scene. Fly-by speed controls the scan pace.';syncControls();renderScene();renderOutput();}
  function playbackDuration(config,quick=false) {
    // Visual timing only: a finite hover sweep, then progressively faster fly-bys.
    // Scoring and detection times still use the configured observation window.
    const speed=Math.max(0,Math.min(12,Number(config.speed)||0));
    return 6000/(1+speed/4)*(quick?0.4:1);
  }
  function start(configs,label,kind='suite',stop=false) {
    if(state.running)return Promise.resolve([]);
    state.sequence++;state.queue=configs.map(c=>({...c}));state.queueIndex=0;state.series=[];state.seriesLabel=label;state.stopAtFailure=stop;state.kind=kind;state.paused=false;state.elapsed=0;state.lastFrame=0;state.lastPaint=0;state.result=null;state.config={...state.queue[0]};state.duration=playbackDuration(state.config,state.queue.length>1);state.progress=0;state.playbackResult=simulateScene(state.config);
    const completion=new Promise(resolve=>state.resolveRun=resolve);
    setBusy(true);refresh();announce(`${label} started.`);state.raf=requestAnimationFrame(tick);
    return completion;
  }
  function tick(now) {
    if(!state.running)return;
    const delta=state.lastFrame?Math.max(0,now-state.lastFrame):0;state.lastFrame=now;
    if(!state.paused){state.elapsed+=delta;state.progress=Math.min(1,state.elapsed/state.duration);$('progress').style.width=`${state.progress*100}%`;$('run-status').textContent=`${state.seriesLabel.toUpperCase()} · ${state.queueIndex+1}/${state.queue.length}`;$('run-detail').textContent=`Model ${state.config.model} · ${state.config.observation} s observation · ${state.config.speed===0?'hover scan':state.config.speed+' m/s fly-by'}${state.queue.length>1?' · quick preview':''}`;
      if(!state.lastPaint||now-state.lastPaint>32||state.progress===1){renderScene();state.lastPaint=now;}
      if(state.progress>=1){const result={...state.playbackResult,runNumber:state.history.length+1,recordedAt:new Date().toISOString(),sequenceId:state.sequence,step:state.kind==='comparison'?Math.floor(state.queueIndex/2)+1:state.queueIndex+1,kind:state.kind,plan:state.seriesLabel};state.result=result;state.history.push(result);state.series.push(result);state.queueIndex++;refresh();
        if(state.queueIndex>=state.queue.length||(state.stopAtFailure&&result.status!=='PASS')){setBusy(false);$('run-status').textContent=state.stopAtFailure&&result.status!=='PASS'?'BREAKING POINT FOUND':'TEST COMPLETE';$('run-detail').textContent=`${state.series.length} completed run${state.series.length===1?'':'s'} · ${result.tp}/${result.persons.length} people detected in last run`;renderCurve();renderScene();announce(`${state.seriesLabel} complete. ${result.status}. ${result.tp} of ${result.persons.length} detected.`);if(state.view==='report')renderReport();settleRun();return;}
        state.elapsed=0;state.progress=0;state.config={...state.queue[state.queueIndex]};state.duration=playbackDuration(state.config,state.queue.length>1);state.result=null;state.playbackResult=simulateScene(state.config);$('progress').style.width='0%';syncControls();renderScene();renderOutput();}
    }
    state.raf=requestAnimationFrame(tick);
  }
  function showView(view) {state.view=view;['bench','report','protocol','evaluate'].forEach(v=>$(`view-${v}`).hidden=v!==view);document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(document.body?.dataset)document.body.dataset.view=view;if(view==='report')renderReport();window.scrollTo({top:0,behavior:'instant'});}
  ranges.forEach(([key])=>$(key).addEventListener('input',e=>setConfig(key,+e.target.value)));
  ['model','light','seed','minRecall','maxFP'].forEach(key=>$(key).addEventListener('change',e=>setConfig(key,['seed','minRecall','maxFP'].includes(key)?+e.target.value:e.target.value)));
  document.querySelectorAll('[data-domain]').forEach(b=>b.addEventListener('click',()=>{setConfig('domain',b.dataset.domain);announce(`${b.dataset.domain} scenario selected.`);}));
  document.querySelectorAll('[data-sensor]').forEach(b=>b.addEventListener('click',()=>setConfig('sensor',b.dataset.sensor)));
  document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  document.querySelectorAll('.wordmark,.brand-mark').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showView('bench');}));
  $('ground-truth').addEventListener('change',renderScene);
  ['run-top','run'].forEach(id=>$(id).addEventListener('click',()=>start([state.config],'Current scene','manual')));
  $('baseline').addEventListener('click',()=>start([{...E.defaults,domain:state.config.domain,model:state.config.model,seed:state.config.seed,minRecall:state.config.minRecall,maxFP:state.config.maxFP}],'Baseline','baseline'));
  function chosenSuite(){return E.suite(state.config,$('preset').value);}
  function planName(){return $('preset').selectedOptions[0].text;}
  $('auto').addEventListener('click',()=>start(chosenSuite(),planName()));
  $('breaking').addEventListener('click',()=>start(chosenSuite(),planName(),'breaking',true));
  $('compare').addEventListener('click',()=>start(chosenSuite().flatMap(c=>[{...c,model:'A'},{...c,model:'B'}]),`A/B · ${planName()}`,'comparison'));
  $('pause').addEventListener('click',()=>{if(!state.running)return;state.paused=!state.paused;$('pause').textContent=state.paused?'▶ Resume':'Ⅱ Pause';if(state.paused)$('run-status').textContent='OBSERVATION PAUSED';renderScene();announce(state.paused?'Test paused.':'Test resumed.');});
  $('reset').addEventListener('click',()=>{stopRun();state.config={...E.defaults,domain:state.config.domain};state.result=null;state.playbackResult=null;state.queue=[];state.series=[];state.progress=0;state.elapsed=0;$('progress').style.width='0%';$('run-status').textContent='READY TO OBSERVE';$('run-detail').textContent='Controls reset. Completed session history is retained.';refresh();announce('Test stopped and controls reset. History retained.');});
  $('history').addEventListener('click',e=>{const b=e.target.closest('[data-history]');if(!b||state.running)return;const r=state.history.find(r=>r.runNumber===+b.dataset.history);state.config={...r.config};state.result=r;state.playbackResult=null;state.progress=0;$('progress').style.width='0%';$('run-status').textContent=`INSPECTING RUN ${r.runNumber}`;$('run-detail').textContent='Saved configuration and simulated output.';syncControls();renderScene();renderOutput();$('field').scrollIntoView({block:'center',behavior:'smooth'});});
  function download(text,type,extension){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`judas-field-synthetic-${new Date().toISOString().slice(0,10)}.${extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce(`${extension.toUpperCase()} report downloaded.`);}
  $('download-json').addEventListener('click',()=>download(JSON.stringify(reportData(),null,2),'application/json','json'));
  $('download-csv').addEventListener('click',()=>{const report=reportData();const fields=['synthetic','runNumber','recordedAt','sequenceId','step','kind','plan',...Object.keys(E.defaults),'tp','fp','fn','precision','recall','ttfd','transitTime','ttai','status','difficulty','persons','falsePositives','source','applicationVersion','scenarioId','coordinateSystem','reference','confidenceMeaning','provenance'];const cell=v=>`"${String(v??'').replace(/"/g,'""')}"`;const rows=state.history.map(r=>{const flat={...r,...r.config,persons:JSON.stringify(r.persons),falsePositives:JSON.stringify(r.falsePositives),source:r.source||report.source,applicationVersion:report.applicationVersion,reference:r.reference?JSON.stringify(r.reference):'',confidenceMeaning:r.confidenceMeaning||'Uncalibrated synthetic model score',provenance:report.provenance};return fields.map(key=>cell(flat[key])).join(',');});download([fields.join(','),...rows].join('\r\n'),'text/csv;charset=utf-8','csv');});
  $('print').addEventListener('click',()=>window.print());
  if(window.matchMedia('(max-width: 600px)').matches)document.querySelector('.controls').open=false;
  refresh();
  if(globalThis.JudasGuided)globalThis.JudasGuided.mount({engine:E,getState:()=>({config:{...state.config},result:state.result,history:state.history.slice(),running:state.running,paused:state.paused}),run:start,configure:config=>{if(state.running)stopRun();state.config=E.normalize(config);state.result=null;state.playbackResult=null;state.progress=0;$('progress').style.width='0%';refresh();},showView,stopRun,setGuidedBusy:busy=>{state.guidedBusy=busy;setBusy(state.running);}});
})();



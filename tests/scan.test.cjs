'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const engine=require('../engine.js');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

// Exercise the real event handlers with a controlled animation clock.
// Browser layout and native input behavior are checked separately in the browser.
function app(){
  const elements=new Map(),frames=new Map(),downloads=[];let nextFrame=0,lastScene;
  function element(id,dataset={}){return {id,dataset,value:'',checked:false,disabled:false,innerHTML:'',textContent:'',style:{},listeners:{},classList:{toggle(){}},setAttribute(){},scrollIntoView(){},addEventListener(type,handler){this.listeners[type]=handler;},dispatch(type){this.listeners[type]?.({target:this});}};}
  for(const [,id] of source('index.html').matchAll(/\bid="([^"]+)"/g))elements.set(id,element(id));
  for(const key of ['altitude','speed','occlusion','smoke','fog','observation']){elements.set(key,element(key));elements.set(key+'-value',element(key+'-value'));}
  elements.set('visibility-max',element('visibility-max'));
  const domains=Object.keys(engine.domains).map(domain=>element('',{domain}));
  const sensors=['RGB','THERMAL'].map(sensor=>element('',{sensor}));
  const context=vm.createContext({document:{getElementById:id=>{assert.ok(elements.has(id),'Known element '+id);return elements.get(id);},querySelectorAll:selector=>selector==='[data-domain]'?domains:selector==='[data-sensor]'?sensors:[],body:{append(){}},createElement:()=>({click(){downloads.at(-1).filename=this.download;},remove(){}})},window:{matchMedia:()=>({matches:false}),scrollTo(){}},Blob,URL:{createObjectURL:blob=>{downloads.push({blob});return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn(),requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(source('engine.js'),context);
  vm.runInContext(source('scenarios.js'),context);vm.runInContext(source('scene.js'),context);
  const render=context.JudasScene.render;
  context.JudasScene.render=(config,result,options)=>{lastScene={config:{...config},result,options:{...options}};return render(config,result,options);};
  vm.runInContext(source('app.js'),context);
  return {downloads,get scene(){return lastScene;},get:id=>elements.get(id),click:id=>elements.get(id).dispatch('click'),domain:value=>domains.find(b=>b.dataset.domain===value).dispatch('click'),sensor:value=>sensors.find(b=>b.dataset.sensor===value).dispatch('click'),set(key,value){elements.get(key).value=value;elements.get(key).dispatch(['altitude','speed','occlusion','smoke','fog','observation'].includes(key)?'input':'change');},frame(now){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));}};
}

const geometry=svg=>[...svg.matchAll(/<g data-person-id="[^"]+" transform="[^"]+"/g)].map(m=>m[0]);
const world=svg=>svg.match(/data-scene-world transform="([^"]+)"/)[1];
const detections=svg=>[...svg.matchAll(/data-annotation="([^"]+)" data-detected="true"/g)].map(m=>m[1]);

test('both manual Run controls preserve the configured scene through scan, pause, and completion',()=>{
  for(const domain of Object.keys(engine.domains))for(const button of ['run-top','run']){
    const ui=app();ui.domain(domain);ui.sensor('THERMAL');
    for(const [key,value] of Object.entries({altitude:116,speed:6,occlusion:45,smoke:37,fog:28,observationCap:20,light:'night',seed:1976,model:'B',minRecall:0.6,maxFP:2}))ui.set(key,value);
    const before={...ui.scene.config},people=geometry(ui.get('field').innerHTML);
    ui.click(button);
    assert.deepEqual(ui.scene.config,before);assert.deepEqual(geometry(ui.get('field').innerHTML),people);
    assert.equal(ui.scene.options.playback,true);assert.equal(ui.get('run-top').disabled,true);assert.equal(ui.get('baseline').disabled,true);
    assert.equal(ui.get('history-count').textContent,'00');assert.equal(ui.get('result-status').textContent,'AWAITING TEST');
    ui.frame(100);ui.frame(500);
    const movingWorld=world(ui.get('field').innerHTML);
    ui.click('pause');const paused=ui.get('field').innerHTML;
    assert.equal(world(paused),movingWorld);assert.match(paused,/OBSERVATION PAUSED/);assert.match(paused,/data-scan-progress/);
    ui.frame(2000);assert.equal(ui.get('field').innerHTML,paused);assert.equal(ui.get('history-count').textContent,'00');
    ui.click('pause');ui.frame(5200);
    assert.equal(ui.scene.options.playback,false);assert.deepEqual(ui.scene.config,before);
    assert.deepEqual(geometry(ui.get('field').innerHTML),people);assert.equal(ui.get('history-count').textContent,'01');
    assert.equal(ui.get('run-top').disabled,false);assert.match(ui.get('history').innerHTML,/116m · 6m\/s · 45% OCC/);
    assert.deepEqual(JSON.parse(JSON.stringify(ui.scene.result.config)),before);
    assert.equal(ui.scene.result.tp,engine.simulate(before).tp);
  }
});

test('fly-by speed makes manual scans visibly faster while hover still completes',()=>{
  for(const [speed,duration,progressAtOneSecond] of [[0,6000,1/6],[4,3000,1/3],[12,1500,2/3]]){
    const ui=app();ui.set('speed',speed);ui.set('observationCap',20);
    const config={...ui.scene.config};ui.click('run-top');ui.frame(100);ui.frame(1100);
    assert.ok(Math.abs(ui.scene.options.progress-progressAtOneSecond)<1e-10,`Speed ${speed}: scan progress after one second`);
    assert.ok(Math.abs(parseFloat(ui.get('progress').style.width)/100-progressAtOneSecond)<1e-10,'Progress bar follows the scan');
    assert.equal(ui.get('history-count').textContent,'00');
    ui.frame(100+duration-1);
    assert.equal(ui.scene.options.playback,true);assert.equal(ui.get('history-count').textContent,'00');
    ui.frame(100+duration+1);
    assert.equal(ui.scene.options.playback,false);assert.equal(ui.get('history-count').textContent,'01');
    assert.equal(ui.get('progress').style.width,'100%');
    assert.deepEqual(JSON.parse(JSON.stringify(ui.scene.result.config)),config);
    const expected=engine.simulate(config);
    for(const key of ['tp','fp','fn','recall','precision','ttfd','ttai'])assert.equal(ui.scene.result[key],expected[key],`Playback timing preserves ${key}`);
  }
});

test('paused time does not consume the remaining speed-dependent scan duration',()=>{
  const ui=app();ui.set('speed',4);ui.click('run');ui.frame(100);ui.frame(1100);
  const progress=ui.scene.options.progress;ui.click('pause');ui.frame(8100);
  assert.equal(ui.scene.options.progress,progress);assert.equal(ui.get('history-count').textContent,'00');
  ui.click('pause');ui.frame(8600);
  assert.equal(ui.scene.options.progress,0.5);assert.equal(ui.get('history-count').textContent,'00');
  ui.frame(10099);assert.equal(ui.scene.options.playback,true);assert.equal(ui.get('history-count').textContent,'00');
  ui.frame(10101);assert.equal(ui.scene.options.playback,false);assert.equal(ui.get('history-count').textContent,'01');
});

test('only the explicitly labelled baseline action restores clear conditions',()=>{
  const ui=app();ui.domain('SAR');ui.set('altitude',116);ui.set('smoke',70);ui.set('model','B');ui.set('seed',123);
  ui.click('baseline');
  assert.equal(ui.scene.config.altitude,engine.defaults.altitude);assert.equal(ui.scene.config.smoke,0);
  assert.equal(ui.scene.config.domain,'SAR');assert.equal(ui.scene.config.model,'B');assert.equal(ui.scene.config.seed,123);
  assert.match(source('index.html'),/id="baseline">↺ Reset &amp; run baseline/);
});

test('reset cancels an unfinished run without adding a completed result',()=>{
  const ui=app();ui.set('altitude',99);ui.click('run-top');ui.frame(100);ui.frame(700);ui.click('reset');ui.frame(10000);
  assert.equal(ui.get('history-count').textContent,'00');assert.equal(ui.scene.result,null);assert.equal(ui.scene.options.playback,false);
  assert.equal(ui.scene.config.altitude,engine.defaults.altitude);assert.equal(ui.get('progress').style.width,'0%');
});

test('scan reveals only detections reached in simulated time, including while paused',()=>{
  const context=vm.createContext({});vm.runInContext(source('engine.js'),context);vm.runInContext(source('scenarios.js'),context);vm.runInContext(source('scene.js'),context);
  const config=engine.normalize({...engine.defaults,speed:3}),result=context.JudasEngine.simulate(config);
  // A late false alarm must not appear merely because playback is paused.
  result.falsePositives=[{id:'FP-LATE',x:20,y:25,confidence:0.6}];
  for(const progress of [0,0.15,0.4,0.8,1]){
    const expected=result.persons.filter(p=>p.detected&&p.time<=progress*config.observation).map(p=>p.id);
    for(const paused of [false,true]){
      const svg=context.JudasScene.render(config,result,{progress,playback:true,running:!paused,paused});
      assert.deepEqual(detections(svg),Array.from(expected));
      assert.equal(svg.includes('FP-LATE'),progress===1);
      assert.match(svg,new RegExp(expected.length+' persons detected'));
    }
  }
  assert.deepEqual(detections(context.JudasScene.render(config,result,{progress:0})),Array.from(result.persons.filter(p=>p.detected).map(p=>p.id)));
});

test('automatic suite prepares a fresh scan for each planned configuration',()=>{
  const ui=app();ui.get('preset').value='altitude';ui.get('preset').selectedOptions=[{text:'Altitude ladder'}];
  const plan=engine.suite(ui.scene.config,'altitude');ui.click('auto');ui.frame(100);
  plan.forEach((config,i)=>{
    assert.deepEqual(ui.scene.config,config);assert.equal(ui.scene.options.progress,0);
    ui.frame(100+(i+1)*2401);
  });
  assert.equal(ui.get('history-count').textContent,String(plan.length).padStart(2,'0'));assert.equal(ui.scene.options.playback,false);
});

test('automatic speed ladder uses the speed of every step and accelerated suite playback',()=>{
  const ui=app();ui.get('preset').value='speed';ui.get('preset').selectedOptions=[{text:'Speed ladder'}];
  const plan=engine.suite(ui.scene.config,'speed');
  // Expected suite durations for 0, 2, 5, 8, 10 and 12 m/s.
  const durations=[2400,1600,3200/3,800,4800/7,600];
  ui.click('auto');let now=100;ui.frame(now);
  plan.forEach((config,i)=>{
    assert.deepEqual(ui.scene.config,config);assert.equal(ui.scene.options.progress,0);
    ui.frame(now+=durations[i]/2);
    assert.ok(Math.abs(ui.scene.options.progress-0.5)<1e-10,`Step ${i+1} advances at ${config.speed} m/s`);
    assert.equal(ui.get('history-count').textContent,String(i).padStart(2,'0'));
    ui.frame(now+=durations[i]/2+1);
    assert.equal(ui.get('history-count').textContent,String(i+1).padStart(2,'0'));
  });
  assert.equal(ui.scene.options.playback,false);assert.equal(ui.get('progress').style.width,'100%');
});

test('synthetic CSV download preserves scores and the JSON report imagery provenance',async()=>{
  const ui=app();ui.domain('SAR');ui.sensor('THERMAL');ui.set('speed',12);ui.set('occlusion',35);
  ui.click('run');ui.frame(100);ui.frame(1601);
  ui.click('download-json');ui.click('download-csv');
  assert.equal(ui.downloads.length,2);
  const report=JSON.parse(await ui.downloads[0].blob.text()),csv=await ui.downloads[1].blob.text();
  const lines=csv.split('\r\n'),fields=lines[0].split(',');
  const values=[...lines[1].matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(match=>match[1].replace(/""/g,'"'));
  assert.equal(lines.length,2);assert.equal(values.length,fields.length,'quoted JSON cells retain their embedded commas and quotes');
  const row=Object.fromEntries(fields.map((field,index)=>[field,values[index]])),run=report.runs[0];
  assert.equal(row.source,'SYNTHETIC MODEL DEMO');assert.equal(row.source,report.source);
  assert.equal(row.applicationVersion,'0.3.0');assert.equal(row.applicationVersion,report.applicationVersion);
  assert.equal(row.scenarioId,'sar-v02');assert.equal(row.scenarioId,run.scenarioId);
  assert.equal(row.coordinateSystem,'normalized_xywh');assert.equal(row.coordinateSystem,run.coordinateSystem);
  assert.deepEqual(JSON.parse(row.reference),run.reference);assert.match(row.reference,/sar-thermal\.webp/);
  assert.equal(row.confidenceMeaning,run.confidenceMeaning);assert.match(row.confidenceMeaning,/Uncalibrated/);
  assert.equal(row.provenance,report.provenance);assert.match(row.provenance,/not radiometric/);
  for(const key of ['tp','fp','fn','recall','precision','status','synthetic'])assert.equal(row[key],String(run[key]));
  for(const key of Object.keys(engine.defaults))assert.equal(row[key],String(run.config[key]));
  assert.deepEqual(JSON.parse(row.persons),run.persons);assert.deepEqual(JSON.parse(row.falsePositives),run.falsePositives);
  assert.match(ui.downloads[1].filename,/judas-field-synthetic-.*\.csv$/);
  assert.deepEqual(JSON.parse(row.geometry),run.geometry);
  for(const key of ['footprint','visibilityTime','hover','effectiveObservationTime','travelDistance'])assert.equal(row[key],String(run.geometry[key]));
  assert.match(row.geometryNote,/central straight-line flyover/);
});

test('live controls synchronize speed, inverse visibility, altitude and separate cap',()=>{
  const ui=app();ui.set('speed',12);
  assert.ok(Math.abs(ui.get('observation').value-2.886751345948129)<1e-10);
  assert.ok(Math.abs(ui.scene.config.observation-2.886751345948129)<1e-10);
  ui.set('speed',5);assert.ok(Math.abs(ui.get('observation').value-6.928203230275509)<1e-10);
  ui.set('observation',10);
  assert.ok(Math.abs(ui.scene.config.speed-3.4641016151377544)<1e-10);
  assert.ok(Math.abs(ui.get('speed').value-ui.scene.config.speed)<1e-10);
  ui.set('altitude',60);
  assert.ok(Math.abs(ui.scene.config.speed-3.4641016151377544)<1e-10);
  assert.ok(Math.abs(ui.get('observation').value-20)<1e-10);
  ui.set('observationCap',5);
  assert.ok(Math.abs(ui.get('observation').value-20)<1e-10);
  assert.equal(ui.scene.config.observation,5);
  assert.match(ui.get('visibility-note').textContent,/Effective: 5 s/);
});

test('hover, long dwell and infeasible inverse request show truthful controls',()=>{
  const ui=app();
  assert.equal(ui.scene.config.speed,0);
  assert.equal(ui.get('observation-value').innerHTML,'Continuous / Hover');
  assert.equal(ui.scene.config.observation,30);
  ui.set('observationCap',12);assert.equal(ui.scene.config.observation,12);
  ui.set('speed',0.1);
  assert.ok(ui.get('observation').value>300);assert.ok(ui.get('observation').max>300);
  assert.equal(ui.scene.config.observation,12);
  ui.set('altitude',120);ui.set('observation',1);
  assert.equal(ui.scene.config.speed,12);
  assert.ok(Math.abs(ui.get('observation').value-11.547005383792516)<1e-10);
  assert.match(ui.get('visibility-note').textContent,/12 m\/s/);
  ui.set('speed',0);assert.equal(ui.get('observation-value').innerHTML,'Continuous / Hover');
  ui.click('baseline');assert.equal(ui.scene.config.speed,0);assert.equal(ui.scene.config.observationCap,12);assert.equal(ui.scene.config.observation,12);
});

test('matched inverse-visibility suite preserves geometry in JSON, CSV and report',async()=>{
  const ui=app();ui.set('altitude',30);ui.set('observationCap',15);
  ui.get('preset').value='visibility';ui.get('preset').selectedOptions=[{text:'Target visibility / inverse speed'}];
  ui.click('compare');ui.frame(100);
  for(let i=0;i<12;i++)ui.frame(100+(i+1)*2401);
  assert.equal(ui.get('history-count').textContent,'12');
  ui.click('download-json');ui.click('download-csv');
  const report=JSON.parse(await ui.downloads[0].blob.text());
  assert.equal(report.runs.length,12);
  for(let i=0;i<12;i+=2){
    assert.deepEqual(report.runs[i].geometry,report.runs[i+1].geometry);
    assert.equal(report.runs[i].config.observation,Math.min(report.runs[i].geometry.visibilityTime,15));
  }
  const csv=await ui.downloads[1].blob.text();assert.match(csv,/effectiveObservationTime/);assert.match(csv,/central straight-line flyover/);
});


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
  const elements=new Map(),frames=new Map();let nextFrame=0,lastScene;
  function element(id,dataset={}){return {id,dataset,value:'',checked:false,disabled:false,innerHTML:'',textContent:'',style:{},listeners:{},classList:{toggle(){}},setAttribute(){},scrollIntoView(){},addEventListener(type,handler){this.listeners[type]=handler;},dispatch(type){this.listeners[type]?.({target:this});}};}
  for(const [,id] of source('index.html').matchAll(/\bid="([^"]+)"/g))elements.set(id,element(id));
  for(const key of ['altitude','speed','occlusion','smoke','fog','observation']){elements.set(key,element(key));elements.set(key+'-value',element(key+'-value'));}
  const domains=Object.keys(engine.domains).map(domain=>element('',{domain}));
  const sensors=['RGB','THERMAL'].map(sensor=>element('',{sensor}));
  const context=vm.createContext({document:{getElementById:id=>{assert.ok(elements.has(id),'Known element '+id);return elements.get(id);},querySelectorAll:selector=>selector==='[data-domain]'?domains:selector==='[data-sensor]'?sensors:[]},window:{matchMedia:()=>({matches:false}),scrollTo(){}},requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(source('engine.js'),context);
  vm.runInContext(source('scene.js'),context);
  const render=context.JudasScene.render;
  context.JudasScene.render=(config,result,options)=>{lastScene={config:{...config},result,options:{...options}};return render(config,result,options);};
  vm.runInContext(source('app.js'),context);
  return {get scene(){return lastScene;},get:id=>elements.get(id),click:id=>elements.get(id).dispatch('click'),domain:value=>domains.find(b=>b.dataset.domain===value).dispatch('click'),sensor:value=>sensors.find(b=>b.dataset.sensor===value).dispatch('click'),set(key,value){elements.get(key).value=value;elements.get(key).dispatch(['altitude','speed','occlusion','smoke','fog','observation'].includes(key)?'input':'change');},frame(now){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));}};
}

const geometry=svg=>[...svg.matchAll(/<g data-person-id="[^"]+" transform="[^"]+"/g)].map(m=>m[0]);
const world=svg=>svg.match(/data-scene-world transform="([^"]+)"/)[1];
const detections=svg=>[...svg.matchAll(/data-annotation="([^"]+)" data-detected="true"/g)].map(m=>m[1]);

test('both manual Run controls preserve the configured scene through scan, pause, and completion',()=>{
  for(const domain of Object.keys(engine.domains))for(const button of ['run-top','run']){
    const ui=app();ui.domain(domain);ui.sensor('THERMAL');
    for(const [key,value] of Object.entries({altitude:116,speed:6,occlusion:45,smoke:37,fog:28,observation:20,light:'night',seed:1976,model:'B',minRecall:0.6,maxFP:2}))ui.set(key,value);
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
  const context=vm.createContext({});vm.runInContext(source('engine.js'),context);vm.runInContext(source('scene.js'),context);
  const config={...engine.defaults,speed:3,observation:10},result=context.JudasEngine.simulate(config);
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
    ui.frame(100+(i+1)*700);
  });
  assert.equal(ui.get('history-count').textContent,String(plan.length).padStart(2,'0'));assert.equal(ui.scene.options.playback,false);
});

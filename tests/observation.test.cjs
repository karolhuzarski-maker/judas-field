'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const observation=require('../observation.js');
function cone(svg){return svg.match(/data-geometry-cone points="([^"]+)"/)[1].split(' ').map(pair=>pair.split(',').map(Number));}
const near=(a,b,tolerance=0.0002)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('schematic preserves the camera angle and equal metre scale',()=>{
  for(const fov of [30,60,120,170]){
    const svg=observation.render({altitude:60,speed:12,fov});
    const [uav,left,right]=cone(svg),height=left[1]-uav[1],width=right[0]-left[0];
    near(width/(2*height),Math.tan(fov*Math.PI/360),0.0002);
    assert.ok(left[0]>=0&&right[0]<=560&&uav[1]>=0,'Future wide FOVs stay inside the diagram');
  }
  assert.match(observation.render({altitude:30,speed:12}),/2.89/);
});
test('raising altitude visibly enlarges the cone at the default FOV',()=>{
  let previousWidth=0;
  for(const altitude of [15,30,60,120]){
    const [uav,left,right]=cone(observation.render({altitude,speed:12}));
    const width=right[0]-left[0];assert.ok(width>previousWidth);
    near(left[1]-uav[1],altitude*2);previousWidth=width;
  }
});
test('capped travel uses speed times effective duration without claiming full-footprint travel',()=>{
  const svg=observation.render({altitude:30,speed:2,observationCap:5});
  const [,start,end]=svg.match(/data-geometry-travel-line x1="([^"]+)" y1="350" x2="([^"]+)"/).map(Number);
  near(end-start,20); // 10 metres at two pixels per metre.
  assert.match(svg,/data-geometry-travel="10"/);
  assert.match(svg,/--geo-duration:5s/);
  assert.match(svg,/cap ends observation before/);
  assert.match(svg,/17.32/);
});
test('hover remains continuous while diagram and timing stay finite',()=>{
  const svg=observation.render({altitude:30,speed:0,observationCap:12});
  assert.match(svg,/Continuous \/ Hover/);
  assert.match(svg,/id="geometry-preview" disabled/);
  assert.match(svg,/data-geometry-travel="0"/);
  assert.match(svg,/Hover → cap = 12 s/);
  assert.doesNotMatch(svg,/NaN|Infinity/);
});
test('learning mode describes the variable changed and keeps effects conditional',()=>{
  assert.match(observation.render({speed:12},{changedKey:'altitude'}),/same target also appears smaller/);
  assert.match(observation.render({speed:12},{changedKey:'speed'}),/Faster flight shortens/);
  assert.match(observation.render({speed:0},{changedKey:'speed'}),/does not|can still prevent detection/);
  assert.match(observation.render({speed:2,observationCap:5},{changedKey:'observationCap'}),/does not change the footprint/);
});

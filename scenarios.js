/* Registered, manually reviewed visible-extent annotations for generated field imagery. */
(function(root){
  'use strict';
  const width=1672,height=941;
  const target=(id,box,note)=>Object.freeze({id,bbox:Object.freeze([box[0]/width,box[1]/height,box[2]/width,box[3]/height]),note});
  const provenance='AI-generated staged training imagery created with OpenAI image generation, 2026-10-13. Human boxes manually reviewed against visible body extents; no hidden-body inference. Synthetic thermal variant, not calibrated radiometric data. Public illustrative examples, not a blind benchmark.';
  function scene(domain,targets){const slug=domain.toLowerCase();return Object.freeze({id:slug+'-v02',domain,width,height,rgb:'assets/scenes/'+slug+'-rgb.webp',thermal:'assets/scenes/'+slug+'-thermal.webp',coordinateSystem:'normalized_xywh',annotationPolicy:'Common visible-body bounding boxes reviewed across the paired generated RGB and thermal views, with a small margin for generative contour variation; shadows excluded; obscured anatomy not estimated. These are illustrative pairs, not measured sensor registration.',provenance,targets:Object.freeze(targets)});}
  const scenarios=Object.freeze({
    MCI:scene('MCI',[
      target('P01',[366,405,54,116],'Standing subject left of vehicles.'),
      target('P02',[597,560,167,91],'Supine subject on open asphalt.'),
      target('P03',[550,409,92,92],'Seated subject below the light vehicle.'),
      target('P04',[1137,670,162,91],'Supine subject on roadside vegetation.'),
      target('P05',[1083,327,52,113],'Standing subject beside dark vehicle.')
    ]),
    TCCC:scene('TCCC',[
      target('T01',[558,173,90,143],'Standing subject on open dirt.'),
      target('T02',[531,467,213,128],'Prone subject on lower-left dirt.'),
      target('T03',[1003,266,94,127],'Seated subject beside concrete cover.'),
      target('T04',[1090,532,116,120],'Supine subject, lower body partly obscured by scrub.')
    ]),
    SAR:scene('SAR',[
      target('S01',[617,371,49,80],'Relatively visible standing subject on footpath.'),
      target('S02',[996,295,60,91],'Seated subject with partial vegetation obstruction.'),
      target('S03',[979,602,95,105],'Lying subject among brush and natural clutter.')
    ])
  });
  const api=Object.freeze({version:'0.2.0',scenarios});root.JudasScenarios=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);


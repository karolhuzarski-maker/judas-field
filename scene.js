/* Synthetic, deterministic aerial scene. All geometry is local; no live sensor feed. */
(function () {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
  const rand = seed => { const a = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return a - Math.floor(a); };
  const point = person => ({ x: Number(person.x ?? person.position?.x ?? 50) * 10, y: Number(person.y ?? person.position?.y ?? 50) * 6.2 });
  const palettes = {
    RGB: { base:'#202921', ground:'#303b2d', path:'#5a5b43', road:'#343b38', roadEdge:'#545b51', paint:'#adb092', roof:'#58614f', roofDark:'#3d483a', tree:'#3e5038', treeLight:'#526346', shadow:'#111b17', rock:'#67715c', person:'#b9bca0', head:'#dad0ad', line:'#99b5a0' },
    THERMAL: { base:'#191a27', ground:'#282635', path:'#414052', road:'#303243', roadEdge:'#47475a', paint:'#6b6571', roof:'#50424c', roofDark:'#342c3e', tree:'#393342', treeLight:'#50434c', shadow:'#121525', rock:'#675157', person:'#ffc874', head:'#fff1b0', line:'#a1a3b5' }
  };

  function car(x, y, angle, color, damage = false) {
    return `<g transform="translate(${x} ${y}) rotate(${angle})"><rect x="-23" y="-42" width="51" height="96" rx="10" fill="#101b16" opacity=".65" transform="translate(7 9)"/><rect x="-25" y="-25" width="7" height="18" rx="2" fill="#111815"/><rect x="19" y="-25" width="7" height="18" rx="2" fill="#111815"/><rect x="-25" y="21" width="7" height="18" rx="2" fill="#111815"/><rect x="19" y="21" width="7" height="18" rx="2" fill="#111815"/><path d="M-19-44 Q0-49 19-43 L23-25 22 38 Q15 48-15 46 L-23 34-23-24Z" fill="${color}" stroke="#8b9180" stroke-width="1"/><path d="M-17-24 16-24 18-10-18-10Z M-17 21 17 21 15 34-15 34Z" fill="#1b2e2c" stroke="#bac2af" stroke-opacity=".24"/><rect x="-17" y="-7" width="34" height="26" rx="4" fill="${color}" stroke="#b0b7a3" stroke-opacity=".2"/><path d="M-20-31 20-31 M-20 38 19 38" stroke="#d9d3af" stroke-opacity=".4"/><path d="M-15-42-7-43 M8-43 16-41" stroke="#e3dbac" stroke-width="3"/><path d="M-17 42-10 44 M9 43 17 40" stroke="#b05d50" stroke-width="3"/>${damage ? '<path d="M-18-38-8-30 0-41 10-29 21-37 M-19-32 3-21 17-31" stroke="#1b211e" fill="none" stroke-width="3"/><path d="M-15-25 1-14 9-23" stroke="#ccd0b5" fill="none" stroke-width=".8"/>' : ''}</g>`;
  }

  function container(x,y,w,h,angle,p) {
    let ribs = ''; for(let i=7;i<w;i+=9) ribs += `<path d="M${i} 3v${h-6}" stroke="#aab49b" stroke-opacity=".18"/><path d="M${i+2} 3v${h-6}" stroke="#101d18" stroke-opacity=".3"/>`;
    return `<g transform="translate(${x} ${y}) rotate(${angle})"><rect x="10" y="12" width="${w}" height="${h}" fill="${p.shadow}" opacity=".65"/><rect width="${w}" height="${h}" fill="${p.roofDark}" stroke="#71806b" stroke-opacity=".6"/><rect x="3" y="3" width="${w-6}" height="${h-6}" fill="${p.roof}"/>${ribs}<path d="M2 2h${w-4}v${h-4}" fill="none" stroke="#c1c3a4" stroke-opacity=".25"/><text x="${w/2}" y="${h/2+3}" fill="#cad0b6" opacity=".28" text-anchor="middle" font-size="8" letter-spacing="2">GSL / FIELD</text></g>`;
  }

  function tree(x,y,r,seed,p) {
    let leaves='';
    for(let j=0;j<7;j++) {
      const a=j*.897+rand(seed)*2, d=r*.39, lr=r*(.5+rand(seed+j+21)*.25);
      leaves+=`<ellipse cx="${(Math.cos(a)*d).toFixed(1)}" cy="${(Math.sin(a)*d).toFixed(1)}" rx="${lr.toFixed(1)}" ry="${(lr*.84).toFixed(1)}" fill="${j%3 ? p.tree : p.treeLight}" opacity="${.65+rand(seed+j)*.3}"/>`;
    }
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><ellipse cx="${r*.35}" cy="${r*.48}" rx="${r*1.18}" ry="${r*.92}" fill="${p.shadow}" opacity=".55"/><circle r="${r*.76}" fill="${p.tree}"/>${leaves}<path d="M-${r*.4} ${r*.2} ${r*.08}-${r*.3} ${r*.4}-${r*.4}" stroke="#b3bb8d" stroke-opacity=".09" stroke-width="2" fill="none"/></g>`;
  }

  function terrain(domain,p,persons) {
    let grain='';
    for(let i=0;i<220;i++) { const x=rand(i+2)*1000, y=rand(i+551)*620; grain+=`<path d="M${x.toFixed(1)} ${y.toFixed(1)}l${(rand(i+92)*9+1).toFixed(1)} ${(rand(i+103)*3-1.5).toFixed(1)}" stroke="${i%3 ? p.treeLight : p.path}" opacity="${.14+rand(i+132)*.16}" stroke-width="${1+rand(i+482)*2}"/>`; }
    let content=`<rect width="1000" height="620" fill="${p.base}"/><path d="M0 0H1000V620H0Z" fill="url(#jf-ground)"/><path d="M0 115Q220 15 450 125T1000 32V0H0Z M0 570Q255 420 490 545T1000 490V620H0Z" fill="${p.ground}" opacity=".7"/>${grain}`;
    if(domain==='MCI') {
      content+=`<path d="M137 620 185 425 284 425 310 620" fill="${p.path}" opacity=".8"/><path d="M166 620 208 435M292 620 258 435" stroke="#9f9f78" opacity=".13" stroke-width="4"/><g transform="rotate(13 500 310)"><rect x="-130" y="171" width="1270" height="279" fill="${p.path}"/><rect x="-130" y="181" width="1270" height="258" fill="${p.roadEdge}"/><rect x="-130" y="195" width="1270" height="230" fill="${p.road}"/><path d="M-80 203H1100 M-80 416H1100" stroke="${p.paint}" stroke-width="2" opacity=".5"/><path d="M-80 304H1100" stroke="${p.paint}" stroke-width="2" stroke-dasharray="28 32" opacity=".55"/><path d="M-80 314H1100" stroke="${p.paint}" stroke-width="2" stroke-dasharray="28 32" opacity=".35"/><path d="M-60 265H1130 M-60 365H1130" stroke="#182321" stroke-width="9" opacity=".13"/><path d="M405 306Q477 264 524 289 M393 313Q463 279 507 302" fill="none" stroke="#141c19" stroke-width="4" opacity=".75"/>`;
      for(let i=0;i<8;i++)content+=`<rect x="180" y="${208+i*26}" width="47" height="12" fill="${p.paint}" opacity=".56"/>`;
      content+=car(422,280,-61,'#765443',true)+car(512,282,16,'#53656a',true)+car(817,365,90,'#9ba295')+`<path d="M790 343h53v42h-53Z" fill="none" stroke="#d5ce9b" opacity=".3"/><path d="M804 354h20m-10-10v20" stroke="#9a5e51" stroke-width="5"/>`;
      for(let i=0;i<10;i++) { const x=361+i*20,y=374+(i%2)*4;content+=`<g transform="translate(${x} ${y})"><ellipse cx="3" cy="3" rx="6" ry="3" fill="#14221a" opacity=".6"/><path d="M-4 3 0-6 4 3Z" fill="#c88842"/><path d="M-2-1H2" stroke="#d1c8a7" stroke-width="2"/></g>`; }
      for(let i=0;i<25;i++){let x=467+rand(i+11)*95,y=277+rand(i+73)*87;content+=`<path d="M${x} ${y}l${3+rand(i+86)*6} 2-3 4-5-2Z" fill="${i%2?p.shadow:p.rock}" opacity=".7"/>`;}
      content+='</g>';
      content+=container(65,40,140,85,-5,p)+container(815,43,147,98,6,p);
      content+=`<path d="M56 151 202 137M809 171 973 192" stroke="#8f957e" opacity=".35"/><path d="M850 530 971 530M850 554 971 554M850 578 971 578" stroke="${p.paint}" opacity=".2"/><text x="64" y="573" fill="#a4ad8d" opacity=".25" font-size="13" letter-spacing="4">SECTOR 04</text>`;
      [[50,190,35],[97,167,27],[690,60,32],[738,87,31],[942,574,36],[640,531,27],[588,555,32],[365,552,28]].forEach((v,i)=>content+=tree(...v,i+103,p));
    } else if(domain==='TCCC') {
      content+=`<path d="M40 70 945 37 970 559 45 587Z" fill="${p.path}" opacity=".47"/><path d="M38 75 946 41 972 560 47 591Z" fill="none" stroke="#a8ae87" stroke-opacity=".28" stroke-width="2" stroke-dasharray="6 4"/><path d="M193 90 210 571 M518 50 558 576 M51 346 957 318" stroke="${p.base}" stroke-width="32" opacity=".3"/><path d="M115 101 147 111M110 154 145 164M103 207 143 216" stroke="${p.paint}" opacity=".27" stroke-width="2"/>`;
      content+=container(64,72,131,61,-2,p)+container(651,72,229,78,-2,p)+container(752,441,163,65,-2,p)+container(65,406,109,96,-2,p)+container(521,176,107,51,-2,p);
      content+=`<g fill="${p.roofDark}" stroke="#a3ac8c" stroke-opacity=".3"><path d="M376 84h47v85h-14v-71h-33Z"/><path d="M575 357h82v17h-65v73h-17Z"/><path d="M343 515h128v18H343Z"/></g><path d="M235 137h92v89M685 427v63h-79" fill="none" stroke="#c3ba85" stroke-opacity=".24" stroke-width="2" stroke-dasharray="5 5"/>`;
      for(let i=0;i<9;i++){const x=795+(i%3)*22,y=241+Math.floor(i/3)*22;content+=`<g><ellipse cx="${x+5}" cy="${y+6}" rx="10" ry="8" fill="${p.shadow}" opacity=".5"/><circle cx="${x}" cy="${y}" r="9" fill="#56604a" stroke="#929575" stroke-opacity=".55"/><circle cx="${x}" cy="${y}" r="5.5" fill="none" stroke="#202f24" stroke-width="2"/></g>`;}
      for(let i=0;i<4;i++)content+=`<g transform="translate(${318+i*25} 361) rotate(-4)"><rect x="4" y="5" width="22" height="15" rx="5" fill="${p.shadow}" opacity=".5"/><rect width="22" height="14" rx="5" fill="#797963" stroke="#9b9b77" stroke-opacity=".45"/><path d="M11 1v11" stroke="#454d39" opacity=".5"/></g>`;
      content+=`<text x="72" y="549" fill="#bfc2a0" opacity=".32" font-size="11" letter-spacing="3">TRAINING RANGE / 03</text><path d="M606 551h64 M638 518v63" stroke="#b8bc93" opacity=".24"/>`;
      [[24,29,27],[963,84,29],[981,348,36],[28,335,33],[980,608,43],[198,615,32]].forEach((v,i)=>content+=tree(...v,i+108,p));
    } else {
      content+=`<path d="M-60 546Q140 505 249 395T478 366Q636 413 688 303T1060 174" fill="none" stroke="${p.path}" stroke-width="58" opacity=".24"/><path d="M-60 546Q140 505 249 395T478 366Q636 413 688 303T1060 174" fill="none" stroke="${p.path}" stroke-width="27" opacity=".78"/><path d="M-60 546Q140 505 249 395T478 366Q636 413 688 303T1060 174" fill="none" stroke="#adad81" stroke-width="2" opacity=".16"/><path d="M424-50Q390 120 461 228T545 653" fill="none" stroke="#192e2a" stroke-width="25"/><path d="M423-50Q389 120 460 228T544 653" fill="none" stroke="#385349" stroke-width="11" opacity=".6"/><path d="M443 355 484 348" stroke="#85816a" stroke-width="31"/><path d="M434 346 475 339M447 373 488 366" stroke="#b1a382" stroke-width="2" opacity=".5"/>`;
      for(let i=0;i<96;i++) { const x=rand(i+7)*1080-40,y=rand(i+492)*700-40,r=20+rand(i+863)*22; const nearby=persons.some(person=>{const t=point(person);return Math.hypot(t.x-x,t.y-y)<r+29;}); if(!nearby) content+=tree(x,y,r,i+404,p); }
      for(let i=0;i<21;i++){const x=rand(i+140)*1000,y=rand(i+677)*620;content+=`<path d="M${x} ${y}l11-4 9 7-4 7-15-2Z" fill="${p.rock}" opacity=".5"/><path d="M${x} ${y}l11-4 5 4" stroke="#bec3a1" stroke-opacity=".2" fill="none"/>`;}
      content+=`<text x="60" y="558" fill="#bfc2a0" opacity=".25" font-size="11" letter-spacing="3">SEARCH GRID / C7</text>`;
    }
    return content;
  }

  function personMarkup(person,index,cfg,p) {
    const {x,y}=point(person), scale=1.5-clamp(cfg.altitude ?? 45,15,150)/170, prone=/lying|prone|supine/.test(person.posture), seated=/sitting|seated/.test(person.posture), angle=prone ? [-27,31,-14,65,17][index%5] : [-15,34,5,-26,19][index%5];
    const thermal=cfg.sensor==='THERMAL';
    const body=thermal?p.person:['#aaa98a','#bba891','#8b9c90','#a4a98c','#a89d85'][index%5];
    let drawing=prone ? `<ellipse cx="4" cy="5" rx="19" ry="7" fill="${p.shadow}" opacity=".75"/><path d="M-5-1 5-1 12 5 19 6M4 1 11-4 18-3" stroke="${body}" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M-7 0-3 7 4 8M-7-2-2-7 4-6" stroke="${p.head}" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="-10" y="-5" width="14" height="10" rx="4" fill="${body}"/><circle cx="-14" cy="-1" r="4" fill="${p.head}"/>` : seated ? `<ellipse cx="4" cy="6" rx="11" ry="8" fill="${p.shadow}" opacity=".7"/><path d="M-3 3-6 11 2 15M2 2 5 10 12 12" fill="none" stroke="${body}" stroke-width="4" stroke-linecap="round"/><path d="M-6-2-9 5M5-2 9 3" stroke="${p.head}" stroke-width="3" stroke-linecap="round"/><ellipse cy="1" rx="7" ry="6" fill="${body}"/><circle cy="-5" r="4.2" fill="${p.head}"/>` : `<ellipse cx="8" cy="10" rx="7" ry="13" transform="rotate(-30 8 10)" fill="${p.shadow}" opacity=".65"/><path d="M-3 2-4 10M3 2 4 10" stroke="${body}" stroke-width="4" stroke-linecap="round"/><path d="M-6-4-9 3M6-4 9 3" stroke="${p.head}" stroke-width="3" stroke-linecap="round"/><ellipse cy="-1" rx="7" ry="6" fill="${body}"/><circle cy="-5" r="4.5" fill="${p.head}"/>`;
    const occlusion=1-(1-clamp(cfg.occlusion,0,100)/100)*(1-clamp(person.scene_occlusion,0,1));
    if(occlusion>.02) drawing+=`<path d="M${24-occlusion*48} -19h${occlusion*48}v45h${-occlusion*48}Z" fill="${p.roofDark}" stroke="${p.rock}" stroke-opacity=".35" stroke-width="1"/>`;
    return `<g data-person-id="${esc(person.id)}" transform="translate(${x} ${y}) rotate(${angle}) scale(${scale.toFixed(3)})"${thermal ? ' filter="url(#jf-heat)"' : ''}>${drawing}</g>`;
  }

  function annotation(person,index,cfg,p,isGT,detected,confidence) {
    const {x,y}=point(person), scale=1.5-clamp(cfg.altitude ?? 45,15,150)/170, prone=/lying|prone|supine/.test(person.posture);
    const w=(prone?53:35)*scale+12,h=(prone?41:40)*scale+12,l=x-w/2,t=y-h/2;
    const color=detected?'#b8e7a3':isGT?'#e9a98b':'#dfb267', label=detected?`${person.id} · ${Math.round(confidence*100)}%`:`${person.id} · GT`;
    const opacity=detected?'.95':'.7';
    return `<g data-annotation="${esc(person.id)}" data-detected="${detected}" fill="none" stroke="${color}" opacity="${opacity}"><rect x="${l}" y="${t}" width="${w}" height="${h}" stroke-width=".7" stroke-opacity=".4" ${!detected?'stroke-dasharray="3 3"':''}/><path d="M${l+9} ${t}h-9v9 M${l+w-9} ${t}h9v9 M${l} ${t+h-9}v9h9 M${l+w-9} ${t+h}h9v-9" stroke-width="1.5"/><path d="M${x-3} ${y}h6M${x} ${y-3}v6" stroke-width=".8" opacity=".7"/></g><rect x="${l-.5}" y="${t-17}" width="${Math.max(66,label.length*5.3+12)}" height="15" rx="1" fill="${detected?'#c2e6ac':'#2a3029'}" opacity=".94"/><text x="${l+5}" y="${t-6}" font-family="monospace" font-size="9" letter-spacing=".2" fill="${detected?'#18241b':color}">${esc(label)}</text>`;
  }

  function render(config,result=null,options={}) {
    const cfg={domain:'MCI',sensor:'RGB',altitude:45,speed:0,occlusion:0,smoke:0,fog:0,light:'day',...config};
    const {groundTruth=false,progress=0,running=false,paused=false,playback=running||paused}=options;
    const domain=String(cfg.domain).toUpperCase(), p=palettes[cfg.sensor==='THERMAL'?'THERMAL':'RGB'];
    const persons=globalThis.JudasEngine?.domains?.[domain]?.persons || result?.persons || [];
    const detectedPersons=result?.persons || [], normalizedProgress=clamp(progress>1?progress/100:progress,0,1);
    const drift=Math.sin(normalizedProgress*Math.PI*4)*clamp(cfg.speed,0,12)*1.4;
    const isVisible=person=>!!person?.detected && (!playback || (person.time!=null && person.time<=normalizedProgress*cfg.observation));
    let body=terrain(domain,p,persons);
    body+=persons.map((person,i)=>personMarkup(person,i,cfg,p)).join('');
    if(cfg.sensor!=='THERMAL' && cfg.light!=='day')body+=`<rect width="1000" height="620" fill="${cfg.light==='night'?'#061018':'#252b37'}" opacity="${cfg.light==='night'?'.65':'.32'}"/>`;
    const smoke=clamp(cfg.smoke,0,100)/100, fog=clamp(cfg.fog,0,100)/100;
    if(smoke>0)body+=`<g filter="url(#jf-smoke)" opacity="${smoke*.8}"><ellipse cx="440" cy="315" rx="${110+smoke*180}" ry="${54+smoke*70}" fill="#9c9e91"/><ellipse cx="543" cy="252" rx="${85+smoke*200}" ry="${52+smoke*105}" fill="#9b9d93"/><ellipse cx="590" cy="177" rx="${120+smoke*130}" ry="${74+smoke*86}" fill="#858d86"/></g>`;
    if(fog>0)body+=`<rect width="1000" height="620" fill="#c2c9be" opacity="${fog*.63}"/><ellipse cx="330" cy="400" rx="470" ry="130" fill="#e3e7da" filter="url(#jf-smoke)" opacity="${fog*.19}"/>`;
    body+=`<rect width="1000" height="620" fill="url(#jf-vignette)"/><rect width="1000" height="620" fill="url(#jf-scanlines)" opacity=".35"/>`;
    persons.forEach((person,i)=>{
      const match=detectedPersons.find(item=>item.id===person.id), detected=isVisible(match);
      let confidence=Number(match?.confidence)||0;if(confidence>1)confidence/=100;
      if(detected||groundTruth)body+=annotation(person,i,cfg,p,groundTruth,detected,confidence);
    });
    if(result && (!playback || normalizedProgress>=1)) {
      const fps=Array.isArray(result.falsePositives)?result.falsePositives:Array.from({length:clamp(result.falsePositives,0,5)},(_,i)=>({x:38+i*16,y:24+i*13}));
      fps.forEach((fp,i)=>{const x=(Number.isFinite(Number(fp.x))?Number(fp.x):38+i*16)*10,y=(Number.isFinite(Number(fp.y))?Number(fp.y):24+i*13)*6.2;let c=Number(fp.confidence)||.55;if(c>1)c/=100; body+=`<rect x="${x-19}" y="${y-21}" width="38" height="42" fill="none" stroke="#e1b871" stroke-width="1.2" stroke-dasharray="5 3"/><rect x="${x-19}" y="${y-38}" width="77" height="15" rx="1" fill="#d6b36e"/><text x="${x-14}" y="${y-27}" fill="#272b22" font-family="monospace" font-size="9">${esc(fp.id || 'FP'+String(i+1).padStart(2,'0'))} · ${Math.round(c*100)}%</text>`;});
    }
    body+='<text x="500" y="574" text-anchor="middle" fill="#b0bda5" opacity=".65" font-family="monospace" font-size="8" letter-spacing="1.5">SYNTHETIC SCENE</text>';
    const count=detectedPersons.filter(isVisible).length;
    const scanY=66+normalizedProgress*492;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620" class="scene-svg" role="img" aria-label="Synthetic ${esc(domain)} aerial scene, ${esc(cfg.sensor)} sensor${result?`, ${count} persons detected`:''}. No real video or AI inference." preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="jf-ground" x2=".8" y2="1"><stop stop-color="${p.ground}"/><stop offset="1" stop-color="${p.base}"/></linearGradient><radialGradient id="jf-vignette"><stop offset=".45" stop-color="#08120e" stop-opacity="0"/><stop offset="1" stop-color="#07110e" stop-opacity=".6"/></radialGradient><pattern id="jf-scanlines" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 1H4" stroke="#07150d" stroke-opacity=".22" stroke-width="1"/></pattern><pattern id="jf-grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="#b7c7ab" stroke-width=".5" stroke-opacity=".1"/></pattern><filter id="jf-smoke"><feGaussianBlur stdDeviation="24"/></filter><filter id="jf-heat" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="jf-scan" x2="0" y2="1"><stop stop-color="#bce99e" stop-opacity="0"/><stop offset="1" stop-color="#bce99e" stop-opacity=".13"/></linearGradient></defs><g data-scene-world transform="translate(${drift.toFixed(2)} 0)">${body}</g><rect width="1000" height="620" fill="url(#jf-grid)"/><g stroke="#c5d4bc" fill="none" opacity=".42" stroke-width="1"><path d="M24 57V24h33M943 24h33v33M24 563v33h33M943 596h33v-33"/><path d="M481 310h-20m58 0h20M500 291v-20m0 58v20"/><circle cx="500" cy="310" r="4" stroke-width=".7"/><path d="M28 292v36m-4-28h8m-8 10h13m-13 10h8M972 292v36m-4-28h8m-13 10h13m-8 10h8"/></g>${playback?`<g data-scan-progress="${normalizedProgress}"><rect y="${scanY-80}" width="1000" height="80" fill="url(#jf-scan)"/><path d="M0 ${scanY}H1000" stroke="#c4e9aa" stroke-opacity=".7" stroke-width="1"/></g>`:''}<g fill="#c0cbb4" font-family="monospace" font-size="9" letter-spacing="1.4"><text x="42" y="47">${cfg.sensor==='THERMAL'?'IR / THERMAL':'EO / RGB'}  ·  SENSOR 04</text><text x="958" y="47" text-anchor="end">${String(Math.round(cfg.altitude)).padStart(3,'0')} M AGL  /  ${Number(cfg.speed).toFixed(1)} M/S</text><text x="42" y="574" opacity=".7">${esc(domain)}—${domain==='MCI'?'ROAD INCIDENT':domain==='TCCC'?'TRAINING GROUND':'FOREST SEARCH'}</text><text x="958" y="574" text-anchor="end" opacity=".7">${playback?(paused?'OBSERVATION PAUSED  ':'ACQUIRING  ')+Math.round(normalizedProgress*100)+'%':result?'OBSERVATION COMPLETE':'AWAITING OBSERVATION'}</text></g><g transform="translate(946 91)" stroke="#c0cbb4" fill="none" opacity=".75"><path d="M0 0V34m0-34-4 8m4-8 4 8"/><text x="0" y="-9" text-anchor="middle" stroke="none" fill="#c0cbb4" font-family="monospace" font-size="9">N</text></g><g transform="translate(45 533)" stroke="#c0cbb4" opacity=".55"><path d="M0 0v5h70v-5M35 0v5"/><text x="0" y="-5" stroke="none" fill="#c0cbb4" font-family="monospace" font-size="8">${Math.round(cfg.altitude/5)} M</text></g></svg>`;
  }
  globalThis.JudasScene={render};
})();

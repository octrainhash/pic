import {Engine,outputSize,orientedSize,straightenZoom} from './gl.js';
import {LOOKS} from './looks.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= icons ================= */
const I={
 looks:'<circle cx="9" cy="9" r="5.5"/><circle cx="15" cy="9" r="5.5"/><circle cx="12" cy="14.5" r="5.5"/>',
 adjust:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
 color:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
 effects:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
 crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
 text:'<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
 rotate:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
 flip:'<path d="M12 3v18"/><path d="M8 7L3 12l5 5V7zM16 7l5 5-5 5V7z"/>',
 wand:'<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 6.2L11 5M3 21l9-9"/>',
 share:'<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
 dl:'<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'
};
const ic=n=>`<svg viewBox="0 0 24 24" class="i">${I[n]}</svg>`;

/* ================= edit model ================= */
const ADJ=[['exposure','Exposure'],['brightness','Brightness'],['contrast','Contrast'],['highlights','Highlights'],['shadows','Shadows'],['whites','Whites'],['blacks','Blacks'],['saturation','Saturation'],['vibrance','Vibrance'],['warmth','Warmth'],['tint','Tint']];
const FX=[['clarity','Clarity'],['sharpen','Sharpen'],['vignette','Vignette'],['grain','Grain',0],['fade','Fade',0],['glow','Glow',0]];
const BANDS=[['Red','#E5484D'],['Orange','#F38B2B'],['Yellow','#F2CC2E'],['Green','#46B35C'],['Aqua','#2EC4C4'],['Blue','#3A7BF2'],['Purple','#8D5CF2'],['Magenta','#E04DB0']];
const ASPECTS=[['free','Free',null],['orig','Original',0],['1:1','Square',1],['4:5','4:5',4/5],['3:4','3:4',3/4],['9:16','Story',9/16],['16:9','16:9',16/9],['3:2','3:2',3/2]];
const FONTS=[['jakarta','Clean',"800 1em 'Plus Jakarta Sans',sans-serif"],['serif','Classic',"700 1em 'Playfair Display',serif"],['script','Script',"400 1em 'Pacifico',cursive"],['poster','Poster',"400 1.2em 'Bebas Neue',sans-serif"]];
const TCOLORS=['#FFFFFF','#111214','#FF5A4E','#FFC83D','#7FE3B4','#4FA8FF','#F4C2D7'];
const fresh=()=>({adj:{},hsl:BANDS.map(()=>[0,0,0]),lookId:null,lookAmt:100,geo:{rot:0,flip:false,angle:0,crop:{x:0,y:0,w:1,h:1},aspect:'free'},texts:[]});
let P=fresh(),hist=[],hi=-1,doc=null;
const lookOf=id=>LOOKS.find(l=>l.id===id)||null;
const params=()=>({...P,look:lookOf(P.lookId),lookAmt:P.lookAmt/100});

/* ================= storage (recent edits) ================= */
function idb(){return new Promise((ok,no)=>{const r=indexedDB.open('pic',1);r.onupgradeneeded=()=>r.result.createObjectStore('edits',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function dbAll(){try{const d=await idb();return await new Promise(ok=>{const q=d.transaction('edits').objectStore('edits').getAll();q.onsuccess=()=>ok(q.result.sort((a,b)=>b.updated-a.updated));q.onerror=()=>ok([])})}catch(e){return []}}
async function dbPut(rec){try{const d=await idb();await new Promise(ok=>{const t=d.transaction('edits','readwrite');t.objectStore('edits').put(rec);t.oncomplete=ok;t.onerror=ok})}catch(e){}}
async function dbDel(id){try{const d=await idb();await new Promise(ok=>{const t=d.transaction('edits','readwrite');t.objectStore('edits').delete(id);t.oncomplete=ok;t.onerror=ok})}catch(e){}}
let saveT=0;
function autosave(){clearTimeout(saveT);saveT=setTimeout(async()=>{if(!doc)return;doc.params=JSON.parse(JSON.stringify(P));doc.updated=Date.now();doc.thumb=thumbOf();await dbPut(doc)},700)}
function thumbOf(){try{const c=document.createElement('canvas'),s=Math.min(1,320/Math.max(cv.width,cv.height));c.width=Math.round(cv.width*s);c.height=Math.round(cv.height*s);c.getContext('2d').drawImage(cv,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.8)}catch(e){return doc&&doc.thumb}}

/* ================= home ================= */
async function showHome(){
  $('editor').hidden=true;$('home').hidden=false;doc=null;
  const all=await dbAll();$('recentH').hidden=!all.length;
  $('recent').innerHTML=all.map(r=>`<button class="rc" data-open="${r.id}"><img src="${r.thumb||''}" alt=""><span>${new Date(r.updated).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</span><i class="x" role="button" tabindex="0" data-del="${r.id}" aria-label="Remove from recent">${ic('trash')}</i></button>`).join('');
}
$('recent').addEventListener('click',async e=>{
  const d=e.target.closest('[data-del]');if(d){e.stopPropagation();await dbDel(d.dataset.del);showHome();return}
  const o=e.target.closest('[data-open]');if(o){const r=(await dbAll()).find(x=>x.id===o.dataset.open);if(r)openDoc(r)}
});

/* ================= loading a photo ================= */
const cv=$('cv');let eng=null,bitmap=null,full=null;
try{eng=new Engine(cv)}catch(e){document.body.innerHTML='<p style="padding:24px;font:18px system-ui;color:#fff">This browser can\'t run Pic (WebGL 2 is needed). Try the latest Chrome or Safari.</p>'}
$('file').onchange=async()=>{const f=$('file').files[0];$('file').value='';if(!f)return;
  const rec={id:Date.now().toString(36),blob:f,params:fresh(),thumb:null,updated:Date.now(),name:f.name};await openDoc(rec,true)};
async function openDoc(rec,isNew){
  toast('Opening…',0);
  try{
    full=await createImageBitmap(rec.blob,{imageOrientation:'from-image'});
    const maxPrev=2048,s=Math.min(1,maxPrev/Math.max(full.width,full.height));
    bitmap=s<1?await createImageBitmap(full,{resizeWidth:Math.round(full.width*s),resizeHeight:Math.round(full.height*s),resizeQuality:'high'}):full;
  }catch(e){toast('Couldn\'t open that file. Try a JPG, PNG or HEIC photo.');return}
  doc=rec;P=Object.assign(fresh(),JSON.parse(JSON.stringify(rec.params||fresh())));
  hist=[JSON.stringify(P)];hi=0;
  eng.setImage(bitmap);
  $('home').hidden=true;$('editor').hidden=false;
  tool='looks';sub=null;selText=null;thumbs=null;zoom={s:1,x:0,y:0};
  buildTools();drawPanel();layout();hideToast();
requestAnimationFrame(()=>{makeLookThumbs();if(isNew)autosave()});
}

/* ================= rendering ================= */
let tool='looks',sub=null,showOrig=false,raf=0,selText=null;
function previewSize(){
  const st=$('stage'),pad=28,W=st.clientWidth-pad,H=st.clientHeight-16,dpr=Math.min(2,devicePixelRatio||1);
  const geo=tool==='crop'?{...P.geo,crop:{x:0,y:0,w:1,h:1},angle:0}:P.geo;
  const [ow,oh]=outputSize(geo,bitmap.width,bitmap.height),s=Math.min(W/ow,H/oh);
  return {cw:Math.max(1,Math.round(ow*s)),ch:Math.max(1,Math.round(oh*s)),px:Math.max(1,Math.round(ow*Math.min(s*dpr,1/1))),py:Math.max(1,Math.round(oh*Math.min(s*dpr,1))),scale:s};
}
function layout(){if(!bitmap)return;const z=previewSize();cv.style.width=z.cw+'px';cv.style.height=z.ch+'px';draw();if(tool==='crop')placeCrop();drawTexts()}
function draw(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{if(!bitmap)return;const z=previewSize();
  const geo=tool==='crop'?{...P.geo,crop:{x:0,y:0,w:1,h:1},angle:0}:P.geo;
  eng.render({...params(),geo},{w:z.px,h:z.py,original:showOrig});
  $('frame').style.transform=tool==='crop'&&P.geo.angle?`rotate(${P.geo.angle}deg)`:zoomT();
  $('undo').disabled=hi<=0;$('redo').disabled=hi>=hist.length-1;})}
window.addEventListener('resize',()=>layout());

/* ================= history ================= */
function commit(){const s=JSON.stringify(P);if(s===hist[hi])return;hist=hist.slice(0,hi+1);hist.push(s);if(hist.length>80)hist.shift();hi=hist.length-1;autosave();$('undo').disabled=hi<=0;$('redo').disabled=true}
function go(d){const n=hi+d;if(n<0||n>=hist.length)return;hi=n;P=JSON.parse(hist[hi]);drawPanel();layout();autosave()}
$('undo').onclick=()=>go(-1);$('redo').onclick=()=>go(1);

/* ================= compare (hold) ================= */
const holdOn=()=>{showOrig=true;$('badge').hidden=false;draw()},holdOff=()=>{if(!showOrig)return;showOrig=false;$('badge').hidden=true;draw()};
$('compare').addEventListener('pointerdown',e=>{e.preventDefault();holdOn()});['pointerup','pointerleave','pointercancel'].forEach(ev=>$('compare').addEventListener(ev,holdOff));
document.addEventListener('keydown',e=>{if($('editor').hidden||e.target.tagName==='INPUT')return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();go(e.shiftKey?1:-1)}
  if(e.key===' '&&!e.repeat){e.preventDefault();holdOn()}});
document.addEventListener('keyup',e=>{if(e.key===' ')holdOff()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('sheet').hidden)closeSheet()});

/* ================= tools & panel ================= */
const TOOLS=[['looks','Looks'],['adjust','Adjust'],['color','Colour'],['effects','Effects'],['crop','Crop'],['text','Text']];
function buildTools(){$('tools').innerHTML=TOOLS.map(([k,l])=>`<button role="tab" data-tool="${k}" aria-selected="${tool===k}">${ic(k)}${l}</button>`).join('')}
$('tools').onclick=e=>{const b=e.target.closest('[data-tool]');if(!b)return;const was=tool;tool=b.dataset.tool;sub=null;if(was!==tool&&(was==='crop'||tool==='crop')){zoom={s:1,x:0,y:0}}buildTools();drawPanel();layout()};
function slider(id,label,val,min=-100,max=100){
  const a=((Math.min(0,val)-min)/(max-min)*100)+'%',b=((Math.max(0,val)-min)/(max-min)*100)+'%',z=min<0?[a,b]:['0%',((val-min)/(max-min)*100)+'%'];
  return `<div class="sl"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="1" value="${val}" style="--a:${z[0]};--b:${z[1]}"><output id="${id}-o">${val>0&&min<0?'+'+val:val}</output></div>`;
}
function fillSlider(el){const min=+el.min,max=+el.max,v=+el.value;if(min<0){el.style.setProperty('--a',((Math.min(0,v)-min)/(max-min)*100)+'%');el.style.setProperty('--b',((Math.max(0,v)-min)/(max-min)*100)+'%')}else{el.style.setProperty('--a','0%');el.style.setProperty('--b',((v-min)/(max-min)*100)+'%')}const o=$(el.id+'-o');if(o)o.textContent=(v>0&&min<0?'+':'')+v}
function drawPanel(){
  const p=$('panel');let h='';
  if(tool==='looks'){
    h=`<div class="looks" id="looks"><button class="lk${!P.lookId?' on':''}" data-look=""><span class="ph" id="lk-none"></span>None</button>${LOOKS.map(l=>`<button class="lk${P.lookId===l.id?' on':''}" data-look="${l.id}"><canvas id="lk-${l.id}" width="152" height="152"></canvas>${l.name}</button>`).join('')}</div>`;
    h+=P.lookId?slider('lookAmt','Strength',P.lookAmt,0,100):`<p class="hint">Tap a look. Tap it again to adjust its strength.</p>`;
  }
  if(tool==='adjust'||tool==='effects'){
    const list=tool==='adjust'?ADJ:FX;if(!sub||!list.some(x=>x[0]===sub))sub=list[0][0];
    h=`<div class="chips">${tool==='adjust'?`<button class="chip" id="auto">${ic('wand')}Auto</button>`:''}${list.map(([k,l])=>{const v=P.adj[k]||0;return `<button class="chip${sub===k?' on':''}${v?' dot':''}" data-sub="${k}">${l}${v?`<small>${v>0?'+':''}${v}</small>`:''}</button>`}).join('')}<button class="chip" id="resetT">${ic('reset')}Reset</button></div>`;
    const def=list.find(x=>x[0]===sub);h+=slider('adj-'+sub,def[1],P.adj[sub]||0,def[2]===0?0:-100,100);
  }
  if(tool==='color'){
    if(sub==null||typeof sub!=='number')sub=0;const b=P.hsl[sub];
    h=`<div class="swatches">${BANDS.map(([n,c],i)=>`<button class="sw${sub===i?' on':''}" data-band="${i}" style="background:${c}" aria-label="${n}"></button>`).join('')}</div>`+slider('h0','Hue',b[0])+slider('h1','Saturation',b[1])+slider('h2','Luminance',b[2]);
  }
  if(tool==='crop'){
    h=`<div class="chips">${ASPECTS.map(([k,l])=>`<button class="chip${P.geo.aspect===k?' on':''}" data-aspect="${k}">${l}</button>`).join('')}</div>`+slider('angle','Straighten',P.geo.angle,-45,45)+
      `<div class="row" style="justify-content:center"><button class="btn" id="rot">${ic('rotate')}Rotate</button><button class="btn" id="flip">${ic('flip')}Flip</button><button class="btn" id="cropReset">${ic('reset')}Reset</button></div>`;
  }
  if(tool==='text'){
    const t=P.texts.find(x=>x.id===selText);
    if(!t)h=`<p class="hint">${P.texts.length?'Tap a text on the photo to edit it.':'Add a caption, a date or a title.'}</p><div class="row" style="justify-content:center"><button class="btn acc" id="addText">${ic('plus')}Add text</button></div>`;
    else h=`<div class="row"><input class="tinput" id="tval" value="${esc(t.text)}" aria-label="Text" maxlength="120"><button class="btn" id="tdel" aria-label="Delete text">${ic('trash')}</button></div>
      <div class="chips" style="padding-top:10px">${FONTS.map(([k,l])=>`<button class="chip${t.font===k?' on':''}" data-font="${k}" style="font-family:${k==='serif'?'Playfair Display':k==='script'?'Pacifico':k==='poster'?'Bebas Neue':'Plus Jakarta Sans'}">${l}</button>`).join('')}<button class="chip${t.shadow?' on':''}" id="tshadow">Shadow</button></div>
      <div class="swatches">${TCOLORS.map(c=>`<button class="sw${t.color===c?' on':''}" data-tcolor="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>${slider('tsize','Size',t.size,2,30)}`;
  }
  p.innerHTML=h;
  p.querySelectorAll('input[type=range]').forEach(el=>{el.addEventListener('input',()=>{fillSlider(el);onSlide(el)});el.addEventListener('change',()=>{commit();if(tool==='adjust'||tool==='effects')refreshChips()});el.addEventListener('dblclick',()=>{el.value=el.min<0?0:(el.id==='lookAmt'?100:el.min==2?8:0);fillSlider(el);onSlide(el);commit()})});
  if(tool==='looks')paintLookThumbs();
  $('crop').hidden=tool!=='crop';
}
function refreshChips(){const k=sub;document.querySelectorAll('#panel [data-sub]').forEach(b=>{const v=P.adj[b.dataset.sub]||0;b.classList.toggle('dot',!!v);const lab=(ADJ.concat(FX)).find(x=>x[0]===b.dataset.sub)[1];b.innerHTML=lab+(v?`<small>${v>0?'+':''}${v}</small>`:'')})}
function onSlide(el){const v=+el.value,id=el.id;
  if(id==='lookAmt')P.lookAmt=v;
  else if(id.startsWith('adj-'))P.adj[id.slice(4)]=v;
  else if(/^h[012]$/.test(id))P.hsl[sub][+id[1]]=v;
  else if(id==='angle'){P.geo.angle=v}
  else if(id==='tsize'){const t=P.texts.find(x=>x.id===selText);if(t){t.size=v;drawTexts()}return}
  draw();
}
$('panel').addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;const d=t.dataset;
  if('look' in d){const id=d.look||null;if(P.lookId===id&&id){/* tap again: keep, slider visible */}else{P.lookId=id;P.lookAmt=100}commit();drawPanel();draw()}
  if(d.sub){sub=d.sub;drawPanel()}
  if(t.id==='auto'){autoEnhance()}
  if(t.id==='resetT'){(tool==='adjust'?ADJ:FX).forEach(([k])=>delete P.adj[k]);commit();drawPanel();draw()}
  if(d.band){sub=+d.band;drawPanel()}
  if(d.aspect){P.geo.aspect=d.aspect;applyAspect();commit();drawPanel();layout()}
  if(t.id==='rot'){const g=P.geo;g.rot=(g.rot+3)%4;g.crop={x:0,y:0,w:1,h:1};applyAspect();commit();layout()}
  if(t.id==='flip'){P.geo.flip=!P.geo.flip;P.geo.crop.x=1-P.geo.crop.x-P.geo.crop.w;commit();layout()}
  if(t.id==='cropReset'){P.geo={rot:0,flip:false,angle:0,crop:{x:0,y:0,w:1,h:1},aspect:'free'};commit();drawPanel();layout()}
  if(t.id==='addText'){const n={id:Date.now().toString(36),text:'Your text',x:.5,y:.5,size:8,color:'#FFFFFF',font:'jakarta',shadow:true};P.texts.push(n);selText=n.id;commit();drawPanel();drawTexts();setTimeout(()=>{const i=$('tval');if(i){i.focus();i.select()}},50)}
  const tx=P.texts.find(x=>x.id===selText);
  if(tx){if(d.font){tx.font=d.font;commit();drawPanel();drawTexts()}if(d.tcolor){tx.color=d.tcolor;commit();drawPanel();drawTexts()}if(t.id==='tshadow'){tx.shadow=!tx.shadow;commit();drawPanel();drawTexts()}if(t.id==='tdel'){P.texts=P.texts.filter(x=>x!==tx);selText=null;commit();drawPanel();drawTexts()}}
});
$('panel').addEventListener('input',e=>{if(e.target.id==='tval'){const t=P.texts.find(x=>x.id===selText);if(t){t.text=e.target.value||' ';drawTexts()}}});
$('panel').addEventListener('change',e=>{if(e.target.id==='tval')commit()});

/* ================= looks thumbnails ================= */
let thumbs=null;
function makeLookThumbs(){
  const c=document.createElement('canvas');let te;try{te=new Engine(c)}catch(e){return}
  const s=Math.min(1,160/Math.min(bitmap.width,bitmap.height)),w=Math.round(bitmap.width*s),h=Math.round(bitmap.height*s);
  const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;tmp.getContext('2d').drawImage(bitmap,0,0,w,h);
  te.setImage(tmp);thumbs={};
  const base={...fresh(),geo:{rot:0,flip:false,angle:0,crop:{x:0,y:0,w:1,h:1}}};
  const sq=Math.min(w,h);
  const shot=look=>{te.render({...base,look,lookAmt:1},{w,h});const o=document.createElement('canvas');o.width=o.height=152;o.getContext('2d').drawImage(c,(w-sq)/2,(h-sq)/2,sq,sq,0,0,152,152);return o};
  thumbs.none=shot(null);LOOKS.forEach(l=>thumbs[l.id]=shot(l));
  te.gl.getExtension('WEBGL_lose_context')?.loseContext();
  paintLookThumbs();
}
function paintLookThumbs(){if(!thumbs)return;const n=$('lk-none');if(n&&!n.firstChild){const c=thumbs.none;c.style.cssText='width:100%;height:100%;border-radius:11px;display:block';n.appendChild(c.cloneNode());n.firstChild.getContext('2d').drawImage(c,0,0)}LOOKS.forEach(l=>{const el=$('lk-'+l.id);if(el)el.getContext('2d').drawImage(thumbs[l.id],0,0)})}

/* ================= auto enhance ================= */
function autoEnhance(){
  const c=document.createElement('canvas'),s=Math.min(1,256/Math.max(bitmap.width,bitmap.height));c.width=Math.max(1,bitmap.width*s|0);c.height=Math.max(1,bitmap.height*s|0);
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bitmap,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height).data;
  const hist=new Array(256).fill(0);let n=0,satSum=0;
  for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],l=Math.round(.2126*r+.7152*g+.0722*b);hist[l]++;n++;satSum+=(Math.max(r,g,b)-Math.min(r,g,b))/255}
  const pct=p=>{let a=0;for(let i=0;i<256;i++){a+=hist[i];if(a>=n*p)return i/255}return 1};
  const lo=pct(.01),hiV=pct(.99),med=pct(.5),sat=satSum/n;
  const A=P.adj;
  A.exposure=Math.round(clamp((Math.log2(.46/Math.max(.05,med)))*35,-60,60));
  A.blacks=Math.round(clamp(-lo*220,-40,0));A.whites=Math.round(clamp((1-hiV)*200,0,40));
  A.shadows=Math.round(clamp((.3-pct(.15))*120,0,35));A.highlights=Math.round(clamp(-(hiV-.92)*300,-35,0));
  A.contrast=Math.round(clamp((.55-(hiV-lo))*60,0,20));A.vibrance=Math.round(clamp((.35-sat)*90,5,30));
  for(const k in A)if(!A[k])delete A[k];
  commit();drawPanel();draw();toast('Auto applied. Fine-tune with any slider.');
}

/* ================= crop interaction ================= */
function applyAspect(){
  const g=P.geo,a=ASPECTS.find(x=>x[0]===g.aspect);if(!a||a[2]===null)return;
  const [OW,OH]=orientedSize(bitmap.width,bitmap.height,g.rot),ratio=a[2]===0?OW/OH:a[2];
  let w=1,h=(OW/ratio)/OH;if(h>1){h=1;w=(OH*ratio)/OW}
  g.crop={x:(1-w)/2,y:(1-h)/2,w,h};
}
function placeCrop(){const c=P.geo.crop,el=$('crop');el.style.left=c.x*100+'%';el.style.top=c.y*100+'%';el.style.width=c.w*100+'%';el.style.height=c.h*100+'%'}
{
  const el=$('crop');let drag=null;
  el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);const h=e.target.classList.contains('h')?[...e.target.classList].find(x=>x!=='h'):'move';drag={h,x:e.clientX,y:e.clientY,c:{...P.geo.crop},r:cv.getBoundingClientRect()}});
  el.addEventListener('pointermove',e=>{if(!drag)return;const g=P.geo,{r,c}=drag;let dx=(e.clientX-drag.x)/r.width,dy=(e.clientY-drag.y)/r.height;
    // undo straighten rotation of the frame for the drag direction
    if(g.angle){const a=-g.angle*Math.PI/180,px=dx*r.width,py=dy*r.height;dx=(px*Math.cos(a)-py*Math.sin(a))/r.width;dy=(px*Math.sin(a)+py*Math.cos(a))/r.height}
    const n={...c},min=.08,a=ASPECTS.find(x=>x[0]===g.aspect),[OW,OH]=orientedSize(bitmap.width,bitmap.height,g.rot),ratio=a&&a[2]!==null?(a[2]===0?OW/OH:a[2]):null;
    if(drag.h==='move'){n.x=clamp(c.x+dx,0,1-c.w);n.y=clamp(c.y+dy,0,1-c.h)}
    else{const L=drag.h.includes('l'),T=drag.h.includes('t');
      let x0=c.x,y0=c.y,x1=c.x+c.w,y1=c.y+c.h;if(L)x0=clamp(x0+dx,0,x1-min);else x1=clamp(x1+dx,x0+min,1);if(T)y0=clamp(y0+dy,0,y1-min);else y1=clamp(y1+dy,y0+min,1);
      if(ratio){let w=x1-x0,h=(w*OW/ratio)/OH;if(T){if(y1-h<0){h=y1;w=(h*OH*ratio)/OW}}else if(y0+h>1){h=1-y0;w=(h*OH*ratio)/OW}if(L)x0=x1-w;else x1=x0+w;if(T)y0=y1-h;else y1=y0+h}
      n.x=x0;n.y=y0;n.w=x1-x0;n.h=y1-y0}
    g.crop=n;placeCrop()});
  const end=()=>{if(drag){drag=null;commit()}};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
}

/* ================= text layers ================= */
function fontCss(t,px){const f=FONTS.find(x=>x[0]===t.font)||FONTS[0];return f[2].replace('1em',px+'px').replace('1.2em',(px*1.2)+'px')}
function drawTexts(){
  const box=$('texts');if(tool==='crop'){box.innerHTML='';return}
  const W=cv.clientWidth;
  box.innerHTML=P.texts.map(t=>`<div class="tx${t.id===selText&&tool==='text'?' sel':''}" data-tx="${t.id}" style="left:${t.x*100}%;top:${t.y*100}%;font:${fontCss(t,t.size/100*W)};color:${t.color};${t.shadow?'text-shadow:0 2px 10px rgba(0,0,0,.55)':''}">${esc(t.text)}</div>`).join('');
}
{
  let drag=null;
  $('texts').addEventListener('pointerdown',e=>{const el=e.target.closest('[data-tx]');if(!el)return;e.preventDefault();const t=P.texts.find(x=>x.id===el.dataset.tx);if(tool!=='text'){tool='text';buildTools()}selText=t.id;drawPanel();drawTexts();
    const r=cv.getBoundingClientRect();drag={t,ox:e.clientX,oy:e.clientY,x:t.x,y:t.y,r};$('texts').setPointerCapture(e.pointerId)});
  $('texts').addEventListener('pointermove',e=>{if(!drag)return;drag.t.x=clamp(drag.x+(e.clientX-drag.ox)/drag.r.width,0,1);drag.t.y=clamp(drag.y+(e.clientY-drag.oy)/drag.r.height,0,1);drawTexts()});
  const end=()=>{if(drag){drag=null;commit()}};$('texts').addEventListener('pointerup',end);$('texts').addEventListener('pointercancel',end);
}

/* ================= zoom to inspect (double-tap, pinch, drag) ================= */
let zoom={s:1,x:0,y:0};
const zoomT=()=>zoom.s===1?'':`translate(${zoom.x}px,${zoom.y}px) scale(${zoom.s})`;
{
  const st=$('stage'),pts=new Map();let last=0,start=null;
  st.addEventListener('pointerdown',e=>{if(tool==='crop'||e.target.closest('.tx,.crop'))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const now=Date.now();if(pts.size===1&&now-last<300){zoom=zoom.s>1?{s:1,x:0,y:0}:{s:2.5,x:0,y:0};$('frame').classList.remove('zoomed');draw();last=0;return}last=now;
    start={z:{...zoom},pts:new Map([...pts].map(([k,v])=>[k,{...v}]))};$('frame').classList.add('zoomed')});
  st.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId)||!start)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const a=[...pts.values()],b=[...start.pts.values()];
    if(a.length>=2&&b.length>=2){const d1=Math.hypot(b[0].x-b[1].x,b[0].y-b[1].y),d2=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);zoom.s=clamp(start.z.s*d2/Math.max(1,d1),1,6)}
    else if(zoom.s>1){zoom.x=start.z.x+(a[0].x-b[0].x);zoom.y=start.z.y+(a[0].y-b[0].y)}
    if(zoom.s===1){zoom.x=zoom.y=0}$('frame').style.transform=zoomT()});
  const up=e=>{pts.delete(e.pointerId);if(!pts.size){start=null;$('frame').classList.remove('zoomed')}else start={z:{...zoom},pts:new Map([...pts].map(([k,v])=>[k,{...v}]))}};
  st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
}

/* ================= export ================= */
const EXP={size:'full',fmt:'jpg'};
$('save').onclick=()=>{
  const [ow,oh]=outputSize(P.geo,full.width,full.height);
  const sizes=[['full','Full size',`${ow}×${oh}`],['2048','Large',fitTxt(2048)],['1080','Social',fitTxt(1080)]];
  function fitTxt(m){const s=Math.min(1,m/Math.max(ow,oh));return `${Math.round(ow*s)}×${Math.round(oh*s)}`}
  openSheet(`<h3>Save your photo</h3><p class="soft" style="margin:0 0 4px">Size</p><div class="opts">${sizes.map(([k,l,s])=>`<button class="opt${EXP.size===k?' on':''}" data-size="${k}">${l}<small>${s}</small></button>`).join('')}</div>
    <p class="soft" style="margin:0 0 4px">Format</p><div class="opts">${[['jpg','JPEG','Best for sharing'],['png','PNG','No compression'],['webp','WebP','Small files']].map(([k,l,s])=>`<button class="opt${EXP.fmt===k?' on':''}" data-fmt="${k}">${l}<small>${s}</small></button>`).join('')}</div>
    <button class="big" id="dosave">${ic('dl')}Save to device</button>${navigator.canShare?`<button class="big ghost" id="doshare">${ic('share')}Share…</button>`:''}`);
  $('sheetc').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.size){EXP.size=b.dataset.size;b.parentElement.querySelectorAll('.opt').forEach(x=>x.classList.toggle('on',x===b))}
    if(b.dataset.fmt){EXP.fmt=b.dataset.fmt;b.parentElement.querySelectorAll('.opt').forEach(x=>x.classList.toggle('on',x===b))}
    if(b.id==='dosave'||b.id==='doshare'){b.innerHTML='<span class="spin"></span>Preparing…';b.disabled=true;
      try{const file=await renderFile();if(b.id==='doshare'&&navigator.canShare({files:[file]})){closeSheet();await navigator.share({files:[file]}).catch(()=>{})}
        else{const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);closeSheet();toast('Saved. Check your downloads or Photos.')}}
      catch(err){closeSheet();toast('Couldn\'t save at full size. Try Large.')}}};
};
async function renderFile(){
  const c=document.createElement('canvas');const ex=new Engine(c);
  let src=full;const lim=Math.min(ex.maxTex,8192);if(Math.max(full.width,full.height)>lim){const s=lim/Math.max(full.width,full.height);src=await createImageBitmap(full,{resizeWidth:Math.round(full.width*s),resizeHeight:Math.round(full.height*s),resizeQuality:'high'})}
  ex.setImage(src);
  let [w,h]=outputSize(P.geo,src.width,src.height);const cap=EXP.size==='full'?Infinity:+EXP.size,s=Math.min(1,cap/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);
  ex.render(params(),{w,h});
  const out=document.createElement('canvas');out.width=w;out.height=h;const x=out.getContext('2d');x.drawImage(c,0,0);
  ex.gl.getExtension('WEBGL_lose_context')?.loseContext();
  await document.fonts.ready;
  for(const t of P.texts){x.save();x.font=fontCss(t,t.size/100*w);x.fillStyle=t.color;x.textAlign='center';x.textBaseline='middle';if(t.shadow){x.shadowColor='rgba(0,0,0,.55)';x.shadowBlur=w*.012;x.shadowOffsetY=w*.002}
    const lines=t.text.split('\n'),lh=t.size/100*w*1.1;lines.forEach((ln,i)=>x.fillText(ln,t.x*w,t.y*h+(i-(lines.length-1)/2)*lh));x.restore()}
  const type={jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[EXP.fmt];
  const blob=await new Promise(ok=>out.toBlob(ok,type,EXP.fmt==='png'?undefined:.93));
  const base=(doc&&doc.name?doc.name.replace(/\.[^.]+$/,''):'photo')+'-pic';
  return new File([blob],`${base}.${EXP.fmt==='jpg'?'jpg':EXP.fmt}`,{type});
}

/* ================= sheets & toast ================= */
function openSheet(h){$('sheetc').innerHTML=h;$('sheet').hidden=false}
function closeSheet(){$('sheet').hidden=true}
$('scrim').onclick=closeSheet;
let tt=0;function toast(m,ms=2600){const t=$('toast');t.textContent=m;t.hidden=false;const pn=$('panel');if(!$('editor').hidden&&pn.offsetHeight){t.style.top='auto';t.style.bottom=(innerHeight-pn.getBoundingClientRect().top+12)+'px'}else{t.style.top='';t.style.bottom=''}clearTimeout(tt);if(ms)tt=setTimeout(()=>t.hidden=true,ms)}
function hideToast(){$('toast').hidden=true}
$('back').onclick=async()=>{clearTimeout(saveT);if(doc){doc.params=JSON.parse(JSON.stringify(P));doc.updated=Date.now();doc.thumb=thumbOf();await dbPut(doc)}showHome()};

showHome();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});

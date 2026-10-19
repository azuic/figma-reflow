declare const __WORKER_SOURCE__:string;
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const send=(message:unknown)=>parent.postMessage({pluginMessage:message},'*');
let loaded=false,live=false,selectionReady=false,staged=false;
let picking:'text'|'shape'|null=null;
const workerURL=URL.createObjectURL(new Blob([__WORKER_SOURCE__],{type:'text/javascript'}));
const worker=new Worker(workerURL);URL.revokeObjectURL(workerURL);
worker.onmessage=event=>send(event.data);
worker.onerror=()=>{el('status').textContent='could not start reflow. reopen the plugin.';};
function pill(kind:'text'|'shape',name:string|null,fullName?:string){
  const node=el(`${kind}-pill`);node.dataset.active=String(!!name);
  node.title=picking===kind?'select a layer on the canvas; click again to cancel':`${fullName||name||kind} · click to replace`;
  node.setAttribute('aria-label',`${kind==='text'?'text':'shape'}: ${name?fullName||name:'not selected'}`);
  el(`${kind}-name`).textContent=name||(kind==='text'?'text':'shape');
  node.dataset.picking=String(picking===kind);node.setAttribute('aria-pressed',String(picking===kind));
}
function pills(sourceName:string|null,shapeNames:string[]){
  pill('text',sourceName);
  pill('shape',shapeNames.length?shapeNames[0]+(shapeNames.length>1?` +${shapeNames.length-1}`:''):null,shapeNames.join(', '));
}
function controls(){
  for(const id of ['apply','edit','cleanup'])el<HTMLButtonElement>(id).disabled=!loaded||staged||!!picking;
  el<HTMLTextAreaElement>('text').disabled=!loaded||staged||!!picking;
  const toggle=el<HTMLButtonElement>('toggle');toggle.disabled=!!picking||(staged?!selectionReady:!selectionReady&&!loaded&&!live);
  toggle.textContent=live?'stop reflow':'start reflow';toggle.dataset.live=String(live);
  el('state').dataset.live=String(live);el('state-label').textContent=picking?`pick ${picking}`:live?'live':loaded||selectionReady?'ready':'standby';
}
function compactStatus(message:string,error:boolean){
  if(picking)return picking==='text'?'select a text layer on the canvas.':'select a shape on the canvas.';
  if(error)return message.toLowerCase();
  if(live){if(message.includes('OVERFLOW'))return 'text overflows. enlarge the text box.';return message.includes('Preparing')?'reflowing…':'move your shapes. text will follow.';}
  if(!loaded&&!selectionReady)return 'select both layers to begin.';
  if(message.startsWith('Stopped'))return 'paused. text stays editable.';
  return 'ready to reflow.';
}
window.onmessage=(event:MessageEvent)=>{
  const m=event.data?.pluginMessage;if(!m||typeof m.type!=='string')return;
  if(m.type==='snapshot'||m.type==='metrics'||m.type==='metrics-error')worker.postMessage(m);
  if(m.type==='selection'){
    picking=m.picking||null;staged=!!m.staged;selectionReady=m.ready;pills(m.sourceName,m.shapeNames||[]);controls();
    if(!live){el('status').textContent=compactStatus('',false);el('status').className='';}
  }
  if(m.type==='bound'){
    picking=null;staged=false;loaded=true;selectionReady=true;el<HTMLTextAreaElement>('text').value=m.text;
    padding(m.padding,false);
    pills(m.sourceName,m.shapeNames||Array(m.obstacles).fill('shape'));controls();
  }
  if(m.type==='unbound'){picking=null;staged=false;loaded=false;selectionReady=false;el<HTMLTextAreaElement>('text').value='';pills(null,[]);controls();}
  if(m.type==='status'){
    live=m.live;el('status').textContent=compactStatus(m.message,m.error);el('status').className=m.error?'error':'';
    el('detail-status').textContent=m.message.toLowerCase();controls();if(!live)worker.postMessage({type:'stop'});
  }
  if(m.type==='stats')el('stats').textContent=`polls ${m.samples} / changes ${m.changes}\nevents ${m.events} / layouts ${m.renders}\nlast write ${m.lastMs} ms / rev ${m.revision}`;
};
el('text-pill').onclick=()=>send({type:'pick',kind:'text'});
el('shape-pill').onclick=()=>send({type:'pick',kind:'shape'});
el('toggle').onclick=()=>send({type:live?'stop':'start-selection'});
for(const [id,type] of Object.entries({demo:'demo',edit:'edit-source',cleanup:'cleanup'}))el(id).onclick=()=>send({type});
el('apply').onclick=()=>send({type:'apply-text',text:el<HTMLTextAreaElement>('text').value});
function padding(value:number,notify=true){
  if(!Number.isFinite(value))value=12;
  value=Math.max(0,Math.min(200,Math.round(value)));
  el<HTMLInputElement>('padding').value=String(value);
  el('padding-scrub').setAttribute('aria-valuenow',String(value));
  if(notify)send({type:'padding',value});
}
el('padding').onchange=()=>padding(Number(el<HTMLInputElement>('padding').value));
const box=el('padding-box');
let scrub:{id:number;x:number;value:number}|null=null;
box.onpointerdown=(event:PointerEvent)=>{
  if(event.button!==0||event.target===el('padding'))return;
  event.preventDefault();box.setPointerCapture(event.pointerId);
  scrub={id:event.pointerId,x:event.clientX,value:Number(el<HTMLInputElement>('padding').value)};
  box.dataset.scrubbing='true';
};
box.onpointermove=(event:PointerEvent)=>{
  if(!scrub||scrub.id!==event.pointerId)return;
  if(event.buttons===0){endScrub(event);return;}
  const scale=event.shiftKey?.1:event.altKey?10:1;
  const value=Math.max(0,Math.min(200,Math.round(scrub.value+(event.clientX-scrub.x)*scale)));
  if(value!==Number(el<HTMLInputElement>('padding').value))padding(value);
};
function endScrub(event:PointerEvent){
  if(scrub?.id!==event.pointerId)return;
  scrub=null;box.dataset.scrubbing='false';
  if(box.hasPointerCapture(event.pointerId))box.releasePointerCapture(event.pointerId);
}
box.onpointerup=endScrub;box.onpointercancel=endScrub;box.onlostpointercapture=endScrub;
el('padding-scrub').onkeydown=(event:KeyboardEvent)=>{
  const step=event.shiftKey?10:1;
  if(['ArrowRight','ArrowUp','ArrowLeft','ArrowDown'].includes(event.key)){
    event.preventDefault();padding(Number(el<HTMLInputElement>('padding').value)+(['ArrowRight','ArrowUp'].includes(event.key)?step:-step));
  }
};
// Figma can give body a viewport-sized minimum. Measure our own flow-root instead;
// its padding and visible content determine its height independently of the iframe.
const content=el('panel-content');
let fitPending=false;
function fitHeight(){
  if(fitPending)return;
  fitPending=true;
  // A timer also runs when the host throttles animation frames in an iframe.
  setTimeout(()=>{
    fitPending=false;
    send({type:'resize',height:Math.ceil(content.getBoundingClientRect().height)});
  },0);
}
const grip=el('window-resize');
grip.onclick=()=>grip.focus();
let resize:{id:number;x:number;y:number;width:number;height:number}|null=null;
grip.onpointerdown=(event:PointerEvent)=>{
  if(event.button!==0)return;event.preventDefault();grip.focus();grip.setPointerCapture(event.pointerId);
  grip.title='resizing window';resize={id:event.pointerId,x:event.clientX,y:event.clientY,width:window.innerWidth,height:window.innerHeight};
};
grip.onpointermove=(event:PointerEvent)=>{
  if(!resize||resize.id!==event.pointerId)return;
  if(event.buttons===0){endResize(event);return;}
  const width=resize.width+event.clientX-resize.x,height=resize.height+event.clientY-resize.y;
  grip.title=`resize window · ${Math.round(width)} × ${Math.round(height)}`;
  send({type:'resize',width,height});
};
function endResize(event:PointerEvent){
  if(resize?.id!==event.pointerId)return;
  resize=null;grip.title='drag to resize window';if(grip.hasPointerCapture(event.pointerId))grip.releasePointerCapture(event.pointerId);
}
grip.onpointerup=endResize;grip.onpointercancel=endResize;grip.onlostpointercapture=endResize;
window.onpointerup=(event:PointerEvent)=>{endScrub(event);endResize(event);};
grip.onkeydown=(event:KeyboardEvent)=>{
  if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key))return;
  event.preventDefault();const step=event.shiftKey?50:10;
  send({type:'resize',width:window.innerWidth+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),height:window.innerHeight+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)});
};
el<HTMLDetailsElement>('more').ontoggle=fitHeight;
el<HTMLDetailsElement>('diagnostics').ontoggle=()=>{
  if(el<HTMLDetailsElement>('more').open)fitHeight();
};
// Observe content changes (fonts, status wrapping, textarea size), never the viewport.
// A height-only manual resize leaves content unchanged, so it cannot feed back here.
new ResizeObserver(()=>{if(!resize)fitHeight();}).observe(content);
send({type:'ui-ready'});

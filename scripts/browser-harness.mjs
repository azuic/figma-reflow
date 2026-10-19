import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const harness=`<!doctype html><html><head><meta charset="utf-8"><title>Dynamic Reflow browser verification</title></head><body style="font:15px system-ui;padding:30px;background:#eee"><h1>Plugin panel + Pretext worker verification</h1><p id="result">Running…</p><pre id="details"></pre><iframe id="panel" sandbox="allow-scripts" src="/ui.html" style="width:365px;height:790px;border:1px solid #aaa;background:white"></iframe><script>
const frame=document.querySelector('iframe'),result=document.querySelector('#result'),details=document.querySelector('#details');
const report={layouts:0,measurementBatches:0,nativeStrings:0,workerUsed:false};
const width=text=>Array.from(text).reduce((n,c)=>n+(/\\s/.test(c)?4:8),0);
const snapshot={revision:1,styleKey:'fixture-native-16',text:'Move the obstacle to reflow editable text. '.repeat(18),fontSize:16,width:360,height:700,lineHeight:24,padding:12,polygons:[[{x:100,y:50},{x:210,y:50},{x:210,y:260},{x:100,y:260}]]};
let first;const send=m=>frame.contentWindow.postMessage({pluginMessage:m},'*');
window.addEventListener('message',e=>{if(e.source!==frame.contentWindow)return;const m=e.data.pluginMessage;if(!m)return;
 if(m.type==='metrics-request'){report.measurementBatches++;report.nativeStrings+=m.texts.length;send({type:'metrics',requestId:m.requestId,values:Object.fromEntries(m.texts.map(t=>[t,{width:width(t)}]))});}
 if(m.type==='layout-error'){result.textContent='FAIL: '+m.message;result.style.color='red';}
 if(m.type==='layout'){
  report.layouts++;report.workerUsed=true;
  if(m.fragments.some(f=>width(f.text)>f.slotWidth+.01)){result.textContent='FAIL: overflowing native fragment';return;}
  if(!first){first=JSON.stringify(m.fragments);send({type:'snapshot',snapshot:{...snapshot,revision:2,polygons:[[{x:170,y:180},{x:330,y:180},{x:330,y:420},{x:170,y:420}]]}});}
  else{report.geometryChangedLayout=JSON.stringify(m.fragments)!==first;result.textContent=report.geometryChangedLayout?'PASS: panel, worker, mock Figma measurement bridge, movement and resize layout':'FAIL: layout did not change';result.style.color=report.geometryChangedLayout?'green':'red';send({type:'status',message:'Browser fixture passed. Real Figma dragging remains unverified.',live:false});details.textContent=JSON.stringify(report,null,2);}
 }
});
frame.addEventListener('load',()=>{send({type:'bound',text:snapshot.text,padding:12,sourceName:'Browser fixture',obstacles:1});send({type:'status',message:'Testing worker…',live:true});send({type:'snapshot',snapshot});});
setTimeout(()=>{if(!report.layouts)result.textContent='FAIL: worker produced no layout within 15 seconds';},15000);
</script></body></html>`;
const server=createServer(async(req,res)=>{
 try{if(req.url==='/ui.html'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline'; worker-src blob: data:; font-src data:; connect-src 'none'");res.end(await readFile('dist/ui.html'));}else{res.setHeader('Content-Type','text/html');res.end(harness);}}
 catch(e){res.statusCode=500;res.end(String(e));}
});
server.listen(4187,'127.0.0.1',()=>console.log('Browser harness: http://127.0.0.1:4187'));

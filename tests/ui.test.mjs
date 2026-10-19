import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
async function panel(){
 const html=await readFile('dist/ui.html','utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1];
 const elements=new Map(),outbound=[],workerMessages=[],frames=[];
 let contentHeight=620;
 const document={getElementById(id){
  if(!elements.has(id)){const captures=new Set();elements.set(id,{textContent:'',value:'',disabled:false,dataset:{},open:false,getBoundingClientRect:()=>({height:contentHeight}),focus(){},setAttribute(k,v){this[k]=v},setPointerCapture(id){captures.add(id)},hasPointerCapture(id){return captures.has(id)},releasePointerCapture(id){captures.delete(id)}});}
  return elements.get(id);
 }};
 // Match Figma's viewport-sized body: only the inner content shrinks.
 document.body={getBoundingClientRect:()=>({height:900})};
 const scope={document,setTimeout:callback=>frames.push(callback),ResizeObserver:class{observe(){}},parent:{postMessage:m=>outbound.push(m.pluginMessage)},window:{innerWidth:340,innerHeight:320},Worker:class{postMessage(m){workerMessages.push(m)}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Blob:class{}};
 vm.runInNewContext(script,scope);
 const message=m=>scope.window.onmessage({source:null,data:{pluginMessage:m}});
 return {elements,outbound,workerMessages,scope,message,setContentHeight:height=>contentHeight=height,flushLayout:()=>frames.splice(0).forEach(callback=>callback())};
}
test('panel accepts native messages, preserves layer/source case and uses a single lowercase Start/Stop action',async()=>{
 const {elements,outbound,workerMessages,scope,message}=await panel();
 assert.equal(typeof scope.window.onmessage,'function');assert.equal(outbound.at(-1).type,'ui-ready');
 message({type:'status',message:'Ready from native host',live:false});
 assert.equal(elements.get('status').textContent,'select both layers to begin.');
 message({type:'selection',sourceName:'Title',shapeNames:[],ready:false});
 assert.equal(elements.get('text-pill').dataset.active,'true');assert.equal(elements.get('shape-pill').dataset.active,'false');assert.equal(elements.get('toggle').disabled,true);
 message({type:'bound',text:'Complete SOURCE',padding:14,sourceName:'Source',obstacles:2,shapeNames:['Circle','Card']});
 assert.equal(elements.get('text').value,'Complete SOURCE');assert.equal(elements.get('toggle').disabled,false);
 assert.equal(elements.get('text-name').textContent,'Source');assert.equal(elements.get('shape-name').textContent,'Circle +1');
 assert.equal(elements.get('shape-pill').title,'Circle, Card · click to replace');
 elements.get('toggle').onclick();assert.equal(outbound.at(-1).type,'start-selection');
 message({type:'status',message:'Live · 40 text fragments',live:true});
 assert.equal(elements.get('toggle').textContent,'stop reflow');assert.equal(elements.get('detail-status').textContent,'live · 40 text fragments');elements.get('toggle').onclick();assert.equal(outbound.at(-1).type,'stop');
 message({type:'snapshot',snapshot:{revision:9}});assert.equal(workerMessages.at(-1).snapshot.revision,9);
});
test('padding field supports scrubbing, fine control, typed values and keyboard adjustments',async()=>{
 const {elements,outbound}=await panel(),box=elements.get('padding-box'),input=elements.get('padding');
 input.value='12';const event=(props={})=>({button:0,pointerId:1,clientX:100,clientY:100,target:box,preventDefault(){},...props});
 box.onpointerdown(event());box.onpointermove(event({clientX:126}));assert.equal(input.value,'38');assert.equal(outbound.at(-1).value,38);
 box.onpointermove(event({clientX:150,shiftKey:true}));assert.equal(input.value,'17');box.onpointermove(event({buttons:0,clientX:180}));assert.equal(box.dataset.scrubbing,'false');assert.equal(input.value,'17','released pointer must stop changing padding');
 input.value='250';input.onchange();assert.equal(input.value,'200');
 elements.get('padding-scrub').onkeydown({key:'ArrowLeft',shiftKey:true,preventDefault(){}});assert.equal(input.value,'190');
 const count=outbound.length;box.onpointerdown(event({target:input}));box.onpointermove(event({clientX:130}));assert.equal(outbound.length,count,'typing target must not initiate a scrub');
});
test('window corner supports two-dimensional resizing and stops when released',async()=>{
 const {elements,outbound}=await panel(),grip=elements.get('window-resize');
 const event=(props={})=>({button:0,pointerId:2,clientX:330,clientY:310,preventDefault(){},...props});
 grip.onpointerdown(event());grip.onpointermove(event({clientX:430,clientY:410}));
 assert.equal(outbound.at(-1).width,440);assert.equal(outbound.at(-1).height,420);grip.onpointermove(event({buttons:0,clientX:500,clientY:500}));assert.equal(outbound.at(-1).width,440,'released pointer must stop resizing');
 grip.onkeydown({key:'ArrowDown',shiftKey:true,preventDefault(){}});assert.equal(outbound.at(-1).height,370);
});

test('more and diagnostics shrink to content after manual resize and retain the chosen width',async()=>{
 const {elements,outbound,scope,setContentHeight,flushLayout}=await panel();
 const grip=elements.get('window-resize'),more=elements.get('more'),diagnostics=elements.get('diagnostics');
 grip.onkeydown({key:'ArrowDown',shiftKey:true,preventDefault(){}});
 scope.window.innerWidth=480;scope.window.innerHeight=900;
 more.open=true;more.ontoggle();flushLayout();
 assert.equal(outbound.at(-1).height,620);assert.equal(outbound.at(-1).width,undefined);
 diagnostics.open=true;diagnostics.ontoggle();setContentHeight(740);flushLayout();
 assert.equal(outbound.at(-1).height,740,'measure after layout settles');
 diagnostics.open=false;diagnostics.ontoggle();setContentHeight(620);flushLayout();
 assert.equal(outbound.at(-1).height,620,'closing diagnostics must shrink');
 more.open=false;more.ontoggle();setContentHeight(300);flushLayout();
 assert.equal(outbound.at(-1).height,300,'closing more must use natural height, not the tall viewport');
 assert.equal(outbound.at(-1).width,undefined,'disclosure fitting must not overwrite the chosen width');
 const count=outbound.length;diagnostics.ontoggle();flushLayout();assert.equal(outbound.length,count,'hidden diagnostics must not resize the closed panel');
 more.open=true;more.ontoggle();diagnostics.open=true;diagnostics.ontoggle();setContentHeight(740);flushLayout();
 assert.equal(outbound.length,count+1,'nested toggles must coalesce into one resize');
});

test('selection pills request individual replacement and keep Start disabled until the pick completes',async()=>{
 const {elements,outbound,message}=await panel();
 message({type:'bound',text:'Article',padding:12,sourceName:'Article',shapeNames:['Photo'],obstacles:1});
 elements.get('text-pill').onclick();assert.equal(outbound.at(-1).type,'pick');assert.equal(outbound.at(-1).kind,'text');
 message({type:'selection',sourceName:null,shapeNames:['Photo'],ready:false,picking:'text',staged:true});
 assert.equal(elements.get('toggle').disabled,true);assert.equal(elements.get('status').textContent,'select a text layer on the canvas.');assert.equal(elements.get('text-pill').dataset.picking,'true');
 message({type:'selection',sourceName:'New Article',shapeNames:['Photo'],ready:true,picking:null,staged:true});
 assert.equal(elements.get('toggle').disabled,false);assert.equal(elements.get('text-name').textContent,'New Article');
 elements.get('shape-pill').onclick();assert.equal(outbound.at(-1).kind,'shape');
});

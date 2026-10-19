import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=await readFile('dist/code.js','utf8');
function harness(){
 const nodes=new Map(),messages=[],timers=[],events={},sizes=[];let id=0;
 class Node{
  constructor(type){this.type=type;this.id=String(++id);this.name=type;this.parent=null;this.children=[];this.data={};this.visible=true;this.removed=false;this.width=300;this.height=240;this.relativeTransform=[[1,0,0],[0,1,0]];nodes.set(this.id,this);}
  appendChild(n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);this.children.push(n);n.parent=this;}
  get x(){return this.relativeTransform[0][2]} set x(v){this.relativeTransform[0][2]=v}
  get y(){return this.relativeTransform[1][2]} set y(v){this.relativeTransform[1][2]=v}
  get absoluteTransform(){return this.relativeTransform}
  get absoluteBoundingBox(){return{x:this.x,y:this.y,width:this.width,height:this.height}}
  setPluginData(k,v){this.data[k]=v}getPluginData(k){return this.data[k]||''}setRelaunchData(){}
  resize(w,h){this.width=w;this.height=h}on(){}off(){}
  remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);for(const n of this.children)n.remove()}
 }
 class Text extends Node{
  constructor(){super('TEXT');this.fontName={family:'Inter',style:'Regular'};this.fontSize=16;this.lineHeight={unit:'PIXELS',value:24};this.letterSpacing={unit:'PIXELS',value:0};this.fills=[];this.textCase='ORIGINAL';this.textDecoration='NONE';this.textAlignHorizontal='LEFT';this.paragraphIndent=0;this.paragraphSpacing=0;this.listSpacing=0;this.hasMissingFont=false;this.opacity=1;this._characters='Original complete source. Never split this node.';}
  get characters(){return this._characters}set characters(t){this._characters=t;if(this.textAutoResize==='WIDTH_AND_HEIGHT'){this.width=t.length*7;this.height=24}}
  getStyledTextSegments(keys){return[{listOptions:{type:'NONE'},fontName:this.fontName}]}
  clone(){const n=new Text();for(const k of ['fontName','fontSize','lineHeight','letterSpacing','fills','textCase','textDecoration','textAlignHorizontal','paragraphIndent','paragraphSpacing','listSpacing','opacity','width','height','visible','relativeTransform'])n[k]=structuredClone(this[k]);n._characters=this._characters;n.data={...this.data};this.parent.appendChild(n);return n}
 }
 const page=new Node('PAGE');page.selection=[];const root=new Node('DOCUMENT');root.appendChild(page);
 const source=new Text();page.appendChild(source);const shape=new Node('RECTANGLE');shape.width=50;shape.height=60;shape.x=100;shape.y=50;page.appendChild(shape);const unrelated=new Node('RECTANGLE');page.appendChild(unrelated);page.selection=[source,shape];
 const figma={currentPage:page,root,mixed:Symbol('mixed'),ui:{postMessage:m=>messages.push(m),resize:(width,height)=>sizes.push({width,height})},showUI(){},on:(e,f)=>events[e]=f,loadFontAsync:async()=>{},getNodeByIdAsync:async id=>nodes.get(id)?.removed?null:nodes.get(id)||null,createFrame(){const f=new Node('FRAME');page.appendChild(f);return f},commitUndo(){},viewport:{center:{x:0,y:0},scrollAndZoomIntoView(){}},createText(){const n=new Text();page.appendChild(n);return n},createRectangle(){const n=new Node('RECTANGLE');page.appendChild(n);return n},createEllipse(){const n=new Node('ELLIPSE');page.appendChild(n);return n}};
 vm.runInNewContext(code,{figma,__html__:'',console,setInterval:f=>{timers.push(f)},setTimeout,Date,Set,Map,Promise,Math,JSON,Error,Number});
 const drain=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r))};
 const send=async message=>{figma.ui.onmessage(message);await drain()};
 const snapshot=()=>messages.filter(m=>m.type==='snapshot').at(-1)?.snapshot;
 const frame=()=>page.children.find(n=>n.getPluginData('role')==='output');
 return{source,shape,unrelated,page,figma,Node,messages,timers,send,snapshot,frame,drain,events,sizes};
}
test('preserves source text and shapes, rejects stale output, stops writes, resumes and safely cleans foreign children',async()=>{
 const h=harness(),text=h.source.characters;
 await h.send({type:'bind'});await h.send({type:'start'});const s=h.snapshot();assert.ok(s);
 const fragments=[{text:'Native text',x:0,y:0,width:77,slotWidth:90}];
 await h.send({type:'layout',snapshot:{...s,revision:s.revision-1},fragments,overflow:false,measurements:1});assert.equal(h.frame(),undefined);
 await h.send({type:'layout',snapshot:s,fragments,overflow:false,measurements:1});assert.ok(h.frame());assert.equal(h.source.visible,true);assert.equal(h.source.opacity,0);assert.equal(h.source.characters,text);assert.equal(h.shape.removed,false);assert.equal(h.unrelated.removed,false);
 const output=h.frame();const foreign=new h.Node('RECTANGLE');output.appendChild(foreign);
 await h.send({type:'stop'});const before=output.children.length;await h.send({type:'layout',snapshot:s,fragments:[],overflow:false});assert.equal(output.children.length,before);
 h.page.selection=[output];await h.send({type:'bind'});assert.ok(h.messages.some(m=>m.type==='bound'));
 await h.send({type:'cleanup'});assert.equal(h.source.visible,true);assert.equal(h.source.opacity,1);assert.equal(h.source.characters,text);assert.equal(h.shape.removed,false);assert.equal(h.unrelated.removed,false);assert.equal(foreign.removed,false);assert.equal(output.removed,false);assert.equal(output.children.length,1);assert.equal(h.source.getPluginData('reflow-output'),'');
});
test('polling follows shape movement and resizing; generated output changes do not feed back',async()=>{
 const h=harness();await h.send({type:'bind'});await h.send({type:'start'});const first=h.snapshot();
 await h.timers[0]();await h.drain();assert.equal(h.snapshot().revision,first.revision);
 h.shape.x+=45;await h.timers[0]();await h.drain();const moved=h.snapshot();assert.ok(moved.revision>first.revision);assert.notDeepEqual(moved.polygons,first.polygons);
 h.shape.width+=35;await h.timers[0]();await h.drain();const resized=h.snapshot();assert.ok(resized.revision>moved.revision);
 await h.send({type:'layout',snapshot:resized,fragments:[{text:'Editable',x:0,y:0,width:56,slotWidth:90}],overflow:false,measurements:1});
 await h.timers[0]();await h.drain();assert.equal(h.snapshot().revision,resized.revision);
});
test('unsupported fonts and selection show errors without changing user content',async()=>{
 const h=harness();h.source.hasMissingFont=true;await h.send({type:'bind'});assert.ok(h.messages.some(m=>m.error&&/missing font/.test(m.message)));assert.equal(h.source.visible,true);assert.equal(h.frame(),undefined);
 h.source.hasMissingFont=false;h.page.selection=[h.shape];await h.send({type:'bind'});assert.ok(h.messages.some(m=>m.error&&/exactly one/.test(m.message)));
});
test('closing removes only temporary measurement nodes and retains output',async()=>{
 const h=harness();await h.send({type:'bind'});await h.send({type:'start'});await h.send({type:'layout',snapshot:h.snapshot(),fragments:[{text:'Editable',x:0,y:0,width:56,slotWidth:90}],overflow:false,measurements:1});
 h.events.close();assert.ok(h.frame());assert.equal(h.page.children.filter(n=>n.getPluginData('role')==='measurement').length,0);assert.equal(h.source.characters,'Original complete source. Never split this node.');
});
test('manual output deletion can recover the source and its original opacity',async()=>{
 const h=harness();h.source.opacity=.6;await h.send({type:'bind'});await h.send({type:'start'});await h.send({type:'layout',snapshot:h.snapshot(),fragments:[{text:'Editable',x:0,y:0,width:56,slotWidth:90}],overflow:false,measurements:1});
 assert.equal(h.source.opacity,0);h.frame().remove();h.page.selection=[h.source];await h.send({type:'bind'});await h.send({type:'cleanup'});assert.equal(h.source.opacity,.6);assert.equal(h.source.getPluginData('reflow-source-state'),'');assert.equal(h.shape.removed,false);
});
test('selection checklist tracks partial selections and Start binds the full pair in one action',async()=>{
 const h=harness();h.source.name='Article';h.shape.name='Circle';
 h.page.selection=[];await h.send({type:'ui-ready'});let state=h.messages.filter(m=>m.type==='selection').at(-1);assert.equal(state.ready,false);assert.equal(state.sourceName,null);assert.equal(state.shapeNames.length,0);
 h.page.selection=[h.source];h.events.selectionchange();await h.drain();state=h.messages.filter(m=>m.type==='selection').at(-1);assert.equal(state.sourceName,'Article');assert.equal(state.ready,false);
 h.page.selection=[h.source,h.shape];h.events.selectionchange();await h.drain();state=h.messages.filter(m=>m.type==='selection').at(-1);assert.equal(state.ready,true);assert.equal(state.shapeNames[0],'Circle');
 await h.send({type:'start-selection'});assert.ok(h.snapshot());const bound=h.messages.filter(m=>m.type==='bound').at(-1);assert.equal(bound.sourceName,'Article');assert.equal(bound.shapeNames[0],'Circle');
 h.page.selection=[h.shape];h.events.selectionchange();await h.drain();state=h.messages.filter(m=>m.type==='selection').at(-1);assert.equal(state.sourceName,'Article');assert.equal(state.ready,true);
});

test('native panel resize preserves chosen width during height-only changes and clamps unsafe sizes',async()=>{
 const h=harness();await h.send({type:'resize',width:460,height:580});assert.deepEqual(h.sizes.at(-1),{width:460,height:580});
 await h.send({type:'resize',height:620});assert.deepEqual(h.sizes.at(-1),{width:460,height:620});
 await h.send({type:'resize',width:0,height:10000});assert.deepEqual(h.sizes.at(-1),{width:280,height:1000});
});
test('individual shape and text replacement preserve the other input and leave previous output intact',async()=>{
 const h=harness();h.source.name='Article';h.shape.name='Old shape';await h.send({type:'start-selection'});
 await h.send({type:'layout',snapshot:h.snapshot(),fragments:[{text:'Editable',x:0,y:0,width:56,slotWidth:90}],overflow:false,measurements:1});
 const output=h.frame(),other=new h.Node('ELLIPSE');other.name='New shape';h.page.appendChild(other);
 await h.send({type:'pick',kind:'shape'});let state=h.messages.filter(m=>m.type==='selection').at(-1);assert.equal(state.picking,'shape');assert.equal(state.sourceName,'Article');assert.equal(state.ready,false);
 assert.equal(output.removed,false);h.page.selection=[other];h.events.selectionchange();await h.drain();state=h.messages.filter(m=>m.type==='selection').at(-1);assert.equal(state.shapeNames[0],'New shape');assert.equal(state.sourceName,'Article');assert.equal(state.ready,true);
 await h.send({type:'start-selection'});let bound=h.messages.filter(m=>m.type==='bound').at(-1);assert.equal(bound.sourceName,'Article');assert.equal(bound.shapeNames[0],'New shape');assert.equal(h.frame().id,output.id);
 const next=h.source.clone();next.name='New Article';next.setPluginData('reflow-output','');next.setPluginData('reflow-source-state','');next.opacity=1;
 await h.send({type:'pick',kind:'text'});h.page.selection=[next];h.events.selectionchange();await h.drain();await h.send({type:'start-selection'});
 bound=h.messages.filter(m=>m.type==='bound').at(-1);assert.equal(bound.sourceName,'New Article');assert.equal(bound.shapeNames[0],'New shape');assert.equal(output.removed,false);assert.equal(h.source.characters,'Original complete source. Never split this node.');
});
test('a selection pick can be cancelled by clicking the same pill again',async()=>{
 const h=harness();await h.send({type:'start-selection'});await h.send({type:'pick',kind:'text'});await h.send({type:'pick',kind:'text'});
 const state=h.messages.filter(m=>m.type==='selection').at(-1);assert.equal(state.picking??null,null);assert.notEqual(state.staged,true);assert.equal(state.ready,true);assert.equal(state.sourceName,h.source.name);
});

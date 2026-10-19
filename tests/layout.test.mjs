import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
const bundle=await build({entryPoints:['src/engine.ts','src/geometry.ts'],bundle:true,outdir:'tests/.built',format:'esm',platform:'node',target:'node20',write:false});
await mkdir(new URL('./.built/',import.meta.url),{recursive:true});
for(const f of bundle.outputFiles)await writeFile(f.path,f.text);
const {NativePretextEngine}=await import('./.built/engine.js');
const {rowSlots,inverse,transform,shapePolygon}=await import('./.built/geometry.js');
// Deliberately different from browser font widths: the engine must honor the host.
const nativeWidth=text=>[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(text)].reduce((w,{segment})=>w+(/\s/u.test(segment)?4:/[MW]/.test(segment)?13:segment.length>2?16:8),0);
const measure=async texts=>Object.fromEntries(texts.map(t=>[t,{width:nativeWidth(t)}]));
const snapshot=(overrides={})=>({revision:1,styleKey:'Inter Regular 16',text:'A moving shape changes the path of native editable text. '.repeat(12),fontSize:16,width:360,height:700,lineHeight:24,padding:10,polygons:[],...overrides});
function within(s,result){
  for(const f of result.fragments){
    assert.ok(nativeWidth(f.text)<=f.slotWidth+.01,`${f.text}: exceeds slot`);
    const slots=rowSlots(s.width,f.y,s.lineHeight,s.polygons,s.padding);
    assert.ok(slots.some(([l,r])=>f.x>=l-.01&&f.x+nativeWidth(f.text)<=r+.01),`Collision: ${JSON.stringify(f)}`);
    assert.ok(f.y+s.lineHeight<=s.height+.01);
  }
}
test('actual Pretext flows to both sides and respects supplied native metrics',async()=>{
 const engine=new NativePretextEngine();const s=snapshot({polygons:[[{x:130,y:40},{x:230,y:40},{x:230,y:260},{x:130,y:260}]]});
 const r=await engine.layout(s,measure);within(s,r);assert.ok(r.fragments.some(f=>f.x>230));assert.ok(r.fragments.some(f=>f.x===0&&f.y>260));assert.ok(r.measurements>0);
});
test('moving and resizing obstacles changes breaks without preparing text measurements again',async()=>{
 const engine=new NativePretextEngine();const a=snapshot({polygons:[shapePolygon('ELLIPSE',150,180,[[1,0,40],[0,1,30]],[[1,0,0],[0,1,0]])]});
 const first=await engine.layout(a,measure);
 const b={...a,revision:2,polygons:[shapePolygon('ELLIPSE',220,240,[[1,0,120],[0,1,100]],[[1,0,0],[0,1,0]])]};
 const second=await engine.layout(b,measure);within(a,first);within(b,second);assert.notDeepEqual(first.fragments,second.fragments);
 const third=await engine.layout(b,()=>{throw Error('identical layout must use cache');});assert.deepEqual(third.fragments,second.fragments);
});
test('overlap, fully blocked rows, overflow and outside obstacles',async()=>{
 const engine=new NativePretextEngine();const s=snapshot({height:120,polygons:[[{x:-10,y:0},{x:400,y:0},{x:400,y:50},{x:-10,y:50}]]});
 const r=await engine.layout(s,measure);within(s,r);assert.ok(r.fragments.every(f=>f.y>=72));assert.equal(r.overflow,true);
 assert.deepEqual(rowSlots(100,0,20,[[{x:200,y:0},{x:300,y:0},{x:300,y:100},{x:200,y:100}]],10),[[0,100]]);
});
test('explicit blank paragraphs are preserved and next paragraph starts on a new row',async()=>{
 const engine=new NativePretextEngine(),s=snapshot({text:'First.\n\nSecond.\nThird.',width:400,polygons:[[{x:130,y:0},{x:220,y:0},{x:220,y:300},{x:130,y:300}]]});
 const r=await engine.layout(s,measure);within(s,r);
 const first=r.fragments.find(f=>f.text==='First.'),second=r.fragments.find(f=>f.text==='Second.'),third=r.fragments.find(f=>f.text==='Third.');
 assert.ok(first&&second&&third);assert.equal(second.y-first.y,48);assert.equal(third.y-second.y,24);
});
test('Unicode, long words, nonbreaking spaces and source edits terminate safely',async()=>{
 const engine=new NativePretextEngine();for(const text of ['👩🏽‍💻 family 👨‍👩‍👧‍👦 café e\u0301 流动的文字。'.repeat(6),'supercalifragilisticexpialidocious'.repeat(8),'a\u00a0b c\tdef\nnew line']){
  const s=snapshot({text,width:90,height:1800});const r=await engine.layout(s,measure);within(s,r);assert.ok(r.fragments.length>0);
 }
});
test('rotated source/shape transforms and singular validation',()=>{
 const matrix=[[0,-1,120],[1,0,40]],inv=inverse(matrix),p={x:55,y:70};const round=transform(inv,transform(matrix,p));assert.deepEqual(round,p);
 assert.throws(()=>inverse([[0,0,1],[0,0,1]]),/singular/);
 const poly=shapePolygon('RECTANGLE',100,80,matrix,inv);assert.deepEqual(poly,[{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:0,y:80}]);
 const overlap=[[{x:10,y:-10},{x:60,y:-10},{x:60,y:40},{x:10,y:40}],[{x:40,y:-10},{x:90,y:-10},{x:90,y:40},{x:40,y:40}]];
 assert.deepEqual(rowSlots(100,0,20,overlap,0),[[0,10],[90,100]]);
});
test('narrow slivers never paint an oversized grapheme',async()=>{
 const engine=new NativePretextEngine(),s=snapshot({text:'WWWWWWW',width:8,height:100});const r=await engine.layout(s,measure);assert.equal(r.fragments.length,0);assert.equal(r.overflow,true);
});

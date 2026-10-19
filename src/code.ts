import { inverse, shapePolygon, transform } from './geometry';
import { LIMITS, type Snapshot, type Fragment, type Matrix, type Polygon } from './shared';
const OWNER='dynamic-reflow-pretext-v1', DATA='reflow-session', LINK='reflow-output', SOURCE_STATE='reflow-source-state';
type Saved={version:1;sourceId:string;obstacleIds:string[];sourceVisible:boolean;sourceOpacity:number;padding:number};
type Session={source:TextNode; obstacles:SceneNode[]; page:PageNode; output:FrameNode|null; saved:Saved};
let session:Session|null=null, probe:TextNode|null=null, live=false, busy=false, revision=0;
let padding=12, lastSignature='', lastStyle='', lastSnapshot:Snapshot|null=null;
let samples=0, changes=0, renders=0, events=0, lastMs=0;
let latestStatus={message:'Select one text box and obstacle shapes. Or create a safe demo.',error:false};
let observedPage=figma.currentPage;
let panelWidth=340,panelHeight=320;
let operation=Promise.resolve();
let picking:'text'|'shape'|null=null;
let draft:{source:TextNode|null;obstacles:SceneNode[]}|null=null;
figma.showUI(__html__,{width:340,height:320,themeColors:true});
figma.root.setRelaunchData({open:''});
function post(message:unknown){figma.ui.postMessage(message);}
function status(message:string,error=false){latestStatus={message,error};post({type:'status',message,error,live});}
function stats(){post({type:'stats',samples,changes,renders,events,lastMs,revision});}
function own(node:BaseNode,role?:string){return node.getPluginData('owner')===OWNER && (!role || node.getPluginData('role')===role);}
function mark(node:BaseNode,role:string){node.setPluginData('owner',OWNER);node.setPluginData('role',role);}
function stop(message='Stopped. Output remains editable.'){live=false;revision++;lastSnapshot=null;lastSignature='';status(message);}
function discardProbe(){if(probe&&!probe.removed)probe.remove();probe=null;}
function pageOf(node:BaseNode):PageNode|null{let n:BaseNode|null=node;while(n&&n.type!=='PAGE')n=n.parent;return n as PageNode|null;}
function styleKey(source:TextNode){
  return JSON.stringify([source.fontName,source.fontSize,source.lineHeight,source.letterSpacing,source.fills,source.textCase,source.textDecoration,source.textAlignHorizontal,source.paragraphIndent,source.paragraphSpacing,source.listSpacing,source.hasMissingFont]);
}
function validateSource(source:TextNode){
  if(source.characters.length>LIMITS.characters)throw Error('Maximum source length is 12,000 characters. Split the article into regions.');
  if(!source.characters.trim())throw Error('The selected text region is empty. Add source text first.');
  if(source.hasMissingFont)throw Error('The source uses a missing font. Install or replace that font in Figma first.');
  if(source.fontName===figma.mixed || source.fontSize===figma.mixed || source.lineHeight===figma.mixed || source.letterSpacing===figma.mixed)throw Error('Use one font, font size, line height and letter spacing per source region.');
  if(source.getStyledTextSegments(['fontName','fontSize','fills','textCase','textDecoration','letterSpacing','lineHeight']).length>1)throw Error('Mixed text styling is not supported yet. Use one uniform text style per region.');
  if(source.letterSpacing.value!==0)throw Error('This version requires letter spacing = 0 for accurate Figma/Pretext measurements.');
  if(source.textAlignHorizontal!=='LEFT')throw Error('Set the source text alignment to Left. Center, right and justified text are not supported yet.');
  if(source.textCase!=='ORIGINAL')throw Error('Use Original text case. Text-case transforms would change the measured text.');
  if(source.paragraphIndent || source.paragraphSpacing || source.listSpacing || source.getStyledTextSegments(['listOptions']).some(s=>s.listOptions.type!=='NONE'))throw Error('Remove paragraph indent, paragraph spacing and lists from the source region for this first version.');
  if(source.width<10 || source.height<10)throw Error('Resize the source text box to a region at least 10 × 10 px.');
  for(let n:BaseNode|null=source.parent;n && n.type!=='PAGE';n=n.parent)if(n.type==='INSTANCE')throw Error('Text inside an instance is unsupported. Duplicate it outside the instance first.');
}
async function setupProbe(source:TextNode){
  validateSource(source);
  const font=source.fontName as FontName;
  try{await figma.loadFontAsync(font);}catch{throw Error(`Cannot load ${font.family} ${font.style}. Install the font or choose another face.`);}
  discardProbe();
  probe=source.clone();
  figma.currentPage.appendChild(probe);
  mark(probe,'measurement');probe.name='Dynamic Reflow · temporary font measurement';
  probe.setPluginData(LINK,'');probe.visible=false;probe.locked=true;
  probe.textAutoResize='WIDTH_AND_HEIGHT';probe.textTruncation='DISABLED';probe.maxLines=null;
  probe.characters='Mg';probe.x=-100000;probe.y=-100000;
  lastStyle=styleKey(source);
}
function lineHeight(source:TextNode){
  const h=source.lineHeight as LineHeight;
  return Math.max(probe?.height||1,h.unit==='PIXELS'?h.value:h.unit==='PERCENT'?(source.fontSize as number)*h.value/100:probe?.height||1);
}
function polygons(s:Session):Polygon[]{
  const inv=inverse(s.source.absoluteTransform as Matrix);
  return s.obstacles.filter(n=>!n.removed && n.visible).map(n=>{
    // Primitive ellipses get a contour; all other selected objects use conservative boxes.
    // absoluteBoundingBox includes rotation for arbitrary vectors/groups.
    if(n.type==='RECTANGLE'||n.type==='ELLIPSE')return shapePolygon(n.type,n.width,n.height,n.absoluteTransform as Matrix,inv);
    const b=n.absoluteBoundingBox;if(!b)return [];
    return [{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}].map(p=>transform(inv,p));
  }).filter(p=>p.length>0);
}
function effectivePadding(s:Session){
  // Account conservatively for strokes. Effects/shadows are intentionally not obstacles.
  const inv=inverse(s.source.absoluteTransform as Matrix);
  let stroke=0;
  for(const n of s.obstacles){if(n.removed || !n.visible)continue;
    if('strokeWeight' in n && typeof n.strokeWeight==='number' && 'strokes' in n && n.strokes.length){
      const m=n.absoluteTransform;
      const a=transform(inv,{x:m[0][0],y:m[1][0]}), o=transform(inv,{x:0,y:0});
      const b=transform(inv,{x:m[0][1],y:m[1][1]});
      stroke=Math.max(stroke,n.strokeWeight*Math.max(Math.hypot(a.x-o.x,a.y-o.y),Math.hypot(b.x-o.x,b.y-o.y)));
    }
  }
  return padding+stroke+.5;
}
async function tick(force=false){
  if(!session || (!live&&!force) || busy)return;
  busy=true;
  try{
    const s=session;samples++;
    if(figma.currentPage.id!==s.page.id){stop('Stopped: the current page changed. Return to the source page and start again.');return;}
    if(s.source.removed){stop('Stopped: the source text was deleted. Existing output remains.');return;}
    const key=styleKey(s.source);
    validateSource(s.source);
    if(key!==lastStyle || !probe || probe.removed){await setupProbe(s.source);}
    if(session!==s)return;
    const geometry=polygons(s), height=lineHeight(s.source);
    const next={styleKey:key,text:s.source.characters,fontSize:s.source.fontSize as number,width:s.source.width,height:s.source.height,lineHeight:height,padding:effectivePadding(s),polygons:geometry};
    const signature=JSON.stringify([next,s.source.absoluteTransform,s.source.parent?.id,s.obstacles.map(n=>n.removed?'removed':n.id)]);
    if(force||signature!==lastSignature){
      changes++;lastSignature=signature;revision++;
      lastSnapshot={revision,...next};post({type:'snapshot',snapshot:lastSnapshot});
    }
    stats();
  }catch(error){stop();status(String(error instanceof Error?error.message:error),true);}
  finally{busy=false;}
}
function boundMessage(s:Session){
  return {type:'bound',text:s.source.characters,padding,sourceName:s.source.name,obstacles:s.obstacles.length,shapeNames:s.obstacles.filter(n=>!n.removed).map(n=>n.name)};
}
function currentCandidate(){
  const selected=figma.currentPage.selection.filter(n=>!own(n));
  const texts=selected.filter(n=>n.type==='TEXT');
  const shapes=selected.filter(n=>n.type!=='TEXT');
  return {sourceName:texts.length===1?texts[0].name:null,shapeNames:shapes.map(n=>n.name),ready:texts.length===1&&shapes.length>0};
}
function postDraft(){
  if(!draft)return;
  const source=draft.source&&!draft.source.removed?draft.source:null;
  const obstacles=draft.obstacles.filter(n=>!n.removed);
  post({type:'selection',sourceName:picking==='text'?null:source?.name||null,shapeNames:picking==='shape'?[]:obstacles.map(n=>n.name),ready:!picking&&!!source&&obstacles.length>0,picking,staged:true});
}
async function beginPick(kind:'text'|'shape'){
  if(kind!=='text'&&kind!=='shape')throw Error('choose text or shape.');
  if(live)stop();
  if(picking===kind){
    picking=null;
    if(draft&&session&&draft.source?.id===session.source.id&&JSON.stringify(draft.obstacles.map(n=>n.id))===JSON.stringify(session.obstacles.map(n=>n.id))){draft=null;await selectionState();}
    else postDraft();
    return;
  }
  if(!draft){
    if(!session&&figma.currentPage.selection.length===1){
      const selected=figma.currentPage.selection[0];let n:BaseNode|null=selected,resume=false;
      while(n&&n.type!=='PAGE'){if(readSaved(n)){resume=true;break;}n=n.parent;}
      if(selected.type==='TEXT'&&(selected.getPluginData(LINK)||selected.getPluginData(SOURCE_STATE)))resume=true;
      if(resume)await bind();
    }
    const selected=figma.currentPage.selection.filter(n=>!own(n));
    const texts=selected.filter((n):n is TextNode=>n.type==='TEXT');
    draft=session?{source:session.source,obstacles:[...session.obstacles]}:{source:texts.length===1?texts[0]:null,obstacles:selected.filter(n=>n.type!=='TEXT')};
  }
  picking=kind;postDraft();
}
async function selectionChanged(){
  if(picking&&draft){
    const selected=figma.currentPage.selection.filter(n=>!own(n));
    if(picking==='text'){
      const texts=selected.filter((n):n is TextNode=>n.type==='TEXT');
      if(texts.length!==1){postDraft();return;}
      draft.source=texts[0];
    }else{
      const shapes=selected.filter(n=>n.type!=='TEXT');
      if(!shapes.length){postDraft();return;}
      draft.obstacles=shapes;
    }
    picking=null;postDraft();return;
  }
  if(draft&&currentCandidate().ready){
    const selected=figma.currentPage.selection.filter(n=>!own(n));
    draft={source:selected.find((n):n is TextNode=>n.type==='TEXT')||null,obstacles:selected.filter(n=>n.type!=='TEXT')};
  }
  await selectionState();
}
let selectionRevision=0;
async function selectionState(){
  const request=++selectionRevision;
  if(draft){postDraft();return;}
  const candidate=currentCandidate();
  if(candidate.ready){post({type:'selection',...candidate});return;}
  if(session&&!session.source.removed&&session.page.id===figma.currentPage.id){
    post({type:'selection',sourceName:session.source.name,shapeNames:session.obstacles.filter(n=>!n.removed).map(n=>n.name),ready:true});return;
  }
  // A previous output or its source alone can be resumed without selecting all inputs.
  const selected=figma.currentPage.selection;
  if(selected.length===1){
    let node:BaseNode|null=selected[0],saved:Saved|null=null;
    while(node&&node.type!=='PAGE'){saved=readSaved(node);if(saved)break;node=node.parent;}
    if(!saved&&selected[0].type==='TEXT'){
      const id=selected[0].getPluginData(LINK);if(id){const output=await figma.getNodeByIdAsync(id);if(output)saved=readSaved(output);}
      if(!saved){try{const backup=JSON.parse(selected[0].getPluginData(SOURCE_STATE));if(backup.sourceId===selected[0].id)saved=backup;}catch{}}
    }
    if(saved){
      const source=await figma.getNodeByIdAsync(saved.sourceId);const shapes:SceneNode[]=[];
      for(const id of saved.obstacleIds){const n=await figma.getNodeByIdAsync(id);if(n&&'absoluteTransform' in n)shapes.push(n as SceneNode);}
      if(request!==selectionRevision)return;
      if(source&&source.type==='TEXT'){post({type:'selection',sourceName:source.name,shapeNames:shapes.map(n=>n.name),ready:true});return;}
    }
  }
  if(request===selectionRevision)post({type:'selection',...candidate});
}
function readSaved(frame:BaseNode):Saved|null{
  if(frame.type!=='FRAME'||!own(frame,'output'))return null;
  try{const d=JSON.parse(frame.getPluginData(DATA));return d.version===1&&typeof d.sourceId==='string'&&Array.isArray(d.obstacleIds)?d:null;}catch{return null;}
}
async function bind(override?:readonly SceneNode[]){
  stop('Loading selection…');
  const selection=override||figma.currentPage.selection;
  let output:FrameNode|null=null,saved:Saved|null=null;
  if(selection.length===1){
    let n:BaseNode|null=selection[0];while(n&&n.type!=='PAGE'){
      saved=readSaved(n);if(saved){output=n as FrameNode;break;}n=n.parent;
    }
    if(!saved&&selection[0].type==='TEXT'){
      const linked=await figma.getNodeByIdAsync(selection[0].getPluginData(LINK));
      if(linked){saved=readSaved(linked);if(saved?.sourceId!==selection[0].id)saved=null;if(saved)output=linked as FrameNode;}
      else{
        try{const backup=JSON.parse(selection[0].getPluginData(SOURCE_STATE));if(backup.version===1&&backup.sourceId===selection[0].id&&Array.isArray(backup.obstacleIds))saved=backup;}catch{}
      }
    }
  }
  let source:TextNode,obstacles:SceneNode[];
  if(saved){
    const n=await figma.getNodeByIdAsync(saved.sourceId);if(!n||n.type!=='TEXT')throw Error('This output’s source is missing. Select a new text region and shapes.');
    source=n;obstacles=[];
    for(const id of saved.obstacleIds){const o=await figma.getNodeByIdAsync(id);if(o&&'absoluteTransform' in o)obstacles.push(o as SceneNode);}
    padding=saved.padding;if(typeof saved.sourceOpacity!=='number')saved.sourceOpacity=source.opacity;
  }else{
    const texts=selection.filter((n):n is TextNode=>n.type==='TEXT'&&!own(n));
    if(texts.length!==1)throw Error('Select exactly one source text box and at least one obstacle shape, then press Start reflow. Or select a previous output to resume.');
    source=texts[0];obstacles=selection.filter(n=>n.id!==source.id);
    if(!obstacles.length)throw Error('Select the text box plus one or more obstacle shapes.');
    if(obstacles.some(n=>own(n)))throw Error('Generated output cannot be an obstacle. Select original shapes.');
    for(const o of obstacles){let n:BaseNode|null=source.parent;while(n){if(n.id===o.id)throw Error('An obstacle cannot contain the source text. Select shapes beside the text.');n=n.parent;}}
    saved={version:1,sourceId:source.id,obstacleIds:obstacles.map(n=>n.id),sourceVisible:source.visible,sourceOpacity:source.opacity,padding};
    try{
      const backup=JSON.parse(source.getPluginData(SOURCE_STATE));
      if(backup.sourceId===source.id&&typeof backup.sourceOpacity==='number'){
        saved.sourceOpacity=backup.sourceOpacity;saved.sourceVisible=backup.sourceVisible;
      }
    }catch{}
    const link=source.getPluginData(LINK);
    if(link){const old=await figma.getNodeByIdAsync(link);if(old&&old.type==='FRAME'&&readSaved(old)?.sourceId===source.id)output=old;}
  }
  if(obstacles.length>LIMITS.obstacles)throw Error('Use at most 40 obstacle shapes per region.');
  await setupProbe(source);
  session={source,obstacles,page:figma.currentPage,output,saved};lastSignature='';
  draft=null;picking=null;post(boundMessage(session));
  status('Ready. Start live reflow, then move or resize the selected shapes.');
}
function createOutput(s:Session){
  const frame=figma.createFrame();mark(frame,'output');frame.name='Dynamic Reflow · editable lines';frame.fills=[];frame.clipsContent=false;
  frame.setRelaunchData({open:''});s.output=frame;return frame;
}
function persist(s:Session){
  if(!s.output)return;s.saved.padding=padding;s.output.setPluginData(DATA,JSON.stringify(s.saved));s.source.setPluginData(LINK,s.output.id);s.source.setPluginData(SOURCE_STATE,JSON.stringify(s.saved));
}
async function render(snapshot:Snapshot,fragments:Fragment[],overflow:boolean,measurements:number){
  if(!session||!lastSnapshot||snapshot.revision!==revision||!live)return;
  const s=session,start=Date.now();
  if(s.source.removed){stop('Source deleted.');return;}
  // Verify inputs again. A user move after the last poll invalidates this result.
  if(styleKey(s.source)!==snapshot.styleKey||s.source.characters!==snapshot.text)return;
  const nowNext={styleKey:snapshot.styleKey,text:s.source.characters,fontSize:s.source.fontSize as number,width:s.source.width,height:s.source.height,lineHeight:lineHeight(s.source),padding:effectivePadding(s),polygons:polygons(s)};
  const nowSig=JSON.stringify([nowNext,s.source.absoluteTransform,s.source.parent?.id,s.obstacles.map(n=>n.removed?'removed':n.id)]);
  if(nowSig!==lastSignature){void tick(true);return;}
  if(fragments.length>LIMITS.fragments)throw Error('Too many generated lines.');
  // Figma requires existing fonts loaded before changing reused text nodes, even
  // when their replacement style uses another face.
  if(s.output&&!s.output.removed){
    const fonts=new Map<string,FontName>();
    for(const n of s.output.children)if(n.type==='TEXT'&&own(n,'line'))
      for(const segment of n.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(segment.fontName),segment.fontName);
    for(const font of fonts.values()){
      try{await figma.loadFontAsync(font);}catch{throw Error(`Cannot load the previous output font ${font.family} ${font.style}. Restore that font or remove output and regenerate.`);}
    }
  }
  if(snapshot.revision!==revision||!live||session!==s)return;
  const frame=s.output&&!s.output.removed?s.output:createOutput(s);
  frame.resize(snapshot.width,snapshot.height);frame.relativeTransform=s.source.absoluteTransform;frame.visible=true;
  const owned=frame.children.filter((n):n is TextNode=>n.type==='TEXT'&&own(n,'line'));
  let used=0;
  for(const f of fragments){
    if(!f.text)continue;
    if(![f.x,f.y,f.slotWidth].every(Number.isFinite)||f.x<0||f.y<0||f.x+f.slotWidth>snapshot.width+.01||f.y+snapshot.lineHeight>snapshot.height+.01)throw Error('Invalid layout coordinates.');
    let line=owned[used];
    if(!line){line=s.source.clone();frame.appendChild(line);mark(line,'line');line.setPluginData(LINK,'');line.locked=false;line.visible=true;line.opacity=s.saved.sourceOpacity;}
    // Reset style after native source font/paint changes; source is uniform by validation.
    line.opacity=s.saved.sourceOpacity;line.visible=true;
    line.fontName=s.source.fontName as FontName;line.fontSize=s.source.fontSize as number;line.fills=JSON.parse(JSON.stringify(s.source.fills));
    line.lineHeight=s.source.lineHeight as LineHeight;line.textDecoration=s.source.textDecoration as TextDecoration;
    line.textAutoResize='WIDTH_AND_HEIGHT';line.textTruncation='DISABLED';line.maxLines=null;
    line.relativeTransform=[[1,0,f.x],[0,1,f.y]];
    if(line.characters!==f.text)line.characters=f.text;
    if(line.width>f.slotWidth+.01)throw Error('Native text exceeded its measured slot. Stop and regenerate; try a different font.');
    line.name=`Line ${used+1} · ${f.text.slice(0,32)}`;used++;
  }
  for(const extra of owned.slice(used))extra.remove();
  // Opacity preserves the source's participation in auto layout. Hidden nodes collapse it.
  s.source.opacity=0;persist(s);renders++;lastMs=Date.now()-start;
  status(`Live · ${used} text fragments${overflow?' · OVERFLOW: enlarge the source box':''} · ${measurements} font measurements`);
  stats();
}
async function measure(message:{requestId:number;styleKey:string;texts:string[]}){
  if(!session||!probe||probe.removed||message.styleKey!==lastStyle)throw Error('Source style changed; retrying the latest layout.');
  if(!Array.isArray(message.texts)||message.texts.length>LIMITS.measurements)throw Error('Invalid measurement batch.');
  const active=probe,values:Record<string,{width:number}>=Object.create(null);
  for(let i=0;i<message.texts.length;i++){
    const text=message.texts[i];if(typeof text!=='string'||text.length>LIMITS.characters)throw Error('Invalid measurement text.');
    if(active.removed||active!==probe)throw Error('Measurement cancelled.');
    active.characters=text||' ';values[text]={width:text?active.width:0};
    if(i%100===99)await new Promise(resolve=>setTimeout(resolve,0));
  }
  active.characters='Mg';post({type:'metrics',requestId:message.requestId,values});
}
async function cleanup(){
  draft=null;picking=null;stop();if(!session)throw Error('Load a previous output or its source first.');
  const s=session,frame=s.output;
  if(frame&&!frame.removed){
    // Never remove foreign content a user may have added to the output frame.
    for(const n of [...frame.children])if(own(n,'line'))n.remove();
    if(!frame.children.length)frame.remove();else{frame.setPluginData(DATA,'');frame.setPluginData('owner','');frame.name='Preserved user content · former reflow frame';frame.visible=true;}
  }
  if(!s.source.removed){s.source.visible=s.saved.sourceVisible;s.source.opacity=s.saved.sourceOpacity;s.source.setPluginData(LINK,'');s.source.setPluginData(SOURCE_STATE,'');}
  discardProbe();session=null;post({type:'unbound'});status('Generated output removed. Source text and obstacle shapes preserved.');figma.commitUndo();await selectionState();
}
async function demo(){
  draft=null;picking=null;stop();await figma.loadFontAsync({family:'Inter',style:'Regular'});
  const right=Math.max(figma.viewport.center.x,...figma.currentPage.children.map(n=>n.absoluteBoundingBox? n.absoluteBoundingBox.x+n.absoluteBoundingBox.width:0));
  const demo=figma.createFrame();demo.name='Dynamic Reflow · safe demo';demo.resize(720,780);demo.x=right+120;demo.y=figma.viewport.center.y-390;demo.fills=[{type:'SOLID',color:{r:.97,g:.96,b:.92}}];
  const text=figma.createText();demo.appendChild(text);text.fontName={family:'Inter',style:'Regular'};text.fontSize=18;text.lineHeight={unit:'PIXELS',value:27};
  text.characters=('Move the shapes and watch these words find a new path. This is editable Figma text, laid out by Cheng Lou’s Pretext engine using font widths measured inside Figma. The shapes remain yours: drag, rotate or resize them while the plugin stays open.\n\nThe full article stays in its original source layer. Generated line fragments can be edited after stopping live reflow. Keep writing, keep moving, and let the page respond.\n\n').repeat(3);
  text.textAutoResize='NONE';text.resize(624,684);text.x=48;text.y=48;text.name='Source · resize this text box';
  const ellipse=figma.createEllipse();demo.appendChild(ellipse);ellipse.resize(200,200);ellipse.x=240;ellipse.y=100;ellipse.name='Move me · ellipse';ellipse.fills=[{type:'SOLID',color:{r:.95,g:.36,b:.16}}];
  const rect=figma.createRectangle();demo.appendChild(rect);rect.resize(140,150);rect.x=455;rect.y=420;rect.rotation=16;rect.name='Resize me · rectangle';rect.fills=[{type:'SOLID',color:{r:.22,g:.34,b:.85}}];
  figma.currentPage.selection=[text,ellipse,rect];figma.viewport.scrollAndZoomIntoView([demo]);await bind();status('Demo ready. Start live reflow, then drag the orange ellipse or resize the blue rectangle.');
}
const pageListener=(event:NodeChangeEvent)=>{
  if(!session)return;const ids=new Set([session.source.id,...session.obstacles.map(n=>n.id)]);
  events+=event.nodeChanges.filter(c=>ids.has(c.id)).length;
};
observedPage.on('nodechange',pageListener);
figma.on('selectionchange',()=>{void selectionChanged();});
figma.on('currentpagechange',()=>{observedPage.off('nodechange',pageListener);observedPage=figma.currentPage;observedPage.on('nodechange',pageListener);stop('Stopped: page changed.');discardProbe();session=null;draft=null;picking=null;post({type:'unbound'});void selectionState();});
figma.on('close',()=>{discardProbe();});
setInterval(()=>{void tick();},120);
figma.ui.onmessage=(message)=>{
  if(message.type==='stop'){stop();figma.commitUndo();return;}
  operation=operation.then(async()=>{
    switch(message.type){
      case 'ui-ready':
        if(session&&!session.source.removed)post(boundMessage(session));
        await selectionState();
        post({type:'status',...latestStatus,live});stats();
        break;
      case 'resize':
        if(Number.isFinite(message.width))panelWidth=Math.max(280,Math.min(800,Math.round(message.width)));
        if(Number.isFinite(message.height))panelHeight=Math.max(280,Math.min(1000,Math.round(message.height)));
        figma.ui.resize(panelWidth,panelHeight);break;
      case 'pick':await beginPick(message.kind);break;
      case 'start-selection':
        if(picking)throw Error('finish selecting the layer on the canvas first.');
        if(draft){
          if(!draft.source||draft.source.removed||!draft.obstacles.length)throw Error('select a text layer and a shape first.');
          await bind([draft.source,...draft.obstacles.filter(n=>!n.removed)]);
        }else if(currentCandidate().ready||!session)await bind();
        live=true;status('Preparing live reflow…');await tick(true);break;
      case 'bind':await bind();break;
      case 'demo':await demo();break;
      case 'start':if(!session)throw Error('Select a text layer and shape, or choose More → Create demo.');live=true;status('Preparing live reflow…');await tick(true);break;
      case 'padding':if(!Number.isFinite(message.value)||message.value<0||message.value>200)throw Error('Padding must be between 0 and 200 px.');padding=message.value;if(session)persist(session);if(live)await tick(true);break;
      case 'apply-text':if(!session)throw Error('Load a source first.');if(typeof message.text!=='string'||message.text.length>LIMITS.characters)throw Error('Maximum text length is 12,000 characters.');await figma.loadFontAsync(session.source.fontName as FontName);session.source.characters=message.text;if(live)await tick(true);else status('Source text updated. Start live reflow to regenerate.');break;
      case 'metrics-request':try{await measure(message);}catch(e){post({type:'metrics-error',requestId:message.requestId,message:String(e)});}break;
      case 'layout':await render(message.snapshot,message.fragments,message.overflow,message.measurements);break;
      case 'layout-error':if(message.revision===revision){stop();status(message.message,true);}break;
      case 'cleanup':await cleanup();break;
      case 'edit-source':if(!session)throw Error('Load a source first.');stop('Source revealed. Edit it on the canvas, then start live reflow.');session.source.visible=true;session.source.opacity=session.saved.sourceOpacity;if(session.output&&!session.output.removed)session.output.visible=false;figma.currentPage.selection=[session.source];break;
      case 'regenerate':if(!session)throw Error('Load a source first.');live=true;status('Preparing live reflow…');await tick(true);break;
    }
  }).catch(error=>{stop();status(error instanceof Error?error.message:String(error),true);});
};
status('Select one text box and obstacle shapes. Or create a safe demo.');

import {NativePretextEngine,type Metrics} from './engine';
import type {Snapshot} from './shared';
const engine=new NativePretextEngine();
let pending:Snapshot|null=null,running=false,live=false,requestId=0;
const requests=new Map<number,{resolve:(v:Record<string,Metrics>)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
const send=(m:unknown)=>postMessage(m);
async function process(){
  if(running)return;running=true;
  try{while(pending){
    const s=pending;pending=null;
    try{
      const result=await engine.layout(s,texts=>new Promise((resolve,reject)=>{
        const id=++requestId;
        const timer=setTimeout(()=>{requests.delete(id);reject(Error('Font measurements timed out. Stop and restart the plugin.'));},20000);
        requests.set(id,{resolve,reject,timer});send({type:'metrics-request',requestId:id,styleKey:s.styleKey,texts});
      }));
      if(!pending&&live)send({type:'layout',snapshot:s,...result});
    }catch(error){if(!pending&&live)send({type:'layout-error',revision:s.revision,message:error instanceof Error?error.message:String(error)});}
  }}finally{running=false;}
}
onmessage=(event:MessageEvent)=>{
  const m=event.data;
  if(m.type==='snapshot'){pending=m.snapshot;live=true;void process();}
  if(m.type==='stop'){live=false;pending=null;}
  if(m.type==='metrics'||m.type==='metrics-error'){
    const request=requests.get(m.requestId);if(!request)return;requests.delete(m.requestId);clearTimeout(request.timer);
    if(m.type==='metrics')request.resolve(m.values);else request.reject(Error(m.message));
  }
};

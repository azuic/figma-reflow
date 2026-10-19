import { clearCache, prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext';
import { rowSlots } from './geometry';
import { LIMITS, type Snapshot, type Fragment } from './shared';
export type Metrics = { width:number };
export type Measure = (texts:string[])=>Promise<Record<string,Metrics>>;
// The documented Pretext OffscreenCanvas adapter. Every width is supplied by Figma,
// never by browser canvas/font fallback. No Pretext source changes or fork.
export class NativePretextEngine {
  private metrics = new Map<string,Metrics>();
  private missing = new Set<string>();
  private key='';
  private size=16;
  private prepared?:PreparedTextWithSegments;
  private requests=0;
  constructor() {
    const self=this;
    (globalThis as unknown as {OffscreenCanvas:unknown}).OffscreenCanvas=class {
      getContext() { return { font:'16px "FigmaNative"', measureText(text:string) {
        const value=self.metrics.get(text);
        if(!value) self.missing.add(text);
        return {width:value?.width ?? Array.from(text).length*self.size*.55};
      }}; }
    };
  }
  async layout(s:Snapshot, measure:Measure):Promise<{fragments:Fragment[]; overflow:boolean; measurements:number}> {
    if(this.key!==s.styleKey+'\0'+s.text) {
      this.key=s.styleKey+'\0'+s.text; this.metrics.clear(); this.prepared=undefined; this.requests=0; clearCache();
    }
    this.size=s.fontSize;
    // Missing measurements are collected in batches; provisional lines are NEVER rendered.
    for(let pass=0;pass<16;pass++) {
      this.missing.clear();
      if(!this.prepared) this.prepared=prepareWithSegments(s.text, `${s.fontSize}px "FigmaNative"`, {whiteSpace:'pre-wrap'});
      const fragments:Fragment[]=[];
      let cursor:LayoutCursor={segmentIndex:0,graphemeIndex:0}, done=false;
      for(let row=0;row<LIMITS.rows && (row+1)*s.lineHeight<=s.height+.001;row++) {
        const y=row*s.lineHeight;
        for(const [left,right] of rowSlots(s.width,y,s.lineHeight,s.polygons,s.padding)) {
          const capacity=right-left-.5;
          if(capacity<=0) continue;
          let budget=capacity, accepted=false;
          for(let fit=0;fit<24;fit++) {
            const line=layoutNextLine(this.prepared,budget,cursor);
            if(!line) {done=true;break;}
            if(line.end.segmentIndex===cursor.segmentIndex && line.end.graphemeIndex===cursor.graphemeIndex) break;
            const actual=this.metrics.get(line.text);
            if(!actual) this.missing.add(line.text);
            const width=actual?.width ?? line.width;
            if(width<=capacity+.001) {
              fragments.push({text:line.text,x:left,y,width,slotWidth:right-left});
              cursor=line.end; accepted=true;
              // A hard paragraph break must advance the row, even with a second slot.
              const hardBreak = this.prepared.kinds[line.end.segmentIndex-1]==='hard-break';
              if(hardBreak) break;
              break;
            }
            budget-=Math.max(.5,width-capacity+.5);
            if(budget<.5) break;
          }
          if(done || (accepted && this.prepared.kinds[cursor.segmentIndex-1]==='hard-break')) break;
          if(fragments.length>=LIMITS.fragments) break;
        }
        if(done || fragments.length>=LIMITS.fragments) break;
      }
      const overflow=layoutNextLine(this.prepared,s.width,cursor)!==null;
      if(!this.missing.size) return {fragments,overflow,measurements:this.requests};
      const texts=[...this.missing];
      this.requests+=texts.length;
      if(this.requests>LIMITS.measurements) throw Error('Text needs too many measurements. Use a smaller region or shorter source (maximum 12,000 characters).');
      const values=await measure(texts);
      for(const text of texts) {
        const value=values[text];
        if(!value || !Number.isFinite(value.width) || value.width<0) throw Error('Figma returned an invalid font measurement.');
        this.metrics.set(text,value);
      }
      this.prepared=undefined; clearCache();
    }
    throw Error('Font measurement did not converge. Try shorter text or a different font.');
  }
}

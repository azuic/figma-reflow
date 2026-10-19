import type { Matrix, Point, Polygon } from './shared';
export function transform(m: Matrix, p: Point): Point {
  return { x: m[0][0]*p.x+m[0][1]*p.y+m[0][2], y: m[1][0]*p.x+m[1][1]*p.y+m[1][2] };
}
export function inverse(m: Matrix): Matrix {
  const [[a,c,e],[b,d,f]] = m, det = a*d-b*c;
  if (Math.abs(det)<1e-8) throw Error('The text region has a singular transform. Reset its scale.');
  return [[d/det,-c/det,(c*f-d*e)/det],[-b/det,a/det,(b*e-a*f)/det]];
}
// Conservative polygon envelope across the WHOLE row band (not just its baseline).
export function bandExtent(poly: Polygon, top: number, bottom: number): [number, number] | null {
  const xs: number[]=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i], b=poly[(i+1)%poly.length];
    if(a.y>=top && a.y<=bottom) xs.push(a.x);
    for(const y of [top,bottom]) if(a.y!==b.y && y>=Math.min(a.y,b.y) && y<=Math.max(a.y,b.y)) xs.push(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y));
  }
  return xs.length ? [Math.min(...xs),Math.max(...xs)] : null;
}
export function rowSlots(width:number, y:number, height:number, polygons:Polygon[], padding:number): [number,number][] {
  const blocks = polygons.map(p=>bandExtent(p,y-padding,y+height+padding)).filter((e):e is [number,number]=>!!e)
    .map(([l,r])=>[Math.max(0,l-padding),Math.min(width,r+padding)] as [number,number])
    .filter(([l,r])=>r>l).sort((a,b)=>a[0]-b[0]);
  let x=0; const slots:[number,number][]=[];
  for(const [l,r] of blocks) { if(l>x) slots.push([x,l]); x=Math.max(x,r); }
  if(x<width) slots.push([x,width]);
  return slots.filter(([l,r])=>r-l>=1);
}
export function shapePolygon(type:string, width:number, height:number, m:Matrix, toRegion:Matrix):Polygon {
  // Circumscribed 64-gon encloses ellipses, including their curved edges.
  const local:Point[] = type==='ELLIPSE' ? Array.from({length:64},(_,i)=>({
    x:width/2+width/2/Math.cos(Math.PI/64)*Math.cos(i*2*Math.PI/64),
    y:height/2+height/2/Math.cos(Math.PI/64)*Math.sin(i*2*Math.PI/64)
  })) : [{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}];
  return local.map(p=>transform(toRegion,transform(m,p)));
}

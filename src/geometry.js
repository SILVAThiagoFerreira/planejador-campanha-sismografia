export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export const bearing = (a,b) => (Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI+360)%360;
export const angularDifference = (a,b) => Math.abs(((a-b+540)%360)-180);
const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function convexHull(points) {
  const sorted=[...new Map(points.map(p=>[`${p.x},${p.y}`,p])).values()].sort((a,b)=>a.x-b.x||a.y-b.y);
  if(sorted.length<3)return sorted;
  const half = list => {const h=[];for(const p of list){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}return h;};
  return [...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)];
}
const contains=(c,p)=>c&&distance(c,p)<=c.radius+Math.max(1e-7,c.radius*1e-10);
const diameter=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,radius:distance(a,b)/2});
function circumcircle(a,b,c){
  const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,d=2*(bx*cy-by*cx);
  if(Math.abs(d)<1e-12)return null;
  const u=(cy*(bx*bx+by*by)-by*(cx*cx+cy*cy))/d,v=(bx*(cx*cx+cy*cy)-cx*(bx*bx+by*by))/d;
  return {x:a.x+u,y:a.y+v,radius:Math.hypot(u,v)};
}
export function smallestEnclosingCircle(points){
  if(!points.length||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('Vértices ausentes ou não finitos.');
  // Deterministic shuffle of hull vertices keeps the incremental exact algorithm efficient.
  const p=convexHull(points);let seed=123456789;
  for(let i=p.length-1;i>0;i--){seed=(1664525*seed+1013904223)>>>0;const j=seed%(i+1);[p[i],p[j]]=[p[j],p[i]];}
  let circle=null;
  for(let i=0;i<p.length;i++)if(!contains(circle,p[i])){
    circle={...p[i],radius:0};
    for(let j=0;j<i;j++)if(!contains(circle,p[j])){
      circle=diameter(p[i],p[j]);
      for(let k=0;k<j;k++)if(!contains(circle,p[k])){
        const candidate=circumcircle(p[i],p[j],p[k]);
        if(candidate)circle=candidate;
        else circle=[diameter(p[i],p[j]),diameter(p[i],p[k]),diameter(p[j],p[k])].filter(c=>[p[i],p[j],p[k]].every(v=>contains(c,v))).sort((a,b)=>a.radius-b.radius)[0];
      }
    }
  }
  return circle;
}
export function polygonCentroid(vertices){
  const ref=vertices[0];let area=0,x=0,y=0;
  for(let i=0;i<vertices.length;i++){const a={x:vertices[i].x-ref.x,y:vertices[i].y-ref.y},b={x:vertices[(i+1)%vertices.length].x-ref.x,y:vertices[(i+1)%vertices.length].y-ref.y};const k=a.x*b.y-b.x*a.y;area+=k;x+=(a.x+b.x)*k;y+=(a.y+b.y)*k;}
  if(Math.abs(area)<1e-8)throw new Error('Poligonal sem área válida.');
  return {x:ref.x+x/(3*area),y:ref.y+y/(3*area),area:Math.abs(area)/2};
}
export function distanceToPolygon(point,vertices){
  let inside=false,min=Infinity;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[j],b=vertices[i],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    min=Math.min(min,distance(point,{x:a.x+t*dx,y:a.y+t*dy}));
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside?0:min;
}
export function isSimplePolygon(v){
  const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-8&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
  for(let i=0;i<v.length;i++){
    const a=v[(i+v.length-1)%v.length],b=v[i],c=v[(i+1)%v.length];
    if(Math.abs(cross(a,b,c))<1e-8&&(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)<0)return false;
  }
  const segments=v.map((a,i)=>{const b=v[(i+1)%v.length];return {a,b,i,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};}).sort((a,b)=>a.minX-b.minX);
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length&&segments[j].minX<=segments[i].maxX;j++){
    const first=segments[i],second=segments[j];
    if(Math.abs(first.i-second.i)===1||Math.abs(first.i-second.i)===v.length-1||first.maxY<second.minY||second.maxY<first.minY)continue;
    const {a,b}=first,{a:c,b:d}=second;
    if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false;
  }
  return true;
}

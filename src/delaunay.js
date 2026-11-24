// Triangulação de Delaunay pelo método de Bowyer–Watson, sem dependências externas.
// Entrada: pontos {x,y} distintos. Saída: triângulos como trios de índices dos pontos de entrada.
// Usada pelo contorno de furos (src/holes.js). O número de pontos é o de furos de um arquivo, então
// a versão O(n²) é suficiente e fica simples de conferir.
export function delaunayTriangles(points){
  const n=points.length;
  if(n<3)return [];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
  const span=Math.max(maxX-minX,maxY-minY)||1,midX=(minX+maxX)/2,midY=(minY+maxY)/2;
  // Super-triângulo: vértices n, n+1 e n+2, removidos ao final.
  const P=[...points.map(p=>({x:p.x,y:p.y})),{x:midX-20*span,y:midY-span},{x:midX,y:midY+20*span},{x:midX+20*span,y:midY-span}];
  const circle=(a,b,c)=>{
    const ax=P[a].x,ay=P[a].y,bx=P[b].x,by=P[b].y,cx=P[c].x,cy=P[c].y;
    const d=2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
    const a2=ax*ax+ay*ay,b2=bx*bx+by*by,c2=cx*cx+cy*cy;
    const ux=(a2*(by-cy)+b2*(cy-ay)+c2*(ay-by))/d,uy=(a2*(cx-bx)+b2*(ax-cx)+c2*(bx-ax))/d;
    return {x:ux,y:uy,r2:(ax-ux)*(ax-ux)+(ay-uy)*(ay-uy)};
  };
  let tris=[{v:[n,n+1,n+2],...circle(n,n+1,n+2)}];
  for(let i=0;i<n;i++){
    const p=P[i];
    const bad=[],good=[];
    for(const t of tris){
      const dx=p.x-t.x,dy=p.y-t.y;
      // Estritamente dentro do círculo: pontos sobre a circunferência não removem o triângulo.
      if(dx*dx+dy*dy<t.r2*(1-1e-12))bad.push(t);else good.push(t);
    }
    // Arestas que pertencem a um único triângulo ruim formam a borda da cavidade.
    const count=new Map();
    for(const t of bad)for(let k=0;k<3;k++){const a=t.v[k],b=t.v[(k+1)%3];const key=a<b?`${a},${b}`:`${b},${a}`;const e=count.get(key);count.set(key,e?{a:e.a,b:e.b,c:e.c+1}:{a:Math.min(a,b),b:Math.max(a,b),c:1});}
    tris=good;
    for(const e of count.values())if(e.c===1)tris.push({v:[e.a,e.b,i],...circle(e.a,e.b,i)});
  }
  return tris.filter(t=>t.v.every(v=>v<n)).map(t=>t.v);
}

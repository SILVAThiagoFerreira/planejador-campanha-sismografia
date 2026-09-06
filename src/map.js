/** Leaflet display and a deterministic export surface for campaign reports. */
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const radians = value => value * Math.PI / 180;
const mercator = (lon,lat) => [6378137*radians(lon),6378137*Math.log(Math.tan(Math.PI/4+radians(lat)/2))];
function coordinates(polygon){return polygon.coordinates || polygon.vertices?.map(v=>[v.lon,v.lat]) || [];}
function average(points){return points.reduce((p,c)=>[p[0]+c[0]/points.length,p[1]+c[1]/points.length],[0,0]);}
function destination(lon,lat,azimuth,meters){return [lon+Math.sin(radians(azimuth))*meters/(111320*Math.cos(radians(lat))),lat+Math.cos(radians(azimuth))*meters/111320];}
function direction(polygon){return polygon.direction ?? polygon.azimuth ?? polygon.directionDeg;}
export function createCampaignMap(elementId, configuration={}) {
 const config=configuration.map || configuration, status=document.getElementById('map-status');
 const root=typeof elementId==='string'?elementId:'map';
 if(!globalThis.L)throw new Error('A biblioteca de mapas não foi carregada. Recarregue a página.');
 const map=L.map(root,{preferCanvas:true,zoomControl:true}).setView(config.center || [-9.671,-36.742],config.zoom || 14);
 const overlays=L.featureGroup().addTo(map);
 let data={polygons:[],communities:[],origin:null,radius:0,selectedIds:[]}, tileLayer=null, basemap='satellite', tileErrors=0;
 const palette={area:'#fa1232',circle:'#06d9e8',selected:'#fa1232',fixed:'#ffbf2f',available:'#254354',direction:'#ffca28',...(configuration.visual?.mapColors || {})};
 function reportStatus(message){if(status)status.textContent=message;}
 function setBasemap(mode){basemap=mode;if(tileLayer){map.removeLayer(tileLayer);tileLayer=null;}if(mode==='satellite'){
  tileErrors=0;tileLayer=L.tileLayer(config.tileUrl || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:config.maxZoom || 20,attribution:config.attribution || 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',crossOrigin:'anonymous'});
  tileLayer.on('tileerror',()=>{tileErrors++;reportStatus('Falha ao carregar parte do satélite. Verifique sua conexão ou selecione “Mapa sem imagem”.');});
  tileLayer.on('load',()=>{if(!tileErrors)reportStatus('Satélite Esri World Imagery · Consulte a data da imagem antes de decisões em campo.');});tileLayer.addTo(map);
 }else reportStatus('Mapa vetorial sem imagem de satélite. Geometrias e distâncias preservadas.');}
 function update(next){data={...data,...next};overlays.clearLayers();const selected=new Set(data.selectedIds || []);
  for(const polygon of data.polygons || []){const pts=coordinates(polygon);if(!pts.length)continue;L.polygon(pts.map(([lon,lat])=>[lat,lon]),{color:palette.area,weight:2,fillOpacity:.15}).bindTooltip(escapeHtml(polygon.name || polygon.id || 'Área de desmonte')).addTo(overlays);
   const az=direction(polygon);if(az!==null&&az!==undefined&&Number.isFinite(Number(az))){const center=average(pts),end=destination(...center,Number(az),Math.max(200,Number(data.radius || data.origin?.radius || 0)*.8));L.polyline([[center[1],center[0]],[end[1],end[0]]],{color:palette.direction,weight:3}).addTo(overlays);L.marker([end[1],end[0]],{interactive:false,icon:L.divIcon({className:'',html:`<span class="map-direction-arrow" style="display:block;transform:rotate(${Number(az)}deg)">↑</span>`,iconSize:[24,30],iconAnchor:[12,18]})}).addTo(overlays);}}
  if(data.origin&&Number.isFinite(data.origin.lat)&&Number.isFinite(data.origin.lon)){const o=data.origin;L.circle([o.lat,o.lon],{radius:Number(data.radius || o.radius || 0),color:palette.circle,weight:1.5,fill:false,dashArray:'7 4'}).addTo(overlays);L.marker([o.lat,o.lon],{icon:L.divIcon({className:'origin-marker',iconSize:[13,13],iconAnchor:[6,6]})}).bindTooltip('Origem da campanha · centro do círculo abrangente').addTo(overlays);}
  for(const community of data.communities || []){if(community.enabled===false)continue;const chosen=selected.has(community.id),fixed=community.fixed===true,lat=Number(community.lat),lon=Number(community.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
   if(chosen&&data.origin)L.polyline([[data.origin.lat,data.origin.lon],[lat,lon]],{color:'#ffffff',weight:1.5,opacity:.85,dashArray:'5 5'}).addTo(overlays);
   L.circleMarker([lat,lon],{radius:fixed?10:(chosen?8:5),color:fixed?palette.fixed:(chosen?'#fff':palette.available),weight:fixed?4:(chosen?2:1.5),fillColor:fixed?palette.selected:(chosen?palette.selected:'#fff'),fillOpacity:1}).bindTooltip(`${escapeHtml(community.name)}${fixed?' · PONTO FIXO':(chosen?' · selecionado':'')}`,{permanent:true,direction:'top',offset:[0,-5],className:'community-tooltip'}).addTo(overlays);
  }
 }
 function fit(){const bounds=overlays.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[55,65],maxZoom:16});}
 async function exportCanvas({width=1400,height=900,includeSatellite=true}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  const all=[...(data.communities||[]).filter(c=>c.enabled!==false).map(c=>[c.lon,c.lat]),...(data.polygons||[]).flatMap(coordinates)];if(data.origin)all.push([data.origin.lon,data.origin.lat]);
  if(!all.length)throw new Error('Não há pontos para exportar o mapa.');const projected=all.map(p=>mercator(...p));let minX=Math.min(...projected.map(p=>p[0])),maxX=Math.max(...projected.map(p=>p[0])),minY=Math.min(...projected.map(p=>p[1])),maxY=Math.max(...projected.map(p=>p[1]));
  const midX=(minX+maxX)/2,midY=(minY+maxY)/2;let spanX=Math.max(maxX-minX,100)*1.32,spanY=Math.max(maxY-minY,100)*1.32;if(spanX/spanY<width/height)spanX=spanY*width/height;else spanY=spanX*height/width;minX=midX-spanX/2;maxX=midX+spanX/2;minY=midY-spanY/2;maxY=midY+spanY/2;
  const xy=(lon,lat)=>{const p=mercator(lon,lat);return [(p[0]-minX)/spanX*width,(maxY-p[1])/spanY*height]};
  let satellite=false,warning=null;ctx.fillStyle='#ecf0ef';ctx.fillRect(0,0,width,height);
  if(includeSatellite&&basemap==='satellite')try{const base=config.exportUrl || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';const url=new URL(base);for(const [key,value] of Object.entries({bbox:[minX,minY,maxX,maxY].join(','),bboxSR:3857,imageSR:3857,size:`${width},${height}`,format:'jpg',f:'image'}))url.searchParams.set(key,value);
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),config.fetchTimeoutMs || 15000);let response;try{response=await fetch(url,{signal:abort.signal});}finally{clearTimeout(timer);}if(!response.ok)throw new Error(`HTTP ${response.status}`);const blob=await response.blob();if(!blob.type.startsWith('image/'))throw new Error('Resposta de satélite sem imagem');const bitmap=await createImageBitmap(blob);ctx.drawImage(bitmap,0,0,width,height);bitmap.close();satellite=true;
  }catch(error){warning=`Satélite indisponível na exportação (${error.message}). Mapa vetorial sem imagem.`;reportStatus(warning);}
  if(!satellite){ctx.strokeStyle='#d7dfdf';ctx.lineWidth=1;for(let x=0;x<width;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}for(let y=0;y<height;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}}
  const line=(points,color,widthLine=2,dashed=false)=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=widthLine;ctx.setLineDash(dashed?[8,6]:[]);ctx.stroke();ctx.setLineDash([]);};
  for(const polygon of data.polygons||[]){const raw=coordinates(polygon),points=raw.map(p=>xy(...p));if(!points.length)continue;line([...points,points[0]],palette.area,3);ctx.fillStyle='#fa123233';ctx.fill();const az=direction(polygon);if(az!==null&&az!==undefined&&Number.isFinite(Number(az))){const center=average(raw),end=destination(...center,Number(az),Math.max(200,Number(data.radius || data.origin?.radius || 0)*.8)),a=xy(...center),b=xy(...end);line([a,b],palette.direction,4);const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);line([[b[0]-16*Math.cos(angle-.5),b[1]-16*Math.sin(angle-.5)],b,[b[0]-16*Math.cos(angle+.5),b[1]-16*Math.sin(angle+.5)]],palette.direction,4);}}
  const label=(text,x,y,color='#fff')=>{ctx.font=`600 ${Math.max(13,width/90)}px Arial`;ctx.lineWidth=4;ctx.strokeStyle='#263441';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);};
  if(data.origin){const o=data.origin,p=xy(o.lon,o.lat),radius=Number(data.radius||o.radius||0)/Math.cos(radians(o.lat))/spanX*width;ctx.beginPath();ctx.arc(...p,radius,0,Math.PI*2);ctx.strokeStyle=palette.circle;ctx.lineWidth=2;ctx.setLineDash([9,6]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(...p,7,0,Math.PI*2);ctx.fillStyle=palette.area;ctx.fill();ctx.strokeStyle='#fff';ctx.stroke();label('Origem',p[0]+12,p[1]-12);}
  const selected=new Set(data.selectedIds||[]);for(const community of data.communities||[]){if(community.enabled===false)continue;const p=xy(community.lon,community.lat),chosen=selected.has(community.id),fixed=community.fixed===true;if(chosen&&data.origin){const origin=xy(data.origin.lon,data.origin.lat);line([origin,p],satellite?'#ffffffcc':'#647983',2,true);if(Number.isFinite(community.distance)){const text=`${Math.round(community.distance).toLocaleString('pt-BR')} m`;label(text,(origin[0]+p[0])/2,(origin[1]+p[1])/2);}}ctx.beginPath();ctx.arc(...p,fixed?11:(chosen?9:6),0,Math.PI*2);ctx.fillStyle=chosen?palette.selected:'#fff';ctx.fill();ctx.lineWidth=fixed?5:2;ctx.strokeStyle=fixed?palette.fixed:(chosen?'#fff':palette.available);ctx.stroke();ctx.font=`600 ${Math.max(13,width/90)}px Arial`;const text=`${community.name}${fixed?' · FIXO':''}`,textWidth=ctx.measureText(text).width;label(text,Math.max(8,Math.min(width-textWidth-8,p[0]-textWidth/2)),p[1]-16);}
  ctx.fillStyle='#263441d9';ctx.fillRect(0,height-33,width,33);ctx.fillStyle='#fff';ctx.font=`${Math.max(11,width/115)}px Arial`;ctx.fillText(satellite?(config.attributionText || 'Satélite © Esri, Maxar, Earthstar Geographics e GIS User Community'):'MAPA VETORIAL · Sem imagem de satélite',12,height-12);
  ctx.fillStyle='#fff';ctx.fillRect(width-70,14,48,62);ctx.fillStyle='#263441';ctx.font='bold 18px Arial';ctx.fillText('N',width-52,36);line([[width-45,66],[width-45,43]],'#263441',2);line([[width-51,50],[width-45,43],[width-39,50]],'#263441',2);
  canvas.satellite=satellite;canvas.warning=warning;return canvas;
 }
 setBasemap('satellite');return {update,fit,setBasemap,exportCanvas,invalidate:()=>map.invalidateSize(),map,destroy:()=>map.remove()};
}


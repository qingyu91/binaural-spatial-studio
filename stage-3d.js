import {drawListenerHead} from './listener-head.js?v=1';
import {poseAt} from './core.js?v=9';
// Perspective preview only: camera gestures never change object keyframes.
export function createSpatialView(canvas){
 const initial={yaw:-.55,pitch:.48,zoom:1};let camera={...initial},pointer=null;
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 function project(p,w,h){
  const r=Math.hypot(p.x,p.y,p.z),display=r<=2?r:2+(r-2)*.38,k=r?display/r:1;
  const x=p.x*k,y=p.y*k,z=p.z*k;
  const xx=x*Math.cos(camera.yaw)-y*Math.sin(camera.yaw),yy=x*Math.sin(camera.yaw)+y*Math.cos(camera.yaw);
  const depth=yy*Math.cos(camera.pitch)-z*Math.sin(camera.pitch),up=yy*Math.sin(camera.pitch)+z*Math.cos(camera.pitch);
  const perspective=8/(8+depth),scale=Math.min(w*.16,h*.145)*camera.zoom;
  return {x:w/2+xx*scale*perspective,y:h*.50-up*scale*perspective,depth,scale:perspective};
 }
 function draw(c,w,h,keys,pose,time,ending=null){
  const q=p=>project(p,w,h),origin=q({x:0,y:0,z:0});
  const line=(a,b,color,width=1,dashed=false)=>{a=q(a);b=q(b);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dashed?[4,5]:[]);c.stroke();c.setLineDash([]);};
  c.font='11px -apple-system';c.textAlign='center';
  // Smooth translucent sphere: perspective silhouette of the compressed 4 m boundary.
  const sphereRadius=2.76,scale=Math.min(w*.16,h*.145)*camera.zoom;
  const radius=scale*sphereRadius/Math.sqrt(1-(sphereRadius/8)**2);
  const glow=c.createRadialGradient(origin.x-radius*.32,origin.y-radius*.4,radius*.05,origin.x,origin.y,radius);
  glow.addColorStop(0,'rgba(166,210,229,.23)');
  glow.addColorStop(.45,'rgba(106,153,183,.14)');
  glow.addColorStop(.85,'rgba(59,90,122,.12)');
  glow.addColorStop(1,'rgba(151,193,214,.28)');
  c.beginPath();c.arc(origin.x,origin.y,radius,0,Math.PI*2);c.fillStyle=glow;c.fill();
  c.strokeStyle='rgba(177,214,231,.32)';c.lineWidth=1;c.stroke();
  // Minimal great circles: one equator and two perpendicular meridians.
  // Project through the same camera as the source so rotating remains coherent.
  const circles=[
   a=>({x:4*Math.cos(a),y:4*Math.sin(a),z:0}),
   a=>({x:4*Math.cos(a),y:0,z:4*Math.sin(a)}),
   a=>({x:0,y:4*Math.cos(a),z:4*Math.sin(a)})
  ];
  for(const circle of circles)for(let i=1;i<=128;i++){
   const a=circle((i-1)*Math.PI/64),b=circle(i*Math.PI/64);
   // A sphere surface faces the camera when depth < -R² / camera distance.
   const back=(q(a).depth+q(b).depth)/2>-(sphereRadius*sphereRadius)/8;
   line(a,b,back?'rgba(170,204,224,.09)':'rgba(190,223,240,.32)',back?.8:1);
  }
  // Sparse direction labels rotate with the scene; no coordinate spokes.
  for(const [p,label] of [[{x:0,y:4,z:0},'前'],[{x:0,y:-4,z:0},'后'],[{x:4,y:0,z:0},'右'],[{x:-4,y:0,z:0},'左'],[{x:0,y:0,z:4},'上'],[{x:0,y:0,z:-4},'下']]){
   const v=q(p);c.fillStyle=v.depth>0?'#718592':'#b5cbd8';c.fillText(label,v.x,v.y-7);
  }
  // Keep only the already drawn embrace visible, then fade at the song ending.
  if((['open-embrace','interwoven-ribbons'].includes(ending?.type)||ending?.type?.startsWith('reference-'))&&time>=ending.startSeconds){
   const until=Math.min(time,ending.drawEndSeconds),fade=1-clamp((time-(ending.endSeconds-1.3))/1.3,0,1);
   let prev=poseAt(keys,ending.startSeconds);
   for(let t=ending.startSeconds+.05;t<=until;t+=.05){const next=poseAt(keys,t);const rgb=ending.type==='interwoven-ribbons'&&t>(ending.startSeconds+ending.drawEndSeconds)/2?'125,220,233':'255,187,133';line(prev,next,`rgba(${rgb},${.55*fade})`,2);prev=next;}
  }
  // Show only the trailing four seconds, including interpolated boundaries.
  const tailSeconds=4,start=Math.max(0,time-tailSeconds),trail=[{t:start,pose:poseAt(keys,start)},...keys.filter(k=>k.t>start&&k.t<time),{t:time,pose}];
  for(let i=1;i<trail.length;i++){
   const freshness=clamp((trail[i].t-start)/tailSeconds,0,1),alpha=.08+.65*freshness;
   line(trail[i-1].pose,trail[i].pose,`rgba(255,187,133,${alpha})`,1+2*freshness);
  }
  if(ending?.type==='reference-point'){const pt=q(pose),pulse=.55+.25*Math.sin((time-ending.startSeconds)*Math.PI);c.beginPath();c.arc(pt.x,pt.y,18+4*pulse,0,2*Math.PI);c.strokeStyle=`rgba(255,187,133,${.35*pulse})`;c.lineWidth=2;c.stroke();}
  const objects=[{p:{x:0,y:0,z:0},head:true},{p:pose,head:false}].sort((a,b)=>q(b.p).depth-q(a.p).depth);
  for(const object of objects){const p=q(object.p);
   if(object.head){drawListenerHead(c,q);}
   else {const floor={x:pose.x,y:pose.y,z:0};line(floor,pose,'#ffb47d88',1,true);const f=q(floor);c.beginPath();c.ellipse(f.x,f.y,9,4,0,0,Math.PI*2);c.fillStyle='#ffac7033';c.fill();line({x:0,y:0,z:0},pose,'#ffb47d55',1,true);c.beginPath();c.arc(p.x,p.y,8*p.scale,0,Math.PI*2);c.fillStyle='#ffc391';c.shadowColor='#ffac70';c.shadowBlur=18;c.fill();c.shadowBlur=0;c.fillStyle='#ffe1c7';c.fillText(Math.hypot(pose.x,pose.y,pose.z).toFixed(2)+' m · 高度 '+(pose.z>=0?'+':'')+pose.z.toFixed(2)+' m',clamp(p.x,100,w-100),clamp(p.y-22,50,h-55));}
  }
  c.textAlign='left';c.fillStyle='#8da1b5';c.fillText('球面：4 m 边界 · 尾线：最近 4 秒',16,h-42);
 }
 return {draw,top(){camera={yaw:0,pitch:Math.PI/2,zoom:1.05};},reset(){camera={...initial};},down(e){pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);},move(e){if(!pointer)return;camera.yaw+=(e.clientX-pointer.x)*.008;camera.pitch=clamp(camera.pitch+(e.clientY-pointer.y)*.006,-.25,1.25);pointer={x:e.clientX,y:e.clientY};},up(){pointer=null;},wheel(e){camera.zoom=clamp(camera.zoom*(e.deltaY>0?.92:1.08),.65,2.2);}};
}

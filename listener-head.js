// Diagram faces world +Y. Ears and nose follow camera rotation.
export function drawListenerHead(c,q){
 const center=q({x:0,y:0,z:0}),right=q({x:.26,y:0,z:0}),left=q({x:-.26,y:0,z:0});
 const unit=Math.max(12,Math.hypot(right.x-left.x,right.y-left.y)/2);
 const nose=[{x:-.075,y:.22,z:.05},{x:0,y:.40,z:.02},{x:.075,y:.22,z:.05}].map(q);
 const parts=[{p:left,kind:'ear'},{p:right,kind:'ear'},{p:center,kind:'head'},{p:q({x:0,y:.32,z:0}),kind:'nose'}].sort((a,b)=>(b.p.depth||0)-(a.p.depth||0));
 for(const {p,kind} of parts){
  c.strokeStyle='#b4ebd9';c.lineWidth=1;
  if(kind==='nose'){c.beginPath();nose.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();c.fillStyle='#d6f9e9';c.fill();c.stroke();}
  else {const r=kind==='head'?unit:unit*.31,g=c.createRadialGradient(p.x-r*.3,p.y-r*.35,0,p.x,p.y,r);g.addColorStop(0,'#c8f5e3');g.addColorStop(1,'#38766e');c.fillStyle=g;c.beginPath();c.ellipse(p.x,p.y,kind==='head'?r*.82:r*.65,r,0,0,Math.PI*2);c.fill();c.stroke();if(kind==='ear'){c.beginPath();c.moveTo(p.x,p.y-r*.45);c.lineTo(p.x,p.y+r*.45);c.strokeStyle='#28534d';c.stroke();}}
 }
 c.fillStyle='#a3d8cc';c.textAlign='center';c.fillText('听者',center.x,center.y+unit+15);
}

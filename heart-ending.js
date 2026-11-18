import {poseAt} from './core.js?v=9';
// Arc-length sampling gives steady movement around the lobes and cusp.
export function heartEnding(keys,duration){
 if(duration<18)return {keys,ending:null};
 const start=duration-16,heartStart=duration-12,base=poseAt(keys,start);
 const points=[],lengths=[0];let total=0;
 for(let i=0;i<=1200;i++){const a=Math.PI+i/1200*2*Math.PI,p={x:.0945*16*Math.sin(a)**3,y:.0945*(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a)),z:0};if(i)total+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);points.push(p);lengths.push(total);}
 lengths.shift();
 const at=u=>{const d=u*total;let i=1;while(i<points.length-1&&lengths[i]<d)i++;const f=(d-lengths[i-1])/(lengths[i]-lengths[i-1]||1);return {x:points[i-1].x+(points[i].x-points[i-1].x)*f,y:points[i-1].y+(points[i].y-points[i-1].y)*f,z:0};};
 const out=keys.filter(k=>k.t<start);out.push({t:start,pose:{...base}});
 const target={...base,...at(0),width:.08,size:.08};
 for(let i=1;i<=320;i++){const t=start+i*.05;let p;
  if(t<heartStart){const u=(t-start)/4,f=u*u*u*(10+u*(-15+6*u));p=Object.fromEntries(Object.keys(base).map(k=>[k,base[k]+(target[k]-base[k])*f]));
   const r0=Math.max(.2,Math.hypot(base.x,base.y,base.z)),az0=Math.atan2(base.x,base.y),el0=Math.atan2(base.z,Math.hypot(base.x,base.y));
   const targetAz=Math.atan2(target.x,target.y),targetR=Math.hypot(target.x,target.y);
   const az=az0+Math.atan2(Math.sin(targetAz-az0),Math.cos(targetAz-az0))*f,r=r0+(targetR-r0)*f,el=el0*(1-f);
   Object.assign(p,{x:r*Math.cos(el)*Math.sin(az),y:r*Math.cos(el)*Math.cos(az),z:r*Math.sin(el)});}
  else {const u=Math.min(1,(t-heartStart)/10),f=u*u*(3-2*u);p={...target,...at(f)};}
  out.push({t:Math.min(t,duration),pose:p});
 }
 return {keys:out,ending:{type:'top-view-heart',transitionStartSeconds:start,startSeconds:heartStart,endSeconds:duration,trailSeconds:12,completedSeconds:duration-2,scale:1.35,holdSeconds:2}};
}

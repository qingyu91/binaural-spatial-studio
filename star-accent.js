import {poseAt} from './core.js?v=9';
const smooth=u=>u*u*u*(10+u*(-15+6*u));
function blend(a,b,u){const f=smooth(u),r0=Math.max(.2,Math.hypot(a.x,a.y,a.z)),r1=Math.max(.2,Math.hypot(b.x,b.y,b.z)),az0=Math.atan2(a.x,a.y),az1=Math.atan2(b.x,b.y),el0=Math.atan2(a.z,Math.hypot(a.x,a.y)),el1=Math.atan2(b.z,Math.hypot(b.x,b.y));const az=az0+Math.atan2(Math.sin(az1-az0),Math.cos(az1-az0))*f,el=el0+(el1-el0)*f,r=r0+(r1-r0)*f;return {...a,x:r*Math.cos(el)*Math.sin(az),y:r*Math.cos(el)*Math.cos(az),z:r*Math.sin(el),width:a.width+(b.width-a.width)*f};}
export function starAccent(keys,duration,analysis={}){
 if(duration<60)return {keys,accent:null};
 const blocked=(analysis.segments||[]).filter(s=>s.action.startsWith('lateral'));
 const starts=Array.from({length:Math.max(0,Math.floor(duration-40))},(_,i)=>10+i).filter(t=>t+18<=duration-18&&!blocked.some(s=>t<s.endSeconds&&t+18>s.startSeconds));
 starts.sort((a,b)=>Math.abs(a-duration*.5)-Math.abs(b-duration*.5));if(!starts.length)return {keys,accent:null};
 const begin=starts[0],start=begin+3,complete=start+12,end=begin+18,from=poseAt(keys,begin),back=poseAt(keys,end);
 const vertices=Array.from({length:6},(_,i)=>{const a=i*4*Math.PI/5;return {...from,x:1.15*Math.sin(a),y:1.15*Math.cos(a),z:0,width:.1};});vertices[5]={...vertices[0]};
 // Round each corner with a tangent quadratic arc, then sample by arc length.
 const mix=(a,b,f)=>({...a,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});
 const exit=i=>mix(vertices[i%5],vertices[(i+1)%5],.1);
 const path=[exit(0)],lengths=[0];let total=0;
 for(let i=1;i<=5;i++){
  const v=vertices[i%5],entry=mix(v,vertices[(i+4)%5],.1),out=exit(i);
  path.push(entry);
  for(let j=1;j<=30;j++){const f=j/30;path.push(mix(mix(entry,v,f),mix(v,out,f),f));}
 }
 for(let i=1;i<path.length;i++){total+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);lengths.push(total);}
 const at=u=>{const distance=total*u;let i=1;while(i<path.length-1&&lengths[i]<distance)i++;return mix(path[i-1],path[i],(distance-lengths[i-1])/(lengths[i]-lengths[i-1]||1));};
 const insert=[{t:begin,pose:from}];for(let i=1;i<=360;i++){const t=begin+i*.05;let pose;
 if(t<start)pose=blend(from,path[0],(t-begin)/3);
 else if(t<complete){const u=(t-start)/12;pose=at(u*u*(3-2*u));}
 else pose=blend(path.at(-1),back,(t-complete)/3);
 insert.push({t,pose});}

 return {keys:[...keys.filter(k=>k.t<begin),...insert,...keys.filter(k=>k.t>end)],accent:{type:'top-view-star',transitionStartSeconds:begin,startSeconds:start,completedSeconds:complete,endSeconds:end,trailSeconds:4,roundedCorners:true}};
}

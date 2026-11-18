export const POSE={x:0,y:1.5,z:0,width:1.2,size:.25,gain:0};
import {ROOM_PRESETS,DEFAULT_ROOM} from './sample-room.js';
export const ROOM={preset:DEFAULT_ROOM,tail:1,distanceEffect:0,wet:.48,decay:2.8,predelay:24,brightness:0,output:-6};
export const LIMITS={x:[-4,4],y:[-4,4],z:[-4,4],width:[0,6],size:[0,3],gain:[-24,6]};
export const ROOM_LIMITS={wet:[0,1],decay:[.3,6],predelay:[0,100],brightness:[-6,6],output:[-24,0]};
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const copy=o=>structuredClone(o);
export const DISTANCE={min:.2,max:4};
// The top-down canvas allocates 80% of its radius to the near 0–2 m area.
export function canvasRadius(meters){return meters<=2?meters*.4:.8+(meters-2)*.1;}
export function canvasDistance(radius){return radius<=.8?radius/ .4:2+(radius-.8)/.1;}
export function canvasPoint(x,y,radius){const d=Math.hypot(x,y),k=d?canvasRadius(d)*radius/d:0;return {x:x*k,y:y*k};}
export function canvasPosition(x,y,radius){const d=Math.hypot(x,y),k=d?canvasDistance(d/radius)/d:0;return {x:x*k,y:y*k};}
export function distanceFromControl(value,scale='log'){
 const u=clamp(value,0,1);return scale==='linear'?DISTANCE.min+(DISTANCE.max-DISTANCE.min)*u:DISTANCE.min*(DISTANCE.max/DISTANCE.min)**u;
}
export function distanceToControl(distance,scale='log'){
 const d=clamp(distance,DISTANCE.min,DISTANCE.max);return scale==='linear'?(d-DISTANCE.min)/(DISTANCE.max-DISTANCE.min):Math.log(d/DISTANCE.min)/Math.log(DISTANCE.max/DISTANCE.min);
}
export function withDistance(p,distance){
 const d=clamp(distance,DISTANCE.min,DISTANCE.max),r=Math.hypot(p.x,p.y,p.z);
 if(r<1e-9)return {...p,x:0,y:d,z:0};
 return {...p,x:p.x/r*d,y:p.y/r*d,z:p.z/r*d};
}
export function withElevation(p,degrees){
 const radius=clamp(Math.hypot(p.x,p.y,p.z)||DISTANCE.min,DISTANCE.min,DISTANCE.max);
 const azimuth=Math.atan2(p.x,p.y),elevation=clamp(degrees,-90,90)*Math.PI/180;
 const horizontal=radius*Math.cos(elevation);
 return {...p,x:horizontal*Math.sin(azimuth),y:horizontal*Math.cos(azimuth),z:radius*Math.sin(elevation)};
}
export function poseAt(keys,t){
 if(t<=keys[0].t)return {...keys[0].pose};
 let low=0,high=keys.length-1;
 while(low<high){const mid=Math.ceil((low+high)/2);if(keys[mid].t<=t)low=mid;else high=mid-1;}
 const a=keys[low],b=keys[low+1];if(!b)return {...a.pose};
 const f=clamp((t-a.t)/(b.t-a.t),0,1);return Object.fromEntries(Object.keys(POSE).map(k=>[k,a.pose[k]+(b.pose[k]-a.pose[k])*f]));
}
export function insertKey(keys,t,pose){const out=keys.filter(k=>Math.abs(k.t-t)>.0005);out.push({t,pose:{...pose}});return out.sort((a,b)=>a.t-b.t);}
// Only the actually recorded interval changes. A 20 ms boundary transition avoids discontinuities.
export function punchKeys(original,recorded,start,end,duration){
 if(!recorded.length)return copy(original);
 let keys=original.filter(k=>k.t<start||k.t>end);
 if(start>0)keys=insertKey(keys,Math.max(0,start-.02),poseAt(original,Math.max(0,start-.02)));
 for(const k of recorded)if(k.t>=start&&k.t<=end)keys=insertKey(keys,k.t,k.pose);
 keys=insertKey(keys,end,recorded[recorded.length-1].pose);
 if(end<duration)keys=insertKey(keys,Math.min(duration,end+.02),poseAt(original,Math.min(duration,end+.02)));
 return keys;
}
export function spatial(p,distanceEffect=0){
 const distance=Math.max(DISTANCE.min,Math.hypot(p.x,p.y,p.z)),angle=Math.atan2(p.x,p.y);
 const spread=p.width+p.size*.45;
 const depth=clamp(distanceEffect,0,1),far=clamp((distance-.25)/2.75,0,1);
 const distanceWet=(1-depth)+depth*(.1+.9*far);
 const baseCutoff=clamp(19000*Math.exp(-.13*Math.max(0,distance-1)),3500,19000),deepCutoff=clamp(19000*Math.exp(-.55*Math.max(0,distance-.4)),3000,19000);
 return {distance,azimuth:angle*180/Math.PI,elevation:Math.atan2(p.z,Math.hypot(p.x,p.y))*180/Math.PI,
 left:{x:p.x-Math.cos(angle)*spread/2,y:p.y+Math.sin(angle)*spread/2,z:p.z},
 right:{x:p.x+Math.cos(angle)*spread/2,y:p.y-Math.sin(angle)*spread/2,z:p.z},
 direct:Math.min(1.5/.35,1.5/distance)*10**(p.gain/20)/(1+p.size*.12),
 send:Math.min(1.4,Math.sqrt(1.5/distance))*10**(p.gain/20)*(1+p.size*.18)*distanceWet,
 cutoff:baseCutoff**(1-depth)*deepCutoff**depth};
}
export function metadata(project,duration,extra={}){
 const frames=[];for(let i=0;i<=Math.ceil(duration*30);i++){const t=Math.min(duration,i/30),p=poseAt(project.keys,t),s=spatial(p,project.room.distanceEffect??0);frames.push({timeSeconds:+t.toFixed(6),...p,distance:s.distance,azimuthDegrees:s.azimuth,elevationDegrees:s.elevation,directGain:s.direct,reverbSendGain:s.send,distanceLowpassHz:Math.min(extra.sampleRate?extra.sampleRate*.45:Infinity,s.cutoff),virtualLeft:s.left,virtualRight:s.right});}
 return {schema:'binaural-object-metadata',version:1,objectId:'stereo-01',objectName:project.name,
 distanceControl:{scale:project.distanceScale||'log',minMeters:DISTANCE.min,maxMeters:DISTANCE.max,focusMeters:[.2,2],focusSliderFraction:distanceToControl(2,project.distanceScale||'log'),meaning:'UI mapping; Cartesian keyframes and acoustic distance law unchanged'},
 coordinates:{units:'meters',x:'right',y:'front',z:'up',azimuth:'0 front; +90 right',width:'L/R separation in meters',size:'perceptual extent; increases spread and reverberant/direct ratio'},
 renderer:project.sofa?'SOFA measured HRIR / AudioWorklet FIR':'Web Audio native HRTF (legacy test path)',sofaId:project.sofa||null,directDistanceLaw:{referenceMeters:1.5,clampDistanceMeters:.35},nearFieldModel:{type:'geometric ear-level approximation',earSpacingMeters:.175,fadeOutDistanceMeters:.9,smoothingSeconds:.025,powerNormalized:true,measuredNearField:false},interpolation:'linear Cartesian, scheduled at 60 Hz',metadataRateHz:30,durationSeconds:duration,room:copy(project.room),keyframes:copy(project.keys),frames,...extra};
}
export function validateProject(p,{legacyDistance=false}={}){
 if(!p||p.schema!=='binaural-studio'||p.version!==1)throw Error('不是受支持的制作台工程');
 if(p.distanceScale!==undefined&&!['log','linear'].includes(p.distanceScale))throw Error('距离刻度无效');
 if(p.sofa!==undefined&&(typeof p.sofa!=='string'||!/^p\d{4}$/.test(p.sofa)))throw Error('SOFA 编号无效');
 if(typeof p.name!=='string'||p.name.length>80)throw Error('对象名称无效');
 if(!p.audio||typeof p.audio.name!=='string'||typeof p.audio.base64!=='string')throw Error('工程缺少音频');
 if(!Array.isArray(p.keys)||!p.keys.length||p.keys.length>200000)throw Error('关键帧数量无效');
 let last=-1;for(const k of p.keys){if(!Number.isFinite(k.t)||k.t<0||k.t<=last)throw Error('关键帧时间必须递增');last=k.t;
 if(Math.hypot(k.pose?.x,k.pose?.y,k.pose?.z)>(legacyDistance?16:DISTANCE.max)+1e-8)throw Error('对象距离超出 '+(legacyDistance?16:DISTANCE.max)+' 米');
 for(const [f,[a,b]] of Object.entries(LIMITS))if(!Number.isFinite(k.pose?.[f])||k.pose[f]<(legacyDistance&&['x','y','z'].includes(f)?-16:a)||k.pose[f]>(legacyDistance&&['x','y','z'].includes(f)?16:b))throw Error('对象参数无效：'+f);}
 if(p.keys[0].t!==0)throw Error('工程缺少起始关键帧');
 if(p.room?.distanceEffect!==undefined&&(!Number.isFinite(p.room.distanceEffect)||p.room.distanceEffect<0||p.room.distanceEffect>1))throw Error('远近对比参数无效');
 if(p.room?.preset!==undefined&&!ROOM_PRESETS.some(r=>r.id===p.room.preset))throw Error('混响预设无效');
 if(p.room?.tail!==undefined&&(!Number.isFinite(p.room.tail)||p.room.tail<.1||p.room.tail>1))throw Error('尾音保留比例无效');
 for(const [f,[a,b]] of Object.entries(ROOM_LIMITS))if(!Number.isFinite(p.room?.[f])||p.room[f]<a||p.room[f]>b)throw Error('混响参数无效：'+f);
 return p;
}
export function upgradeProjectDistance(p){
 validateProject(p,{legacyDistance:true});let distanceAdjusted=0;
 const keys=p.keys.map(k=>{if(Math.hypot(k.pose.x,k.pose.y,k.pose.z)>DISTANCE.max){distanceAdjusted++;return {...k,pose:withDistance(k.pose,DISTANCE.max)};}return {...k,pose:{...k.pose}};});
 const next={...p,keys,distanceAdjusted};validateProject(next);return next;
}
export function wavInfo(bytes){
 const v=new DataView(bytes),str=(o,n)=>String.fromCharCode(...new Uint8Array(bytes,o,n));
 if(bytes.byteLength<44||str(0,4)!=='RIFF'||str(8,4)!=='WAVE')throw Error('请选择标准 RIFF WAV 文件');
 let info=null,hasData=false;for(let o=12;o+8<=v.byteLength;){const n=v.getUint32(o+4,true),id=str(o,4);if(o+8+n>v.byteLength)throw Error('WAV 数据不完整');if(id==='fmt '){if(n<16)throw Error('WAV 格式头不完整');const format=v.getUint16(o+8,true);info={format,channels:v.getUint16(o+10,true),sampleRate:v.getUint32(o+12,true),bits:v.getUint16(o+22,true)};}if(id==='data')hasData=n>0;o+=8+n+(n%2);}
 if(!info||!hasData)throw Error('WAV 缺少格式或音频数据');if(info.channels!==2)throw Error('需要双声道立体声 WAV，当前为 '+info.channels+' 声道');if(info.sampleRate<8000||info.sampleRate>96000)throw Error('支持 8–96 kHz 的 WAV');return info;
}
export function encodeWav(buffer){
 const n=buffer.length,bytes=new ArrayBuffer(44+n*6),v=new DataView(bytes),put=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 const l=buffer.getChannelData(0),r=buffer.getChannelData(1);let peak=0;for(let i=0;i<n;i++)peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));if(!Number.isFinite(peak))throw Error('渲染出现非有限采样值');
 const scale=peak>.98?.98/peak:1;put(0,'RIFF');v.setUint32(4,36+n*6,true);put(8,'WAVE');put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*6,true);v.setUint16(32,6,true);v.setUint16(34,24,true);put(36,'data');v.setUint32(40,n*6,true);
 for(let i=0,o=44;i<n;i++)for(const a of [l,r]){const value=Math.round(clamp(a[i]*scale,-1,1)*8388607);v.setUint8(o++,value&255);v.setUint8(o++,(value>>8)&255);v.setUint8(o++,(value>>16)&255);}
 return {bytes,peak,scale};
}

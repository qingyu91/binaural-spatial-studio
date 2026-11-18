import {POSE,clamp} from './core.js';
const FEATURE_HZ=50;
// Stereo energy avoids cancellation of anti-phase input. Analysis stays local.
export async function analyzeMotion(buffer,{yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}){
 const hop=Math.max(1,Math.round(buffer.sampleRate/FEATURE_HZ)),left=buffer.getChannelData(0),right=buffer.getChannelData(1),frames=[];let prevL=0,prevR=0;
 for(let start=0;start<buffer.length;start+=hop){let energy=0,difference=0;const end=Math.min(buffer.length,start+hop);
  for(let i=start;i<end;i++){const l=left[i],r=right[i];energy+=(l*l+r*r)/2;difference+=((l-prevL)**2+(r-prevR)**2)/2;prevL=l;prevR=r;}
  frames.push({rms:Math.sqrt(energy/(end-start)),brightness:energy>1e-15?Math.sqrt(difference/energy):0});
  if(frames.length%128===0)await yieldTask();
 }
 return motionFromFeatures(frames,buffer.duration,buffer.sampleRate/hop);
}
function percentile(values,q){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*q)]||0;}
export function motionFromFeatures(frames,duration,hz=FEATURE_HZ){
 if(!frames.length||!Number.isFinite(duration)||duration<=0)throw Error('音频长度无效');
 const reference=percentile(frames.map(f=>f.rms).filter(v=>v>1e-4),.95),active=reference>1e-4;
 const energy=frames.map(f=>clamp(f.rms/Math.max(reference,1e-4),0,1));
 const novelty=frames.map((f,i)=>i&&f.rms>1e-4?Math.max(0,Math.log(f.rms+1e-5)-Math.log(frames[i-1].rms+1e-5)-.08):0);
 const onsetScale=Math.max(.15,percentile(novelty.filter(v=>v>0),.75));
 // Bounded-lag onset autocorrelation: a tempo hint, not guaranteed beat tracking.
 // Use up to 120 s for tempo estimation; all frames still drive the trajectory.
 const count=Math.min(novelty.length,Math.round(hz*120));let best=0,lagBest=0;
 if(duration>=4&&active)for(let lag=Math.ceil(hz*60/180);lag<=Math.floor(hz*60/60);lag++){
  let dot=0,a=0,b=0;for(let i=lag;i<count;i++){dot+=novelty[i]*novelty[i-lag];a+=novelty[i]**2;b+=novelty[i-lag]**2;}
  const score=a*b>1e-12?dot/Math.sqrt(a*b):0;
  if(score>best+.015){best=score;lagBest=lag;}
 }
 const bpm=best>.22?Math.round(60*hz/lagBest):null;
 // Local energy peaks drive accents at their real times, rather than a free-running orbit.
 const hits=[];for(let i=1;i<novelty.length-1;i++){if(novelty[i]>onsetScale*.65&&novelty[i]>=novelty[i-1]&&novelty[i]>novelty[i+1]&&(!hits.length||i/hz-hits.at(-1).time>.18))hits.push({time:i/hz,strength:clamp(novelty[i]/onsetScale,0,1)});}
 const segmentSeconds=clamp(bpm?8*60/bpm:4.8,3.2,6);
 const names={orbit:'正反向完整环绕',scalp:'近耳上下轻移',depth:'强拍远近推拉',lift:'近距离后方升降',sweep:'前侧左右跃迁与停顿',lateralNear:'侧方极近 · 0.2 m',lateralFar:'侧方极远 · 4 m',lateralReturn:'侧方拉回 · 0.2 m',retreat:'远处拉开再贴近',backpass:'后上方掠过',anchor:'前侧定点呼吸'};
 const cycle=['lift','scalp','anchor','orbit','orbit','orbit','scalp','scalp','sweep','backpass'];
 const segments=[];
 for(let start=0;start<duration;start+=segmentSeconds){
  const end=Math.min(duration,start+segmentSeconds),lo=Math.floor(start*hz),hi=Math.min(frames.length,Math.ceil(end*hz)),values=energy.slice(lo,hi);
  const e=values.reduce((sum,v)=>sum+v,0)/Math.max(1,values.length),peak=percentile(values,.9),onsetRate=hits.filter(h=>h.time>=start&&h.time<end).length/(end-start);
  segments.push({startSeconds:start,endSeconds:end,energy:e,peakEnergy:peak,onsetRate});
 }
 const maxPeak=Math.max(...segments.map(s=>s.peakEnergy),.01),maxMean=Math.max(...segments.map(s=>s.energy),.01);
 const typicalMean=percentile(segments.map(s=>s.energy),.65),typicalPeak=percentile(segments.map(s=>s.peakEnergy),.65),attackThreshold=Math.max(1.5,percentile(segments.map(s=>s.onsetRate),.6)*.8);
 let intro=true,activePhrase=0,previousEnergy=0;
 for(const [i,seg] of segments.entries()){
  const strong=(seg.onsetRate>=attackThreshold&&seg.peakEnergy>=maxPeak*.45)||(i>0&&seg.energy>previousEnergy*1.7&&seg.peakEnergy>maxPeak*.55);
  const quiet=(seg.peakEnergy<maxPeak*.48&&seg.energy<maxMean*.7)||(seg.energy<typicalMean*.82&&seg.peakEnergy<typicalPeak*.88);
  if(strong||seg.startSeconds>=21.6)intro=false;
  let action,phase;
  if(intro&&!strong){action='orbit';phase='calm-intro';}
  else if(quiet||seg.onsetRate<.5){action='scalp';phase=quiet?'quiet-close':'sustained-close';}
  else{
   phase=strong?'rhythmic':'restrained';action=cycle[activePhrase++%cycle.length];

  }
  Object.assign(seg,{action,phase,label:names[action],side:action==='lateralNear'?(Math.floor((activePhrase-1)/cycle.length)%2?-1:1):(i%2?-1:1),energy:+seg.energy.toFixed(3),peakEnergy:+seg.peakEnergy.toFixed(3),onsetRate:+seg.onsetRate.toFixed(3)});
  previousEnergy=seg.energy;
 }
 // Reserve a small number of complete near/far/return demonstrations across
 // the song. Choose rhythmic sections near evenly spaced targets, never quiet gaps.
 const demoBudget=duration>=240?3:duration>=60?2:duration>=24?1:0;
 const selected=[];
 for(let slot=0;slot<demoBudget;slot++){
  const desired=duration*(slot+1)/(demoBudget+1);
  const candidates=segments.map((s,i)=>({s,i})).filter(({s,i})=>i+2<segments.length&&
   segments.slice(i,i+3).every(v=>['rhythmic','restrained'].includes(v.phase)&&v.endSeconds-v.startSeconds>=3.2)&&
   selected.every(j=>Math.abs(i-j)>=5));
  candidates.sort((a,b)=>(Math.abs(a.s.startSeconds-desired)-a.s.onsetRate*2)-(Math.abs(b.s.startSeconds-desired)-b.s.onsetRate*2));
  if(candidates.length)selected.push(candidates[0].i);
 }
 selected.sort((a,b)=>a-b).forEach((index,n)=>{
  ['lateralNear','lateralFar','lateralReturn'].forEach((action,j)=>Object.assign(segments[index+j],{action,label:names[action],side:n%2?-1:1}));
 });
 const shortest=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const quintic=u=>u*u*u*(10+u*(-15+6*u));
 const orbitPeriod=6.5;
 const orbitAngle=t=>{const turn=Math.floor(t/orbitPeriod),u=t/orbitPeriod-turn;return 2*Math.PI*(turn%2?1-quintic(u):quintic(u));};
 const fromPolar=(p)=>{const h=p.r*Math.cos(p.el);return {...POSE,x:h*Math.sin(p.az),y:h*Math.cos(p.az),z:p.r*Math.sin(p.el),width:clamp(p.r*.16,.05,.48),size:.08,gain:clamp(2*Math.log2(.65/p.r),-3,2)};};
 // Plan endpoint poses on REAL detected attacks. Interpolation arrives at the hit,
 // rather than reacting afterwards and spending the following beat chasing it.
 const anchors=[{t:0,p:{az:Math.PI*.8,r:segments[0].action==='orbit'?1.1:.8,el:0},hold:0,action:segments[0].action,onset:false}];
 for(const seg of segments){
  const stride=['retreat','anchor'].includes(seg.action)?4:2;
  const localHits=hits.filter(h=>h.time>seg.startSeconds+.08&&h.time<seg.endSeconds-.08);
  const freeMotion=['orbit','scalp'].includes(seg.action);
  const points=freeMotion?[]:localHits.filter((_,i)=>(i+1)%stride===0).map(h=>({t:h.time,onset:true}));
  // Calm or quiet passages do not acquire artificial beat accents. Small angular
  // steps preserve complete revolutions; near-head vertical moves get more time.
  if(freeMotion){const step=seg.action==='orbit'?.65:1.8;for(let t=seg.startSeconds+step;t<seg.endSeconds-.08;t+=step)points.push({t,onset:false});}
  if(seg.action==='orbit')for(let t=(Math.floor(seg.startSeconds/orbitPeriod)+1)*orbitPeriod;t<seg.endSeconds;t+=orbitPeriod)points.push({t,onset:false});
  if(seg.action.startsWith('lateral')){
   points.length=0;
   const arrivalAfter=seg.startSeconds+Math.max(seg.action==='lateralFar'?2.7:1.5,(seg.endSeconds-seg.startSeconds)*.65);
   const hit=localHits.find(h=>h.time>=arrivalAfter&&h.time<=seg.endSeconds-.35);
   const arrival=hit?.time??Math.max(seg.startSeconds+.05,seg.endSeconds-.4);
   points.push({t:arrival,onset:!!hit});
  }
  // With no clear attacks, use slow fallback waypoints, never fabricate beat labels.
  if(points.length===0&&seg.endSeconds-seg.startSeconds>1.5)points.push({t:(seg.startSeconds+seg.endSeconds)/2,onset:false});
  points.push({t:seg.endSeconds,onset:hits.some(h=>Math.abs(h.time-seg.endSeconds)<.025)});
  // Insert silence boundaries so a sustained gap holds a fixed pose.
  let wasActive=frames[Math.min(frames.length-1,Math.floor(seg.startSeconds*hz))].rms>1e-4,lastSound=seg.startSeconds;
  for(let j=Math.floor(seg.startSeconds*hz);j<Math.min(frames.length,Math.ceil(seg.endSeconds*hz));j++){
   if(frames[j].rms>1e-4)lastSound=j/hz;
   const isActive=j/hz-lastSound<.8;
   if(isActive!==wasActive&&j/hz>seg.startSeconds+.08&&j/hz<seg.endSeconds-.08)points.push({t:j/hz,onset:false,boundary:true});
   wasActive=isActive;
  }
  points.sort((a,b)=>a.t-b.t);let ordinal=0;
  for(const point of points){
   const prev=anchors.at(-1),dt=point.t-prev.t;if(dt<.04)continue;
   let audible=false;for(let j=Math.floor(prev.t*hz);j<Math.min(frames.length,Math.ceil(point.t*hz));j++)if(frames[j].rms>1e-4){audible=true;break;}
   if(point.boundary||!audible||!active){anchors.push({t:point.t,p:{...prev.p},hold:0,action:seg.action,onset:point.onset});continue;}
   ordinal++;const odd=ordinal%2===1,side=seg.side;let target={...prev.p};
   switch(seg.action){
    case 'orbit':target={az:prev.p.az+orbitAngle(point.t)-orbitAngle(prev.t),r:1.1,el:8*Math.sin(point.t/3)*Math.PI/180};break;
    case 'scalp':target=ordinal%4===3?{...prev.p}:{az:(Math.sign(Math.sin(prev.p.az))||side)*Math.PI*(odd?.64:.92),r:odd?.28:.34,el:(odd?75:-30)*Math.PI/180};break;
    case 'lateralNear':target=ordinal===1?{az:side*Math.PI/2,r:.2,el:0}:{...prev.p};break;
    case 'lateralReturn':target=ordinal===1?{az:(Math.sign(Math.sin(prev.p.az))||side)*Math.PI/2,r:.2,el:0}:{...prev.p};break;
    case 'lateralFar':target=ordinal===1?{az:(Math.sign(Math.sin(prev.p.az))||side)*Math.PI/2,r:4,el:0}:{...prev.p};break;
    case 'depth':target=ordinal%2===0?{...prev.p}:{az:(Math.sign(Math.sin(prev.p.az))||side)*Math.PI*.8,r:Math.floor((ordinal-1)/2)%2===0?.27:1.95,el:prev.p.el};break;
    case 'lift':target=ordinal%4===3?{...prev.p}:{az:(Math.sign(prev.p.az)||side)*Math.PI*.94,r:.4,el:(ordinal%4===0?-32:78)*Math.PI/180};break;
    case 'sweep':target={az:side*(odd?-.95:.95),r:odd?.85:1.2,el:(odd?-15:30)*Math.PI/180};break;
    case 'retreat':target={az:(Math.sign(Math.sin(prev.p.az))||side)*Math.PI*.7,r:odd?3.5:.3,el:prev.p.el};break;
    case 'backpass':target={az:side*(odd?2.8:1.25),r:odd?.55:1.1,el:(odd?70:5)*Math.PI/180};break;
    case 'anchor':target=odd?{...prev.p}:{az:(Math.sign(Math.sin(prev.p.az))||side)*Math.PI*.32,r:.8,el:20*Math.PI/180};break;
   }
   const da=shortest(target.az-prev.p.az),dr=target.r-prev.p.r,de=target.el-prev.p.el;
   const rawTravel=Math.abs(dr)+Math.max(prev.p.r,target.r)*(Math.abs(da)+Math.abs(de));
   // Short motions wait then move quickly into the beat; longer moves start earlier.
   const preferredHold=['sweep','anchor'].includes(seg.action)?.32:seg.action==='depth'?.14:seg.action==='scalp'?.12:0;
   const peakFactor=seg.action==='orbit'?1:1.875;
   const hold=Math.min(preferredHold,Math.max(0,1-rawTravel*peakFactor/(3*dt)));
   const budget=3*dt*(1-hold)/peakFactor,scale=Math.min(1,budget/Math.max(1e-9,rawTravel));
   target={az:prev.p.az+da*scale,r:prev.p.r+dr*scale,el:prev.p.el+de*scale};
   anchors.push({t:point.t,p:target,hold,action:seg.action,onset:point.onset});
  }
 }
 if(anchors.at(-1).t<duration)anchors.push({...anchors.at(-1),t:duration,hold:0,onset:false});
 const sampleAt=t=>{let lo=0,hi=anchors.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(anchors[mid].t<=t)lo=mid;else hi=mid-1;}const a=anchors[lo],b=anchors[lo+1];if(!b)return fromPolar(a.p);const u=(t-a.t)/(b.t-a.t),v=b.action==='orbit'?clamp(u,0,1):quintic(clamp((u-b.hold)/(1-b.hold),0,1));return fromPolar({az:a.p.az+(b.p.az-a.p.az)*v,r:a.p.r+(b.p.r-a.p.r)*v,el:a.p.el+(b.p.el-a.p.el)*v});};
 // Keep exact onset endpoints in addition to the 20 Hz grid.
 const times=[...new Set([...Array.from({length:Math.ceil(duration/.05)+1},(_,i)=>Math.min(duration,i*.05)),...anchors.map(a=>a.t)])].sort((a,b)=>a-b).filter((t,i,arr)=>!i||t-arr[i-1]>1e-7);times[times.length-1]=duration;
 const keys=times.map(t=>({t,pose:sampleAt(t)}));
 const onsetCount=hits.length;
 const stillIntervals=anchors.slice(1).flatMap((a,i)=>{const b=anchors[i];return Math.abs(a.p.az-b.p.az)+Math.abs(a.p.r-b.p.r)+Math.abs(a.p.el-b.p.el)<1e-8?[{startSeconds:b.t,endSeconds:a.t}]:[];});
 const distances=keys.map(k=>Math.hypot(k.pose.x,k.pose.y,k.pose.z));
 const heights=keys.map(k=>Math.atan2(k.pose.z,Math.hypot(k.pose.x,k.pose.y))*180/Math.PI);
 return {keys,analysis:{algorithm:'audio-reactive-v9-orbit-scalp',estimatedBpm:bpm,tempoConfidence:+best.toFixed(3),onsetCount,durationSeconds:duration,featureRateHz:hz,keyframeRateHz:20,distanceRangeMeters:[.2,4],rendererProfile:'8d-depth-v1',distanceDemoPolicy:{maximumCount:demoBudget,scheduledCount:selected.length,startsSeconds:selected.map(i=>segments[i].startSeconds)},orbitPolicy:{secondsPerTurn:6.5,direction:'alternating complete clockwise/counterclockwise turns',smoothReversal:true,radiusMeters:1.1},distancePolicy:{ordinaryTargetsMeters:[.28,1.5],depthAccentMeters:[.27,1.95],lateralDemoMeters:[.2,4],farOnlyForDistanceDemo:true},stillIntervals,stillSeconds:+stillIntervals.reduce((sum,s)=>sum+s.endSeconds-s.startSeconds,0).toFixed(3),directionDesign:'calm intro: full orbits; quiet: near-head rear vertical movement; depth: side/rear; elevation: close rear; front-side sweeps and anchors; explicit stationary intervals',beatArrivals:anchors.filter(a=>a.onset).map(a=>({timeSeconds:a.t,action:a.action,holdFraction:a.hold})),detectedOnsets:hits.map(h=>({timeSeconds:h.time,strength:h.strength})),actualDistanceRangeMeters:[Math.min(...distances),Math.max(...distances)].map(v=>+v.toFixed(2)),actualElevationRangeDegrees:[Math.min(...heights),Math.max(...heights)].map(v=>+v.toFixed(1)),gestureTypes:[...new Set(segments.map(s=>s.label))],segments,silent:!active,features:['stereo RMS energy','positive log-energy onset','phrase energy change','relative section level','onset density'],note:'Heuristic gesture choreography; silence holds position. Analysis describes generation before manual edits.'}};
}

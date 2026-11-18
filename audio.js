import {sampleRoomBuffers} from './sample-room.js';
import {sofaNode} from './sofa.js?v=8';
import {spatial,poseAt} from './core.js?v=9';
// Chromium HRTFPanner crossfades old/new convolution outputs and ITD internally.
// Keep PannerNodes alive throughout movement; never swap or reset a running kernel.
// https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/audio/hrtf_panner.cc
export const TRANSITIONS={motionSeconds:.02,transportSeconds:.02,sourceEdgeSeconds:.008,sofaCrossfadeSeconds:.025,roomCrossfadeSeconds:.15};
// cancelAndHold alone need not add an event if an earlier ramp has already ended.
// Always anchor at NOW before a new ramp, or it may start at the previous event
// in the past and jump instantly (especially fast A/B toggles).
function holdNow(param,time){const value=param.value;param.cancelAndHoldAtTime(time);param.setValueAtTime(value,time);}
const irCache=new Map();
function roomImpulse(ctx,seconds){
 const key=ctx.sampleRate+':'+seconds;if(irCache.has(key))return irCache.get(key);
 const n=Math.ceil(ctx.sampleRate*seconds),b=ctx.createBuffer(2,n,ctx.sampleRate);let seed=13579;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
 for(let c=0;c<2;c++){const a=b.getChannelData(c);let low=0;for(let i=0;i<n;i++){low=.56*low+.44*rand();const t=i/ctx.sampleRate;a[i]=low*Math.exp(-6.91*t/seconds)*Math.min(1,t/.018);}
 for(const [t,g] of [[.017,.65],[.031,.43],[.057,.32],[.089,.2]])a[Math.floor((t+c*.003)*ctx.sampleRate)]+=g;}
 irCache.set(key,b);if(irCache.size>4)irCache.delete(irCache.keys().next().value);return b;
}
export function createGraph(ctx,buffer,room,{bypass=false,sofa=null,roomData=null}={}){
 room={...room};let comparison=bypass;
 const source=ctx.createBufferSource();source.buffer=buffer;
 const output=ctx.createGain();output.gain.value=10**(room.output/20);const transport=ctx.createGain();output.connect(transport);transport.connect(ctx.destination);
 const sourceGate=ctx.createGain();source.connect(sourceGate);
 const comp=ctx.createDynamicsCompressor();comp.threshold.value=-8;comp.knee.value=12;comp.ratio.value=4;comp.attack.value=.003;comp.release.value=.18;comp.connect(output);
 const highpass=ctx.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=28;highpass.Q.value=.707;
 const tone=ctx.createBiquadFilter();tone.type='highshelf';tone.frequency.value=4500;tone.gain.value=room.brightness;highpass.connect(tone);tone.connect(comp);
 const splitter=ctx.createChannelSplitter(2);sourceGate.connect(splitter);
 const dry=ctx.createGain(),wet=ctx.createGain(),original=ctx.createGain();dry.connect(highpass);wet.connect(highpass);sourceGate.connect(original);original.connect(output);
 original.gain.value=bypass?1:0;dry.gain.value=bypass?0:1;wet.gain.value=bypass?0:room.wet;
 const merger=ctx.createChannelMerger(2),roomSplit=ctx.createChannelSplitter(2);merger.connect(roomSplit);
 let roomPath=null,roomTimer=null,lastRoomUpdate=-Infinity,pendingRoom=null;
 const paths=new Set();
 function replaceRoom(r,initial=false){
  const t=ctx.currentTime,level=ctx.createGain();level.gain.value=initial?1:0;level.connect(wet);
  const buffers=roomData?sampleRoomBuffers(ctx,roomData,r.tail??1):[roomImpulse(ctx,r.decay)];
  const nodes=buffers.map((buffer,i)=>{const delay=ctx.createDelay(.2),conv=ctx.createConvolver();delay.delayTime.value=r.predelay/1000;conv.normalize=!roomData;conv.buffer=buffer;if(roomData)roomSplit.connect(delay,i);else merger.connect(delay);delay.connect(conv);conv.connect(level);return {delay,conv};});
  const next={nodes,level};paths.add(next);
  const dispose=old=>{for(const {delay,conv}of old.nodes){try{(roomData?roomSplit:merger).disconnect(delay);}catch{}delay.disconnect();conv.disconnect();}old.level.disconnect();paths.delete(old);};
  if(!initial){level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(1,t+TRANSITIONS.roomCrossfadeSeconds);}
  if(roomPath){const old=roomPath;holdNow(old.level.gain,t);old.level.gain.linearRampToValueAtTime(0,t+TRANSITIONS.roomCrossfadeSeconds);setTimeout(()=>dispose(old),250);}
  roomPath=next;lastRoomUpdate=t;
 }
 replaceRoom(room,true);
 const branches=[0,1].map(c=>{const input=ctx.createGain();input.gain.value=.7071;splitter.connect(input,c);
 const air=ctx.createBiquadFilter();air.type='lowpass';air.Q.value=.5;input.connect(air);
 const panner=sofa?sofaNode(ctx,sofa):ctx.createPanner();if(!sofa){panner.panningModel='HRTF';panner.distanceModel='inverse';panner.rolloffFactor=0;panner.refDistance=1;panner.maxDistance=100;}const xyz=sofa?['x','y','z'].map(k=>panner.parameters.get(k)):[panner.positionX,panner.positionY,panner.positionZ];
 const gain=ctx.createGain(),send=ctx.createGain();air.connect(gain);gain.connect(panner);panner.connect(dry);air.connect(send);send.connect(merger,0,c);
 return {air,panner,gain,send,xyz};});
 const params=branches.flatMap(b=>[...b.xyz,b.air.frequency,b.gain.gain,b.send.gain]);
 function apply(p,t,ramp=false){const s=spatial(p,room.distanceEffect??0);branches.forEach((b,i)=>{const loc=i?s.right:s.left;const pairs=[[b.xyz[0],loc.x],[b.xyz[1],sofa?loc.y:loc.z],[b.xyz[2],sofa?loc.z:-loc.y],[b.air.frequency,Math.min(ctx.sampleRate*.45,s.cutoff)],[b.gain.gain,s.direct],[b.send.gain,s.send*.7]];for(const [a,v] of pairs){if(!ramp)a.setValueAtTime(v,t);else if(a===b.air.frequency)a.exponentialRampToValueAtTime(v,t);else a.linearRampToValueAtTime(v,t);}});}
 function schedule(keys,offset,when,duration,transition=0){
  for(const p of params){if(transition)holdNow(p,when);else p.cancelScheduledValues(when);}
  const fade=Math.min(transition,Math.max(0,duration-offset));apply(poseAt(keys,offset+fade),when+fade,fade>0);
  for(let i=1;i<=Math.ceil((duration-offset)*60);i++){const at=Math.min(duration,offset+i/60);if(at-offset<=fade)continue;apply(poseAt(keys,at),when+at-offset,true);}
 }

 let stopped=false;
 function start(when=ctx.currentTime,offset=0){
  const remaining=buffer.duration-offset,fade=Math.min(TRANSITIONS.sourceEdgeSeconds,remaining/2);
  sourceGate.gain.setValueAtTime(0,when);sourceGate.gain.linearRampToValueAtTime(1,when+fade);
  sourceGate.gain.setValueAtTime(1,when+remaining-fade);sourceGate.gain.linearRampToValueAtTime(0,when+remaining);
  source.start(when,offset);
 }
 function stopAt(at){
  if(stopped)return;stopped=true;
  transport.gain.cancelAndHoldAtTime(at);transport.gain.setValueAtTime(1,at);
  transport.gain.linearRampToValueAtTime(0,at+TRANSITIONS.transportSeconds);
  try{source.stop(at+TRANSITIONS.transportSeconds);}catch{}
 }
 return {source,start,apply,schedule,stopAt,
  setRoom(data,next){if(stopped)return;roomData=data;clearTimeout(roomTimer);pendingRoom=null;room={...next};replaceRoom(room);},
  setSofa(data){if(!sofa)throw Error('当前图未启用 SOFA');for(const b of branches)b.panner.port.postMessage(data);sofa=data;},
  updateRoom(next){const previous=room;room={...next};const t=ctx.currentTime;for(const [p,v]of [[wet.gain,comparison?0:room.wet],[output.gain,10**(room.output/20)],[tone.gain,room.brightness]]){holdNow(p,t);p.linearRampToValueAtTime(v,t+.02);}
   if(previous.decay!==room.decay||previous.tail!==room.tail||previous.predelay!==room.predelay){pendingRoom={...room};clearTimeout(roomTimer);const flush=()=>{if(!stopped&&pendingRoom){replaceRoom(pendingRoom);pendingRoom=null;}};const wait=Math.max(0,.15-(t-lastRoomUpdate));if(wait===0)flush();else roomTimer=setTimeout(flush,wait*1000);}
  },
  live(p){const now=ctx.currentTime;for(const a of params)holdNow(a,now);apply(p,now+TRANSITIONS.motionSeconds,true);},
  compare(on){comparison=on;const t=ctx.currentTime;for(const [a,value] of [[original.gain,on?1:0],[dry.gain,on?0:1],[wet.gain,on?0:room.wet]]){holdNow(a,t);a.linearRampToValueAtTime(value,t+TRANSITIONS.transportSeconds);}},
  stop(){stopAt(ctx.currentTime);clearTimeout(roomTimer);setTimeout(()=>{transport.disconnect();source.disconnect();for(const b of branches)if(sofa){b.panner.port.postMessage({type:'dispose'});b.panner.disconnect();}for(const p of paths){for(const n of p.nodes){n.delay.disconnect();n.conv.disconnect();}p.level.disconnect();}paths.clear();},Math.ceil(TRANSITIONS.transportSeconds*1000)+80);}
 };
}

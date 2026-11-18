export const ROOM_PRESETS=[
 {id:'enveloping',stem:'surrey-enveloping',name:'Surrey · 包围',seconds:.5},
 {id:'wet',stem:'surrey-wet',name:'Surrey · 湿润',seconds:.5},
 {id:'clear',stem:'surrey-clear',name:'Surrey · 清晰',seconds:.5},
 {id:'chamber',stem:'brahmssaal-chamber',name:'Brahmssaal · 室内乐厅',seconds:1.2},
 {id:'chamberLong',stem:'brahmssaal-long',name:'Brahmssaal · 长尾',seconds:2},
 {id:'hallLong',stem:'konzerthaus-long',name:'Konzerthaus · 音乐厅',seconds:68026/48000}
];
export const DEFAULT_ROOM='chamberLong';
export const roomPreset=id=>ROOM_PRESETS.find(p=>p.id===id)||ROOM_PRESETS.find(p=>p.id===DEFAULT_ROOM);
export const sampleTail=room=>roomPreset(room.preset).seconds*(room.tail??1);
const cache=new Map();
export async function loadSampleRoom(id=DEFAULT_ROOM,rate=48000){
 const preset=ROOM_PRESETS.find(p=>p.id===id);if(!preset)throw Error('未知采样混响');
 const key=id+':'+rate;if(cache.has(key))return cache.get(key);
 const promise=(async()=>{
  const [mr,ir]=await Promise.all([fetch(`./sofa-data/room/${preset.stem}.json`),fetch(`./sofa-data/room/${preset.stem}.f32`)]);
  if(!mr.ok||!ir.ok)throw Error('采样混响加载失败：'+preset.name);
  const meta=await mr.json(),raw=new Float32Array(await ir.arrayBuffer());
  if(raw.length!==meta.channels.length*2*meta.length||!raw.every(Number.isFinite))throw Error('采样混响数据损坏');
  // Fixed ±30° room sends retain the stereo input; direct sound follows the object.
  const directions=[30,-30].map(az=>meta.channels.reduce((best,c,i)=>Math.cos((c.position[0]-az)*Math.PI/180)*Math.cos(c.position[1]*Math.PI/180)>best.score?{index:i,score:Math.cos((c.position[0]-az)*Math.PI/180)*Math.cos(c.position[1]*Math.PI/180)}:best,{index:0,score:-Infinity}).index);
  const ratio=rate/meta.sampleRate,n=Math.ceil(meta.length*ratio);
  const pairs=directions.map(d=>[0,1].map(ear=>{
   const input=raw.subarray((d*2+ear)*meta.length,(d*2+ear+1)*meta.length);if(ratio===1)return input.slice();
   const out=new Float32Array(n),cutoff=Math.min(1,ratio),radius=32/cutoff;
   for(let j=0;j<n;j++){const t=j/ratio;let sum=0;for(let k=Math.max(0,Math.ceil(t-radius));k<=Math.min(input.length-1,Math.floor(t+radius));k++){const delta=t-k,u=delta*cutoff,sinc=Math.abs(u)<1e-12?1:Math.sin(Math.PI*u)/(Math.PI*u),win=.42+.5*Math.cos(Math.PI*delta/radius)+.08*Math.cos(2*Math.PI*delta/radius);sum+=input[k]*cutoff*sinc*win;}out[j]=sum/ratio;}return out;
  }));
  return {id,rate,pairs,seconds:meta.length/meta.sampleRate,sourceRate:meta.sampleRate,sourceDirections:directions.map(i=>meta.channels[i].position),source:meta.source,processing:meta.processing,license:'CC BY 4.0',name:preset.name};
 })();cache.set(key,promise);try{return await promise;}catch(e){cache.delete(key);throw e;}
}
export function sampleRoomBuffers(ctx,data,tail=1){
 return data.pairs.map(pair=>{const n=Math.max(1,Math.round(pair[0].length*tail)),b=ctx.createBuffer(2,n,data.rate),fade=Math.min(n,Math.round(data.rate*.05));for(let ear=0;ear<2;ear++){const a=b.getChannelData(ear);a.set(pair[ear].subarray(0,n));if(tail<1)for(let i=n-fade;i<n;i++)a[i]*=.5+.5*Math.cos(Math.PI*(i-(n-fade))/fade);}return b;});
}
export function sampleRoomMetadata(data,room){return {type:'measured wet-only binaural convolution',preset:data.id,name:data.name,sourceRate:data.sourceRate,renderRate:data.rate,source:data.source,license:data.license,attribution:'sofa-data/room/ATTRIBUTION.txt',processing:data.processing,sourceDirections:data.sourceDirections,routing:'fixed room sends; object motion applied to direct HRIR path',sampleSupportSeconds:data.seconds,retainedSeconds:data.seconds*(room.tail??1),tailRetention:room.tail??1,normalize:false};}

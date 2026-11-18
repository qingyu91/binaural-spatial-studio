export const DEFAULT_SOFA='p0150';
const rawCache=new Map(),rateCache=new Map(),modules=new WeakMap();
export async function listSofas(){const r=await fetch('./sofa-data/index.json');if(!r.ok)throw Error('SOFA 列表加载失败');return r.json();}
async function rawSofa(id){
 if(!/^p\d{4}$/.test(id))throw Error('SOFA 编号无效');
 if(rawCache.has(id))return rawCache.get(id);
 const promise=(async()=>{const mr=await fetch(`./sofa-data/${id}.json`);if(!mr.ok)throw Error('找不到 SOFA '+id);const meta=await mr.json();const rr=await fetch(`./sofa-data/${id}.hrir.f32`);if(!rr.ok)throw Error('SOFA 响应加载失败');const data=new Float32Array(await rr.arrayBuffer());if(data.length!==meta.numMeasurements*2*meta.irLength||!data.every(Number.isFinite))throw Error('SOFA 数据无效');return {meta,data};})();
 rawCache.set(id,promise);if(rawCache.size>6)rawCache.delete(rawCache.keys().next().value);try{return await promise;}catch(e){rawCache.delete(id);throw e;}
}
export async function loadSofa(id,rate){
 const key=id+':'+rate;if(rateCache.has(key))return rateCache.get(key);
 const {meta,data}=await rawSofa(id),ratio=rate/meta.sampleRate,n=Math.ceil(meta.irLength*ratio),count=meta.numMeasurements;
 const out=new Float32Array(count*2*n),vectors=new Float32Array(count*3);
 // Same gain-preserving windowed-sinc FIR resampling as the reference renderer.
 for(let d=0;d<count;d++){
  const [az,el]=meta.positions[d].map(v=>v*Math.PI/180);vectors.set([Math.sin(az)*Math.cos(el),Math.cos(az)*Math.cos(el),Math.sin(el)],d*3);
  for(let ear=0;ear<2;ear++){
   const input=data.subarray((d*2+ear)*meta.irLength,(d*2+ear+1)*meta.irLength),base=(d*2+ear)*n;
   if(ratio===1){out.set(input,base);continue;}
   const cutoff=Math.min(1,ratio),radius=32/cutoff;
   for(let j=0;j<n;j++){const t=j/ratio;let sum=0;for(let k=Math.max(0,Math.ceil(t-radius));k<=Math.min(input.length-1,Math.floor(t+radius));k++){const delta=t-k,u=delta*cutoff,sinc=Math.abs(u)<1e-12?1:Math.sin(Math.PI*u)/(Math.PI*u),win=.42+.5*Math.cos(Math.PI*delta/radius)+.08*Math.cos(2*Math.PI*delta/radius);sum+=input[k]*cutoff*sinc*win;}out[base+j]=sum/ratio;}
  }
 }
 let energy=0;for(const v of data)energy+=v*v;const makeup=Math.min(6,1/Math.sqrt(energy/(count*2)));for(let i=0;i<out.length;i++)out[i]*=makeup;
 const result={id,rate,n,count,data:out,vectors,makeup,sourceRate:meta.sampleRate};rateCache.set(key,result);if(rateCache.size>6)rateCache.delete(rateCache.keys().next().value);return result;
}
export async function prepareSofa(ctx,id=DEFAULT_SOFA){
 if(!ctx.audioWorklet)throw Error('当前浏览器不支持实时 SOFA 渲染，请使用支持 AudioWorklet 的浏览器');
 if(!modules.has(ctx))modules.set(ctx,ctx.audioWorklet.addModule('./sofa-worklet.js?v=8'));
 await modules.get(ctx);return loadSofa(id,ctx.sampleRate);
}
export function sofaNode(ctx,data){return new AudioWorkletNode(ctx,'sofa-fir',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:1,channelCountMode:'explicit',processorOptions:data});}

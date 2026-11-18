// Shared input history makes coefficient interpolation exactly equivalent to
// old/new FIR OUTPUT crossfade. Retarget from the current blended filter, never
// clear convolution history, including when changing the SOFA dataset.
class SofaFIR extends AudioWorkletProcessor {
 static get parameterDescriptors(){return ['x','y','z'].map(name=>({name,defaultValue:name==='y'?1.5:0,automationRate:'k-rate'}));}
 constructor(options){super();const d=options.processorOptions;this.n=d.n;this.history=new Float32Array(d.n*2);this.aL=new Float32Array(d.n);this.aR=new Float32Array(d.n);this.nearL=1;this.nearR=1;this.pos=0;this.alpha=1;this.index=-1;this.initial=true;this.active=true;this.setData(d);this.port.onmessage=e=>{if(e.data.type==='dispose'){this.active=false;return;}const next=e.data;if(next.n!==this.n)return;this.freeze();this.setData(next);this.index=-1;};}
 setData(d){this.data=d.data;this.vectors=d.vectors;this.count=d.count;this.id=d.id;}
 freeze(){if(this.index<0)return;const a=this.alpha,b=1-a,o=this.index*2*this.n;for(let k=0;k<this.n;k++){this.aL[k]=b*this.aL[k]+a*this.data[o+k];this.aR[k]=b*this.aR[k]+a*this.data[o+this.n+k];}this.alpha=0;}
 process(inputs,outputs,params){
  if(!this.active)return false;
  const output=outputs[0],left=output[0],right=output[1],input=inputs[0]?.[0];if(!left||!right)return true;
  const x=-params.x[0],y=params.y[0],z=params.z[0],r=Math.hypot(x,y,z)||1;let score=-Infinity,idx=0;
  for(let i=0;i<this.count;i++){const o=i*3,d=(x*this.vectors[o]+y*this.vectors[o+1]+z*this.vectors[o+2])/r;if(d>score){score=d;idx=i;}}
  if(idx!==this.index){this.freeze();this.index=idx;if(this.initial){const o=idx*2*this.n;this.aL.set(this.data.subarray(o,o+this.n));this.aR.set(this.data.subarray(o+this.n,o+2*this.n));this.initial=false;this.alpha=1;}else this.alpha=0;}
  // Approximate near-field level difference on top of directional measured HRIR.
  // World +X is right; preserve mean-square gain and fade out by 0.9 m.
  const wx=params.x[0],distance=Math.max(.2,Math.hypot(wx,y,z));
  const u=Math.max(0,Math.min(1,(.9-distance)/.7)),blend=u*u*(3-2*u);
  const ear=.0875,dl=Math.hypot(wx+ear,y,z),dr=Math.hypot(wx-ear,y,z);
  const gl=distance/Math.max(.1,dl),gr=distance/Math.max(.1,dr),norm=Math.sqrt((gl*gl+gr*gr)/2);
  const targetL=1+blend*(gl/norm-1),targetR=1+blend*(gr/norm-1),smooth=1-Math.exp(-1/(sampleRate*.025));
  const n=this.n,o=idx*2*n,data=this.data,h=this.history,aL=this.aL,aR=this.aR,step=1/(sampleRate*.025);let pos=this.pos,a=this.alpha;
  for(let i=0;i<left.length;i++){
   const v=input?input[i]:0;h[pos]=v;h[pos+n]=v;let l=0,r=0;
   if(a>=1){for(let k=0;k<n;k++){const s=h[pos+n-k];l+=s*data[o+k];r+=s*data[o+n+k];}}
   else {let oldL=0,oldR=0;for(let k=0;k<n;k++){const s=h[pos+n-k];oldL+=s*aL[k];oldR+=s*aR[k];l+=s*data[o+k];r+=s*data[o+n+k];}l=oldL*(1-a)+l*a;r=oldR*(1-a)+r*a;a=Math.min(1,a+step);}
   this.nearL+=(targetL-this.nearL)*smooth;this.nearR+=(targetR-this.nearR)*smooth;left[i]=l*this.nearL;right[i]=r*this.nearR;if(++pos===n)pos=0;
  }
  this.alpha=a;this.pos=pos;return true;
 }
}
registerProcessor('sofa-fir',SofaFIR);

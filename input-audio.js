import {wavInfo} from './core.js';

export const AUDIO_ACCEPT='audio/*,.wav,.wave,.mp3,.flac,.m4a,.aac,.ogg,.oga,.opus,.webm,.mp4,.aif,.aiff';
export function isRiffWave(bytes){
 if(bytes.byteLength<12)return false;
 const a=new Uint8Array(bytes,0,12);
 return String.fromCharCode(...a.subarray(0,4))==='RIFF'&&String.fromCharCode(...a.subarray(8,12))==='WAVE';
}
export function audioBaseName(name){return name.replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*]/g,'_')||'spatial';}

// Decode content, not its filename or MIME hint. Keep original bytes for portable
// projects. WAV keeps its declared sample rate; other codecs render at 48 kHz.
export async function decodeAudio(bytes){
 if(!(bytes instanceof ArrayBuffer)||!bytes.byteLength)throw Error('音频文件为空或数据无效');
 const sampleRate=isRiffWave(bytes)?wavInfo(bytes).sampleRate:48000;
 const context=new OfflineAudioContext(2,1,sampleRate);
 let buffer;
 try{buffer=await context.decodeAudioData(bytes.slice(0));}
 catch{throw Error('无法解码此音频：文件可能损坏、加密，或当前浏览器不支持其编码。请使用 WAV、MP3、FLAC、M4A/AAC、OGG/Opus 等常见音频；具体编码支持取决于浏览器。');}
 if(buffer.numberOfChannels!==2)throw Error(`需要双声道立体声音频，当前解码得到 ${buffer.numberOfChannels} 声道`);
 if(buffer.duration>1800)throw Error('当前版本支持最长 30 分钟的音频');
 if(!buffer.length)throw Error('音频文件没有可用采样');
 return buffer;
}

import fs from 'node:fs';
const read=p=>{const b=fs.readFileSync(p);return JSON.parse((b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,''))};
const stats=values=>{if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))throw Error('Invalid samples');const s=[...values].sort((a,b)=>a-b);return {count:s.length,meanMs:s.reduce((a,b)=>a+b,0)/s.length,p95Ms:s[Math.min(s.length-1,Math.ceil(s.length*.95)-1)],maxMs:s.at(-1)}};
const modes=['on','off','off','on','on','off'];
const ticks=Object.fromEntries(['on','off'].map(m=>[m,read(`output/solo/lc00-p005-comparison/${m}/external-ticks.json`).samples]));
const trials=modes.map((mode,i)=>{
 const r=read(`artifacts/evidence/living-city/lc00-p005-comparison-${i+1}.json`);
 if(r.result!=='measured'||r.captureEnabled!==(mode==='on')||r.serverCaptureEnabled!==(mode==='on'))throw Error('Mode mismatch');
 if(r.intervalVersion!==2||r.viewport?.width!==1920||r.viewport?.height!==1080)throw Error('Final 1080p comparison is incomplete');
 const window=ticks[mode].filter(t=>t.at>=r.start&&t.at<=r.end);
 if(window.some(t=>t.paused||t.activeAgents!==1))throw Error('Comparison not continuously active');
 // v1 observer enrolled between RAFs: its first delta mixed performance.now and the prior RAF timestamp.
 // Preserve that raw value separately; it is not an inter-frame interval. Never remove real long intervals.
 return {trial:i+1,mode,start:r.start,end:r.end,viewport:r.viewport??null,clientBuild:r.clientBuild,serverBuild:r.serverBuild,
   enrollmentPartialMs:r.intervalVersion===2?null:r.samples[0],frame:stats(r.intervalVersion===2?r.samples:r.samples.slice(1)),tickWork:stats(window.map(t=>t.ms))};
});
const pairs=[[0,1],[3,2],[4,5]].map(([on,off])=>({on:on+1,off:off+1,framePercent:100*(trials[on].frame.meanMs/trials[off].frame.meanMs-1),tickPercent:100*(trials[on].tickWork.meanMs/trials[off].tickWork.meanMs-1)}));
const means=Object.fromEntries(modes.slice(0,2).map(mode=>{const t=trials.filter(t=>t.mode===mode);return [mode,{frameMs:t.reduce((n,t)=>n+t.frame.meanMs,0)/t.length,tickMs:t.reduce((n,t)=>n+t.tickWork.meanMs,0)/t.length}]}));
const summary={result:'measured',trials,pairs,means,framePercent:100*(means.on.frameMs/means.off.frameMs-1),tickPercent:100*(means.on.tickMs/means.off.tickMs-1),
 method:'Three runs each, balanced order on/off/off/on/on/off; same 3 s warmup and 12 s standing opening-scene route and external observers. Independent actual solo stores and capture-specific build IDs. All raw frame intervals retained.',
 qualification:'Short local diagnostic baseline only. Not a 1% confidence bound, human playtest, sustained-load benchmark or RTX 4070/16 GB qualification. Tick work excludes asynchronous journal flush but RAF/event-loop capture includes scheduling impact. Capture-off skips recorder/journal/clock work; common instrumentation call sites and external observers remain in both modes.'};
fs.writeFileSync('artifacts/evidence/living-city/lc00-p005-overhead.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));

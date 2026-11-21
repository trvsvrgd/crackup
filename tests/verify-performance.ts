import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { DiagnosticRecorder, sanitizeDiagnosticEvent, type DiagnosticEvent } from '../shared/diagnostics/events.js';
import { PerformanceSampler, PerformanceClock } from '../shared/diagnostics/performance.js';
import { BugReportRecorder } from '../client/diagnostics/bugReport.js';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
import { diagnosticIdentity } from '../server/diagnostics.js';

const startedAt = new Date().toISOString(), checks: string[] = [], traces: DiagnosticEvent[] = [];
const pass=(s:string)=>{checks.push(s);console.log('PASS '+s)};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(test:()=>boolean, timeout=15000) { const end=Date.now()+timeout; while(!test()){assert.ok(Date.now()<end,'Timed out');await delay(20)} }
const recorder=new BugReportRecorder('client-0123456789abcdef');
recorder.frame(1500,'background');recorder.frame(510,'paused');recorder.frame(16,'active');
const r=recorder.report('client-0123456789abcdef','');
assert.deepEqual(r.rendering.intervals.map(s=>s.state),['background','paused','active']);assert.equal(r.rendering.maxFrameMs,1500);
assert.equal(r.diagnostics.events.filter(e=>e.name==='performance.stall').length,2);
for(let i=0;i<10000;i++) recorder.performance.sample('render.work',1,'active');
const bucket=recorder.performance.snapshot().find(s=>s.metric==='render.work')!;
assert.equal(bucket.sampleCount,10000);assert.equal(bucket.retainedSamples,120);assert.equal(bucket.truncatedSamples,9880);
recorder.performance.sample('render.work',NaN);recorder.performance.sample('render.work',-1);assert.equal(recorder.performance.snapshot().find(s=>s.metric==='render.work')!.sampleCount,10000);
const safe=sanitizeDiagnosticEvent({...r.diagnostics.events.at(-1),payload:{metric:'private-path',state:'private-token',durationMs:510,pin:'PRIVATE-P005'}})!;
assert.deepEqual(safe.payload,{durationMs:510});recorder.journal.close();
pass('Raw long frames retain lifecycle state; fixed metric/sample caps and privacy validation reject arbitrary labels');

const disabled=new BugReportRecorder(undefined,false);disabled.frame(1000);disabled.record('runtime-error',Error('private'));assert.equal(disabled.report('test','').diagnostics.events.length,0);assert.equal(disabled.journal.snapshot().storageState,'disabled');disabled.journal.close();
const events:DiagnosticEvent[]=[], clockRecorder=new DiagnosticRecorder('server',{},e=>events.push(e));
const sampler=new PerformanceSampler(clockRecorder), clock=new PerformanceClock(clockRecorder,sampler,()=> 'paused',()=>{});
clock.start();await delay(100);const block=performance.now();while(performance.now()-block<500){} await delay(2200);clock.stop();
assert.ok(events.some(e=>e.name==='performance.stall'&&e.payload.metric==='eventloop.delay'&&Number(e.payload.durationMs)>=300&&e.payload.state==='paused'));
assert.ok(events.some(e=>e.name==='performance.heartbeat'));traces.push(...events);
pass('Real 500 ms blocked event loop produces a delayed paused heartbeat/stall; disabled capture writes no client events');

await fs.mkdir('output/solo',{recursive:true});const root=await fs.mkdtemp(path.resolve('output/solo/lc00-p005-'));
const server=new CrackupAuthoritativeServer({mode:'solo',port:0,dbPath:path.join(root,'campaigns.db')});
server.diagnostics.subscribe(e=>{if(traces.length<5000)traces.push(e)});
let ws:WebSocket|undefined;
try {
  const port=await server.start();ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);const messages:any[]=[];
  ws.on('message',(data,binary)=>{if(!binary)messages.push(JSON.parse(data.toString()))});await once(ws,'open');
  ws.send(JSON.stringify({type:'AUTH',callsign:'P005METRICS',pin:'685421'}));await until(()=>messages.some(m=>m.type==='AUTH_OK'));
  ws.send(JSON.stringify({type:'SOLO_SAVE'}));await until(()=>traces.some(e=>e.name==='save.committed'));
  await delay(2300);
  assert.ok(traces.some(e=>e.name==='performance.sample'&&e.payload.metric==='save.serialize'));
  assert.ok(traces.some(e=>e.name==='performance.sample'&&e.payload.metric==='save.commit'));
  assert.ok(traces.some(e=>e.name==='performance.resources'&&Number(e.payload.bodies)>0&&Number(e.payload.rssBytes)>0));
  assert.ok(traces.some(e=>e.name==='network.traffic'&&Number(e.payload.bytes)>0));
  const started=performance.now();while(performance.now()-started<500){} await delay(400);
  assert.ok(traces.some(e=>e.name==='performance.stall'&&e.payload.metric==='simulation.interval'&&Number(e.payload.catchupDroppedMs)>300));
  // Actual TCP receive backpressure, without assigning a fake bufferedAmount.
  (ws as any)._socket.pause();
  await until(()=>traces.some(e=>e.name==='network.pressure'),25000);
  const pressure=traces.find(e=>e.name==='network.pressure')!;
  assert.ok(Number(pressure.payload.bufferedBytes)>1024*1024);assert.equal(pressure.payload.closeCode,4008);
  (ws as any)._socket.resume();
  pass('Real save/serialization/resource/traffic metrics, 500 ms server stall and TCP backpressure guard are observable');
} finally { ws?.terminate(); await server.stop();server.physicsWorld.world.free(); }
await fs.writeFile('artifacts/evidence/living-city/lc00-p005-performance.json',JSON.stringify({result:'passed',startedAt,finishedAt:new Date().toISOString(),builds:diagnosticIdentity(),checks,
  method:'Isolated actual solo/SQLite/WebSocket; 500 ms busy-loop and paused TCP reads are intentional staging faults, not spontaneous-crash attribution.',traces},null,2)+'\n');

// Isolated comparison harness: same production server, extra external timing observer only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CrackupAuthoritativeServer } from '../server/gameServer.js';
const port=Number(process.env.SOLO_PORT), root=process.env.SOLO_DATA_DIR!;
if(![33523,33524].includes(port)||!path.resolve(root).startsWith(path.resolve('output/solo/lc00-p005')))throw Error('Isolated fixture configuration required');
const server=new CrackupAuthoritativeServer({mode:'solo',port,dbPath:path.join(root,'campaigns.db'),publicDir:process.env.P005_PUBLIC_DIR});
const samples:{at:number;ms:number;paused:boolean;activeAgents:number}[]=[];
const tick=server.tickAuthoritativeSimulation.bind(server);
server.tickAuthoritativeSimulation=()=>{const start=performance.now();try{return tick()}finally{if(samples.length>=30000)samples.shift();samples.push({at:Date.now(),ms:performance.now()-start,paused:server.soloPaused,activeAgents:server.getActiveAgentCount()})}};
await server.start();console.log(JSON.stringify({ready:true,port,pid:process.pid,runId:server.diagnostics.runId,capture:server.diagnostics.enabled}));
const output=path.join(root,'external-ticks.json');
const timer=setInterval(()=>{void fs.writeFile(output,JSON.stringify({capturedAt:new Date().toISOString(),samples}));},2000);
timer.unref();
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void (async()=>{clearInterval(timer);await server.stop();await fs.writeFile(output,JSON.stringify({samples}));server.physicsWorld.world.free();process.exit(0)})()});

// Playwright CLI. Real isolated solo runtime; injected faults and gamepad API are labeled below.
async (page) => {
  const checks = [], startedAt = new Date().toISOString(), states = [], inputs = [];
  const check = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
  const report = async () => JSON.parse(await page.locator('#bug-report-preview').inputValue());
  const waitHistory = () => page.waitForFunction(() => !document.querySelector('#bug-report-history').textContent.startsWith('Loading'));
  const waitSelection = () => page.waitForFunction(() => !document.querySelector('#bug-report-download').disabled);
  const hold = async (buttons = [], axes = [0, 0, 0, 0]) => {
    await page.bringToFront();
    await page.evaluate(({buttons, axes}) => Object.assign(window.reportController, {buttons, axes}), {buttons, axes});
    // Wait for actual input polling frames; fixed short sleeps can miss a tap under parallel CPU load.
    await page.evaluate(()=>new Promise(resolve=>{let frames=0;const tick=()=>{if(++frames>=8)resolve();else requestAnimationFrame(tick)};requestAnimationFrame(tick)}));
  };
  const tap = async b => { await hold([b]); await hold(); };
  page.on('websocket', socket => {
    socket.on('framereceived', ({payload}) => { if (typeof payload === 'string') { try { const m=JSON.parse(payload); if(m.type==='SOLO_STATE') states.push(m); } catch {} } });
    socket.on('framesent', ({payload}) => { if(typeof payload!=='string' && payload.length===29 && payload[0]===1) inputs.push({x:payload.readFloatLE(5),z:payload.readFloatLE(9),buttons:payload.readUInt16LE(21)}); });
  });
  await page.addInitScript(() => {
    localStorage.setItem('crackup.cinematicIntros', 'false');
    window.reportController={buttons:[], axes:[0,0,0,0]};
    Object.defineProperty(navigator, 'getGamepads', { configurable:true, value:()=> [{id:'Xbox STANDARD GAMEPAD test API',index:0,connected:true,mapping:'standard',timestamp:performance.now(), axes:window.reportController.axes,
      buttons:Array.from({length:17},(_,i)=>({pressed:window.reportController.buttons.includes(i),value:window.reportController.buttons.includes(i)?1:0}))}] });
  });
  try {
    await page.reload(); await page.bringToFront();
    await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
    let downloads=0; page.on('download',()=>downloads++);
    await page.locator('#auth-overlay [data-bug-report]').click(); await waitHistory();
    await page.locator('#bug-report-notes').fill('Open the report from profiles.');
    await page.locator('#bug-report-expected').fill('A usable saved report.');
    await page.locator('#bug-report-actual').fill('Testing selected-session export.');
    const initial=await report();
    check(initial.notes==='Open the report from profiles.' && initial.expected==='A usable saved report.' && initial.actual==='Testing selected-session export.', 'Main-menu preview includes separate steps, expected and actual fields');
    await page.keyboard.press('Escape');
    check(downloads===0 && await page.locator('#auth-overlay [data-bug-report]').evaluate(e=>e===document.activeElement), 'Cancelling report before export creates no download and restores focus');
    await page.locator('#auth-overlay [data-bug-report]').click(); await waitHistory();
    await page.locator('#bug-report-location summary').click();
    await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new DOMException('denied','NotAllowedError')}}));
    await page.locator('#bug-report-copy-folder').click();
    check((await page.locator('#bug-report-folder-status').textContent()).includes('manual copying'), 'Injected clipboard denial selects path for manual copying without claiming success');
    const folder=await page.locator('#bug-report-folder').inputValue();
    check(folder.endsWith('logs') && !JSON.stringify(await report()).includes(folder), 'Actual local log folder is discoverable and excluded from report');
    await page.locator('#bug-report-close').click();

    await page.route('**/api/diagnostics/**',route=>route.fulfill({status:503,body:'unavailable fixture'}));
    await page.locator('#auth-overlay [data-bug-report]').click(); await waitHistory();
    check((await page.locator('#bug-report-history').textContent()).includes('unavailable') && !(await page.locator('#bug-report-download').isDisabled()) && await page.locator('#bug-report-copy-folder').isDisabled(), 'Injected inaccessible runtime logs leave browser export available with explicit status');
    await page.locator('#bug-report-close').click(); await page.unroute('**/api/diagnostics/**');

    await page.locator('#callsign-input').fill('P004REPORT'); await page.locator('#pin-input').fill('685421');
    await page.locator('#deploy-button').click(); await page.locator('#auth-overlay').waitFor({state:'hidden'});
    for(let i=0;i<3 && !(await page.locator('#field-menu').isVisible());i++) await page.keyboard.press(i===2?'b':'Escape');
    await page.locator('#field-menu').waitFor({state:'visible'});
    await page.locator('#solo-save').click(); await page.waitForTimeout(500);
    await page.locator('#field-menu [data-bug-report]').click(); await waitHistory();
    await page.locator('#bug-report-notes').fill('Live paused report'); await page.locator('#bug-report-notes').press('b');
    check(await page.locator('#bug-report').evaluate(e=>e.open) && states.some(s=>s.paused), 'Live report keeps typing isolated while solo authority acknowledges pause');
    inputs.length=0; await hold([7],[0,-1,1,0]); await hold();
    check(states.at(-1)?.paused===true && (await report()).session.connected && inputs.every(p=>p.x===0 && p.z===0 && !(p.buttons&32)), 'Held controller movement/fire cannot leak through the report while authority remains paused (zero or neutral packets)');
    await page.locator('#bug-report-session').focus(); const old=await page.locator('#bug-report-session').inputValue();
    await tap(15); await waitSelection();
    check((await page.locator('#bug-report-session').inputValue())!==old, 'Controller D-pad selects another session through production menu routing');
    await tap(1); await page.locator('#bug-report').waitFor({state:'hidden'});
    check(await page.locator('#field-menu').isVisible(), 'Controller B closes only report and leaves paused field menu');
    await page.locator('#field-menu [data-bug-report]').click(); await waitHistory();
    const runtime=await page.locator('#bug-report-session option').evaluateAll(options=>options.find(o=>o.value.startsWith('runtime:')).value);
    await page.locator('#bug-report-session').selectOption(runtime); await waitSelection();
    const saved=await report();
    check(saved.lastGoodSave?.revision>0 && saved.diagnostics.events.some(e=>e.name==='save.committed'), 'Local runtime export includes actual acknowledged save revision and correlated commit');
    const preview=await page.locator('#bug-report-preview').inputValue();
    const event=page.waitForEvent('download'); await page.locator('#bug-report-download').click(); const download=await event;
    const stream=await download.createReadStream(), chunks=[]; for await(const chunk of stream) chunks.push(chunk);
    check(Buffer.concat(chunks).toString()===preview, 'Downloaded report exactly matches reviewed snapshot');
    await download.saveAs('output/playwright/lc00-p004-runtime-report.json');
    // Browser cancellation is observable by the harness; UI only claims a download request.
    const cancelEvent=page.waitForEvent('download'); await page.locator('#bug-report-download').click(); const cancel=await cancelEvent; await cancel.cancel();
    check((await page.locator('#bug-report-status').textContent()).includes('requested'), 'Cancelled download leaves truthful requested status, with no sent/saved claim');
    await page.keyboard.press('Escape');
    check(await page.locator('#field-menu').isVisible(), 'Keyboard Escape also closes only report');
    await page.locator('#solo-leave').click(); await page.locator('#auth-overlay').waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('#deploy-button').disabled && document.querySelector('#viewport-3d canvas'));

    // A real WebGL context-loss API fault; not an unexplained spontaneous GPU crash.
    await page.evaluate(()=>document.querySelector('#viewport-3d canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.locator('#runtime-recovery').waitFor({state:'visible'});
    await page.locator('#runtime-recovery [data-bug-report]').click();
    const failed=await report(), previous=failed.selectedSession.id;
    check(failed.events.some(e=>e.kind==='graphics-lost'), 'Graphics recovery screen exports the actual context-loss event');
    await page.locator('#bug-report-close').click(); await page.locator('#runtime-reload').click();
    await page.waitForFunction(()=>!document.querySelector('#deploy-button').disabled);
    await page.locator('#auth-overlay [data-bug-report]').click(); await waitHistory();
    await page.locator('#bug-report-session').selectOption('browser:'+previous); await waitSelection();
    const earlier=await report();
    check(earlier.diagnostics.events.some(e=>e.name==='client.failure' && e.payload.code==='graphics-lost') && earlier.session===null && earlier.completeness.possibleMissingTail, 'Next page retrieves previous failed browser session without substituting current state and discloses uncertain tail');
    const earlierEvent=page.waitForEvent('download'); await page.locator('#bug-report-download').click(); await (await earlierEvent).saveAs('output/playwright/lc00-p004-previous-report.json');
    await page.screenshot({path:'output/playwright/lc00-p004-previous-report.png'});
    await page.locator('#bug-report-close').click();

    const startup=await page.context().newPage();
    await startup.addInitScript(()=> { const original=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='webgl'||kind==='webgl2')throw Error('Injected startup PIN=PRIVATE-P004-SENTINEL');return original.call(this,kind,...args)}; });
    await startup.goto(page.url()); await startup.locator('#runtime-recovery').waitFor({state:'visible'});
    await startup.locator('#runtime-recovery [data-bug-report]').click();
    const startupReport=JSON.parse(await startup.locator('#bug-report-preview').inputValue());
    check(startupReport.events.some(e=>e.kind==='startup-failed') && !JSON.stringify(startupReport).includes('PRIVATE-P004-SENTINEL'), 'Injected engine startup failure exposes safe export before deployment');
    const startupEvent=startup.waitForEvent('download'); await startup.locator('#bug-report-download').click(); await (await startupEvent).saveAs('output/playwright/lc00-p004-startup-report.json');
    await startup.close(); await page.bringToFront();
    return {result:'passed',startedAt,finishedAt:new Date().toISOString(),clientBuild:initial.build,checks,runtimeId:runtime.slice(8),runtimeSave:saved.lastGoodSave,previousReport:earlier,
      method:'Ordinary controls and real isolated BAT-launched server; WebGL context-loss API, engine startup/clipboard/HTTP fault injection, simulated Gamepad API. No physical-controller or human acceptance claim.'};
  } catch(error) { await page.screenshot({path:'output/playwright/lc00-p004-failure.png'}); throw Error(JSON.stringify({error:String(error),checks,states:states.slice(-2),inputs:inputs.slice(-2)})); }
}

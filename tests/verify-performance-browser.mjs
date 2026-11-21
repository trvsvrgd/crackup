// Playwright CLI; ordinary gameplay plus explicitly induced main-thread stalls.
async page => {
  const checks=[],startedAt=new Date().toISOString();const check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s)};
  await page.addInitScript(()=>localStorage.setItem('crackup.cinematicIntros','false'));
  await page.reload();await page.bringToFront();await page.waitForFunction(()=>!document.querySelector('#deploy-button').disabled);
  await page.locator('#callsign-input').fill('P005BROWSER');await page.locator('#pin-input').fill('685421');await page.locator('#deploy-button').click();await page.locator('#auth-overlay').waitFor({state:'hidden'});
  await page.keyboard.press('Escape');if(!(await page.locator('#field-menu').isVisible()))await page.keyboard.press('b');
  await page.locator('#field-menu').waitFor({state:'visible'});await page.locator('#solo-save').click();
  await page.locator('#field-menu [data-bug-report]').click();
  await page.evaluate(()=>{const started=performance.now();while(performance.now()-started<500){}});
  await page.waitForTimeout(400);
  await page.locator('#bug-report-notes').fill('Controlled 500 ms paused main-thread stall.');
  let report=JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(report.diagnostics.events.some(e=>e.name==='performance.stall'&&e.payload.metric==='frame.interval'&&e.payload.durationMs>=480&&e.payload.state==='paused'),'Actual 500 ms frame stall is preserved and classified as paused');
  await page.evaluate(()=>{const started=performance.now();while(performance.now()-started<1100){}});await page.waitForTimeout(150);
  await page.locator('#bug-report-notes').fill('Controlled 1100 ms paused main-thread stall.');report=JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(report.rendering.intervals.some(s=>s.ms>=1050&&s.state==='paused')&&report.diagnostics.events.some(e=>e.name==='performance.stall'&&e.payload.durationMs>=1050),'Greater-than-one-second frame remains in raw interval export and durable event timeline');
  check(report.diagnostics.events.some(e=>e.name==='performance.stall'&&e.payload.metric==='eventloop.delay'),'Late event-loop callback is recorded separately from frame interval');
  await page.locator('#bug-report-close').click();await page.locator('#resume-button').click();
  await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');
  await page.evaluate(()=>{const started=performance.now();while(performance.now()-started<500){}});await page.waitForTimeout(250);
  await page.keyboard.press('b');await page.locator('#field-menu').waitFor({state:'visible'});await page.locator('#field-menu [data-bug-report]').click();
  const other=await page.context().newPage();await other.goto('about:blank');await other.bringToFront();await other.waitForTimeout(2400);await page.bringToFront();await other.close();await page.waitForTimeout(300);
  await page.locator('#bug-report-notes').fill('Real background transition after controlled active and paused stalls.');
  report=JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(report.diagnostics.events.some(e=>e.name==='performance.stall'&&e.payload.metric==='frame.interval'&&e.payload.state==='active'),'Ordinary resumed gameplay stall has active classification');
  check(report.diagnostics.events.some(e=>e.name==='performance.lifecycle'&&e.payload.state==='background')||report.rendering.intervals.some(s=>s.state==='transition'),'Background/focus transition is not silently classified as an active gameplay stall');
  check(report.diagnostics.events.some(e=>e.name==='performance.resources'&&e.payload.geometries>0&&e.payload.bodies>0),'Actual graphics/physics/queue counts reach export');
  check(report.diagnostics.events.some(e=>e.payload.metric==='asset.load'),'Asset loading duration reaches startup timeline');
  const download=page.waitForEvent('download');await page.locator('#bug-report-download').click();await(await download).saveAs('output/playwright/lc00-p005-stalls.json');
  await page.screenshot({path:'output/playwright/lc00-p005-stalls.png'});
  await page.locator('#bug-report-close').click();await page.locator('#solo-leave').click();await page.locator('#auth-overlay').waitFor({state:'visible'});
  return {result:'passed',startedAt,finishedAt:new Date().toISOString(),checks,report,method:'Normal deploy/save/move/report/leave; busy-loop durations are injected faults, real secondary-tab focus transition, no debug game-state mutations.'};
}

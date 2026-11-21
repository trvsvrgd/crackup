// Same route/window/observer for capture-on and capture-off. Not target-hardware qualification.
async page => {
  await page.setViewportSize({width:1920,height:1080});
  await page.addInitScript(()=>localStorage.setItem('crackup.cinematicIntros','false'));
  await page.reload();await page.bringToFront();await page.waitForFunction(()=>!document.querySelector('#deploy-button').disabled);
  await page.locator('#callsign-input').fill('P005COMPARE');await page.locator('#pin-input').fill('685421');await page.locator('#deploy-button').click();await page.locator('#auth-overlay').waitFor({state:'hidden'});
  await page.keyboard.press('Escape');if(!(await page.locator('#field-menu').isVisible()))await page.keyboard.press('b');
  await page.locator('#field-menu').waitFor({state:'visible'});await page.locator('#resume-button').click();
  await page.waitForTimeout(3000);
  const start=Date.now();
  const samples=await page.evaluate(()=>new Promise(resolve=>{const samples=[],start=performance.now();let previous=null;const frame=now=>{if(previous!==null)samples.push(now-previous);previous=now;if(now-start<12000)requestAnimationFrame(frame);else resolve(samples)};requestAnimationFrame(frame)}));
  const end=Date.now();await page.keyboard.press('b');await page.locator('#field-menu').waitFor({state:'visible'});
  await page.locator('#field-menu [data-bug-report]').click();const report=JSON.parse(await page.locator('#bug-report-preview').inputValue());
  const health=await page.evaluate(()=>fetch('/api/health').then(r=>r.json()));
  await page.locator('#bug-report-close').click();await page.locator('#solo-leave').click();await page.locator('#auth-overlay').waitFor({state:'visible'});
  return {result:'measured',intervalVersion:2,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio})),start,end,samples,clientBuild:report.build,captureEnabled:report.rendering.captureEnabled,serverCaptureEnabled:health.diagnostics.captureEnabled,
    serverBuild:health.diagnostics.serverBuild,rendering:report.rendering,events:report.diagnostics.events,method:'3 s warmup, 12 s standing opening-scene gameplay; identical external RAF observer and normal input. No frame outliers discarded.'};
}

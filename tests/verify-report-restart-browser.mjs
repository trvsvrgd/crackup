// Run after forcibly stopping/restarting the verified isolated BAT runtime with the same data root.
async (page) => {
  const checks=[], startedAt=new Date().toISOString();
  const check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message)};
  const preview=async()=>JSON.parse(await page.locator('#bug-report-preview').inputValue());
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#bug-report-history').textContent.startsWith('Loading'));
  await page.unroute('**/api/diagnostics/session/**');
  try {
  await page.reload(); await page.waitForFunction(()=>!document.querySelector('#deploy-button').disabled);
  await page.locator('#auth-overlay [data-bug-report]').click(); await ready();
  const previous=await page.locator('#bug-report-session option').evaluateAll(options=>options.find(o=>o.textContent.startsWith('Earlier local game'))?.value);
  check(Boolean(previous),'Real previous runtime appears on next launch before authentication');
  await page.locator('#bug-report-session').selectOption(previous);
  await page.waitForFunction(()=>!document.querySelector('#bug-report-download').disabled);
  const report=await preview();
  check(report.selectedSession.runtime.clean===false && report.completeness.warnings.includes('runtime-not-confirmed-clean'),'Forced runtime exit remains explicitly unclean');
  check(report.lastGoodSave?.revision>0 && report.diagnostics.events.some(e=>e.name==='save.committed'&&e.component==='server'),'Previous process commit and revision survive restart into actual selectable report');
  check(report.session===null && report.selectedSession.id===previous.slice(8),'Earlier runtime is not mislabelled as current page state');
  const event=page.waitForEvent('download'); await page.locator('#bug-report-download').click(); await (await event).saveAs('output/playwright/lc00-p004-previous-runtime.json');
  await page.screenshot({path:'output/playwright/lc00-p004-previous-runtime.png'});

  // Defer one detail response, close and reopen, then release it to test stale completion ownership.
  let release; const gate=new Promise(resolve=>release=resolve); let requested; const received=new Promise(resolve=>requested=resolve);
  await page.route('**/api/diagnostics/session/**',async route=>{requested();await gate;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({session:report.selectedSession.runtime,events:report.diagnostics.events,invalidLines:0,truncatedEvents:0,omittedFiles:0})})}catch{}});
  const current=await page.locator('#bug-report-session option').first().getAttribute('value');
  await page.locator('#bug-report-session').selectOption(current);
  await page.locator('#bug-report-session').selectOption(previous); await received;
  check(await page.locator('#bug-report-download').isDisabled(),'Loading another session cannot export a mismatched preview');
  await page.locator('#bug-report-close').click(); await page.locator('#auth-overlay [data-bug-report]').click();
  release(); await ready(); await page.waitForTimeout(150);
  const after=await preview();
  check(after.selectedSession.currentBrowserPage && after.selectedSession.id!==report.selectedSession.id && !(await page.locator('#bug-report-download').isDisabled()),'Cancelled late session response cannot overwrite reopened current-page report');
  await page.unroute('**/api/diagnostics/session/**');
  await page.route('**/api/diagnostics/session/**',route=>route.fulfill({status:503,body:'inaccessible fixture'}));
  await page.locator('#bug-report-session').selectOption(previous); await page.waitForFunction(()=>!document.querySelector('#bug-report-download').disabled);
  const unavailable=await preview();
  check(unavailable.completeness.warnings.includes('selected-runtime-unavailable') && unavailable.selectedSession.runtime===null &&
    unavailable.diagnostics.events.every(e=>e.component==='client'&&e.context.serverRunId===previous.slice(8)) &&
    (!unavailable.lastGoodSave || unavailable.lastGoodSave.source==='client'), 'A selected runtime becoming inaccessible is explicit; only independently retained correlated browser evidence remains');
  await page.unroute('**/api/diagnostics/session/**'); await page.locator('#bug-report-close').click();
  return {result:'passed',startedAt,finishedAt:new Date().toISOString(),clientBuild:report.build,checks,report,
    method:'Real isolated runtime kill/restart and normal pre-login selection/download; delayed and inaccessible detail requests are labeled route fixtures.'};
  } finally { await page.unroute('**/api/diagnostics/session/**'); }
}

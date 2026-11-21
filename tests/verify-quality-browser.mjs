// Run against an isolated solo server using playwright-cli run-code --filename tests/verify-quality-browser.mjs.
async (page) => {
  const checks = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const states = [];
  page.on('websocket', socket => socket.on('framereceived', frame => {
    if (typeof frame.payload !== 'string') return;
    try { const msg = JSON.parse(frame.payload); if (msg.type === 'SOLO_STATE') states.push(msg); } catch {}
  }));
  await page.locator('#deploy-button').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
  await page.locator('#callsign-input').fill('QUALITYQA');
  await page.locator('#pin-input').fill('4826');
  await page.locator('#auth-overlay [data-bug-report]').click();
  await page.locator('#bug-report-notes').fill('Press b while describing a bug. Expected: typing stays in this report.');
  await page.locator('#bug-report-notes').press('b');
  check(await page.locator('#bug-report').evaluate(el => el.open), 'Report opens before deployment and typing B keeps it open');
  const startupReport = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(/^client-[a-f0-9]{16}$/.test(startupReport.build), 'Report contains reproducible client-build identity');
  check(!JSON.stringify(startupReport).includes('QUALITYQA') && !JSON.stringify(startupReport).includes('4826'), 'Auth fields are absent from automatic report');
  await page.locator('#bug-report-close').click();
  check(await page.locator('#auth-overlay [data-bug-report]').evaluate(el => el === document.activeElement), 'Closing report restores keyboard focus');
  await page.locator('#deploy-button').click();
  await page.locator('#auth-overlay').waitFor({ state: 'hidden' });
  await page.locator('#viewport-3d canvas').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Opening playback may consume the first escape; open menu deterministically using its hotkey.
  if (!(await page.locator('#field-menu').isVisible())) await page.keyboard.press('b');
  await page.locator('#field-menu').waitFor({ state: 'visible' });
  await page.locator('[data-panel=briefing]').click();
  await page.locator('#field-menu [data-bug-report]').click();
  await page.locator('#bug-report-notes').fill('Live menu report: expected no upgrade shortcut while typing.');
  await page.locator('#bug-report-notes').press('b');
  check(await page.locator('[data-panel=briefing]').getAttribute('aria-pressed') === 'true', 'Typing B in a live report does not switch field-menu tabs');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#bug-report-preview').value).session.connected === true);
  check(states.some(state => state.paused), 'Server acknowledges authoritative solo pause');
  const downloadPromise = page.waitForEvent('download');
  const preview = await page.locator('#bug-report-preview').inputValue();
  check(JSON.parse(preview).rendering.triangles > 100, 'Diagnostics count the complete rendered frame, including the world');
  await page.locator('#bug-report-download').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  check(Buffer.concat(chunks).toString() === preview, 'Downloaded JSON exactly matches the reviewed snapshot');
  await download.saveAs('output/playwright/quality-report.json');
  await page.screenshot({ path: 'output/playwright/quality-report.png' });
  await page.keyboard.press('Escape');
  await page.locator('#bug-report').waitFor({ state: 'hidden' });
  check(await page.locator('#field-menu').isVisible(), 'Escape closes only the report and leaves the paused field menu intact');
  await page.locator('#resume-button').click();
  await page.waitForFunction(() => document.querySelector('#field-menu').hidden);
  await page.waitForTimeout(300);
  check(states.at(-1)?.paused === false, 'Returning to city resumes authoritative solo play');
  await page.evaluate(() => {
    const canvas = document.querySelector('#viewport-3d canvas');
    const gl = canvas.getContext('webgl2');
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await page.locator('#runtime-recovery').waitFor({ state: 'visible' });
  await page.locator('#runtime-recovery [data-bug-report]').click();
  const loss = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(loss.events.some(event => event.kind === 'graphics-lost'), 'Actual WebGL context loss exposes recovery and is reportable');
  check(await page.locator('#deploy-button').isDisabled(), 'Deployment stays disabled after fatal graphics failure');
  await page.locator('#bug-report-close').click();
  await page.screenshot({ path: 'output/playwright/quality-recovery.png' });
  await page.locator('#runtime-reload').click();
  await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
  check(!(await page.locator('#runtime-recovery').isVisible()), 'Reload restores the deploy screen after context loss');
  await page.evaluate(() => {
    setTimeout(() => { throw new TypeError('private-runtime-sentinel'); }, 0);
    void Promise.reject({ pin: 'private-rejection-sentinel' });
    const gl = document.querySelector('#viewport-3d canvas').getContext('webgl2');
    gl.drawElements = () => { throw new Error('private-render-sentinel'); };
  });
  await page.locator('#runtime-recovery').waitFor({ state: 'visible' });
  await page.locator('#runtime-recovery [data-bug-report]').click();
  const runtime = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(runtime.events.some(event => event.kind === 'unhandled-rejection'), 'Unhandled promise rejection is recorded without serializing its payload');
  check(runtime.events.some(event => event.kind === 'runtime-error'), 'Render-loop exception leaves report and reload controls usable');
  check(!JSON.stringify(runtime).includes('private-'), 'Automatic runtime capture excludes injected secret messages');
  await page.screenshot({ path: 'output/playwright/quality-runtime-failure.png' });
  await page.locator('#bug-report-close').click();
  await page.locator('#runtime-reload').click();
  await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
  const failurePage = await page.context().newPage();
  await failurePage.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      if (kind === 'webgl2' || kind === 'webgl') throw new Error('Injected startup failure: PIN=private-sentinel');
      return getContext.call(this, kind, ...args);
    };
  });
  await failurePage.goto(page.url());
  await failurePage.locator('#runtime-recovery').waitFor({ state: 'visible' });
  await failurePage.locator('#runtime-recovery [data-bug-report]').click();
  const failure = JSON.parse(await failurePage.locator('#bug-report-preview').inputValue());
  check(failure.events.some(event => event.kind === 'startup-failed'), 'Startup engine failure remains reportable');
  check(!JSON.stringify(failure).includes('private-sentinel'), 'Startup error messages cannot leak credentials into reports');
  check(await failurePage.locator('#deploy-button').isDisabled(), 'Startup failure cannot enable deployment');
  await failurePage.screenshot({ path: 'output/playwright/quality-startup-failure.png' });
  await failurePage.close();
  return { status: 'passed', build: startupReport.build, checks };
}

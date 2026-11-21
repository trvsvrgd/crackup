// P001 controlled recovery diagnostics, not evidence of a spontaneous renderer crash.
async (page) => {
  const observations = [], states = [];
  const listener = socket => socket.on('framereceived', frame => {
    if (typeof frame.payload !== 'string') return;
    try { const m = JSON.parse(frame.payload); if (m.type === 'SOLO_STATE') states.push({ revision: m.revision, paused: m.paused, saveError: m.saveError, checkpoint: m.checkpoint }); } catch {}
  });
  page.on('websocket', listener);
  const deploy = async () => {
    await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
    await page.locator('#callsign-input').fill('LC00AUDIT'); await page.locator('#pin-input').fill('647281');
    await page.locator('#deploy-button').click(); await page.locator('#auth-overlay').waitFor({ state: 'hidden' });
  };
  const menu = async () => {
    await page.waitForTimeout(250);
    if (await page.locator('#downed-overlay').isVisible()) {
      observations.push({ id: 'saved-downed-agent', action: 'Use normal Recover at drop point control before opening field menu.' });
      await page.locator('#respawn-button').click();
      await page.locator('#downed-overlay').waitFor({ state: 'hidden' });
    }
    if (await page.locator('#field-menu').isVisible()) return;
    await page.keyboard.press('Escape');
    if (!(await page.locator('#field-menu').isVisible())) await page.keyboard.press('Escape');
    if (!(await page.locator('#field-menu').isVisible())) await page.keyboard.press('b');
    await page.locator('#field-menu').waitFor({ state: 'visible' });
  };
  await page.screenshot({ path: 'output/playwright/lc00-p001-recovery-entry.png' });
  await page.reload(); await deploy(); await menu();
  observations.push({ id: 'B10-explicit-reload-after-restart', recovered: await page.locator('#auth-overlay').isHidden(), state: states.at(-1), health: await page.evaluate(() => fetch('/api/health').then(r => r.json())) });
  await page.locator('#resume-button').click();
  await page.evaluate(() => {
    window.__lc00Frames = []; window.__lc00Capture = true;
    let last;
    function sample(t) { if (!window.__lc00Capture) return; if (last !== undefined) window.__lc00Frames.push(t-last); last=t; requestAnimationFrame(sample); }
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const until = performance.now() + 1250; while (performance.now() < until) { /* Deliberately injected main-thread stall. */ } });
  await page.waitForTimeout(250);
  const stall = await page.evaluate(() => { window.__lc00Capture = false; return Math.max(...window.__lc00Frames); });
  await menu(); await page.locator('#field-menu [data-bug-report]').click();
  const stallReport = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  observations.push({ id: 'B11-injected-1250ms-stall', induced: true, observedMaxFrameMs: stall, report: stallReport,
    limitation: 'Current report discards frame intervals above 1000ms; no frame maximum or stall event is exported.' });
  await page.locator('#bug-report-close').click();
  await page.evaluate(() => document.querySelector('#viewport-3d canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.locator('#runtime-recovery').waitFor({ state: 'visible' });
  await page.locator('#runtime-recovery [data-bug-report]').click();
  const contextReport = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  const pending = page.waitForEvent('download'); await page.locator('#bug-report-download').click();
  await (await pending).saveAs('output/playwright/lc00-p001-graphics-loss-report.json');
  await page.screenshot({ path: 'output/playwright/lc00-p001-graphics-loss.png' });
  observations.push({ id: 'B12-induced-graphics-context-loss', induced: true, recoveryVisible: true, report: contextReport });
  await page.locator('#bug-report-close').click(); await page.locator('#runtime-reload').click();
  await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
  await page.locator('#auth-overlay [data-bug-report]').click();
  const afterReload = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  observations.push({ id: 'B13-reload-loses-previous-crash-events', afterReload, previousEventCount: contextReport.events.length });
  await page.locator('#bug-report-close').click(); await deploy(); await menu();
  observations.push({ id: 'B14-reentry-after-graphics-recovery', state: states.at(-1), activeAgents: await page.evaluate(() => fetch('/api/health').then(r => r.json()).then(h => h.activeAgents)) });
  page.off('websocket', listener);
  return { endedAt: new Date().toISOString(), observations };
}

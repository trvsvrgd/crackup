// P001 observation only. Run via playwright-cli run-code --filename against an isolated SOLO_DATA_DIR.
// Credentials here belong solely to the synthetic LC00AUDIT test profile, never a personal save.
async (page) => {
  const startedAt = new Date().toISOString();
  const states = [], auth = [], errors = [], scenarios = [];
  const socketListener = socket => socket.on('framereceived', frame => {
    if (typeof frame.payload !== 'string') return;
    try {
      const m = JSON.parse(frame.payload);
      if (m.type === 'SOLO_STATE') states.push({ at: Date.now(), revision: m.revision, paused: m.paused,
        saveError: m.saveError, savedAt: m.savedAt, checkpoint: m.checkpoint });
      if (m.type === 'AUTH_OK') auth.push({ at: Date.now(), mode: m.mode, entityId: m.entityId,
        collected: m.record?.collectedOrbs?.length ?? 0, hp: m.record?.hp });
      if (states.length > 150) states.shift();
    } catch { /* Binary or unrelated text is not an authentication/save sample. */ }
  });
  const errorListener = error => errors.push({ name: error.name, message: error.message.slice(0, 300) });
  page.on('websocket', socketListener); page.on('pageerror', errorListener);
  const observe = async (id, action) => {
    const t = Date.now();
    try { const details = await action(); scenarios.push({ id, outcome: 'observed', elapsedMs: Date.now() - t, ...details }); }
    catch (error) { scenarios.push({ id, outcome: 'failed', elapsedMs: Date.now() - t, error: String(error).slice(0, 600) }); }
  };
  const deploy = async (pin = '647281') => {
    await page.locator('#auth-overlay').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#callsign-input').fill('LC00AUDIT');
    await page.locator('#pin-input').fill(pin);
    await page.locator('#deploy-button').click();
    if (pin === '647281') await page.locator('#auth-overlay').waitFor({ state: 'hidden', timeout: 12000 });
  };
  const menu = async () => {
    if (await page.locator('#field-menu').isVisible()) return;
    await page.keyboard.press('Escape');
    if (!(await page.locator('#field-menu').isVisible())) await page.keyboard.press('Escape');
    if (!(await page.locator('#field-menu').isVisible())) await page.keyboard.press('b');
    await page.locator('#field-menu').waitFor({ state: 'visible', timeout: 5000 });
  };
  await page.bringToFront();
  await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
  await observe('B01-fresh-deploy', async () => { await deploy(); return { authenticated: auth.at(-1), save: states.at(-1) }; });
  if (await page.locator('#auth-overlay').isHidden()) {
    await observe('B02-input-and-frames', async () => {
      await menu(); await page.locator('#resume-button').click();
      await page.locator('#viewport-3d canvas').click();
      await page.evaluate(() => {
        window.__lc00Frames = []; window.__lc00Capture = true;
        let previous;
        function sample(now) { if (!window.__lc00Capture) return;
          if (previous !== undefined) window.__lc00Frames.push({ ms: Math.round((now - previous) * 100) / 100, hidden: document.hidden, focused: document.hasFocus() });
          previous = now; if (window.__lc00Frames.length < 4000) requestAnimationFrame(sample);
        } requestAnimationFrame(sample);
      });
      await page.keyboard.down('w'); await page.waitForTimeout(1600); await page.keyboard.press('Space');
      await page.waitForTimeout(600); await page.keyboard.up('w');
      await page.waitForTimeout(4000);
      const frames = await page.evaluate(() => { window.__lc00Capture = false; return window.__lc00Frames; });
      return { frames, focused: await page.evaluate(() => document.hasFocus()), recoveryVisible: await page.locator('#runtime-recovery').isVisible() };
    });
    await observe('B03-manual-save', async () => {
      await menu(); const before = states.at(-1)?.revision;
      await page.locator('#solo-save').click(); await page.waitForTimeout(700);
      return { before, after: states.at(-1), text: await page.locator('#solo-checkpoint').innerText() };
    });
    await observe('B04-save-leave', async () => {
      await page.locator('#solo-leave').click();
      await page.locator('#auth-overlay').waitFor({ state: 'visible', timeout: 10000 });
      return { deployDisabled: await page.locator('#deploy-button').isDisabled(), status: await page.locator('#auth-error').innerText(), saved: states.at(-1) };
    });
    await observe('B05-wrong-pin', async () => {
      await deploy('111111'); await page.waitForTimeout(800);
      return { status: await page.locator('#auth-error').innerText(), retryEnabled: !(await page.locator('#deploy-button').isDisabled()) };
    });
    await observe('B06-same-page-reentry', async () => {
      await deploy(); return { authenticated: auth.at(-1), saved: states.at(-1) };
    });
    await observe('B07-reload-reentry', async () => {
      await page.reload(); await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
      await deploy(); return { authenticated: auth.at(-1), saved: states.at(-1) };
    });
    await observe('B08-paused-report', async () => {
      await menu(); await page.locator('#field-menu [data-bug-report]').click();
      const report = JSON.parse(await page.locator('#bug-report-preview').inputValue());
      const pending = page.waitForEvent('download'); await page.locator('#bug-report-download').click();
      await (await pending).saveAs('output/playwright/lc00-p001-baseline-report.json');
      await page.screenshot({ path: 'output/playwright/lc00-p001-baseline.png' });
      await page.locator('#bug-report-close').click();
      return { report, fieldMenuStillVisible: await page.locator('#field-menu').isVisible() };
    });
  }
  page.off('websocket', socketListener); page.off('pageerror', errorListener);
  return { startedAt, endedAt: new Date().toISOString(), method: 'Headed Chromium via normal DOM controls/keyboard; read-only timing/socket observation. No teleport/progression fixture.',
    scenarios, states, auth, errors, status: await page.locator('#auth-error').innerText() };
}

// Playwright CLI, isolated local profile only. Storage/error injections are diagnostic fault fixtures.
async (page) => {
  const startedAt = new Date().toISOString(), checks = [], receipts = [];
  const check = (value, message) => { if (!value) throw Error(message); checks.push(message); };
  const key = 'crackup:diagnostics:v1';
  const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const inject = () => page.evaluate(() => {
    const error = new TypeError('pin=PRIVATE-JOURNAL-SENTINEL');
    error.stack = 'TypeError: PRIVATE-JOURNAL-SENTINEL\n at save (https://private-host/game.js:123:456)';
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));
  });
  await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
  await page.waitForTimeout(1400);
  const first = await stored(), firstRun = first.sessions.at(-1).runId;
  check(first.events.some(e => e.name === 'client.start'), 'Pre-authentication journal exists in real localStorage');
  await inject(); await page.waitForTimeout(1400);
  for (let i = 0; i < 3; i++) {
    await page.reload(); await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
    await page.waitForTimeout(1300);
  }
  const reloaded = await stored();
  check(reloaded.events.some(e => e.context.runId === firstRun && e.name === 'client.failure' && e.payload.frame0 === 'game.js:123:456'), 'Previous error and sanitized bundle offset survive three real reloads');
  check(!JSON.stringify(reloaded).includes('PRIVATE-JOURNAL-SENTINEL') && !JSON.stringify(reloaded).includes('private-host'), 'Persistent automatic capture excludes credential and host sentinels');
  await page.context().setOffline(true);
  await inject(); await page.waitForTimeout(1300);
  const offline = await stored();
  check(offline.events.filter(e => e.name === 'client.failure').length > reloaded.events.filter(e => e.name === 'client.failure').length, 'Journal writes while Chromium networking is offline');
  await page.context().setOffline(false);

  await page.evaluate(key => {
    window.__journalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, value) { if (k === key) throw new DOMException('test quota', 'QuotaExceededError'); return window.__journalSetItem.call(this, k, value); };
  }, key);
  await inject(); await page.waitForTimeout(1300);
  await page.locator('#auth-overlay [data-bug-report]').click();
  const quota = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(quota.journal.storageState === 'unavailable-or-quota' && quota.journal.events.length > 0, 'Actual browser storage exception retains an exportable in-memory fallback');
  await page.locator('#bug-report-close').click();
  await page.evaluate(() => { Storage.prototype.setItem = window.__journalSetItem; });
  await inject(); await page.waitForTimeout(1400);

  const listener = socket => socket.on('framereceived', frame => {
    if (typeof frame.payload !== 'string') return;
    try { const m = JSON.parse(frame.payload); if (m.type === 'DIAGNOSTICS_ACK') receipts.push({ id: m.id, durable: m.durable }); } catch {}
  });
  page.on('websocket', listener);
  await page.locator('#callsign-input').fill('P003JOURNAL'); await page.locator('#pin-input').fill('685421');
  await page.locator('#deploy-button').click();
  await page.locator('#auth-overlay').waitFor({ state: 'hidden', timeout: 15000 });
  for (let i = 0; i < 3 && !(await page.locator('#field-menu').isVisible()); i++) await page.keyboard.press(i === 2 ? 'b' : 'Escape');
  await page.locator('#field-menu').waitFor({ state: 'visible' });
  for (let i = 0; i < 20 && !receipts.some(r => r.durable); i++) await page.waitForTimeout(500);
  check(receipts.some(r => r.durable), 'Authenticated local runtime acknowledges flushed browser journal');
  await page.locator('#field-menu [data-bug-report]').click();
  const report = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  check(report.journal.storageState === 'available', 'Browser journal resumes persistent writes after quota fixture is removed');
  const download = page.waitForEvent('download'); await page.locator('#bug-report-download').click();
  await (await download).saveAs('output/playwright/lc00-p003-report.json');
  await page.screenshot({ path: 'output/playwright/lc00-p003-report.png' });
  page.off('websocket', listener);
  return { result: 'passed', startedAt, finishedAt: new Date().toISOString(), checks, receipts, clientBuild: report.build,
    method: 'Real Chromium reloads and localStorage; ordinary deploy/report controls. Labeled synthetic error and quota faults; Chromium offline mode during journal write.', report };
}

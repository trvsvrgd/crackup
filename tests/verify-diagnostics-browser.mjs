// Use playwright-cli run-code --filename with a fresh isolated solo server/profile.
async (page) => {
  const startedAt = new Date().toISOString(), received = [], errors = [];
  const listener = socket => socket.on('framereceived', frame => {
    if (typeof frame.payload !== 'string') return;
    try {
      const message = JSON.parse(frame.payload);
      if (['AUTH_OK', 'SOLO_STATE'].includes(message.type)) received.push({ type: message.type,
        revision: message.revision, diagnostics: message.diagnostics });
    } catch { /* No arbitrary payloads in evidence. */ }
  });
  page.on('websocket', listener);
  const errorListener = error => errors.push(error.name);
  page.on('pageerror', errorListener);
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const menu = async () => {
    for (let i = 0; i < 3 && !(await page.locator('#field-menu').isVisible()); i++) await page.keyboard.press(i === 2 ? 'b' : 'Escape');
    await page.locator('#field-menu').waitFor({ state: 'visible' });
  };
  await page.bringToFront();
  await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
  await page.locator('#callsign-input').fill('LC00DIAGNOSTIC');
  await page.locator('#pin-input').fill('647281');
  await page.locator('#deploy-button').click();
  await page.locator('#auth-overlay').waitFor({ state: 'hidden', timeout: 15000 });
  await menu();
  await page.locator('#solo-save').click();
  await page.waitForTimeout(600);
  await page.locator('#field-menu [data-bug-report]').click();
  const report = JSON.parse(await page.locator('#bug-report-preview').inputValue());
  const events = report.diagnostics.events;
  const saved = events.findLast(e => e.name === 'save.committed');
  check(saved?.context.saveAttemptId, 'Missing correlated save acknowledgement');
  check(events.some(e => e.name === 'connection.authenticated'), 'Missing client auth event');
  check(events.filter(e => ['save.requested', 'lifecycle.pause', 'connection.closed'].includes(e.name)).every(e => !e.context.saveAttemptId), 'Previous transaction ID leaked into a new request or lifecycle event');
  check(received.some(m => m.diagnostics.saveAttemptId === saved.context.saveAttemptId && m.revision === saved.payload.revision), 'Report does not match actual save acknowledgement');
  check(!JSON.stringify(report).includes('LC00DIAGNOSTIC') && !JSON.stringify(report).includes('647281'), 'Private profile leaked into report');
  const download = page.waitForEvent('download'); await page.locator('#bug-report-download').click();
  await (await download).saveAs('output/playwright/lc00-p002-report.json');
  await page.screenshot({ path: 'output/playwright/lc00-p002-report.png' });
  await page.locator('#bug-report-close').click();
  await page.locator('#solo-leave').click();
  let returnedToProfileSelection = false, recoveryReport;
  try {
    await page.locator('#auth-overlay').waitFor({ state: 'visible', timeout: 15000 });
    returnedToProfileSelection = true;
  } catch {
    // Preserve a real gameplay failure separately from whether diagnostics captured it.
    await page.locator('#field-menu [data-bug-report]').click();
    recoveryReport = JSON.parse(await page.locator('#bug-report-preview').inputValue());
    check(recoveryReport.diagnostics.events.some(e => e.name === 'connection.closed'), 'Neither successful exit nor captured disconnect');
  }
  page.off('websocket', listener); page.off('pageerror', errorListener);
  check(errors.length === 0, 'Unexpected browser page error');
  return { startedAt, finishedAt: new Date().toISOString(), result: 'diagnostic_capture_passed',
    method: 'Headed Chromium normal deploy/menu/save/report/download/save-and-leave controls; read-only socket observation.',
    report, recoveryReport, received, errors, returnedToProfileSelection,
    gameplayJourney: returnedToProfileSelection ? 'passed' : 'failed: disconnect prevented Save and leave; see correlated close category' };
}

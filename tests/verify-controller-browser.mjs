// Run with playwright-cli run-code --filename tests/verify-controller-browser.mjs
// against an isolated solo server. Only the browser's hardware API is simulated;
// the production client, WebSocket, authoritative simulation and menus are real.
async (page) => {
  const checks = [], errors = [], inputs = [], controls = [], positions = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket => {
    socket.on('framesent', ({ payload }) => {
      if (typeof payload === 'string') { try { controls.push(JSON.parse(payload)); } catch {} return; }
      if (payload.length === 29 && payload[0] === 1) inputs.push({ x: payload.readFloatLE(5), z: payload.readFloatLE(9),
        yaw: payload.readFloatLE(13), pitch: payload.readFloatLE(17), buttons: payload.readUInt16LE(21) });
    });
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string' || payload[0] !== 2) return;
      const local = payload.readUInt16LE(2);
      for (let i = 0; i < payload[1]; i++) {
        const base = 16 + i * 40;
        if (payload.readUInt16LE(base) === local) positions.push({ x: payload.readFloatLE(base + 4), y: payload.readFloatLE(base + 8), z: payload.readFloatLE(base + 12) });
      }
    });
  });
  await page.addInitScript(() => {
    window.controllerQA = { connected: true, buttons: [], axes: [0, 0, 0, 0] };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => {
      const q = window.controllerQA;
      return [null, null, q.connected ? { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 2, connected: true,
        mapping: 'standard', timestamp: performance.now(), axes: q.axes,
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: q.buttons.includes(i), value: q.buttons.includes(i) ? 1 : 0 })) } : null];
    } });
    localStorage.setItem('crackup.cinematicIntros', 'false');
    localStorage.setItem('crackup.controllerSensitivity', '1');
    localStorage.setItem('crackup.controllerInvertY', 'false');
  });
  const hold = async (buttons = [], axes = [0, 0, 0, 0], ms = 180) => {
    await page.evaluate(({ buttons, axes }) => Object.assign(window.controllerQA, { buttons, axes }), { buttons, axes });
    await page.waitForTimeout(ms);
  };
  const tap = async index => { await hold([index]); await hold(); };
  const sample = async (buttons, axes, ms = 250) => { inputs.length = 0; await hold(buttons, axes, ms); const result = inputs.slice(); await hold(); return result; };
  try {
    await page.reload(); await page.bringToFront();
    await page.waitForFunction(() => !document.querySelector('#deploy-button').disabled, { timeout: 60000 });
    await page.locator('#callsign-input').fill(`XBOX${Date.now().toString(36).toUpperCase()}`); await page.locator('#pin-input').fill('4826');
    await page.locator('#deploy-button').click();
    await page.locator('#auth-overlay').waitFor({ state: 'hidden' });
    await hold([], undefined, 500);
    // An already-seen cinematic is usually disabled above; skip one if campaign storage overrides it.
    await tap(9);
    if (await page.locator('#field-menu').isVisible()) await tap(9);
    await hold([], undefined, 400);
    check(await page.evaluate(() => document.pointerLockElement === null), 'Controller gameplay does not require mouse pointer lock');
    const start = positions.at(-1);
    const move = await sample([], [0, -0.65, 0, 0], 800);
    check(move.some(p => p.z > 0.4 && p.z < 0.8), 'Analog movement reaches production WebSocket inputs');
    const end = positions.at(-1);
    check(Math.hypot(end.x - start.x, end.z - start.z) > 0.5, 'Authoritative server moves player from controller input');
    const drift = await sample([], [0.1, -0.1, 0, 0]);
    check(drift.length > 0 && drift.every(p => p.x === 0 && p.z === 0), 'Deadzone stops idle drift');
    inputs.length = 0; await page.keyboard.down('w'); await page.waitForTimeout(200); await page.keyboard.up('w');
    check(inputs.some(p => p.z === 1), 'Keyboard movement still works with controller connected');
    await hold();
    const look = await sample([], [0, 0, 0.7, 0]);
    check(Math.abs(look.at(-1).yaw - look[0].yaw) > 0.1, 'Right stick changes actual camera yaw');
    const combat = await sample([6, 7]);
    check(combat.some(p => (p.buttons & 48) === 48), 'LT + RT send aim and fire through real input packets');
    const jump = await sample([0]); check(jump.some(p => p.buttons & 1), 'A sends jump');
    const grapple = await sample([4, 7]);
    check(grapple.some(p => p.buttons & 2048) && grapple.every(p => !(p.buttons & 32)), 'LB + RT sends grapple without firing');
    controls.length = 0; await hold([3], undefined, 400); await hold();
    check(controls.filter(p => p.type === 'TIER3_RELOAD').length === 1, 'Holding Y requests reload once');
    await tap(9); check(await page.locator('#field-menu').isVisible(), 'Menu opens field menu');
    const menuInputs = await sample([7], [0, -1, 1, 0]);
    check(menuInputs.every(p => p.x === 0 && p.z === 0 && !(p.buttons & 32)), 'Field menu suppresses gameplay');
    await page.locator('#controller-sensitivity').focus(); const old = await page.locator('#controller-sensitivity').inputValue();
    await tap(15); check(Number(await page.locator('#controller-sensitivity').inputValue()) > Number(old), 'D-pad adjusts controller settings');
    await page.locator('#controller-invert').focus(); await tap(0);
    check(await page.locator('#controller-invert').isChecked(), 'A toggles focused checkbox');
    await tap(1); check(!(await page.locator('#field-menu').isVisible()), 'B closes field menu');
    await tap(8); check(await page.locator('#tactical-map').isVisible(), 'View opens tactical map');
    const oldZoom = await page.locator('#map-zoom-level').textContent(); await tap(5);
    check(await page.locator('#map-zoom-level').textContent() !== oldZoom, 'RB zooms tactical map');
    await page.locator('#map-canvas').focus(); await tap(0);
    check(!(await page.locator('#map-clear').isDisabled()), 'A places a waypoint on focused map');
    await tap(1); check(!(await page.locator('#tactical-map').isVisible()), 'B closes map');
    await hold([7]); await page.evaluate(() => { window.controllerQA.connected = false; }); await page.waitForTimeout(250);
    check(await page.locator('#field-menu').isVisible(), 'Disconnect opens field menu');
    await page.evaluate(() => { window.controllerQA.connected = true; }); await hold(); await tap(1);
    await hold(); const reconnect = await sample([7]);
    check(reconnect.some(p => p.buttons & 32), 'Reconnected controller works after release');
    await tap(9); await hold([1, 7]); inputs.length = 0; await hold([7], undefined, 250);
    check(inputs.length > 0 && inputs.every(p => !(p.buttons & 32)), 'Closing menu with held RT cannot fire until released');
    await hold();
    await tap(9); await page.locator('summary').filter({ hasText: 'Xbox controller controls' }).click();
    const scroll = await page.locator('.field-card').evaluate(el => el.scrollTop);
    await hold([], [0, 0, 0, 1], 400); await hold();
    check(await page.locator('.field-card').evaluate(el => el.scrollTop) > scroll, 'Right stick scrolls the controls guide');
    await page.screenshot({ path: 'output/playwright/xbox-controller.png' });
    check(errors.length === 0, 'No browser runtime errors');
    return { status: 'passed', checks, errors, evidence: 'Simulated standard Xbox API; production client and authoritative solo server.' };
  } catch (error) {
    await page.screenshot({ path: 'output/playwright/xbox-controller-failure.png' });
    throw new Error(JSON.stringify({ error: String(error), checks, errors, recentInputs: inputs.slice(-3), controls: controls.slice(-3) }));
  }
}

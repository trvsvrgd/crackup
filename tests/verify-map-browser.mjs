// Run using playwright-cli run-code --filename tests/verify-map-browser.mjs against an isolated solo server.
// Co-op checks use a second isolated campaign server at port 33472.
async (page) => {
  const checks = [], errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  const states = [];
  page.on('websocket', socket => socket.on('framereceived', frame => {
    if (typeof frame.payload === 'string') try { const msg = JSON.parse(frame.payload); if (msg.type === 'SOLO_STATE') states.push(msg); } catch {}
  }));
  const deploy = async (tab, callsign) => {
    await tab.waitForFunction(() => !document.querySelector('#deploy-button').disabled);
    await tab.locator('#callsign-input').fill(callsign);
    await tab.locator('#pin-input').fill('4826');
    await tab.locator('#deploy-button').click();
    await tab.locator('#auth-overlay').waitFor({ state: 'hidden' });
  };
  try {
  await page.reload();
  await deploy(page, 'MAPQA');
  await page.keyboard.press('n');
  await page.locator('#tactical-map').waitFor({ state: 'visible' });
  await page.locator('[data-marker-id="district:0"]').waitFor();
  check(await page.locator('[data-marker-id^="district:"]').count() === 4, 'All four current district objectives are listed');
  check(await page.locator('[data-marker-id="player:MAPQA"]').count() === 1, 'Local player marker is identified');
  await page.waitForTimeout(250);
  check(states.at(-1)?.paused === true, 'Opening the map authoritatively pauses solo');
  await page.locator('[data-marker-id="district:1"]').click();
  await page.locator('#map-track').click();
  check((await page.locator('#map-active-waypoint').textContent()).includes('FOUNDRY'), 'Selected district can be tracked');
  await page.locator('#map-close').click();
  await page.waitForFunction(() => document.querySelector('#mission-title').textContent.includes('Foundry'));
  check(await page.locator('#waypoint-guidance').isVisible(), 'Tracked objective updates mission HUD and navigation after map closes');
  await page.waitForTimeout(250);
  check(states.at(-1)?.paused === false, 'Closing a standalone map resumes solo');
  await page.keyboard.press('n');
  await page.locator('#tactical-map').waitFor({ state: 'visible' });
  await page.locator('#map-filter-objective').uncheck();
  check(await page.locator('[data-marker-id^="district:"]').count() === 0, 'Objective filter removes objective rows');
  await page.locator('#map-filter-objective').check();
  await page.locator('#map-search').fill('Vermilion');
  check(await page.locator('.map-marker-row').count() === 2, 'Search finds requested landmark while retaining local player');
  await page.locator('#map-search').press('n');
  check(await page.locator('#tactical-map').evaluate(el => el.open), 'Typing N in search does not close map');
  await page.locator('#map-search').fill('');
  await page.locator('#map-city').click();
  const zoomBefore = await page.locator('#map-zoom-level').textContent();
  await page.locator('#map-zoom-in').click();
  check(await page.locator('#map-zoom-level').textContent() !== zoomBefore, 'Zoom buttons change map scale');
  await page.locator('#map-city').click();
  await page.locator('#map-clear').click();
  const canvas = page.locator('#map-canvas'), box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .65);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .4, box.y + box.height * .7, { steps: 5 }); await page.mouse.up();
  check(await page.locator('#map-clear').isDisabled(), 'Dragging pans without accidentally placing a waypoint');
  await page.locator('#map-city').click();
  await canvas.click({ position: { x: box.width * .35, y: box.height * .7 } });
  await page.locator('#map-waypoint-name').fill('North approach');
  await page.locator('#map-waypoint-name').press('Tab');
  check((await page.locator('#map-active-waypoint').textContent()).includes('North approach'), 'Empty map click sets a named personal waypoint');
  await page.locator('#map-world').click();
  await page.screenshot({ path: 'output/playwright/map-bridges.png' });
  await page.locator('#map-city').click();
  await page.screenshot({ path: 'output/playwright/map-city.png' });
  await page.locator('#map-close').click();
  check(await page.locator('#waypoint-marker').isVisible(), 'Custom waypoint has a world-space / edge-clamped HUD marker');
  await page.reload(); await deploy(page, 'MAPQA'); await page.keyboard.press('n');
  await page.locator('#tactical-map').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#map-active-waypoint').textContent.includes('North approach'));
  check(true, 'Personal waypoint survives reload and reauthentication');
  await canvas.focus(); await page.keyboard.press('Delete');
  check(await page.locator('#map-clear').isDisabled(), 'Delete clears waypoint using keyboard');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  check(!(await page.locator('#map-clear').isDisabled()), 'Keyboard panning and Enter place a center waypoint');
  await page.keyboard.press('Escape');
  await page.locator('#tactical-map').waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.locator('#field-menu').waitFor({ state: 'visible' });
  await page.locator('#field-menu [data-open-map]').click();
  await page.locator('#map-close').click();
  check(await page.locator('#field-menu').isVisible(), 'Map opened from field menu returns to that menu');
  await page.waitForTimeout(200); check(states.at(-1)?.paused === true, 'Returning to field menu keeps solo paused');
  await page.locator('#solo-leave').click();
  await page.locator('#auth-overlay').waitFor({ state: 'visible' });
  await deploy(page, 'MAPOTHER'); await page.keyboard.press('n');
  await page.locator('#tactical-map').waitFor({ state: 'visible' });
  check(await page.locator('#map-clear').isDisabled(), 'Different profile does not inherit another profile waypoint');
  await page.setViewportSize({ width: 900, height: 650 });
  await page.screenshot({ path: 'output/playwright/map-compact.png' });
  check(await canvas.evaluate(el => el.clientWidth > 200 && el.clientHeight > 200), 'Map remains usable at compact desktop resolution');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#map-close').click();
  await page.keyboard.press('Escape');
  await page.locator('#field-menu').waitFor({ state: 'visible' });
  await page.locator('#solo-leave').click();
  await page.locator('#auth-overlay').waitFor({ state: 'visible' });

  const host = await page.context().newPage(), guest = await page.context().newPage(), hostStates = [];
  for (const tab of [host, guest]) tab.on('pageerror', error => errors.push(error.message));
  host.on('websocket', socket => socket.on('framereceived', frame => {
    if (typeof frame.payload === 'string') try { const msg = JSON.parse(frame.payload); if (msg.type === 'CAMPAIGN_STATE') hostStates.push(msg); } catch {}
  }));
  try {
    await host.goto('http://127.0.0.1:33472');
    await host.locator('#campaign-options').waitFor({ state: 'visible' });
    await deploy(host, 'MAPHOST');
    await host.keyboard.press('n');
    await host.locator('#tactical-map').waitFor({ state: 'visible' });
    await host.waitForTimeout(250);
    const invite = hostStates.at(-1)?.inviteCode;
    check(Boolean(invite), 'Co-op host obtains an actual party invite');
    await guest.goto('http://127.0.0.1:33472');
    await guest.locator('#campaign-options').waitFor({ state: 'visible' });
    await guest.locator('#campaign-role').selectOption('guest');
    await guest.locator('#campaign-owner').fill('MAPHOST');
    await guest.locator('#campaign-code').fill(invite);
    await deploy(guest, 'MAPGUEST');
    await guest.keyboard.press('n'); await guest.locator('#tactical-map').waitFor({ state: 'visible' });
    await host.locator('[data-marker-id="player:MAPGUEST"]').waitFor();
    check(true, 'Co-op map displays authenticated squadmate by name');
    await host.locator('[data-marker-id="player:MAPGUEST"]').click();
    await host.locator('#map-track').click();
    const positionBefore = await host.locator('#map-selection-position').textContent();
    await guest.bringToFront();
    await guest.locator('#map-close').click();
    await guest.locator('#viewport-3d canvas').click();
    await guest.keyboard.down('d'); await guest.waitForTimeout(600); await guest.keyboard.up('d');
    await host.bringToFront();
    await host.waitForFunction(before => document.querySelector('#map-selection-position').textContent !== before, positionBefore);
    check(true, 'Squadmate marker and tracked destination move while host map stays open');
    check(hostStates.at(-1)?.paused === false, 'Opening map does not pause co-op');
    await host.screenshot({ path: 'output/playwright/map-coop.png' });
    await guest.close();
    await host.locator('[data-marker-id="player:MAPGUEST"]').waitFor({ state: 'hidden' });
    await host.waitForFunction(() => document.querySelector('#map-active-waypoint').textContent === 'No active waypoint');
    check(true, 'Departed squadmate and its active tracking are removed');
  } finally {
    if (!guest.isClosed()) await guest.close();
    await host.close();
  }
  check(errors.length === 0, `No uncaught browser errors (${errors.join(', ')})`);
  return { status: 'passed', checks };
  } catch (error) { throw new Error(JSON.stringify({ completed: checks, errors, failure: String(error) })); }
}

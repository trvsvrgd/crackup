import type { WorldBoxStructure } from '../../shared/world/neoVeridiaBlock.js';
import type { Vec3 } from '../../shared/protocol/binaryProtocol.js';
import type { PredictionAndInterpolationManager } from '../net/netcodeClient.js';
import { buildMapMarkers, CITY_VIEW, WORLD_VIEW, WaypointStore, constrainView, mapScale, mapToWorld, navigationTo,
  validMapPoint, worldToMap, zoomView, type MapMarker, type MapView, type MarkerKind } from './mapModel.js';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const colors: Record<MarkerKind, string> = { player: '#bdaaff', objective: '#ffcb79', event: '#ff8e9e', landmark: '#a8c0cc' };

export class TacticalMap {
  public onBlockingChanged: (() => void) | null = null;
  public onClosed: ((restorePointer: boolean) => void) | null = null;
  public onNotice: ((message: string) => void) | null = null;
  public readonly store: WaypointStore;
  private readonly dialog = el<HTMLDialogElement>('tactical-map');
  private readonly canvas = el<HTMLCanvasElement>('map-canvas');
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly background = document.createElement('canvas');
  private readonly backgroundCtx = this.background.getContext('2d')!;
  private readonly rows = new Map<string, HTMLButtonElement>();
  private view: MapView = { ...CITY_VIEW };
  private markers: MapMarker[] = [];
  private selected: string | null = null;
  private nextUpdate = 0;
  private dirty = true;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private opener: HTMLElement | null = null;
  private hadPointerLock = false;
  private drag: { id: number; x: number; y: number; view: MapView; moved: boolean } | null = null;
  private lastArrival = '';
  private readonly geometry: WorldBoxStructure[];

  constructor(private readonly net: PredictionAndInterpolationManager, structures: WorldBoxStructure[], browserStorage: Storage | null) {
    this.store = new WaypointStore(browserStorage);
    this.geometry = structures.filter(s => !s.isSensorOnly && s.material !== 'forcefield_energy' && !s.id.startsWith('arena_') && s.center.y < 500
      && (s.halfExtents.x > 1 || s.halfExtents.z > 1));
    document.querySelectorAll<HTMLButtonElement>('[data-open-map]').forEach(button => button.onclick = () => this.open());
    el('map-close').onclick = () => this.close();
    this.dialog.addEventListener('close', () => {
      this.drag = null; this.onBlockingChanged?.();
      if (this.opener?.getClientRects().length) this.opener.focus();
      this.onClosed?.(this.hadPointerLock);
    });
    el('map-zoom-in').onclick = () => this.zoom(0.75);
    el('map-zoom-out').onclick = () => this.zoom(1 / 0.75);
    el('map-recenter').onclick = () => this.recenter();
    el('map-city').onclick = () => { this.view = { ...CITY_VIEW }; this.redraw(); };
    el('map-world').onclick = () => { this.view = { ...WORLD_VIEW }; this.redraw(); };
    el('map-track').onclick = () => {
      const marker = this.markers.find(m => m.id === this.selected);
      if (!this.net.connected || !marker || marker.complete || marker.local) return;
      const saved = this.store.set({ type: 'marker', id: marker.id });
      this.announce(`Tracking ${marker.label}.${saved ? '' : ' Kept for this session; browser storage is unavailable.'}`);
      this.refreshDetails(); this.draw();
    };
    for (const id of ['map-clear', 'waypoint-clear']) el(id).onclick = () => this.clearWaypoint();
    el<HTMLInputElement>('map-waypoint-name').addEventListener('change', event => {
      const point = this.store.waypoint;
      if (point?.type !== 'point') return;
      this.store.set({ ...point, label: (event.target as HTMLInputElement).value.trim().slice(0, 48) || 'My waypoint' });
      this.refreshDetails(); this.draw();
    });
    for (const node of document.querySelectorAll<HTMLInputElement>('[data-map-filter],#map-search')) node.addEventListener('input', () => { this.refreshList(); this.draw(); });
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const p = this.pointer(event); this.zoom(event.deltaY > 0 ? 1.2 : 1 / 1.2, p);
    }, { passive: false });
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.canvas.focus();
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...this.view }, moved: false };
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
      if (!this.drag.moved) return;
      const scale = mapScale(this.drag.view, this.width, this.height);
      this.view = constrainView({ ...this.drag.view, x: this.drag.view.x - dx / scale, z: this.drag.view.z - dy / scale });
      this.redraw();
    });
    this.canvas.addEventListener('pointerup', event => {
      const drag = this.drag; this.drag = null;
      if (!drag || drag.id !== event.pointerId) return;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (drag.moved) return;
      const point = this.pointer(event);
      const marker = this.visibleMarkers().map(m => ({ marker: m, screen: worldToMap(m.position, this.view, this.width, this.height) }))
        .map(m => ({ ...m, distance: Math.hypot(m.screen.x - point.x, m.screen.y - point.y) })).filter(m => m.distance < 16).sort((a, b) => a.distance - b.distance)[0]?.marker;
      if (marker) this.select(marker.id, false);
      else this.placeWaypoint(mapToWorld(point, this.view, this.width, this.height));
    });
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
    this.canvas.addEventListener('lostpointercapture', () => { this.drag = null; });
    this.canvas.addEventListener('contextmenu', event => { event.preventDefault(); this.clearWaypoint(); });
    this.canvas.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const step = this.view.span * 0.08;
      if (event.key === 'ArrowLeft') this.view.x -= step;
      else if (event.key === 'ArrowRight') this.view.x += step;
      else if (event.key === 'ArrowUp') this.view.z -= step;
      else if (event.key === 'ArrowDown') this.view.z += step;
      else if (event.key === '+' || event.key === '=') this.zoom(0.75);
      else if (event.key === '-') this.zoom(1 / 0.75);
      else if (event.key === 'Home') this.recenter();
      else if (event.key === 'Enter') this.placeWaypoint({ x: this.view.x, z: this.view.z });
      else if (event.key === 'Delete' || event.key === 'Backspace') this.clearWaypoint();
      else return;
      event.preventDefault(); event.stopPropagation();
      this.view = constrainView(this.view); this.redraw();
    });
    new ResizeObserver(() => { if (this.isOpen) this.redraw(); }).observe(this.canvas);
  }
  public get isOpen(): boolean { return this.dialog.open; }
  public get trackedDistrictIndex(): number | undefined {
    const waypoint = this.store.waypoint;
    return waypoint?.type === 'marker' ? this.markers.find(m => m.id === waypoint.id && !m.complete)?.districtIndex : undefined;
  }
  public get navigation(): { label: string; position: { x: number; z: number; y?: number }; marker?: MapMarker } | null {
    if (!this.net.connected) return null;
    const waypoint = this.store.waypoint;
    if (waypoint?.type === 'point') return { label: waypoint.label, position: { x: waypoint.x, z: waypoint.z } };
    const marker = waypoint?.type === 'marker' ? this.markers.find(m => m.id === waypoint.id && !m.complete) : null;
    return marker ? { label: marker.label, position: marker.position, marker } : null;
  }
  public open(): void {
    if (this.isOpen || !this.net.connected || !this.net.getLocalAgent()) return;
    this.opener = document.activeElement as HTMLElement | null;
    this.hadPointerLock = Boolean(document.pointerLockElement);
    this.dialog.showModal();
    document.exitPointerLock?.();
    this.onBlockingChanged?.();
    this.update(performance.now(), true);
    this.redraw(); this.canvas.focus();
  }
  public close(): void { if (this.isOpen) this.dialog.close(); }
  public controllerPan(x: number, y: number, dt: number): void {
    if (!this.isOpen || (!x && !y)) return;
    this.view = constrainView({ ...this.view, x: this.view.x + x * this.view.span * dt * 0.5,
      z: this.view.z + y * this.view.span * dt * 0.5 });
    this.redraw();
  }
  public controllerSelect(): boolean {
    if (document.activeElement !== this.canvas) return false;
    this.placeWaypoint({ x: this.view.x, z: this.view.z }); return true;
  }
  public update(now: number, force = false): void {
    if (!force && now < this.nextUpdate) return;
    this.nextUpdate = now + 100;
    if (this.net.connected && (this.net.mode !== 'campaign' || this.net.soloState?.owner)) {
      if (this.store.useProfile(this.net.mode, this.net.localCallsign, this.net.soloState?.owner ?? this.net.localCallsign)) {
        this.selected = null; this.view = { ...CITY_VIEW }; this.dirty = true; this.lastArrival = '';
      }
    }
    this.markers = buildMapMarkers(this.net, now);
    const waypoint = this.store.waypoint;
    if (waypoint?.type === 'marker' && this.net.connected && this.net.districtLoopSnapshots.length === 4) {
      const marker = this.markers.find(m => m.id === waypoint.id);
      if ((!marker && !waypoint.id.startsWith('player:')) || marker?.complete || (!marker && waypoint.id.startsWith('player:') && ![...this.net.rosterCallsigns.values()].some(p => `player:${p.callsign}` === waypoint.id))) {
        this.store.set(null); this.announce(marker?.complete ? 'Tracked district liberated. Waypoint cleared.' : 'Tracked target is no longer available. Waypoint cleared.');
      }
    }
    const target = this.navigation, local = this.net.getLocalAgent();
    if (target && local) {
      const nav = navigationTo(local.position, target.position);
      const identity = JSON.stringify(this.store.waypoint);
      if (nav.arrived && this.lastArrival !== identity) { this.lastArrival = identity; this.announce(`Arrived near ${target.label}.`); }
      else if (!nav.arrived) this.lastArrival = '';
    }
    if (!this.isOpen) return;
    el('map-session').textContent = !this.net.connected ? 'Connection lost · Live markers unavailable'
      : this.net.mode === 'solo' ? 'Offline solo · Paused while map is open'
      : this.net.soloState?.paused ? 'Campaign paused by host' : 'Live co-op · The world keeps running';
    this.refreshList(); this.refreshDetails(); this.draw();
  }
  private announce(message: string): void { el('map-status').textContent = message; this.onNotice?.(message); }
  private pointer(event: MouseEvent) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  private zoom(factor: number, anchor = { x: this.width / 2, y: this.height / 2 }): void {
    if (!this.width || !this.height) return;
    this.view = zoomView(this.view, factor, anchor, this.width, this.height); this.redraw();
  }
  private recenter(): void {
    const local = this.net.connected && this.net.getLocalAgent();
    if (!local) return;
    this.view = constrainView({ ...this.view, x: local.position.x, z: local.position.z }); this.redraw();
  }
  private placeWaypoint(point: { x: number; z: number }): void {
    if (!this.net.connected) return;
    if (!validMapPoint(point.x, point.z)) { this.announce('Choose a point inside the mapped city and bridge area.'); return; }
    this.selected = null;
    const saved = this.store.set({ type: 'point', x: Math.round(point.x), z: Math.round(point.z), label: 'My waypoint' });
    this.announce(`Waypoint set.${saved ? '' : ' Kept for this session; browser storage is unavailable.'}`);
    this.refreshDetails(); this.draw();
  }
  private clearWaypoint(): void { this.store.set(null); this.lastArrival = ''; this.announce('Waypoint cleared.'); this.refreshDetails(); this.draw(); }
  private select(id: string, center: boolean): void {
    this.selected = id;
    const marker = this.markers.find(m => m.id === id);
    if (marker && center) { this.view = constrainView({ ...this.view, x: marker.position.x, z: marker.position.z }); this.dirty = true; }
    this.refreshDetails(); this.draw();
  }
  private visibleMarkers(): MapMarker[] {
    const query = el<HTMLInputElement>('map-search').value.trim().toLowerCase();
    const order: Record<MarkerKind, number> = { player: 0, objective: 1, event: 2, landmark: 3 };
    return this.markers.filter(m => (m.local || el<HTMLInputElement>(`map-filter-${m.kind}`).checked)
      && (!m.complete || el<HTMLInputElement>('map-filter-complete').checked)
      && (m.local || !query || `${m.label} ${m.detail}`.toLowerCase().includes(query))).sort((a, b) => order[a.kind] - order[b.kind]);
  }
  private refreshList(): void {
    const visible = this.visibleMarkers(), ids = new Set(visible.map(m => m.id)), list = el('map-marker-list'), local = this.net.getLocalAgent();
    for (const [id, button] of this.rows) if (!ids.has(id)) { button.remove(); this.rows.delete(id); }
    for (const [index, marker] of visible.entries()) {
      let button = this.rows.get(marker.id);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'map-marker-row'; button.dataset.markerId = marker.id;
        button.onclick = () => this.select(marker.id, true); list.append(button); this.rows.set(marker.id, button);
      }
      if (list.children[index] !== button) list.insertBefore(button, list.children[index] ?? null);
      const distance = local ? ` · ${Math.round(navigationTo(local.position, marker.position).distance)}m` : '';
      button.textContent = `${marker.local ? '▲' : marker.kind === 'player' ? '●' : marker.complete ? '✓' : marker.kind === 'objective' ? '◆' : marker.kind === 'event' ? '!' : '■'} ${marker.label}${distance}`;
      button.setAttribute('aria-pressed', String(this.selected === marker.id)); button.style.setProperty('--marker-color', marker.local ? '#76efcf' : colors[marker.kind]);
    }
    el('map-empty').hidden = visible.length > 0;
  }
  private refreshDetails(): void {
    const marker = this.markers.find(m => m.id === this.selected), waypoint = this.store.waypoint, target = this.navigation, local = this.net.getLocalAgent();
    el('map-selection-title').textContent = marker?.label ?? (waypoint?.type === 'point' ? waypoint.label : 'Choose a destination');
    el('map-selection-detail').textContent = marker?.detail ?? 'Click an empty map location to set a waypoint, or select a marker and track it.';
    const position = marker?.position ?? target?.position;
    el('map-selection-position').textContent = position ? `E ${Math.round(position.x)} / S ${Math.round(position.z)}${position.y === undefined ? ' · Surface pin' : ` · Elevation ${Math.round(position.y)}m`}` : '';
    el<HTMLButtonElement>('map-track').disabled = !this.net.connected || !marker || Boolean(marker.local || marker.complete);
    el<HTMLButtonElement>('map-clear').disabled = !waypoint;
    const name = el<HTMLInputElement>('map-waypoint-name'); name.disabled = waypoint?.type !== 'point';
    if (document.activeElement !== name) name.value = waypoint?.type === 'point' ? waypoint.label : '';
    const nav = target && local ? navigationTo(local.position, target.position) : null;
    el('map-active-waypoint').textContent = target && nav ? `${nav.arrived ? 'ARRIVED' : 'TRACKING'} · ${target.label} · ${Math.round(nav.distance)}m${nav.elevation === null ? '' : ` · ${Math.round(Math.abs(nav.elevation))}m ${nav.elevation >= 0 ? 'above' : 'below'}`}`
      : waypoint && !this.net.connected ? 'Waypoint retained · Reconnect for live guidance' : 'No active waypoint';
  }
  private redraw(): void { this.dirty = true; this.draw(); }
  private draw(): void {
    if (!this.isOpen) return;
    const width = Math.round(this.canvas.clientWidth), height = Math.round(this.canvas.clientHeight), ratio = Math.min(2, window.devicePixelRatio || 1);
    if (!width || !height) return;
    if (width !== this.width || height !== this.height || ratio !== this.ratio) {
      this.width = width; this.height = height; this.ratio = ratio;
      this.canvas.width = this.background.width = Math.round(width * ratio);
      this.canvas.height = this.background.height = Math.round(height * ratio); this.dirty = true;
    }
    if (this.dirty) { this.drawBackground(); this.dirty = false; }
    const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.background, 0, 0); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const target = this.navigation, local = this.net.connected && this.net.getLocalAgent();
    if (target) {
      const dest = worldToMap(target.position, this.view, width, height);
      if (local) { const from = worldToMap(local.position, this.view, width, height); ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(dest.x, dest.y); ctx.setLineDash([5, 6]); ctx.strokeStyle = '#76efcf'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = '#76efcf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(dest.x, dest.y, 15, 0, Math.PI * 2); ctx.stroke();
      if (!target.marker) { ctx.fillStyle = '#76efcf'; ctx.fillRect(dest.x - 4, dest.y - 4, 8, 8); }
    }
    // Keep the local player readable even when several objectives share the deployment area.
    for (const marker of this.visibleMarkers().sort((a, b) => Number(Boolean(a.local)) - Number(Boolean(b.local)))) {
      const point = worldToMap(marker.position, this.view, width, height);
      if (point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) continue;
      ctx.save(); ctx.translate(point.x, point.y); ctx.fillStyle = marker.local ? '#76efcf' : colors[marker.kind]; ctx.strokeStyle = '#06121b'; ctx.lineWidth = 3;
      if (marker.id === this.selected) { ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = '#06121b'; ctx.lineWidth = 3; }
      ctx.beginPath();
      if (marker.kind === 'player') { ctx.rotate(-(marker.yaw ?? 0)); ctx.moveTo(0, -11); ctx.lineTo(8, 8); ctx.lineTo(0, 4); ctx.lineTo(-8, 8); ctx.closePath(); }
      else if (marker.kind === 'objective') { ctx.moveTo(0, -9); ctx.lineTo(9, 0); ctx.lineTo(0, 9); ctx.lineTo(-9, 0); ctx.closePath(); }
      else if (marker.kind === 'event') ctx.arc(0, 0, 8, 0, Math.PI * 2);
      else ctx.rect(-6, -6, 12, 12);
      ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.font = 'bold 11px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.lineWidth = 4; ctx.strokeStyle = '#06121b'; ctx.fillStyle = '#edf7fa';
      if (marker.local || marker.id === this.selected || this.view.span < 600) { const label = marker.local ? 'YOU' : marker.label; ctx.strokeText(label, point.x + 13, point.y - 12); ctx.fillText(label, point.x + 13, point.y - 12); }
      if (marker.complete) { ctx.fillStyle = '#06121b'; ctx.fillText('✓', point.x - 5, point.y + 4); }
    }
    ctx.strokeStyle = '#c1d2db99'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(width / 2 - 5, height / 2); ctx.lineTo(width / 2 + 5, height / 2); ctx.moveTo(width / 2, height / 2 - 5); ctx.lineTo(width / 2, height / 2 + 5); ctx.stroke();
    const scale = mapScale(this.view, width, height), meters = this.view.span < 500 ? 25 : this.view.span < 2000 ? 100 : 500;
    ctx.fillStyle = '#edf7fa'; ctx.font = '12px Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.fillRect(20, height - 25, meters * scale, 3); ctx.fillText(`${meters} m`, 20, height - 34);
    ctx.textAlign = 'right'; ctx.fillText('N ↑', width - 20, 26);
    el('map-zoom-level').textContent = `${(1400 / this.view.span).toFixed(1)}×`;
  }
  private drawBackground(): void {
    const ctx = this.backgroundCtx, { width, height, ratio } = this;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#081a28'; ctx.fillRect(0, 0, width, height);
    const scale = mapScale(this.view, width, height), start = worldToMap({ x: -600, z: -600 }, this.view, width, height);
    const quadrants = [['#172735', -600, -600, 'AEGIS CITADEL'], ['#222b34', 0, -600, 'HELIOS SPIRE'], ['#142e36', -600, 0, 'NEON DOCKS'], ['#2b2a2b', 0, 0, 'FOUNDRY SLUMS']] as const;
    for (const [color, x, z] of quadrants) { const p = worldToMap({ x, z }, this.view, width, height); ctx.fillStyle = color; ctx.fillRect(p.x, p.y, 600 * scale, 600 * scale); }
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-this.view.x, -this.view.z);
    for (const structure of this.geometry) {
      const { center: p, halfExtents: h } = structure;
      // Large ground slabs define the city footprint, already colored by district above.
      if (h.x > 150 && h.z > 150 && h.y < 2) continue;
      if (Math.abs(p.x - this.view.x) > width / scale / 2 + h.x || Math.abs(p.z - this.view.z) > height / scale / 2 + h.z) continue;
      ctx.fillStyle = structure.material === 'harbor_water' ? '#0b2838' : structure.material === 'plaza_asphalt' ? '#344550' : structure.material === 'ledge_trim' ? '#58717c' : '#6b8594';
      ctx.save(); ctx.translate(p.x, p.z); ctx.rotate(-(structure.rotation?.y ?? 0)); ctx.fillRect(-h.x, -h.z, h.x * 2, h.z * 2); ctx.restore();
    }
    ctx.restore();
    const spacing = this.view.span < 500 ? 50 : this.view.span < 2000 ? 100 : 500;
    const corner = mapToWorld({ x: 0, y: 0 }, this.view, width, height), end = mapToWorld({ x: width, y: height }, this.view, width, height);
    ctx.strokeStyle = '#c1d2db14'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = Math.ceil(corner.x / spacing) * spacing; x <= end.x; x += spacing) { const p = worldToMap({ x, z: 0 }, this.view, width, height); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, height); }
    for (let z = Math.ceil(corner.z / spacing) * spacing; z <= end.z; z += spacing) { const p = worldToMap({ x: 0, z }, this.view, width, height); ctx.moveTo(0, p.y); ctx.lineTo(width, p.y); } ctx.stroke();
    ctx.strokeStyle = '#b3c5cd66'; ctx.strokeRect(start.x, start.y, 1200 * scale, 1200 * scale);
    const center = worldToMap({ x: 0, z: 0 }, this.view, width, height);
    ctx.beginPath(); ctx.moveTo(center.x, start.y); ctx.lineTo(center.x, start.y + 1200 * scale); ctx.moveTo(start.x, center.y); ctx.lineTo(start.x + 1200 * scale, center.y); ctx.stroke();
    ctx.font = 'bold 12px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#d3e4e9'; ctx.strokeStyle = '#08121d'; ctx.lineWidth = 4;
    for (const [, x, z, name] of quadrants) { const p = worldToMap({ x: x + 300, z: z + 70 }, this.view, width, height); ctx.strokeText(name, p.x, p.y); ctx.fillText(name, p.x, p.y); }
  }
}

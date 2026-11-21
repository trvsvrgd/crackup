import type { ControllerFrame } from './xboxController.js';

/** Navigate the existing accessible controls, including dynamically added upgrades. */
export class ControllerMenus {
  private direction = 0;
  private repeatAt = 0;
  private lastUpdate = 0;

  public update(root: HTMLElement, frame: ControllerFrame, now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastUpdate) / 1000));
    this.lastUpdate = now;
    const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')]
      .filter(node => node.getClientRects().length > 0 && !node.closest('[hidden]'));
    if (!controls.length) return;
    let active = document.activeElement as HTMLElement;
    if (!controls.includes(active)) { active = controls[0]; active.focus(); }
    if (frame.lookY && root.id !== 'tactical-map') {
      let scroll: HTMLElement | null = active;
      while (scroll && root.contains(scroll)) {
        if (scroll.scrollHeight > scroll.clientHeight && /auto|scroll/.test(getComputedStyle(scroll).overflowY)) {
          scroll.scrollTop += frame.lookY * 600 * dt; break;
        }
        scroll = scroll.parentElement;
      }
    }
    const vertical = frame.held[12] || frame.moveZ > 0.5 ? -1 : frame.held[13] || frame.moveZ < -0.5 ? 1 : 0;
    const horizontal = frame.held[14] || frame.moveX < -0.5 ? -1 : frame.held[15] || frame.moveX > 0.5 ? 1 : 0;
    const direction = vertical || horizontal * 2;
    if (direction && (direction !== this.direction || now >= this.repeatAt)) {
      this.repeatAt = now + (direction !== this.direction ? 350 : 120);
      if (horizontal && active instanceof HTMLInputElement && active.type === 'range') {
        horizontal > 0 ? active.stepUp() : active.stepDown();
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (horizontal && active instanceof HTMLSelectElement) {
        const options = [...active.options];
        let index = active.selectedIndex + horizontal;
        while (options[index]?.disabled) index += horizontal;
        if (options[index]) { active.selectedIndex = index; active.dispatchEvent(new Event('change', { bubbles: true })); }
      } else {
        const delta = vertical || horizontal;
        active = controls[(controls.indexOf(active) + delta + controls.length) % controls.length];
        active.focus(); active.scrollIntoView({ block: 'nearest' });
      }
    }
    this.direction = direction;
    if (frame.pressed[0]) active.click();
  }
}

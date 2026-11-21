import {
  INPUT_FLAG_AIM, INPUT_FLAG_DASH, INPUT_FLAG_FIRE, INPUT_FLAG_GRAB_THROW,
  INPUT_FLAG_GRAPPLE, INPUT_FLAG_JUMP, INPUT_FLAG_MANTLE, INPUT_FLAG_MELEE,
  INPUT_FLAG_OBJECTIVE_JETPACK, INPUT_FLAG_PARRY, INPUT_FLAG_RELIC_REWIND,
  INPUT_FLAG_SPRINT, INPUT_FLAG_VEHICLE_INTERACT,
} from '../../shared/constants.js';

export type ControllerCommand = 'menu' | 'map' | 'reload' | 'pet' | 'limbPrevious' | 'limbNext' | 'upgrades'
  | 'wingsuit' | 'jet_dash' | 'threat_scanner' | 'weakpoint_scan' | 'hover_aim' | 'airborne_focus';
export type ControllerDevice = Pick<Gamepad, 'id' | 'index' | 'connected' | 'mapping' | 'axes' | 'buttons'>;
export interface ControllerFrame {
  connected: boolean;
  changed: boolean;
  name: string;
  moveX: number;
  moveZ: number;
  lookX: number;
  lookY: number;
  held: boolean[];
  pressed: boolean[];
  commands: ControllerCommand[];
}

/** W3C standard mapping, supplied by Windows browsers for Xbox / XInput pads. */
export function stick(x = 0, y = 0, deadzone = 0.18): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0];
  const length = Math.hypot(x, y);
  if (length <= deadzone) return [0, 0];
  const scale = (Math.min(1, length) - deadzone) / (1 - deadzone) / length;
  return [x * scale, y * scale];
}

export class XboxController {
  private identity = '';
  private previous: boolean[] = [];
  private armed = false;
  private pending = 0;
  private buttons = 0;
  private movement = { moveX: 0, moveZ: 0 };

  public clearGameplay(): void {
    this.armed = false;
    this.pending = this.buttons = 0;
    this.movement = { moveX: 0, moveZ: 0 };
  }

  public poll(pads: readonly (ControllerDevice | null)[], enabled: boolean, gameplay: boolean): ControllerFrame {
    const supported = pads.filter((pad): pad is ControllerDevice => !!pad?.connected && pad.mapping === 'standard');
    const pad = supported.find(p => `${p.index}:${p.id}` === this.identity) ?? supported[0];
    const identity = pad ? `${pad.index}:${pad.id}` : '';
    const changed = identity !== this.identity;
    if (changed) { this.identity = identity; this.previous = []; this.clearGameplay(); }
    const held = Array.from({ length: 17 }, (_, i) => !!pad && (pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.5));
    const pressed = held.map((down, i) => enabled && !changed && down && !this.previous[i]);
    this.previous = held;
    const [moveX, moveY] = stick(pad?.axes[0], pad?.axes[1]);
    const [lookX, lookY] = stick(pad?.axes[2], pad?.axes[3]);
    const frame: ControllerFrame = { connected: !!pad, changed, name: pad?.id ?? '', moveX, moveZ: -moveY,
      lookX, lookY, held, pressed, commands: [] };
    if (!enabled || !pad) { this.clearGameplay(); return frame; }
    if (pressed[9]) frame.commands.push('menu');
    if (pressed[8]) frame.commands.push('map');
    if (!gameplay) { this.clearGameplay(); return frame; }
    // Require neutral after connecting, alt-tab, menus or cinematics. A held trigger
    // must never fire as a side effect of returning to the game.
    if (!this.armed) {
      if (!held.some(Boolean) && !moveX && !moveY && !lookX && !lookY) this.armed = true;
      return { ...frame, moveX: 0, moveZ: 0, lookX: 0, lookY: 0 };
    }
    let flags = 0;
    const bind = (index: number, flag: number) => { if (held[index]) flags |= flag; };
    if (held[4]) {
      bind(0, INPUT_FLAG_MANTLE); bind(1, INPUT_FLAG_RELIC_REWIND);
      bind(2, INPUT_FLAG_GRAB_THROW); bind(3, INPUT_FLAG_VEHICLE_INTERACT);
      bind(6, INPUT_FLAG_OBJECTIVE_JETPACK); bind(7, INPUT_FLAG_GRAPPLE);
      for (const [index, command] of [[12, 'wingsuit'], [13, 'jet_dash'], [14, 'threat_scanner'],
        [15, 'weakpoint_scan'], [10, 'hover_aim'], [11, 'airborne_focus']] as const) {
        if (pressed[index]) frame.commands.push(command);
      }
    } else {
      bind(0, INPUT_FLAG_JUMP); bind(1, INPUT_FLAG_DASH); bind(2, INPUT_FLAG_OBJECTIVE_JETPACK);
      bind(5, INPUT_FLAG_PARRY); bind(6, INPUT_FLAG_AIM); bind(7, INPUT_FLAG_FIRE);
      bind(10, INPUT_FLAG_SPRINT); bind(11, INPUT_FLAG_MELEE);
      for (const [index, command] of [[3, 'reload'], [12, 'pet'], [13, 'upgrades'],
        [14, 'limbPrevious'], [15, 'limbNext']] as const) {
        if (pressed[index]) frame.commands.push(command);
      }
    }
    this.buttons = flags;
    this.pending |= flags;
    this.movement = { moveX, moveZ: -moveY };
    return frame;
  }

  public get aiming(): boolean { return (this.buttons & INPUT_FLAG_AIM) !== 0; }
  public consume(): { moveX: number; moveZ: number; buttons: number } {
    const result = { ...this.movement, buttons: this.buttons | this.pending };
    this.pending = 0;
    return result;
  }
}

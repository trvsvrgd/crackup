import type { Vec3 } from '../protocol/binaryProtocol.js';
export interface OpeningBox { id: string; center: Vec3; half: Vec3; color: number }
export const OPENING_SITE: OpeningBox[] = [];
const box = (id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number, color = 0x334653) =>
  OPENING_SITE.push({ id, center: { x, y, z }, half: { x: hx, y: hy, z: hz }, color });
// Original authored blockout, kept separate from the existing district collider generator.
box('hub-canopy', -20, 4, 210, 7, .18, 5, 0x42596a);
box('hub-workbench', -24, .6, 208, 1.6, .6, .6, 0x9d7245);
box('hub-antenna', -26, 4, 207, .15, 4, .15, 0x80cfc9);
box('market-awning', -25, 3, 241, 3, .15, 2, 0x248ca4);
box('freight-crate', -24, .7, 243, 1, .7, 1, 0xc88944);
box('customs-back', -20, 2.5, 281, 10, 2.5, .3);
box('customs-east', -10, 2.5, 271, .3, 2.5, 10);
box('customs-front-left', -26.5, 2.5, 261, 3.5, 2.5, .3);
box('customs-front-right', -13.5, 2.5, 261, 3.5, 2.5, .3);
box('customs-front-header', -20, 4.2, 261, 3, .8, .3, 0x925a40);
box('customs-west-front', -30, 2.5, 266, .3, 2.5, 5);
box('customs-west-back', -30, 2.5, 279, .3, 2.5, 2);
box('customs-roof', -20, 5.15, 271, 10.4, .25, 10.4);
box('records-desk', -23, .6, 277, 1.4, .6, .65, 0x9d7245);
box('records-cabinet', -13, 1.2, 279, .65, 1.2, 1.2, 0x6b7c85);
box('customs-cover', -25, .55, 270, 1.5, .55, .6, 0x6b7c85);
for (let i = 0; i < 18; i++) {
  const top = (i + 1) * .3;
  box(`service-stair-${i}`, -35, top / 2, 256 + i * 1.3, 2, top / 2, .7, 0x59656b);
}
box('stair-landing', -31, 5.15, 279, 4, .25, 2, 0x438b91);
box('roof-walk-a', -20, 5.15, 286, 3.5, .25, 3.6, 0x438b91);
box('roof-walk-b', -20, 5.15, 294, 3.5, .25, 3.6, 0x438b91);
box('transmitter-deck', -20, 5.15, 304, 5, .25, 5.6, 0x438b91);
box('transmitter-mast', -24, 7.4, 306, .15, 2, .15, 0xc88944);
box('quay-cover-left', -29, .65, 352, 2, .65, .8, 0x6c7f7d);
box('quay-cover-right', -11, .65, 363, 2, .65, .8, 0x6c7f7d);
box('quay-hoist-left', -35, 4, 369, .3, 4, .3, 0xc88944);
box('quay-hoist-right', -5, 4, 369, .3, 4, .3, 0xc88944);
box('quay-hoist-beam', -20, 8, 369, 15, .3, .3, 0xc88944);

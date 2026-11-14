import type { WorldBoxStructure } from "./neoVeridiaBlock.js";

export const BAY_SIZE = 10000;
export const VISTA_FAR = 18000;
export const BRIDGES = [
  { id: "vermilion", origin: { x: -160, z: -598 }, yaw: 0, color: 0x943f2c },
  {
    id: "eclipse",
    origin: { x: 598, z: 160 },
    yaw: -Math.PI / 2,
    color: 0x718d9a,
  },
] as const;
export const BRIDGE_LENGTH = 2800,
  BRIDGE_WIDTH = 28;
/** Accessible from the existing 14 m sea-wall; preserves all legacy city colliders. */
export function bridgeHeight(distance: number): number {
  return (
    14.3 +
    47.7 *
      Math.min(
        1,
        Math.max(0, distance / 480),
        Math.max(0, (BRIDGE_LENGTH - distance) / 480),
      )
  );
}
export function bridgePoint(
  bridge: (typeof BRIDGES)[number],
  along: number,
  across = 0,
  y = bridgeHeight(along),
) {
  return {
    x:
      bridge.origin.x -
      Math.sin(bridge.yaw) * along +
      Math.cos(bridge.yaw) * across,
    y,
    z:
      bridge.origin.z -
      Math.cos(bridge.yaw) * along -
      Math.sin(bridge.yaw) * across,
  };
}
export function bridgeCableHeight(t: number): number {
  if (t < 700) return 66 + (180 * t) / 700;
  if (t > 2100) return 66 + (180 * (2800 - t)) / 700;
  return 87 + 159 * ((t - 1400) / 700) ** 2;
}
/** Only the highway deck, safety rails and viewing-end barrier participate in physics. */
export function buildBayBridgeColliders(): WorldBoxStructure[] {
  const out: WorldBoxStructure[] = [];
  for (const bridge of BRIDGES)
    for (let i = 0; i < 70; i++) {
      const a = i * 40,
        b = a + 40,
        dy = bridgeHeight(b) - bridgeHeight(a),
        tilt = Math.atan2(dy, 40);
      for (const side of [0, -1, 1]) {
        const p = bridgePoint(
          bridge,
          (a + b) / 2,
          side * (BRIDGE_WIDTH / 2 + 0.4),
          (bridgeHeight(a) + bridgeHeight(b)) / 2 + (side ? 0.9 : -0.5),
        );
        // Rotation XYZ: the east bridge uses rotation around Z instead of X.
        const rotation =
          bridge.yaw === 0 ? { x: tilt, y: 0, z: 0 } : { x: 0, y: 0, z: tilt };
        const half =
          bridge.yaw === 0
            ? {
                x: side ? 0.4 : BRIDGE_WIDTH / 2,
                y: side ? 0.9 : 0.5,
                z: Math.hypot(40, dy) / 2 + 0.03,
              }
            : {
                x: Math.hypot(40, dy) / 2 + 0.03,
                y: side ? 0.9 : 0.5,
                z: side ? 0.4 : BRIDGE_WIDTH / 2,
              };
        out.push({
          id: `bay_${bridge.id}_${side ? `rail${side}` : "deck"}_${i}`,
          center: p,
          halfExtents: half,
          rotation,
          material: side ? "brutalist_concrete" : "plaza_asphalt",
          excludeOrbPlacement: true,
        });
      }
    }
  for (const bridge of BRIDGES)
    out.push({
      id: `bay_${bridge.id}_viewing_end`,
      center: bridgePoint(bridge, BRIDGE_LENGTH - 1, 0, 15.2),
      halfExtents:
        bridge.yaw === 0
          ? { x: 14.7, y: 0.9, z: 0.4 }
          : { x: 0.4, y: 0.9, z: 14.7 },
      material: "brutalist_concrete",
      excludeOrbPlacement: true,
    });
  return out;
}
export function terrainRadius(angle: number): number {
  return 3270 + 150 * Math.sin(angle * 5) + 120 * Math.sin(angle * 9);
}
export function terrainHeight(angle: number, radius: number): number {
  const t = Math.max(0, radius - terrainRadius(angle));
  const x = Math.cos(angle) * radius,
    z = Math.sin(angle) * radius;
  const port = Math.min(
    Math.abs(x + 160) + Math.max(0, z + 2900),
    Math.abs(z - 160) + Math.max(0, 2900 - x),
  );
  const portBlend = Math.min(
    1,
    Math.max(
      Math.max(0, (port - 70) / 240),
      Math.max(0, (radius - 3500) / 200),
    ),
  );
  // Flatten the two coastal bridge landings; terrain remains a non-traversable vista.
  const height =
    -4 +
    Math.min(1, t / 750) *
      (130 +
        200 * (0.5 + 0.5 * Math.sin(angle * 7 + t / 700)) +
        210 * Math.sin(angle * 3 + t / 1100) ** 2);
  return port < 310 && radius < 3700 ? height * portBlend : height;
}

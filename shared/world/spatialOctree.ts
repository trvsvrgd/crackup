/**
 * CRACKUP: Protocol Eclipse (v2.0 True 3D AAA Architecture)
 * 3D Spatial Octree & District Chunk Grid for 1200m x 1200m x 320m Neo-Veridia Metropolis
 */

import { CITY_HALF_EXTENT, DistrictId, getDistrictForPosition } from '../constants.js';
import { Vec3 } from '../protocol/binaryProtocol.js';

export interface AABB3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface SpatialItem<T> {
  id: string;
  bounds: AABB3D;
  center: Vec3;
  district: DistrictId;
  data: T;
}

export function aabbIntersects(a: AABB3D, b: AABB3D): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

export function aabbContainsPoint(box: AABB3D, p: Vec3): boolean {
  return (
    p.x >= box.minX &&
    p.x <= box.maxX &&
    p.y >= box.minY &&
    p.y <= box.maxY &&
    p.z >= box.minZ &&
    p.z <= box.maxZ
  );
}

class OctreeNode<T> {
  public readonly items: SpatialItem<T>[] = [];
  public children: OctreeNode<T>[] | null = null;

  constructor(
    public readonly bounds: AABB3D,
    public readonly depth: number,
    private readonly maxDepth: number,
    private readonly maxItemsPerNode: number
  ) {}

  public insert(item: SpatialItem<T>): void {
    if (!aabbIntersects(this.bounds, item.bounds)) {
      return;
    }

    if (this.children !== null) {
      for (const child of this.children) {
        child.insert(item);
      }
      return;
    }

    this.items.push(item);

    if (this.items.length > this.maxItemsPerNode && this.depth < this.maxDepth) {
      this.subdivide();
    }
  }

  private subdivide(): void {
    const { minX, minY, minZ, maxX, maxY, maxZ } = this.bounds;
    const midX = (minX + maxX) * 0.5;
    const midY = (minY + maxY) * 0.5;
    const midZ = (minZ + maxZ) * 0.5;

    this.children = [
      new OctreeNode({ minX, minY, minZ, maxX: midX, maxY: midY, maxZ: midZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
      new OctreeNode({ minX: midX, minY, minZ, maxX, maxY: midY, maxZ: midZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
      new OctreeNode({ minX, minY: midY, minZ, maxX: midX, maxY, maxZ: midZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
      new OctreeNode({ minX: midX, minY: midY, minZ, maxX, maxY, maxZ: midZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
      new OctreeNode({ minX, minY, minZ: midZ, maxX: midX, maxY: midY, maxZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
      new OctreeNode({ minX: midX, minY, minZ: midZ, maxX, maxY: midY, maxZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
      new OctreeNode({ minX, minY: midY, minZ: midZ, maxX: midX, maxY, maxZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
      new OctreeNode({ minX: midX, minY: midY, minZ: midZ, maxX, maxY, maxZ }, this.depth + 1, this.maxDepth, this.maxItemsPerNode),
    ];

    const existing = this.items.splice(0, this.items.length);
    for (const item of existing) {
      for (const child of this.children) {
        child.insert(item);
      }
    }
  }

  public queryAABB(range: AABB3D, found: Map<string, SpatialItem<T>>): void {
    if (!aabbIntersects(this.bounds, range)) {
      return;
    }

    for (const item of this.items) {
      if (!found.has(item.id) && aabbIntersects(item.bounds, range)) {
        found.set(item.id, item);
      }
    }

    if (this.children !== null) {
      for (const child of this.children) {
        child.queryAABB(range, found);
      }
    }
  }
}

/**
 * 3D Spatial Octree covering the entire 1200m x 1200m x 360m Neo-Veridia volume
 */
export class WorldSpatialOctree<T> {
  private readonly root: OctreeNode<T>;
  private readonly byDistrict: Map<DistrictId, SpatialItem<T>[]> = new Map([
    [DistrictId.NEON_DOCKS, []],
    [DistrictId.FOUNDRY_SLUMS, []],
    [DistrictId.HELIOS_SPIRE, []],
    [DistrictId.AEGIS_CITADEL, []],
  ]);
  private totalCount = 0;

  constructor(
    bounds: AABB3D = {
      minX: -CITY_HALF_EXTENT - 50,
      minY: -20,
      minZ: -CITY_HALF_EXTENT - 50,
      maxX: CITY_HALF_EXTENT + 50,
      maxY: 360,
      maxZ: CITY_HALF_EXTENT + 50,
    },
    maxDepth = 5,
    maxItemsPerNode = 16
  ) {
    this.root = new OctreeNode<T>(bounds, 0, maxDepth, maxItemsPerNode);
  }

  public insert(id: string, center: Vec3, halfExtents: Vec3, data: T): SpatialItem<T> {
    const bounds: AABB3D = {
      minX: center.x - halfExtents.x,
      minY: center.y - halfExtents.y,
      minZ: center.z - halfExtents.z,
      maxX: center.x + halfExtents.x,
      maxY: center.y + halfExtents.y,
      maxZ: center.z + halfExtents.z,
    };
    const district = getDistrictForPosition(center.x, center.z);
    const item: SpatialItem<T> = { id, bounds, center, district, data };
    this.root.insert(item);
    this.byDistrict.get(district)?.push(item);
    this.totalCount += 1;
    return item;
  }

  public queryBox(range: AABB3D): SpatialItem<T>[] {
    const found = new Map<string, SpatialItem<T>>();
    this.root.queryAABB(range, found);
    return Array.from(found.values());
  }

  public querySphere(center: Vec3, radius: number): SpatialItem<T>[] {
    const box: AABB3D = {
      minX: center.x - radius,
      minY: center.y - radius,
      minZ: center.z - radius,
      maxX: center.x + radius,
      maxY: center.y + radius,
      maxZ: center.z + radius,
    };
    return this.queryBox(box);
  }

  public getDistrictItems(district: DistrictId): SpatialItem<T>[] {
    return this.byDistrict.get(district) || [];
  }

  public size(): number {
    return this.totalCount;
  }
}


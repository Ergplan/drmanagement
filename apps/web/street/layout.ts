import type { StreetData, StreetNode } from './types';

/** "Follow the power": every node, from the utility meter through the plant to the loads and the roof. */
export const ROUTE = [
  'ht-meter',
  'transformers',
  'lt-main',
  'feeders',
  'chillers',
  'chw-pumps',
  'ups',
  'dg',
  'medgas',
  'stp-ro',
  'laundry',
  'emergency',
  'opd-ahu',
  'imaging',
  'kitchen',
  'admin-lighting',
  'ot',
  'icu',
  'cathlab',
  'isolation',
  'ward',
  'cooling-towers',
  'solar',
  'heatpumps',
  'hw-tanks',
  'ev',
];

export const CLASS_COLOR: Record<string, string> = {
  flexible: '#1f9a50',
  conditional: '#d08a1c',
  protected: '#7b5cd6',
  critical: '#c8352b',
  meter: '#2a78d6',
};

export function geometry(d: StreetData) {
  const H = d.building?.floor_height_m ?? 4.2;
  const W = d.building?.footprint.width_x ?? 64;
  const D = d.building?.footprint.depth_z ?? 26;
  const level = new Map(d.floors.map((f) => [f.id, f.level]));
  /** floor surface height of a floor id */
  const y = (floorId: string) => (level.get(floorId) ?? 0) * H;
  /** world position of a node: x along the front, z into the building (street is negative z in the scene) */
  const at = (n: StreetNode): [number, number, number] => [n.pos[0], y(n.floorId), n.pos[1]];
  return { H, W, D, y, at, level };
}

export function ordered(nodes: StreetNode[]): StreetNode[] {
  const idx = (id: string) => {
    const i = ROUTE.indexOf(id);
    return i < 0 ? 999 : i;
  };
  return [...nodes].sort((a, b) => idx(a.id) - idx(b.id));
}

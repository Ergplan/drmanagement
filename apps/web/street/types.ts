export interface StreetNode {
  id: string;
  floorId: string;
  title: string;
  drClass: 'flexible' | 'conditional' | 'protected' | 'critical' | 'meter';
  assetId: string | null;
  pos: [number, number];
  look: number;
  note: string | null;
  driverLater: string | null;
  points: Array<{ id: string; kind: string; unit: string }>;
}
export interface StreetFloor {
  id: string;
  level: number;
  name: string;
  uses: string[];
}
export interface StreetData {
  building: { footprint: { width_x: number; depth_z: number }; floor_height_m: number } | null;
  floors: StreetFloor[];
  nodes: StreetNode[];
  assets: Array<{ id: string; name: string; drClass: string; action: string | null; never: string | null }>;
}
export type Mode = 'tour' | 'walk' | 'dollhouse';
export interface LiveState {
  /** latest value by point id */
  v: (pointId: string) => number | undefined;
  /** assets curtailed now (from the edge control state) */
  curtailed: Set<string>;
}

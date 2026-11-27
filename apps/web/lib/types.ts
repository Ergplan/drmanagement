/** Shapes returned by the API routes (kept beside the client code that reads them). */
export interface PointsResp {
  at: string;
  points: Record<string, { v: number; t: string; s: string; q: string }>;
}
export interface NodeResp {
  id: string;
  title: string;
  drClass: string;
  floorId: string;
  assetId: string | null;
  points: Array<{ id: string; kind: string; unit: string }>;
}
export interface DayResp {
  date: string;
  blocks: Array<{
    blockNo: number;
    kwh: number;
    kvah: number;
    avgKva: number;
    solarKwh: number;
    assetKwh: Record<string, number>;
    source: string;
  }>;
  day: { kwh: number; kvah: number; mdKva: number; solarKwh: number; costInr: number } | null;
}
export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

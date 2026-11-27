/**
 * Modbus TCP driver for panel energy meters, inverters (SunSpec register maps) and controllers.
 * Polls holding/input registers per a point map and decodes them; actuation writes a register when the map
 * allows it. Built and tested against a Modbus server simulator; real devices are commissioned in edge.config.yaml.
 */
import ModbusRTU from 'modbus-serial';
import type { ActuateCommand, ActuateResult, Driver, Reading } from '../types';

export type RegType = 'holding' | 'input';
export type Decode = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32';

export interface PointMap {
  pointId: string;
  unitId: number;
  register: number; // 0-based address
  type: RegType;
  decode: Decode;
  scale?: number; // value = raw × scale
  wordOrder?: 'big' | 'little'; // for 32-bit values
}

export interface ActuationMap {
  assetId: string;
  action: string;
  unitId: number;
  register: number;
  value: number;
}

export interface ModbusTcpOptions {
  id: string;
  host: string;
  port?: number;
  timeoutMs?: number;
  points: PointMap[];
  actuations?: ActuationMap[];
}

/** Decode registers to a number. Exported for tests. */
export function decode(regs: number[], d: Decode, wordOrder: 'big' | 'little' = 'big'): number {
  const buf = Buffer.alloc(4);
  if (d === 'uint16') return regs[0]! & 0xffff;
  if (d === 'int16') return ((regs[0]! & 0xffff) << 16) >> 16;
  const [hi, lo] = wordOrder === 'big' ? [regs[0]!, regs[1]!] : [regs[1]!, regs[0]!];
  buf.writeUInt16BE(hi & 0xffff, 0);
  buf.writeUInt16BE(lo & 0xffff, 2);
  if (d === 'uint32') return buf.readUInt32BE(0);
  if (d === 'int32') return buf.readInt32BE(0);
  return buf.readFloatBE(0);
}

const words = (d: Decode) => (d === 'uint16' || d === 'int16' ? 1 : 2);

export class ModbusTcpDriver implements Driver {
  readonly id: string;
  private client = new ModbusRTU();
  private cache = new Map<string, Reading>();
  private connected = false;
  private polling = false;
  private lastOkMs = 0;

  constructor(private readonly opt: ModbusTcpOptions) {
    this.id = opt.id;
    this.client.setTimeout(opt.timeoutMs ?? 2000);
  }

  async connect() {
    if (this.connected) return;
    await this.client.connectTCP(this.opt.host, { port: this.opt.port ?? 502 });
    this.connected = true;
  }

  /** One polling pass over the point map. Call from the edge loop (async); `read` serves the latest values. */
  async poll(now = new Date()): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.connect();
      for (const p of this.opt.points) {
        this.client.setID(p.unitId);
        const n = words(p.decode);
        const res =
          p.type === 'holding'
            ? await this.client.readHoldingRegisters(p.register, n)
            : await this.client.readInputRegisters(p.register, n);
        const value = decode(res.data, p.decode, p.wordOrder) * (p.scale ?? 1);
        this.cache.set(p.pointId, { pointId: p.pointId, ts: now, value, source: this.id, quality: 'good' });
      }
      this.lastOkMs = now.getTime();
    } catch (e) {
      this.connected = false;
      try {
        this.client.close(() => {});
      } catch {
        /* already closed */
      }
      for (const [k, r] of this.cache) this.cache.set(k, { ...r, quality: 'stale' });
      throw e;
    } finally {
      this.polling = false;
    }
  }

  /** Close the TCP connection (probe and shutdown). */
  close(): Promise<void> {
    this.connected = false;
    return new Promise((r) => {
      try {
        this.client.close(() => r());
      } catch {
        r();
      }
    });
  }

  read(_now: Date): Reading[] {
    return [...this.cache.values()];
  }

  actuate(cmd: ActuateCommand, _now: Date): ActuateResult {
    const a = this.opt.actuations?.find((x) => x.assetId === cmd.assetId && x.action === cmd.action);
    if (!a) return { ok: false, detail: `no register mapped for ${cmd.assetId}/${cmd.action}` };
    this.client.setID(a.unitId);
    this.client
      .writeRegister(a.register, a.value)
      .catch((e: Error) => console.error(`modbus write failed: ${e.message}`));
    return { ok: true, detail: `write ${a.value} → unit ${a.unitId} reg ${a.register}` };
  }

  health(): 'ok' | 'degraded' | 'down' {
    const age = Date.now() - this.lastOkMs;
    return age < 30_000 ? 'ok' : age < 120_000 ? 'degraded' : 'down';
  }
}

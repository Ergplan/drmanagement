import { ServerTCP } from 'modbus-serial';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decode, ModbusTcpDriver } from '../src/modbus-tcp';

// A Modbus server simulator standing in for an LT panel meter (unit 1) and a heat-pump controller (unit 2).
const regs = new Map<string, number>();
const key = (unit: number, addr: number) => `${unit}:${addr}`;
function setFloat(unit: number, addr: number, v: number) {
  const b = Buffer.alloc(4);
  b.writeFloatBE(v, 0);
  regs.set(key(unit, addr), b.readUInt16BE(0));
  regs.set(key(unit, addr + 1), b.readUInt16BE(2));
}
let server: ServerTCP;
const PORT = 15020;

beforeAll(async () => {
  setFloat(1, 100, 312.5); // kW
  regs.set(key(1, 110), 940); // PF × 1000
  regs.set(key(2, 0), 1); // heat pump state
  server = new ServerTCP(
    {
      getHoldingRegister: (addr: number, unit: number) => regs.get(key(unit, addr)) ?? 0,
      getInputRegister: (addr: number, unit: number) => regs.get(key(unit, addr)) ?? 0,
      setRegister: (addr: number, value: number, unit: number) => {
        regs.set(key(unit, addr), value);
      },
    },
    { host: '127.0.0.1', port: PORT, unitID: 255 },
  );
  await new Promise((r) => setTimeout(r, 200));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('Modbus TCP driver', () => {
  it('decodes 16/32-bit and float registers in both word orders', () => {
    expect(decode([0xfffe], 'int16')).toBe(-2);
    expect(decode([0x0001, 0x0002], 'uint32')).toBe(65538);
    expect(decode([0x0002, 0x0001], 'uint32', 'little')).toBe(65538);
    expect(decode([0x439c, 0x4000], 'float32')).toBeCloseTo(312.5);
  });
  it('polls mapped points and writes an actuation register', async () => {
    const d = new ModbusTcpDriver({
      id: 'lt-panels',
      host: '127.0.0.1',
      port: PORT,
      points: [
        { pointId: 'lt-main.kw', unitId: 1, register: 100, type: 'holding', decode: 'float32' },
        { pointId: 'lt-main.pf', unitId: 1, register: 110, type: 'holding', decode: 'uint16', scale: 0.001 },
        { pointId: 'heatpumps.state', unitId: 2, register: 0, type: 'holding', decode: 'uint16' },
      ],
      actuations: [{ assetId: 'heatpump', action: 'shed', unitId: 2, register: 0, value: 0 }],
    });
    await d.poll(new Date());
    const r = Object.fromEntries(d.read(new Date()).map((x) => [x.pointId, x]));
    expect(r['lt-main.kw']!.value).toBeCloseTo(312.5);
    expect(r['lt-main.pf']!.value).toBeCloseTo(0.94);
    expect(r['heatpumps.state']!.source).toBe('lt-panels');
    expect(d.actuate({ assetId: 'heatpump', action: 'shed' }, new Date()).ok).toBe(true);
    await new Promise((res) => setTimeout(res, 200));
    expect(regs.get(key(2, 0))).toBe(0);
    expect(d.actuate({ assetId: 'chiller', action: 'shed' }, new Date()).ok).toBe(false);
    d.close();
  });
});

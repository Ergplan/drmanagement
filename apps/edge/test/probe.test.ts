import { ServerTCP } from 'modbus-serial';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probe } from '../src/probe';

const PORT = 15021;
let server: ServerTCP;
beforeAll(async () => {
  const regs: Record<number, number> = { 100: 0x439c, 101: 0x4000, 110: 940 };
  server = new ServerTCP(
    {
      getHoldingRegister: (a: number) => regs[a] ?? 0,
      getInputRegister: (a: number) => regs[a] ?? 0,
      setRegister: () => {},
    },
    { host: '127.0.0.1', port: PORT, unitID: 255 },
  );
  await new Promise((r) => setTimeout(r, 200));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('edge:probe', () => {
  it('reads every mapped point from a Modbus simulator', async () => {
    const r = await probe({
      driver: 'modbus-tcp',
      host: '127.0.0.1',
      port: PORT,
      map: {
        points: [
          { pointId: 'lt-main.kw', unitId: 1, register: 100, type: 'holding', decode: 'float32' },
          { pointId: 'lt-main.pf', unitId: 1, register: 110, type: 'holding', decode: 'uint16', scale: 0.001 },
        ],
      },
    });
    expect(r.missing).toEqual([]);
    expect(r.readings.find((x) => x.pointId === 'lt-main.kw')?.value).toBeCloseTo(312.5);
    expect(r.readings.find((x) => x.pointId === 'lt-main.pf')?.value).toBeCloseTo(0.94);
  });
  it('reads the example LT panel map file shape', async () => {
    await expect(probe({ driver: 'dlms', host: 'x', map: { points: [] } })).rejects.toThrow(/modbus-tcp/);
  });
});

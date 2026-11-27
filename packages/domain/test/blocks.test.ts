import { describe, expect, it } from 'vitest';
import { blockIndexIST, blockStartIST } from '../src/blocks';

describe('IST blocks', () => {
  it('00:00 IST is block 1', () => {
    expect(blockIndexIST(new Date('2026-11-26T18:30:00Z'))).toBe(1);
  });
  it('00:14:59 IST is still block 1', () => {
    expect(blockIndexIST(new Date('2026-11-26T18:44:59Z'))).toBe(1);
  });
  it('23:45 IST is block 96', () => {
    expect(blockIndexIST(new Date('2026-11-27T18:15:00Z'))).toBe(96);
  });
  it('14:30 IST is block 59', () => {
    expect(blockIndexIST(new Date('2026-11-27T09:00:00Z'))).toBe(59);
  });
  it('block start floors to the 15-minute boundary in IST', () => {
    expect(blockStartIST(new Date('2026-11-27T09:07:31Z')).toISOString()).toBe('2026-11-27T09:00:00.000Z');
  });
});

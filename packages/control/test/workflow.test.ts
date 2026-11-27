import { describe, expect, it } from 'vitest';
import { armDeadline, decide, effectiveStatus, type WorkflowEvent } from '../src/workflow';

const ev = (o: Partial<WorkflowEvent> = {}): WorkflowEvent => ({
  status: 'proposed',
  start: new Date('2026-11-27T12:00:00Z'),
  end: new Date('2026-11-27T14:30:00Z'),
  needsMedicalSuperintendent: false,
  armBy: '17:00',
  ...o,
});
const morning = new Date('2026-11-27T05:00:00Z');

describe('approval chain', () => {
  it('arm deadline is 17:00 IST on the event day', () => {
    expect(armDeadline(ev().start, '17:00').toISOString()).toBe('2026-11-27T11:30:00.000Z');
  });
  it('only the right role may take each step', () => {
    expect(decide(ev(), 'accounts', 'approve', morning).ok).toBe(false);
    expect(decide(ev(), 'duty_engineer', 'approve', morning).ok).toBe(false);
    expect(decide(ev(), 'facility_manager', 'approve', morning)).toEqual({ ok: true, status: 'approved' });
  });
  it('HVAC plans need the medical superintendent before arming', () => {
    const e = ev({ status: 'approved', needsMedicalSuperintendent: true });
    expect(decide(e, 'duty_engineer', 'arm', morning)).toEqual({
      ok: false,
      why: 'waiting for the medical superintendent',
    });
    expect(decide(e, 'medical_superintendent', 'sign', morning)).toEqual({ ok: true, status: 'signed' });
    expect(decide({ ...e, status: 'signed' }, 'duty_engineer', 'arm', morning)).toEqual({ ok: true, status: 'armed' });
  });
  it('non-HVAC plans arm straight after approval', () => {
    expect(decide(ev({ status: 'approved' }), 'duty_engineer', 'arm', morning).ok).toBe(true);
    expect(decide(ev({ status: 'approved' }), 'medical_superintendent', 'sign', morning).ok).toBe(false);
  });
  it('an event not armed by 17:00 lapses and cannot be armed', () => {
    const late = new Date('2026-11-27T11:31:00Z');
    expect(effectiveStatus(ev({ status: 'approved' }), late)).toBe('lapsed');
    expect(decide(ev({ status: 'approved' }), 'duty_engineer', 'arm', late).ok).toBe(false);
    expect(effectiveStatus(ev({ status: 'armed' }), late)).toBe('armed');
  });
  it('abort only for armed or running events', () => {
    expect(decide(ev({ status: 'running' }), 'duty_engineer', 'abort', morning).ok).toBe(true);
    expect(decide(ev({ status: 'proposed' }), 'duty_engineer', 'abort', morning).ok).toBe(false);
  });
});

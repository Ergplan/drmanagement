/**
 * DR event approval chain (reference/control.yaml `dr_event.approval_chain`):
 * ergOS proposes → facility manager approves → medical superintendent signs if the plan touches HVAC →
 * duty engineer arms by 17:00 IST on the event day. Unarmed events lapse. Pure state machine.
 */
export type EventStatus =
  | 'proposed'
  | 'approved'
  | 'signed'
  | 'armed'
  | 'running'
  | 'completed'
  | 'aborted'
  | 'lapsed'
  | 'rejected';
export type Decision = 'approve' | 'sign' | 'arm' | 'reject' | 'abort';

export interface WorkflowEvent {
  status: EventStatus;
  start: Date;
  end: Date;
  needsMedicalSuperintendent: boolean;
  armBy: string; // HH:MM IST
}

const IST_MS = 330 * 60000;
export function armDeadline(start: Date, armBy: string): Date {
  const d = new Date(start.getTime() + IST_MS);
  const [h, m] = armBy.split(':').map(Number);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h ?? 0, m ?? 0) - IST_MS);
}

const WHO: Record<Decision, string[]> = {
  approve: ['facility_manager'],
  sign: ['medical_superintendent'],
  arm: ['duty_engineer'],
  reject: ['facility_manager', 'medical_superintendent', 'duty_engineer'],
  abort: ['duty_engineer', 'facility_manager', 'medical_superintendent'],
};

/** Status an unarmed event should show now (lapses after the arming deadline). */
export function effectiveStatus(e: WorkflowEvent, now: Date): EventStatus {
  if (['proposed', 'approved', 'signed'].includes(e.status) && now >= armDeadline(e.start, e.armBy)) return 'lapsed';
  return e.status;
}

export function decide(
  e: WorkflowEvent,
  role: string,
  d: Decision,
  now: Date,
): { ok: true; status: EventStatus } | { ok: false; why: string } {
  if (!WHO[d].includes(role)) return { ok: false, why: `${d} needs ${WHO[d].join(' or ').replaceAll('_', ' ')}` };
  const st = effectiveStatus(e, now);
  if (st === 'lapsed') return { ok: false, why: `not armed by ${e.armBy}; the event lapsed` };
  switch (d) {
    case 'approve':
      return st === 'proposed' ? { ok: true, status: 'approved' } : { ok: false, why: `cannot approve a ${st} event` };
    case 'sign':
      if (!e.needsMedicalSuperintendent) return { ok: false, why: 'this plan has no HVAC action; no signature needed' };
      return st === 'approved' ? { ok: true, status: 'signed' } : { ok: false, why: `cannot sign a ${st} event` };
    case 'arm': {
      const ready = e.needsMedicalSuperintendent ? st === 'signed' : st === 'approved';
      if (!ready)
        return {
          ok: false,
          why:
            e.needsMedicalSuperintendent && st === 'approved'
              ? 'waiting for the medical superintendent'
              : `cannot arm a ${st} event`,
        };
      return { ok: true, status: 'armed' };
    }
    case 'reject':
      return ['proposed', 'approved', 'signed'].includes(st)
        ? { ok: true, status: 'rejected' }
        : { ok: false, why: `cannot reject a ${st} event` };
    case 'abort':
      return st === 'armed' || st === 'running'
        ? { ok: true, status: 'aborted' }
        : { ok: false, why: `nothing to abort in a ${st} event` };
  }
}

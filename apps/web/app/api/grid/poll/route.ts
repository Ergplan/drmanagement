import { actionHandler } from '@/lib/api';
import { pollVtn } from '@/lib/grid';

export const dynamic = 'force-dynamic';

/** Poll the OpenADR VTN now (the edge's housekeeping call also polls every 5 minutes). */
export const POST = actionHandler(async (_req, user) => pollVtn(user.id), ['facility_manager', 'joulewise_ops']);

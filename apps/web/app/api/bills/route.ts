import { getHandler } from '@/lib/api';
import { loadBills } from '@/lib/bills';

export const dynamic = 'force-dynamic';

export const GET = getHandler(loadBills);

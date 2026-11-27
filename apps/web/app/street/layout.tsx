import '@/styles/street.css';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function StreetLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <>{children}</>;
}

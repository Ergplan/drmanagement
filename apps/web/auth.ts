import { timingSafeEqual } from 'node:crypto';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

/**
 * Stage 0: demo accounts, one per role, all using DEMO_PASSWORD from the environment.
 * Stage 1 moves users to the database with argon2 hashes.
 */
export const ROLES = [
  'facility_manager',
  'medical_superintendent',
  'duty_engineer',
  'accounts',
  'joulewise_ops',
  'viewer',
] as const;
export type Role = (typeof ROLES)[number];

const DEMO: Record<string, { name: string; role: Role }> = {
  'fm@globe.demo': { name: 'Facility manager', role: 'facility_manager' },
  'ms@globe.demo': { name: 'Medical superintendent', role: 'medical_superintendent' },
  'de@globe.demo': { name: 'Duty engineer', role: 'duty_engineer' },
  'accounts@globe.demo': { name: 'Accounts', role: 'accounts' },
  'ops@joulewise.demo': { name: 'jouleWise operations', role: 'joulewise_ops' },
  'viewer@globe.demo': { name: 'Viewer', role: 'viewer' },
};

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: { label: 'Email' }, password: { label: 'Password', type: 'password' } },
      authorize: async (c) => {
        const email = String(c?.email ?? '')
          .toLowerCase()
          .trim();
        const password = String(c?.password ?? '');
        const demo = DEMO[email];
        const expected = process.env.DEMO_PASSWORD;
        if (!demo || !expected || !same(password, expected)) return null;
        return { id: email, email, name: demo.name, role: demo.role };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user && 'role' in user) token.role = (user as { role: Role }).role;
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) (session.user as { role?: unknown }).role = token.role;
      return session;
    },
  },
});

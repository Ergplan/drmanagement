import { timingSafeEqual } from 'node:crypto';
import { getDb, schema } from '@drm/db';
import { verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

/**
 * Users live in app_user (argon2 hashes) from Stage 1. Until DATABASE_URL is configured, the demo accounts below
 * accept DEMO_PASSWORD so the site can be opened before the VM database is connected.
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

async function fromDatabase(email: string, password: string) {
  const { db } = getDb();
  const [u] = await db.select().from(schema.appUser).where(eq(schema.appUser.email, email)).limit(1);
  if (!u || !u.active || !(await verify(u.passwordHash, password))) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role };
}

function fromDemo(email: string, password: string) {
  const demo = DEMO[email];
  const expected = process.env.DEMO_PASSWORD;
  if (!demo || !expected || !same(password, expected)) return null;
  return { id: email, email, name: demo.name, role: demo.role };
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
        if (!process.env.DATABASE_URL) return fromDemo(email, password);
        try {
          return await fromDatabase(email, password);
        } catch (e) {
          console.error('login lookup failed', e);
          return null;
        }
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

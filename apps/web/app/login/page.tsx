import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import styles from './login.module.css';

export const metadata = { title: 'Sign in · Energy Orchestration Centre' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  async function login(form: FormData) {
    'use server';
    try {
      await signIn('credentials', { email: form.get('email'), password: form.get('password'), redirectTo: '/' });
    } catch (e) {
      if (e instanceof AuthError) redirect('/login?error=1');
      throw e;
    }
  }
  return (
    <div className={`eoc eoc-stage ${styles.wrap}`}>
      <form action={login} className={`glass pad-l ${styles.card}`}>
        {/* biome-ignore lint/performance/noImgElement: static logos */}
        <img src="/joulewise-logo.svg" alt="jouleWise" width={150} />
        <div>
          <h1 className={styles.h1}>Energy Orchestration Centre</h1>
          <p className="note" style={{ margin: 0 }}>
            ergOS for Globe Medicare, Lucknow
          </p>
        </div>
        <label className={styles.field}>
          <span className="lbl">Email</span>
          <input name="email" type="email" autoComplete="username" required className={styles.input} />
        </label>
        <label className={styles.field}>
          <span className="lbl">Password</span>
          <input name="password" type="password" autoComplete="current-password" required className={styles.input} />
        </label>
        {error ? (
          <p className={styles.err} role="alert">
            That email and password did not match.
          </p>
        ) : null}
        <button type="submit" className="btn btn-green">
          Sign in
        </button>
        <div className={styles.foot}>
          {/* biome-ignore lint/performance/noImgElement: static logos */}
          <img src="/globe-healthcare-logo.png" alt="Globe Healthcare" height={30} />
          <span className="note">© 2026 jouleWise Advisory Services Pvt. Ltd. All rights reserved.</span>
        </div>
      </form>
    </div>
  );
}

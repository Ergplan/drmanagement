import Link from 'next/link';
import { NAV, type NavKey } from '@/lib/nav';
import { AskBox } from './AskBox';
import styles from './Sidebar.module.css';

/** Ported from design/canvas/Sidebar.dc.html. "Street view" is the new tab added after the canvas was approved. */
export function Sidebar({ active }: { active: NavKey }) {
  return (
    <nav className={`eoc ${styles.nav}`} aria-label="Energy Orchestration Centre">
      <div className={styles.brand}>
        {/* biome-ignore lint/performance/noImgElement: SVG logo, no optimisation needed */}
        <img src="/joulewise-logo.svg" alt="jouleWise" width={140} height={37} />
        <div className={styles.brandTitle}>Energy Orchestration Centre</div>
        <div className={styles.brandSub}>ergOS for Globe Medicare</div>
      </div>
      <div className={styles.items}>
        {NAV.map((it) => {
          const on = it.key === active;
          return (
            <Link
              key={it.key}
              href={it.href}
              aria-current={on ? 'page' : undefined}
              className={on ? `${styles.item} ${styles.on}` : styles.item}
            >
              <span aria-hidden="true" className={styles.dot} />
              {it.label}
              {'badge' in it && it.badge ? <span className={styles.badge}>{it.badge}</span> : null}
            </Link>
          );
        })}
      </div>
      <AskBox />
      <div className={styles.seq}>
        <div className={styles.askTitle}>Control sequence</div>
        <div className={styles.seqMain}>Observe · Predict · Optimise · Approve and verify</div>
        <div className={styles.seqNote}>
          The demand ceiling runs live. DR events stay simulation-only until the Hospital signs off.
        </div>
      </div>
      <div className={styles.copy}>© 2026 jouleWise Advisory Services Pvt. Ltd. All rights reserved.</div>
    </nav>
  );
}

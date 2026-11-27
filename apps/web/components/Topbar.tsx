import Link from 'next/link';
import { Clock } from './Clock';
import { LiveStatus } from './LiveStatus';
import styles from './Topbar.module.css';

/** Ported from design/canvas/Topbar.dc.html. Ceiling status and provenance come from /api/live/main. */
export function Topbar({ heading }: { heading: string }) {
  return (
    <header className={`eoc ${styles.bar}`}>
      <div className={styles.left}>
        <div className={styles.meta}>
          <Clock />
        </div>
        <h1 className={styles.h1}>{heading}</h1>
      </div>
      <div className={styles.right}>
        <div className={`glass ${styles.site}`}>
          {/* biome-ignore lint/performance/noImgElement: static logo */}
          <img src="/globe-healthcare-logo.png" alt="Globe Healthcare" height={36} />
          <div className={styles.siteText}>
            200 beds · A-4-5 Nirala Nagar, Lucknow, UP
            <br />
            MVVNL 9567-481-000 · HV-1 · 11 kV · 600 kVA
          </div>
        </div>
        <LiveStatus />
        <Link className="btn btn-green" href="/optimizer">
          Simulate event
        </Link>
      </div>
    </header>
  );
}

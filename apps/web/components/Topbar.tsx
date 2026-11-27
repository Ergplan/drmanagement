import Link from 'next/link';
import { Clock } from './Clock';
import styles from './Topbar.module.css';

/** Ported from design/canvas/Topbar.dc.html. Ceiling status and provenance come from the API from Stage 2. */
export function Topbar({
  heading,
  ceiling,
  simulated,
}: {
  heading: string;
  ceiling: string | null;
  simulated: boolean;
}) {
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
        {simulated ? <span className={`pill ${styles.sim}`}>Simulated data</span> : null}
        <div className={`pill ${ceiling ? 'pill-ok' : ''}`} style={{ minHeight: 44 }}>
          <span className="dot" style={{ background: ceiling ? '#2e9a55' : '#c3cbc5' }} />
          {ceiling ?? 'Ceiling · waiting for edge data'}
        </div>
        <Link className="btn btn-green" href="/optimizer">
          Simulate event
        </Link>
      </div>
    </header>
  );
}

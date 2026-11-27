import { ARRIVES, type NavKey, TITLES } from '@/lib/nav';
import { Placeholder } from './Placeholder';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Page frame shared by every screen: stage background, menu, top bar, working area. */
export function Screen({ active, children }: { active: NavKey; children?: React.ReactNode }) {
  return (
    <div className="eoc eoc-stage">
      <div className="eoc-side">
        <Sidebar active={active} />
      </div>
      <main className="eoc-main">
        <Topbar heading={TITLES[active]} ceiling={null} simulated={false} />
        {children ?? <Placeholder title={TITLES[active]} arrives={ARRIVES[active]} />}
      </main>
    </div>
  );
}

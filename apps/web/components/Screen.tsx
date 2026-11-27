import { ARRIVES, type NavKey, TITLES } from '@/lib/nav';
import { Placeholder } from './Placeholder';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Page frame shared by every screen: stage background, menu, top bar, working area. */
export function Screen({ active, title, children }: { active: NavKey; title?: string; children?: React.ReactNode }) {
  return (
    <div className="eoc eoc-stage">
      <div className="eoc-side">
        <Sidebar active={active} />
      </div>
      <main className="eoc-main">
        <Topbar heading={title ?? TITLES[active]} />
        {children ?? <Placeholder title={TITLES[active]} arrives={ARRIVES[active]} />}
      </main>
    </div>
  );
}

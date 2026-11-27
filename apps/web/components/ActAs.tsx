'use client';
import { useMe } from '@/lib/useMe';

const LABEL: Record<string, string> = {
  facility_manager: 'Facility manager',
  medical_superintendent: 'Medical superintendent',
  duty_engineer: 'Duty engineer',
  accounts: 'Accounts',
  joulewise_ops: 'jouleWise ops',
  viewer: 'Viewer',
};

/** Demo admin: choose which role to act as. Hidden for everyone else. */
export function ActAs() {
  const me = useMe() as { role: string; admin?: boolean } | undefined;
  if (!me?.admin) return null;
  return (
    <label className="pill" style={{ gap: 6 }}>
      Act as
      <select
        value={me.role}
        aria-label="Act as role"
        onChange={async (e) => {
          await fetch('/api/me/role', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: e.target.value }),
          });
          window.location.reload();
        }}
        style={{ border: 0, background: 'transparent', font: 'inherit', fontWeight: 700 }}
      >
        {Object.entries(LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

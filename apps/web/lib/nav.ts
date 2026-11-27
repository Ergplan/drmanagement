/** Menu items in the order work happens. `key` is used for the active state; `href` is the route. */
export const NAV = [
  { key: 'overview', label: 'Overview', href: '/' },
  { key: 'street', label: 'Street view', href: '/street', badge: 'New' },
  { key: 'live', label: 'Live energy', href: '/live' },
  { key: 'ceiling', label: 'Demand ceiling', href: '/ceiling' },
  { key: 'forecast', label: 'Demand forecast', href: '/forecast' },
  { key: 'flexibility', label: 'Load flexibility', href: '/flexibility' },
  { key: 'optimizer', label: 'DR optimizer', href: '/optimizer' },
  { key: 'dispatch', label: 'Dispatch plan', href: '/dispatch' },
  { key: 'thermal', label: 'HVAC & heat pumps', href: '/thermal' },
  { key: 'solar', label: 'Solar & backup', href: '/solar' },
  { key: 'tariff', label: 'Tariffs & cost', href: '/tariff' },
  { key: 'safety', label: 'Clinical safety', href: '/safety' },
  { key: 'reports', label: 'Reports & M&V', href: '/reports' },
] as const;

export type NavKey = (typeof NAV)[number]['key'];

export const TITLES: Record<NavKey, string> = {
  overview: 'Energy Orchestration Centre',
  street: 'Street view',
  live: 'Live energy',
  ceiling: 'Demand ceiling',
  forecast: 'Demand forecast',
  flexibility: 'Load flexibility',
  optimizer: 'DR optimizer',
  dispatch: 'Dispatch plan',
  thermal: 'HVAC & heat pumps',
  solar: 'Solar & backup',
  tariff: 'Tariffs & cost',
  safety: 'Clinical safety',
  reports: 'Reports & M&V',
};

/** Which stage brings each screen to life (shown on the placeholder until then). */
export const ARRIVES: Record<NavKey, string> = {
  overview: 'Stage 3',
  street: 'Stage 6',
  live: 'Stage 3',
  ceiling: 'Stage 4',
  forecast: 'Stage 3',
  flexibility: 'Stage 4',
  optimizer: 'Stage 4',
  dispatch: 'Stage 4',
  thermal: 'Stage 3',
  solar: 'Stage 3',
  tariff: 'Stage 3',
  safety: 'Stage 4',
  reports: 'Stage 5',
};

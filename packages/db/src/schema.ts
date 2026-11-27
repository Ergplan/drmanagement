/**
 * Permanent data model (Stage 1). Append-only tables are marked; triggers in migrations/0001_rules.sql enforce them.
 * reading_1m is a monthly-partitioned table created in SQL (drizzle has no partition DDL); its shape is mirrored here.
 */
import {
  bigint,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts('created_at').notNull().defaultNow();

export const drClass = pgEnum('dr_class', ['flexible', 'conditional', 'protected', 'critical', 'meter']);
export const quality = pgEnum('quality', ['good', 'estimated', 'stale', 'bad']);
export const roleEnum = pgEnum('role', [
  'facility_manager',
  'medical_superintendent',
  'duty_engineer',
  'accounts',
  'joulewise_ops',
  'viewer',
]);
export type Role = (typeof roleEnum.enumValues)[number];
export const eventStatus = pgEnum('event_status', [
  'proposed',
  'approved',
  'signed',
  'armed',
  'running',
  'completed',
  'aborted',
  'lapsed',
  'rejected',
]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const org = pgTable('org', { id: text('id').primaryKey(), name: text('name').notNull(), createdAt: created() });

export const site = pgTable('site', {
  id: text('id').primaryKey(),
  orgId: text('org_id')
    .notNull()
    .references(() => org.id),
  name: text('name').notNull(),
  publicBrand: text('public_brand'),
  address: text('address'),
  beds: integer('beds'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  facts: jsonb('facts').notNull().default({}),
  createdAt: created(),
});

export const connection = pgTable('connection', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  utility: text('utility').notNull(),
  account: text('account').notNull(),
  tariffCategory: text('tariff_category').notNull(),
  voltageKv: doublePrecision('voltage_kv').notNull(),
  sanctionedKva: doublePrecision('sanctioned_kva').notNull(),
  billingFloorKva: doublePrecision('billing_floor_kva').notNull(),
  mainMeter: text('main_meter'),
  createdAt: created(),
});

export const tariff = pgTable('tariff', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connection.id),
  category: text('category').notNull(),
  energyRatePerKvah: doublePrecision('energy_rate_per_kvah').notNull(),
  demandRatePerKvaMonth: doublePrecision('demand_rate_per_kva_month').notNull(),
  dutyPct: doublePrecision('duty_pct').notNull(),
  floorPct: doublePrecision('floor_pct').notNull(),
  excessSurcharge: doublePrecision('excess_surcharge').notNull(),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'),
  source: text('source'),
  createdAt: created(),
});

export const bill = pgTable('bill', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connection.id),
  label: text('label').notNull(),
  periodFrom: date('period_from').notNull(),
  periodTo: date('period_to').notNull(),
  kvah: doublePrecision('kvah').notNull(),
  kwh: doublePrecision('kwh'),
  billedKva: doublePrecision('billed_kva').notNull(),
  months: smallint('months').notNull().default(1),
  pf: doublePrecision('pf'),
  total: doublePrecision('total').notNull(),
  note: text('note'),
  createdAt: created(),
});

export const billLine = pgTable('bill_line', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  billId: text('bill_id')
    .notNull()
    .references(() => bill.id),
  kind: text('kind').notNull(), // energy | demand | fuel_adj | duty | other
  amount: doublePrecision('amount').notNull(),
});

export const billedDemandMonth = pgTable(
  'billed_demand_month',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connection.id),
    month: date('month').notNull(),
    kva: doublePrecision('kva').notNull(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.month] })],
);

export const floor = pgTable('floor', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  level: smallint('level').notNull(),
  name: text('name').notNull(),
  uses: jsonb('uses').notNull().default([]),
});

export const asset = pgTable('asset', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  name: text('name').notNull(),
  drClass: drClass('dr_class').notNull(),
  ratedFlexKw: doublePrecision('rated_flex_kw').notNull().default(0),
  limits: jsonb('limits').notNull().default({}),
  authority: text('authority'),
  interlock: text('interlock'),
  profile: jsonb('profile').notNull().default([]),
  createdAt: created(),
});

export const equipment = pgTable('equipment', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  assetId: text('asset_id')
    .notNull()
    .references(() => asset.id),
  name: text('name').notNull(),
  rating: text('rating'),
});

export const node = pgTable('node', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  floorId: text('floor_id')
    .notNull()
    .references(() => floor.id),
  assetId: text('asset_id').references(() => asset.id),
  title: text('title').notNull(),
  drClass: drClass('dr_class').notNull(),
  pos: jsonb('pos').notNull(), // [x, z] metres
  look: doublePrecision('look').notNull().default(0),
  driverLater: text('driver_later'),
  note: text('note'),
});

export const point = pgTable(
  'point',
  {
    id: text('id').primaryKey(), // e.g. chillers.kw
    nodeId: text('node_id').references(() => node.id),
    assetId: text('asset_id').references(() => asset.id),
    kind: text('kind').notNull(),
    unit: text('unit').notNull(),
    sourceDriver: text('source_driver').notNull().default('sim'),
    deviceRef: text('device_ref'),
    requiredFreshnessS: integer('required_freshness_s').notNull().default(120),
    min: doublePrecision('min'),
    max: doublePrecision('max'),
  },
  (t) => [index('point_node_idx').on(t.nodeId)],
);

export const device = pgTable('device', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  secretHash: text('secret_hash'),
  lastSeen: ts('last_seen'),
  version: text('version'),
  health: jsonb('health'),
  createdAt: created(),
});

/** Mirror of the partitioned table created in SQL. Primary key (point_id, ts). */
export const reading1m = pgTable(
  'reading_1m',
  {
    pointId: text('point_id').notNull(),
    ts: ts('ts').notNull(),
    value: doublePrecision('value').notNull(),
    source: text('source').notNull(),
    quality: quality('quality').notNull().default('good'),
  },
  (t) => [primaryKey({ columns: [t.pointId, t.ts] })],
);

/** Site main-meter and per-asset energy per IST block (rolled up at the edge with packages/domain). */
export const block15m = pgTable(
  'block_15m',
  {
    siteId: text('site_id')
      .notNull()
      .references(() => site.id),
    blockStart: ts('block_start').notNull(),
    blockNo: smallint('block_no').notNull(),
    kwh: doublePrecision('kwh').notNull(),
    kvah: doublePrecision('kvah').notNull(),
    kvarh: doublePrecision('kvarh').notNull().default(0),
    avgKva: doublePrecision('avg_kva').notNull(),
    maxKva: doublePrecision('max_kva').notNull(),
    solarKwh: doublePrecision('solar_kwh').notNull().default(0),
    assetKwh: jsonb('asset_kwh').notNull().default({}),
    source: text('source').notNull(),
    quality: quality('quality').notNull().default('good'),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.blockStart] })],
);

export const day1d = pgTable(
  'day_1d',
  {
    siteId: text('site_id')
      .notNull()
      .references(() => site.id),
    day: date('day').notNull(),
    kwh: doublePrecision('kwh').notNull(),
    kvah: doublePrecision('kvah').notNull(),
    mdKva: doublePrecision('md_kva').notNull(),
    solarKwh: doublePrecision('solar_kwh').notNull().default(0),
    costInr: doublePrecision('cost_inr'),
    assetKwh: jsonb('asset_kwh').notNull().default({}),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day] })],
);

export const interlock = pgTable('interlock', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  name: text('name').notNull(),
  limitText: text('limit_text').notNull(),
  pointId: text('point_id'),
  rule: jsonb('rule').notNull().default({}),
});

/** append-only */
export const interlockEvent = pgTable('interlock_event', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  interlockId: text('interlock_id')
    .notNull()
    .references(() => interlock.id),
  at: ts('at').notNull(),
  state: text('state').notNull(), // healthy | tripped | stale
  value: text('value'),
  createdAt: created(),
});

export const ceilingState = pgTable('ceiling_state', {
  siteId: text('site_id')
    .primaryKey()
    .references(() => site.id),
  armed: boolean('armed').notNull().default(true),
  stage: smallint('stage').notNull().default(0),
  projectedKva: doublePrecision('projected_kva'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const ceilingAction = pgTable('ceiling_action', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  at: ts('at').notNull(),
  stage: smallint('stage').notNull(),
  kind: text('kind').notNull(), // shed | restore | page
  assetId: text('asset_id'),
  projectedKva: doublePrecision('projected_kva').notNull(),
  createdAt: created(),
});

export const drProgram = pgTable('dr_program', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // internal_peak | discom | openadr
  noticeMin: integer('notice_min').notNull(),
  baselineMethod: text('baseline_method').notNull(), // x_of_y | day_matching | pre_event
  baselineParams: jsonb('baseline_params').notNull().default({}),
  paymentInrPerKw: doublePrecision('payment_inr_per_kw'),
  penaltyInrPerKw: doublePrecision('penalty_inr_per_kw'),
  active: boolean('active').notNull().default(true),
});

export const drEvent = pgTable('dr_event', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  programId: text('program_id')
    .notNull()
    .references(() => drProgram.id),
  start: ts('start').notNull(),
  end: ts('end').notNull(),
  targetKw: doublePrecision('target_kw').notNull(),
  nominationKw: doublePrecision('nomination_kw'),
  status: eventStatus('status').notNull().default('proposed'),
  plan: jsonb('plan').notNull().default({}),
  forecastPeakKva: doublePrecision('forecast_peak_kva'),
  plannedPeakKva: doublePrecision('planned_peak_kva'),
  createdBy: text('created_by').notNull(),
  /** where the event came from: ergos | manual | discom | openadr */
  source: text('source').notNull().default('ergos'),
  /** id in the source system (OpenADR event id, DISCOM notice number); unique per source */
  externalId: text('external_id'),
  createdAt: created(),
});

/** Grid signals received (OpenADR VEN, DISCOM email or manual entry), before and after they become events. */
export const gridSignal = pgTable(
  'grid_signal',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    siteId: text('site_id')
      .notNull()
      .references(() => site.id),
    source: text('source').notNull(), // openadr | discom_email | manual
    externalId: text('external_id').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    start: ts('start'),
    end: ts('end'),
    targetKw: doublePrecision('target_kw'),
    payload: jsonb('payload').notNull().default({}),
    eventId: text('event_id'),
    status: text('status').notNull(), // proposed | rejected | duplicate
    note: text('note'),
  },
  (t) => [uniqueIndex('grid_signal_source_ext_idx').on(t.source, t.externalId)],
);

/** One row per Ask ergOS call (invariant 8: read-only; logged for review). */
export const assistantCall = pgTable('assistant_call', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  userId: text('user_id').notNull(),
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  question: text('question').notNull(),
  answer: text('answer'),
  tools: jsonb('tools').notNull().default([]),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  ms: integer('ms'),
  error: text('error'),
  at: ts('at').notNull().defaultNow(),
});

/** Approved, executable plan steps that the edge pulls (invariant 2). */
export const drIntent = pgTable('dr_intent', {
  id: text('id').primaryKey(),
  eventId: text('event_id').references(() => drEvent.id),
  steps: jsonb('steps').notNull(), // [{at, assetId, action, params}]
  validUntil: ts('valid_until').notNull(),
  kind: text('kind').notNull().default('dr'), // dr | manual
  ackedAt: ts('acked_at'),
  ackResult: text('ack_result'),
  createdAt: created(),
});

/** append-only */
export const drEventLog = pgTable('dr_event_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  eventId: text('event_id')
    .notNull()
    .references(() => drEvent.id),
  at: ts('at').notNull(),
  kind: text('kind').notNull(),
  detail: jsonb('detail').notNull().default({}),
  createdAt: created(),
});

/** append-only */
export const approval = pgTable('approval', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  eventId: text('event_id')
    .notNull()
    .references(() => drEvent.id),
  role: roleEnum('role').notNull(),
  userId: text('user_id').notNull(),
  decision: text('decision').notNull(), // approve | sign | arm | reject | abort
  note: text('note'),
  at: ts('at').notNull().defaultNow(),
});

/** append-only; only the edge dispatcher writes results (invariant 2); trigger enforces invariant 1 */
export const command = pgTable(
  'command',
  {
    id: text('id').primaryKey(),
    siteId: text('site_id')
      .notNull()
      .references(() => site.id),
    assetId: text('asset_id')
      .notNull()
      .references(() => asset.id),
    action: text('action').notNull(),
    params: jsonb('params').notNull().default({}),
    reason: text('reason').notNull(), // ceiling | dr | schedule | restore | manual
    intentId: text('intent_id'),
    sentAt: ts('sent_at').notNull(),
    result: text('result').notNull(), // ok | refused | failed
    detail: text('detail'),
    supersedes: text('supersedes'),
    createdAt: created(),
  },
  (t) => [index('command_site_sent_idx').on(t.siteId, t.sentAt)],
);

export const nomination = pgTable('nomination', {
  eventId: text('event_id')
    .primaryKey()
    .references(() => drEvent.id),
  kw: doublePrecision('kw').notNull(),
  basis: text('basis'),
});

export const settlement = pgTable('settlement', {
  eventId: text('event_id')
    .primaryKey()
    .references(() => drEvent.id),
  method: text('method').notNull(),
  baseline: jsonb('baseline').notNull(),
  actual: jsonb('actual').notNull(),
  deliveredKw: doublePrecision('delivered_kw').notNull(),
  deliveredKwh: doublePrecision('delivered_kwh').notNull(),
  performancePct: doublePrecision('performance_pct').notNull(),
  valueInr: doublePrecision('value_inr').notNull(),
  avoidedTco2: doublePrecision('avoided_tco2').notNull(),
  computedAt: ts('computed_at').notNull().defaultNow(),
});

export const forecast = pgTable(
  'forecast',
  {
    siteId: text('site_id')
      .notNull()
      .references(() => site.id),
    runAt: ts('run_at').notNull(),
    blockStart: ts('block_start').notNull(),
    p10: doublePrecision('p10').notNull(),
    p50: doublePrecision('p50').notNull(),
    p90: doublePrecision('p90').notNull(),
    drivers: jsonb('drivers'),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.runAt, t.blockStart] })],
);

export const weather = pgTable(
  'weather',
  {
    siteId: text('site_id')
      .notNull()
      .references(() => site.id),
    at: ts('at').notNull(),
    tempC: doublePrecision('temp_c'),
    rhPct: doublePrecision('rh_pct'),
    ghiWm2: doublePrecision('ghi_wm2'),
    source: text('source').notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.at] })],
);

export const contact = pgTable('contact', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  role: roleEnum('role').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  channels: jsonb('channels').notNull().default(['in_app']),
});

/** append-only */
export const notification = pgTable('notification', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  channel: text('channel').notNull(),
  to: text('to').notNull(),
  template: text('template').notNull(),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull(),
  at: ts('at').notNull().defaultNow(),
});

export const report = pgTable('report', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  kind: text('kind').notNull(),
  periodFrom: date('period_from'),
  periodTo: date('period_to'),
  blobUrl: text('blob_url'),
  status: text('status').notNull().default('pending'), // pending | rendering | ready | failed
  params: jsonb('params').notNull().default({}),
  /** PDF bytes when Vercel Blob is not configured (data then stays in the VM database) */
  pdf: bytea('pdf'),
  error: text('error'),
  requestedBy: text('requested_by'),
  readyAt: ts('ready_at'),
  createdAt: created(),
});

export const opportunity = pgTable('opportunity', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  valueInr: doublePrecision('value_inr'),
  valueInrPerMonth: doublePrecision('value_inr_per_month'),
  status: text('status').notNull().default('found'),
  evidence: jsonb('evidence').notNull().default({}),
});

export const appUser = pgTable(
  'app_user',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: roleEnum('role').notNull(),
    siteId: text('site_id').references(() => site.id),
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex('app_user_email_idx').on(t.email)],
);

/** append-only */
export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  at: ts('at').notNull().defaultNow(),
});

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Local outbox so nothing is lost while the cloud or the internet is down (rule 11). Rows are deleted only after
 * the cloud acknowledges the batch that carried them.
 */
export class Outbox {
  private db: DatabaseSync;
  constructor(path = process.env.EDGE_BUFFER ?? new URL('../data/outbox.sqlite', import.meta.url).pathname) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`create table if not exists outbox (id integer primary key autoincrement, kind text not null, payload text not null, created integer not null);
      create index if not exists outbox_kind on outbox(kind, id);`);
  }
  push(kind: 'reading' | 'block' | 'day' | 'event', payload: unknown) {
    this.db
      .prepare('insert into outbox (kind, payload, created) values (?, ?, ?)')
      .run(kind, JSON.stringify(payload), Date.now());
  }
  pushMany(kind: 'reading' | 'block' | 'day' | 'event', payloads: unknown[]) {
    const st = this.db.prepare('insert into outbox (kind, payload, created) values (?, ?, ?)');
    this.db.exec('begin');
    for (const p of payloads) st.run(kind, JSON.stringify(p), Date.now());
    this.db.exec('commit');
  }
  /** Oldest rows of a kind, up to `limit`. */
  take(kind: string, limit: number): Array<{ id: number; payload: unknown }> {
    const rows = this.db
      .prepare('select id, payload from outbox where kind = ? order by id limit ?')
      .all(kind, limit) as Array<{ id: number; payload: string }>;
    return rows.map((r) => ({ id: Number(r.id), payload: JSON.parse(r.payload) }));
  }
  ack(ids: number[]) {
    if (!ids.length) return;
    const st = this.db.prepare('delete from outbox where id = ?');
    this.db.exec('begin');
    for (const id of ids) st.run(id);
    this.db.exec('commit');
  }
  size(): number {
    return Number((this.db.prepare('select count(*) as n from outbox').get() as { n: number }).n);
  }
}

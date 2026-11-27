import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * One edge process per site: a second copy would pull the same intents and double every command. Takes a pid
 * lock next to the outbox; a stale lock (its process gone) is replaced.
 */
export function singleInstance(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      const release = () => {
        try {
          if (readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path);
        } catch {
          /* already gone */
        }
      };
      process.on('exit', release);
      for (const sig of ['SIGINT', 'SIGTERM'] as const)
        process.on(sig, () => {
          release();
          process.exit(0);
        });
      return;
    } catch {
      const pid = Number(readFileSync(path, 'utf8'));
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = pid !== process.pid;
      } catch {
        alive = false;
      }
      if (alive) throw new Error(`another edge process (pid ${pid}) is running; refusing to start a second one`);
      unlinkSync(path);
    }
  }
}

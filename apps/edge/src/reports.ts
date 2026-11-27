/**
 * Report renderer: the edge pulls report jobs, prints each server-rendered page to A4 PDF with headless Chromium
 * (the playwright service in docker-compose.edge.yml, or a local Chrome), and returns the PDF. Outbound only.
 */
import { type Browser, chromium } from 'playwright-core';
import { signedHeaders } from './intents';
import type { UplinkConfig } from './uplink';

interface Job {
  id: string;
  kind: string;
  url: string;
}

async function browser(): Promise<Browser> {
  const ws = process.env.PDF_WS_ENDPOINT;
  if (ws) return chromium.connect(ws, { timeout: 30_000 });
  const exe = process.env.PDF_CHROME_PATH;
  if (exe) return chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  throw new Error('no PDF renderer configured (PDF_WS_ENDPOINT or PDF_CHROME_PATH)');
}

async function post(cfg: UplinkConfig, body: object) {
  const raw = JSON.stringify(body);
  const r = await fetch(new URL('/api/edge/reports/ack', cfg.cloudUrl), {
    method: 'POST',
    headers: signedHeaders(cfg, raw),
    body: raw,
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`report ack ${r.status}`);
}

export async function renderPending(cfg: UplinkConfig): Promise<number> {
  const r = await fetch(new URL('/api/edge/reports', cfg.cloudUrl), {
    headers: signedHeaders(cfg, ''),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`report jobs ${r.status}`);
  const { jobs } = (await r.json()) as { jobs: Job[] };
  if (!jobs.length) return 0;
  let b: Browser | null = null;
  try {
    b = await browser();
    for (const j of jobs) {
      try {
        const page = await b.newPage();
        await page.goto(j.url, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.waitForSelector('[data-report-ready]', { timeout: 30_000 });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate:
            '<div style="font-size:7pt;width:100%;text-align:right;padding-right:12mm;color:#4b6457">jouleWise ergOS · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        });
        await page.close();
        await post(cfg, { id: j.id, pdfBase64: Buffer.from(pdf).toString('base64') });
        console.log(`report ${j.id} (${j.kind}) rendered, ${Math.round(pdf.length / 1024)} kB`);
      } catch (e) {
        console.error(`report ${j.id} failed: ${(e as Error).message}`);
        await post(cfg, { id: j.id, error: (e as Error).message.slice(0, 500) }).catch(() => {});
      }
    }
  } catch (e) {
    for (const j of jobs) await post(cfg, { id: j.id, error: (e as Error).message.slice(0, 500) }).catch(() => {});
  } finally {
    await b?.close().catch(() => {});
  }
  return jobs.length;
}

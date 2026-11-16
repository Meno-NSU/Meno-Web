// Usage: node stop.mjs <outdir> <prefix> [mobile|desktop]
// The answer stopped by the person, with the mock gateway of ../webui-2026-11-15/tools:
// 1) stop during the knowledge-base search (no answer yet), 2) stop while the answer streams.
// Each case: the block collapsed, then opened; plus the text of the last answer.
import { launch, connect, mobile, desktop, ask, sleep } from '../webui-2026-11-15/tools/cdp.mjs';
import { mkdirSync, writeFileSync } from 'fs';

const [out, prefix, mode = 'desktop'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SITE = process.env.SITE || 'http://127.0.0.1:5199/';
const report = {};

const { proc, page } = await launch({ profile: `/tmp/meno-stop-profile-${prefix}-${mode}` });
try {
  const c = await connect(page);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  if (mode === 'mobile') await mobile(c); else await desktop(c);
  await c.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('meno.consentDecided','1'); localStorage.setItem('meno.arenaIntroSeen','1'); } catch {}`,
  });
  await c.send('Page.navigate', { url: SITE });
  for (let i = 0; i < 60; i++) { if (await c.evaluate("!!document.querySelector('textarea.chat-textarea')")) break; await sleep(250); }
  await sleep(800);

  const stop = () => c.evaluate(`(() => { const b = document.querySelector('.send-btn.stop'); if (!b) return false; b.click(); return true; })()`);
  const toBottom = () => c.evaluate(`(() => { const m = document.querySelector('.chat-messages'); m.style.scrollBehavior='auto'; m.scrollTop = m.scrollHeight; return 1; })()`);
  const openLast = () => c.evaluate(`(() => { const b = [...document.querySelectorAll('.agent-thinking-summary')].at(-1); if (b) b.click(); return !!b; })()`);
  const lastState = () => c.evaluate(`(() => {
    const w = [...document.querySelectorAll('.message-wrapper.assistant')].at(-1);
    if (!w) return null;
    return {
      header: w.querySelector('.agent-thinking-summary')?.innerText ?? null,
      notice: w.querySelector('.message-notice')?.innerText ?? null,
      spinners: w.querySelectorAll('.spinning').length,
      stages: [...w.querySelectorAll('.agent-stage-row')].map((r) => r.className + ' | ' + r.innerText),
      retry: !!w.querySelector('.retry-btn'),
    };
  })()`);

  // 1) Stopped during the knowledge-base search.
  await ask(c, 'Тест: стоп во время поиска');
  for (let i = 0; i < 40; i++) {
    if (await c.evaluate(`[...document.querySelectorAll('.agent-stage-row, .agent-thinking-block')].length > 0 && !!document.querySelector('.send-btn.stop')`)) break;
    await sleep(100);
  }
  await sleep(1200); // query_rewrite done, retrieval running
  report.stop1 = await stop();
  await sleep(600);
  await toBottom();
  await sleep(300);
  await c.shot(`${out}/${prefix}-${mode}-1-search-stopped.png`);
  await openLast();
  await sleep(500);
  await toBottom();
  await sleep(300);
  await c.shot(`${out}/${prefix}-${mode}-2-search-stopped-open.png`);
  report.search = await lastState();

  // 2) Stopped while the answer streams (generation stage running).
  await ask(c, 'Тест: долго');
  await sleep(4500);
  report.stop2 = await stop();
  await sleep(600);
  await toBottom();
  await sleep(300);
  await c.shot(`${out}/${prefix}-${mode}-3-answer-stopped.png`);
  await openLast();
  await sleep(500);
  await c.evaluate(`(() => { const b = [...document.querySelectorAll('.agent-thinking-block')].at(-1); b?.scrollIntoView({ block: 'start' }); return 1; })()`);
  await sleep(300);
  await c.shot(`${out}/${prefix}-${mode}-4-answer-stopped-open.png`);
  report.answer = await lastState();
} finally {
  writeFileSync(`${out}/${prefix}-${mode}.json`, JSON.stringify(report, null, 1));
  proc.kill('SIGTERM');
}
console.log('done', out, prefix, mode);

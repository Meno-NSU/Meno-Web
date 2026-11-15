// Usage: node scenario.mjs <outdir> [mobile|desktop]
import { launch, connect, mobile, desktop, ask, sleep } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'fs';

const out = process.argv[2];
const mode = process.argv[3] || 'mobile';
mkdirSync(out, { recursive: true });
const URL_ = process.env.SITE || 'http://127.0.0.1:5199/';
const report = {};

const { proc, page } = await launch({ profile: out + '/profile' });
try {
  const c = await connect(page);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  if (mode === 'mobile') await mobile(c); else await desktop(c);
  await c.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('meno.consentDecided','1'); localStorage.setItem('meno.arenaIntroSeen','1'); } catch {}`,
  });
  await c.send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 40; i++) { if (await c.evaluate("!!document.querySelector('textarea.chat-textarea')")) break; await sleep(250); }
  await sleep(800);
  await c.shot(`${out}/01-empty.png`);
  report.logo = await c.evaluate(`(() => {
    const img = document.querySelector('.empty-chat-mark'); const h = document.querySelector('.empty-chat-hero h2');
    if (!img || !h) return null;
    const a = img.getBoundingClientRect(), b = h.getBoundingClientRect();
    return { img: [a.left, a.top, a.width, a.height].map(Math.round), h2: [b.left, b.top, b.width, b.height].map(Math.round), vw: innerWidth };
  })()`);

  // Normal answer: sample layout while streaming to measure jitter.
  await ask(c, 'Есть ли в НГУ спорткомплекс?');
  const samples = [];
  const t0 = Date.now();
  let midShot = false;
  while (Date.now() - t0 < 16000) {
    const s = await c.evaluate(`(() => {
      const m = document.querySelector('.chat-messages');
      const last = [...document.querySelectorAll('.message-wrapper.assistant')].at(-1);
      const r = last ? last.getBoundingClientRect() : null;
      return { t: performance.now(), st: m ? Math.round(m.scrollTop) : null, sh: m ? m.scrollHeight : null, ch: m ? m.clientHeight : null,
        top: r ? Math.round(r.top) : null, h: r ? Math.round(r.height) : null,
        copyVisible: !!(last && last.querySelector('.copy-btn')), streaming: !!document.querySelector('.agent-thinking-icon.spinning') };
    })()`);
    samples.push(s);
    if (!midShot && s.h > 300) { await c.shot(`${out}/02-streaming.png`); midShot = true; }
    await sleep(100);
  }
  report.samples = samples;
  await c.shot(`${out}/03-answer.png`);
  report.overflow = await c.evaluate(`(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; })
      .slice(0, 12).map(e => e.tagName.toLowerCase() + '.' + [...e.classList].join('.') + ' right=' + Math.round(e.getBoundingClientRect().right));
    return { vw, docScrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth,
      docScrollH: document.documentElement.scrollHeight, vh: innerHeight, wide };
  })()`);
  // Scroll messages to the bottom for the sources view.
  await c.evaluate(`(() => { const m = document.querySelector('.chat-messages'); m.style.scrollBehavior='auto'; m.scrollTop = m.scrollHeight; return 1; })()`);
  await sleep(300);
  await c.shot(`${out}/04-sources.png`);
  report.sourceRows = await c.evaluate(`(() => [...document.querySelectorAll('.sources-list > li')].map(li => {
    const icon = li.querySelector('.sources-link-icon'); const a = li.querySelector('a, .source-group-title');
    if (!icon || !a) return null; const i = icon.getBoundingClientRect(), t = a.getBoundingClientRect();
    return { iconMid: Math.round(i.top + i.height / 2), textTop: Math.round(t.top), textMid: Math.round(t.top + t.height / 2), textH: Math.round(t.height) };
  }))()`);

  await c.evaluate(`(() => { const b = [...document.querySelectorAll('.source-group-head')].at(-1); if (b) b.click(); return 1; })()`);
  await sleep(300);
  await c.evaluate(`(() => { const m = document.querySelector('.chat-messages'); m.scrollTop = m.scrollHeight; return 1; })()`);
  await sleep(300);
  await c.shot(`${out}/04b-sources-open.png`);
  // Dislike -> comment box focus.
  const fb = await c.evaluate(`(() => { const b = [...document.querySelectorAll('.feedback-btn.down')].at(-1); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
  await sleep(800);
  report.feedback = { fb, ...(await c.evaluate(`(() => {
    const ta = document.querySelector('.feedback-comment-input'); if (!ta) return { ta: false };
    ta.focus(); const cs = getComputedStyle(ta); return { ta: true, fontSize: cs.fontSize };
  })()`)) };
  await sleep(300);
  await c.shot(`${out}/05-feedback.png`);

  report.overflowAfterFeedback = await c.evaluate(`(() => { const m = document.querySelector('.chat-messages'); return { sw: m.scrollWidth, cw: m.clientWidth, docW: document.documentElement.scrollWidth }; })()`);
  // Error scenario.
  await ask(c, 'Тест: ошибка');
  await sleep(2500);
  await c.evaluate(`(() => { const m = document.querySelector('.chat-messages'); m.style.scrollBehavior='auto'; m.scrollTop = m.scrollHeight; return 1; })()`);
  await sleep(300);
  await c.shot(`${out}/06-error.png`);
  await c.evaluate(`(() => { const b = [...document.querySelectorAll('.agent-thinking-summary')].at(-1); if (b) b.click(); return 1; })()`);
  await sleep(400);
  await c.evaluate(`(() => { const m = document.querySelector('.chat-messages'); m.scrollTop = m.scrollHeight; return 1; })()`);
  await sleep(300);
  await c.shot(`${out}/07-error-open.png`);
  report.errorText = await c.evaluate(`(() => { const w = [...document.querySelectorAll('.message-wrapper.assistant')].at(-1); return w ? w.innerText : null; })()`);

  // Model picker.
  await c.evaluate(`(() => { const b = document.querySelector('.model-dropdown-trigger'); if (b) b.click(); return !!b; })()`);
  await sleep(600);
  await c.shot(`${out}/08-picker.png`);
  report.picker = await c.evaluate(`(() => { const m = document.querySelector('.model-dropdown-menu'); return m ? m.innerText : null; })()`);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  proc.kill('SIGTERM');
}
console.log('done', out);

import { launch, connect, mobile, ask, sleep } from './cdp.mjs';
import { writeFileSync } from 'fs';
const out = process.argv[2];
const { proc, page } = await launch({ profile: out + '/profile-j' });
try {
  const c = await connect(page);
  await c.send('Page.enable'); await mobile(c);
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('meno.consentDecided','1'); localStorage.setItem('meno.arenaIntroSeen','1'); } catch {}` });
  await c.send('Page.navigate', { url: process.env.SITE || 'http://127.0.0.1:5199/' });
  for (let i = 0; i < 40; i++) { if (await c.evaluate("!!document.querySelector('textarea.chat-textarea')")) break; await sleep(250); }
  await sleep(800);
  // rAF trace of the reasoning header height and the answer text top.
  await c.evaluate(`(() => { window.__tr = []; const f = () => {
    const h = [...document.querySelectorAll('.agent-thinking-summary')].at(-1);
    const md = [...document.querySelectorAll('.message-markdown')].at(-1);
    const u = [...document.querySelectorAll('.message-wrapper.user')].at(-1);
    window.__tr.push([Math.round(performance.now()), h ? Math.round(h.getBoundingClientRect().height) : -1, md ? Math.round(md.getBoundingClientRect().top) : -1, u ? Math.round(u.getBoundingClientRect().top) : -1]);
    requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
  await ask(c, 'долго: есть ли спорткомплекс');
  await sleep(20000);
  const tr = await c.evaluate('window.__tr');
  writeFileSync(out + '/jitter.json', JSON.stringify(tr));
  let prev = null, changes = [];
  for (const [t, hh, mdTop, uTop] of tr) { const k = hh + ',' + mdTop + ',' + uTop; if (k !== prev) changes.push([t, hh, mdTop, uTop]); prev = k; }
  console.log('frames', tr.length, 'changes', changes.length);
  console.log(JSON.stringify(changes.slice(0, 80)));
} finally { proc.kill('SIGTERM'); }

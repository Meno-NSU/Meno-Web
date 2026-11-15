import { launch, connect, mobile, desktop, sleep } from './cdp.mjs';
const out = process.argv[2];
const { proc, page } = await launch({ profile: out + '/profile-p' });
try {
  const c = await connect(page);
  await c.send('Page.enable');
  if (process.argv[3] === 'desktop') await desktop(c); else await mobile(c);
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('meno.consentDecided','1'); localStorage.setItem('meno.arenaIntroSeen','1'); } catch {}` });
  await c.send('Page.navigate', { url: process.env.SITE || 'http://127.0.0.1:5199/' });
  for (let i = 0; i < 40; i++) { if (await c.evaluate("!!document.querySelector('textarea.chat-textarea')")) break; await sleep(250); }
  await sleep(800);
  await c.evaluate(`document.querySelector('.model-dropdown-trigger').click(), 1`);
  await sleep(500);
  await c.evaluate(`(() => { const r = [...document.querySelectorAll('.model-dropdown-menu button')].find(b => b.textContent.includes('Менон 1.0')); r && r.click(); return !!r; })()`);
  await sleep(500);
  console.log(await c.evaluate(`document.querySelector('.model-dropdown-menu')?.innerText`));
  await c.shot(out + '/09-picker-menon10.png');
} finally { proc.kill('SIGTERM'); }

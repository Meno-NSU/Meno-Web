// Usage: node feedback.mjs <outdir> <prefix> [mobile|desktop] [light|dark]
// Every way to rate Menon, with the mock gateway of ../webui-2026-11-15/tools (its /mock/state
// makes the feedback writes fail or wait): 👍 on an answer, a comment, the end-of-session
// survey, an arena vote. Each: the failed send, the send in flight, the confirmed send.
// Works on the code before and after the change: where there is no «Повторить», the control
// itself is pressed again. Writes <prefix>-<mode>[-dark].json with what each step showed and
// everything the mock received (to count duplicate sends).
import { launch, connect, mobile, desktop, ask, sleep } from '../webui-2026-11-15/tools/cdp.mjs';
import { mkdirSync, writeFileSync } from 'fs';

const [out, prefix, mode = 'desktop', theme = 'light'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const SITE = process.env.SITE || 'http://127.0.0.1:5199/';
const MOCK = process.env.MOCK || 'http://127.0.0.1:9906';
const tag = `${prefix}-${mode}${theme === 'dark' ? '-dark' : ''}`;
const report = { steps: {} };

const mock = (state) => fetch(`${MOCK}/mock/state`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state),
});

const PROFILES = process.env.PROFILES || '/tmp/meno-feedback-profiles';
const { proc, page } = await launch({ profile: `${PROFILES}/${tag}` });
try {
  const c = await connect(page);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  if (mode === 'mobile') await mobile(c); else await desktop(c);
  // The survey opens for 1 dialogue in 10 (Math.random); `__forceSurvey` makes the next draw win.
  await c.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('meno.consentDecided','1'); localStorage.setItem('meno.arenaIntroSeen','1');
      localStorage.setItem('theme', ${JSON.stringify(theme)}); } catch {}
      (() => { const r = Math.random; Math.random = function () { return window.__forceSurvey ? 0.01 : r.call(Math); }; })();`,
  });
  await mock({ fail: false, delayMs: 0 });
  await fetch(`${MOCK}/mock/log`, { method: 'DELETE' });
  await c.send('Page.navigate', { url: SITE });
  for (let i = 0; i < 80; i++) { if (await c.evaluate("!!document.querySelector('textarea.chat-textarea')")) break; await sleep(250); }
  await sleep(800);

  const LAST = `[...document.querySelectorAll('.message-wrapper.assistant')].at(-1)`;
  const exists = (expr) => c.evaluate(`!!(${expr})`);
  // Bring an element to the middle of the chat and press it: real mouse events on the desktop
  // (so the hover-only actions bar is shown as a person would see it), a tap on the phone.
  const press = async (expr) => {
    const p = await c.evaluate(`(() => { const e = ${expr}; if (!e) return null;
      const m = document.querySelector('.chat-messages'); if (m) m.style.scrollBehavior = 'auto';
      e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    if (!p) return false;
    await sleep(150);
    if (mode === 'mobile') {
      await c.evaluate(`(${expr}).click()`);
    } else {
      const [x, y] = p;
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    return true;
  };
  // Park the mouse on the answer text: the actions bar stays shown, no tooltip covers it.
  const park = async () => {
    if (mode === 'mobile') return;
    const p = await c.evaluate(`(() => { const e = ${LAST}?.querySelector('.message-markdown'); if (!e) return null;
      const r = e.getBoundingClientRect(); return [r.left + 40, Math.min(r.bottom - 10, innerHeight - 200)]; })()`);
    if (p) await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] });
  };
  // Scroll the chat so the bottom of the element sits a bit below the middle of the screen.
  const centre = (expr) => c.evaluate(`(() => { const e = ${expr}; if (!e) return false;
    const m = document.querySelector('.chat-messages'); if (!m) return false; m.style.scrollBehavior = 'auto';
    m.scrollTop += e.getBoundingClientRect().bottom - innerHeight * ${mode === 'mobile' ? 0.62 : 0.68}; return true; })()`);
  const typeInto = (expr, text) => c.evaluate(`(() => { const ta = ${expr}; if (!ta) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  // Two shots per state: the whole screen into full/, and the band around the control (the
  // part of the answer above it and what is under it) for the report. `modal`: the band is the
  // survey card, nothing scrolls.
  const snap = async (n, name, focus, { modal = false } = {}) => {
    if (focus && !modal) await centre(focus);
    await sleep(250);
    mkdirSync(`${out}/full`, { recursive: true });
    await c.shot(`${out}/full/${tag}-${n}-${name}.png`);
    const clip = focus ? await c.evaluate(`(() => { const e = ${focus}; if (!e) return null;
      const r = e.getBoundingClientRect();
      const left = ${modal} ? 0 : Math.max(0, document.querySelector('.main-content')?.getBoundingClientRect().left ?? 0);
      const top = Math.max(0, ${modal} ? r.top - 40 : r.bottom - ${mode === 'mobile' ? 430 : 340});
      const bottom = Math.min(innerHeight, r.bottom + ${modal ? 40 : 60});
      return { x: left, y: top, width: innerWidth - left, height: bottom - top, scale: 1 }; })()`) : null;
    await c.shot(`${out}/${tag}-${n}-${name}.png`, clip ? { clip } : {});
  };
  const state = (scope) => c.evaluate(`(() => { const w = ${scope}; if (!w) return null;
    const q = (s) => [...w.querySelectorAll(s)].map((e) => e.innerText.trim()).filter(Boolean);
    return {
      status: q('.feedback-status'), errors: q('.feedback-error, [role=alert]'),
      activeThumbs: [...w.querySelectorAll('.feedback-btn.active')].map((b) => b.getAttribute('aria-label')),
      savingThumbs: w.querySelectorAll('.feedback-btn.saving').length, busy: w.querySelectorAll('[aria-busy=true]').length,
      commentBox: !!w.querySelector('.feedback-comment-input'),
      voteButtons: w.querySelectorAll('.vote-btn').length,
      survey: !!document.querySelector('.survey-card'), surveyText: document.querySelector('.survey-card')?.innerText ?? null,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }; })()`);
  const step = async (name, scope = LAST) => { report.steps[name] = await state(scope); };
  const waitFor = async (expr, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await exists(expr)) return true; await sleep(150); }
    return false;
  };
  const retryOr = async (fallback) => {
    if (await exists(`${LAST}?.querySelector('.feedback-status-retry') || document.querySelector('.survey-card .feedback-status-retry')`)) {
      return press(`${LAST}?.querySelector('.feedback-status-retry') || document.querySelector('.survey-card .feedback-status-retry')`);
    }
    return press(fallback);
  };
  const FOOTER = `${LAST}?.querySelector('.message-footer')`;
  const THUMB_UP = `${LAST}?.querySelector('.feedback-btn:not(.down)')`;

  // ── 1. 👍 on an answer ──
  await ask(c, 'Есть ли в НГУ спорткомплекс?');
  await waitFor(THUMB_UP);
  await sleep(500);
  await mock({ fail: true, delayMs: 300 });
  await press(THUMB_UP);
  await sleep(900);
  await park();
  await snap('01', 'thumb-error', FOOTER);
  await step('thumbError');

  await mock({ fail: false, delayMs: 2500 });
  await retryOr(THUMB_UP);
  await sleep(700);
  await park();
  await snap('02', 'thumb-pending', FOOTER);
  await step('thumbPending');
  await sleep(2300);
  await park();
  await snap('03', 'thumb-sent', FOOTER);
  await step('thumbSent');

  // ── 2. A comment on the rated answer ──
  const BOX = `${LAST}?.querySelector('.feedback-comment-input')`;
  const SEND = `${LAST}?.querySelector('.feedback-comment-send')`;
  await mock({ fail: true, delayMs: 300 });
  await typeInto(BOX, 'Хорошо, но не хватает часов работы бассейна по выходным.');
  await sleep(200);
  await press(SEND);
  await sleep(900);
  await park();
  await snap('04', 'comment-error', FOOTER);
  await step('commentError');

  await mock({ fail: false, delayMs: 2500 });
  await retryOr(SEND);
  await sleep(700);
  await park();
  await snap('05', 'comment-pending', FOOTER);
  await step('commentPending');
  await sleep(2300);
  await park();
  await snap('06', 'comment-sent', FOOTER);
  await step('commentSent');

  // ── 3. End-of-session survey (opens on leaving the answered chat) ──
  await mock({ fail: true, delayMs: 300 });
  await c.evaluate('window.__forceSurvey = true');
  await c.evaluate(`document.querySelector('.new-chat-btn-icon').click()`);
  const surveyShown = await waitFor(`document.querySelector('.survey-card')`, 4000);
  await c.evaluate('window.__forceSurvey = false');
  report.surveyShown = surveyShown;
  await press(`document.querySelector('.survey-answer.yes')`);
  await sleep(900);
  await snap('07', 'survey-error', `document.querySelector('.survey-card')`, { modal: true });
  await step('surveyError', 'document.body');
  if (await exists(`document.querySelector('.survey-card')`)) {
    await mock({ fail: false, delayMs: 2500 });
    await retryOr(`document.querySelector('.survey-answer.yes')`);
    await sleep(700);
    await snap('08', 'survey-pending', `document.querySelector('.survey-card')`, { modal: true });
    await step('surveyPending', 'document.body');
    await sleep(2300);
    await snap('09', 'survey-sent', `document.querySelector('.survey-card')`, { modal: true });
    await step('surveySent', 'document.body');
    await sleep(3500);
    await step('surveyAfter', 'document.body');
  }

  // ── 4. Arena vote ──
  await mock({ fail: false, delayMs: 0 });
  await c.evaluate(`(document.querySelector('.arena-toggle') || document.querySelector('.sidebar-action-btn.arena')).click()`);
  await sleep(400);
  await ask(c, 'Где в НГУ поплавать?');
  const ARENA = `[...document.querySelectorAll('.message-wrapper.assistant.arena')].at(-1)`;
  const VOTE = process.env.VOTE === 'a'
    ? `${ARENA}?.querySelector('.vote-btn-primary')`
    : `${ARENA}?.querySelector('.vote-btn-secondary')`;
  report.arenaReady = await waitFor(VOTE, 30000);
  await sleep(500);
  // The bottom of the round: under it the vote buttons (or what replaced them) end.
  const ARENA_BOTTOM = ARENA;
  await mock({ fail: true, delayMs: 300 });
  await press(VOTE);
  await sleep(900);
  await snap('10', 'arena-error', ARENA_BOTTOM);
  await step('arenaError', ARENA);

  await mock({ fail: false, delayMs: 2500 });
  await retryOr(VOTE);
  await sleep(700);
  await snap('11', 'arena-pending', ARENA_BOTTOM);
  await step('arenaPending', ARENA);
  await sleep(2300);
  await snap('12', 'arena-sent', ARENA_BOTTOM);
  await step('arenaSent', ARENA);

  report.mockLog = await (await fetch(`${MOCK}/mock/log`)).json();
} finally {
  await mock({ fail: false, delayMs: 0 }).catch(() => {});
  writeFileSync(`${out}/${tag}.json`, JSON.stringify(report, null, 1));
  proc.kill('SIGTERM');
}
console.log('done', out, tag);

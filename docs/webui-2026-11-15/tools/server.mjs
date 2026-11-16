// Mock Meno gateway for UI checks: real prod GET payloads + scripted chat streams.
// Question text picks the scenario: contains "ошибка" -> prepare-stage failure;
// "долго" -> slow long answer; "стоп" -> knowledge-base search that never ends (to stop it);
// anything else -> normal answer with long links.
// Feedback writes (👍/👎, comment, survey, arena vote) answer {status: ok}; POST /mock/state
// (straight to :9906, not through the site) sets {fail, delayMs} for them — fail -> HTTP 500 —
// and GET /mock/log lists what they received (to count duplicates).
import express from 'express'; // run with NODE_PATH or from a Meno-Web checkout
import { readFileSync } from 'fs';

const DIR = new URL('.', import.meta.url).pathname;
const body = (name) => {
  const raw = readFileSync(DIR + name, 'utf8').trim().split('\n');
  raw.pop(); // trailing http code line
  return JSON.parse(raw.join('\n'));
};
const models = body('models.json');
// One extra model that the backend reports as unreachable (the meno-lite case).
models.data.unshift({
  id: 'meno-lite', object: 'model', provider: 'vllm', owned_by: 'vllm', featured: false,
  stages: ['rewrite', 'rerank', 'generation'],
  status: { state: process.env.LITE_STATE || 'unreachable', until: null, last_error: 'connect refused' },
  display_name: 'meno-lite',
});
const kbs = body('knowledge-bases.json');
const legal = body('legal_documents.json');

const app = express();
app.use(express.json());
app.get('/v1/models', (_q, r) => r.json(models));
app.post('/v1/models/refresh', (_q, r) => r.json(models));
app.get('/v1/knowledge-bases', (_q, r) => r.json(kbs));
app.get('/v1/status', (_q, r) => r.json({ active_requests: 0, limit: 128 }));
app.get('/v1/legal/documents', (_q, r) => r.json(legal));
app.get('/v1/auth/me', (_q, r) => r.status(401).json({ detail: 'Not authenticated.' }));
app.post('/v1/guest/session', (_q, r) => r.json({ guest_token: 'mock-guest' }));
const feedbackState = { fail: false, delayMs: 0 };
const feedbackLog = [];
app.post('/mock/state', (q, r) => { Object.assign(feedbackState, q.body || {}); r.json(feedbackState); });
app.get('/mock/log', (_q, r) => r.json(feedbackLog));
app.delete('/mock/log', (_q, r) => { feedbackLog.length = 0; r.json({ status: 'ok' }); });
const feedbackWrite = (extra = {}) => async (q, r) => {
  feedbackLog.push({ path: q.path, body: q.body, fail: feedbackState.fail, at: Date.now() });
  if (feedbackState.delayMs) await new Promise((res) => setTimeout(res, feedbackState.delayMs));
  if (feedbackState.fail) return r.status(500).json({ detail: 'mock: feedback write failed' });
  r.json({ status: 'ok', ...extra });
};
app.post('/v1/feedback', feedbackWrite());
app.post('/v1/feedback/clear', feedbackWrite({ removed: true }));
app.post('/v1/feedback/survey', feedbackWrite());
app.post('/v1/arena/vote', feedbackWrite({ duplicate: false }));
app.post('/v1/arena/turn', (_q, r) => r.json({ status: 'ok', stored: true }));
app.post('/v1/chat/completions/clear_history', (_q, r) => r.json({ status: 'ok' }));

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const ANSWER = `Да, в НГУ есть спортивный комплекс. Он находится по адресу ул. Пирогова, 12 и открыт для студентов и сотрудников.

## Что там есть
- **Бассейн** — 25 м, 6 дорожек; запись через [личный кабинет](https://www.nsu.ru/n/physical-education-department/sport-complex/swimming-pool-schedule-and-rules-for-students-and-staff-2026/).
- **Игровые залы** — волейбол, баскетбол, мини-футбол.
- **Тренажёрный зал** — по абонементу.

| Секция | Дни | Время |
|---|---|---|
| Плавание | Пн, Ср, Пт | 18:00–21:00 |
| Волейбол | Вт, Чт | 19:00–21:00 |
| Очень-длинное-название-секции-без-пробелов-для-проверки-переноса | Сб | 10:00–12:00 |

Подробности: https://www.nsu.ru/n/physical-education-department/sport-complex/very-long-path/with/many/segments/index.php?lang=ru&tab=schedule

\`\`\`
расписание_бассейна_на_осенний_семестр_2026_года_версия_окончательная_и_утверждённая.pdf
\`\`\``;
const SOURCES = [
  { document_title: 'Спортивный комплекс НГУ', source_url: 'https://www.nsu.ru/n/physical-education-department/sport-complex/' },
  { document_title: '', source_url: 'https://www.nsu.ru/n/physical-education-department/sport-complex/swimming-pool-schedule-and-rules-for-students-and-staff-2026/index.php?print=Y' },
  { document_title: 'Кафедра физического воспитания НГУ — расписание занятий, секции, правила посещения бассейна и тренажёрного зала', source_url: 'https://www.nsu.ru/n/physical-education-department/' },
  { document_title: 'Сводка: спорт в НГУ', source_url: 'https://www.nsu.ru/n/physical-education-department/sport-complex/' },
  { document_title: 'Сводка: спорт в НГУ', source_url: 'https://www.nsu.ru/n/education/sport/clubs-and-sections-for-first-year-students-with-a-very-long-address/' },
];

app.post('/v1/chat/completions', async (req, res) => {
  const q = String(req.body?.messages?.at(-1)?.content || '');
  const id = 'chatcmpl-mock-' + Date.now();
  res.setHeader('Content-Type', 'text/event-stream');
  res.flushHeaders();
  const send = (event, data) => res.write((event ? `event: ${event}\n` : '') + `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  const stage = async (name, ms, detail) => {
    send('stage', { stage: name, status: 'started' });
    await sleep(ms);
    send('stage', { stage: name, status: 'completed', duration_ms: ms, detail });
  };
  if (/стоп/i.test(q)) {
    // Knowledge-base search that runs until the person presses stop.
    await stage('query_rewrite', 300, { search_queries: ['спорткомплекс НГУ'] });
    send('stage', { stage: 'retrieval', status: 'started' });
    await new Promise((resolve) => { res.on('close', resolve); setTimeout(resolve, 120000); });
    return res.end();
  }
  if (/ошибка/i.test(q)) {
    await stage('query_rewrite', 300);
    await sleep(400);
    send('stage', { stage: 'prepare', status: 'failed', model_id: 'gemma-4-12B-it' });
    const err = { message: 'Upstream model failed', type: 'server_error', code: 'internal_error', retry_id: id, stage: 'prepare' };
    send('error', err);
    send(null, { id, object: 'chat.completion.chunk', model: req.body.model, choices: [{ index: 0, delta: {}, finish_reason: 'error' }], error: err });
    send(null, '[DONE]');
    return res.end();
  }
  await stage('query_rewrite', 300, { search_queries: ['спорткомплекс НГУ'] });
  await stage('retrieval', 400, { chunks_found: 40 });
  await stage('rerank', 300, { kept: 8, candidates: 40 });
  await stage('context_assembly', 200, { sources: 3, context_tokens: 4100 });
  send('stage', { stage: 'generation', status: 'started' });
  send('sources', { sources: SOURCES });
  const delay = /долго/i.test(q) ? 90 : 35;
  const text = /долго/i.test(q) ? (ANSWER + '\n\n').repeat(3) : ANSWER;
  for (let i = 0; i < text.length; i += 6) {
    send(null, { id, object: 'chat.completion.chunk', model: req.body.model, choices: [{ index: 0, delta: { content: text.slice(i, i + 6) } }] });
    await sleep(delay);
  }
  send('stage', { stage: 'generation', status: 'completed', duration_ms: 3000 });
  send('summary', { total_ms: 4500, stages: [] });
  send(null, { id, object: 'chat.completion.chunk', model: req.body.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
  send(null, '[DONE]');
  res.end();
});
app.use('/v1', (req, res) => res.status(404).json({ detail: 'mock: ' + req.path }));
app.listen(9906, '127.0.0.1', () => console.log('mock on 9906'));

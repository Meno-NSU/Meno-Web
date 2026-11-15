import { launch, connect, mobile, sleep } from './cdp.mjs';
const { proc, page } = await launch({ profile: process.argv[2] + '/profile-c' });
try {
  const c = await connect(page);
  const logs = [];
  c.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('LOG ' + m.params.entry.text.slice(0, 300) + ' ' + (m.params.entry.url || ''));
  });
  await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable'); await mobile(c);
  await c.send('Page.navigate', { url: process.env.SITE || 'http://127.0.0.1:5199/' });
  await sleep(4000);
  console.log(logs.join('\n') || 'no errors');
} finally { proc.kill('SIGTERM'); }

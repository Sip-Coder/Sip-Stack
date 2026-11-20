// Run geometry probes against the same browser modules and textures as the stage.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

export async function runCharacterProbe(measure, options = {}) {
  const docs = fileURLToPath(new URL('../docs/', import.meta.url));
  const three =
    process.env.THREE_ROOT || resolve(dirname(createRequire(import.meta.url).resolve('three')), '..');
  if (JSON.parse(await readFile(join(three, 'package.json'), 'utf8')).version !== '0.170.0')
    throw Error('Expected three@0.170.0');
  const onlyHero = process.argv[2];
  if (onlyHero && !['sippy', 'roma', 'hummin'].includes(onlyHero))
    throw Error('Expected sippy, roma or hummin');
  const page = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
  <script type="module">try{const result=await (${measure.toString()})(${JSON.stringify(onlyHero ?? null)},${JSON.stringify(options)});await fetch('/result',{method:'POST',body:JSON.stringify(result)});}
  catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({error:String(e.stack||e)})});}</script>`;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (path === '/result' && req.method === 'POST') {
        let data = '';
        for await (const chunk of req) data += chunk;
        const value = JSON.parse(data);
        res.end();
        finish(value);
        return;
      }
      if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(page);
        return;
      }
      let file;
      if (path.startsWith('/three/')) file = join(three, path.slice(7));
      else if (path.startsWith('/characters/')) file = join(docs, path);
      else if (/^\/tools\/characters-[a-z-]+\.mjs$/.test(path)) file = join(docs, '..', path);
      else {
        res.writeHead(404).end();
        return;
      }
      const data = await readFile(file);
      res.setHeader('Content-Type', 'application/javascript');
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  const profile = await mkdtemp(join(tmpdir(), 'characters-motion-'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const chrome = spawn(
    process.env.CHROME || '/usr/bin/chromium',
    [
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--user-data-dir=' + profile,
      'http://127.0.0.1:' + server.address().port + '/',
    ],
    { stdio: 'ignore' },
  );
  chrome.on('error', (e) => finish({ error: e.message }));
  chrome.on('exit', (code) => finish({ error: 'Chrome exited before sending measurements (' + code + ')' }));
  const timeout = setTimeout(() => finish({ error: 'Browser probe timeout' }), 600000);
  try {
    const result = await done;
    console.log(JSON.stringify(result, null, 2));
    if (result.error || result.failures?.length) process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    const closed = chrome.exitCode === null ? once(chrome, 'close') : Promise.resolve();
    chrome.kill();
    await closed;
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}

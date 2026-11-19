// Node 22+, Chromium, and the same Three.js package as docs/index.html.
// THREE_ROOT=/path/to/three CHROME=/usr/bin/chromium node tools/check-people.mjs
// --ref=<commit> runs the SAME probes on repository history. --suite=scene|rig|physics
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name) => process.argv.find((a) => a.startsWith('--' + name + '='))?.split('=')[1];
const ref = option('ref'),
  suite = option('suite') || 'all';
if (!['all', 'scene', 'rig', 'physics'].includes(suite)) throw Error('Unknown suite ' + suite);
if (ref && !/^[\w./-]+$/.test(ref)) throw Error('Invalid git ref');
const three =
  process.env.THREE_ROOT || resolve(dirname(createRequire(import.meta.url).resolve('three')), '..');
if (JSON.parse(readFileSync(join(three, 'package.json'))).version !== '0.170.0')
  throw Error('Use three@0.170.0');
function source(file) {
  return ref
    ? execFileSync('git', ['show', ref + ':' + file], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    : readFileSync(join(root, file), 'utf8');
}
let baseline = false;
if (ref) {
  try {
    source('docs/life/deformation.js');
  } catch {
    baseline = true;
  }
}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'),
    path = url.pathname;
  try {
    if (path === '/') {
      res.setHeader('content-type', 'text/html');
      return res.end(
        '<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>',
      );
    }
    if (path.includes('..')) throw Error('Invalid path');
    let text;
    if (path.startsWith('/three/')) text = readFileSync(join(three, path.slice(7)));
    else if (/^\/tools\/check-people[-\w]*\.mjs$/.test(path)) text = readFileSync(join(root, path));
    else if (path.startsWith('/docs/')) {
      text = source(path.slice(1));
      if (path.endsWith('/sip-village.js')) text += '\nexport {buildWorld as buildForCheck};';
      if (path.endsWith('/life/people.js')) {
        // Observe the actual objects and target transforms selected by the scene.
        text =
          text.replace('export function worker(', 'function makeWorker(') +
          `
export function worker(...args){
  const a=makeWorker(...args),record={a,name:args[3],action:'',targets:[]};
  globalThis.probedActors.push(record);
  const pose=a.pose,grasp=a.grasp;
  a.pose=function(...p){record.action=p[1];record.targets.length=0;return pose.apply(a,p)};
  a.grasp=function(p,...rest){for(let i=0;i<p.length;i++)if(p[i])record.targets[i]=p[i];return grasp.call(a,p,...rest)};
  return a;
}`;
      }
    } else throw Error('Unknown resource');
    res.setHeader('Content-Type', 'text/javascript');
    res.end(text);
  } catch (error) {
    if (path !== '/favicon.ico') console.error(path, error.message);
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const profile = mkdtempSync(join(tmpdir(), 'people-check-'));
const chrome = spawn(
  process.env.CHROME || '/usr/bin/chromium',
  [
    '--no-sandbox',
    '--headless',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { stdio: 'ignore' },
);
let socket;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  let tab;
  for (let i = 0; i < 300 && !tab; i++) {
    if (chrome.exitCode !== null) throw Error('Chromium closed during startup');
    const port = existsSync(portFile) && Number(readFileSync(portFile, 'utf8').split('\n')[0]);
    if (port > 0) {
      try {
        const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        tab = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch {
        /* The port file can be published before the listener is ready. */
      }
    }
    if (!tab) await delay(50);
  }
  if (!tab) throw Error('Chromium did not publish a debugging target');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    socket.onopen = ok;
    socket.onerror = no;
  });
  const pending = new Map();
  let serial = 0,
    onLoad;
  socket.onclose = () => {
    for (const finish of pending.values())
      finish({ error: { message: 'Chromium closed its debugging connection' } });
    pending.clear();
  };
  socket.onmessage = ({ data }) => {
    const r = JSON.parse(data);
    if (r.method === 'Page.loadEventFired') onLoad?.();
    if (pending.has(r.id)) {
      pending.get(r.id)(r);
      pending.delete(r.id);
    }
  };
  function call(method, params = {}) {
    return new Promise((resolve) => {
      pending.set(++serial, resolve);
      socket.send(JSON.stringify({ id: serial, method, params }));
    }).then((r) => {
      if (r.error) throw Error(JSON.stringify(r.error));
      return r.result;
    });
  }
  await call('Page.enable');
  const loaded = new Promise((resolve) => {
    onLoad = resolve;
  });
  await call('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
  await loaded;
  const report = {},
    failures = [];
  for (const key of ['scene', 'rig', 'physics']) {
    if (suite !== 'all' && suite !== key) continue;
    if (key === 'physics') await call('Emulation.setCPUThrottlingRate', { rate: 4 });
    const r = await call('Runtime.evaluate', {
      expression: `(async()=>{window.probedActors=[];return (await import('/tools/check-people-${key}.mjs')).default(${JSON.stringify({ baseline })})})()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    report[key] = r.result.value;
    failures.push(...report[key].failures);
  }
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill();
  await new Promise((ok) =>
    chrome.exitCode !== null || chrome.signalCode !== null ? ok() : chrome.once('exit', ok),
  );
  server.closeAllConnections();
  server.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
}

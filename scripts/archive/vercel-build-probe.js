const { spawn } = require('node:child_process');

function logProbe(message, data) {
  const payload = {
    sessionId: '1f0443',
    runId: `vercel-probe-${Date.now()}`,
    hypothesisId: data?.hypothesisId || 'VX',
    location: data?.location || 'scripts/vercel-build-probe.js',
    message,
    data: data?.data || {},
    timestamp: Date.now(),
  };

  // #region agent log
  fetch('http://127.0.0.1:7631/ingest/0a42b87a-aa16-449e-9235-d2920ae9c19a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1f0443'},body:JSON.stringify(payload)}).catch(()=>{});
  // #endregion

  console.log(`[VERCEL_PROBE] ${message} ${JSON.stringify(payload.data)}`);
}

logProbe('script-start', {
  hypothesisId: 'V1',
  location: 'scripts/vercel-build-probe.js:start',
  data: {
    nodeVersion: process.version,
    vercelEnv: process.env.VERCEL_ENV || null,
    ci: process.env.CI || null,
  },
});

const child = spawn('npx', ['next', 'build'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

logProbe('spawned-next-build', {
  hypothesisId: 'V2',
  location: 'scripts/vercel-build-probe.js:spawn',
  data: { pid: child.pid || null },
});

child.stdout.on('data', (chunk) => {
  const text = String(chunk || '');
  process.stdout.write(chunk);
  if (text.includes('Collecting page data')) {
    logProbe('reached-collecting-page-data', {
      hypothesisId: 'V3',
      location: 'scripts/vercel-build-probe.js:stdout',
      data: {},
    });
  }
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  logProbe('stderr-output', {
    hypothesisId: 'V4',
    location: 'scripts/vercel-build-probe.js:stderr',
    data: { preview: String(chunk || '').slice(0, 220) },
  });
});

child.on('close', (code, signal) => {
  logProbe('next-build-closed', {
    hypothesisId: 'V5',
    location: 'scripts/vercel-build-probe.js:close',
    data: { code, signal: signal || null },
  });
  process.exit(code || 0);
});

child.on('error', (error) => {
  logProbe('next-build-spawn-error', {
    hypothesisId: 'V2',
    location: 'scripts/vercel-build-probe.js:error',
    data: { error: error?.message || 'unknown' },
  });
  process.exit(1);
});

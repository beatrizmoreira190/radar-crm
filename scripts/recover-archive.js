const fs = require('fs');

(async () => {
  const url = 'https://api.vercel.com/v6/deployments/dpl_4mqBLMJGwAhtFBxbnhh9SVThf4Yg/files?teamId=team_xvUYMdsgsv1xobINcslreOgY';
  const candidates = [
    ['OIDC', process.env.VERCEL_OIDC_TOKEN],
    ['ARTIFACTS', process.env.VERCEL_ARTIFACTS_TOKEN],
    ['DEPLOYMENT_KEY', process.env.VERCEL_DEPLOYMENT_KEY],
  ];
  for (const [label, token] of candidates) {
    if (!token) { console.log(label, 'missing'); continue; }
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      console.log(label, 'status', r.status);
      const text = await r.text();
      if (r.ok) console.log(label, 'body-prefix', JSON.stringify(text.slice(0, 4000)));
      else console.log(label, 'error-prefix', JSON.stringify(text.slice(0, 300)));
    } catch (e) { console.log(label, 'fetch-error', String(e)); }
  }
  process.exit(1);
})();

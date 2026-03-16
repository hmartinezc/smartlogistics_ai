const baseUrl = process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:3003';
const credentials = {
  email: process.env.LOAD_TEST_EMAIL || 'admin@smart.com',
  password: process.env.LOAD_TEST_PASSWORD || '1234',
};
const endpoints = ['/api/health', '/api/agencies', '/api/plans', '/api/users'];
const requestsPerEndpoint = Number(process.env.LOAD_TEST_REQUESTS || '25');

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload.session.id;
}

async function measureEndpoint(endpoint, sessionId) {
  const samples = [];
  await Promise.all(
    Array.from({ length: requestsPerEndpoint }, async () => {
      const started = Date.now();
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: { 'X-Session-Id': sessionId },
      });
      await response.text();
      samples.push({ status: response.status, ms: Date.now() - started });
    })
  );

  samples.sort((left, right) => left.ms - right.ms);
  const averageMs = Math.round(samples.reduce((sum, sample) => sum + sample.ms, 0) / samples.length);
  const p95Index = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
  const statuses = [...new Set(samples.map((sample) => sample.status))];

  return {
    endpoint,
    requests: requestsPerEndpoint,
    averageMs,
    p95Ms: samples[p95Index].ms,
    statuses,
  };
}

async function main() {
  const sessionId = await login();
  const results = [];

  for (const endpoint of endpoints) {
    results.push(await measureEndpoint(endpoint, sessionId));
  }

  console.log(JSON.stringify({ baseUrl, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

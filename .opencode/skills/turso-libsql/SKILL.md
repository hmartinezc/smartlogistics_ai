---
name: turso-libsql
description: Use when connecting to Turso/libSQL, setting up databases, writing queries, or working with SQLite in TypeScript. Covers local and remote Turso connections, parameterized queries, transactions, and migrations.
---

# Turso & libSQL

Turso is a SQLite-compatible managed database platform built on libSQL. This project uses `@libsql/client` with local SQLite for development and optional remote Turso for production.

## Connection (this project's pattern)

```ts
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/smart-invoice.db',
  authToken: process.env.TURSO_AUTH_TOKEN, // only needed for remote
});
```

**Protocol selection:**

- `file:path/to/db.db` — local SQLite (no authToken needed, default for dev)
- `libsql://` — Turso Cloud via WebSocket (persistent connections)
- `https://` — Turso Cloud via HTTP (better for serverless)

## Parameterized Queries

Always use parameterized queries. Never interpolate user input.

```ts
// Positional placeholders
const user = await client.execute({
  sql: 'SELECT * FROM users WHERE id = ?',
  args: [userId],
});

// Named placeholders
await client.execute({
  sql: 'INSERT INTO users (name, email) VALUES (:name, :email)',
  args: { name: 'Alice', email: 'alice@example.com' },
});

// Simple query
const result = await client.execute('SELECT * FROM users');
// result.rows, result.columns, result.rowsAffected, result.lastInsertRowid
```

## Transactions

### Batch (preferred for multi-statement writes)

All statements execute atomically. Any failure rolls back the entire batch.

```ts
await client.batch(
  [
    { sql: 'INSERT INTO orders (user_id) VALUES (?)', args: [userId] },
    { sql: 'UPDATE inventory SET stock = stock - 1 WHERE id = ?', args: [itemId] },
  ],
  'write',
);
```

### Interactive (for conditional logic)

Use when write decisions depend on reads within the same transaction. Locks for up to 5 seconds — prefer batch when possible.

```ts
const tx = await client.transaction('write');
try {
  const { rows } = await tx.execute({
    sql: 'SELECT balance FROM accounts WHERE id = ?',
    args: [accountId],
  });
  if ((rows[0].balance as number) >= amount) {
    await tx.execute({
      sql: 'UPDATE accounts SET balance = balance - ? WHERE id = ?',
      args: [amount, accountId],
    });
    await tx.commit();
  } else {
    await tx.rollback();
  }
} catch (e) {
  await tx.rollback();
  throw e;
}
```

**Transaction modes:**

- `write` — `BEGIN IMMEDIATE`, mix of reads and writes
- `read` — `BEGIN TRANSACTION READONLY`, can parallelize on replicas
- `deferred` — `BEGIN DEFERRED`, may fail if write is in flight

## Local Development

Switch between local and remote via environment variables:

```
# .env.local
TURSO_DATABASE_URL=file:local.db
# No auth token needed for local files

# .env.production
TURSO_DATABASE_URL=libsql://my-db-myorg.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

## Migrations

For idempotent DDL/schema changes, follow the project's migration pattern in `server/schema.ts` — use `IF NOT EXISTS` for all `CREATE TABLE` and `ALTER TABLE ADD COLUMN` statements to ensure safe re-runs.

```ts
// Idempotent migration pattern
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
`);

// Safe column addition
try {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
} catch {
  // Column already exists — safe to ignore
}
```

## Authentication & Security

- Generate scoped auth tokens: `turso db tokens create <db-name>`
- Rotate tokens: `turso db tokens invalidate <db-name>`
- Never hardcode tokens — always use environment variables
- Use fine-grained permissions to restrict tokens to specific tables/operations

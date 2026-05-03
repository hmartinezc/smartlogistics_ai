---
name: database-migrations
description: Safe, idempotent database migration patterns for libSQL/SQLite. Use when modifying server/schema.ts, adding tables or columns, writing seed data, or planning schema changes. Covers idempotent DDL, rollback strategies, and zero-downtime patterns.
license: MIT
metadata:
  author: smart-logistics
  version: '1.0.0'
---

# Database Migrations (libSQL/SQLite)

Safe migration patterns for this project's libSQL/SQLite database.

## Current Project Context

- **Schema file:** `server/schema.ts` — all migrations and schema definitions
- **Seed file:** `server/seed.ts` — idempotent seed data
- **Product master seed:** `server/productMatchMasterSeed.ts`
- **DB:** `file:./data/smart-invoice.db` (local) or remote Turso
- **Migrations run:** on server startup via `server/db.ts`

## Migration Rules

### 1. All DDL Must Be Idempotent

Every migration statement must be safe to run multiple times:

```sql
-- Correct: uses IF NOT EXISTS
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  agency_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agency_id) REFERENCES agencies(id)
);

-- Correct: uses IF NOT EXISTS for indexes
CREATE INDEX IF NOT EXISTS idx_invoices_agency ON invoices(agency_id);

-- Correct: uses IF NOT EXISTS for columns (SQLite 3.35.0+)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
```

### 2. Never Use These Patterns

```sql
-- WRONG: no IF NOT EXISTS — fails on rerun
CREATE TABLE invoices (...);

-- WRONG: drops data on rerun
DROP TABLE IF EXISTS invoices;
CREATE TABLE invoices (...);

-- WRONG: no column existence check
ALTER TABLE invoices ADD COLUMN status TEXT;
```

### 3. Migration Structure in `server/schema.ts`

```typescript
export async function runMigrations(db: ReturnType<typeof createClient>) {
  // Version 1: Initial schema
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Version 2: Add users
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      agency_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    );
  `);

  // Version 3: Add indexes for performance
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);
  `);
}
```

### 4. Always Add New Migrations at the Bottom

Never modify existing migration statements — only append:

```typescript
export async function runMigrations(db: ...) {
  // === EXISTING MIGRATIONS (NEVER MODIFY) ===
  // V1: agencies table
  // V2: users table
  // V3: indexes

  // === NEW MIGRATIONS ===
  // V4: Add invoice status tracking
  await db.execute(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT (datetime('now'));
  `);
}
```

### 5. Foreign Key Constraints

Always specify `ON DELETE` behavior:

```sql
-- Correct: explicit behavior
FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL

-- WRONG: implicit default (may vary)
FOREIGN KEY (agency_id) REFERENCES agencies(id)
```

### 6. Column Types for This Project

| Data Type           | Use For                    | SQLite Type          |
| ------------------- | -------------------------- | -------------------- |
| UUIDs               | Primary keys, foreign keys | `TEXT`               |
| Counts / quantities | Stems, boxes, pieces       | `INTEGER`            |
| Prices / amounts    | Unit prices, totals        | `REAL`               |
| Dates / times       | Timestamps                 | `TEXT` (ISO 8601)    |
| JSON data           | AI extraction results      | `TEXT` (JSON string) |
| Booleans            | Flags, status              | `INTEGER` (0/1)      |
| Enums               | Agent types, roles         | `TEXT`               |

### 7. Seed Data

Seeds must be idempotent — check before inserting:

```typescript
// server/seed.ts
export async function seed(db: ReturnType<typeof createClient>) {
  // Check if already seeded
  const { rows } = await db.execute('SELECT COUNT(*) as count FROM users');
  if (rows[0] && Number((rows[0] as any).count) > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  // Seed users
  await db.execute(`
    INSERT INTO users (id, email, password_hash, role)
    VALUES
      ('admin-001', 'admin@smart.com', 'HASH_VALUE', 'admin'),
      ('oper-001', 'operador@smart.com', 'HASH_VALUE', 'operator'),
      ('super-001', 'supervisor@smart.com', 'HASH_VALUE', 'supervisor');
  `);
}
```

**WARNING:** Never commit real password hashes to seed files with known passwords. The seeds above (`admin@smart.com / 1234`) are for development only. Production seeds should use randomly generated credentials or require password reset on first login.

### 8. Migration Testing

Before running migrations on production data:

```sql
-- Test migration on a copy
-- 1. Create backup
.backup smart-invoice-backup.db

-- 2. Run migration on copy
ATTACH 'smart-invoice-backup.db' AS backup;
-- Run your migration SQL against backup

-- 3. Verify
SELECT * FROM backup.sqlite_master WHERE type = 'table';

-- 4. Detach
DETACH backup;
```

### 9. Rollback Strategy

SQLite doesn't support transactional DDL for ALTER TABLE. For risky migrations:

```typescript
export async function safeMigrate(db: ...) {
  // 1. Create backup table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS invoices_backup AS SELECT * FROM invoices;
  `);

  try {
    // 2. Run migration
    await db.execute(`ALTER TABLE invoices ADD COLUMN new_field TEXT;`);
    console.log('Migration successful');

    // 3. Cleanup backup after success
    await db.execute(`DROP TABLE IF EXISTS invoices_backup;`);
  } catch (error) {
    // 4. Restore from backup on failure
    console.error('Migration failed, restoring backup...');
    await db.execute(`DROP TABLE IF EXISTS invoices;`);
    await db.execute(`ALTER TABLE invoices_backup RENAME TO invoices;`);
    throw error;
  }
}
```

### 10. Documentation Sync

After every schema change, update `docs/DatabaseSchema.md`:

```markdown
## Schema Version: 4

### Tables

#### invoices

| Column         | Type | Constraints             | Description           |
| -------------- | ---- | ----------------------- | --------------------- |
| id             | TEXT | PRIMARY KEY             | UUID                  |
| agency_id      | TEXT | NOT NULL, FK→agencies   | Owning agency         |
| invoice_number | TEXT | NOT NULL                | Invoice identifier    |
| status         | TEXT | DEFAULT 'pending'       | Extraction status     |
| created_at     | TEXT | DEFAULT datetime('now') | Creation timestamp    |
| updated_at     | TEXT | DEFAULT datetime('now') | Last update timestamp |
```

## Migration Checklist (Before Commit)

- [ ] All statements use `IF NOT EXISTS` / `IF EXISTS`
- [ ] No `DROP TABLE` without `IF EXISTS` and explicit reason
- [ ] New migration appended at the bottom of `runMigrations()`
- [ ] Foreign keys have explicit `ON DELETE` behavior
- [ ] Indexes created for new columns used in queries
- [ ] Seed data updated if new required columns added
- [ ] `docs/DatabaseSchema.md` updated
- [ ] Tested on a copy of the database first

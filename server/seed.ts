// ============================================
// SEED — Datos iniciales para desarrollo
// ============================================
// Idénticos a los que existían en config.ts (INITIAL_USERS, INITIAL_AGENCIES)
// Solo se insertan si la tabla está vacía (idempotente)
// ============================================

import type { Client } from '@libsql/client';
import { hashPassword } from './security.js';

export async function runSeed(db: Client): Promise<void> {
  // ── Verificar si ya hay datos ──
  const planCount = await db.execute('SELECT COUNT(*) as cnt FROM subscription_plans');
  if (Number(planCount.rows[0].cnt) > 0) {
    console.log('ℹ️  Seed omitido: ya existen datos en la BD');
    return;
  }

  console.log('🌱 Insertando datos iniciales...');

  // ── Planes de Suscripción ──
  await db.batch([
    {
      sql: 'INSERT INTO subscription_plans (id, name, doc_limit, base_cost, extra_page_cost) VALUES (?, ?, ?, ?, ?)',
      args: ['PLAN_BASIC', 'Starter (5k)', 5000, 525, 0.06],
    },
    {
      sql: 'INSERT INTO subscription_plans (id, name, doc_limit, base_cost, extra_page_cost) VALUES (?, ?, ?, ?, ?)',
      args: ['PLAN_PRO', 'Growth (8k)', 8000, 600, 0.05],
    },
    {
      sql: 'INSERT INTO subscription_plans (id, name, doc_limit, base_cost, extra_page_cost) VALUES (?, ?, ?, ?, ?)',
      args: ['PLAN_ENTERPRISE', 'Scale (15k)', 15000, 799, 0.05],
    },
  ]);

  // ── Agencias ──
  await db.batch([
    {
      sql: `INSERT INTO agencies (id, name, plan_id, current_usage, is_active) VALUES (?, ?, ?, ?, ?)`,
      args: ['AGENCY_HQ', 'SmartLogistics HQ', 'PLAN_ENTERPRISE', 4500, 1],
    },
    {
      sql: `INSERT INTO agencies (id, name, plan_id, current_usage, is_active) VALUES (?, ?, ?, ?, ?)`,
      args: ['AGENCY_CLIENT_A', 'Flores Del Valle', 'PLAN_BASIC', 4950, 1],
    },
    {
      sql: `INSERT INTO agencies (id, name, plan_id, current_usage, is_active) VALUES (?, ?, ?, ?, ?)`,
      args: ['AGENCY_CLIENT_B', 'Cargo Express', 'PLAN_PRO', 8200, 1],
    },
  ]);

  // ── Emails de Agencias ──
  await db.batch([
    {
      sql: 'INSERT INTO agency_emails (agency_id, email) VALUES (?, ?)',
      args: ['AGENCY_HQ', 'billing@smartlogistics.com'],
    },
    {
      sql: 'INSERT INTO agency_emails (agency_id, email) VALUES (?, ?)',
      args: ['AGENCY_HQ', 'admin@smartlogistics.com'],
    },
    {
      sql: 'INSERT INTO agency_emails (agency_id, email) VALUES (?, ?)',
      args: ['AGENCY_CLIENT_A', 'finanzas@floresdelvalle.com'],
    },
    {
      sql: 'INSERT INTO agency_emails (agency_id, email) VALUES (?, ?)',
      args: ['AGENCY_CLIENT_B', 'pagos@cargoexpress.net'],
    },
  ]);

  // ── Usuarios ──
  await db.batch([
    {
      sql: `INSERT INTO users (id, email, password, name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['1', 'admin@smart.com', hashPassword('1234'), 'System Admin', 'ADMIN', 1],
    },
    {
      sql: `INSERT INTO users (id, email, password, name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['2', 'operador@smart.com', hashPassword('1234'), 'Operador Logística', 'OPERADOR', 1],
    },
    {
      sql: `INSERT INTO users (id, email, password, name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        '3',
        'supervisor@smart.com',
        hashPassword('1234'),
        'Supervisor Turno',
        'SUPERVISOR',
        1,
      ],
    },
  ]);

  // ── Asignaciones Usuario ↔ Agencia ──
  await db.batch([
    {
      sql: 'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)',
      args: ['1', 'AGENCY_HQ'],
    },
    {
      sql: 'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)',
      args: ['2', 'AGENCY_CLIENT_A'],
    },
    {
      sql: 'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)',
      args: ['3', 'AGENCY_CLIENT_B'],
    },
    {
      sql: 'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)',
      args: ['3', 'AGENCY_CLIENT_A'],
    },
  ]);

  // ── Configuración por defecto ──
  await db.execute({
    sql: `INSERT INTO app_settings (key, value) VALUES (?, ?)`,
    args: ['darkMode', 'false'],
  });

  console.log('✅ Seed completado: 3 planes, 3 agencias, 3 usuarios, configuración');
}

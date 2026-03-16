// ============================================
// CONFIGURACIÓN CENTRALIZADA DE LA APLICACIÓN
// ============================================

import { SubscriptionPlan, Agency, User } from './types';

// --------------------------
// Configuración de Gemini AI
// --------------------------
export const AI_CONFIG = {
  // Modelos disponibles de Gemini:
  // - 'gemini-2.0-flash' → Más rápido, ideal para extracción (RECOMENDADO)
  // - 'gemini-2.0-flash-lite' → Aún más rápido, menos preciso
  // - 'gemini-1.5-pro' → Más potente, más lento y costoso
  MODEL_ID: 'gemini-3-flash-preview',
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  BATCH_DELAY_MS: 500, // Pausa entre items del batch
} as const;

// --------------------------
// Planes de Suscripción
// --------------------------
export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  { 
    id: 'PLAN_BASIC', 
    name: 'Starter (5k)', 
    limit: 5000, 
    baseCost: 525, 
    extraPageCost: 0.06 
  },
  { 
    id: 'PLAN_PRO', 
    name: 'Growth (8k)', 
    limit: 8000, 
    baseCost: 600, 
    extraPageCost: 0.05 
  },
  { 
    id: 'PLAN_ENTERPRISE', 
    name: 'Scale (15k)', 
    limit: 15000, 
    baseCost: 799, 
    extraPageCost: 0.05 
  },
] as const;

// --------------------------
// Datos Mock Iniciales / Credenciales seed de desarrollo local
// --------------------------
export const INITIAL_AGENCIES: Agency[] = [
  { 
    id: 'AGENCY_HQ', 
    name: 'SmartLogistics HQ', 
    emails: ['billing@smartlogistics.com', 'admin@smartlogistics.com'], 
    planId: 'PLAN_ENTERPRISE', 
    currentUsage: 4500, 
    isActive: true 
  },
  { 
    id: 'AGENCY_CLIENT_A', 
    name: 'Flores Del Valle', 
    emails: ['finanzas@floresdelvalle.com'], 
    planId: 'PLAN_BASIC', 
    currentUsage: 4950, 
    isActive: true 
  },
  { 
    id: 'AGENCY_CLIENT_B', 
    name: 'Cargo Express', 
    emails: ['pagos@cargoexpress.net'], 
    planId: 'PLAN_PRO', 
    currentUsage: 8200, 
    isActive: true 
  },
];

export const INITIAL_USERS: User[] = [
  { 
    id: '1', 
    name: 'System Admin', 
    email: 'admin@smart.com', 
    password: '1234', 
    role: 'ADMIN', 
    agencyIds: ['AGENCY_HQ'], 
    isActive: true 
  },
  { 
    id: '2', 
    name: 'Operador Logística', 
    email: 'operador@smart.com', 
    password: '1234', 
    role: 'OPERADOR', 
    agencyIds: ['AGENCY_CLIENT_A'], 
    isActive: true 
  },
  { 
    id: '3', 
    name: 'Supervisor Turno', 
    email: 'supervisor@smart.com', 
    password: '1234', 
    role: 'SUPERVISOR', 
    agencyIds: ['AGENCY_CLIENT_B', 'AGENCY_CLIENT_A'], 
    isActive: true 
  },
];

// --------------------------
// Configuración de Box Types (Logística Flores)
// --------------------------
export const BOX_TYPE_FACTORS: Record<string, number> = {
  FB: 1.00,    // Full Box
  HB: 0.50,    // Half Box
  QB: 0.25,    // Quarter Box
  EB: 0.125,   // Eighth Box
  DS: 0.0625,  // Dieciseisavo / Split
} as const;

export const BOX_TYPE_ALIASES: Record<string, string> = {
  F: 'FB', FX: 'FB', PL: 'FB', P: 'FB', FULL: 'FB',
  H: 'HB', '1/2': 'HB', HALF: 'HB',
  Q: 'QB', '1/4': 'QB', QUARTER: 'QB',
  E: 'EB', '1/8': 'EB', OCTAVO: 'EB',
  D: 'DS', '1/16': 'DS', SPLIT: 'DS',
} as const;

// --------------------------
// Configuración de UI
// --------------------------
export const UI_CONFIG = {
  ANIMATION_DURATION_MS: 300,
  TOAST_DURATION_MS: 5000,
  MIN_CONFIDENCE_SCORE: 75, // Score mínimo para considerar "confiable"
  HIGH_CONFIDENCE_SCORE: 90,
} as const;

// --------------------------
// Persistencia temporal local
// --------------------------
export const STORAGE_CONFIG = {
  ENABLE_LOCAL_PERSISTENCE: true,
  NAMESPACE: 'smart-invoice-ai',
} as const;

// --------------------------
// Mensajes de Error
// --------------------------
export const ERROR_MESSAGES = {
  API_KEY_MISSING: 'API Key de Gemini no configurada. Verifica el archivo .env',
  INVALID_CREDENTIALS: 'Credenciales inválidas.',
  USER_INACTIVE: 'Usuario inactivo. Contacte al administrador.',
  AGENCY_SUSPENDED: 'Acceso denegado: Su agencia se encuentra suspendida.',
  PROCESSING_ERROR: 'Error procesando factura con agente IA.',
  NETWORK_ERROR: 'Error de conexión. Verifica tu internet.',
} as const;

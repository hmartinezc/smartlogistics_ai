
export interface InvoiceItem {
  boxType: string;         // *PIECE TYPE (QB, HB)
  totalPieces: number;     // TOTAL PIECES
  eqFull: number;          // EQ-FULL BOXES
  productDescription: string; // PRODUCT DESCRIPTION
  varieties?: string[];    // NEW: List of varieties included in this box/item
  hts: string;             // HTS
  nandina: string;         // NANDINA
  totalStems: number;      // TOTAL-UNT STEMS
  unitPrice: number;       // UNIT-PRICE PER/STEM
  totalValue: number;      // TOTAL VALUE-USD
}

export interface InvoiceData {
  // Header Info
  invoiceNumber: string;   // COMMERCIAL INVOICE NO.
  date: string;            // Date
  shipperName: string;     // Shipper Name
  shipperAddress: string;  // Shipper Address (Full text)
  consigneeName: string;   // Consignee Name
  consigneeAddress: string;// Consignee Address
  mawb: string;            // MAWB No.
  hawb: string;            // HAWB No.
  airline: string;         // Airline
  freightForwarder: string;// Freight Forwarder
  ruc: string;             // R.U.C. No.
  dae: string;             // DAE No.
  
  // Totals
  totalPieces: number;
  totalEq: number;         // Total EQ
  totalStems: number;      // Total Stems
  totalValue: number;      // Total Invoice Value

  lineItems: InvoiceItem[];
  
  // AI Self-Evaluation
  confidenceScore: number; // 0 to 100
}

export interface ExportInvoiceItem extends InvoiceItem {
  match: ProductMatchExport;
}

export interface ExportInvoiceData extends Omit<InvoiceData, 'lineItems'> {
  lineItems: ExportInvoiceItem[];
}

export interface BatchItem {
  id: string;
  file?: File;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
  result?: InvoiceData;
  error?: string;
  createdAt?: string; // ISO Date when the record was added
  processedAt?: string; // ISO Date
  user?: string; // User who processed the file
  agencyId?: string; // Agency context where this was processed
}

export type UserRole = 'ADMIN' | 'OPERADOR' | 'SUPERVISOR';

export interface SubscriptionPlan {
  id: string;
  name: string;
  limit: number;
  baseCost: number;
  extraPageCost: number;
}

export interface Agency {
  id: string;
  name: string;
  emails: string[]; 
  planId: string;
  currentUsage: number; // Pages processed this month
  isActive: boolean; // Status (Active / Suspended)
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductMatchCatalogItem {
  id: string;
  agencyId: string;
  category: string;
  product: string;
  clientProductCode: string;
  productMatch: string;
  hts: string;
  htsMatch: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductMatchExport {
  clientProductCode: string;
  clientProductDescription: string;
  htsMatch: string;
}

export interface ProductMatchBootstrapResult {
  ok: boolean;
  insertedCount: number;
  masterRowCount: number;
}

export interface User {
  id: string;
  email: string;
  password?: string;
  name: string;
  role: UserRole;
  agencyIds: string[]; // Link to multiple Agencies
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OperationalQueryParams {
  agencyId: string;
  operationDate: string;
  operationDateStart?: string;
  operationDateEnd?: string;
}

export interface BookedAwbRecord {
  mawb: string;
  bookedHijas: number;
  bookedPieces: number;
  bookedFulls: number;
  operationDate: string;
  agencyId: string;
}

export interface InvoicedAwbRecord {
  mawb: string;
  invoicedHijas: number;
  invoicedPieces: number;
  invoicedFulls: number;
  operationDate: string;
  agencyId: string;
}

export type AwbReconciliationStatus = 'MATCHED' | 'DISCREPANCY' | 'PENDING_DOCUMENTS' | 'PARTIAL';

export interface AwbReconciliationRow {
  mawb: string;
  bookedHijas: number;
  bookedPieces: number;
  bookedFulls: number;
  invoicedHijas: number;
  invoicedPieces: number;
  invoicedFulls: number;
  operationDate: string;
  agencyId: string;
  status: AwbReconciliationStatus;
}

export enum AppState {
  LOGIN = 'LOGIN',
  DASHBOARD_OPS = 'DASHBOARD_OPS',      // Panel Operativo (Solo Admin)
  DASHBOARD_PANEL = 'DASHBOARD_PANEL',  // Panel Facturado (Operación)
  DASHBOARD_ADMIN = 'DASHBOARD_ADMIN',  // Panel Admin (Solo Admin)
  AGENCY_CONFIG = 'AGENCY_CONFIG',      // Configuración Agencias (Solo Admin)
  PRODUCT_MATCHES = 'PRODUCT_MATCHES',  // Catálogo Match Productos
  PROCESS_SELECTION = 'PROCESS_SELECTION',
  BATCH_RUNNING = 'BATCH_RUNNING',
  HISTORY_RESULTS = 'HISTORY_RESULTS',
  DATA_CLEANUP = 'DATA_CLEANUP',
  USER_MANAGEMENT = 'USER_MANAGEMENT'   // Gestión de Usuarios (Solo Admin)
}

// Updated to reflect the Client Agents
export type AgentType = 'AGENT_TCBV' | 'AGENT_GENERIC_A' | 'AGENT_GENERIC_B' | 'AGENT_CUSTOMS';

export type DocumentFormat = 'FORMAT_A_STD' | 'FORMAT_B_COMPLEX' | 'FORMAT_C_COMBINED' | 'FORMAT_D_CUSTOMS';

export const AGENT_GROUPS = {
  'AGENT_TCBV': ['TCBV Specific Format'],
  'AGENT_GENERIC_A': ['Standard Invoice'],
  'AGENT_GENERIC_B': ['Disabled'],
  'AGENT_CUSTOMS': ['Disabled']
};

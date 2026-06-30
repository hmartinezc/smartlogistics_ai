export interface InvoiceItem {
  boxType: string; // *PIECE TYPE (QB, HB)
  totalPieces: number; // TOTAL PIECES
  eqFull: number; // EQ-FULL BOXES
  productDescription: string; // PRODUCT DESCRIPTION
  varieties?: string[]; // Varieties included in this box/item; mixed boxes may use PRODUCT:stems.
  hts: string; // HTS
  nandina: string; // NANDINA
  totalStems: number; // TOTAL-UNT STEMS
  unitPrice: number; // UNIT-PRICE PER/STEM
  totalValue: number; // TOTAL VALUE-USD
}

export type ConfidenceReasonCode =
  | 'PIECES_TOTAL_MISMATCH'
  | 'EQ_TOTAL_MISMATCH'
  | 'VALUE_TOTAL_MISMATCH'
  | 'OCR_UNCERTAIN'
  | 'MISSING_FIELD'
  | 'AMBIGUOUS_TABLE'
  | 'DOCUMENT_INCOMPLETE'
  | 'OTHER';

export interface ConfidenceReason {
  code: ConfidenceReasonCode;
  penalty: number;
  message: string;
  footerTotal?: number;
  calculatedTotal?: number;
  invoiceTotal?: number;
  calculatedLineTotal?: number;
  tolerance?: number;
}

export interface ConfidenceAudit {
  modelScore: number;
  backendScore: number;
  finalScore: number;
  acceptedReasonCodes: ConfidenceReasonCode[];
  overriddenReasonCodes: ConfidenceReasonCode[];
  backendReasonCodes: ConfidenceReasonCode[];
}

export interface InvoiceData {
  // Header Info
  invoiceNumber: string; // COMMERCIAL INVOICE NO.
  date: string; // Date
  shipperName: string; // Shipper Name
  shipperAddress: string; // Shipper Address (Full text)
  consigneeName: string; // Consignee Name
  consigneeAddress: string; // Consignee Address
  mawb: string; // MAWB No.
  hawb: string; // HAWB No.
  airline: string; // Airline
  freightForwarder: string; // Freight Forwarder
  ruc: string; // R.U.C. No.
  dae: string; // DAE No.

  // Totals
  totalPieces: number;
  totalEq: number; // Total EQ
  totalStems: number; // Total Stems
  totalValue: number; // Total Invoice Value

  lineItems: InvoiceItem[];

  // AI Self-Evaluation
  confidenceScore: number; // 0 to 100
  confidenceReasons?: ConfidenceReason[];
  confidenceAudit?: ConfidenceAudit;
}

export interface ExportInvoiceItem extends InvoiceItem {
  match: ProductMatchExport;
}

export interface ExportInvoiceData extends Omit<InvoiceData, 'lineItems'> {
  lineItems: ExportInvoiceItem[];
}

export interface BatchExportDocument extends ExportInvoiceData {
  filename: string;
  processedAt?: string;
}

export type IntegrationAuthType = 'none' | 'bearer' | 'apiKey' | 'basic';

export type IntegrationHttpMethod = 'POST' | 'PUT';

export interface IntegrationEndpointHeader {
  id: string;
  key: string;
  value: string;
}

export interface AgencyIntegrationEndpointConfig {
  enabled: boolean;
  url: string;
  method: IntegrationHttpMethod;
  authType: IntegrationAuthType;
  bearerToken?: string;
  apiKeyHeader?: string;
  apiKeyValue?: string;
  basicUsername?: string;
  basicPassword?: string;
  headers: IntegrationEndpointHeader[];
}

export interface AgencyIntegrationConfig {
  fieldMappings: Record<string, string>;
  endpoint: AgencyIntegrationEndpointConfig;
}

export type IntegrationDeliveryEventType = 'TEST' | 'EXPORT';

export type IntegrationDeliverySource = 'integration_config' | 'history_results' | 'operator_panel';

export interface IntegrationDeliveryLog {
  id: string;
  agencyId: string;
  eventType: IntegrationDeliveryEventType;
  source: IntegrationDeliverySource;
  exportReference?: string;
  exportFilename?: string;
  endpointUrl: string;
  requestDocumentCount: number;
  usedClientMapping: boolean;
  responseStatus?: number;
  responseBody?: string;
  success: boolean;
  error?: string;
  createdAt?: string;
}

export interface IntegrationEndpointResponse {
  ok: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  usedClientMapping: boolean;
  deliveryId?: string;
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
  reviewedAt?: string; // ISO Date when an incident was reviewed
  reviewedBy?: string; // User email who reviewed the incident
}

export interface DocumentProcessingAuditEntry {
  id: string;
  batchItemId: string;
  fileName: string;
  agencyId: string;
  agencyName?: string;
  status: 'SUCCESS' | 'ERROR';
  extractionOk: boolean;
  error?: string;
  processedAt: string;
  processedDate: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  source: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentProcessingAuditQuery {
  agencyId?: string;
  month?: string;
  date?: string;
  from?: string;
  to?: string;
}

export interface GeminiExtractionEvent {
  agencyId?: string;
  agentType: string;
  batchId?: string;
  cacheMode: string;
  cacheTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  createdAt?: string;
  documentJobId?: string;
  durationMs: number;
  error?: string;
  estimatedCostUsd: number;
  expiresAt: string;
  fileDeleteDurationMs?: number;
  fileDeleteOk?: boolean;
  fileInputMode?: string;
  fileUploadDurationMs?: number;
  id: string;
  model: string;
  originalFileName?: string;
  inputTokenCount: number;
  outputTokenCount: number;
  promptHash: string;
  promptTokenCount?: number;
  routerCategory?: string;
  routerConfidence?: number;
  routerVisualSignals?: string[];
  sdk: string;
  source: string;
  stage?: string;
  success: boolean;
  thoughtsTokenCount?: number;
  timestamp: string;
  totalTokenCount?: number;
  userEmail?: string;
  userId?: string;
  userName?: string;
}

export interface GeminiExtractionEventQuery {
  agencyId?: string;
  from?: string;
  jobId?: string;
  limit?: number;
  model?: string;
  offset?: number;
  routerCategory?: string;
  sdk?: string;
  stage?: string;
  success?: boolean;
  to?: string;
}

export interface GeminiExtractionEventSummary {
  averageDurationMs: number;
  byCategory: Array<{ category: string; count: number }>;
  byModel: Array<{
    estimatedCostUsd: number;
    inputTokens: number;
    model: string;
    outputTokens: number;
  }>;
  byStage: Array<{ stage: string; count: number }>;
  estimatedCostUsd: number;
  error: number;
  inputTokens: number;
  outputTokens: number;
  success: number;
  total: number;
  totalTokens: number;
}

export interface GeminiExtractionEventListResponse {
  events: GeminiExtractionEvent[];
  limit: number;
  offset: number;
  summary: GeminiExtractionEventSummary;
  total: number;
}

export interface AiPromptSnapshot {
  id: string;
  promptHash: string;
  promptKind: string;
  agentType: string | null;
  routerCategory: string | null;
  model: string;
  promptProfile: string | null;
  promptText: string;
  source: string;
  createdAt: string | null;
}

export interface AiReviewAnalysis {
  id: string;
  itemId: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | string;
  reviewerModel: string;
  verdict: string;
  confidenceScore: number | null;
  analysis: {
    verdict?: string;
    confidenceScore?: number;
    summary?: string;
    suspectedIssues?: Array<{
      field?: string;
      reason?: string;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
    }>;
    extractorTechnicalImprovements?: Array<{
      area?: string;
      recommendation?: string;
      expectedImpact?: string;
      costImpact?: 'LOWER' | 'NEUTRAL' | 'HIGHER' | string;
    }>;
    classifierTechnicalImprovements?: Array<{
      area?: string;
      recommendation?: string;
      expectedImpact?: string;
      costImpact?: 'LOWER' | 'NEUTRAL' | 'HIGHER' | string;
    }>;
    costEfficiencyNotes?: string[];
    costGuardrails?: string[];
    promptRecommendations?: Array<{
      target?: 'classifier' | 'extractor' | 'none' | string;
      promptHash?: string;
      recommendation?: string;
      risk?: string;
    }>;
    validationPlan?: string[];
    requiresDeveloperWork?: boolean;
    developerWorkReason?: string | null;
  } | null;
  recommendationSummary: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdBy: {
    id: string | null;
    email: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AiReviewItem {
  id: string;
  runId: string;
  documentJobId: string;
  batchId: string | null;
  agencyId: string;
  agencyName: string | null;
  originalFileName: string;
  reviewStorageBucket: string | null;
  reviewObjectKey: string | null;
  reviewFileSizeBytes: number;
  extractionFormat: string;
  modelSummary: string | null;
  promptHashes: string[];
  status: 'PENDING_ANALYSIS' | 'ANALYZED' | 'ANALYSIS_ERROR' | string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  processedAt: string | null;
  analysisError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AiReviewGeminiEvent {
  id: string;
  timestamp: string;
  source: string;
  documentJobId: string | null;
  batchId: string | null;
  agencyId: string | null;
  originalFileName: string | null;
  agentType: string;
  sdk: string;
  stage: string | null;
  cacheMode: string;
  model: string;
  promptHash: string;
  success: boolean;
  error: string | null;
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
  estimatedCostUsd: number;
  durationMs: number;
  routerCategory: string | null;
  routerConfidence: number | null;
}

export interface AiReviewRun {
  id: string;
  reviewDate: string;
  agencyId: string | null;
  status: 'READY' | 'EMPTY' | 'ERROR' | string;
  selectedCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  createdBy: {
    id: string | null;
    email: string | null;
    name: string | null;
  };
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: AiReviewItem[];
}

export interface AiReviewDetail {
  item: AiReviewItem;
  invoiceResult: InvoiceData | null;
  pdfPreviewUrl: string;
  events: AiReviewGeminiEvent[];
  promptSnapshots: AiPromptSnapshot[];
  analyses: AiReviewAnalysis[];
}

export interface AiReviewRunResponse {
  run: AiReviewRun | null;
}

export interface AiReviewDetailResponse extends AiReviewDetail {}

export interface AiReviewAnalyzeResponse {
  detail: AiReviewDetail;
}

export type PromptLabCaseStatus = 'CREATED' | 'ANALYZED' | 'ANALYSIS_ERROR' | string;

export type PromptLabVerdict =
  | 'OK'
  | 'REVIEW_NEEDED'
  | 'PROMPT_IMPROVEMENT_SUGGESTED'
  | 'NEW_CATEGORY_SUGGESTED'
  | string;

export type PromptLabPatchProposalType =
  | 'CLASSIFIER_PROMPT_ADJUSTMENT'
  | 'EXTRACTOR_PROMPT_ADJUSTMENT'
  | 'NEW_ROUTER_CATEGORY'
  | 'SCHEMA_CHANGE'
  | 'DETERMINISTIC_RULE_CHANGE'
  | 'NONE'
  | string;

export interface PromptLabPatchProposal {
  type?: PromptLabPatchProposalType;
  target?: string;
  rationale?: string;
  proposedDiff?: string;
  risk?: string;
  requiresDeveloperWork?: boolean;
}

export interface PromptLabRecommendation {
  area?: string;
  category?: string;
  recommendation?: string;
  expectedImpact?: string;
  costImpact?: 'LOWER' | 'NEUTRAL' | 'HIGHER' | string;
}

export interface PromptLabFieldFinding {
  field?: string;
  actual?: string;
  expected?: string;
  reason?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
}

export interface PromptLabNewCategoryRecommendation {
  needed?: boolean;
  suggestedName?: string | null;
  visualSignals?: string[];
  extractorPromptDraft?: string | null;
  testCases?: string[];
}

export interface PromptLabAnalysisPayload {
  verdict?: PromptLabVerdict;
  confidenceScore?: number;
  summary?: string;
  fieldFindings?: PromptLabFieldFinding[];
  classifierRecommendations?: PromptLabRecommendation[];
  extractorRecommendations?: PromptLabRecommendation[];
  newCategoryRecommendation?: PromptLabNewCategoryRecommendation | null;
  schemaOrCodeRecommendations?: string[];
  deterministicRuleRecommendations?: string[];
  costNotes?: string[];
  validationPlan?: string[];
  patchProposal?: PromptLabPatchProposal;
}

export interface PromptLabCase {
  id: string;
  agencyId: string;
  agencyName: string | null;
  originalFileName: string;
  storageBucket: string | null;
  objectKey: string | null;
  fileSizeBytes: number;
  mimeType: string;
  extractionFormat: string;
  status: PromptLabCaseStatus;
  expectedJson: string | null;
  adminNotes: string | null;
  latestAnalysisId: string | null;
  pdfDeletedAt: string | null;
  analysisError: string | null;
  createdBy: {
    id: string | null;
    email: string | null;
    name: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PromptLabAnalysis {
  id: string;
  caseId: string;
  reviewerModel: string;
  verdict: PromptLabVerdict;
  confidenceScore: number | null;
  extraction: InvoiceData | null;
  extractionMetrics: Record<string, unknown> | null;
  promptSnapshots: AiPromptSnapshot[];
  analysis: PromptLabAnalysisPayload | null;
  patchProposal: PromptLabPatchProposal | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdBy: {
    id: string | null;
    email: string | null;
  };
  createdAt: string | null;
}

export interface PromptLabCaseListResponse {
  cases: PromptLabCase[];
}

export interface PromptLabDetailResponse {
  case: PromptLabCase;
  analyses: PromptLabAnalysis[];
}

export type DocumentJobStatus =
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'ERROR'
  | 'CANCELLED';

export interface DocumentJob {
  id: string;
  batchId: string;
  agencyId: string;
  status: DocumentJobStatus;
  originalFileName: string;
  fileSizeBytes: number;
  mimeType: string;
  extractionFormat: AgentType;
  retryCount: number;
  maxRetries: number;
  result: InvoiceData | null;
  error: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  processedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  user: {
    id: string | null;
    email: string | null;
    name: string | null;
  };
}

export type DocumentJobSummary = Record<DocumentJobStatus, number>;

export interface DocumentListResponse {
  jobs: DocumentJob[];
  summary: DocumentJobSummary;
  limit: number;
  offset: number;
  total: number;
}

export interface DocumentUploadResponse {
  batchId: string;
  count: number;
  jobs: DocumentJob[];
  errors: Array<{ fileName: string; error: string; errorId?: string }>;
}

export interface ExtractionPromptCacheStatus {
  agentType: AgentType;
  cacheName?: string;
  cacheTokenCount?: number;
  error?: string;
  promptHash: string;
  reusedExisting?: boolean;
  state: 'disabled' | 'ready' | 'error';
  waitedForCreate?: boolean;
}

export interface DocumentProcessResponse {
  queuedCount: number;
  skippedCount: number;
  jobs: DocumentJob[];
  promptCaches?: ExtractionPromptCacheStatus[];
}

export interface DocumentDeleteResponse {
  deletedCount: number;
  deletedIds: string[];
  freedBytes: number;
  errors: Array<{ id: string; fileName: string; error: string; errorId?: string }>;
}

export interface DocumentListQuery {
  agencyId?: string;
  status?: DocumentJobStatus;
  batchId?: string;
  limit?: number;
  offset?: number;
  dateFrom?: string;
  dateTo?: string;
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
  hawbFormatPattern?: string;
  integrationConfig?: AgencyIntegrationConfig;
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

export interface PendingProductMatchExample {
  batchItemId: string;
  fileName: string;
  invoiceNumber?: string;
  hawb?: string;
  productDescription: string;
  hts?: string;
}

export interface PendingProductMatchItem {
  key: string;
  product: string;
  occurrenceCount: number;
  invoiceCount: number;
  htsCandidates: string[];
  latestProcessedAt?: string;
  examples: PendingProductMatchExample[];
}

export interface PendingProductMatchResponse {
  items: PendingProductMatchItem[];
  truncated: boolean;
  scannedBatchItems: number;
  scanLimit: number;
}

export interface PendingProductMatchCreateInput {
  agencyId: string;
  product: string;
  clientProductCode: string;
  productMatch: string;
  htsMatch: string;
  sourceHts?: string;
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
  DASHBOARD_OPS = 'DASHBOARD_OPS', // Panel Operativo (Solo Admin)
  DASHBOARD_PANEL = 'DASHBOARD_PANEL', // Panel Facturado (Operación)
  DASHBOARD_ADMIN = 'DASHBOARD_ADMIN', // Panel Admin (Solo Admin)
  AI_REVIEW = 'AI_REVIEW', // AutoPilot AI: revisión y mejora continua (Solo Admin)
  PROMPT_LAB = 'PROMPT_LAB', // Prompt Lab AI: diagnóstico guardado de prompts (Solo Admin)
  AGENCY_CONFIG = 'AGENCY_CONFIG', // Configuración Agencias (Solo Admin)
  INTEGRATION_CONFIG = 'INTEGRATION_CONFIG', // Integración por agencia (Solo Admin)
  PENDING_PRODUCT_MATCHES = 'PENDING_PRODUCT_MATCHES', // Productos extraídos sin equivalencia
  PRODUCT_MATCHES = 'PRODUCT_MATCHES', // Catálogo Match Productos
  PROCESS_SELECTION = 'PROCESS_SELECTION',
  BATCH_RUNNING = 'BATCH_RUNNING',
  HISTORY_RESULTS = 'HISTORY_RESULTS',
  DATA_CLEANUP = 'DATA_CLEANUP',
  USER_MANAGEMENT = 'USER_MANAGEMENT', // Gestión de Usuarios (Solo Admin)
}

// Client extraction agents
export type AgentType = 'AGENT_GENERIC_A' | 'AGENT_GENERIC_B' | 'AGENT_CUSTOMS';

export type DocumentFormat =
  | 'FORMAT_A_STD'
  | 'FORMAT_B_COMPLEX'
  | 'FORMAT_C_COMBINED'
  | 'FORMAT_D_CUSTOMS';

export const AGENT_GROUPS = {
  AGENT_GENERIC_A: ['Standard Invoice'],
  AGENT_GENERIC_B: ['Disabled'],
  AGENT_CUSTOMS: ['Disabled'],
};

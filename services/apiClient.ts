import { invalidateProductMatchCatalogCache } from './productMatchCatalogCache';

// ============================================
// API CLIENT — Capa de comunicación con el backend
// ============================================
// Reemplaza localStorage con llamadas HTTP a /api/*
// Todas las funciones retornan Promises
// ============================================

const API_BASE = '/api';
const DOCUMENT_UPLOAD_CHUNK_MAX_FILES = 40;
const DOCUMENT_UPLOAD_CHUNK_MAX_BYTES = 90 * 1024 * 1024;

// Almacén de sessionId en memoria (también en localStorage como backup)
let _sessionId: string | null = null;

function getSessionId(): string | null {
  if (_sessionId) return _sessionId;
  _sessionId = localStorage.getItem('smart-invoice-ai.sessionId');
  return _sessionId;
}

function setSessionId(id: string | null): void {
  const previousSessionId = _sessionId ?? localStorage.getItem('smart-invoice-ai.sessionId');
  if (previousSessionId !== id) {
    invalidateProductMatchCatalogCache();
  }

  _sessionId = id;
  if (id) {
    localStorage.setItem('smart-invoice-ai.sessionId', id);
  } else {
    localStorage.removeItem('smart-invoice-ai.sessionId');
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const sessionId = getSessionId();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(body.error || response.statusText, response.status);
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type DocumentUploadInput = {
  files: File[];
  agencyId: string;
  format: import('../types').AgentType;
  batchId?: string;
};

function createDocumentUploadBatchId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  return randomUUID
    ? randomUUID()
    : `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function chunkDocumentUploadFiles(files: File[]): File[][] {
  const chunks: File[][] = [];
  let currentChunk: File[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const fileSize = Math.max(0, file.size);
    const exceedsFileCount = currentChunk.length >= DOCUMENT_UPLOAD_CHUNK_MAX_FILES;
    const exceedsByteBudget =
      currentChunk.length > 0 && currentBytes + fileSize > DOCUMENT_UPLOAD_CHUNK_MAX_BYTES;

    if (exceedsFileCount || exceedsByteBudget) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentBytes = 0;
    }

    currentChunk.push(file);
    currentBytes += fileSize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function uploadDocumentChunk(
  input: DocumentUploadInput,
): Promise<import('../types').DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('agencyId', input.agencyId);
  formData.append('format', input.format);
  if (input.batchId) {
    formData.append('batchId', input.batchId);
  }

  input.files.forEach((file) => formData.append('files', file));

  return request('/documents/upload', {
    method: 'POST',
    body: formData,
  });
}

export interface BatchResultsQuery {
  agencyId?: string;
  processedFrom?: string;
  processedTo?: string;
  limit?: number;
}

// ── Auth ──

interface LoginResponse {
  session: { id: string; userId: string; expiresAt: string };
  user: import('../types').User;
}

interface SessionResponse {
  session: { id: string; userId: string; expiresAt: string };
  user: import('../types').User;
}

export const api = {
  // ── Auth ──
  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setSessionId(result.session.id);
    return result;
  },

  async getSession(): Promise<SessionResponse | null> {
    if (!getSessionId()) return null;
    try {
      return await request<SessionResponse>('/auth/session');
    } catch {
      setSessionId(null);
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/session', { method: 'DELETE' });
    } finally {
      setSessionId(null);
    }
  },

  // ── Users ──
  async getUsers(): Promise<import('../types').User[]> {
    return request('/users');
  },

  async createUser(user: import('../types').User): Promise<import('../types').User> {
    return request('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  },

  async updateUser(user: import('../types').User): Promise<import('../types').User> {
    return request(`/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    });
  },

  async deleteUser(id: string): Promise<void> {
    await request(`/users/${id}`, { method: 'DELETE' });
  },

  // ── Agencies ──
  async getAgencies(): Promise<import('../types').Agency[]> {
    return request('/agencies');
  },

  async createAgency(agency: import('../types').Agency): Promise<import('../types').Agency> {
    return request('/agencies', {
      method: 'POST',
      body: JSON.stringify(agency),
    });
  },

  async updateAgency(agency: import('../types').Agency): Promise<import('../types').Agency> {
    return request(`/agencies/${agency.id}`, {
      method: 'PUT',
      body: JSON.stringify(agency),
    });
  },

  async deleteAgency(id: string): Promise<void> {
    await request(`/agencies/${id}`, { method: 'DELETE' });
  },

  async bumpAgencyUsage(id: string, increment: number): Promise<import('../types').Agency> {
    return request(`/agencies/${id}/usage`, {
      method: 'PATCH',
      body: JSON.stringify({ increment }),
    });
  },

  // ── Product Matches ──
  async getProductMatches(agencyId: string): Promise<import('../types').ProductMatchCatalogItem[]> {
    return request(`/product-matches?agencyId=${encodeURIComponent(agencyId)}`);
  },

  async getPendingProductMatches(
    agencyId: string,
  ): Promise<import('../types').PendingProductMatchResponse> {
    return request(`/product-matches/pending?agencyId=${encodeURIComponent(agencyId)}`);
  },

  async createPendingProductMatch(
    item: import('../types').PendingProductMatchCreateInput,
  ): Promise<import('../types').ProductMatchCatalogItem> {
    return request('/product-matches/pending', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  async createProductMatch(
    item: import('../types').ProductMatchCatalogItem,
  ): Promise<import('../types').ProductMatchCatalogItem> {
    return request('/product-matches', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  async updateProductMatch(
    item: import('../types').ProductMatchCatalogItem,
  ): Promise<import('../types').ProductMatchCatalogItem> {
    return request(`/product-matches/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  },

  async deleteProductMatch(id: string): Promise<void> {
    await request(`/product-matches/${id}`, {
      method: 'DELETE',
    });
  },

  async bootstrapProductMatches(
    agencyId: string,
  ): Promise<import('../types').ProductMatchBootstrapResult> {
    return request('/product-matches/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ agencyId }),
    });
  },

  async downloadProductMatchTemplate(agencyId: string): Promise<void> {
    const sessionId = getSessionId();
    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }

    const response = await fetch(
      `${API_BASE}/product-matches/template?agencyId=${encodeURIComponent(agencyId)}`,
      {
        headers,
      },
    );

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: 'Error al descargar la plantilla.' }));
      throw new ApiError(body.error || response.statusText, response.status);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `plantilla-match-productos-${agencyId}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },

  async importProductMatches(
    agencyId: string,
    file: File,
  ): Promise<{ ok: boolean; importedCount: number; duplicateCount?: number; message?: string }> {
    const formData = new FormData();
    formData.append('agencyId', agencyId);
    formData.append('file', file);

    const sessionId = getSessionId();
    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }

    const response = await fetch(`${API_BASE}/product-matches/import`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Error al importar el archivo.' }));
      throw new ApiError(body.error || response.statusText, response.status);
    }

    return response.json();
  },

  // ── Plans ──
  async getPlans(): Promise<import('../types').SubscriptionPlan[]> {
    return request('/plans');
  },

  // ── Batch ──
  async getBatchResults(
    queryInput?: string | BatchResultsQuery,
  ): Promise<import('../types').BatchItem[]> {
    const params = typeof queryInput === 'string' ? { agencyId: queryInput } : queryInput || {};
    const search = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    });

    const query = search.toString();
    return request(`/batch${query ? `?${query}` : ''}`);
  },

  async saveBatchResults(items: import('../types').BatchItem[]): Promise<void> {
    await request('/batch', {
      method: 'POST',
      body: JSON.stringify(items),
    });
  },

  async updateBatchItem(item: import('../types').BatchItem): Promise<import('../types').BatchItem> {
    return request(`/batch/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    });
  },

  async markBatchItemReviewed(id: string): Promise<import('../types').BatchItem> {
    return request(`/batch/${id}/reviewed`, {
      method: 'PATCH',
    });
  },

  async deleteBatchItems(
    ids: string[],
  ): Promise<{ ok: boolean; count: number; deletedIds: string[] }> {
    return request('/batch/items', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    });
  },

  async clearBatchResults(agencyId?: string): Promise<void> {
    const query = agencyId ? `?agencyId=${agencyId}` : '';
    await request(`/batch${query}`, { method: 'DELETE' });
  },

  // ── Audit ──
  async getDocumentProcessingAudit(
    params: import('../types').DocumentProcessingAuditQuery = {},
  ): Promise<import('../types').DocumentProcessingAuditEntry[]> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        search.set(key, value);
      }
    });

    const query = search.toString();
    return request(`/audit/document-processing${query ? `?${query}` : ''}`);
  },

  async getGeminiExtractionEvents(
    params: import('../types').GeminiExtractionEventQuery = {},
  ): Promise<import('../types').GeminiExtractionEventListResponse> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    });

    const query = search.toString();
    return request(`/audit/gemini-extraction-events${query ? `?${query}` : ''}`);
  },

  // ── AI Review / Mejora continua ──
  async getLatestAiReviewRun(
    params: {
      agencyId?: string;
      date?: string;
    } = {},
  ): Promise<import('../types').AiReviewRunResponse> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    });

    const query = search.toString();
    return request(`/ai-review/runs/latest${query ? `?${query}` : ''}`);
  },

  async createAiReviewRun(input: {
    agencyId?: string;
    reviewDate: string;
  }): Promise<import('../types').AiReviewRunResponse> {
    return request('/ai-review/runs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getAiReviewRun(id: string): Promise<import('../types').AiReviewRunResponse> {
    return request(`/ai-review/runs/${encodeURIComponent(id)}`);
  },

  async getAiReviewItem(id: string): Promise<import('../types').AiReviewDetailResponse> {
    return request(`/ai-review/items/${encodeURIComponent(id)}`);
  },

  async analyzeAiReviewItem(id: string): Promise<import('../types').AiReviewAnalyzeResponse> {
    return request(`/ai-review/items/${encodeURIComponent(id)}/analyze`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async getAiReviewItemPdfBlobUrl(itemId: string): Promise<string> {
    const sessionId = getSessionId();
    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }

    const response = await fetch(`${API_BASE}/ai-review/items/${encodeURIComponent(itemId)}/pdf`, {
      headers,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Error al cargar el PDF.' }));
      throw new ApiError(body.error || response.statusText, response.status);
    }

    return URL.createObjectURL(await response.blob());
  },

  // ── Documents / Background AI queue ──
  async getDocuments(
    params: import('../types').DocumentListQuery = {},
  ): Promise<import('../types').DocumentListResponse> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    });

    const query = search.toString();
    return request(`/documents${query ? `?${query}` : ''}`);
  },

  async getDocumentStatus(id: string): Promise<import('../types').DocumentJob> {
    return request(`/documents/status/${encodeURIComponent(id)}`);
  },

  async uploadDocuments(
    input: DocumentUploadInput,
  ): Promise<import('../types').DocumentUploadResponse> {
    const chunks = chunkDocumentUploadFiles(input.files);
    const sharedBatchId =
      input.batchId || (chunks.length > 1 ? createDocumentUploadBatchId() : undefined);
    const combined: import('../types').DocumentUploadResponse = {
      batchId: sharedBatchId || '',
      count: 0,
      jobs: [],
      errors: [],
    };

    for (const files of chunks) {
      try {
        const response = await uploadDocumentChunk({
          ...input,
          files,
          batchId: sharedBatchId,
        });

        combined.batchId = combined.batchId || response.batchId;
        combined.count += response.count;
        combined.jobs.push(...response.jobs);
        combined.errors.push(...(response.errors || []));
      } catch (error) {
        if (!(error instanceof ApiError) || error.status === 401 || error.status === 403) {
          throw error;
        }

        combined.errors.push(
          ...files.map((file) => ({
            fileName: file.name,
            error: error.message,
          })),
        );
      }
    }

    return combined;
  },

  async processDocuments(input: {
    jobIds?: string[];
    batchId?: string;
    agencyId: string;
  }): Promise<import('../types').DocumentProcessResponse> {
    return request('/documents/process', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async deleteDocuments(input: {
    jobIds: string[];
    agencyId: string;
  }): Promise<import('../types').DocumentDeleteResponse> {
    return request('/documents', {
      method: 'DELETE',
      body: JSON.stringify(input),
    });
  },

  async getDocumentPreviewBlobUrl(documentJobId: string): Promise<string> {
    const sessionId = getSessionId();
    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['X-Session-Id'] = sessionId;
    }

    const response = await fetch(
      `${API_BASE}/documents/${encodeURIComponent(documentJobId)}/preview`,
      {
        headers,
      },
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Error al cargar el PDF.' }));
      throw new ApiError(body.error || response.statusText, response.status);
    }

    return URL.createObjectURL(await response.blob());
  },

  // ── Operational ──
  async getReconciliation(
    agencyId: string,
    date: string,
  ): Promise<import('../types').AwbReconciliationRow[]> {
    return request(
      `/operational/reconciliation?agencyId=${encodeURIComponent(agencyId)}&date=${encodeURIComponent(date)}`,
    );
  },

  async createBookedAwb(record: import('../types').BookedAwbRecord): Promise<void> {
    await request('/operational/booked', {
      method: 'POST',
      body: JSON.stringify(record),
    });
  },

  // ── Settings ──
  async getSetting(key: string): Promise<string | null> {
    const result = await request<{ key: string; value: string | null }>(`/settings/${key}`);
    return result.value;
  },

  async setSetting(key: string, value: string): Promise<void> {
    await request(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  },

  async testIntegration(input: {
    agencyId: string;
    useClientMapping?: boolean;
    documents?: import('../types').BatchExportDocument[];
  }): Promise<import('../types').IntegrationEndpointResponse> {
    return request('/integrate/test', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async sendToIntegration(input: {
    agencyId: string;
    documents: import('../types').BatchExportDocument[];
    useClientMapping?: boolean;
    source?: import('../types').IntegrationDeliverySource;
    exportReference?: string;
    exportFilename?: string;
  }): Promise<import('../types').IntegrationEndpointResponse> {
    return request('/integrate/send', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getIntegrationLogs(agencyId: string): Promise<import('../types').IntegrationDeliveryLog[]> {
    return request(`/integrate/logs/${encodeURIComponent(agencyId)}`);
  },

  async extractLogisticsData(
    file: File,
    format: import('../types').AgentType,
  ): Promise<import('../types').InvoiceData> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('format', format);

    return request('/ai/extract', {
      method: 'POST',
      body: formData,
    });
  },

  // ── Health ──
  async health(): Promise<{ status: string; db: string; time: string }> {
    return request('/health');
  },
};

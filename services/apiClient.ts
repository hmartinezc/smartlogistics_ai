// ============================================
// API CLIENT — Capa de comunicación con el backend
// ============================================
// Reemplaza localStorage con llamadas HTTP a /api/*
// Todas las funciones retornan Promises
// ============================================

const API_BASE = '/api';

// Almacén de sessionId en memoria (también en localStorage como backup)
let _sessionId: string | null = null;

function getSessionId(): string | null {
  if (_sessionId) return _sessionId;
  _sessionId = localStorage.getItem('smart-invoice-ai.sessionId');
  return _sessionId;
}

function setSessionId(id: string | null): void {
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
  async getBatchResults(agencyId?: string): Promise<import('../types').BatchItem[]> {
    const query = agencyId ? `?agencyId=${agencyId}` : '';
    return request(`/batch${query}`);
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

  async uploadDocuments(input: {
    files: File[];
    agencyId: string;
    format: import('../types').AgentType;
    batchId?: string;
  }): Promise<import('../types').DocumentUploadResponse> {
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

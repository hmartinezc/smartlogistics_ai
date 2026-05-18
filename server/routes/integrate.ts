import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { InValue } from '@libsql/client';
import {
  applyFieldMappingsToDocuments,
  buildIntegrationTestDocuments,
  hasEnabledIntegrationEndpoint,
  normalizeIntegrationConfig,
} from '../../shared/integrationConfig.js';
import type {
  AgencyIntegrationConfig,
  BatchExportDocument,
  IntegrationDeliveryEventType,
  IntegrationDeliverySource,
} from '../../types.js';
import { getDb } from '../db.js';
import { ensureAgencyAccess, requireAuth, requireRole } from '../security.js';

const integrate = new Hono();

type IntegrationPayload = {
  agencyId: string;
  documents?: BatchExportDocument[];
  useClientMapping?: boolean;
  source?: IntegrationDeliverySource;
  exportReference?: string;
  exportFilename?: string;
};

function truncateResponseBody(value: string): string {
  return value.length <= 4000 ? value : `${value.slice(0, 4000)}...`;
}

function buildAuthHeaders(config: AgencyIntegrationConfig['endpoint']): Record<string, string> {
  const headers: Record<string, string> = {};

  if (config.authType === 'bearer' && config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  }

  if (config.authType === 'apiKey' && config.apiKeyValue) {
    headers[config.apiKeyHeader || 'X-API-Key'] = config.apiKeyValue;
  }

  if (config.authType === 'basic' && (config.basicUsername || config.basicPassword)) {
    const credentials = Buffer.from(
      `${config.basicUsername || ''}:${config.basicPassword || ''}`,
      'utf-8',
    ).toString('base64');
    headers.Authorization = `Basic ${credentials}`;
  }

  config.headers.forEach((header) => {
    if (header.key && header.value) {
      headers[header.key] = header.value;
    }
  });

  return headers;
}

async function loadAgencyIntegrationConfig(
  agencyId: string,
): Promise<AgencyIntegrationConfig | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT integration_config FROM agencies WHERE id = ?',
    args: [agencyId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const rawValue = result.rows[0].integration_config;
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeIntegrationConfig(JSON.parse(String(rawValue)));
  } catch {
    return null;
  }
}

async function persistIntegrationDeliveryLog(input: {
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
}): Promise<string> {
  const db = getDb();
  const logId = randomUUID();

  await db.execute({
    sql: `INSERT INTO integration_delivery_logs (
            id,
            agency_id,
            event_type,
            source,
            export_reference,
            export_filename,
            endpoint_url,
            request_document_count,
            used_client_mapping,
            response_status,
            response_body,
            success,
            error,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      logId,
      input.agencyId,
      input.eventType,
      input.source,
      input.exportReference || null,
      input.exportFilename || null,
      input.endpointUrl,
      input.requestDocumentCount,
      input.usedClientMapping ? 1 : 0,
      input.responseStatus ?? null,
      input.responseBody || null,
      input.success ? 1 : 0,
      input.error || null,
    ] as InValue[],
  });

  return logId;
}

async function deliverToExternalEndpoint(input: {
  agencyId: string;
  eventType: IntegrationDeliveryEventType;
  source: IntegrationDeliverySource;
  exportReference?: string;
  exportFilename?: string;
  documents: BatchExportDocument[];
  useClientMapping: boolean;
}): Promise<{
  ok: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  usedClientMapping: boolean;
  deliveryId?: string;
}> {
  const integrationConfig = await loadAgencyIntegrationConfig(input.agencyId);
  if (!hasEnabledIntegrationEndpoint(integrationConfig)) {
    return {
      ok: false,
      error: 'La agencia no tiene un endpoint activo configurado.',
      usedClientMapping: false,
    };
  }

  const safeIntegrationConfig = integrationConfig as AgencyIntegrationConfig;
  const endpointConfig = safeIntegrationConfig.endpoint;

  const payload = applyFieldMappingsToDocuments(
    input.documents,
    safeIntegrationConfig,
    input.useClientMapping,
  );

  const headers = {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(endpointConfig),
  };

  try {
    const response = await fetch(endpointConfig.url, {
      method: endpointConfig.method,
      headers,
      body: JSON.stringify(payload),
    });

    const responseBody = truncateResponseBody(await response.text());
    const success = response.ok;
    const deliveryId = await persistIntegrationDeliveryLog({
      agencyId: input.agencyId,
      eventType: input.eventType,
      source: input.source,
      exportReference: input.exportReference,
      exportFilename: input.exportFilename,
      endpointUrl: endpointConfig.url,
      requestDocumentCount: input.documents.length,
      usedClientMapping: input.useClientMapping,
      responseStatus: response.status,
      responseBody,
      success,
      error: success ? undefined : `Endpoint respondió ${response.status}`,
    });

    return {
      ok: success,
      statusCode: response.status,
      responseBody,
      error: success ? undefined : `Endpoint respondió ${response.status}`,
      usedClientMapping: input.useClientMapping,
      deliveryId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    const deliveryId = await persistIntegrationDeliveryLog({
      agencyId: input.agencyId,
      eventType: input.eventType,
      source: input.source,
      exportReference: input.exportReference,
      exportFilename: input.exportFilename,
      endpointUrl: endpointConfig.url,
      requestDocumentCount: input.documents.length,
      usedClientMapping: input.useClientMapping,
      success: false,
      error: message,
    });

    return {
      ok: false,
      error: message,
      usedClientMapping: input.useClientMapping,
      deliveryId,
    };
  }
}

integrate.post('/test', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const roleError = requireRole(c, authUser, ['ADMIN']);
  if (roleError) {
    return roleError;
  }

  const body = (await c.req.json()) as IntegrationPayload;
  const agencyId = String(body.agencyId || '');
  if (!agencyId) {
    return c.json({ error: 'agencyId es requerido.' }, 400);
  }

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const result = await deliverToExternalEndpoint({
    agencyId,
    eventType: 'TEST',
    source: 'integration_config',
    documents:
      Array.isArray(body.documents) && body.documents.length > 0
        ? body.documents
        : buildIntegrationTestDocuments(),
    useClientMapping: body.useClientMapping !== false,
  });

  return c.json(result);
});

integrate.post('/send', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const body = (await c.req.json()) as IntegrationPayload;
  const agencyId = String(body.agencyId || '');
  const documents = Array.isArray(body.documents) ? body.documents : [];

  if (!agencyId) {
    return c.json({ error: 'agencyId es requerido.' }, 400);
  }

  if (documents.length === 0) {
    return c.json({ error: 'documents es requerido.' }, 400);
  }

  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const result = await deliverToExternalEndpoint({
    agencyId,
    eventType: 'EXPORT',
    source: body.source || 'history_results',
    exportReference: body.exportReference,
    exportFilename: body.exportFilename,
    documents,
    useClientMapping: body.useClientMapping !== false,
  });

  return c.json(result);
});

integrate.get('/logs/:agencyId', async (c) => {
  const authUser = await requireAuth(c);
  if (authUser instanceof Response) {
    return authUser;
  }

  const agencyId = c.req.param('agencyId');
  const accessError = ensureAgencyAccess(c, authUser, agencyId);
  if (accessError) {
    return accessError;
  }

  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM integration_delivery_logs WHERE agency_id = ? ORDER BY created_at DESC LIMIT 20`,
    args: [agencyId],
  });

  return c.json(
    result.rows.map((row) => ({
      id: String(row.id),
      agencyId: String(row.agency_id),
      eventType: String(row.event_type),
      source: String(row.source),
      exportReference: row.export_reference ? String(row.export_reference) : undefined,
      exportFilename: row.export_filename ? String(row.export_filename) : undefined,
      endpointUrl: String(row.endpoint_url),
      requestDocumentCount: Number(row.request_document_count || 0),
      usedClientMapping: Boolean(row.used_client_mapping),
      responseStatus: row.response_status ? Number(row.response_status) : undefined,
      responseBody: row.response_body ? String(row.response_body) : undefined,
      success: Boolean(row.success),
      error: row.error ? String(row.error) : undefined,
      createdAt: row.created_at ? String(row.created_at) : undefined,
    })),
  );
});

export default integrate;

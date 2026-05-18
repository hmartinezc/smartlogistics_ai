import type {
  AgencyIntegrationConfig,
  AgencyIntegrationEndpointConfig,
  BatchExportDocument,
  IntegrationAuthType,
  IntegrationEndpointHeader,
  IntegrationHttpMethod,
} from '../types';

type IntegrationFieldSection = 'meta' | 'invoice' | 'lineItems' | 'match';

export interface IntegrationFieldDefinition {
  path: string;
  label: string;
  section: IntegrationFieldSection;
  description: string;
}

const DEFAULT_HTTP_METHOD: IntegrationHttpMethod = 'POST';
const DEFAULT_AUTH_TYPE: IntegrationAuthType = 'none';
const DEFAULT_API_KEY_HEADER = 'X-API-Key';

export const INTEGRATION_FIELD_DEFINITIONS: IntegrationFieldDefinition[] = [
  {
    path: 'filename',
    label: 'Nombre archivo',
    section: 'meta',
    description: 'Nombre del PDF original exportado.',
  },
  {
    path: 'processedAt',
    label: 'Procesado',
    section: 'meta',
    description: 'Fecha/hora en que se procesó el documento.',
  },
  {
    path: 'invoiceNumber',
    label: 'Invoice Number',
    section: 'invoice',
    description: 'Número comercial de la factura.',
  },
  {
    path: 'date',
    label: 'Fecha factura',
    section: 'invoice',
    description: 'Fecha principal del documento.',
  },
  {
    path: 'shipperName',
    label: 'Shipper Name',
    section: 'invoice',
    description: 'Nombre del exportador.',
  },
  {
    path: 'shipperAddress',
    label: 'Shipper Address',
    section: 'invoice',
    description: 'Dirección del exportador.',
  },
  {
    path: 'consigneeName',
    label: 'Consignee Name',
    section: 'invoice',
    description: 'Nombre del consignatario.',
  },
  {
    path: 'consigneeAddress',
    label: 'Consignee Address',
    section: 'invoice',
    description: 'Dirección del consignatario.',
  },
  { path: 'mawb', label: 'MAWB', section: 'invoice', description: 'Master airway bill.' },
  { path: 'hawb', label: 'HAWB', section: 'invoice', description: 'House airway bill.' },
  { path: 'airline', label: 'Airline', section: 'invoice', description: 'Aerolínea reportada.' },
  {
    path: 'freightForwarder',
    label: 'Freight Forwarder',
    section: 'invoice',
    description: 'Forwarder o agente de carga.',
  },
  {
    path: 'ruc',
    label: 'RUC',
    section: 'invoice',
    description: 'Identificador fiscal del exportador.',
  },
  { path: 'dae', label: 'DAE', section: 'invoice', description: 'Documento aduanero electrónico.' },
  {
    path: 'totalPieces',
    label: 'Total Pieces',
    section: 'invoice',
    description: 'Piezas totales de la factura.',
  },
  {
    path: 'totalEq',
    label: 'Total EQ',
    section: 'invoice',
    description: 'EQ total de la factura.',
  },
  { path: 'totalStems', label: 'Total Stems', section: 'invoice', description: 'Tallos totales.' },
  {
    path: 'totalValue',
    label: 'Total Value',
    section: 'invoice',
    description: 'Valor total de la factura.',
  },
  {
    path: 'confidenceScore',
    label: 'Confidence Score',
    section: 'invoice',
    description: 'Confianza de extracción IA.',
  },
  {
    path: 'lineItems',
    label: 'Line Items',
    section: 'lineItems',
    description: 'Colección de ítems exportados.',
  },
  {
    path: 'lineItems[].boxType',
    label: 'Item Box Type',
    section: 'lineItems',
    description: 'Tipo de caja o pieza.',
  },
  {
    path: 'lineItems[].totalPieces',
    label: 'Item Total Pieces',
    section: 'lineItems',
    description: 'Piezas por ítem.',
  },
  {
    path: 'lineItems[].eqFull',
    label: 'Item EQ Full',
    section: 'lineItems',
    description: 'Equivalente full por ítem.',
  },
  {
    path: 'lineItems[].productDescription',
    label: 'Item Product Description',
    section: 'lineItems',
    description: 'Descripción de producto.',
  },
  {
    path: 'lineItems[].varieties',
    label: 'Item Varieties',
    section: 'lineItems',
    description: 'Variedades detectadas.',
  },
  {
    path: 'lineItems[].hts',
    label: 'Item HTS',
    section: 'lineItems',
    description: 'HTS extraído.',
  },
  {
    path: 'lineItems[].nandina',
    label: 'Item NANDINA',
    section: 'lineItems',
    description: 'NANDINA extraído.',
  },
  {
    path: 'lineItems[].totalStems',
    label: 'Item Total Stems',
    section: 'lineItems',
    description: 'Tallos por ítem.',
  },
  {
    path: 'lineItems[].unitPrice',
    label: 'Item Unit Price',
    section: 'lineItems',
    description: 'Precio unitario.',
  },
  {
    path: 'lineItems[].totalValue',
    label: 'Item Total Value',
    section: 'lineItems',
    description: 'Valor por ítem.',
  },
  {
    path: 'lineItems[].match',
    label: 'Match',
    section: 'match',
    description: 'Objeto con equivalencias del catálogo.',
  },
  {
    path: 'lineItems[].match.clientProductCode',
    label: 'Match Product Code',
    section: 'match',
    description: 'Código homologado del cliente.',
  },
  {
    path: 'lineItems[].match.clientProductDescription',
    label: 'Match Product Description',
    section: 'match',
    description: 'Descripción homologada del cliente.',
  },
  {
    path: 'lineItems[].match.htsMatch',
    label: 'Match HTS',
    section: 'match',
    description: 'HTS homologado del cliente.',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeHttpMethod(value: unknown): IntegrationHttpMethod {
  return value === 'PUT' ? 'PUT' : DEFAULT_HTTP_METHOD;
}

function sanitizeAuthType(value: unknown): IntegrationAuthType {
  return value === 'bearer' || value === 'apiKey' || value === 'basic' ? value : DEFAULT_AUTH_TYPE;
}

function sanitizeHeaders(value: unknown): IntegrationEndpointHeader[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      if (!isRecord(entry)) {
        return null;
      }

      const key = sanitizeText(entry.key);
      const headerValue = sanitizeText(entry.value);
      if (!key || !headerValue) {
        return null;
      }

      return {
        id: sanitizeText(entry.id) || `header_${index}`,
        key,
        value: headerValue,
      };
    })
    .filter((entry): entry is IntegrationEndpointHeader => Boolean(entry));
}

function sanitizeFieldMappings(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const allowedPaths = new Set(INTEGRATION_FIELD_DEFINITIONS.map((field) => field.path));
  const nextMappings: Record<string, string> = {};

  Object.entries(value).forEach(([path, mappedName]) => {
    const sanitizedPath = sanitizeText(path);
    const sanitizedMappedName = sanitizeText(mappedName);
    if (!sanitizedPath || !sanitizedMappedName || !allowedPaths.has(sanitizedPath)) {
      return;
    }

    nextMappings[sanitizedPath] = sanitizedMappedName;
  });

  return nextMappings;
}

export function createDefaultIntegrationConfig(): AgencyIntegrationConfig {
  return {
    fieldMappings: {},
    endpoint: {
      enabled: false,
      url: '',
      method: DEFAULT_HTTP_METHOD,
      authType: DEFAULT_AUTH_TYPE,
      bearerToken: '',
      apiKeyHeader: DEFAULT_API_KEY_HEADER,
      apiKeyValue: '',
      basicUsername: '',
      basicPassword: '',
      headers: [],
    },
  };
}

function normalizeEndpointConfig(value: unknown): AgencyIntegrationEndpointConfig {
  const defaults = createDefaultIntegrationConfig().endpoint;
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    enabled: value.enabled === true,
    url: sanitizeText(value.url),
    method: sanitizeHttpMethod(value.method),
    authType: sanitizeAuthType(value.authType),
    bearerToken: sanitizeText(value.bearerToken),
    apiKeyHeader: sanitizeText(value.apiKeyHeader) || DEFAULT_API_KEY_HEADER,
    apiKeyValue: sanitizeText(value.apiKeyValue),
    basicUsername: sanitizeText(value.basicUsername),
    basicPassword: sanitizeText(value.basicPassword),
    headers: sanitizeHeaders(value.headers),
  };
}

function hasEndpointDraft(endpoint: AgencyIntegrationEndpointConfig): boolean {
  return Boolean(
    endpoint.url ||
    endpoint.enabled ||
    endpoint.bearerToken ||
    endpoint.apiKeyValue ||
    endpoint.basicUsername ||
    endpoint.basicPassword ||
    endpoint.headers.length > 0,
  );
}

export function isValidIntegrationEndpointUrl(url: string): boolean {
  if (!url.trim()) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeIntegrationConfig(value: unknown): AgencyIntegrationConfig | null {
  const defaults = createDefaultIntegrationConfig();
  if (!isRecord(value)) {
    return null;
  }

  const fieldMappings = sanitizeFieldMappings(value.fieldMappings);
  const endpoint = normalizeEndpointConfig(value.endpoint);

  if (Object.keys(fieldMappings).length === 0 && !hasEndpointDraft(endpoint)) {
    return null;
  }

  return {
    ...defaults,
    fieldMappings,
    endpoint,
  };
}

export function hasClientFieldMappings(
  config: AgencyIntegrationConfig | null | undefined,
): boolean {
  return Boolean(config && Object.keys(config.fieldMappings).length > 0);
}

export function hasEnabledIntegrationEndpoint(
  config: AgencyIntegrationConfig | null | undefined,
): boolean {
  if (!config) {
    return false;
  }

  return config.endpoint.enabled && isValidIntegrationEndpointUrl(config.endpoint.url);
}

function mapObjectValue(
  value: Record<string, unknown>,
  pathPrefix: string,
  fieldMappings: Record<string, string>,
): Record<string, unknown> {
  const nextValue: Record<string, unknown> = {};

  Object.entries(value).forEach(([key, childValue]) => {
    const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    const mappedKey = fieldMappings[fieldPath] || key;

    if (Array.isArray(childValue)) {
      if (fieldPath === 'lineItems') {
        nextValue[mappedKey] = childValue.map((entry) =>
          isRecord(entry) ? mapObjectValue(entry, 'lineItems[]', fieldMappings) : entry,
        );
      } else {
        nextValue[mappedKey] = childValue.map((entry) =>
          isRecord(entry) ? mapObjectValue(entry, `${fieldPath}[]`, fieldMappings) : entry,
        );
      }
      return;
    }

    if (isRecord(childValue)) {
      nextValue[mappedKey] = mapObjectValue(childValue, fieldPath, fieldMappings);
      return;
    }

    nextValue[mappedKey] = childValue;
  });

  return nextValue;
}

export function applyFieldMappingsToDocuments(
  documents: BatchExportDocument[],
  config: AgencyIntegrationConfig | null | undefined,
  useClientMapping: boolean,
): unknown[] {
  if (!useClientMapping || !config || !hasClientFieldMappings(config)) {
    return documents;
  }

  return documents.map((document) =>
    mapObjectValue(document as unknown as Record<string, unknown>, '', config.fieldMappings),
  );
}

export function buildIntegrationTestDocuments(): BatchExportDocument[] {
  return [
    {
      filename: 'smart-invoice-test.pdf',
      processedAt: new Date().toISOString(),
      invoiceNumber: 'INV-TEST-001',
      date: '2026-05-17',
      shipperName: 'Smart Logistics Exporter',
      shipperAddress: 'Quito, Ecuador',
      consigneeName: 'Cliente Integracion',
      consigneeAddress: 'Miami, USA',
      mawb: '157-0383-4810',
      hawb: 'CMU-0055-9504',
      airline: 'AVIANCA',
      freightForwarder: 'SMART FORWARDER',
      ruc: '1799999999001',
      dae: 'DAE-TEST-001',
      totalPieces: 24,
      totalEq: 12,
      totalStems: 4800,
      totalValue: 1250.5,
      confidenceScore: 99,
      lineItems: [
        {
          boxType: 'QB',
          totalPieces: 24,
          eqFull: 12,
          productDescription: 'ROSE FREEDOM',
          varieties: ['FREEDOM'],
          hts: '0603110000',
          nandina: '0603110000',
          totalStems: 4800,
          unitPrice: 0.26,
          totalValue: 1250.5,
          match: {
            clientProductCode: 'CLIENT-ROSE-001',
            clientProductDescription: 'ROSE FREEDOM STD',
            htsMatch: '0603110000',
          },
        },
      ],
    },
  ];
}

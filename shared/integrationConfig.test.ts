import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AgencyIntegrationConfig, BatchExportDocument } from '../types.js';
import {
  applyFieldMappingsToDocuments,
  isValidIntegrationEndpointUrl,
  redactIntegrationConfigSecrets,
} from './integrationConfig.js';

const integrationConfig: AgencyIntegrationConfig = {
  fieldMappings: {
    invoiceNumber: 'invoice_id',
    mawb: 'master_awb',
    lineItems: 'items',
    'lineItems[].productDescription': 'client_product',
    'lineItems[].match.clientProductCode': 'client_code',
  },
  endpoint: {
    enabled: true,
    url: 'https://client.example/awb',
    method: 'POST',
    authType: 'apiKey',
    apiKeyHeader: 'X-Client-Key',
    apiKeyValue: 'api-key-fixture',
    headers: [{ id: 'header_1', key: 'X-Extra-Value', value: 'extra-value-fixture' }],
  },
};

const exportDocument: BatchExportDocument = {
  filename: 'invoice.pdf',
  processedAt: '2026-06-06T12:00:00.000Z',
  invoiceNumber: 'INV-001',
  date: '2026-06-06',
  shipperName: 'Exporter',
  shipperAddress: 'Quito',
  consigneeName: 'Client',
  consigneeAddress: 'Miami',
  mawb: '157-0383-4810',
  hawb: 'HAWB-001',
  airline: 'AIR',
  freightForwarder: 'Forwarder',
  ruc: '1799999999001',
  dae: 'DAE-001',
  totalPieces: 12,
  totalEq: 6,
  totalStems: 2400,
  totalValue: 700,
  confidenceScore: 99,
  lineItems: [
    {
      boxType: 'QB',
      totalPieces: 12,
      eqFull: 6,
      productDescription: 'ROSE FREEDOM',
      varieties: ['FREEDOM'],
      hts: '0603110000',
      nandina: '0603110000',
      totalStems: 2400,
      unitPrice: 0.29,
      totalValue: 700,
      match: {
        clientProductCode: 'CLIENT-ROSE',
        clientProductDescription: 'ROSE FREEDOM CLIENT',
        htsMatch: '0603110000',
      },
    },
  ],
};

describe('integration config helpers', () => {
  it('renames top-level and nested line item keys when client mapping is enabled', () => {
    const [mappedDocument] = applyFieldMappingsToDocuments(
      [exportDocument],
      integrationConfig,
      true,
    ) as Record<string, unknown>[];

    assert.equal(mappedDocument.invoice_id, 'INV-001');
    assert.equal(mappedDocument.master_awb, '157-0383-4810');
    assert.ok(!('invoiceNumber' in mappedDocument));
    assert.ok(!('mawb' in mappedDocument));

    const [mappedLineItem] = mappedDocument.items as Record<string, unknown>[];
    assert.equal(mappedLineItem.client_product, 'ROSE FREEDOM');

    const mappedMatch = mappedLineItem.match as Record<string, unknown>;
    assert.equal(mappedMatch.client_code, 'CLIENT-ROSE');
  });

  it('redacts endpoint secrets while preserving mapping and delivery metadata', () => {
    const redacted = redactIntegrationConfigSecrets(integrationConfig);

    assert.deepEqual(redacted?.fieldMappings, integrationConfig.fieldMappings);
    assert.equal(redacted?.endpoint.enabled, true);
    assert.equal(redacted?.endpoint.url, 'https://client.example/awb');
    assert.equal(redacted?.endpoint.method, 'POST');
    assert.equal(redacted?.endpoint.authType, 'apiKey');
    assert.equal(redacted?.endpoint.apiKeyHeader, 'X-Client-Key');
    assert.equal(redacted?.endpoint.bearerToken, '');
    assert.equal(redacted?.endpoint.apiKeyValue, '');
    assert.equal(redacted?.endpoint.basicUsername, '');
    assert.equal(redacted?.endpoint.basicPassword, '');
    assert.deepEqual(redacted?.endpoint.headers, [
      { id: 'header_1', key: 'X-Extra-Value', value: '' },
    ]);
  });

  it('rejects local and private integration endpoint URLs', () => {
    assert.equal(isValidIntegrationEndpointUrl('https://client.example/awb'), true);
    assert.equal(isValidIntegrationEndpointUrl('http://localhost:3001/callback'), false);
    assert.equal(isValidIntegrationEndpointUrl('http://127.0.0.1:9000/callback'), false);
    assert.equal(isValidIntegrationEndpointUrl('http://10.0.0.5/callback'), false);
    assert.equal(isValidIntegrationEndpointUrl('http://172.16.0.5/callback'), false);
    assert.equal(isValidIntegrationEndpointUrl('http://192.168.1.5/callback'), false);
    assert.equal(isValidIntegrationEndpointUrl('ftp://client.example/awb'), false);
  });
});

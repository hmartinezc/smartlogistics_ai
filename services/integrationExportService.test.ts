import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { Agency, BatchExportDocument, IntegrationEndpointResponse } from '../types.js';
import { createDefaultIntegrationConfig } from '../shared/integrationConfig.js';
import { api } from './apiClient.js';
import { executeIntegrationExport } from './integrationExportService.js';

const originalSendToIntegration = api.sendToIntegration;

afterEach(() => {
  api.sendToIntegration = originalSendToIntegration;
});

function buildExportDocument(): BatchExportDocument {
  return {
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
}

function buildAgency(): Agency {
  const integrationConfig = createDefaultIntegrationConfig();
  integrationConfig.fieldMappings = {
    invoiceNumber: 'invoice_id',
    mawb: 'master_awb',
  };
  integrationConfig.endpoint = {
    ...integrationConfig.endpoint,
    enabled: true,
    url: 'https://client.example/awb',
    authType: 'apiKey',
    apiKeyHeader: 'X-Client-Key',
    apiKeyValue: '',
  };

  return {
    id: 'agency_1',
    name: 'Agency 1',
    emails: ['ops@example.com'],
    planId: 'starter',
    currentUsage: 0,
    isActive: true,
    integrationConfig,
  };
}

describe('executeIntegrationExport', () => {
  it('sends to the backend when an operator receives redacted endpoint metadata', async () => {
    const agency = buildAgency();
    const documents = [buildExportDocument()];
    const calls: unknown[] = [];
    const deliveryResponse: IntegrationEndpointResponse = {
      ok: true,
      statusCode: 200,
      usedClientMapping: true,
      deliveryId: 'delivery_1',
    };

    api.sendToIntegration = async (input) => {
      calls.push(input);
      return deliveryResponse;
    };

    const result = await executeIntegrationExport({
      agency,
      documents,
      useClientMapping: true,
      source: 'operator_panel',
      exportReference: '157-0383-4810',
      exportFilename: 'export.json',
    });

    assert.equal(result.usedClientMapping, true);
    assert.deepEqual(result.deliveryResult, deliveryResponse);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      agencyId: 'agency_1',
      documents,
      useClientMapping: true,
      source: 'operator_panel',
      exportReference: '157-0383-4810',
      exportFilename: 'export.json',
    });

    const [exportedDocument] = result.exportedDocuments as Record<string, unknown>[];
    assert.equal(exportedDocument.invoice_id, 'INV-001');
    assert.equal(exportedDocument.master_awb, '157-0383-4810');
  });

  it('does not send to the backend when client mappings exist but native export is selected', async () => {
    const agency = buildAgency();
    const documents = [buildExportDocument()];
    const calls: unknown[] = [];

    api.sendToIntegration = async (input) => {
      calls.push(input);
      return {
        ok: true,
        statusCode: 200,
        usedClientMapping: false,
      };
    };

    const result = await executeIntegrationExport({
      agency,
      documents,
      useClientMapping: false,
      source: 'history_results',
      exportReference: '157-0383-4810',
      exportFilename: 'export.json',
    });

    assert.equal(result.usedClientMapping, false);
    assert.equal(result.deliveryResult, undefined);
    assert.equal(calls.length, 0);

    const [exportedDocument] = result.exportedDocuments as Record<string, unknown>[];
    assert.equal(exportedDocument.invoiceNumber, 'INV-001');
    assert.equal(exportedDocument.mawb, '157-0383-4810');
  });
});

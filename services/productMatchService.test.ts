import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InvoiceData, ProductMatchCatalogItem } from '../types.js';
import { enrichInvoiceDataWithMatches, normalizeProductMatchKey } from './productMatchService.js';

function buildCatalogItem(
  product: string,
  clientProductCode: string,
  productMatch = clientProductCode,
): ProductMatchCatalogItem {
  return {
    id: `match-${product}`,
    agencyId: 'agency-1',
    category: product,
    product,
    clientProductCode,
    productMatch,
    hts: '',
    htsMatch: '0603',
  };
}

function buildInvoiceData(): InvoiceData {
  return {
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
    totalPieces: 1,
    totalEq: 0.5,
    totalStems: 55750,
    totalValue: 100,
    confidenceScore: 99,
    lineItems: [
      {
        boxType: 'HB',
        totalPieces: 1,
        eqFull: 0.5,
        productDescription: 'MIXTAS',
        varieties: ['ROSAS:52444', 'RUSCUS:3306', 'FREEDOM'],
        hts: '0603',
        nandina: '0603',
        totalStems: 55750,
        unitPrice: 0.0018,
        totalValue: 100,
      },
    ],
  };
}

describe('enrichInvoiceDataWithMatches', () => {
  it('homologates compact varieties while preserving stem counts', () => {
    const lookup = new Map<string, ProductMatchCatalogItem>();
    for (const item of [
      buildCatalogItem('MIXTAS', 'MIXED'),
      buildCatalogItem('ROSAS', 'ROSES', 'ROSES CLIENT DESCRIPTION'),
    ]) {
      lookup.set(normalizeProductMatchKey(item.product), item);
    }

    const result = enrichInvoiceDataWithMatches(buildInvoiceData(), lookup);

    assert.equal(result.missingMatches, 1);
    assert.deepEqual(result.data.lineItems[0].varieties, ['ROSES:52444', 'RUSCUS:3306', 'FREEDOM']);
    assert.deepEqual(result.data.lineItems[0].match, {
      clientProductCode: 'MIXED',
      clientProductDescription: 'MIXED',
      htsMatch: '0603',
    });
  });
});

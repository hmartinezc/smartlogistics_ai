import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InvoiceData } from '../types';
import { normalizeInvoiceDataAirwaybills } from './airwaybillFormat';

function buildInvoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    airline: 'AIR',
    consigneeAddress: 'Consignee address',
    consigneeName: 'Consignee',
    confidenceReasons: [],
    confidenceScore: 100,
    dae: 'DAE',
    date: '2026-06-09',
    freightForwarder: 'Forwarder',
    hawb: 'CMU00582408',
    invoiceNumber: '50255545',
    lineItems: [
      {
        boxType: 'HB',
        eqFull: 0.5,
        hts: '0603.11.00.60',
        nandina: '0603.11.00.00',
        productDescription: 'ROSES',
        totalPieces: 1,
        totalStems: 200,
        totalValue: 132.48,
        unitPrice: 0.662399,
      },
    ],
    mawb: '14511953244',
    ruc: '1793198461001',
    shipperAddress: 'Shipper address',
    shipperName: 'POSITANO FARMS S.A.S.',
    totalEq: 0.5,
    totalPieces: 1,
    totalStems: 200,
    totalValue: 132.48,
    ...overrides,
  };
}

describe('normalizeInvoiceDataAirwaybills', () => {
  it('formats a HAWB that matches the saved pattern without lowering confidence', () => {
    const invoice = buildInvoice();

    const normalized = normalizeInvoiceDataAirwaybills(invoice, {
      hawbPattern: 'XXX-XXXX-XXXX',
    });

    assert.equal(normalized.hawb, 'CMU-0058-2408');
    assert.equal(normalized.confidenceScore, 100);
    assert.equal(normalized.confidenceReasons?.length, 0);
  });

  it('caps confidence at 70 when HAWB length does not match the saved pattern', () => {
    const invoice = buildInvoice({ hawb: 'CMU0582408' });

    const normalized = normalizeInvoiceDataAirwaybills(invoice, {
      hawbPattern: 'XXX-XXXX-XXXX',
    });

    assert.equal(normalized.hawb, 'CMU0582408');
    assert.equal(normalized.confidenceScore, 70);
    assert.equal(normalized.confidenceReasons?.[0]?.code, 'OCR_UNCERTAIN');
    assert.match(normalized.confidenceReasons?.[0]?.message || '', /HAWB length/);
  });

  it('preserves a lower existing confidence when HAWB length is suspicious', () => {
    const invoice = buildInvoice({
      confidenceScore: 55,
      hawb: 'CMU0582408',
    });

    const normalized = normalizeInvoiceDataAirwaybills(invoice, {
      hawbPattern: 'XXX-XXXX-XXXX',
    });

    assert.equal(normalized.confidenceScore, 55);
    assert.equal(normalized.confidenceReasons?.[0]?.code, 'OCR_UNCERTAIN');
  });
});

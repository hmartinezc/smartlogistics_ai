import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { GoogleGenAI } from '@google/genai';
import {
  buildExtractionDiffSummary,
  generateInvoiceWithGenaiRouterFilesDetailed,
} from './documentExtractionService.js';
import type { InvoiceData } from '../../types.js';

const baseInvoice: InvoiceData = {
  airline: 'AIR',
  consigneeAddress: '456 Client St',
  consigneeName: 'Client',
  confidenceReasons: [],
  confidenceScore: 100,
  dae: 'DAE',
  date: '2026-06-01',
  freightForwarder: 'Forwarder',
  hawb: 'HAWB',
  invoiceNumber: 'INV-1',
  lineItems: [
    {
      boxType: 'QB',
      eqFull: 0.25,
      hts: '',
      nandina: '',
      productDescription: 'ROSES',
      totalPieces: 1,
      totalStems: 100,
      totalValue: 10,
      unitPrice: 0.1,
    },
  ],
  mawb: 'MAWB',
  ruc: 'RUC',
  shipperAddress: '123 Shipper St',
  shipperName: 'Shipper',
  totalEq: 0.25,
  totalPieces: 1,
  totalStems: 100,
  totalValue: 10,
};

const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

before(() => {
  console.info = () => undefined;
  console.warn = () => undefined;
});

after(() => {
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
});

function response(text: unknown) {
  return {
    text: JSON.stringify(text),
    usageMetadata: {
      candidatesTokenCount: 3,
      promptTokenCount: 7,
      thoughtsTokenCount: 1,
      totalTokenCount: 11,
    },
  };
}

function createFakeAi(generateContent: (callIndex: number, input: unknown) => unknown) {
  let generateCalls = 0;
  let uploadCalls = 0;
  let deleteCalls = 0;
  const generateInputs: unknown[] = [];
  const uploadInputs: unknown[] = [];

  const fakeAi = {
    files: {
      delete: async () => {
        deleteCalls += 1;
        return {};
      },
      upload: async (input: unknown) => {
        uploadCalls += 1;
        uploadInputs.push(input);
        return {
          mimeType: 'application/pdf',
          name: 'files/test-pdf',
          uri: 'https://files.example/test-pdf',
        };
      },
    },
    models: {
      generateContent: async (input: unknown) => {
        generateCalls += 1;
        generateInputs.push(input);
        return generateContent(generateCalls, input);
      },
    },
  } as unknown as GoogleGenAI;

  return {
    fakeAi,
    get deleteCalls() {
      return deleteCalls;
    },
    get generateCalls() {
      return generateCalls;
    },
    get generateInputs() {
      return generateInputs;
    },
    get uploadCalls() {
      return uploadCalls;
    },
    get uploadInputs() {
      return uploadInputs;
    },
  };
}

describe('genai-router-files extraction', () => {
  it('uploads once, classifies, extracts and deletes the Gemini file', async () => {
    const fake = createFakeAi((callIndex) =>
      callIndex === 1
        ? response({ confidence: 0.96, tipoFactura: 'STANDARD_TABLE' })
        : response(baseInvoice),
    );

    const run = await generateInvoiceWithGenaiRouterFilesDetailed({
      agentType: 'AGENT_GENERIC_A',
      ai: fake.fakeAi,
      document: {
        buffer: Buffer.from('%PDF-test'),
        mimeType: 'application/pdf',
      },
    });

    assert.equal(fake.uploadCalls, 1);
    assert.equal(fake.generateCalls, 2);
    assert.equal(fake.deleteCalls, 1);
    assert.equal(
      (fake.uploadInputs[0] as { config?: { httpOptions?: unknown } }).config?.httpOptions,
      undefined,
    );
    assert.equal(run.result.invoiceNumber, 'INV-1');
    assert.equal(run.metrics.routerCategory, 'STANDARD_TABLE');
    assert.equal(run.metrics.fileDeleteOk, true);
  });

  it('retries classification once with medium thinking when confidence is low', async () => {
    const originalThinkingLevel = process.env.GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL;
    process.env.GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL = 'low';
    const fake = createFakeAi((callIndex) => {
      if (callIndex === 1) {
        return response({
          confidence: 0.3,
          tipoFactura: 'BOX_RANGES',
          visualSignals: ['box range unsure'],
        });
      }

      if (callIndex === 2) {
        return response({
          confidence: 0.95,
          tipoFactura: 'STANDARD_TABLE',
          visualSignals: ['direct table columns'],
        });
      }

      return response(baseInvoice);
    });

    try {
      const run = await generateInvoiceWithGenaiRouterFilesDetailed({
        agentType: 'AGENT_GENERIC_A',
        ai: fake.fakeAi,
        document: {
          buffer: Buffer.from('%PDF-test'),
          mimeType: 'application/pdf',
        },
      });

      const retryConfig = (
        fake.generateInputs[1] as { config?: { thinkingConfig?: { thinkingLevel?: string } } }
      ).config;

      assert.equal(fake.uploadCalls, 1);
      assert.equal(fake.generateCalls, 3);
      assert.equal(fake.deleteCalls, 1);
      assert.equal(retryConfig?.thinkingConfig?.thinkingLevel, 'MEDIUM');
      assert.equal(run.metrics.routerCategory, 'STANDARD_TABLE');
      assert.equal(run.metrics.routerConfidence, 0.95);
    } finally {
      if (originalThinkingLevel === undefined) {
        delete process.env.GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL;
      } else {
        process.env.GEMINI_ROUTER_CLASSIFIER_THINKING_LEVEL = originalThinkingLevel;
      }
    }
  });

  it('accepts the TESSA category and uses its specialized prompt', async () => {
    const fake = createFakeAi((callIndex) =>
      callIndex === 1
        ? response({
            confidence: 0.97,
            tipoFactura: 'TESSA',
            visualSignals: ['Commercial Invoice Print', 'EQ-FULL BOXES'],
          })
        : response(baseInvoice),
    );

    const run = await generateInvoiceWithGenaiRouterFilesDetailed({
      agentType: 'AGENT_GENERIC_A',
      ai: fake.fakeAi,
      document: {
        buffer: Buffer.from('%PDF-test'),
        mimeType: 'application/pdf',
      },
    });

    assert.equal(fake.generateCalls, 2);
    assert.equal(run.metrics.routerCategory, 'TESSA');
    assert.match(JSON.stringify(fake.generateInputs[1]), /TESSA Commercial Invoice Print/);
  });

  it('merges positive zero-piece child rows into the previous parent line item', async () => {
    const invoiceWithChildRows: InvoiceData = {
      ...baseInvoice,
      lineItems: [
        {
          boxType: 'QB',
          eqFull: 0.25,
          hts: '0603.19.012',
          nandina: '0603.19.90.90',
          productDescription: 'LISIANTHUS 70cm WHITE (Eustoma grandiflorum)',
          totalPieces: 1,
          totalStems: 50,
          totalValue: 22,
          unitPrice: 0.44,
        },
        {
          boxType: 'QB',
          eqFull: 0,
          hts: '0603.19.012',
          nandina: '0603.19.90.90',
          productDescription: 'LISIANTHUS 70cm PURPLE (Eustoma grandiflorum)',
          totalPieces: 0,
          totalStems: 50,
          totalValue: 22,
          unitPrice: 0.44,
        },
        {
          boxType: 'QB',
          eqFull: 0,
          hts: '0603.19.012',
          nandina: '0603.19.90.90',
          productDescription: 'LISIANTHUS 70cm MISTY BLUE (Eustoma grandiflorum)',
          totalPieces: 0,
          totalStems: 30,
          totalValue: 13.2,
          unitPrice: 0.44,
        },
        {
          boxType: 'QB',
          eqFull: 0,
          hts: '0603.19.012',
          nandina: '0603.19.90.90',
          productDescription: 'LISIANTHUS 70cm PINK (Eustoma grandiflorum)',
          totalPieces: 0,
          totalStems: 20,
          totalValue: 8.8,
          unitPrice: 0.44,
        },
      ],
      totalEq: 0.25,
      totalPieces: 1,
      totalStems: 150,
      totalValue: 66,
    };
    const fake = createFakeAi((callIndex) =>
      callIndex === 1
        ? response({ confidence: 0.98, tipoFactura: 'PARENT_CHILD_COMPOSITION' })
        : response(invoiceWithChildRows),
    );

    const run = await generateInvoiceWithGenaiRouterFilesDetailed({
      agentType: 'AGENT_GENERIC_A',
      ai: fake.fakeAi,
      document: {
        buffer: Buffer.from('%PDF-test'),
        mimeType: 'application/pdf',
      },
    });

    assert.equal(run.result.lineItems.length, 1);
    assert.equal(run.result.lineItems[0].totalPieces, 1);
    assert.equal(run.result.lineItems[0].eqFull, 0.25);
    assert.equal(run.result.lineItems[0].totalStems, 150);
    assert.equal(run.result.lineItems[0].totalValue, 66);
    assert.equal(run.result.lineItems[0].unitPrice, 0.44);
    assert.deepEqual(run.result.lineItems[0].varieties, [
      'LISIANTHUS 70cm PURPLE (Eustoma grandiflorum)',
      'LISIANTHUS 70cm MISTY BLUE (Eustoma grandiflorum)',
      'LISIANTHUS 70cm PINK (Eustoma grandiflorum)',
    ]);
  });

  it('deletes the Gemini file when classification fails', async () => {
    const fake = createFakeAi(() => {
      throw new Error('classifier failed');
    });

    await assert.rejects(
      () =>
        generateInvoiceWithGenaiRouterFilesDetailed({
          agentType: 'AGENT_GENERIC_A',
          ai: fake.fakeAi,
          document: {
            buffer: Buffer.from('%PDF-test'),
            mimeType: 'application/pdf',
          },
        }),
      /classifier failed/,
    );

    assert.equal(fake.uploadCalls, 1);
    assert.equal(fake.generateCalls, 1);
    assert.equal(fake.deleteCalls, 1);
  });

  it('deletes the Gemini file when specialized extraction fails', async () => {
    const fake = createFakeAi((callIndex) => {
      if (callIndex === 1) {
        return response({ tipoFactura: 'STANDARD_TABLE' });
      }

      throw new Error('extractor failed');
    });

    await assert.rejects(
      () =>
        generateInvoiceWithGenaiRouterFilesDetailed({
          agentType: 'AGENT_GENERIC_A',
          ai: fake.fakeAi,
          document: {
            buffer: Buffer.from('%PDF-test'),
            mimeType: 'application/pdf',
          },
        }),
      /extractor failed/,
    );

    assert.equal(fake.uploadCalls, 1);
    assert.equal(fake.generateCalls, 2);
    assert.equal(fake.deleteCalls, 1);
  });
});

describe('extraction comparison diff', () => {
  it('reports critical field differences', () => {
    const changedInvoice = {
      ...baseInvoice,
      totalValue: 12,
    };

    const diff = buildExtractionDiffSummary(baseInvoice, changedInvoice);

    assert.deepEqual(diff, [
      {
        field: 'totalValue',
        genaiRouterFiles: 12,
        legacy: 10,
      },
    ]);
  });
});

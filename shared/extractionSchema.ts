import { SchemaType, type Schema } from '@google/generative-ai';

export const invoiceExtractionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    invoiceNumber: { type: SchemaType.STRING, description: 'Commercial Invoice No.' },
    date: { type: SchemaType.STRING, description: 'Date of invoice in strict format YYYY-MM-DD' },
    shipperName: { type: SchemaType.STRING },
    shipperAddress: { type: SchemaType.STRING },
    consigneeName: { type: SchemaType.STRING },
    consigneeAddress: { type: SchemaType.STRING },
    mawb: { type: SchemaType.STRING },
    hawb: { type: SchemaType.STRING },
    airline: { type: SchemaType.STRING },
    freightForwarder: { type: SchemaType.STRING },
    ruc: { type: SchemaType.STRING },
    dae: { type: SchemaType.STRING },
    totalPieces: { type: SchemaType.NUMBER, description: 'The EXACT TOTAL pieces printed on the footer. If not printed, sum lines.' },
    totalEq: { type: SchemaType.NUMBER, description: 'The EXACT value printed for Full Boxes or EQ in the footer. Do NOT auto-correct based on lines.' },
    totalStems: { type: SchemaType.NUMBER },
    totalValue: { type: SchemaType.NUMBER },
    confidenceScore: { type: SchemaType.NUMBER, description: 'Calculated reliability score (0-100). Subtract points if Math mismatches.' },
    lineItems: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          boxType: { type: SchemaType.STRING, description: 'Extract the REAL box type (e.g. QB). If table says Box but footer says QB, use QB.' },
          totalPieces: { type: SchemaType.NUMBER, description: 'The calculated number of pieces for this row.' },
          eqFull: {
            type: SchemaType.NUMBER,
            description: 'CALCULATED FIELD. Formula: Pieces * Factor. (e.g. 2 QB = 0.50)',
          },
          productDescription: { type: SchemaType.STRING, description: 'The MAIN product description.' },
          varieties: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'If the item has sub-lines describing varieties without their own piece count, list them here.',
          },
          hts: { type: SchemaType.STRING },
          nandina: { type: SchemaType.STRING },
          totalStems: { type: SchemaType.NUMBER },
          unitPrice: { type: SchemaType.NUMBER },
          totalValue: { type: SchemaType.NUMBER },
        },
        required: ['boxType', 'totalPieces', 'eqFull', 'productDescription', 'totalValue'],
      },
    },
  },
  required: ['invoiceNumber', 'shipperName', 'lineItems', 'totalValue', 'confidenceScore', 'date'],
};

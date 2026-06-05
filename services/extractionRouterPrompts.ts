import { Type as SchemaType, type Schema } from '@google/genai';

export const ROUTER_INVOICE_CATEGORIES = [
  'STANDARD_TABLE',
  'BOX_RANGES',
  'SPLIT_BOX_COLUMNS',
  'EMBEDDED_BOX_PREFIX',
  'GLOBAL_BOX_SUMMARY',
  'CATEGORY_HEADER_COMPOSITION',
  'PARENT_CHILD_COMPOSITION',
  'FBE_BUNCH_PRICE',
  'SUMMARY_FINANCIAL_ONLY',
  'TESSA',
  'UNKNOWN_GENERAL',
] as const;

export type RouterInvoiceCategory = (typeof ROUTER_INVOICE_CATEGORIES)[number];

export interface RouterCategoryConfig {
  category: RouterInvoiceCategory;
  description: string;
  extractorPrompt: string;
}

export const routerClassificationSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    tipoFactura: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: [...ROUTER_INVOICE_CATEGORIES],
      description: 'The visual invoice format category.',
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: 'Classifier confidence from 0.0 to 1.0.',
    },
    visualSignals: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Up to 3 short visible cues used for classification.',
    },
  },
  required: ['tipoFactura', 'confidence', 'visualSignals'],
};

export const ROUTER_CLASSIFICATION_PROMPT = `
Classify the visible flower logistics invoice layout. Return only JSON.
Use these signatures:
STANDARD_TABLE=direct pieces/type/product/stems/price/value columns.
BOX_RANGES=BOX No. single numbers/ranges plus TB/type.
SPLIT_BOX_COLUMNS=separate QB/HB/FB quantity columns.
EMBEDDED_BOX_PREFIX=description starts with pieces/type/EQ tokens.
GLOBAL_BOX_SUMMARY=pieces/type only in a global note/logistics block.
CATEGORY_HEADER_COMPOSITION=visual product header groups varieties.
PARENT_CHILD_COMPOSITION=parent row has pieces/type, child rows blank.
FBE_BUNCH_PRICE=Boxes/FBE/Bunch/Stems price format.
SUMMARY_FINANCIAL_ONLY=detail rows have pieces/type/EQ; one summary row has product/stems/price/value.
TESSA=Commercial Invoice Print grid used by the TESSA flow, with *PIECE TYPE, TOTAL PIECES, EQ-FULL BOXES, PRODUCT DESCRIPTION, TOTAL-UNT STEMS, UNIT-PRICE, TOTAL VALUE.
Tie breakers:
- Classify the commercial invoice table, not APHIS/phytosanitary/botanical summaries.
- Prefer TESSA when the page title or table shows Commercial Invoice Print plus *PIECE TYPE / TOTAL PIECES / EQ-FULL BOXES / PRODUCT DESCRIPTION / TOTAL-UNT STEMS / UNIT-PRICE / TOTAL VALUE.
- Prefer FBE_BUNCH_PRICE when FBE/Bunch/Stems price columns appear.
- Prefer SPLIT_BOX_COLUMNS when visible quantity columns are named Quarter/Quaters/QB/QRT, Half/HB, Full/FB, even if stems/price/value columns also exist.
- Prefer BOX_RANGES when BOX No. contains ranges, even if other standard columns exist.
- Prefer GLOBAL_BOX_SUMMARY when commercial rows lack row-level pieces/type but a note prints pieces/type.
- Prefer SUMMARY_FINANCIAL_ONLY only when detail rows lack stems/price/value and a summary row has them.
- Prefer PARENT_CHILD_COMPOSITION when blank child rows describe a previous parent row.
- Prefer PARENT_CHILD_COMPOSITION, not STANDARD_TABLE, when the first row has PIECES TYPE/PIECES and following rows in the same product group have blank PIECES TYPE/PIECES but positive stems/value.
Use UNKNOWN_GENERAL when no signature is clearly dominant. confidence is 0..1. visualSignals must name visible cues.
`.trim();

const COMMON_EXTRACTION_RULES = `
Return strict JSON matching the provided schema. Use only visual evidence.
Keep invoice-level totalPieces, totalEq, totalStems and totalValue exactly as printed; backend validates math later.
If Invoice No. is missing but Packing No./Packing List is printed, use it as invoiceNumber and add MISSING_FIELD.
Normalize box types: FB/F/FX/FULL/P/PL=FB, HB/H/1/2/HALF=HB, QB/Q/1/4/QUARTER/QRT=QB, EB/E/1/8/OCTAVO/OCT=EB, DS/D/1/16/SPLIT=DS.
lineItem.eqFull = totalPieces * factor. Never return a positive commercial line with totalPieces=0.
Rows with blank pieces/type but positive stems/value are child/composition rows of the previous physical parent; never output them as separate zero-piece lineItems.
If a table has a dedicated Color/Colour column, do not place those values in productDescription or varieties. Ignore placeholder color values such as NINGUNO, NONE, N/A, or blank. Keep color-like words only when they are printed inside the Description/Product text itself.
Ignore zero placeholders only when pieces, stems and value are all zero/blank.
If printed box type is unknown, infer only when row/footer math proves a known factor; otherwise mark AMBIGUOUS_TABLE or MISSING_FIELD.
For line totals, use stems * unitPrice when the printed line total conflicts. Keep invoice totals printed.
APHIS/phytosanitary/botanical summaries are reference-only if a commercial table exists; do not create lineItems from them or replace commercial prices/totals with APHIS values.
Distribution reference when stems are not printed per row: Roses/Spray Roses QB=100 and HB=250; Gypsophila/Gypso QB=150; Alstroemeria QB=150; default QB=150 for other products only when QB rows exist.
Return confidenceScore for visual/OCR/table reliability only. At most 3 confidenceReasons. Each reason must contain only code: OCR_UNCERTAIN, MISSING_FIELD, AMBIGUOUS_TABLE, DOCUMENT_INCOMPLETE, OTHER.
`.trim();

export const ROUTER_CATEGORY_CONFIGS: Record<RouterInvoiceCategory, RouterCategoryConfig> = {
  STANDARD_TABLE: {
    category: 'STANDARD_TABLE',
    description: 'Rows have direct pieces/box type/product/stems/price/value columns.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: standard commercial table.
Extract one lineItem per positive commercial row with direct pieces and box type.
Ignore blank/zero placeholders only when pieces, stems and value are all zero/blank.
If a zero-piece row has positive stems/value, reconcile it with child/composition rules instead of dropping it.
For child/composition rows with blank pieces/type, attach their descriptions to the previous parent varieties and sum stems/value into that parent; do not output separate zero-piece rows.
Use footer totals for invoice totals when printed.
`.trim(),
  },
  BOX_RANGES: {
    category: 'BOX_RANGES',
    description:
      'A BOX No. column contains single numbers or inclusive ranges, often with TB/type.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: box number ranges.
Convert BOX No. ranges to pieces: "03"=1, "01-02"=2, "05-08"=4, end-start+1.
Use TB/type as box type code when present: Q=QB, H=HB, F=FB.
Continuation rows with blank BOX No. belong to the previous physical box.
If a continuation row has stems/price/value, merge it into the previous box row and compute weighted unitPrice when prices differ.
If a header says TOTAL BOXES with a decimal like 9,2500 while rows are Q/QB, treat it as totalEq/full boxes, not physical pieces.
If the box type OCR is corrupted but footer math proves the factor, normalize it and add OCR_UNCERTAIN.
`.trim(),
  },
  SPLIT_BOX_COLUMNS: {
    category: 'SPLIT_BOX_COLUMNS',
    description: 'Quantity columns are split by box type, such as Quarter/Half/Full.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: split box quantity columns.
Columns like Quarter/QB, Half/HB and Full/FB represent box quantities.
Split into separate lineItems only when stems/value are separable; otherwise use the dominant populated box type and mark AMBIGUOUS_TABLE.
When stems are not row-level separable, apply fixed product rules first: Roses/Spray Roses QB=100 and HB=250; Gypsophila/Gypso QB=150; Alstroemeria QB=150; default QB=150 only for QB rows.
If product rules do not cover all boxes, put remaining stems on the biggest EQ box; otherwise distribute by EQ proportion and adjust rounding so totalStems matches the footer exactly.
`.trim(),
  },
  EMBEDDED_BOX_PREFIX: {
    category: 'EMBEDDED_BOX_PREFIX',
    description: 'Product description starts with box quantity/type/EQ tokens.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: embedded box prefix in description.
Patterns like "9 QB 2.25 SUNFLOWER" mean pieces=9, boxType=QB, eqFull=2.25 when math matches.
Remove leading box tokens from productDescription and keep the actual product text.
Use row printed quantity/Cant. as totalStems when the unit is stems/tallos.
If embedded eqFull conflicts with pieces * factor, calculate eqFull from the math table and add AMBIGUOUS_TABLE.
`.trim(),
  },
  GLOBAL_BOX_SUMMARY: {
    category: 'GLOBAL_BOX_SUMMARY',
    description: 'Commercial rows have stems/value, while box pieces appear in a global note.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: global box summary.
Parse notes like "PIEZAS: 4HB", "12 QB", MASTER, HOUSE, DAE, AEROLINEA and CARGUERA.
Use global box type/pieces when rows lack row-level box data.
Group rows before assigning pieces so no positive line has totalPieces=0.
Remove logistics metadata from productDescription: do not include PIEZAS, TOTAL TALLOS, MASTER, HOUSE, DAE, AEROLINEA, CARGUERA, CLIENTE, email lines or similar labels as commercial product text.
Prefer grouping by the same base product/variety while moving lengths, grades and child descriptions into varieties.
If grouping by base variety still leaves more commercial groups than physical pieces, merge related rows under a broader product/category parent and keep specific row names in varieties.
If totalPieces equals commercial row count, assign 1 piece each. If one physical box contains several commercial rows, group them into one parent and put child names in varieties.
When distributing pieces from a global note, use whole integers, assign no positive line 0 pieces, and adjust the largest-stem line so the line totalPieces sum equals the printed global pieces exactly.
If pieces must be distributed from a global note, add AMBIGUOUS_TABLE.
`.trim(),
  },
  CATEGORY_HEADER_COMPOSITION: {
    category: 'CATEGORY_HEADER_COMPOSITION',
    description: 'A visual category header, such as ROSES, groups variety rows below it.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: category header with variety composition.
Use a visually separate header like ROSES as parent productDescription only when child rows below are varieties.
Use printed Pieces/Box Type for each physical group and put child variety names in varieties.
Do not replace normal product rows with generic headers.
Sum stems/value across variety rows for the physical group; use weighted unitPrice when child prices differ.
`.trim(),
  },
  PARENT_CHILD_COMPOSITION: {
    category: 'PARENT_CHILD_COMPOSITION',
    description:
      'Parent rows have pieces/type and child rows with blank pieces explain composition.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: parent/child composition rows.
Child rows with blank pieces/type attach to the previous parent.
Before adding child stems/value, test whether keeping the parent printed stems/value already matches the document subtotal/footer.
Add child stems/value only when parent totals do not already include them; otherwise do not double-count.
If grouping is ambiguous, mark AMBIGUOUS_TABLE.
If child stems/value already equal the parent totals, keep parent totals and use children only as varieties.
If child totals are additional and invoice subtotal requires them, merge additively into the parent.
If child prices differ, calculate child amounts separately, sum totalValue and totalStems, and set unitPrice = totalValue / totalStems.
Never return the child rows as independent lineItems with totalPieces=0.
`.trim(),
  },
  FBE_BUNCH_PRICE: {
    category: 'FBE_BUNCH_PRICE',
    description: 'Rows use Boxes/FBE/Bunch/Stems and price may be per bunch.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: FBE and bunch price.
Infer boxType from FBE / Boxes when no explicit code is printed.
If PRICE * bunch count equals TOTAL, printed price is per bunch; output unitPrice per stem as totalValue / totalStems.
Use recap totals when present.
Use parent Boxes and FBE as source of truth for pieces/EQ. Child lines like "1,760 Stems" provide stem count, not extra boxes.
When price is per bunch, use the printed row TOTAL if it matches bunches * PRICE; do not calculate totalValue as stems * printed PRICE.
If bottom recap lists totals by FULL/HALF/QUARTER/EIGHTH, use recap as invoice total source.
If the recap final numeric columns print total pieces, FBE/EQ, weight, currency and invoice value, use those printed recap values for invoice totals.
`.trim(),
  },
  SUMMARY_FINANCIAL_ONLY: {
    category: 'SUMMARY_FINANCIAL_ONLY',
    description: 'Detail rows have pieces/type but stems/price/value are only in a summary row.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: financial summary row.
Commercial Invoice Print focus: if QB/HB/etc rows show pieces/EQ and a single ROSES/product financial line shows shared stems/price/value, treat that financial line as the summary row.
Do not create a lineItem for the summary row itself.
Copy shared description/HTS/NANDINA/unitPrice to detail rows when only the summary has financial data.
Distribute stems so row totals match footer totalStems exactly.
Use fixed product stems-per-box rules when product/box type is obvious; if a product rule covers only some boxes, assign remaining stems to the biggest EQ box.
When no product rule applies, distribute by EQ proportion; for same box type rows, distribute evenly unless row-level stems are printed.
Adjust rounding on the largest-stem row so row totalStems equals footer totalStems exactly.
Calculate each detail row totalValue = totalStems * unitPrice and verify row totals sum to footer totalValue within 0.02.
`.trim(),
  },
  TESSA: {
    category: 'TESSA',
    description:
      'TESSA Commercial Invoice Print template with piece/type/EQ columns and direct or shared financial data.',
    extractorPrompt: `
${COMMON_EXTRACTION_RULES}
Format focus: TESSA Commercial Invoice Print customer template.
Use this category when the table shows columns like *PIECE TYPE, TOTAL PIECES, EQ-FULL BOXES, PRODUCT DESCRIPTION, HTS, NANDINA, TOTAL-UNT STEMS, UNIT-PRICE PER/STEM and TOTAL VALUE-USD.
If product/stems/price/value appear on the same row as piece/type/EQ, extract that row directly.
If QB/HB/etc rows have piece/type/EQ while one shared financial line contains product, HTS, NANDINA, stems, unit price and value, treat the shared line as the product/financial summary, not as an extra lineItem.
For a shared ROSES summary, assign QB rows using 100 stems per QB piece first, then put the remaining stems on HB/larger-EQ rows so row stems sum exactly to the printed TOTAL-UNT STEMS.
For a single positive box row, keep the printed row stems/value when present and calculate eqFull from piece/type.
Use the printed footer TOTAL pieces, EQ, stems and value as invoice totals.
Do not create lineItems from CUSTOM USE ONLY or USDA/APHIS blocks below the commercial table.
`.trim(),
  },
  UNKNOWN_GENERAL: {
    category: 'UNKNOWN_GENERAL',
    description: 'Fallback when the classifier is unsure.',
    extractorPrompt: COMMON_EXTRACTION_RULES,
  },
};

export function isRouterInvoiceCategory(value: unknown): value is RouterInvoiceCategory {
  return (
    typeof value === 'string' && ROUTER_INVOICE_CATEGORIES.includes(value as RouterInvoiceCategory)
  );
}

export function getRouterCategoryConfig(category: RouterInvoiceCategory): RouterCategoryConfig {
  return ROUTER_CATEGORY_CONFIGS[category] || ROUTER_CATEGORY_CONFIGS.UNKNOWN_GENERAL;
}

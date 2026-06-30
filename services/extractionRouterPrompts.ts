import { Type as SchemaType, type Schema } from '@google/genai';
import type { AgentType } from '../types';
import { buildExtractionPrompt } from './agentPrompts';

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
SPLIT_BOX_COLUMNS=separate side-by-side QB/HB/FB quantity columns, not a single PIECES TYPE column containing HB/QB row values.
EMBEDDED_BOX_PREFIX=description starts with pieces/type/EQ tokens.
GLOBAL_BOX_SUMMARY=pieces/type only in a global note/logistics block.
CATEGORY_HEADER_COMPOSITION=visual product header groups varieties, such as ROSES above variety rows.
PARENT_CHILD_COMPOSITION=parent row has pieces/type, following child rows leave pieces/type blank and continue the same visual product group.
FBE_BUNCH_PRICE=Boxes/FBE/Bunch/Stems price format, including STEMS/BUNCH, STEMS/BOX, BUNCH, UNIT PRICE and TOTAL columns.
SUMMARY_FINANCIAL_ONLY=detail rows have pieces/type/EQ; one summary row has product/stems/price/value.
TESSA=Commercial Invoice Print grid used by the TESSA flow, with *PIECE TYPE, TOTAL PIECES, EQ-FULL BOXES, PRODUCT DESCRIPTION, TOTAL-UNT STEMS, UNIT-PRICE, TOTAL VALUE.
Tie breakers:
- Classify the commercial invoice table, not APHIS/phytosanitary/botanical summaries.
- Prefer TESSA when the page title or table shows Commercial Invoice Print plus *PIECE TYPE / TOTAL PIECES / EQ-FULL BOXES / PRODUCT DESCRIPTION / TOTAL-UNT STEMS / UNIT-PRICE / TOTAL VALUE.
- Prefer FBE_BUNCH_PRICE when FBE/Bunch/Stems price columns appear, or when the commercial table shows STEMS/BUNCH plus STEMS/BOX/BUNCH with UNIT PRICE and TOTAL.
- Prefer CATEGORY_HEADER_COMPOSITION when a visible product header like ROSES sits above variety rows and the table has Pieces plus Order/range columns; use Pieces as physical quantity and Order only as reference validation.
- Prefer PARENT_CHILD_COMPOSITION when a parent row has PIECES TYPE/TOTAL PIECES/PIECES and following rows in the same visual product group have blank PIECES TYPE/PIECES but positive stems/value, even if the parent row value is HB/QB/FB.
- Prefer SPLIT_BOX_COLUMNS only when visible quantity columns are separate side-by-side headers named Quarter/Quaters/QB/QRT, Half/HB, Full/FB. Do not choose SPLIT_BOX_COLUMNS for a single PIECES TYPE column whose row values are HB/QB/FB.
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
If both "R.U.C. No." and "FUE No." are printed, map "R.U.C. No." only to ruc and "FUE No." to dae. Never copy R.U.C. No. into dae; if FUE/DAE is missing, leave dae empty and add MISSING_FIELD instead of reusing ruc.
For MAWB and HAWB, transcribe character-by-character exactly as printed. Preserve all letters, digits, leading zeros, internal zeros and separators; never shorten or remove zeros from airwaybill numbers.
Normalize box types: FB/F/FX/FULL/P/PL=FB, HB/H/1/2/HALF=HB, QB/Q/1/4/QUARTER/QRT=QB, EB/E/1/8/OCTAVO/OCT=EB, DS/D/1/16/SPLIT=DS.
lineItem.eqFull = totalPieces * factor. Never return an independent positive commercial line with totalPieces=0.
Rows with blank pieces/type but positive stems/value are child/composition rows of the previous physical parent. Preserve them as immediate totalPieces=0 child rows when row-level stems/value are printed, or merge them into parent varieties as compact PRODUCT:stems entries only when the visual grouping is unambiguous. Backend makes the final MIXTAS decision deterministically.
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
Use this category only when QB/HB/FB/Quarter/Half/Full are separate side-by-side quantity headers. If the document instead has a single PIECES TYPE column and blank continuation rows, follow parent/child composition rules even if this category was selected.
Fallback for misclassified parent/child rows: when a physical parent row has pieces/type and following rows leave pieces/type blank, attach those rows to the parent instead of creating separate zero-piece lineItems.
If that parent/child group is the same base flower product and only changes length, color, ASSORTED/OPEN wording, or scientific names, normalize productDescription to the base product and leave varieties empty.
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
When separate Pieces and Order columns appear side by side, never concatenate them. Pieces is the physical quantity; Order is only a box/order reference.
If Order is a range, use it only to validate Pieces by end-start+1. Examples: Pieces 2 with Order 1-2 means totalPieces=2; Pieces 6 with Order 10-15 means totalPieces=6. Never read these as 21-2 or 610-15.
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
If the parent and child rows are the same base flower product and only differ by length, color, grade, ASSORTED/OPEN wording, or scientific names, normalize productDescription to the base product and leave varieties empty. Example: LISIANTHUS 60cm ASSORTED, LISIANTHUS 60cm PURPLE and LISIANTHUS OPEN 70cm MISTY BLUE all normalize to LISIANTHUS when they are separate physical rows/groups.
For same-base product groups, count the parent row's printed stems/value as part of the group when the parent row has positive stems/value, then add child stems/value. Use stems * unitPrice for each visible row when printed line total conflicts.
Keep separate lineItems when boxType, totalPieces, unitPrice, or base product changes; do not merge HB and QB physical rows together.
When child rows print stems for genuinely mixed products, preserve the breakdown as compact varieties like ROSAS:125 and RUSCUS:25.
Backend makes the final MIXTAS decision. Your priority is preserving every printed child product description with its stems/value so no composition data is lost.
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
When parent/child or repeated FBE rows are the same base flower product and only differ by color, length, MIXTO/ASSORTED wording, grade, or scientific names, normalize productDescription to the base product and leave varieties empty. Example: STOCK MIXTO 70cm and STOCK WHITE 70cm normalize to STOCK.
Keep separate lineItems when the physical row changes boxType, totalPieces, unitPrice, or printed commercial total; do not merge separate physical rows just because the base product matches.
For same-base child rows under one physical row, sum stems/value into the parent line and leave varieties empty; use varieties only for genuinely mixed base products.
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
If a TESSA parent row has pieces/type/EQ and a productDescription like Assorted, Combo Box, Mix Box, Mixed Box, Bouquet, or similar, and following rows have blank pieces/type/EQ with positive TOTAL-UNT STEMS or VALUE, treat those following rows as the child composition of that parent. Return one parent lineItem using the parent's physical pieces/type/EQ and productDescription.
For those Assorted/Combo Box-style composition parents:
- totalStems = sum of child TOTAL-UNT STEMS.
- totalValue = sum of child total prices.
- varieties = child commercial product/variety descriptions as PRODUCT:stems.
- Use the child unit price only when all child prices match; otherwise unitPrice = totalValue / totalStems.
- Do not include the parent row's ScientificName, MARK, ATPA, HTS/NANDINA-only metadata as a variety unless the parent row also has its own positive stems/value.
- Keep child HTS/NANDINA when consistent; if child tax codes differ, keep productDescription as Combo Box/Assorted and preserve all child details in varieties.
If a TESSA row has blank piece/type/EQ but positive TOTAL-UNT STEMS or VALUE and the previous physical row is not an Assorted/Combo Box-style composition parent, it is composition of the previous physical row. Preserve PRODUCT:stems in varieties or output it as an immediate totalPieces=0 child row for backend merge.
For TESSA composition boxes, one parent row may be followed by one or more blank piece/type child rows. Preserve every child row's product, stems, price and value; backend will merge those rows and decide whether the parent becomes MIXTAS.
If a TESSA parent row has pieces/type/EQ but no positive stems/value and no following child financial rows, keep it only if required to preserve physical totals and flag the ambiguity in confidenceReasons; do not silently create a commercial zero-value product line.
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

export function buildRouterExtractorPrompt(
  agentType: AgentType,
  category: RouterInvoiceCategory,
): string {
  if (category === 'UNKNOWN_GENERAL') {
    return buildExtractionPrompt(agentType, { profile: 'compact' });
  }

  const config = getRouterCategoryConfig(category);

  return [
    'You are a specialist in perishable flower logistics invoice extraction.',
    `Detected format: ${config.category}. ${config.description}`,
    config.extractorPrompt,
    'Return only strict JSON matching the provided response schema.',
  ].join('\n');
}

// ============================================
// CONFIGURACIÓN DE AGENTES IA - PROMPTS
// ============================================

import { AgentType } from '../types';

export type ExtractionPromptProfile = 'full' | 'compact';

// --------------------------
// Knowledge Base: Tipos de Caja
// --------------------------
export const BOX_TYPES_KNOWLEDGE_BASE = `
### KNOWLEDGE BASE: BOX TYPES & MATH FACTORS
Normalize the 'Box Type' using this table and apply the **MATH FACTOR** to calculate 'eqFull'.

| Visual Code / Alias | Normalized | Logic / Meaning | **MATH FACTOR (EQ)** |
| :--- | :--- | :--- | :--- |
| F, FX, PL, P, FULL | **FB** | Full Box / Pallet | **1.00** |
| HB, H, 1/2, HALF | **HB** | Half Box | **0.50** |
| QB, Q, 1/4, QUARTER | **QB** | Quarter Box | **0.25** |
| EB, E, 1/8, OCTAVO | **EB** | Eighth Box | **0.125** |
| DS, D, 1/16, SPLIT | **DS** | Dieciseisavo / Split | **0.0625** |

**STRICT MATH RULES:** 
- **'E' or 'EB' is 0.125**. Example: 2 pieces of EB = 2 * 0.125 = 0.25.
- **'Q' or 'QB' is 0.25**. Example: 3 pieces of Q = 3 * 0.25 = 0.75.
- If the invoice table lacks an EQ column, YOU MUST CALCULATE IT using this table.
`;

// --------------------------
// Knowledge Base: Densidad de Tallos por Producto (Opcional — Inteligencia Adicional)
// --------------------------
export const PRODUCT_STEMS_KNOWLEDGE_BASE = `
### KNOWLEDGE BASE: STEMS PER BOX TYPE BY PRODUCT (OPTIONAL REFERENCE)
This is **supplementary intelligence** that may grow over time. Use it ONLY when the product matches exactly.
If the product is NOT listed here, use the default QB reference below only for QB rows; distribute any remaining stems using the Distribution section.

| Product | Box Type | Stems per Box |
| :--- | :--- | :--- |
| Roses / Spray Roses | QB | **100** |
| Roses / Spray Roses | HB | **250** |
| Gypsophila / Gypso | QB | **150** |
| Alstroemeria | QB | **150** |
| Any other product (default reference) | QB | **150** |

**HOW TO USE (when product matches or default applies):**
- Roses: 1 HB + 1 QB = 250 + 100 = 350, or 8 QB + 1 HB = 800 + 350 = 1150.
- Any other product not listed above: use 150 stems per QB only when the row is QB.
- The remainder after assigning table values goes to the biggest box type (highest EQ).
`;

// --------------------------
// Reglas de Extracción Header/Footer
// --------------------------
export const HEADER_FOOTER_RULES = `
### HEADER/FOOTER EXTRACTION (CRITICAL):
- **FOOTER TOTALS:** Extract 'TOTAL PIECES', 'TOTAL EQ/FULLS', and the invoice 'TOTAL VALUE' **EXACTLY AS PRINTED** on the image.
- **DO NOT FIX OR AUTO-CORRECT THE FOOTER.** If the image says Total=10 but lines sum to 8, YOU MUST RETURN 10. I need to detect the error.
- **INVOICE TOTAL VALUE:** Keep \`invoice.totalValue\` as the printed invoice total, even if line-item math shows the document total is wrong.
- **INVOICE NUMBER FALLBACK:** If the "Invoice No." field is blank/missing but a "Packing No.", "Packing List", or similar document number is printed, use that value as \`invoiceNumber\` and add a MISSING_FIELD confidence reason explaining that the invoice number was missing and Packing No. was used as fallback.
- **AIRWAYBILLS:** For MAWB and HAWB, transcribe character-by-character exactly as printed. Preserve all letters, digits, leading zeros, internal zeros and separators; never shorten or remove zeros from airwaybill numbers.
`;

// --------------------------
// Reglas de Extracción de Tablas
// --------------------------
export const TABLE_EXTRACTION_RULES = `
### TABLE EXTRACTION & MATH OVERRIDE (CRITICAL)
Analyze the table columns.

**GOLDEN RULE: MATH SELF-CORRECTION (Price * Stems)**
The printed 'Total' column on the invoice is often WRONG or BLURRY. You must verify it.

For every line extracted:
1. Extract 'Total Stems' (e.g., 260) and 'Unit Price' (e.g., 0.79).
2. PERFORM CALCULATION: \`CalculatedTotal = Total Stems * Unit Price\`.
3. **OVERRIDE RULE**: If the printed total on the image is different from your calculation, **USE YOUR CALCULATION**.
4. This override applies only to each line item's \`totalValue\`. Do NOT overwrite the invoice-level \`invoice.totalValue\`, which must remain the printed total from the document.

**SPECIFIC ERROR CORRECTION:**
- If you see: Stems=260, Price=0.79
- Image might say: 173.80 (THIS IS WRONG).
- CORRECT MATH: 260 * 0.79 = 205.40.
- **YOU MUST EXTRACT: 205.40**.

**SCENARIO A: Standard Extraction**
If the table has clear "Pieces" and "Box Type" columns for EVERY row, extract them 1:1.
Calculate 'eqFull' using the math table.
Ignore zero-quantity placeholder rows when they have no commercial value:
- If a row has totalPieces=0, totalStems=0, and totalValue is blank, dash, zero, or missing, DO NOT create a lineItem for it.
- Keep only the positive commercial rows when their sums match the printed footer totals.
- If a zero-piece row has positive stems or value, do not ignore it silently; treat it as ambiguous and reconcile with child/composition-row rules.

**UNKNOWN BOX TYPE INFERENCE (DO NOT INVENT):**
If a printed box type is not in the known alias table (for example "TB"), do not keep it as-is and do not guess blindly.
Infer the normalized boxType ONLY when the document footer provides enough math evidence:
1.  Calculate inferredFactor = footer.totalEq / footer.totalPieces, or use row/full totals when clearly printed.
2.  Match inferredFactor to the known box factors:
    - 1.00 = FB, 0.50 = HB, 0.25 = QB, 0.125 = EB, 0.0625 = DS.
3.  If the factor matches, normalize the unknown printed type to that boxType and calculate eqFull normally.
4.  Add an AMBIGUOUS_TABLE confidence reason explaining that the printed box type was normalized from footer math.
5.  If the factor does not match any known type, use OTHER/MISSING_FIELD confidence reason and do not invent a box type.

Example: printed Type="TB", footer shows 3 pieces and 1.50 full boxes. 1.50 / 3 = 0.50, so normalize Type="TB" to boxType="HB".

**SCENARIO B (Box Number Ranges):**
Some invoices use a "BOX N°" column with individual box numbers or inclusive ranges, plus a "TB" / "Type" column for the box type.
When you see this format:
1.  Convert the box number/range into totalPieces:
    - "03" = 1 piece.
    - "01-02" = 2 pieces.
    - "05-08" = 4 pieces.
    - "23-37" = 15 pieces.
    - Formula for ranges: endNumber - startNumber + 1.
2.  Use the "TB" / "Type" column as the box type code and normalize it with the box type table:
    - TB="Q" means boxType="QB".
    - TB="H" means boxType="HB".
    - TB="F" means boxType="FB".
3.  Calculate eqFull = totalPieces × boxType factor.
4.  Do NOT copy the literal range text into totalPieces.
5.  If a header says "TOTAL BOXES" with a decimal value like "9,2500" while all rows are Q/QB, treat that decimal as totalEq/full boxes, not physical piece count.
6.  Derive invoice.totalPieces by summing the row pieces from the box ranges.
7.  If a row has EMPTY "BOX N°" but continues immediately after a numbered/ranged row and keeps the same TB/type and product/variety context, it is a continuation of the previous box row, not a new physical box:
    - Do NOT add pieces for the continuation row.
    - Add its stems and total value to the previous parent row.
    - If the continuation row has a different price/length, calculate each amount separately, sum totalValue, sum totalStems, and output unitPrice = totalValue / totalStems.
    - This is common when one box number contains the same variety split by different lengths or prices.
8.  If the box type text is blurry or appears OCR-corrupted (for example "JARTER" but context/geometry/footer suggests "QUARTER"), infer the most likely normalized boxType using pieces and footer EQ, but add an OCR_UNCERTAIN confidence reason.
    - Do not invent a clean reading silently. Keep the extraction useful, and lower confidence with a message explaining the inferred box type.

Example:
- BOX N° "01-02", TB "Q", stems 200, price 0.3000, total 60.00 => totalPieces=2, boxType="QB", eqFull=0.50.
- BOX N° "23-37", TB "Q", stems 1500, price 0.3600, total 540.00 => totalPieces=15, boxType="QB", eqFull=3.75.
- BOX N° "03", TB "Q", CHERRY HO has 50 stems at 0.3000, followed by an EMPTY BOX N° row with TB "Q", CHERRY HO, 50 stems at 0.3200. Return ONE row for box 03: totalPieces=1, boxType="QB", eqFull=0.25, totalStems=100, totalValue=31.00, unitPrice=0.31.

**SCENARIO C (Split Box-Type Quantity Columns):**
Some invoices split box quantities into separate columns such as "Quaters Qb", "Half Hb", "Full", or similar.
When a row has numeric values under these columns:
1.  Create extraction rows using the non-empty box quantity columns.
2.  "Quaters Qb" means boxType="QB" and totalPieces equals the number in that column.
3.  "Half Hb" means boxType="HB" and totalPieces equals the number in that column.
4.  "Full" means boxType="FB" and totalPieces equals the number in that column.
5.  Calculate eqFull from the normalized box type factor.
6.  If only one box quantity column is populated for a product row, return one line item for that product row.
7.  If multiple box quantity columns are populated in the same product row, split into multiple lineItems only if stems/value are clearly separated by box type. Otherwise use the dominant/non-empty box type and mark AMBIGUOUS_TABLE.

Example: row "LILIES ORIENTAL SIBERIA", Quaters Qb=3, Half Hb empty, totalStems=150, unitPrice=0.82, totalValue=123.00 => boxType="QB", totalPieces=3, eqFull=0.75.

**SCENARIO K (Embedded Box Info In Description):**
Some invoices embed box information at the beginning of the product description instead of using separate Pieces/Box columns.
Look for patterns like:
- "2 QB 0.5 SUNFLOWER LARGE ..."
- "9 QB 2.25 SUNFLOWER PETITE ..."
- "8 QB 2.0 SUNFLOWER SELECT ..."

When a product description starts with this pattern:
1.  Extract the first number as totalPieces.
2.  Extract the next token as boxType and normalize it using the box type table.
3.  Extract the next numeric value as eqFull when it matches totalPieces × box factor.
4.  Remove these leading box tokens from productDescription. Keep the actual product text only.
5.  Use the row's printed quantity/Cant. as totalStems when the unit is stems/tallos.
6.  Use the row's printed unit price and total value normally.
7.  Validate the sum of eqFull against printed footer/additional info such as "CAJAS FULL", "TOTAL FULL", or "FULL BOXES".
8.  If the embedded eqFull does not match totalPieces × factor, calculate eqFull from the math table and add an AMBIGUOUS_TABLE confidence reason.

Example: "9 QB 2.25 SUNFLOWER PETITE PO P154872" with Cant.=900, P.Unit=0.22, Total=198.00 => totalPieces=9, boxType="QB", eqFull=2.25, productDescription="SUNFLOWER PETITE PO P154872", totalStems=900, unitPrice=0.22, totalValue=198.00.

**SCENARIO D (APHIS / Phytosanitary Summary Is Reference-Only):**
Some invoices include an "APHIS ANEXO", phytosanitary, botanical, or scientific-name summary table after the commercial invoice totals.
If a detailed product invoice table exists above it:
1.  DO NOT create lineItems from the APHIS/phytosanitary summary table.
2.  DO NOT replace detailed row prices with summary prices from APHIS.
3.  Use APHIS only as optional reference for scientific/common names when it helps clarify productDescription or varieties.
4.  Invoice lineItems, totalStems, unitPrice, and totalValue must come from the detailed commercial product table and its totals.

Example: if the commercial detail has seven LILIES rows totaling 550 stems and 367.00, and APHIS later shows one summary row "LILIES ... 10 pieces, 550 stems, price 0.67, value 367.00", return the seven detailed commercial rows. Do NOT replace them with one APHIS row.

**SCENARIO I (Stem Lines With Global Box Summary):**
Some invoices list commercial rows by stems/quantity and price, while box information appears only in a note or summary text such as "PIEZAS: 4HB", "PIEZAS: 12 QB", or "TOTAL TALLOS: 1050".
This summary can also be embedded inside a long product description/comment cell in Ecuador/SRI-style invoices, together with logistics metadata such as "CLIENTE:", "AEROLINEA:", "DAE:", "CARGUERA:", "MASTER:", "HOUSE:", and "TOTAL TALLOS:".
When line rows have Description/Cantidad/Precio Unitario/Total but no row-level box type:
1.  Extract each commercial product row normally using its printed quantity as totalStems, printed unit price as unitPrice, and printed total as totalValue.
2.  Parse the global box summary:
    - "PIEZAS: 4HB" means invoice totalPieces=4 and global boxType="HB".
    - "PIEZAS: 12 QB" means invoice totalPieces=12 and global boxType="QB".
    - If the logistics block is embedded in a product description/comment cell, parse MASTER as mawb, HOUSE as hawb, DAE as dae, AEROLINEA as airline, and CARGUERA as freightForwarder.
    - Remove logistics metadata tokens from productDescription; do not include "PIEZAS", "TOTAL TALLOS", "MASTER", "HOUSE", "DAE", "AEROLINEA", "CARGUERA", "CLIENTE", or email lines as commercial product text.
3.  Use the global boxType for all commercial lineItems unless the document prints a row-level box type elsewhere.
4.  NEVER return a positive commercial lineItem with totalPieces=0. If a row has totalStems > 0 or totalValue > 0, it must either be grouped into a parent lineItem that has at least 1 physical piece, or receive at least 1 piece itself.
5.  If there are more commercial stem/price rows than global totalPieces, group rows BEFORE assigning pieces:
    - Prefer grouping by the same base product/variety name while treating length/grade as a variety detail. Example: "TALLO DE ROSA ENGAGEMENT 60CM", "70CM", and "80 CM" become one parent productDescription="TALLO DE ROSA ENGAGEMENT" with varieties for the lengths.
    - If grouping by base variety still leaves more groups than pieces, merge related rows under a broader product/category parent such as "ROSES" and keep the specific row descriptions in varieties.
    - Continue grouping until the number of output lineItems is less than or equal to global totalPieces.
    - Sum totalStems and totalValue inside each grouped parent. If child prices differ, set unitPrice = totalValue / totalStems.
    - Add an AMBIGUOUS_TABLE confidence reason explaining that commercial rows were grouped to avoid zero-piece lineItems because pieces are only printed globally.
6.  Distribute the global totalPieces across grouped lineItems using a conservative whole-piece allocation:
    - If the footer/detail summary shows exactly ONE physical box (for example totalPieces=1 and detail columns show HB=1, FB=0, QRT=0, OCT=0), and multiple commercial stem/price rows appear inside the same product/table, treat those rows as the composition of that single box:
      - Return ONE parent lineItem for the product/category (for example productDescription="ROSES").
      - Put each commercial row description (for example "ROSES 70 CM", "ROSES 60 CM") in the parent lineItem.varieties array.
      - Sum totalStems and totalValue across those rows.
      - If row prices differ, calculate unitPrice as totalValue / totalStems.
      - Use the footer/detail box type and totalPieces for the parent row.
      - Add an AMBIGUOUS_TABLE confidence reason explaining that multiple commercial rows were grouped into one physical box from the footer/detail summary.
    - If totalPieces equals the number of commercial lineItems, assign 1 piece to each lineItem.
    - If totalPieces is greater than the number of lineItems, first assign 1 piece to each lineItem, then distribute the remaining pieces proportionally by totalStems.
    - Round to whole integers and adjust the largest-stem lineItem so the sum of lineItems.totalPieces equals the printed global pieces exactly.
    - Never assign 0 pieces to a lineItem with positive stems or value.
7.  Calculate each lineItem.eqFull = lineItem.totalPieces × box factor.
8.  Set invoice.totalEq = global totalPieces × global box factor.
9.  If proportional piece distribution is not visually printed, add an AMBIGUOUS_TABLE confidence reason explaining that pieces were distributed from a global box summary.

Example: a table has four rose stem lines totaling 1050 stems and a note "PIEZAS: 4HB".
- Use boxType="HB" for all rows, invoice.totalPieces=4, invoice.totalEq=2.00.
- Since there are four real commercial lineItems and four pieces, assign 1 piece to each row.
- Keep each row's totalStems, unitPrice, and totalValue exactly from the commercial table.

**SCENARIO J (Product Category Header With Variety Composition):**
Some invoices show a product category/header such as "ROSES" centered above the product/variety rows. The rows below list bouquet names or varieties, while Box Type, Pieces, Order, and Mark define physical box groups.
When you see columns like "Box Type | Pieces | Order | Mark | Product | ... | Total Bunch | Total Stems | Unit Price | Total USD":
0.  Apply this scenario ONLY when the category/header text (for example "ROSES") is visually separate from the item rows, usually centered above the product/variety names, and the actual item rows below contain variety/bouquet names with stems/value.
    - Do NOT apply this scenario when "ROSES" appears as a normal product line with its own stems, price, and total.
    - Do NOT replace a specific productDescription such as "ROSES 60", "ROSES ASSORTED", or "STOCK" with a generic category unless the document clearly prints that category as a separate group header.
1.  Use the category/header text (for example "ROSES") as the parent lineItem.productDescription when the rows below are variety names.
2.  Use the "Pieces" column as the physical piece count. Do NOT use "Order" or "Mark" as pieces.
    - Example: Box Type=HB, Pieces=1, Order="1 - 1" means totalPieces=1, not 11 and not 1-1.
    - Example: Box Type=HB, Pieces=3, Order="31 - 3" means totalPieces=3; "31 - 3" is an order/reference identifier.
3.  A new physical box group starts when Box Type and/or Pieces is populated.
4.  Following rows with EMPTY Box Type/Pieces but product/variety names are composition rows for the current group.
5.  Add the product/variety row names to the parent row's 'varieties' array.
6.  Sum Total Stems and Total USD across all composition rows in the group.
7.  If all composition rows share the same unit price, keep that unitPrice. If prices differ, output weighted unitPrice = totalValue / totalStems.
8.  Validate against the footer: sum group totalPieces must match PIECES TOTAL, and sum group eqFull must match FULL TOTAL.

Example: header "ROSES", Box Type=HB, Pieces=1, Order="1 - 1", followed by BLUEBERRY, COUNTRY BLUES, COUNTRY HOME, etc. totaling 300 stems and 90.00. Return ONE lineItem with productDescription="ROSES", varieties=[all bouquet names], totalPieces=1, eqFull=0.50, totalStems=300, unitPrice=0.30, totalValue=90.00.

**SCENARIO E (The "Varieties" / Child Rows):**
If a row has valid Pieces/Type (e.g., "2 EB"), and the **NEXT ROWS** have **EMPTY** Pieces/Type columns but contain Description text:
1.  **DO NOT** create new line items for these "child" rows.
2.  **ADD** the description text of these child rows to the 'varieties' array of the PARENT row.
3.  The Parent Row keeps the total piece count.
4.  If a child row also has Length/Bunches/Stems/Total Stems/Price/Amount values, it is a **mixed-variety grouped box row**:
    - Keep it grouped under the previous parent row because it has no independent Pieces/Type.
    - Sum its 'totalStems' into the parent row's 'totalStems'.
    - Sum its calculated 'totalValue' into the parent row's 'totalValue'.
    - Preserve the per-variety stem breakdown in 'varieties' as compact entries like "ROSAS:125" and "RUSCUS:25", including the parent row when stems are printed.
    - Backend makes the final MIXTAS decision. Your priority is preserving every printed child product description with its stems/value so no composition data is lost.
    - Keep the unitPrice from the printed row when it matches the parent.
    - If grouped child prices differ from the parent, calculate each amount separately, sum the amounts, set the merged row's unitPrice = totalValue / totalStems, and treat the grouping as an AMBIGUOUS_TABLE confidence concern.
    - NEVER create a separate line item with totalPieces=0 for this case.
    - Example: parent "1 HB ROSAS SWEET ESCIMO" has 125 stems and 35.00; child "ROSAS FREE SPIRIT" has blank #BOX but 125 stems and 35.00. Return ONE parent line with totalPieces=1, totalStems=250, totalValue=70.00, varieties=["ROSAS FREE SPIRIT"].

**SCENARIO G (The "Breakdown / Composition Rows" — DO NOT DOUBLE COUNT):**
Some invoices show a complete parent row with Boxes/F.B.E./T.Units/Stems/P.FOB/Total, followed by child rows with EMPTY Boxes and F.B.E. that only explain the composition of that same box.
This is common in formats with columns like "Description | Grade | Boxes | F.B.E. | T. Units | Stems | P.FOB | Total".

Before applying Scenario E additive grouping, run this reconciliation test:
1.  Build the parent row using ONLY the parent's printed Boxes/F.B.E./T.Units/Stems/P.FOB/Total.
2.  Add child descriptions to the parent's 'varieties' array.
3.  Check whether keeping the parent totals unchanged makes the document totals match the printed subtotal/footer for stems and value.
4.  If totals match, the child rows are composition/breakdown rows. **DO NOT add child stems or child value again.**
5.  If totals do NOT match, then use Scenario E additive grouping and sum child stems/value into the parent.

Breakdown examples:
- Parent "1 H ASTER ASSORTED" has 250 stems and 137.50; children "ASTER W MEXICO" 120 stems and "ASTER ECUADOR" 130 stems. Since 120 + 130 = 250 and keeping parent=250 matches invoice subtotal, return ONE row with totalStems=250, totalValue=137.50, varieties=["ASTER W MEXICO","ASTER ECUADOR"].
- Parent "1 Q TRACHELLIUM JADE" has 300 stems and 114.00; child repeats/describes "TRACHELLIUM JADE" with 300 stems and 114.00. If keeping parent totals makes the invoice subtotal match, return ONE row with totalStems=300, totalValue=114.00. Do NOT return 600 stems.

**SCENARIO H (Utopia FBE / Bunch Price Format):**
For invoices with columns like "Boxes | FBE | VOL KG | PRICE | TOTAL" and rows that show values such as "440 Bunch" plus a child/summary line like "1,760 Stems":
1.  Use the parent row's printed Boxes and FBE as the source of truth for pieces and EQ.
2.  Infer boxType from FBE / Boxes when no explicit HB/QB/FB code is printed:
    - ratio 1.00 = FB, 0.50 = HB, 0.25 = QB, 0.125 = EB, 0.0625 = DS.
    - Example: Boxes=22 and FBE=11.00 means boxType=HB, totalPieces=22, eqFull=11.00.
3.  If the printed PRICE multiplied by Bunch count equals TOTAL, then PRICE is per bunch, NOT per stem.
4.  The output schema's unitPrice is ALWAYS price per stem because downstream client systems store stems, not bunches.
5.  When the invoice price is per bunch, NEVER copy the printed bunch price into unitPrice. Normalize it as: unitPrice = totalValue / totalStems.
6.  Use the printed TOTAL as the row's totalValue when it matches Bunch × PRICE. Do NOT calculate totalValue as Stems × printed PRICE in this format.
7.  The bottom recap line is authoritative for invoice totals when present:
    - "TOTALS: FULL ... HALF ... QUARTER ... EIGHTH ..." gives total pieces by box type.
    - The final numeric columns give totalPieces, totalEq/FBE, total weight, currency, and invoice total value.

Example: parent row has Boxes=22, FBE=11.00, "440 Bunch", child line "1,760 Stems", PRICE=3.920, TOTAL=1,724.80.
- boxType=HB, totalPieces=22, eqFull=11.00, totalStems=1,760, totalValue=1,724.80.
- printed PRICE is per bunch because 440 × 3.920 = 1,724.80.
- output unitPrice must be 1,724.80 / 1,760 = 0.98 per stem. Do not output 3.920 as unitPrice.

**SCENARIO F (The "Summary Row" — Financial data only in summary/footer):**
If detail rows have Pieces and Box Type but **NO Stems/Price/Value**, and the financial data (Total Stems, Unit Price, Total Value, Description, HTS, NANDINA) only appears in a summary/footer row:
1.  **DO NOT** create a line item for the summary row itself.
2.  For each detail row, copy 'productDescription', 'hts', 'nandina', and 'unitPrice' from the summary row (same values for all rows).
3.  Distribute 'totalStems' to each row following the **DISTRIBUTION & PRORATE LOGIC** section below (product table if match, EQ-proportional if not).
4.  Calculate each row's 'totalValue' = totalStems × unitPrice.
5.  **VERIFY**: Sum of row.totalStems = footer.totalStems (exact). Sum of row.totalValue ≈ footer.totalValue (within 0.02).
`;

// --------------------------
// Lógica Avanzada de Distribución
// --------------------------
export const ADVANCED_DISTRIBUTION_LOGIC = `
### DISTRIBUTION & PRORATE LOGIC

**HOW TO DISTRIBUTE STEMS ACROSS MULTIPLE BOX TYPES:**

**STEP 1 — Product matches the knowledge base (or default applies):**
Use the EXACT per-box values from the table. These are FIXED, not ratios to scale.
- For each box type in the table, multiply: stems = box_count × stems_per_box.
- These values are LOCKED — do not scale them.
- **Default**: If the product is NOT Roses, Gypso, or Alstroemeria, use QB = 150 stems per box.
- If there is a box type NOT in the table, assign the REMAINING stems to it:
  remaining = footer.totalStems - sum(table_box_stems).
  Put the remainder into the box type with the highest EQ (the biggest box).
- Example: Roses, 8 QB + 1 HB, 1150 stems total.
  - 8 QB: 8 × 100 = 800 (locked — table says QB=100).
  - 1 HB: 1150 - 800 = 350 (remainder goes to HB).
  - Result: QB=800, HB=350 → total=1150.
- Example: Roses, 1 HB + 1 QB, 350 stems total.
  - 1 QB: 1 × 100 = 100 (locked).
  - 1 HB: 350 - 100 = 250 (matches table: HB=250 for Roses).

**STEP 2 — Product NOT in the knowledge base:**
Distribute proportionally by EQ factor. The bigger box gets more stems.
- Example: Unknown product, 1 HB (EQ=0.50) + 1 QB (EQ=0.25), 350 stems.
  - Ratio EQ: 0.50:0.25 = 2:1.
  - HB = 350 × 2/3 = 233, QB = 350 × 1/3 = 117 → total = 350.
  - Round to integers. Adjust last row so sum matches footer exactly.

**STEP 3 — Single box type (simple case):**
If all rows have the SAME box type, distribute evenly across rows:
- totalStems / number_of_rows, rounded to integers.
- Example: 2 rows of QB + footer says 200 stems = 100 + 100.

**UNIT PRICE RULES:**
- If the table prints a row-level unit price, extract that printed unitPrice for each row.
- Each row's totalValue = row.totalStems × row.unitPrice.
- Only when row-level unit prices are missing and a single summary/footer price must be inferred, use: unitPrice = footer.totalValue / footer.totalStems.
- Mixed-variety grouped box rows may use a merged weighted unitPrice when child prices differ, as defined in SCENARIO E.
- Exception: in Scenario H, if the printed price is per bunch, output unitPrice per stem by normalizing totalValue / totalStems.

**FINAL VERIFICATION:**
- Sum of all row.totalStems MUST equal footer.totalStems (exact integer match).
- Sum of all row.totalValue MUST equal footer.totalValue (within 0.02 rounding tolerance).
`;

// --------------------------
// Algoritmo de Confidence Score
// --------------------------
export const CONFIDENCE_SCORE_ALGORITHM = `
### CONFIDENCE SCORE ALGORITHM
Start with 100 for visual extraction quality only.
The backend recalculates pieces/EQ/value mismatches deterministically after your JSON response.
Do NOT add math mismatch confidence reasons. Do NOT explain arithmetic discrepancies in confidenceReasons.

### CONFIDENCE REASONS (MANDATORY)
Return at most 3 confidenceReasons for visual/OCR/table uncertainty only. Use an empty array when visual confidence is high.

Use these reason codes only:
- OCR_UNCERTAIN: text is blurry or uncertain.
- MISSING_FIELD: important required field is missing.
- AMBIGUOUS_TABLE: table structure or row grouping is ambiguous.
- DOCUMENT_INCOMPLETE: page, footer, or relevant section appears missing.
- OTHER: only when none of the above applies.

For each confidence reason, return only the \`code\` field. Do not return \`penalty\`, \`message\`, or math mismatch reasons. Backend adds text, penalties, math confidenceReasons, and final score.
`;

// --------------------------
// Prompt Base del Sistema
// --------------------------
export const SYSTEM_PROMPT_INTRO = `
You are a Super Agent specialized in Perishable Logistics (Flowers). 
Your goal is to extract invoice data and DETECT DISCREPANCIES using strict math.
`;

export const COMPACT_EXTRACTION_RULES = `
### COMPACT EXTRACTION RULES

Return strict JSON matching the schema. Use visual evidence from the PDF; do not invent missing data.

HEADER/FOOTER:
- invoice.totalPieces, invoice.totalEq/full boxes, totalStems and invoice.totalValue must be the values printed in the footer/header when present.
- Do not auto-correct invoice-level totals. We need backend validation to detect mismatches.
- If Invoice No. is missing, use Packing No./Packing List as invoiceNumber and add MISSING_FIELD.
- For MAWB and HAWB, transcribe character-by-character exactly as printed. Preserve all letters, digits, leading zeros, internal zeros and separators; never shorten or remove zeros from airwaybill numbers.

BOX TYPES:
- Normalize aliases: FB/F/FULL/PL/P=FB factor 1.0; HB/H/HALF=HB factor 0.5; QB/Q/QUARTER=QB factor 0.25; EB/E/OCTAVO=EB factor 0.125; DS/D/SPLIT=DS factor 0.0625.
- eqFull = totalPieces * factor.
- If printed type is unknown, infer only when footer/row math proves a known factor; otherwise mark AMBIGUOUS_TABLE or MISSING_FIELD.

VALUES AND STEMS:
- For each line, extract stems, unitPrice and totalValue. If printed line total conflicts with stems * unitPrice, use calculated line total.
- Keep invoice.totalValue as printed even when line totals differ.
- Ignore blank/zero placeholder rows only when pieces, stems and value are all zero/blank.
- Unit price is row-level when printed. If only summary/footer price exists, infer unitPrice = totalValue / totalStems. If price is per bunch, output per-stem unitPrice = totalValue / totalStems.

TABLE PATTERNS:
- Standard pieces/type rows: extract one row per commercial item.
- Box ranges: "03"=1 piece, "01-02"=2, "05-08"=4, formula end-start+1. Do not copy the range as pieces.
- Split quantity columns: Quarters/QB, Half/HB, Full/FB columns become box rows; split only when stems/value are separable, otherwise use dominant box and mark AMBIGUOUS_TABLE.
- Embedded description prefix like "9 QB 2.25 SUNFLOWER": pieces=9, boxType=QB, eq=2.25 if valid, remove prefix from productDescription.
- APHIS/phytosanitary summaries are reference-only if a commercial detail table exists. Do not create lineItems from APHIS or replace prices with APHIS summary values.
- Global box summary ("PIEZAS: 4HB", "12 QB", logistics block with MASTER/HOUSE/DAE/AEROLINEA/CARGUERA): parse logistics fields, remove logistics tokens from productDescription, use the global box type/pieces when rows have stems/value but no row-level box.
- Never return a positive commercial line with totalPieces=0. Group rows or allocate pieces conservatively.
- Category headers (for example ROSES centered above varieties): create one parent line for the physical box group, add child varieties, sum stems/value, use printed Pieces/Box Type. Do not replace normal product rows with generic category names.
- Child/composition rows with blank pieces/type: attach to previous physical parent. Preserve printed child stem breakdown as compact varieties like PRODUCT:stems, or as immediate totalPieces=0 child rows when row-level stems/value are printed. Add child stems/value only when parent totals do not already include them; otherwise do not double-count. Backend makes the final MIXTAS decision.
- Utopia/FBE/bunch format: infer boxType from FBE/Boxes; if PRICE * bunches = TOTAL, printed price is per bunch, so normalize unitPrice per stem.
- Summary row with financial data only: do not create a summary line; copy shared description/HTS/NANDINA/unitPrice to detail rows and distribute stems/value.

DISTRIBUTION:
- Product table: Roses/Spray Roses QB=100, HB=250; Gypsophila/Gypso QB=150; Alstroemeria QB=150; default QB=150 for other products only when QB rows exist.
- If product matches table, apply fixed stems per box; remaining stems go to the biggest EQ box.
- If product is not covered, distribute stems by EQ proportion and adjust rounding so totalStems matches footer exactly.
- For same box type rows, distribute evenly unless row-level stems are printed.

CONFIDENCE:
- confidenceScore is visual extraction quality only; backend adds math penalties.
- Return at most 3 confidenceReasons; empty array when visual confidence is high.
- Valid codes: OCR_UNCERTAIN, MISSING_FIELD, AMBIGUOUS_TABLE, DOCUMENT_INCOMPLETE, OTHER.
- For each confidence reason, return only the code field. Do not output penalty, message, or math mismatch reasons.
`;

// --------------------------
// Generador de Prompt Completo
// --------------------------
export const buildExtractionPrompt = (
  format: AgentType,
  options: { profile?: ExtractionPromptProfile } = {},
): string => {
  const useAdvancedDistribution = format === 'AGENT_GENERIC_A';
  const outputRules = `
**OUTPUT:**
Return the extracted data in strict JSON format following the provided schema.
    `.trim();

  if (options.profile === 'compact') {
    return [SYSTEM_PROMPT_INTRO, COMPACT_EXTRACTION_RULES, outputRules].join('\n');
  }

  const sections = [
    SYSTEM_PROMPT_INTRO,
    BOX_TYPES_KNOWLEDGE_BASE,
    PRODUCT_STEMS_KNOWLEDGE_BASE,
    HEADER_FOOTER_RULES,
    TABLE_EXTRACTION_RULES,
    useAdvancedDistribution ? ADVANCED_DISTRIBUTION_LOGIC : '',
    CONFIDENCE_SCORE_ALGORITHM,
    outputRules,
  ];

  return sections.filter(Boolean).join('\n');
};

// --------------------------
// Configuración por Tipo de Agente
// --------------------------
export interface AgentConfig {
  id: AgentType;
  name: string;
  description: string;
  icon: string;
  features: string[];
  useAdvancedDistribution: boolean;
}

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  AGENT_GENERIC_A: {
    id: 'AGENT_GENERIC_A',
    name: 'Factura Estándar',
    description: 'Agente genérico para facturas de logística con formato estándar',
    icon: '📄',
    features: [
      'Extracción de header/footer',
      'Procesamiento de líneas de producto',
      'Validación matemática',
      'Score de confiabilidad',
    ],
    useAdvancedDistribution: true,
  },
  AGENT_GENERIC_B: {
    id: 'AGENT_GENERIC_B',
    name: 'Formato B (Deshabilitado)',
    description: 'Agente para formatos alternativos - En desarrollo',
    icon: '🚧',
    features: ['En desarrollo'],
    useAdvancedDistribution: false,
  },
  AGENT_CUSTOMS: {
    id: 'AGENT_CUSTOMS',
    name: 'Aduanas (Deshabilitado)',
    description: 'Agente para documentos aduaneros - En desarrollo',
    icon: '🚧',
    features: ['En desarrollo'],
    useAdvancedDistribution: false,
  },
};

// --------------------------
// Helpers para Agentes
// --------------------------
export const getAgentConfig = (agentType: AgentType): AgentConfig => {
  return AGENT_CONFIGS[agentType];
};

export const getActiveAgents = (): AgentConfig[] => {
  return Object.values(AGENT_CONFIGS).filter((agent) => !agent.name.includes('Deshabilitado'));
};

export const isAgentEnabled = (agentType: AgentType): boolean => {
  const config = AGENT_CONFIGS[agentType];
  return !config.name.includes('Deshabilitado');
};

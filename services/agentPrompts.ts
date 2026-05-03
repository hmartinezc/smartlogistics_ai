// ============================================
// CONFIGURACIÓN DE AGENTES IA - PROMPTS
// ============================================

import { AgentType } from '../types';

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
If the product is NOT listed here, use the EQ-based proportional distribution (see Distribution section).

| Product | Box Type | Stems per Box |
| :--- | :--- | :--- |
| Roses / Spray Roses | QB | **100** |
| Roses / Spray Roses | HB | **250** |
| Gypsophila / Gypso | QB | **150** |
| Alstroemeria | QB | **150** |
| Any other product | QB | **150** |

**HOW TO USE (when product matches or default applies):**
- Roses: 1 HB + 1 QB = 250 + 100 = 350, or 8 QB + 1 HB = 800 + 350 = 1150.
- Any other product not listed above: use 150 stems per QB as default.
- The remainder after assigning table values goes to the biggest box type (highest EQ).
`;

// --------------------------
// Reglas de Extracción Header/Footer
// --------------------------
export const HEADER_FOOTER_RULES = `
### HEADER/FOOTER EXTRACTION (CRITICAL):
- **FOOTER TOTALS:** Extract 'TOTAL PIECES' and 'TOTAL EQ/FULLS' **EXACTLY AS PRINTED** on the image. 
- **DO NOT FIX OR AUTO-CORRECT THE FOOTER.** If the image says Total=10 but lines sum to 8, YOU MUST RETURN 10. I need to detect the error.
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

**SPECIFIC ERROR CORRECTION:**
- If you see: Stems=260, Price=0.79
- Image might say: 173.80 (THIS IS WRONG).
- CORRECT MATH: 260 * 0.79 = 205.40.
- **YOU MUST EXTRACT: 205.40**.

**SCENARIO A: Standard Extraction**
If the table has clear "Pieces" and "Box Type" columns for EVERY row, extract them 1:1.
Calculate 'eqFull' using the math table.

**SCENARIO E (The "Varieties" / Child Rows):**
If a row has valid Pieces/Type (e.g., "2 EB"), and the **NEXT ROWS** have **EMPTY** Pieces/Type columns but contain Description text:
1.  **DO NOT** create new line items for these "child" rows.
2.  **ADD** the description text of these child rows to the 'varieties' array of the PARENT row.
3.  The Parent Row keeps the total piece count.

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

**UNIT PRICE IS CONSTANT:**
The 'unitPrice' is the SAME for every row within the same invoice.
- unitPrice = footer.totalValue / footer.totalStems.
- Each row's totalValue = row.totalStems × unitPrice.

**FINAL VERIFICATION:**
- Sum of all row.totalStems MUST equal footer.totalStems (exact integer match).
- Sum of all row.totalValue MUST equal footer.totalValue (within 0.02 rounding tolerance).
`;

// --------------------------
// Algoritmo de Confidence Score
// --------------------------
export const CONFIDENCE_SCORE_ALGORITHM = `
### CONFIDENCE SCORE ALGORITHM
Start with 100.
1. **MATH DISCREPANCY (-50 pts):** Calculate Sum(LineItems.TotalPieces). If it differs from Footer, subtract 50.
2. **EQ DISCREPANCY (-40 pts):** Calculate Sum(LineItems.EqFull). If it differs from Footer, subtract 40.
`;

// --------------------------
// Prompt Base del Sistema
// --------------------------
export const SYSTEM_PROMPT_INTRO = `
You are a Super Agent specialized in Perishable Logistics (Flowers). 
Your goal is to extract invoice data and DETECT DISCREPANCIES using strict math.
`;

// --------------------------
// Generador de Prompt Completo
// --------------------------
export const buildExtractionPrompt = (format: AgentType): string => {
  const useAdvancedDistribution = format === 'AGENT_TCBV' || format === 'AGENT_GENERIC_A';
  
  const sections = [
    SYSTEM_PROMPT_INTRO,
    BOX_TYPES_KNOWLEDGE_BASE,
    PRODUCT_STEMS_KNOWLEDGE_BASE,
    HEADER_FOOTER_RULES,
    TABLE_EXTRACTION_RULES,
    useAdvancedDistribution ? ADVANCED_DISTRIBUTION_LOGIC : '',
    CONFIDENCE_SCORE_ALGORITHM,
    `
**OUTPUT:**
Return the extracted data in strict JSON format following the provided schema.
    `.trim()
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
  AGENT_TCBV: {
    id: 'AGENT_TCBV',
    name: 'TCBV Logistics',
    description: 'Agente especializado para facturas TCBV con lógica de distribución avanzada',
    icon: '🌸',
    features: [
      'Extracción de tipos de caja (FB, HB, QB, EB, DS)',
      'Cálculo automático de EQ',
      'Distribución proporcional de valores',
      'Detección de discrepancias matemáticas',
    ],
    useAdvancedDistribution: true,
  },
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
  return Object.values(AGENT_CONFIGS).filter(
    agent => !agent.name.includes('Deshabilitado')
  );
};

export const isAgentEnabled = (agentType: AgentType): boolean => {
  const config = AGENT_CONFIGS[agentType];
  return !config.name.includes('Deshabilitado');
};

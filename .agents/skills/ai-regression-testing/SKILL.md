---
name: ai-regression-testing
description: Validate that changes to AI prompts, extraction logic, or data schemas don't break existing extraction quality. Use when modifying agentPrompts.ts, extractionSchema.ts, or ai.ts routes. Covers golden test sets, diff testing, and confidence score regression.
license: MIT
metadata:
  author: smart-logistics
  version: "1.0.0"
---

# AI Regression Testing

Prevent silent degradation of AI extraction quality when modifying prompts, schemas, or processing logic.

## Why This Matters for This Project

This project's core value is **reliable invoice data extraction via Gemini**. Changes to:
- `services/agentPrompts.ts` — prompt assembly
- `server/routes/ai.ts` — extraction endpoint
- `shared/extractionSchema.ts` — data validation
- `config.ts` — AI model or parameters

...can silently reduce extraction quality. AI outputs are non-deterministic, so manual testing is unreliable. Automated regression testing catches degradation.

## Strategy 1: Golden Test Set

### Create a Test Fixture Repository

```
tests/fixtures/invoices/
├── golden/
│   ├── tcbv-invoice-1.pdf
│   ├── tcbv-invoice-1.expected.json    # Expected extraction output
│   ├── generic-a-invoice-1.pdf
│   ├── generic-a-invoice-1.expected.json
│   ├── customs-invoice-1.pdf
│   └── customs-invoice-1.expected.json
├── edge-cases/
│   ├── empty-table.pdf
│   ├── multi-page.pdf
│   ├── rotated.pdf
│   └── handwritten.pdf
└── README.md  # Source and characteristics of each fixture
```

### Expected Output Format

Each `.expected.json` contains the ground truth:

```json
{
  "agentType": "AGENT_TCBV",
  "expectedData": {
    "header": {
      "invoiceNumber": "FAC-2024-001",
      "date": "2024-01-15",
      "supplier": "Flores del Valle S.A.",
      "client": "Importadora ABC"
    },
    "items": [
      {
        "product": "Roses",
        "stems": 1200,
        "boxType": "FB",
        "unitPrice": 0.35,
        "totalPrice": 420.00
      }
    ],
    "footer": {
      "subtotal": 420.00,
      "totalBoxes": 1,
      "totalStems": 1200
    }
  },
  "requiredFields": ["header.invoiceNumber", "header.date", "items[].product"],
  "tolerances": {
    "footer.subtotal": 0.01,
    "items[].unitPrice": 0.01
  }
}
```

## Strategy 2: Automated Regression Test

### Test Runner: `tests/regression/extraction.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildExtractionPrompt } from '../../services/agentPrompts';
import { AI_CONFIG } from '../../config';

const GOLDEN_DIR = join(__dirname, '..', 'fixtures', 'invoices', 'golden');

// Mock Gemini API
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(),
}));

describe('Extraction Regression', () => {
  const fixtures = readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.expected.json'))
    .map((f) => f.replace('.expected.json', ''));

  for (const name of fixtures) {
    it(`golden: ${name}`, async () => {
      const expectedPath = join(GOLDEN_DIR, `${name}.expected.json`);
      const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));

      // Mock the Gemini response based on expected
      const mockGenerateContent = vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify(expected.expectedData),
          usageMetadata: {
            promptTokenCount: 500,
            candidatesTokenCount: 200,
          },
        },
      });

      // Inject mock
      const { extractInvoiceData } = await import(
        '../../services/geminiService'
      );

      // Run extraction
      const result = await extractInvoiceData(
        Buffer.from('mock-pdf'),
        expected.agentType,
      );

      // Assert required fields exist
      for (const field of expected.requiredFields) {
        expect(getNestedValue(result, field)).toBeDefined();
      }

      // Assert values within tolerance
      assertWithinTolerance(result, expected.expectedData, expected.tolerances);
    });
  }
});
```

### Helper Functions

```typescript
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (key.includes('[]')) {
      const arrKey = key.replace('[]', '');
      return current[arrKey]?.[0];
    }
    return current?.[key];
  }, obj);
}

function assertWithinTolerance(
  actual: any,
  expected: any,
  tolerances: Record<string, number>,
  path: string = '',
): void {
  for (const [key, expectedVal] of Object.entries(expected)) {
    const currentPath = path ? `${path}.${key}` : key;
    const tolerance = tolerances[currentPath];

    if (typeof expectedVal === 'object' && !Array.isArray(expectedVal)) {
      assertWithinTolerance(actual[key], expectedVal, tolerances, currentPath);
    } else if (tolerance !== undefined && typeof expectedVal === 'number') {
      expect(actual[key]).toBeCloseTo(expectedVal, Math.abs(Math.log10(tolerance)));
    } else if (tolerance === undefined) {
      // Exact match for non-numeric fields
      expect(actual[key]).toEqual(expectedVal);
    }
  }
}
```

## Strategy 3: Prompt Diff Testing

When prompts change, compare extraction quality on the golden set:

```bash
# Before making changes, establish baseline
node scripts/regression/baseline.js --agent AGENT_TCBV --output baseline.json

# After changes, compare
node scripts/regression/compare.js --baseline baseline.json --agent AGENT_TCBV
```

### Baseline Script: `scripts/regression/baseline.js`

```javascript
/**
 * Records current extraction quality on golden test set as baseline.
 * Run before modifying prompts or extraction logic.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const GOLDEN_DIR = join(process.cwd(), 'tests', 'fixtures', 'invoices', 'golden');

// Run extraction on each golden fixture and record:
// - Input token count
// - Output token count
// - Extraction time
// - Confidence score
// - Key field values (for diff comparison)

async function main() {
  const baseline = {};
  const fixtures = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.pdf'));

  for (const fixture of fixtures) {
    console.log(`Processing ${fixture}...`);
    // Call extraction service
    // Record results
    baseline[fixture] = {
      timestamp: Date.now(),
      modelId: AI_CONFIG.MODEL_ID,
      // ... results
    };
  }

  writeFileSync('baseline.json', JSON.stringify(baseline, null, 2));
  console.log('Baseline saved to baseline.json');
}

main();
```

## Strategy 4: Confidence Score Regression

Monitor that confidence scores don't degrade across versions:

```typescript
describe('Confidence Score Regression', () => {
  it('should maintain confidence above threshold', async () => {
    const MIN_CONFIDENCE = 0.85; // 85%

    for (const fixture of goldenFixtures) {
      const result = await extractInvoiceData(fixture.buffer, fixture.agentType);
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    }
  });
});
```

## Strategy 5: Schema Compatibility Test

Verify that schema changes don't break existing extracted data:

```typescript
import { InvoiceDataSchema } from '../../shared/extractionSchema';

describe('Schema Compatibility', () => {
  it('existing extractions remain valid', () => {
    const savedExtractions = readdirSync(join('tests', 'fixtures', 'saved'));

    for (const file of savedExtractions) {
      const data = JSON.parse(readFileSync(file, 'utf-8'));
      const result = InvoiceDataSchema.safeParse(data);

      if (!result.success) {
        console.error(`Schema broke for: ${file}`);
        console.error(result.error.format());
      }

      expect(result.success).toBe(true);
    }
  });
});
```

## Integration into Development Workflow

### Before Changing Prompts
1. Run baseline recording: `node scripts/regression/baseline.js`
2. Verify all golden tests pass: `npx vitest run tests/regression/`

### After Changing Prompts
1. Run regression tests: `npx vitest run tests/regression/`
2. Run comparison: `node scripts/regression/compare.js --baseline baseline.json`
3. Check confidence score regression
4. If any test fails, review the change — it likely degraded quality

### CI Integration (Future)
```yaml
# .github/workflows/ai-regression.yml
- name: AI Regression Tests
  run: npx vitest run tests/regression/
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## Red Flags (Must Fix Before Merge)

- Golden test failure on any fixture
- Confidence score drops below 85% on any agent
- Token usage increases >20% without corresponding quality improvement
- Schema validation breaks for any existing saved extraction
- New extracted fields that didn't exist before (prompt hallucination)

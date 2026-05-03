---
name: customs-trade-compliance
description: Customs documentation, trade compliance, and international shipping regulations for logistics applications. Use when working with customs-related features, international freight documentation, HS codes, duties, or cross-border trade compliance.
license: MIT
metadata:
  author: smart-logistics
  version: '1.0.0'
---

# Customs & Trade Compliance

Domain knowledge for building customs and trade compliance features in logistics software.

## When to Use

This skill is activated when working on:

- Customs documentation extraction or generation
- International freight and shipping features
- HS (Harmonized System) code classification
- Import/export duty calculations
- Trade compliance validation
- The `AGENT_CUSTOMS` extraction agent in this project

## Core Customs Concepts

### Key Documents

| Document                  | Purpose                                      | Key Fields                                                        |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| **Commercial Invoice**    | Declares transaction value                   | Shipper/consignee, HS codes, value, currency, incoterms           |
| **Air Waybill (AWB)**     | Contract of carriage for air freight         | AWB number, origin/destination, pieces, weight, chargeable weight |
| **Packing List**          | Details package contents                     | Box types, quantities, weights, dimensions per package            |
| **Certificate of Origin** | Proves goods origin for preferential tariffs | Country of origin, exporter certification                         |
| **Customs Declaration**   | Formal entry to customs authority            | Declarant info, goods description, tariff classification, value   |

### HS Codes (Harmonized System)

- 6-digit international standard for classifying traded products.
- Countries extend to 8-10 digits for national specificity.
- **Flower/fresh cut flowers:** HS Chapter 06 (Live trees and other plants).
  - `0603.11` — Roses
  - `0603.12` — Carnations
  - `0603.13` — Orchids
  - `0603.14` — Chrysanthemums
  - `0603.15` — Lilies (Lilium spp.)
  - `0603.19` — Other fresh cut flowers (Gypsophila, Alstroemeria, etc.)

### Incoterms (International Commercial Terms)

Common for air freight flowers:

- **EXW** (Ex Works) — Buyer bears all costs and risks from seller's premises.
- **FCA** (Free Carrier) — Seller delivers to carrier, buyer handles main carriage.
- **CPT** (Carriage Paid To) — Seller pays freight to destination.
- **DAP** (Delivered at Place) — Seller bears all costs except import clearance.

### Customs Valuation

- **Transaction Value Method:** Primary method — price actually paid or payable.
- **Deductive Value:** Based on resale price in importing country.
- **Computed Value:** Cost of production + profit + general expenses.

### Duty Calculation

```
Duty = Customs Value × Duty Rate
Total Landed Cost = Customs Value + Duty + VAT + Other Fees
```

### Phytosanitary Requirements (Flowers)

- **Phytosanitary Certificate:** Required for import of fresh cut flowers in most countries.
- Must be issued by the exporting country's plant protection organization.
- Certifies freedom from pests and diseases.
- May require fumigation or cold treatment.

## Relevant to This Project

### AGENT_CUSTOMS (Currently Disabled)

The `AGENT_CUSTOMS` agent in `services/agentPrompts.ts` is designed for extracting customs-related data. When reactivated, it should handle:

1. **Customs-specific fields to extract:**
   - HS Code(s) per product line
   - Country of origin
   - Incoterms
   - Declared value for customs
   - Currency of transaction
   - Phytosanitary certificate number
   - AWB / Master AWB number
   - Customs broker reference

2. **Customs-specific validation:**
   - HS codes should match product descriptions
   - Values should match commercial invoice
   - Origin country should be consistent with phytosanitary certificate
   - Incoterms should be valid for the transport mode

### Prompt Knowledge Base Extension

When building the `AGENT_CUSTOMS` prompt section in `agentPrompts.ts`:

```typescript
export const CUSTOMS_KNOWLEDGE_BASE = `
CUSTOMS EXTRACTION RULES:
- Extract HS Codes in 6-digit minimum format.
- Validate that HS codes correspond to fresh cut flowers (Chapter 06) when applicable.
- Phytosanitary certificate numbers follow format: [COUNTRY_CODE]/[YEAR]/[SEQUENCE].
- AWB numbers are 11 digits (3-digit airline prefix + 8-digit serial).
- Declared value must match the commercial invoice total.
- Currency codes must be ISO 4217 (USD, EUR, COP, etc.).
- Incoterms must be valid 3-letter codes.
- For flower shipments, verify the product description includes botanical names when available.
`;
```

### Compliance Checks (Future Feature)

For a compliance validation layer:

1. **Document completeness:** Required documents present for destination country.
2. **HS code validity:** Check code against tariff database.
3. **Value consistency:** Cross-check across commercial invoice + AWB.
4. **Phytosanitary validity:** Certificate issued within valid window (typically 14 days).
5. **Restricted goods check:** Verify no prohibited items for destination.

## Regulatory References

- **WCO (World Customs Organization):** HS Nomenclature
- **ICC (International Chamber of Commerce):** Incoterms 2020
- **IPPC (International Plant Protection Convention):** ISPM standards for phytosanitary measures
- **IATA:** Air Waybill standards and dangerous goods regulations
- **WTO Trade Facilitation Agreement:** Customs modernization standards

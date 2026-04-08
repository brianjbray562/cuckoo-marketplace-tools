# CUCKOO Marketplace Tools — Complete Generation Logic

**Last Updated:** April 2026
**Model:** claude-sonnet-4-20250514
**Purpose:** This document contains every prompt, rule, parameter, and data field used to generate listing content. Share with your team for review and QA.

---

## Table of Contents

1. [Title Generation](#1-title-generation)
2. [Bullet Point Generation](#2-bullet-point-generation)
3. [Backend Keyword Generation](#3-backend-keyword-generation)
4. [Product Database Fields](#4-product-database-fields)
5. [Marketplace Character Limits](#5-marketplace-character-limits)
6. [Marketplace Guidelines](#6-marketplace-guidelines)
7. [Keyword Restrictions](#7-keyword-restrictions)
8. [Sources by Marketplace](#8-sources-by-marketplace)

---

## 1. Title Generation

### API Parameters

| Parameter | Value |
|-----------|-------|
| Model | claude-sonnet-4-20250514 |
| max_tokens | 1500 |
| temperature | 0.3 |

### System Prompt

```
You are a senior ecommerce listing specialist at CUCKOO Electronics America. Premium Korean brand: rice cookers, water purifiers, air purifiers, bidets, kitchen appliances.

CUCKOO TITLE RULES (apply to ALL marketplaces):

PRIORITY (tight char limits — drop from bottom first):
P1 (NEVER DROP): Brand "CUCKOO" + Cup capacity with Uncooked/Cooked
P2 (NEVER DROP): Technology/type (include dual technologies when both present)
P3 (drop first): Model number in parentheses

RULE 1 — Every cup capacity MUST have "Uncooked" or "Cooked" (e.g. "6-Cup Uncooked"). Hyphen required. NEVER bare "6-Cup" without qualifier. Default Uncooked. Include both if known (e.g. "6-Cup Uncooked / 12-Cup Cooked").

RULE 2 — Order: CUCKOO [Tech] Rice Cooker [Cup Size], [Features], [Color] ([Model]). No "& Warmer". Cup size AFTER "Rice Cooker". Dual tech (Twin Pressure + Induction Heating): BOTH must appear after CUCKOO in every title — drop model number before dropping tech. Valid types: Basic, Micom, Pressure, Twin Pressure, Induction Heating Pressure, Electric Heating Pressure, Twin Pressure + Induction. Do NOT use "Fuzzy Logic" as a type — use "Micom" instead.

RULE 3 — Model numbers in parentheses, placed LAST. Remove entirely if over char limit — first thing to sacrifice.

RULE 4 — Flowing titles, not keyword lists. "with" connects features, "&" within groups, 3-4 commas max.

RULE 5 — ONLY use features from (a) the original title or (b) VERIFIED PRODUCT DATA from the internal database. Never invent. If title is sparse, enrich from database.

KEYWORD RESTRICTIONS (all marketplaces):
- 'small'/'mini'/'compact': only for 3-cup or smaller
- 'pressure': only for CRP- models
- 'induction': only for IH models
- 'Korean'/'Korean Rice Cooker': only if verified made in Korea
- 'Stainless Steel': only if inner pot IS stainless steel
- 'low carb': only if product has that feature
- 'Fuzzy Logic': do NOT use as a product type or heating method. Use 'Micom' instead. Never in titles.

SELF-CHECK — verify EVERY title against ALL of these:
a) Every cup count has "Uncooked" or "Cooked" qualifier
b) Model number in parentheses at end (or omitted if over limit)
c) NO features or specs that are NOT in the product database
d) NO keyword restriction violations
e) NO "& Warmer" anywhere
f) NO "Fuzzy Logic" in any title
g) Every title is within its marketplace character limit
h) Title Case used consistently (except Wayfair: sentence case)
```

### Category Rules (appended to system prompt)

**Rice Cooker:**
```
Apply ALL CUCKOO TITLE RULES above. For Amazon: prioritize exact-matching high-volume keyword phrases within 200 chars. 'Rice Maker' and 'Rice Warmer' are high-volume synonyms — include naturally. NEVER use 'Fuzzy Logic' in any title — use 'Micom' for the product type instead. ONLY include features that exist in the VERIFIED PRODUCT DATA.
```

**Water Purifier:**
```
Do NOT apply rice-cooker-specific rules. Title order: CUCKOO [Purifier Line/Type] [Product Type] [Key Feature/Stage Count] [extras]. Common keywords: Water Purifier, Filtration, Reverse Osmosis, Alkaline, Mineral, Countertop, Under-Sink, Filter, Stage, Tankless, Self-Cleaning.
```

**Air Purifier:**
```
Do NOT apply rice-cooker-specific rules. Title order: CUCKOO [Product Line] Air Purifier [Coverage Area] [Key Feature] [extras]. Common keywords: Air Purifier, HEPA, True HEPA, Activated Carbon, Coverage, Sq Ft, Smart Sensor, Auto Mode, Sleep Mode, Allergen, Dust, Odor.
```

**Bidet:**
```
Do NOT apply rice-cooker-specific rules. Title order: CUCKOO [Product Line] Bidet [Seat Type] [Key Features] [extras]. Common keywords: Bidet, Bidet Seat, Elongated, Round, Heated Seat, Warm Water, Air Dryer, Deodorizer, Self-Cleaning Nozzle, Adjustable.
```

### Reference Example

**Input:** `CUCKOO CRP-P0609S 6 Cup Electric Heating Pressure Rice Cooker with Nonstick Inner Pot, Black`

| Marketplace | Title | Chars |
|-------------|-------|-------|
| Amazon (200) | CUCKOO Pressure Rice Cooker 6-Cup Uncooked / 12-Cup Cooked Rice Maker with Nonstick Inner Pot, Auto Clean, Voice Guide, 12 Cooking Modes, Turbo Mode, Black (CRP-P0609S) | 168 |
| Walmart (75) | CUCKOO Pressure Rice Cooker 6-Cup Uncooked, Nonstick, Black | 59 |
| Target (100) | CUCKOO Pressure Rice Cooker 6-Cup Uncooked with Nonstick Inner Pot, Voice Guide, Black | 86 |

### User Message Template (Model Number Mode)

```
Model number: "{sku}"
This is a CUCKOO product model number. There is NO existing Amazon title — you must CREATE one from scratch.

{VERIFIED PRODUCT DATA from database}

1. Use the VERIFIED PRODUCT DATA above as your ONLY source for ALL product specs.
   Do NOT add any features, specs, or technologies not in the database.
2. Create a fully optimized Amazon title maximizing 200 chars with high-volume keyword phrases.
3. Put this title in amazon_audit.suggested_title. Score it based on SEO strength.
4. Then convert for these marketplaces: {selected marketplaces}

Guidelines:
{per-marketplace guidelines}
Respond ONLY with valid JSON.
```

### Expected Output Schema

```json
{
  "amazon_audit": {
    "score": 8,
    "strengths": ["Uses full 200 chars", "Includes high-volume keywords"],
    "improvements": ["Could add 'Rice Steamer' synonym"],
    "suggested_title": "CUCKOO Twin Pressure Rice Cooker 6-Cup Uncooked..."
  },
  "conversions": {
    "amazon": { "title": "...", "char_count": 198, "changes": ["Maximized keyword density"] },
    "walmart": { "title": "...", "char_count": 72, "changes": ["Shortened for 75-char limit"] },
    "target": { "title": "...", "char_count": 95, "changes": ["Retail shelf-tag tone"] }
  }
}
```

---

## 2. Bullet Point Generation

### API Parameters

| Parameter | Value |
|-----------|-------|
| Model | claude-sonnet-4-20250514 |
| max_tokens | 1500 |
| temperature | 0.3 |

### System Prompt

```
You are a senior ecommerce copywriter at CUCKOO Electronics America. Generate 5 bullet points for a product listing. Each bullet should start with a CAPITALIZED benefit phrase (2-4 words), followed by a colon and descriptive text. Bullet points should cover: key technology/feature, capacity/convenience, material/quality, ease of use, and brand trust/warranty. For Amazon: max 500 chars per bullet, keyword-rich. For other marketplaces: adapt tone per guidelines. Only use verified product data — never invent features.
Respond ONLY with valid JSON: {"bullets":[{"heading":"...","text":"..."}],"marketplace":"...","char_counts":[]}
```

### User Message Template

```
Generate 5 bullet points for this CUCKOO product on {marketplace}:
Model: {model number}

{VERIFIED PRODUCT DATA from database}

LISTING TITLE (align bullet points with the keywords and features in this title for SEO consistency):
"{amazon title}"

Marketplace: {marketplace name}
{marketplace guidelines}
Respond ONLY with valid JSON.
```

### Rules

- 5 bullets per product
- Format: **CAPITALIZED HEADING:** descriptive text
- Cover these 5 angles: technology/feature, capacity/convenience, material/quality, ease of use, brand trust/warranty
- Amazon: max 500 characters per bullet, keyword-rich
- Other marketplaces: adapt tone per guidelines
- Only use verified product data — never invent features
- Align keyword usage with title for SEO consistency

### Expected Output Schema

```json
{
  "bullets": [
    { "heading": "ADVANCED PRESSURE COOKING", "text": "Experience perfectly cooked rice every time with CUCKOO's Twin Pressure technology..." },
    { "heading": "GENEROUS 6-CUP CAPACITY", "text": "Cook up to 6 cups of uncooked rice (12 cups cooked)..." },
    { "heading": "PREMIUM NONSTICK INNER POT", "text": "The Black Shine Eco-Stainless Nonstick inner pot..." },
    { "heading": "EFFORTLESS OPERATION", "text": "Choose from 20 cooking modes including..." },
    { "heading": "TRUSTED KOREAN QUALITY", "text": "Made in South Korea by CUCKOO, the #1 rice cooker brand..." }
  ],
  "marketplace": "Amazon",
  "char_counts": [245, 198, 223, 267, 234]
}
```

---

## 3. Backend Keyword Generation

### API Parameters

| Parameter | Value |
|-----------|-------|
| Model | claude-sonnet-4-20250514 |
| max_tokens | 800 |
| temperature | 0.3 |

### System Prompt

```
Amazon backend keyword specialist for CUCKOO Electronics America. Generate hidden search terms for a CUCKOO Rice Cooker listing (500 byte max). Prioritize:
1. COMPETITOR BRAND NAMES (highest priority): zojirushi tiger aroma cosori toshiba comfee dash ninja instant pot tatung yum asia sakura panasonic hitachi midea hamilton beach black decker cuisinart
2. ALTERNATE LANGUAGE TERMS: arrocera olla arrocera arrocera electrica olla arrocera electrica cocedor de arroz rice robot
3. SYNONYM PHRASES not in the title: rice maker rice pot rice steamer grain cooker multi cooker slow cooker food steamer hot pot
- Feature/spec terms not in the title or bullet points
- Use-case synonyms shoppers search
Rules: space-separated only, no punctuation, no words already in listing title or bullet points, no ASINs or promo phrases, stay under 500 bytes.
Respond ONLY with valid JSON: {"keywords":"space-separated string","byte_count":0,"strategy":["brief explanation"],"excluded":[]}
```

### User Message Template

```
Generate Amazon backend keywords for this product:
CUCKOO Rice Cooker. Technology: {tech}. Cup Size: {cups}. Inner Pot Material: {material}. Color: {color}. Selected features: {features}. Model: {model}.

{VERIFIED PRODUCT DATA from database}

CURRENT LISTING TITLE (do NOT repeat any of these words):
"{current title}"

CURRENT BULLET POINTS (do NOT repeat any of these words):
{current bullet points}

Respond ONLY with valid JSON.
```

### Rules

- **Hard limit:** 500 bytes (enforced client-side even if model exceeds)
- **Format:** Space-separated words only, no commas or punctuation
- **Exclude:** Words already in title, words already in bullet points, ASINs, promotional phrases
- **Priority order:**
  1. Competitor brand names (cross-traffic capture)
  2. Spanish/alternate language terms (bilingual shoppers)
  3. Synonyms not in title (rice maker, grain cooker, etc.)
  4. Feature/spec terms not covered elsewhere
  5. Use-case search phrases

### Client-Side Enforcement

After the API returns keywords, the app:
1. Recalculates byte count using `TextEncoder`
2. If over 500 bytes, removes words from the end until under 500
3. Updates the byte count to the final value

### Competitor Brand Names

```
zojirushi tiger aroma cosori toshiba comfee dash ninja instant pot tatung yum asia sakura panasonic hitachi midea hamilton beach black decker cuisinart
```

### Spanish Search Terms

```
arrocera olla arrocera arrocera electrica olla arrocera electrica cocedor de arroz rice robot
```

### Synonym Phrases

```
rice maker rice pot rice steamer grain cooker multi cooker slow cooker food steamer hot pot
```

### Expected Output Schema

```json
{
  "keywords": "zojirushi tiger aroma cosori arrocera olla electrica grain cooker slow cooker food steamer hot pot stainless steel ceramic nonstick keep warm delay timer fuzzy logic multi function programmable digital automatic",
  "byte_count": 487,
  "strategy": [
    "Prioritized competitor brand names for cross-traffic",
    "Included Spanish search terms for bilingual shoppers",
    "Added cooking method synonyms not in title"
  ],
  "excluded": ["rice", "cooker", "cuckoo", "pressure", "induction"]
}
```

---

## 4. Product Database Fields

Each product in PRODUCT_DB contains these fields:

| Field | Type | Example (CRP-LHTR0609FW) |
|-------|------|--------------------------|
| type | string | Twin Pressure + Induction |
| heating | string | Induction Heat |
| pressure | boolean | true |
| cupSize | string | 6 Cup Uncooked / 12 Cup Cooked |
| color | string | White |
| cookingModes | string | 20 |
| cookingModeNames | string/array | White Rice, Sticky White Rice, Savory White Rice, Veggie Rice, Multi Grain Rice, GABA Rice (3H), GABA Rice (OH), Non Pressure White Rice, Sticky Multi Grain Rice, Porridge, Non Pressure Steam, High Pressure Steam, Baby Food, Scorched Rice, Savory Multi Grain Rice, Easy Cook, High Heat Sticky White Rice, High Heat Sticky Multi Grain Rice, Turbo White Rice, Turbo Multi Grain Rice |
| otherMenuModes | string | 1 |
| innerPot | string | Black Shine Eco-Stainless Nonstick |
| features | array | Auto Clean, Turbo Mode, Preset Timer (13 Hours), Water Capture, Voice Guide, Steam Plate |
| mfg | string | South Korea |
| asin | string | B08DP4TGNN |
| wattage | string | 1090W |
| dimensions | string | 15.1 x 10.2 x 10.3 in |
| price | string | $559.99 |

**Total products:** 47 verified rice cooker models

---

## 5. Marketplace Character Limits

| Marketplace | Char Limit | Case Style | Source Confidence |
|-------------|-----------|------------|-------------------|
| Amazon | 200 | Title Case | HIGH — Official Seller Central |
| Walmart | 75 | Title Case | HIGH — Official Marketplace Learn |
| Target | 100 (recommended), 150 (hard max) | Title Case | MEDIUM-HIGH — Integration docs |
| Best Buy | 120 | Title Case | MEDIUM — ChannelEngine docs |
| Wayfair | 150 | **Sentence case** | MEDIUM — Salsify docs |
| Kohl's | 150 | Title Case | LOW — No public docs |
| Macy's | 150 | Title Case | LOW — No public docs |
| Bloomingdale's | 120 | Title Case | LOW — No public docs |
| TikTok Shop | 200 (25 min) | Title Case | HIGH — Official Seller Center |
| Weee! | 120 | Title Case | LOW — No public docs |

---

## 6. Marketplace Guidelines

### Amazon
- Hard limit: 200 chars. USE the full limit
- Prohibited: !, $, ?, _, {, }, ^. Same word max twice. No promo phrases
- Brand CUCKOO first. Numerals for numbers
- HIGH keywords: rice cooker, cuckoo rice cooker, rice maker, stainless steel rice cooker (only if SS), japanese rice cooker, korean rice cooker (only if Korea), rice steamer
- MEDIUM keywords: pressure rice cooker (CRP- only), rice warmer, induction rice cooker (IH only), cuckoo pressure rice cooker (CRP- only)
- SIZE keywords: rice cooker 6 cup, rice cooker 10 cup, rice cooker 4 cup, 3 cup rice cooker
- FEATURE keywords: nonstick inner pot, stainless steel inner pot (only if SS), keep warm, delay timer, steamer basket, multi cooker

### Walmart
- 75 chars max (70 safe for mobile)
- Format: Brand + Item Name + Key Attribute + Size
- Brevity over keywords. Mobile-first. 1-2 descriptors max

### Target
- 100 chars recommended (hard limit 150, min 21)
- Format: Brand + Item Type + Key Feature + Size/Color
- Retail-ready, clean shelf-tag tone. 2-3 descriptors max

### Best Buy
- 120 chars max (Mirakl platform)
- Format: Brand + Product Line + Model + Key Spec + Product Type
- Tech-savvy audience: include model numbers, wattage, heating type

### Wayfair
- 150 chars max. **Sentence case (NOT Title Case)**
- Home-focused, style-conscious tone. Material/finish details valued

### Kohl's
- 150 chars max (Mirakl platform)
- Department-store-ready. Family/home shoppers. Ease of use emphasis

### Macy's
- ~150 chars recommended (Mirakl platform)
- Department-store tone. Material/quality callouts valued
- Align with existing CUCKOO Macy's naming

### Bloomingdale's
- 120 chars max. Shares Macy's Mirakl platform
- Premium luxury tone. Minimal, elegant language
- Emphasize craftsmanship, materials, technology as premium signals

### TikTok Shop
- 25-200 chars
- Social commerce: snappy, scannable. No clickbait
- Title confirms what shoppers saw in video

### Weee!
- 120 chars max
- Asian-American shoppers. Community-focused, culturally relevant
- 'Korean Rice Cooker' only if made in Korea

---

## 7. Keyword Restrictions

These apply to ALL marketplaces and ALL content types:

| Keyword | Restriction | How Verified |
|---------|-------------|-------------|
| small / mini / compact | Only for 3-cup or smaller models | Check cupSize field |
| pressure | Only for CRP- model numbers | Check SKU prefix |
| induction | Only for models with Induction heating | Check heating field |
| Korean / Korean Rice Cooker | Only if made in South Korea | Check mfg field |
| Stainless Steel | Only if inner pot IS stainless steel | Check innerPot field |
| low carb | Only if product has that feature | Check features array |
| Fuzzy Logic | NEVER in titles. Micom type instead. OK in bullets/descriptions only | Always banned from titles |
| & Warmer | NEVER anywhere | Always banned |

---

## 8. Sources by Marketplace

### Amazon (6 sources — HIGH confidence)
1. Amazon Seller Central — Product Title Requirements (Official, Jan 2025)
2. Search Engine Land — Amazon Title Policy: Key Changes & Implementation
3. Carbon6/SellerAssist — New Amazon Product Title Requirements 2025
4. eComEngine/SellerPulse — Navigating Amazon's Updated Product Title Guidelines (Jan 2026)
5. Ecomtent — Amazon 2025 Title Requirements & COSMO/RUFUS Context
6. Amalytix — Amazon Product Title Guidelines (with Title Checker Tool)

### Walmart (5 sources — HIGH confidence)
1. Walmart Marketplace Learn — Product Details Policy (Official, Dec 2025)
2. Walmart Marketplace Learn — Content Standards & Keyword Optimization (Official)
3. Brandwoven — Walmart Listing SEO: Mobile vs Desktop (Jan 2026)
4. GoAura — How to Write High-Converting Walmart Product Titles
5. Channable — Walmart Product Listing: Beginner's Guide & Best Practices

### Target (5 sources — MEDIUM-HIGH confidence)
1. Zentail Help Center — Requirements for Selling on Target+
2. GoFlow — Target Plus Listings Guide (Title 2-100 chars)
3. Feedonomics — Selling on Target Plus Successfully (2025)
4. ChannelEngine — Target Plus: Marketplace Guide (Jan 2026)
5. eComClips — Sell on Target Plus with ChannelAdvisor

### Best Buy (5 sources — MEDIUM confidence)
1. Best Buy — Marketplace Program Policies (Official, Apr 2025)
2. Best Buy — Marketplace Standard Terms (Official, Apr 2025)
3. Best Buy Corporate — Digital Marketplace Launch Announcement (Aug 2025)
4. ChannelEngine — Best Buy US Marketplace Guide (120-char title limit)
5. eDesk — Best Buy's Mirakl-Powered Marketplace (2026)

### Wayfair (5 sources — MEDIUM confidence)
1. Wayfair — Optimize Products (Official Seller Portal)
2. Wayfair — Adding Assortment (Official Seller Portal)
3. Linnworks — Wayfair Marketplace: A Seller's Guide to Success
4. Priceva — Selling on Wayfair in 2025: Complete Guide
5. Salsify — How to Sell on Wayfair (150-char max, sentence case)

### Kohl's (3 sources — LOW confidence)
1. Kohl's — Marketplace Certified Partners
2. Mirakl — Marketplace Listing Best Practices
3. Pattern — How to Sell on Kohl's Marketplace (2025)

### Macy's (2 sources — LOW confidence)
1. Macy's Marketplace — FAQ & Requirements
2. ChannelEngine — Macy's Guide

### Bloomingdale's (3 sources — LOW confidence)
1. Macy's Marketplace FAQ (shared Mirakl platform)
2. Mirakl — Marketplace Listing Best Practices
3. ChannelEngine — Bloomingdale's Marketplace Guide

### TikTok Shop (5 sources — HIGH confidence)
1. TikTok Seller Center — Product Listing Policy (Official)
2. TikTok Seller Center — Product Listing: What You Need to Know (Official)
3. TikTok Seller Center — Product Detail Pages & Listing Quality (Official)
4. TikTok Seller Center — Content Policy (Official)
5. TikTok Seller Center — Policy Pulse (Jan 2026)

### Weee! (3 sources — LOW confidence)
1. Weee! — Sell on Weee!
2. Weee! — Global+ Seller Onboarding
3. Weee! — About: Asian & Hispanic Grocery Delivery

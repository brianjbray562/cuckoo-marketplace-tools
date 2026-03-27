# CUCKOO Marketplace Tools — Claude Code Project Brief

## What This App Is
A React JSX artifact (single-file, ~1,970 lines) for CUCKOO Electronics America's ecommerce team. It runs inside Claude's artifact sandbox and makes fetch() calls to the Anthropic Messages API (`https://api.anthropic.com/v1/messages`) to generate AI-powered content. There is no backend server — everything runs client-side in an iframe.

## The 5 Tools
1. **Marketplace Title Generator** — Takes a CUCKOO model number or Amazon title, generates SEO-optimized titles for 10 marketplaces (Amazon, Walmart, Target, Best Buy, Wayfair, Kohl's, Macy's, Bloomingdale's, TikTok Shop, Weee!). Supports single and bulk mode.
2. **Amazon Backend Keywords** — Generates 500-byte backend search terms for Amazon listings. NOT WORKING — hangs indefinitely on API call.
3. **Amazon Search Volume Report** — Static reference table of keyword search volumes. No API calls. Works fine.
4. **Product Comparison** — Side-by-side comparison of products from the internal database. No API calls. Works fine.
5. **Settings** — Admin-only page for uploading updated product databases (.xlsx/.json). Uses persistent storage API.

## Architecture
- Single React component with `export default function App()`
- 46-model product database embedded as `PRODUCT_DB` constant
- 43 product images embedded as base64 in `PRODUCT_IMAGES`
- `SYSTEM_PROMPT` template literal contains all CUCKOO title rules
- `MARKETPLACES` object contains per-marketplace guidelines
- `BK_CATEGORY_CONFIG` contains backend keyword configuration per product category
- Auth system: two users (cuckoo/cka2026$, admin/cka2026$)
- `lookupProduct(input, db)` searches the database by model number prefix match

## API Call Pattern
The app calls `https://api.anthropic.com/v1/messages` via fetch(). In the artifact sandbox:
- No API key is needed (handled by the sandbox proxy)
- The model string MUST be `claude-sonnet-4-20250514` — other strings may route differently
- Responses come as `data.content` array with `{type: "text", text: "..."}` blocks
- When `tools` array includes web_search, responses may also contain `tool_use` blocks

## Critical Constraints (DO NOT CHANGE)
- **Model string**: `claude-sonnet-4-20250514` — do not use `claude-sonnet-4-5` or any other variant
- **Single file**: Everything must stay in one .jsx file — this is an artifact, not a multi-file project
- **No external dependencies** except what's available in the artifact sandbox: React, Tailwind (utility classes only), recharts, lucide-react, lodash, d3, shadcn/ui, Tone, mammoth, papaparse, sheetjs
- **No localStorage/sessionStorage** — use `window.storage.get/set/delete/list` (artifact persistent storage API)
- **No `<form>` tags** — use onClick handlers
- The artifact sandbox may rate-limit concurrent API calls — parallel Promise.all calls may be serialized

---

## KNOWN BUGS (Priority Order)

### BUG 1 — Backend Keywords Tool Hangs (CRITICAL)
**Symptom**: Clicking "Generate" shows the button spinner but the API call never completes. No error shown, no results, spinner spins forever.

**What we've tried that DIDN'T fix it**:
- Giving BK its own AbortController (instead of sharing abortRef with title gen)
- Removing web_search tool from the BK fetch call
- Converting the system prompt from template literal to string concatenation
- Reducing max_tokens from 3000 to 500
- Replacing bkLoadingRef with useState guard

**What we know**:
- The title generator's fetch calls work with the exact same model string and API endpoint
- Title gen uses `system: SYSTEM_PROMPT + catRules` (variable reference). BK uses an inline template literal with `${interpolations}` inside JSON.stringify. This is the main structural difference.
- BK's system prompt contains `<number>` inside a JSON template which may cause issues inside JSON.stringify
- The `bkLoadingRef.current` guard can get stuck as `true` if the component unmounts during an in-flight request, blocking all future calls until page refresh
- The catch block sets `setBkError()` but no error ever appears — suggesting the fetch hangs rather than errors

**Suggested investigation**:
1. Compare the exact JSON body of a working title gen call vs the BK call
2. Check if the template literal produces valid JSON when serialized
3. Check if the `<number>` in the JSON template inside the system prompt is causing JSON.stringify to produce invalid output
4. Try matching the title gen's exact fetch pattern: store system prompt in a variable using string concatenation, pass `messages` the same way
5. Add a visible timeout (e.g., 60s) that shows an error instead of spinning forever
6. Ensure bkLoadingRef can never get permanently stuck

### BUG 2 — Title Generator Intermittent Slowness
**Symptom**: Sometimes completes in 30-60s, sometimes hangs for 2+ minutes.

**What we know**:
- The original file (before any modifications) also hangs sometimes — confirmed by testing the untouched project file
- This appears to be API-side latency in the artifact sandbox, not a code bug
- When it does complete, the results are correct

**What's been done**:
- Removed sequential validation API call (was adding 30s)
- Removed CUCKOO_RULES_REMINDER from marketplace joins (was adding 3,255 chars per batch)
- Removed web_search tool from title gen calls
- Compressed SYSTEM_PROMPT
- Removed duplicate rules from marketplace guidelines

**Suggested investigation**:
- Consider adding a visible timeout with retry button
- Consider streaming the response if the artifact sandbox supports it
- Consider showing partial results as they arrive

### BUG 3 — RULE 2 Still Contains "& Warmer" in Examples
The RULE 2 text in SYSTEM_PROMPT says "Do NOT use & Warmer" but its inline examples still contain "& Warmer":
- `"CUCKOO Twin Pressure Induction Heating Rice Cooker 10-Cup Uncooked & Warmer, Nonstick Inner Pot, White/Silver (CRP-JHT1010F)"`
- `"CUCKOO [Type] Rice Cooker [#-Cup Uncooked] & Warmer, [Features], [Color] ([Model])"`
Clean these up so the examples match the rule.

### BUG 4 — RULE 5 References Web Search
RULE 5 tells the model to "use the web search tool to look up the product on cuckooamerica.com" but the web_search tool has been removed from title gen calls. The model can't do what this rule asks. Update RULE 5 to reference the internal product database instead.

---

## PERFORMANCE OPPORTUNITIES

### Prompt Size Reduction
Current per-batch input is ~2,500-3,000 tokens. Opportunities:
- RULE 2 is 985 chars — can be compressed to ~250 chars
- RULE 5 is 494 chars — can be compressed to ~100 chars (remove web search references)
- Amazon search volume data is ~1,200 chars — could compress to ~500 chars (drop volume numbers, keep keyword phrases)
- Amazon KEYWORD RELEVANCY RULES is ~1,155 chars — most duplicate rules already in SYSTEM_PROMPT, could compress to ~200 chars
- TITLE STYLE appears in 9 marketplace guidelines (~160 chars each = 1,440 chars) — could move to SYSTEM_PROMPT once

### Output Budget
- Title gen: max_tokens is 6000 but actual output is ~500-800 tokens. Reducing to 2500-3000 would signal the API to allocate less. Test carefully — too low causes truncation.
- BK: max_tokens is 3000 but actual output is ~200 tokens.

### Batching
- Currently uses 2-way split (Promise.all) for 6+ marketplaces
- We found that a single API call for all 10 marketplaces was faster than 2 parallel calls (the sandbox appears to serialize parallel requests)
- Reverting to single call removed ~30s of overhead

---

## UX IMPROVEMENTS TO CONSIDER

### Progress Feedback
- Title gen has a progress bar with elapsed timer and Cancel button — working well
- BK has NO progress indicator beyond a button spinner — needs a progress bar like title gen
- Bulk mode could show estimated time remaining

### Error Handling
- API errors should show a clear message with a Retry button
- Timeout errors should be distinguishable from parse errors
- Network errors should suggest checking connectivity

### Helper Text
- The text below the model number input still says "The tool will search cuckooamerica.com for product details" — should reference the internal database instead
- No indication of which models are in the database vs not

### Missing Features (User Requested, Not Yet Built)
- Bullet Point Generator (user's #2 priority after title gen)
- Listing Audit Scorecard
- Competitor Title Analyzer

### Accessibility
- No ARIA labels
- No keyboard navigation
- No focus management

### Data Display
- `otherMenuModes` field exists in some DB entries but isn't surfaced in `formatProductContext`
- 4 products missing images: CR-0671V, CRP-HS0657FW, CRP-HZ0683FR, CRP-N0681FV

---

## TITLE GENERATION RULES (For Context)

The model generates titles following these rules:
1. Every cup count MUST have "Uncooked" or "Cooked" (e.g., "6-Cup Uncooked")
2. Title order: CUCKOO [Tech] Rice Cooker [Cup Size], [Features], [Color] ([Model]). No "& Warmer"
3. Model numbers in parentheses at the end, dropped first if over char limit
4. Natural flowing style — use "with" to connect features, "&" within groups, 3-4 commas max
5. Only use features from the database or original title — don't invent
6. If inner pot contains "Nonstick", don't use "Stainless Steel" in title
7. Use "with" to connect features, group related features, pack keywords into natural clauses

Reference title (user-created):
`CUCKOO Twin Pressure Rice Cooker 6-Cup Uncooked / 12-Cup Cooked with Induction Heating Technology, 20 Menu Modes with Voice Guide, Versatile Rice Maker Multi-Cooker & Pressure Cooker (CRP-LHTR0609FW)`

---

## DATABASE UPDATES APPLIED
- CRP-LHTAR0609FB: innerPot = "Stainless Steel" (correct, true SS)
- CRP-LHTAR0609FW: innerPot = "Stainless Steel" (correct, true SS)
- CRP-LHTR0609FW: innerPot = "Black Shine Eco-Stainless Nonstick" (changed from "Stainless Nonstick")

---

## AUTH CREDENTIALS
- Team access: username `cuckoo`, password `cka2026$`
- Admin access: username `admin`, password `cka2026$` (enables Settings page)

---

## HOW TO TEST
1. Log in with cuckoo/cka2026$
2. Title Generator: Enter `CRP-LHTR0609FW`, select all 10 marketplaces, click Generate
3. Backend Keywords: Switch to BK tab, enter model `CRP-LHTR0609FW`, click Generate (this is the broken one)
4. Search Volume: Click the tab, verify the table renders
5. Product Compare: Click the tab, add 2+ models, verify comparison table
6. Settings: Log in as admin/cka2026$, click account icon → Settings, verify upload interface

---

## WHAT NOT TO DO
- Do not rebuild the entire file — make surgical edits only
- Do not change the model string from `claude-sonnet-4-20250514`
- Do not add `localStorage` or `sessionStorage` — they don't work in the artifact sandbox
- Do not split into multiple files — this must remain a single .jsx artifact
- Do not remove the web_search tool from BK without confirming BK works without it (we tried, it didn't help)
- Do not remove features to "fix" bugs — find the root cause instead

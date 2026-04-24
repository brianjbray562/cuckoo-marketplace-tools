// Pure title/bullet/validation functions extracted from App.jsx.
// No React, no state, no side effects beyond mutating the objects passed in
// (which is the existing contract — these are called for their mutations).
//
// Exported for reuse in App.jsx and for Vitest testing.

// --- SHARED CONSTANTS ---

export const CHAR_LIMITS = {
  amazon: 200,
  walmart: 150,
  target: 150,
  bestbuy: 120,
  wayfair: 150,
  kohls: 150,
  macys: 150,
  bloomingdales: 120,
  tiktokshop: 200,
  weee: 120,
};

// Optimal title length ranges per marketplace (soft target, not hard limit).
// Validation warns if title falls outside this range.
export const TITLE_OPTIMAL = {
  amazon: { min: 175, max: 200 },
  walmart: { min: 60, max: 90 },
  target: { min: 80, max: 120 },
  bestbuy: { min: 90, max: 120 },
  wayfair: { min: 100, max: 150 },
  kohls: { min: 80, max: 120 },
  macys: { min: 80, max: 120 },
  bloomingdales: { min: 60, max: 100 },
  tiktokshop: { min: 80, max: 140 },
  weee: { min: 70, max: 110 },
};

// Valid product classes from DB (for normalizeTitleTech).
export const VALID_PRODUCT_CLASSES = [
  "Basic",
  "Micom",
  "Pressure",
  "Twin Pressure",
  "Induction Heating Pressure",
  "Electric Heating Pressure",
  "Twin Pressure Induction Heating",
];

// --- TIER / BULLET CLASSIFICATION ---

// Classify a product's tier based on heating tech, pressure, and cooking modes.
// Returns "basic" | "mid" | "premium".
export function classifyProductTier(product) {
  if (!product) return "basic";
  const type = (product.type || "").toLowerCase();
  const heating = (product.heating || "").toLowerCase();
  const pressure = !!product.pressure;
  // Premium: induction heating, twin pressure, or twin pressure + induction
  if (heating.includes("induction") || type.includes("twin pressure") || type.includes("induction")) return "premium";
  // Mid: pressure models (CRP-) or micom with advanced features
  if (pressure || type.includes("pressure")) return "mid";
  if (type === "micom" && parseInt(product.cookingModes) >= 8) return "mid";
  // Basic: everything else
  return "basic";
}

// Determine bullet count by exact product type from PRODUCT_DB.
// Mapping (per merchandising team):
//   5 bullets: Basic, Commercial (handles "Commerical" typo too)
//   6 bullets: Micom, Pressure, Twin Pressure, Induction + Non Pressure
//   7 bullets: Induction + Pressure, Twin Pressure + Induction
export function getBulletCountForType(productType) {
  const t = (productType || "").trim();
  if (t === "Basic" || t === "Commerical" || t === "Commercial") return 5;
  if (t === "Induction + Pressure" || t === "Twin Pressure + Induction") return 7;
  // Default: Micom, Pressure, Twin Pressure, Induction + Non Pressure, anything else
  return 6;
}

// Extract hero technology keywords for a product (used for premium-tech validation).
export function getHeroTechKeywords(product) {
  if (!product) return [];
  const type = (product.type || "").toLowerCase();
  const heating = (product.heating || "").toLowerCase();
  const keywords = [];
  if (type.includes("twin pressure")) keywords.push("twin pressure");
  if (heating.includes("induction")) keywords.push("induction");
  if (type.includes("induction")) keywords.push("induction");
  if (type.includes("pressure") && !type.includes("twin")) keywords.push("pressure");
  return [...new Set(keywords)];
}

// --- TITLE VALIDATION PRIMITIVES ---

// Client-side validation: catches bare cup counts the AI missed.
// Matches "#-Cup" or "# Cup" NOT followed by Uncooked/Cooked.
// Avoids false positives like "Measuring Cup" by requiring a digit before Cup.
export function hasBadCupCount(title) {
  if (!title) return false;
  const cupPattern = /\b(\d+)-?Cup(?!\s*(?:Uncooked|Cooked))\b/i;
  const match = title.match(cupPattern);
  if (!match) return false;
  const num = parseInt(match[1]);
  return num >= 1 && num <= 30;
}

// --- TITLE POST-PROCESSING ---
// All post-processing functions mutate `conversions` in place by design,
// matching the original inline implementations in App.jsx.

// Ensure model number appears in every marketplace title unless it would exceed the hard char limit.
export function ensureModelNumberInTitles(conversions, sku) {
  if (!conversions || !sku) return;
  const suffix = " (" + sku + ")";
  for (const key of Object.keys(conversions)) {
    const conv = conversions[key];
    if (!conv?.title) continue;
    const title = conv.title.trim();
    // Check if model number is already present (case-insensitive)
    if (title.toUpperCase().includes(sku.toUpperCase())) {
      conv.title = title;
      conv.char_count = title.length;
      continue;
    }
    // Try appending — only if within hard char limit
    const limit = CHAR_LIMITS[key];
    const withModel = title + suffix;
    if (!limit || withModel.length <= limit) {
      conv.title = withModel;
      conv.char_count = withModel.length;
    } else {
      conv.title = title;
      conv.char_count = title.length;
    }
  }
}

// Normalize dual-tech phrasing and ensure product class is present in titles.
// Runs as a post-processing step BEFORE ensureModelNumberInTitles.
export function normalizeTitleTech(conversions, product) {
  if (!conversions || !product) return;
  const dbType = (product.type || "").trim();
  // Map DB type to the canonical class name for matching
  const canonicalClass = dbType === "Twin Pressure + Induction" ? "Twin Pressure Induction Heating" : dbType;

  for (const key of Object.keys(conversions)) {
    const conv = conversions[key];
    if (!conv?.title) continue;
    let title = conv.title;

    // 1. Normalize dual-tech phrasing: remove "+" and "with" between Twin Pressure and Induction
    title = title.replace(/Twin Pressure\s*\+\s*Induction/gi, "Twin Pressure Induction");
    title = title.replace(/Twin Pressure\s+with\s+Induction/gi, "Twin Pressure Induction");
    // Ensure "Heating" follows "Induction" in the dual-tech phrase if not already there
    title = title.replace(/Twin Pressure Induction(?!\s+Heating)/gi, "Twin Pressure Induction Heating");

    // 2. Check if the canonical product class is present in the title
    if (canonicalClass && VALID_PRODUCT_CLASSES.includes(canonicalClass)) {
      const classLower = canonicalClass.toLowerCase();
      const titleLower = title.toLowerCase();
      if (!titleLower.includes(classLower)) {
        // Try to insert the class after "CUCKOO " if there's room
        const limit = CHAR_LIMITS[key];
        const insertPoint = title.indexOf("CUCKOO ") === 0 ? 7 : 0;
        const candidate = title.slice(0, insertPoint) + canonicalClass + " " + title.slice(insertPoint);
        if (!limit || candidate.length <= limit) {
          title = candidate;
        }
        // If it doesn't fit, leave the title as-is (hard cap makes it impossible)
      }
    }

    // 3. Korean rule: "Korean" only allowed as "Korean Rice Cooker", and never in the front title block.
    if (/\bKorean\b/i.test(title)) {
      // First: if "Korean Rice Cooker" appears before the capacity phrase, strip "Korean " from it
      title = title.replace(/^(CUCKOO\s+(?:[\w\s\-]+?)?)Korean\s+Rice\s+Cooker(\s+\d+-Cup)/i, "$1Rice Cooker$2");
      // Then: remove any remaining standalone "Korean" not followed by "Rice Cooker"
      title = title.replace(/\bKorean\b(?!\s+Rice\s+Cooker)/gi, "");
      // Clean up artifacts: double spaces, leading/trailing commas, double commas
      title = title.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").replace(/,\s*$/g, "").replace(/\(\s*,/g, "(").trim();
    }

    conv.title = title;
  }
}

// Normalize capacity phrases in titles based on the selected capacity mode.
// mode: "both" | "uncooked" | "cooked"
export function normalizeCapacityInTitles(conversions, product, mode) {
  if (!conversions || !product || !product.cupSize || !mode) return;
  // Parse the DB cupSize: "6 Cup Uncooked / 12 Cup Cooked"
  const cupMatch = product.cupSize.match(/(\d+)\s*Cup\s*Uncooked\s*\/\s*(\d+)\s*Cup\s*Cooked/i);
  if (!cupMatch) return;
  const uncookedNum = cupMatch[1];
  const cookedNum = cupMatch[2];
  const phraseUncooked = uncookedNum + "-Cup Uncooked";
  const phraseCooked = cookedNum + "-Cup Cooked";
  const phraseBoth = phraseUncooked + " / " + phraseCooked;
  const targetPhrase = mode === "uncooked" ? phraseUncooked : mode === "cooked" ? phraseCooked : phraseBoth;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bothPattern = new RegExp(esc(uncookedNum) + "[- ]Cup\\s+Uncooked\\s*\\/\\s*" + esc(cookedNum) + "[- ]Cup\\s+Cooked", "gi");
  const uncookedPattern = new RegExp(esc(uncookedNum) + "[- ]Cup\\s+Uncooked(?!\\s*\\/)", "gi");
  const cookedPattern = new RegExp("(?<!\\/\\s*)" + esc(cookedNum) + "[- ]Cup\\s+Cooked", "gi");
  for (const key of Object.keys(conversions)) {
    const conv = conversions[key];
    if (!conv?.title) continue;
    let title = conv.title;
    let found = false;
    if (bothPattern.test(title)) {
      bothPattern.lastIndex = 0;
      title = title.replace(bothPattern, targetPhrase);
      found = true;
    } else if (uncookedPattern.test(title)) {
      uncookedPattern.lastIndex = 0;
      title = title.replace(uncookedPattern, targetPhrase);
      found = true;
    } else if (cookedPattern.test(title)) {
      cookedPattern.lastIndex = 0;
      title = title.replace(cookedPattern, targetPhrase);
      found = true;
    }
    // Fallback: if no capacity phrase found, insert after "Rice Cooker"
    if (!found && /Rice Cooker/i.test(title)) {
      title = title.replace(/(Rice Cooker)\s*/i, "$1 " + targetPhrase + ", ");
      title = title.replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ");
    }
    conv.title = title.trim();
  }
}

// Remove unsupported puffery adjectives from titles.
// Conservative: only strips obvious puff that is never a verified product attribute.
export function removePuffery(conversions) {
  if (!conversions) return;
  for (const key of Object.keys(conversions)) {
    const conv = conversions[key];
    if (!conv?.title) continue;
    let title = conv.title;
    // "Premium" before colors, materials, or finishes
    title = title.replace(/\bPremium\s+(White|Black|Gray|Red|Silver|Gold|Pink|Copper|Stainless\s+Steel|Nonstick|Finish)/gi, "$1");
    // "Luxury" as standalone adjective
    title = title.replace(/\bLuxury\s+/gi, "");
    // "Advanced" before tech (not part of a product name)
    title = title.replace(/\bAdvanced\s+(Micom|Pressure|Induction|Heating|Technology)/gi, "$1");
    // Clean up artifacts
    title = title.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
    conv.title = title;
  }
}

// Unify Amazon title: make conversions.amazon.title the single source of truth.
// Copies finalized conversions.amazon.title into amazon_audit.suggested_title.
export function unifyAmazonTitle(titles) {
  if (!titles) return;
  const finalAmazon = titles.conversions?.amazon?.title;
  if (finalAmazon && titles.amazon_audit) {
    titles.amazon_audit.suggested_title = finalAmazon;
    titles.amazon_audit.suggested_char_count = finalAmazon.length;
  }
}

// For Full Stainless inner pot products, ensure "Stainless Steel Inner Pot" appears in every title.
// Returns array of warnings for any marketplace where it could not fit.
export function enforceStainlessInnerPot(conversions, product) {
  const warnings = [];
  if (!conversions || !product || product.innerPot !== "Full Stainless") return warnings;
  const requiredPhrase = "Stainless Steel Inner Pot";
  const requiredLower = requiredPhrase.toLowerCase();
  for (const key of Object.keys(conversions)) {
    const conv = conversions[key];
    if (!conv?.title) continue;
    let title = conv.title;
    // Already present
    if (title.toLowerCase().includes(requiredLower)) continue;
    // Remove weaker stainless references
    title = title.replace(/,?\s*Stainless Steel(?!\s+Inner\s+Pot)\b/gi, "");
    title = title.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
    const limit = CHAR_LIMITS[key];
    const tryInsert = (t) => {
      const capPattern = /(\d+-Cup\s+(?:Uncooked(?:\s*\/\s*\d+-Cup\s+Cooked)?|Cooked))/i;
      const capMatch = t.match(capPattern);
      if (capMatch) {
        const capEnd = capMatch.index + capMatch[0].length;
        return (t.slice(0, capEnd) + ", " + requiredPhrase + t.slice(capEnd)).replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
      }
      const modelMatch = t.match(/\s*\([A-Z]{2,4}-[A-Z0-9]+\)\s*$/);
      if (modelMatch) return (t.slice(0, modelMatch.index) + ", " + requiredPhrase + " " + modelMatch[0].trim()).trim();
      return t + ", " + requiredPhrase;
    };
    let candidate = tryInsert(title);
    if (limit && candidate.length > limit) {
      const colorPattern = /,\s*(?:White|Black|Gray|Red|Silver|Gold|Pink|Copper|Dark Gray)\b/gi;
      const conveniencePattern = /,\s*(?:Auto Clean|Easy Clean|Voice Guide|Keep Warm|Delay Timer)\b/gi;
      const modePattern = /,\s*\d+\s+(?:Cooking\s+)?Modes?\b/gi;
      let stripped = title;
      stripped = stripped.replace(colorPattern, "").replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
      candidate = tryInsert(stripped);
      if (limit && candidate.length > limit) {
        stripped = stripped.replace(conveniencePattern, "").replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
        candidate = tryInsert(stripped);
      }
      if (limit && candidate.length > limit) {
        stripped = stripped.replace(modePattern, "").replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
        candidate = tryInsert(stripped);
      }
      if (limit && candidate.length > limit) {
        warnings.push("STAINLESS_MISSING: " + key + " — could not fit 'Stainless Steel Inner Pot' within " + limit + " char limit");
        continue;
      }
    }
    conv.title = candidate;
  }
  return warnings;
}

// Add comma after capacity phrase when a descriptor follows without one.
export function normalizeCommaAfterCapacity(conversions) {
  if (!conversions) return;
  for (const key of Object.keys(conversions)) {
    const conv = conversions[key];
    if (!conv?.title) continue;
    conv.title = conv.title.replace(
      /(\d+-Cup\s+(?:Uncooked(?:\s*\/\s*\d+-Cup\s+Cooked)?|Cooked))\s+(?!,|\(|with\b)/gi,
      "$1, "
    ).replace(/\s{2,}/g, " ").trim();
  }
}

// -----------------------------------------------------------
// OPTION C — CANONICAL CORE + MARKETPLACE FACETS + DIVERSIFICATION
// -----------------------------------------------------------
// Philosophy: every marketplace title shares a locked canonical core
// (brand + class + capacity + color + SKU) that is built deterministically
// in code. The LLM only generates the middle "descriptor slot" per
// marketplace, constrained by that marketplace's intent facet.

// Marketplace intent facets — maps each marketplace to the TYPE of descriptor
// that fits its customer search/browse behavior.
// `amazon` is full stacking (multiple features). `bloomingdales` is minimal
// (no descriptor, core + color + SKU only). Everything else gets one
// facet-appropriate descriptor.
export const MARKETPLACE_FACETS = {
  amazon: "search_heavy",           // Full keyword stacking
  walmart: "primary_benefit",        // One primary consumer benefit
  target: "lifestyle",               // Everyday / aspirational hook
  bestbuy: "tech_spec",              // One technical spec
  wayfair: "material_design",        // Material, finish, design cue
  kohls: "family_benefit",           // Family/convenience benefit
  macys: "polished_benefit",         // Refined, quality-oriented benefit
  bloomingdales: "minimal",          // No descriptor — core only
  tiktokshop: "viral_hook",          // Snappy scroll-stopping benefit
  weee: "practical_cultural",        // Practical + culturally relevant
};

// Facet-to-vocabulary mapping. Used by `validateDescriptorFacet` for strict
// enforcement — the LLM's output must contain at least one of the keywords
// from its marketplace's facet bucket (or match a regex), otherwise resample.
//
// Each bucket lists the VOCABULARY that signals a descriptor belongs to that
// facet. These are deliberately broad so we don't reject valid variants.
export const FACET_VOCABULARY = {
  search_heavy: {
    // Amazon descriptor must stack at least 2+ features OR be 100+ chars past core
    requireCount: 2,
    keywords: [
      "rice maker", "rice steamer", "rice warmer",
      "cooking modes", "menu modes",
      "inner pot", "stainless steel", "nonstick",
      "auto clean", "voice guide", "turbo mode", "preset timer",
      "water capture", "steam tray", "steam plate",
      "keep warm", "gaba", "multi-cook", "multi cook",
      "pressure cooking", "induction heating",
    ],
  },
  primary_benefit: {
    // Walmart — one clear consumer benefit, typically a feature or function
    keywords: [
      "auto clean", "voice guide", "turbo mode", "preset timer",
      "water capture", "keep warm", "cooking modes", "menu modes",
      "steam tray", "steam plate", "nonstick inner pot",
      "stainless steel inner pot", "fuzzy logic",
    ],
  },
  lifestyle: {
    // Target — everyday, family, daily-use framing
    keywords: [
      "everyday", "daily", "family meals", "family cooking",
      "for rice", "for grains", "for rice & grains", "for rice and grains",
      "for meal prep", "meal prep", "family size", "breakfast",
      "dinner", "weeknight", "weekday",
    ],
  },
  tech_spec: {
    // Best Buy — quantified technical spec
    keywords: [
      "cooking modes", "menu modes", "pressure",
      "induction heating", "heating plate", "wattage",
      "fuzzy logic", "microcomputer", "3d", "multi-cook",
    ],
    // Also valid: a number followed by a spec word (e.g. "10 Cooking Modes", "13-Hour Preset")
    patternMatch: /\b\d+[- ]?(cooking\s+modes?|menu\s+modes?|hour|cup|watt|w)\b/i,
  },
  material_design: {
    // Wayfair — material, finish, coating, design
    keywords: [
      "stainless steel", "nonstick", "diamond coating",
      "x-wall", "ceramic", "inner pot", "finish",
      "stainless steel inner pot", "nonstick inner pot",
      "premium nonstick",
    ],
  },
  family_benefit: {
    // Kohl's — convenience for families
    keywords: [
      "auto clean", "easy clean", "keep warm", "preset timer",
      "voice guide", "one-touch", "one touch", "automatic",
      "timer", "menu modes", "cooking modes", "family",
      "water capture", "steam tray",
    ],
  },
  polished_benefit: {
    // Macy's — refined/quality-oriented phrasing
    keywords: [
      "nonstick inner pot", "stainless steel inner pot",
      "preset timer", "auto clean", "cooking modes",
      "keep warm", "voice guide", "premium", "quality",
      "steam plate", "steam tray",
    ],
  },
  viral_hook: {
    // TikTok Shop — scroll-stopping single benefit
    keywords: [
      "turbo mode", "voice guide", "auto clean", "one-touch",
      "preset timer", "steam plate", "gaba rice", "scorched rice",
      "multi-cook", "fast cook", "quick cook",
    ],
  },
  practical_cultural: {
    // Weee! — practical + Asian food culture relevant
    keywords: [
      "for rice", "for grains", "for multi-grain", "for gaba",
      "for brown rice", "for sticky rice", "for porridge",
      "multi-grain", "gaba rice", "brown rice", "jasmine",
      "basmati", "sticky rice", "scorched rice", "congee",
      "for rice & grains", "for rice and grains",
    ],
  },
};

// Normalize a product's canonical class name for titles.
// Maps DB types to the phrase used in the canonical core.
// (Mirrors the mapping logic in normalizeTitleTech but returns a string.)
export function getCanonicalClass(product) {
  if (!product) return "";
  const dbType = (product.type || "").trim();
  // Twin Pressure + Induction -> Twin Pressure Induction Heating
  if (dbType === "Twin Pressure + Induction") return "Twin Pressure Induction Heating";
  // Induction + Pressure -> Induction Heating Pressure (DB type "Induction + Pressure")
  if (dbType === "Induction + Pressure") return "Induction Heating Pressure";
  // Induction + Non Pressure -> Induction Heating
  if (dbType === "Induction + Non Pressure") return "Induction Heating";
  // Commercial (handle "Commerical" typo too)
  if (dbType === "Commerical" || dbType === "Commercial") return "Commercial";
  // All else pass through (Basic, Micom, Pressure, Twin Pressure)
  return dbType;
}

// Parse the product's cupSize field into mode-specific phrase.
// mode: "both" | "uncooked" | "cooked"
export function getCapacityPhrase(product, mode) {
  if (!product?.cupSize || !mode) return "";
  const m = product.cupSize.match(/(\d+)\s*Cup\s*Uncooked\s*\/\s*(\d+)\s*Cup\s*Cooked/i);
  if (!m) return "";
  const uncooked = m[1] + "-Cup Uncooked";
  const cooked = m[2] + "-Cup Cooked";
  if (mode === "uncooked") return uncooked;
  if (mode === "cooked") return cooked;
  return uncooked + " / " + cooked; // "both"
}

// Build the canonical core block for a product — deterministic, same on every marketplace.
// Format: "CUCKOO [Class] Rice Cooker [Capacity], [Color] ([SKU])"
// If skipModel=true, returns the core WITHOUT the SKU (ensureModelNumberInTitles adds it later).
// If skipColor=true, returns without the color comma.
export function buildCanonicalCore(product, sku, capacityMode = "cooked", opts = {}) {
  if (!product) return "";
  const cls = getCanonicalClass(product);
  const capacity = getCapacityPhrase(product, capacityMode);
  const color = (product.color || "").trim();

  let core = "CUCKOO";
  if (cls) core += " " + cls;
  core += " Rice Cooker";
  if (capacity) core += " " + capacity;
  if (color && !opts.skipColor) core += ", " + color;
  if (sku && !opts.skipModel) core += " (" + sku + ")";
  return core;
}

// --- Descriptor slot extraction & facet validation ---

// Extract the descriptor slot from a final title by stripping the canonical core
// and the model number. Returns whatever text sits in the middle — the LLM's
// descriptor contribution. Returns empty string if the title is just the core.
//
// Example:
//   title = "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean, White (CR-0675FW)"
//   core  = "CUCKOO Micom Rice Cooker 12-Cup Cooked"
//   color = "White"
//   sku   = "CR-0675FW"
//   returns "with Auto Clean"
export function extractDescriptorSlot(title, product, sku, capacityMode = "cooked") {
  if (!title || !product) return "";
  const coreNoColor = buildCanonicalCore(product, sku, capacityMode, { skipColor: true, skipModel: true });
  const color = (product.color || "").trim();

  let t = title.trim();
  // Strip leading core (case-insensitive prefix match)
  if (t.toLowerCase().startsWith(coreNoColor.toLowerCase())) {
    t = t.slice(coreNoColor.length);
  }
  // Strip trailing SKU "(CR-0675FW)"
  t = t.replace(/\s*\([A-Z]{2,4}-[A-Z0-9]+\)\s*$/i, "");
  // Strip trailing color (the color + optional comma)
  if (color) {
    const colorRe = new RegExp(",?\\s*" + color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i");
    t = t.replace(colorRe, "");
  }
  // Trim any leading/trailing commas, whitespace, "with" connector artifacts
  t = t.replace(/^[,\s]+|[,\s]+$/g, "").trim();
  return t;
}

// Validate that a descriptor matches its marketplace's facet.
// Returns { valid: bool, reason: string }.
//
// Strict rules:
// - "minimal" facet (Bloomingdale's): descriptor MUST be empty
// - "search_heavy" facet (Amazon): must stack 2+ facet keywords
// - All others: descriptor must contain at least one facet keyword
//   OR match the facet's patternMatch regex (if defined)
export function validateDescriptorFacet(marketplace, descriptor) {
  const facet = MARKETPLACE_FACETS[marketplace];
  if (!facet) return { valid: true, reason: "unknown_marketplace_skip" };

  // Bloomingdale's: no descriptor allowed
  if (facet === "minimal") {
    if (descriptor && descriptor.trim()) {
      return { valid: false, reason: "bloomingdales_must_be_minimal" };
    }
    return { valid: true, reason: "minimal_ok" };
  }

  const config = FACET_VOCABULARY[facet];
  if (!config) return { valid: true, reason: "no_vocab_defined" };

  const d = (descriptor || "").toLowerCase();
  if (!d) return { valid: false, reason: "descriptor_empty" };

  // Count keyword matches
  const keywordMatches = config.keywords.filter(kw => d.includes(kw.toLowerCase()));
  const matchCount = keywordMatches.length;

  // Search-heavy: require at least N matches (default 2)
  if (facet === "search_heavy") {
    const required = config.requireCount || 2;
    if (matchCount >= required) return { valid: true, reason: "search_heavy_stacked" };
    return { valid: false, reason: "search_heavy_needs_" + required + "_got_" + matchCount };
  }

  // Everything else: at least 1 keyword match OR regex match
  if (matchCount >= 1) return { valid: true, reason: "keyword_match_" + keywordMatches[0] };
  if (config.patternMatch && config.patternMatch.test(descriptor)) {
    return { valid: true, reason: "pattern_match" };
  }
  return { valid: false, reason: "no_facet_match_for_" + facet };
}

// Diversify marketplace descriptors — post-processor that prevents the same
// descriptor appearing in multiple marketplaces for the same product.
//
// Algorithm:
//   1. Extract descriptor from each non-Amazon, non-Bloomingdale's marketplace
//   2. Find duplicates (same descriptor used 2+ times)
//   3. For each duplicate beyond the first, swap in an alternative from the
//      product's feature pool, preferring one that also matches the marketplace's facet
//
// Returns an array of warnings for any marketplace where no suitable swap was found.
export function diversifyMarketplaceDescriptors(conversions, product, sku, capacityMode = "cooked") {
  const warnings = [];
  if (!conversions || !product) return warnings;

  // Build the feature pool available to this product
  const featurePool = buildDescriptorPool(product);

  // Only process marketplaces that have a non-minimal, non-search-heavy facet
  const eligibleMps = Object.keys(conversions).filter(mp => {
    const facet = MARKETPLACE_FACETS[mp];
    return facet && facet !== "minimal" && facet !== "search_heavy";
  });

  // Extract descriptors by marketplace
  const descriptorsByMp = {};
  for (const mp of eligibleMps) {
    const conv = conversions[mp];
    if (!conv?.title) continue;
    descriptorsByMp[mp] = extractDescriptorSlot(conv.title, product, sku, capacityMode);
  }

  // Detect duplicates (case-insensitive)
  const seen = new Map(); // normalized descriptor -> [mp, mp, ...]
  for (const [mp, desc] of Object.entries(descriptorsByMp)) {
    if (!desc) continue;
    const key = desc.toLowerCase();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(mp);
  }

  // For each duplicate group (2+ marketplaces sharing a descriptor), keep the first
  // and swap the rest with facet-matching alternatives
  for (const [, mps] of seen) {
    if (mps.length < 2) continue;
    // Keep first marketplace's descriptor, swap the rest
    const usedDescriptors = new Set([descriptorsByMp[mps[0]].toLowerCase()]);
    for (let i = 1; i < mps.length; i++) {
      const mp = mps[i];
      const facet = MARKETPLACE_FACETS[mp];
      // Find an alternative from the pool that matches this marketplace's facet
      // AND hasn't been used by another marketplace yet
      const alternative = pickAlternativeDescriptor(featurePool, facet, usedDescriptors);
      if (!alternative) {
        warnings.push("DESCRIPTOR_DUPLICATE: " + mp + " could not find unique facet-matching alternative (facet: " + facet + ")");
        continue;
      }
      // Rebuild the title with the new descriptor
      const newTitle = rebuildTitleWithDescriptor(conversions[mp].title, descriptorsByMp[mp], alternative, product, sku, capacityMode);
      if (newTitle && newTitle !== conversions[mp].title) {
        conversions[mp].title = newTitle;
        conversions[mp].char_count = newTitle.length;
        usedDescriptors.add(alternative.toLowerCase());
        descriptorsByMp[mp] = alternative;
      }
    }
  }
  return warnings;
}

// Build a pool of descriptor candidates from the product's verified attributes.
// Returns an array of { text, suggestedFacets } objects.
export function buildDescriptorPool(product) {
  if (!product) return [];
  const pool = [];
  const features = Array.isArray(product.features) ? product.features : [];

  // Inner pot descriptors (material_design, polished_benefit)
  if (product.innerPot === "Full Stainless") {
    pool.push({ text: "with Stainless Steel Inner Pot", suggestedFacets: ["material_design", "polished_benefit"] });
  } else if (product.innerPot) {
    pool.push({ text: "with Nonstick Inner Pot", suggestedFacets: ["material_design", "polished_benefit"] });
  }

  // Feature-based descriptors — map verified features to facet-appropriate phrasing
  const featureMap = {
    "Auto Clean": [
      { text: "with Auto Clean", facets: ["primary_benefit", "family_benefit"] },
      { text: "with Auto Clean Function", facets: ["family_benefit"] },
    ],
    "Voice Guide": [
      { text: "with Voice Guide", facets: ["primary_benefit", "family_benefit", "viral_hook"] },
    ],
    "Turbo Mode": [
      { text: "with Turbo Mode", facets: ["primary_benefit", "viral_hook"] },
    ],
    "Preset Timer": [
      { text: "with Preset Timer", facets: ["primary_benefit", "polished_benefit", "family_benefit"] },
    ],
    "Water Capture": [
      { text: "with Water Capture", facets: ["primary_benefit", "family_benefit"] },
    ],
    "Steam Tray": [
      { text: "with Steam Tray", facets: ["family_benefit", "material_design"] },
    ],
    "Steam Plate": [
      { text: "with Steam Plate", facets: ["family_benefit"] },
    ],
    "Keep Warm": [
      { text: "with Keep Warm Function", facets: ["family_benefit", "primary_benefit"] },
    ],
  };
  for (const feat of features) {
    const entries = featureMap[feat];
    if (!entries) continue;
    for (const e of entries) {
      pool.push({ text: e.text, suggestedFacets: e.facets });
    }
  }

  // Tech-spec descriptors (best_buy)
  const modeCount = parseInt(product.cookingModes || "0");
  if (modeCount > 0) {
    pool.push({ text: "with " + modeCount + " Cooking Modes", suggestedFacets: ["tech_spec", "polished_benefit"] });
    pool.push({ text: modeCount + " Cooking Modes", suggestedFacets: ["tech_spec"] });
  }

  // Lifestyle / cultural descriptors
  pool.push({ text: "for Everyday Rice & Grains", suggestedFacets: ["lifestyle"] });
  pool.push({ text: "for Family Meal Prep", suggestedFacets: ["lifestyle"] });
  pool.push({ text: "for Rice & Grains", suggestedFacets: ["practical_cultural", "lifestyle"] });
  pool.push({ text: "for Multi-Grain & GABA Rice", suggestedFacets: ["practical_cultural"] });

  return pool;
}

// Pick an alternative descriptor from the pool that:
//   (a) matches the desired facet
//   (b) hasn't already been used (case-insensitive)
// Returns the descriptor string, or null if none found.
export function pickAlternativeDescriptor(pool, facet, usedDescriptorsLower) {
  if (!pool || !pool.length) return null;
  for (const entry of pool) {
    if (entry.suggestedFacets.includes(facet) && !usedDescriptorsLower.has(entry.text.toLowerCase())) {
      return entry.text;
    }
  }
  return null;
}

// Rebuild a title with a new descriptor, preserving the canonical core, color,
// and SKU. Used by diversifyMarketplaceDescriptors.
export function rebuildTitleWithDescriptor(originalTitle, oldDescriptor, newDescriptor, product, sku, capacityMode = "cooked") {
  if (!originalTitle || !newDescriptor) return originalTitle;
  const coreNoColorNoSku = buildCanonicalCore(product, sku, capacityMode, { skipColor: true, skipModel: true });
  const color = (product.color || "").trim();

  // Rebuild: core + ", " + descriptor + ", " + color + " (" + sku + ")"
  let rebuilt = coreNoColorNoSku;
  if (newDescriptor) rebuilt += " " + newDescriptor;
  if (color) rebuilt += ", " + color;
  if (sku) rebuilt += " (" + sku + ")";
  rebuilt = rebuilt.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
  return rebuilt;
}

// --- LISTING OUTPUT VALIDATION ---

// =============================================================
// CHUNK C (#6) — BACKEND KEYWORD DIFFING + BACKFILL POOLS
// =============================================================
// Amazon's 499-byte backend keyword field is most valuable when it captures
// search terms the frontend (title + bullets) does NOT already contain.
// Amazon indexes all frontend copy automatically, so duplicating "nonstick
// inner pot" in the BK wastes bytes that could carry competitor brands,
// alt-language, long-tail, or misspellings.
//
// This module does two things:
//   1. diffBackendKeywords — strips BK tokens that already appear in
//      title/bullets (exact match only; singular/plural both kept per user choice)
//   2. buildBackendKeywordPool — generates a prioritized backfill pool
//      (competitors > alt-language > cultural > long-tail > misspellings)
//      to fill reclaimed bytes

// Encoded byte length (matches Amazon's byte-count rule).
export function bkByteLength(s) {
  if (!s) return 0;
  return new TextEncoder().encode(s).length;
}

// Extract lowercase alphanumeric tokens from text. Preserves multi-word
// phrases as separate tokens (we'll use both single-token and bigram matching
// when diffing).
export function tokenizeForBk(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    // Keep letters, digits, spaces, and apostrophes; drop other punctuation
    .replace(/[^\p{L}\p{N}\s']+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Build the exact-match stopword set from title + bullets. Returns a Set
// of lowercase single-word tokens. This is what we use to filter BK.
export function buildFrontendTokenSet(titleText, bulletsText) {
  const s = new Set();
  for (const t of tokenizeForBk(titleText)) s.add(t);
  for (const t of tokenizeForBk(bulletsText)) s.add(t);
  return s;
}

// Diff the BK string against frontend copy. Removes BK tokens that exactly
// match any single-word token in title + bullets (case-insensitive, exact
// form — "cooker" in title does NOT strip "cookers" from BK per user choice).
// Multi-word BK phrases survive unless ALL their tokens are in frontend.
//
// Returns { kept: string, removed: [token, token...], bytesReclaimed: number }
export function diffBackendKeywords(bkText, titleText, bulletsText) {
  if (!bkText) return { kept: "", removed: [], bytesReclaimed: 0 };
  const frontendTokens = buildFrontendTokenSet(titleText, bulletsText);
  const originalBytes = bkByteLength(bkText);

  // Split BK on whitespace — Amazon treats BK as space-separated terms.
  // Multi-word phrases in BK are already space-separated at this level, so
  // we operate on individual tokens. If a token is in frontend, drop it.
  const tokens = bkText.split(/\s+/).filter(Boolean);
  const kept = [];
  const removed = [];
  for (const tok of tokens) {
    const normalized = tok.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");
    if (normalized && frontendTokens.has(normalized)) {
      removed.push(tok);
    } else {
      kept.push(tok);
    }
  }
  const keptStr = kept.join(" ");
  const bytesReclaimed = originalBytes - bkByteLength(keptStr);
  return { kept: keptStr, removed, bytesReclaimed };
}

// -----------------------------------------------------------
// BACKFILL POOL — priority-tiered candidates to fill reclaimed bytes
// -----------------------------------------------------------
// Tier 1: Competitor brand names (highest search volume on Amazon)
// Tier 2: Alt-language (Spanish for US Hispanic market)
// Tier 3: Asian scripts (Korean / Japanese / Chinese) — Weee! parity
// Tier 4: Long-tail cultural / regional dish searches
// Tier 5: Use-case long-tails (dorm, meal prep, RV, college)
// Tier 6: Common known-indexed misspellings only

export const BK_COMPETITORS_RICE_COOKER = [
  "zojirushi", "instant pot", "aroma", "oster", "black decker",
  "tiger", "panasonic", "hamilton beach", "toshiba", "dash",
  "yum asia", "tatung", "buffalo", "cuchen",
];

export const BK_ALT_LANG_SPANISH = [
  "olla arrocera", "arrocera electrica", "cocedora de arroz",
  "arroz cocido", "olla de presion", "vaporera de arroz",
];

export const BK_ALT_LANG_ASIAN_SCRIPTS = [
  // Korean
  "밥솥", "압력밥솥", "전기밥솥",
  // Japanese
  "炊飯器", "圧力炊飯器",
  // Chinese (simplified)
  "电饭煲", "电饭锅", "高压电饭煲",
];

export const BK_CULTURAL_DISHES = [
  "bibimbap", "dolsot", "nurungji", "sticky rice maker",
  "sushi rice maker", "jasmine rice cooker", "basmati rice cooker",
  "donabe", "ongi", "korean brown rice", "gaba brown rice",
  "japchae rice", "fried rice maker",
];

export const BK_USE_CASE_LONGTAIL = [
  "dorm rice cooker", "college dorm rice cooker", "rv rice cooker",
  "boat rice cooker", "small kitchen rice cooker", "apartment rice cooker",
  "office rice cooker", "mini rice cooker for one",
  "camping rice cooker", "travel rice cooker",
];

export const BK_KNOWN_MISSPELLINGS = [
  "rise cooker", "cookoo", "cookoo rice cooker",
  "crockpot rice cooker", "rice cookar",
];

// Pressure-specific additions (only valid for CRP- models)
export const BK_PRESSURE_EXTRAS = [
  "electric pressure cooker", "korean pressure cooker",
  "rice pressure cooker", "high pressure rice cooker",
  "sealed pressure rice cooker",
];

// Induction-specific additions
export const BK_INDUCTION_EXTRAS = [
  "induction rice maker", "ih rice cooker",
  "3d induction cooker", "precision induction rice cooker",
];

// Build a priority-ordered array of backfill candidates for a product.
// Caller filters out anything already in BK and anything in frontendTokens.
// Returns an array of { text, tier, reason } objects ordered by priority.
export function buildBackendKeywordPool(product, frontendTokenSet) {
  const pool = [];
  const isPressure = product && (/^CRP-/i.test(product.sku || "") || product.pressure || /pressure/i.test(product.type || ""));
  const isInduction = product && /induction/i.test((product.type || "") + " " + (product.heating || ""));

  const addAll = (arr, tier, reason) => {
    for (const text of arr) pool.push({ text, tier, reason });
  };

  // Tier 1: Competitors
  addAll(BK_COMPETITORS_RICE_COOKER, 1, "competitor");
  // Tier 2: Spanish alt-language
  addAll(BK_ALT_LANG_SPANISH, 2, "spanish");
  // Tier 3: Asian scripts
  addAll(BK_ALT_LANG_ASIAN_SCRIPTS, 3, "asian_script");
  // Tier 4: Cultural dishes
  addAll(BK_CULTURAL_DISHES, 4, "cultural");
  // Tier 5: Use-case long-tails
  addAll(BK_USE_CASE_LONGTAIL, 5, "use_case");
  // Tier 6: Known misspellings
  addAll(BK_KNOWN_MISSPELLINGS, 6, "misspelling");

  // Product-specific extras (interleaved with their appropriate tier)
  if (isPressure) addAll(BK_PRESSURE_EXTRAS, 4, "pressure_specific");
  if (isInduction) addAll(BK_INDUCTION_EXTRAS, 4, "induction_specific");

  // Filter: drop anything that already matches a frontend token (exact single-word)
  // For multi-word pool items, keep them unless ALL tokens are in frontend
  if (frontendTokenSet && frontendTokenSet.size > 0) {
    return pool.filter(entry => {
      const tokens = tokenizeForBk(entry.text);
      if (tokens.length === 0) return true;
      // For multi-word entries, keep if at least one token is NOT in frontend
      const allInFrontend = tokens.every(t => frontendTokenSet.has(t));
      return !allInFrontend;
    });
  }
  return pool;
}

// Backfill the diffed BK up to (just under) the byte limit using the pool.
// Returns { finalBk: string, added: [entries], finalBytes: number }
export function backfillBackendKeywords(diffedBk, pool, byteLimit = 499) {
  const result = {
    finalBk: (diffedBk || "").trim(),
    added: [],
    finalBytes: 0,
  };
  if (!pool || !pool.length) {
    result.finalBytes = bkByteLength(result.finalBk);
    return result;
  }

  // Track what's already in BK (case-insensitive token match) so we don't add duplicates
  const existing = new Set();
  for (const t of tokenizeForBk(result.finalBk)) existing.add(t);

  for (const entry of pool) {
    // Skip if all tokens of this entry already appear in BK
    const entryTokens = tokenizeForBk(entry.text);
    if (entryTokens.length > 0 && entryTokens.every(t => existing.has(t))) continue;

    const candidate = result.finalBk ? result.finalBk + " " + entry.text : entry.text;
    const candidateBytes = bkByteLength(candidate);
    if (candidateBytes > byteLimit) continue; // try next — smaller entry might fit

    result.finalBk = candidate;
    result.added.push(entry);
    for (const t of entryTokens) existing.add(t);
  }

  result.finalBytes = bkByteLength(result.finalBk);
  return result;
}

// Convenience wrapper: full BK optimization in one call.
// Returns { keywords, byte_count, removed, added, bytesReclaimed }
export function optimizeBackendKeywords(bkText, titleText, bulletsText, product, byteLimit = 499) {
  const diff = diffBackendKeywords(bkText, titleText, bulletsText);
  const frontendTokens = buildFrontendTokenSet(titleText, bulletsText);
  const pool = buildBackendKeywordPool(product, frontendTokens);
  const filled = backfillBackendKeywords(diff.kept, pool, byteLimit);
  return {
    keywords: filled.finalBk,
    byte_count: filled.finalBytes,
    removed: diff.removed,
    added: filled.added,
    bytesReclaimed: diff.bytesReclaimed,
  };
}

// --- LISTING OUTPUT VALIDATION (continued) ---

// =============================================================
// CHUNK B — BULLET 1 HEADING ROTATION + TIER-DIFFERENTIATED PROMPTS
// =============================================================
// Every SKU under the same Parent ASIN shares the same Bullet 1 heading.
// The heading is chosen from a product-type-specific pool. Rotation is
// per-type: each product type has its own counter, cycling through its
// pool as new parent families are encountered in a session.

// Approved Bullet 1 heading pools per product type.
// If you edit these, keep entries short (2-4 words), all-caps, and
// lexically distinct from each other within a pool.
export const BULLET_ONE_HEADING_POOLS = {
  "Twin Pressure + Induction": [
    "TWIN PRESSURE INDUCTION",
    "INDUCTION + TWIN PRESSURE",
    "DUAL PRESSURE + INDUCTION",
  ],
  "Twin Pressure": [
    "TWIN PRESSURE TECHNOLOGY",
    "DUAL PRESSURE SYSTEM",
    "ADVANCED PRESSURE COOKING",
  ],
  "Induction + Pressure": [
    "INDUCTION HEATING PRESSURE",
    "PRESSURE + INDUCTION",
    "HIGH-PRESSURE INDUCTION",
  ],
  "Induction + Non Pressure": [
    "INDUCTION HEATING",
    "INDUCTION PRECISION",
    "EVEN-HEAT INDUCTION",
  ],
  "Micom": [
    "MICOM INTELLIGENCE",
    "SMART MICOM CONTROL",
    "MICOM PRECISION",
  ],
  "Pressure": [
    "PRESSURE COOKING CONTROL",
    "SEALED PRESSURE SYSTEM",
    "HIGH-PRESSURE COOKING",
  ],
  "Basic": [
    "ONE-TOUCH SIMPLICITY",
    "RELIABLE DAILY COOKING",
    "EFFORTLESS RICE PREP",
  ],
  "Commerical": [  // handle DB typo
    "COMMERCIAL CAPACITY",
    "RESTAURANT-GRADE COOKING",
    "HIGH-DEMAND DURABILITY",
  ],
  "Commercial": [
    "COMMERCIAL CAPACITY",
    "RESTAURANT-GRADE COOKING",
    "HIGH-DEMAND DURABILITY",
  ],
};

// Get the Parent ASIN to use as the family grouping key.
// Falls back to the product's own ASIN, then to the SKU, so rotation works
// even when Parent ASIN is missing (matching the Settings "silent fallback" choice).
export function getModelBase(product, sku) {
  if (!product) return sku || "";
  if (product.parentAsin && product.parentAsin.trim()) return product.parentAsin.trim();
  if (product.asin && product.asin.trim()) return product.asin.trim();
  return sku || "";
}

// Session-scoped bullet heading selector.
//
// Per-type rotation with parent-family consistency:
//   - All SKUs sharing a Parent ASIN get the SAME heading (consistency)
//   - Each product type has its own independent rotation counter
//   - New parent families within a type consume the next heading in that pool
//
// Caller provides a `session` object that persists across calls in the same
// batch (e.g., a Map instantiated at the start of a bulk export). The shape:
//   {
//     familyHeadings: Map<parentKey, heading>,   // memoized heading per family
//     typeCounters: Map<productType, number>,    // rotation index per type
//   }
//
// Returns the chosen heading string.
export function selectBulletOneHeading(product, sku, session) {
  if (!product || !session) return "";
  const productType = (product.type || "").trim();
  const pool = BULLET_ONE_HEADING_POOLS[productType];
  if (!pool || !pool.length) return ""; // unknown type, no rotation

  const familyKey = getModelBase(product, sku);
  if (!familyKey) return pool[0];

  // If this family already has an assigned heading, reuse it
  if (session.familyHeadings.has(familyKey)) {
    return session.familyHeadings.get(familyKey);
  }

  // Otherwise, consume the next slot in this type's rotation
  const counter = session.typeCounters.get(productType) || 0;
  const heading = pool[counter % pool.length];
  session.typeCounters.set(productType, counter + 1);
  session.familyHeadings.set(familyKey, heading);
  return heading;
}

// Create a fresh rotation session. Call this once at the start of a
// generation batch (bulk export, end-to-end). Single-product flows can
// also use this — they'll just only consume one slot.
export function createBulletHeadingSession() {
  return {
    familyHeadings: new Map(),
    typeCounters: new Map(),
  };
}

// -----------------------------------------------------------
// TIER-DIFFERENTIATED BULLET PROMPT MODULES
// -----------------------------------------------------------
// Three distinct prompt modules — basic / mid / premium — replacing
// the single shared BULLET_SYSTEM_PROMPT. Each module differs in:
//   - Target bullet length
//   - Sentence count per bullet
//   - Vocabulary register
//   - Voice / framing
//
// The caller chooses the module based on classifyProductTier(product).

export const BULLET_TIER_PROMPT_BASIC = `Role: Senior ecommerce copywriter for CUCKOO Electronics America. Writing for a BASIC rice cooker — a simple, reliable, affordable appliance for everyday home cooking.

OUTPUT: Exactly the number of bullet points specified in the user message. Each bullet starts with a CAPITALIZED HEADING (2-4 words) followed by a colon and ONE concise sentence.

HEADING FORMAT (strict): The heading you put in the JSON "heading" field must NOT include a trailing colon. The colon is added automatically by the rendering layer. Example: {"heading":"ONE-TOUCH SIMPLICITY","text":"..."} — NOT {"heading":"ONE-TOUCH SIMPLICITY:","text":"..."}.

TIER-SPECIFIC VOICE (Basic):
- Tone: reassuring, uncomplicated, everyday-home-cook friendly
- Vocabulary: plain, functional language — "press one button", "daily use", "effortless cleanup", "ready when you are"
- AVOID: technical jargon, sophisticated cooking terminology, premium/luxury phrasing
- AVOID: restaurant-quality claims, precision language, craft terminology — these are premium claims
- TARGET bullet length: 130-150 chars TOTAL (including "HEADING: " prefix). Write fuller single sentences. Don't cut too short.
- Total sentences per bullet: 1

STRUCTURE (each bullet):
- Heading: 2-4 capitalized words, NO trailing colon in the JSON heading field
- Body: ONE sentence describing a concrete daily-use benefit. Make it descriptive enough to hit 130+ chars.
- HARD CAP: 220 chars total.

CUCKOO RULES:
- Use only features/modes/attributes from VERIFIED PRODUCT DATA.
- Do NOT invent cooking modes or dedicated programs.
- Approved everyday uses: rice, grains, oatmeal, quinoa, porridge, soups, one-pot meals.
- No puffery ("premium", "luxury", "advanced craftsmanship", "revolutionary", "advanced microcomputer").
- First bullet heading: USE THE EXACT HEADING PROVIDED in the user message (for product-family consistency). Do NOT add a colon to the heading field.

Respond ONLY with valid JSON: {"bullets":[{"heading":"...","text":"..."},...]}`;

export const BULLET_TIER_PROMPT_MID = `Role: Senior ecommerce copywriter for CUCKOO Electronics America. Writing for a MID-TIER rice cooker — a capable, feature-rich appliance with dedicated cooking programs and convenience features.

OUTPUT: Exactly the number of bullet points specified in the user message. Each bullet starts with a CAPITALIZED HEADING (2-4 words) followed by a colon and 1-2 concise sentences.

HEADING FORMAT (strict): The heading you put in the JSON "heading" field must NOT include a trailing colon. The colon is added automatically by the rendering layer. Example: {"heading":"MICOM INTELLIGENCE","text":"..."} — NOT {"heading":"MICOM INTELLIGENCE:","text":"..."}.

TIER-SPECIFIC VOICE (Mid):
- Tone: confident, capable, benefit-driven
- Vocabulary: concrete feature benefits — "dedicated programs", "consistent results", "restaurant-quality texture", "cooking control"
- AVOID: basic oversimplification ("just press a button" — this product has more to it)
- AVOID: craft/connoisseur language ("starch gelatinization", "rice-science") — that's premium
- TARGET bullet length: 150-180 chars TOTAL (including "HEADING: " prefix). HARD CAP: 220 chars.
- Total sentences per bullet: 1-2

STRUCTURE (each bullet):
- Heading: 2-4 capitalized words, NO trailing colon in the JSON heading field
- Body: 1-2 sentences — the benefit plus a specific feature tie-in
- HARD CAP: 220 chars total.

CUCKOO RULES:
- Use only features/modes/attributes from VERIFIED PRODUCT DATA.
- Mention specific verified modes by name when they add value (e.g., "GABA rice", "porridge", "multi-grain").
- Approved everyday uses: rice, grains, oatmeal, quinoa, porridge, soups, one-pot meals.
- Equipment-dependent claims (steaming) only if "Steam Tray" / "Steamer Basket" is in features.
- NEVER use "Advanced Microcomputer Technology" / "Advanced Micom" / "Premium Craftsmanship" — puffery is banned.
- First bullet heading: USE THE EXACT HEADING PROVIDED in the user message (for product-family consistency). Do NOT add a colon to the heading field.

Respond ONLY with valid JSON: {"bullets":[{"heading":"...","text":"..."},...]}`;

export const BULLET_TIER_PROMPT_PREMIUM = `Role: Senior ecommerce copywriter for CUCKOO Electronics America. Writing for a PREMIUM rice cooker — a sophisticated, pressure + induction appliance engineered for serious home cooks who care about rice quality.

OUTPUT: Exactly the number of bullet points specified in the user message. Each bullet starts with a CAPITALIZED HEADING (2-4 words) followed by a colon and 2 concise sentences.

HEADING FORMAT (strict): The heading you put in the JSON "heading" field must NOT include a trailing colon. The colon is added automatically by the rendering layer. Example: {"heading":"TWIN PRESSURE INDUCTION","text":"..."} — NOT {"heading":"TWIN PRESSURE INDUCTION:","text":"..."}.

TIER-SPECIFIC VOICE (Premium):
- Tone: authoritative, sophisticated, craft-oriented — speaking to customers who take rice seriously
- Vocabulary: precise and specific — "precise induction heating", "pressure-sealed moisture retention", "dedicated programs tuned per grain type", "restaurant-quality texture"
- USE: Korean food culture references where appropriate (scorched rice / nurungji, GABA rice, mixed-grain dishes)
- AVOID: simplistic phrasing ("press a button") — that's Basic voice
- AVOID: generic benefit claims without concrete feature tie-ins
- TARGET bullet length: 180-215 chars TOTAL (including "HEADING: " prefix). HARD CAP: 220 chars. Never exceed 220.
- Total sentences per bullet: 2 short sentences, not 2 long ones. Count your characters.

STRUCTURE (each bullet):
- Heading: 2-4 capitalized words, NO trailing colon in the JSON heading field
- Body: 2 sentences — the first establishes the feature/benefit; the second gives the concrete cooking outcome
- HARD CAP: 220 chars total. Write tighter sentences to stay under this.

CUCKOO RULES:
- Use only features/modes/attributes from VERIFIED PRODUCT DATA.
- Mention specific verified modes by exact name (e.g., "scorched rice / nurungji", "GABA rice", "multi-cook").
- For Full Stainless inner pot: highlight the material honestly and specifically.
- Made in South Korea claims: ONLY if product.mfg === "South Korea" (verified).
- Equipment-dependent claims (steaming) only if "Steam Tray" / "Steam Plate" / "Steamer Basket" is in features.
- NEVER use "Advanced Microcomputer Technology" / "Advanced Micom" / "Premium Craftsmanship" — puffery is banned.
- First bullet heading: USE THE EXACT HEADING PROVIDED in the user message (for product-family consistency). Do NOT add a colon to the heading field.

Respond ONLY with valid JSON: {"bullets":[{"heading":"...","text":"..."},...]}`;

// Pick the correct bullet prompt module based on product tier.
export function getBulletPromptForTier(tier) {
  if (tier === "premium") return BULLET_TIER_PROMPT_PREMIUM;
  if (tier === "mid") return BULLET_TIER_PROMPT_MID;
  return BULLET_TIER_PROMPT_BASIC;
}

// --- LISTING OUTPUT VALIDATION (continued) ---

// =============================================================
// COLOR-VARIANT GROUPING (narrow F+[WGBR] rule)
// =============================================================
// Pure color variants of the same model should produce identical titles
// except for the color word and the SKU. Detection uses a narrow rule:
// "SKU ends in F + [W|G|B|R]" — matches CR-0675FW/CR-0675FG, avoids
// false positives from model-level F suffixes (CR-0631F, CR-0301C, etc.).
//
// Flow: at the start of a batch, cluster SKUs by stem. Within each group,
// the alphabetically-first SKU is the "leader" — its titles are generated
// first, then reused for follower SKUs with color+SKU swaps.

// Map color suffix letters to English color words. Used for title rewriting.
export const COLOR_LETTER_TO_NAME = {
  W: "White",
  G: "Gray",
  B: "Black",
  R: "Red",
};

// Extract (stem, colorLetter) from a SKU that matches the F+[WGBR] pattern.
// Returns {stem, colorLetter} or null when the SKU doesn't fit.
// Example: "CR-0675FW" -> {stem: "CR-0675F", colorLetter: "W"}
//          "CR-0631F"  -> null (single trailing letter F is model marker, not color)
//          "CR-0301C"  -> null
export function getColorVariantStem(sku) {
  if (!sku || typeof sku !== "string") return null;
  const m = /^(.*F)([WGBR])$/.exec(sku.trim());
  if (!m) return null;
  return { stem: m[1], colorLetter: m[2] };
}

// Build a stem -> [sku, sku, ...] map from a DB. Only includes stems with 2+
// members (single-member stems aren't actionable — nothing to rewrite from).
// Caller can pass any object keyed by SKU; values aren't used.
export function buildColorVariantGroups(dbMap) {
  const groups = {};
  if (!dbMap || typeof dbMap !== "object") return {};
  for (const sku of Object.keys(dbMap)) {
    const parsed = getColorVariantStem(sku);
    if (!parsed) continue;
    if (!groups[parsed.stem]) groups[parsed.stem] = [];
    groups[parsed.stem].push(sku);
  }
  // Filter to multi-member stems only
  const result = {};
  for (const stem of Object.keys(groups)) {
    if (groups[stem].length >= 2) {
      result[stem] = groups[stem].sort(); // alphabetical so leader is deterministic
    }
  }
  return result;
}

// Pick the leader SKU for a group. Always alphabetically first.
export function pickColorVariantLeader(skusInGroup) {
  if (!Array.isArray(skusInGroup) || skusInGroup.length === 0) return null;
  return [...skusInGroup].sort()[0];
}

// Given a SKU, find its leader from the groups map.
// Returns the leader SKU (which is the same SKU if this SKU IS the leader,
// or null if the SKU isn't in any group).
export function getLeaderForSku(sku, groupsMap) {
  const parsed = getColorVariantStem(sku);
  if (!parsed) return null;
  const group = groupsMap[parsed.stem];
  if (!group) return null;
  return pickColorVariantLeader(group);
}

// Rewrite a single title string by swapping the color word and SKU.
// Handles:
//   - The color word: replaces the last occurrence of `leaderColor` with `followerColor`
//     (using word boundaries, case-insensitive match but preserving title case output)
//   - The SKU: replaces the leader SKU everywhere it appears with the follower SKU
// Returns the rewritten title string.
//
// Example:
//   rewriteTitleForFollower(
//     "CUCKOO Micom Rice Cooker 12-Cup Cooked, Gray (CR-0675FG)",
//     "CR-0675FG", "Gray", "CR-0675FW", "White"
//   )
//   -> "CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)"
export function rewriteTitleForFollower(leaderTitle, leaderSku, leaderColor, followerSku, followerColor) {
  if (!leaderTitle || typeof leaderTitle !== "string") return leaderTitle;
  let out = leaderTitle;
  // Swap SKU — exact, case-sensitive (SKUs are uppercase, unambiguous)
  if (leaderSku && followerSku && leaderSku !== followerSku) {
    out = out.split(leaderSku).join(followerSku);
  }
  // Swap color — word-boundary, case-insensitive match, last occurrence only
  // (product titles may contain a color adjective elsewhere — we only want the
  // final ", Color" slot before the SKU parenthetical)
  if (leaderColor && followerColor && leaderColor.toLowerCase() !== followerColor.toLowerCase()) {
    const colorRegex = new RegExp("\\b" + leaderColor.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\b", "gi");
    // Find the last match and replace only it
    let lastIndex = -1;
    let m;
    while ((m = colorRegex.exec(out)) !== null) {
      lastIndex = m.index;
      if (m.index === colorRegex.lastIndex) colorRegex.lastIndex++;
    }
    if (lastIndex >= 0) {
      const matchText = out.substring(lastIndex).match(new RegExp("^" + leaderColor.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&"), "i"));
      if (matchText) {
        out = out.substring(0, lastIndex) + followerColor + out.substring(lastIndex + matchText[0].length);
      }
    }
  }
  return out;
}

// Rewrite a full titles.conversions object (all marketplaces) for a follower SKU
// by applying the color+SKU swap to each marketplace title.
// Mutates the followerConversions object in place.
// Returns { rewrittenCount, warnings }
export function applyColorVariantRewrite(leaderConversions, followerConversions, leaderSku, leaderColor, followerSku, followerColor) {
  const warnings = [];
  let rewrittenCount = 0;
  if (!leaderConversions || !followerConversions) {
    warnings.push("COLOR_VARIANT_REWRITE: missing conversions");
    return { rewrittenCount, warnings };
  }
  for (const mp of Object.keys(leaderConversions)) {
    const leaderTitle = leaderConversions[mp]?.title;
    if (!leaderTitle) continue;
    const rewritten = rewriteTitleForFollower(leaderTitle, leaderSku, leaderColor, followerSku, followerColor);
    if (!followerConversions[mp]) followerConversions[mp] = {};
    followerConversions[mp].title = rewritten;
    rewrittenCount++;
  }
  return { rewrittenCount, warnings };
}

// --- LISTING OUTPUT VALIDATION (continued) ---
// =============================================================

// Clean an individual bullet heading — strips double-colons, trailing colons,
// and leading/trailing whitespace. Fixes the "DUAL PRESSURE SYSTEM::" artifact
// seen in the second bulk run where the LLM appended its own colon after
// using the required heading (which already ended without one).
export function cleanBulletHeading(heading) {
  if (!heading || typeof heading !== "string") return heading;
  let h = heading.trim();
  // Loop stripping trailing colons + whitespace until neither is present
  // (handles patterns like "HEAD : :" where colons are interleaved with spaces)
  while (/[\s:]$/.test(h)) {
    h = h.replace(/[\s:]+$/g, "").trim();
  }
  return h;
}

// Extend puffery removal to bullet bodies. Same rules as removePuffery() for
// titles, but applied to bullet.text strings. Also strips "Advanced
// Microcomputer Technology" which was missed on titles (caught here too).
export function removeBulletPuffery(bulletsObj) {
  if (!bulletsObj?.bullets || !Array.isArray(bulletsObj.bullets)) return;
  for (const b of bulletsObj.bullets) {
    if (!b?.text || typeof b.text !== "string") continue;
    let text = b.text;
    // "Premium" before colors, materials, or finishes (as in titles)
    text = text.replace(/\bPremium\s+(White|Black|Gray|Red|Silver|Gold|Pink|Copper|Stainless\s+Steel|Nonstick|Finish)/gi, "$1");
    // "Luxury" standalone
    text = text.replace(/\bLuxury\s+/gi, "");
    // "Advanced" before tech terms — catches "Advanced Micom", "Advanced Pressure",
    // "Advanced Microcomputer Technology" (the CR-0675FW bulk finding)
    text = text.replace(/\bAdvanced\s+(Micom|Pressure|Induction|Heating|Technology|Microcomputer)/gi, "$1");
    // "Premium Craftsmanship", "Classic Finish", "Easy Clean Design" (generic puffery)
    text = text.replace(/\bPremium\s+Craftsmanship\b/gi, "");
    text = text.replace(/\bClassic\s+Finish\b/gi, "");
    text = text.replace(/\bEasy\s+Clean\s+Design\b/gi, "Easy Clean");
    text = text.replace(/\bTrusted\s+Quality\b/gi, "");
    // Artifact cleanup
    text = text.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();
    b.text = text;
  }
  // Also clean headings while we're iterating
  for (const b of bulletsObj.bullets) {
    if (b?.heading) b.heading = cleanBulletHeading(b.heading);
  }
}

// Trim an individual bullet's full text (heading + ": " + body) to a maximum
// character count. Prefers cutting at sentence boundaries (". ", "! ", "? ").
// If no sentence boundary fits, falls back to cutting at the last space before
// the limit. Returns { text, wasTrimmed } — the bullet's body only, not the heading.
//
// The 220-char hard cap is measured across heading + ": " + body combined.
export function trimBulletToMaxChars(heading, body, maxChars = 220) {
  if (!body) return { text: body || "", wasTrimmed: false };
  const prefix = (heading || "") + ": ";
  const bodyLimit = Math.max(0, maxChars - prefix.length);
  if (body.length <= bodyLimit) return { text: body, wasTrimmed: false };

  // Try sentence-boundary cuts (look backward from the limit for ". ", "! ", "? ")
  const searchWindow = body.slice(0, bodyLimit);
  const sentenceMatches = [...searchWindow.matchAll(/[.!?]\s+/g)];
  if (sentenceMatches.length > 0) {
    const last = sentenceMatches[sentenceMatches.length - 1];
    const cutAt = last.index + last[0].length;
    return { text: body.slice(0, cutAt).trim(), wasTrimmed: true };
  }

  // Fall back: cut at last word boundary before limit
  const lastSpace = searchWindow.lastIndexOf(" ");
  if (lastSpace > 0) {
    return { text: body.slice(0, lastSpace).trim(), wasTrimmed: true };
  }

  // Last resort: hard cut
  return { text: body.slice(0, bodyLimit).trim(), wasTrimmed: true };
}

// Apply trimBulletToMaxChars across a full bullets object. Mutates in place.
// Returns array of { index, originalLen, newLen } for any bullets that were trimmed.
export function trimOversizedBullets(bulletsObj, maxChars = 220) {
  const trimmed = [];
  if (!bulletsObj?.bullets || !Array.isArray(bulletsObj.bullets)) return trimmed;
  for (let i = 0; i < bulletsObj.bullets.length; i++) {
    const b = bulletsObj.bullets[i];
    if (!b?.text) continue;
    const fullLen = ((b.heading || "") + ": " + b.text).length;
    if (fullLen <= maxChars) continue;
    const result = trimBulletToMaxChars(b.heading, b.text, maxChars);
    if (result.wasTrimmed) {
      trimmed.push({ index: i, originalLen: fullLen, newLen: ((b.heading || "") + ": " + result.text).length });
      b.text = result.text;
    }
  }
  return trimmed;
}

// Full bullet post-processing pipeline — run after the LLM returns.
// Mutates bulletsObj in place. Returns { trimmed, warnings }.
export function runBulletPipeline(bulletsObj, maxCharsPerBullet = 220) {
  const warnings = [];
  if (!bulletsObj?.bullets) return { trimmed: [], warnings };
  // 1. Strip puffery + clean heading colons
  removeBulletPuffery(bulletsObj);
  // 2. Trim any oversized bullets (>220 chars)
  const trimmed = trimOversizedBullets(bulletsObj, maxCharsPerBullet);
  if (trimmed.length > 0) {
    for (const t of trimmed) {
      warnings.push(`BULLET_TRIMMED: bullet ${t.index + 1} was ${t.originalLen} chars, trimmed to ${t.newLen}`);
    }
  }
  return { trimmed, warnings };
}

// -----------------------------------------------------------
// FULL PIPELINE WRAPPER
// -----------------------------------------------------------
// Runs the complete title post-processing sequence in the correct order.
// Replaces the 7-line sequence duplicated across 4 call sites in App.jsx.
// Returns { warnings } aggregating all warnings from every step.
export function runFullTitlePipeline(titles, product, sku, capacityMode = "cooked") {
  const warnings = [];
  if (!titles?.conversions || !product) return { warnings };

  // Trim all titles upfront
  for (const key of Object.keys(titles.conversions)) {
    const conv = titles.conversions[key];
    if (conv?.title) conv.title = conv.title.trim();
  }

  // Step 1: Tech normalization (dual-tech phrasing, product class insertion, Korean rule)
  normalizeTitleTech(titles.conversions, product);

  // Step 2: Capacity mode (both / uncooked / cooked)
  normalizeCapacityInTitles(titles.conversions, product, capacityMode);

  // Step 3: Remove unsupported puffery
  removePuffery(titles.conversions);

  // Step 4: Enforce "Stainless Steel Inner Pot" for Full Stainless SKUs
  const stainlessWarnings = enforceStainlessInnerPot(titles.conversions, product);
  warnings.push(...stainlessWarnings);

  // Step 5 (NEW — Chunk A): Diversify marketplace descriptors so no two
  // marketplaces share the same descriptor. Amazon (search_heavy) and
  // Bloomingdale's (minimal) are skipped inside the function.
  const diversifyWarnings = diversifyMarketplaceDescriptors(titles.conversions, product, sku, capacityMode);
  warnings.push(...diversifyWarnings);

  // Step 6: Add comma after capacity when missing
  normalizeCommaAfterCapacity(titles.conversions);

  // Step 7: Ensure SKU in every title where it fits
  if (sku) ensureModelNumberInTitles(titles.conversions, sku);

  // Step 8: Unify amazon_audit.suggested_title with conversions.amazon.title
  unifyAmazonTitle(titles);

  // Final char_count refresh
  for (const key of Object.keys(titles.conversions)) {
    const conv = titles.conversions[key];
    if (conv?.title) conv.char_count = conv.title.length;
  }

  return { warnings };
}

// -----------------------------------------------------------
// STRICT FACET RESAMPLE
// -----------------------------------------------------------
// After titles are generated, validate each marketplace descriptor against
// its facet. For any marketplace whose descriptor fails validation, issue a
// TARGETED retry prompt asking the LLM to regenerate only that marketplace's
// descriptor (cheaper than regenerating the whole batch).
//
// apiCall: async (systemPrompt, userMessage, maxTokens, temperature) => parsedJson
//   — caller provides this so the library stays fetch-agnostic.
//
// maxRetries: how many resample passes to attempt (default 2 = 3 total attempts).
//
// Returns: { titlesUpdated, retriesUsed, unfixable: [mp, mp, ...], attemptsPerMarketplace }
export async function resampleInvalidDescriptors(titles, product, sku, capacityMode, apiCall, opts = {}) {
  const maxRetries = opts.maxRetries ?? 2;
  const result = {
    titlesUpdated: false,
    retriesUsed: 0,
    unfixable: [],
    attemptsPerMarketplace: {},
  };
  if (!titles?.conversions || !product || !apiCall) return result;

  // Identify invalid marketplaces
  const findInvalidMarketplaces = () => {
    const invalid = [];
    for (const mp of Object.keys(titles.conversions)) {
      const conv = titles.conversions[mp];
      if (!conv?.title) continue;
      const descriptor = extractDescriptorSlot(conv.title, product, sku, capacityMode);
      const validation = validateDescriptorFacet(mp, descriptor);
      if (!validation.valid) {
        invalid.push({ mp, descriptor, reason: validation.reason });
      }
    }
    return invalid;
  };

  let invalid = findInvalidMarketplaces();
  if (invalid.length === 0) return result;

  // Attempt resample up to maxRetries times
  for (let attempt = 1; attempt <= maxRetries && invalid.length > 0; attempt++) {
    result.retriesUsed = attempt;
    const mpsToRetry = invalid.map(i => i.mp).filter(mp => {
      const count = result.attemptsPerMarketplace[mp] || 0;
      return count < maxRetries;
    });
    if (mpsToRetry.length === 0) break;

    for (const mp of mpsToRetry) {
      result.attemptsPerMarketplace[mp] = (result.attemptsPerMarketplace[mp] || 0) + 1;
    }

    // Build focused retry prompt
    const facetsNeeded = mpsToRetry.map(mp => {
      const facet = MARKETPLACE_FACETS[mp];
      const vocab = FACET_VOCABULARY[facet]?.keywords?.slice(0, 8).join(", ") || "";
      const minimalNote = facet === "minimal" ? " (no descriptor — core + color + SKU only)" : "";
      return `- ${mp} (facet: ${facet})${minimalNote}${vocab ? ` — descriptor MUST include one of: ${vocab}` : ""}`;
    }).join("\n");

    const coreForContext = buildCanonicalCore(product, sku, capacityMode, { skipModel: true });
    const retryUserMsg = `REGENERATE DESCRIPTORS — STRICT FACET MATCH REQUIRED.

The canonical core for this product is: "${coreForContext}"
Do NOT change the core. Only regenerate the descriptor slot (the text between capacity and color) for these marketplaces:

${facetsNeeded}

Verified product features: ${(product.features || []).join(", ") || "(none)"}
Inner pot: ${product.innerPot || "(unknown)"}
Cooking modes: ${product.cookingModes || "(unknown)"}

Return JSON only:
{"conversions": {"${mpsToRetry.join('": {"title":"..."},"')}": {"title":"..."}}}

Each returned title MUST:
1. Start with the exact canonical core phrase
2. Contain only the descriptor that matches that marketplace's facet vocabulary
3. End with ", ${product.color || "Color"} (${sku})"
4. For bloomingdales specifically: NO descriptor, just core + color + SKU.`;

    let regen;
    try {
      regen = await apiCall(
        "You are a CUCKOO listing specialist. Return only valid JSON.",
        retryUserMsg,
        800,
        0.2
      );
    } catch (err) {
      // Bail out — keep whatever we had
      break;
    }

    // Apply returned titles to the affected marketplaces
    if (regen?.conversions) {
      for (const mp of mpsToRetry) {
        const newTitle = regen.conversions[mp]?.title;
        if (newTitle && typeof newTitle === "string") {
          titles.conversions[mp].title = newTitle.trim();
          titles.conversions[mp].char_count = newTitle.trim().length;
          result.titlesUpdated = true;
        }
      }
    }

    // Re-run the validation to see what's still invalid
    invalid = findInvalidMarketplaces();
  }

  // Anything still invalid after maxRetries is "unfixable" — return those mps
  result.unfixable = invalid.map(i => i.mp);
  return result;
}

// --- LISTING OUTPUT VALIDATION (continued) ---

// Full validation pass across titles, bullets, keywords, and product metadata.
// Mutates objects to correct char_counts/byte_counts and returns { warnings, bulletCharCounts }.
export function validateListingOutput(titles, bullets, keywords, product) {
  const warnings = [];
  const tier = classifyProductTier(product);
  const heroKeywords = getHeroTechKeywords(product);

  // 1. Recalculate title char_counts from actual text
  if (titles?.conversions) {
    for (const [key, conv] of Object.entries(titles.conversions)) {
      if (conv?.title) {
        const actual = conv.title.trim().length;
        if (conv.char_count !== actual) {
          conv.char_count = actual;
        }
        const limit = CHAR_LIMITS[key];
        if (limit && actual > limit) {
          warnings.push("CHAR_LIMIT: " + key + " title is " + actual + " chars (hard limit " + limit + ")");
        }
        const optimal = TITLE_OPTIMAL[key];
        if (optimal && actual <= limit) {
          if (actual < optimal.min) {
            warnings.push("TITLE_SHORT: " + key + " title is " + actual + " chars (below optimal " + optimal.min + "-" + optimal.max + ")");
          } else if (actual > optimal.max) {
            warnings.push("TITLE_LONG: " + key + " title is " + actual + " chars (above optimal " + optimal.min + "-" + optimal.max + ")");
          }
        }
      }
    }
  }
  if (titles?.amazon_audit?.suggested_title) {
    titles.amazon_audit.suggested_char_count = titles.amazon_audit.suggested_title.trim().length;
  }

  // 2. Compute bullet char lengths
  const bulletCharCounts = [];
  if (bullets?.bullets && Array.isArray(bullets.bullets)) {
    for (let i = 0; i < bullets.bullets.length; i++) {
      const b = bullets.bullets[i];
      const fullText = (b.heading || "") + ": " + (b.text || "");
      const len = fullText.length;
      bulletCharCounts.push(len);
      if (len > 220) {
        warnings.push("BULLET_LENGTH: Bullet " + (i + 1) + " is " + len + " chars (over 220 limit)");
      }
      if (len < 120) {
        warnings.push("BULLET_SHORT: Bullet " + (i + 1) + " is " + len + " chars — may be too thin");
      }
    }
    if (bulletCharCounts.length > 0) {
      const undersized = bulletCharCounts.filter(c => c < 150).length;
      if (undersized > bulletCharCounts.length / 2) {
        const avg = Math.round(bulletCharCounts.reduce((a, b) => a + b, 0) / bulletCharCounts.length);
        warnings.push("BULLET_BATCH_SHORT: " + undersized + "/" + bulletCharCounts.length + " bullets under 150 chars (avg " + avg + ") — target is 170-200 per bullet");
      }
    }
  }

  // 3. Recalculate BK byte_count from final text
  if (keywords?.keywords) {
    const actualBytes = new TextEncoder().encode(keywords.keywords).length;
    if (keywords.byte_count !== actualBytes) {
      keywords.byte_count = actualBytes;
    }
    if (actualBytes > 499) {
      warnings.push("BK_BYTES: Backend keywords are " + actualBytes + " bytes (limit 499)");
    }
    if (!keywords.keywords.trim()) {
      warnings.push("BK_EMPTY: Backend keywords field is blank");
    }
  }

  // 4. Premium tech presence check across marketplaces that matter
  if (tier === "premium" && heroKeywords.length > 0 && titles?.conversions) {
    const tightMarketplaces = ["walmart", "target", "bestbuy", "bloomingdales", "weee"];
    const allMpKeys = Object.keys(titles.conversions);
    for (const key of allMpKeys) {
      const title = (titles.conversions[key]?.title || "").toLowerCase();
      const missingTech = heroKeywords.filter(kw => !title.includes(kw));
      if (missingTech.length > 0) {
        const isTight = tightMarketplaces.includes(key);
        warnings.push("PREMIUM_TECH" + (isTight ? "_TIGHT" : "") + ": " + key + " title missing hero tech: " + missingTech.join(", "));
      }
    }
  }

  // 5. Amazon short-title soft warning
  const amazonTitle = titles?.conversions?.amazon?.title;
  if (amazonTitle && amazonTitle.length < 175) {
    warnings.push("AMAZON_SHORT: Amazon title is " + amazonTitle.length + " chars — consider adding a strong verified differentiator if space allows");
  }

  // 6. Full Stainless validation: verify "Stainless Steel Inner Pot" is present in all titles
  if (product?.innerPot === "Full Stainless" && titles?.conversions) {
    for (const [key, conv] of Object.entries(titles.conversions)) {
      if (conv?.title && !conv.title.toLowerCase().includes("stainless steel inner pot")) {
        warnings.push("STAINLESS_MISSING: " + key + " title is missing mandatory 'Stainless Steel Inner Pot' for Full Stainless SKU");
      }
    }
  }

  return { warnings, bulletCharCounts };
}

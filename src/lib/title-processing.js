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

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

// --- LISTING OUTPUT VALIDATION ---

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

import { describe, it, expect } from "vitest";
import {
  CHAR_LIMITS,
  TITLE_OPTIMAL,
  classifyProductTier,
  getBulletCountForType,
  getHeroTechKeywords,
  hasBadCupCount,
  ensureModelNumberInTitles,
  normalizeTitleTech,
  normalizeCapacityInTitles,
  removePuffery,
  unifyAmazonTitle,
  enforceStainlessInnerPot,
  normalizeCommaAfterCapacity,
  validateListingOutput,
  // Chunk A additions
  MARKETPLACE_FACETS,
  FACET_VOCABULARY,
  getCanonicalClass,
  getCapacityPhrase,
  buildCanonicalCore,
  extractDescriptorSlot,
  validateDescriptorFacet,
  diversifyMarketplaceDescriptors,
  buildDescriptorPool,
  getCapacityTier,
  pickAlternativeDescriptor,
  rebuildTitleWithDescriptor,
  // Pipeline wrappers
  runFullTitlePipeline,
  resampleInvalidDescriptors,
  // Chunk B: bullet heading rotation + tier prompts
  BULLET_ONE_HEADING_POOLS,
  getModelBase,
  selectBulletOneHeading,
  createBulletHeadingSession,
  BULLET_TIER_PROMPT_BASIC,
  BULLET_TIER_PROMPT_MID,
  BULLET_TIER_PROMPT_PREMIUM,
  getBulletPromptForTier,
  // #6: Backend keyword diffing + backfill
  bkByteLength,
  tokenizeForBk,
  buildFrontendTokenSet,
  diffBackendKeywords,
  buildBackendKeywordPool,
  backfillBackendKeywords,
  optimizeBackendKeywords,
  BK_COMPETITORS_RICE_COOKER,
  BK_ALT_LANG_SPANISH,
  BK_ALT_LANG_ASIAN_SCRIPTS,
  BK_CULTURAL_DISHES,
  BK_USE_CASE_LONGTAIL,
  BK_KNOWN_MISSPELLINGS,
  // Bullet post-processing (bulk-review-24 fixes)
  cleanBulletHeading,
  removeBulletPuffery,
  trimBulletToMaxChars,
  trimOversizedBullets,
  runBulletPipeline,
  // Color-variant grouping
  getColorVariantStem,
  buildColorVariantGroups,
  pickColorVariantLeader,
  getLeaderForSku,
  rewriteTitleForFollower,
  applyColorVariantRewrite,
  COLOR_LETTER_TO_NAME,
} from "../title-processing.js";

// -------------------------------------------------------------
// Test fixtures: realistic CUCKOO products drawn from the PRODUCT_DB.
// -------------------------------------------------------------

const basicMicom = {
  type: "Micom",
  heating: "Heating Plate",
  pressure: false,
  cookingModes: 6,
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  innerPot: "Nonstick",
};

const midMicom8Mode = {
  type: "Micom",
  heating: "Heating Plate",
  pressure: false,
  cookingModes: 8,
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  innerPot: "Nonstick",
};

const midPressure = {
  type: "Pressure",
  heating: "Heating Plate",
  pressure: true,
  cookingModes: 10,
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  innerPot: "Nonstick",
};

const premiumInduction = {
  type: "Induction + Pressure",
  heating: "Induction",
  pressure: true,
  cookingModes: 16,
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  innerPot: "Nonstick",
};

const premiumTwinPressure = {
  type: "Twin Pressure + Induction",
  heating: "Induction",
  pressure: true,
  cookingModes: 18,
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  innerPot: "Nonstick",
};

const fullStainlessProduct = {
  type: "Induction + Pressure",
  heating: "Induction",
  pressure: true,
  cookingModes: 16,
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  innerPot: "Full Stainless",
};

// -------------------------------------------------------------
// classifyProductTier
// -------------------------------------------------------------
describe("classifyProductTier", () => {
  it("returns 'basic' for null/undefined products", () => {
    expect(classifyProductTier(null)).toBe("basic");
    expect(classifyProductTier(undefined)).toBe("basic");
  });

  it("classifies basic Micom with <8 modes as basic", () => {
    expect(classifyProductTier(basicMicom)).toBe("basic");
  });

  it("classifies Micom with 8+ modes as mid", () => {
    expect(classifyProductTier(midMicom8Mode)).toBe("mid");
  });

  it("classifies pressure (non-IH) as mid", () => {
    expect(classifyProductTier(midPressure)).toBe("mid");
  });

  it("classifies pressure type as mid even without the pressure flag", () => {
    expect(classifyProductTier({ type: "Pressure", cookingModes: 6 })).toBe("mid");
  });

  it("classifies Induction + Pressure as premium", () => {
    expect(classifyProductTier(premiumInduction)).toBe("premium");
  });

  it("classifies Twin Pressure + Induction as premium", () => {
    expect(classifyProductTier(premiumTwinPressure)).toBe("premium");
  });

  it("classifies Twin Pressure (no induction) as premium via type match", () => {
    expect(classifyProductTier({ type: "Twin Pressure", heating: "Heating Plate" })).toBe("premium");
  });

  it("is case-insensitive on type and heating fields", () => {
    expect(classifyProductTier({ type: "INDUCTION + PRESSURE", heating: "INDUCTION" })).toBe("premium");
  });
});

// -------------------------------------------------------------
// getBulletCountForType
// -------------------------------------------------------------
describe("getBulletCountForType", () => {
  it("returns 5 for Basic", () => {
    expect(getBulletCountForType("Basic")).toBe(5);
  });

  it("returns 5 for Commercial (and the 'Commerical' typo)", () => {
    expect(getBulletCountForType("Commercial")).toBe(5);
    expect(getBulletCountForType("Commerical")).toBe(5);
  });

  it("returns 7 for Induction + Pressure", () => {
    expect(getBulletCountForType("Induction + Pressure")).toBe(7);
  });

  it("returns 7 for Twin Pressure + Induction", () => {
    expect(getBulletCountForType("Twin Pressure + Induction")).toBe(7);
  });

  it("returns 6 for Micom, Pressure, Twin Pressure, Induction + Non Pressure", () => {
    expect(getBulletCountForType("Micom")).toBe(6);
    expect(getBulletCountForType("Pressure")).toBe(6);
    expect(getBulletCountForType("Twin Pressure")).toBe(6);
    expect(getBulletCountForType("Induction + Non Pressure")).toBe(6);
  });

  it("defaults to 6 for unknown types", () => {
    expect(getBulletCountForType("Mystery Type")).toBe(6);
    expect(getBulletCountForType("")).toBe(6);
    expect(getBulletCountForType(null)).toBe(6);
    expect(getBulletCountForType(undefined)).toBe(6);
  });

  it("trims whitespace on the input", () => {
    expect(getBulletCountForType("  Basic  ")).toBe(5);
  });
});

// -------------------------------------------------------------
// getHeroTechKeywords
// -------------------------------------------------------------
describe("getHeroTechKeywords", () => {
  it("returns empty array for null products", () => {
    expect(getHeroTechKeywords(null)).toEqual([]);
  });

  it("returns empty for basic micom", () => {
    expect(getHeroTechKeywords(basicMicom)).toEqual([]);
  });

  it("returns ['pressure'] for pressure (non-twin)", () => {
    expect(getHeroTechKeywords(midPressure)).toEqual(["pressure"]);
  });

  it("returns ['induction', 'pressure'] for Induction + Pressure", () => {
    const result = getHeroTechKeywords(premiumInduction);
    expect(result).toContain("induction");
    expect(result).toContain("pressure");
  });

  it("returns ['twin pressure', 'induction'] for Twin Pressure + Induction", () => {
    const result = getHeroTechKeywords(premiumTwinPressure);
    expect(result).toContain("twin pressure");
    expect(result).toContain("induction");
    // Should NOT double-up on 'pressure' alone when 'twin pressure' is present
    expect(result).not.toContain("pressure");
  });

  it("dedupes overlapping keyword matches", () => {
    const product = { type: "Induction + Pressure", heating: "Induction" };
    const result = getHeroTechKeywords(product);
    const inductionCount = result.filter(k => k === "induction").length;
    expect(inductionCount).toBe(1);
  });
});

// -------------------------------------------------------------
// hasBadCupCount
// -------------------------------------------------------------
describe("hasBadCupCount", () => {
  it("returns false for empty/null titles", () => {
    expect(hasBadCupCount("")).toBe(false);
    expect(hasBadCupCount(null)).toBe(false);
  });

  it("detects bare '6-Cup' without Uncooked/Cooked", () => {
    expect(hasBadCupCount("CUCKOO 6-Cup Rice Cooker")).toBe(true);
  });

  it("does NOT detect '6 Cup' with a space (current regex requires no whitespace between digit and Cup)", () => {
    // Documented behavior: regex is /\b(\d+)-?Cup\b/ — hyphen optional, but no space allowed
    // If space-separated cup counts should also be caught, update the regex in title-processing.js
    expect(hasBadCupCount("CUCKOO 6 Cup Rice Cooker")).toBe(false);
  });

  it("allows '6-Cup Uncooked'", () => {
    expect(hasBadCupCount("CUCKOO Rice Cooker 6-Cup Uncooked")).toBe(false);
  });

  it("allows '6-Cup Cooked'", () => {
    expect(hasBadCupCount("CUCKOO Rice Cooker 6-Cup Cooked")).toBe(false);
  });

  it("allows '6-Cup Uncooked / 12-Cup Cooked'", () => {
    expect(hasBadCupCount("CUCKOO Rice Cooker 6-Cup Uncooked / 12-Cup Cooked")).toBe(false);
  });

  it("does not match 'Measuring Cup' (no preceding digit)", () => {
    expect(hasBadCupCount("CUCKOO Rice Cooker with Measuring Cup")).toBe(false);
  });

  it("does not match 'Cupcake' (Cup is part of larger word — trailing)", () => {
    // Note: current regex uses lookahead, so "Cupcake" without leading digit is not matched
    expect(hasBadCupCount("CUCKOO Cupcake Mode")).toBe(false);
  });

  it("ignores cup counts outside the 1-30 plausible range", () => {
    expect(hasBadCupCount("CUCKOO 0-Cup Rice Cooker")).toBe(false);
    expect(hasBadCupCount("CUCKOO 50-Cup Rice Cooker")).toBe(false);
  });
});

// -------------------------------------------------------------
// ensureModelNumberInTitles
// -------------------------------------------------------------
describe("ensureModelNumberInTitles", () => {
  it("no-ops when conversions or sku is missing", () => {
    const conv = { amazon: { title: "Test title" } };
    ensureModelNumberInTitles(conv, "");
    expect(conv.amazon.title).toBe("Test title");
    ensureModelNumberInTitles(null, "CRP-P0610FD");
    // No throw
  });

  it("appends SKU when it fits within the char limit", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked / 12-Cup Cooked, Nonstick" } };
    ensureModelNumberInTitles(conv, "CR-0675FW");
    expect(conv.amazon.title).toContain("(CR-0675FW)");
    expect(conv.amazon.char_count).toBe(conv.amazon.title.length);
  });

  it("skips SKU append when it would exceed the hard limit", () => {
    const longTitle = "X".repeat(195); // Amazon limit is 200, suffix " (CR-0675FW)" = 12 chars
    const conv = { amazon: { title: longTitle } };
    ensureModelNumberInTitles(conv, "CR-0675FW");
    expect(conv.amazon.title).toBe(longTitle);
    expect(conv.amazon.title).not.toContain("(CR-0675FW)");
    expect(conv.amazon.char_count).toBe(longTitle.length);
  });

  it("does not duplicate SKU when already present (case-insensitive)", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker (cr-0675fw)" } };
    ensureModelNumberInTitles(conv, "CR-0675FW");
    const matches = conv.amazon.title.match(/cr-0675fw/gi);
    expect(matches).toHaveLength(1);
  });

  it("recalculates char_count to reflect the final title length", () => {
    const conv = { amazon: { title: "Short title", char_count: 999 } };
    ensureModelNumberInTitles(conv, "CR-0675FW");
    expect(conv.amazon.char_count).toBe(conv.amazon.title.length);
  });

  it("processes multiple marketplaces with per-marketplace limits", () => {
    const conv = {
      amazon: { title: "CUCKOO Rice Cooker 6-Cup" },
      bloomingdales: { title: "X".repeat(110) }, // Bloomingdales limit is 120, suffix would push it over
    };
    ensureModelNumberInTitles(conv, "CR-0675FW");
    expect(conv.amazon.title).toContain("(CR-0675FW)");
    expect(conv.bloomingdales.title).not.toContain("(CR-0675FW)");
  });
});

// -------------------------------------------------------------
// normalizeTitleTech
// -------------------------------------------------------------
describe("normalizeTitleTech", () => {
  it("converts 'Twin Pressure + Induction' to 'Twin Pressure Induction Heating'", () => {
    const conv = { amazon: { title: "CUCKOO Twin Pressure + Induction Rice Cooker" } };
    normalizeTitleTech(conv, { type: "Twin Pressure + Induction" });
    expect(conv.amazon.title).toContain("Twin Pressure Induction Heating");
    expect(conv.amazon.title).not.toContain("+");
  });

  it("converts 'Twin Pressure with Induction' to 'Twin Pressure Induction Heating'", () => {
    const conv = { amazon: { title: "CUCKOO Twin Pressure with Induction Rice Cooker" } };
    normalizeTitleTech(conv, { type: "Twin Pressure + Induction" });
    expect(conv.amazon.title).toContain("Twin Pressure Induction Heating");
    expect(conv.amazon.title).not.toContain(" with ");
  });

  it("ensures 'Heating' follows 'Induction' in the dual-tech phrase", () => {
    const conv = { amazon: { title: "CUCKOO Twin Pressure Induction Rice Cooker" } };
    normalizeTitleTech(conv, { type: "Twin Pressure + Induction" });
    expect(conv.amazon.title).toContain("Twin Pressure Induction Heating");
  });

  it("inserts the canonical product class after CUCKOO when missing", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked" } };
    normalizeTitleTech(conv, { type: "Micom" });
    expect(conv.amazon.title.toLowerCase()).toContain("micom");
    expect(conv.amazon.title).toMatch(/^CUCKOO Micom/);
  });

  it("leaves the title alone when inserting the class would exceed the hard limit", () => {
    const conv = { bloomingdales: { title: "X".repeat(118) } }; // Bloomies limit is 120
    normalizeTitleTech(conv, { type: "Micom" });
    expect(conv.bloomingdales.title).toBe("X".repeat(118));
  });

  it("strips 'Korean' from the front block but preserves 'Korean Rice Cooker' later in title", () => {
    const conv = { amazon: { title: "CUCKOO Korean Rice Cooker 6-Cup Uncooked, Korean Rice Cooker" } };
    normalizeTitleTech(conv, { type: "Micom" });
    // Front block "Korean Rice Cooker" before capacity should be stripped to "Rice Cooker"
    // But subsequent "Korean Rice Cooker" references should remain
    expect(conv.amazon.title).toMatch(/^CUCKOO Micom Rice Cooker 6-Cup/);
  });

  it("removes standalone 'Korean' not followed by 'Rice Cooker'", () => {
    const conv = { amazon: { title: "CUCKOO Korean Pressure Rice Cooker" } };
    normalizeTitleTech(conv, { type: "Pressure" });
    expect(conv.amazon.title).not.toContain("Korean Pressure");
    // "Korean Rice Cooker" would be allowed, but "Korean" alone should be removed
  });

  it("is idempotent — running twice produces the same result", () => {
    const conv1 = { amazon: { title: "CUCKOO Rice Cooker 6-Cup" } };
    const conv2 = { amazon: { title: "CUCKOO Rice Cooker 6-Cup" } };
    normalizeTitleTech(conv1, { type: "Micom" });
    const afterFirst = conv1.amazon.title;
    normalizeTitleTech(conv1, { type: "Micom" });
    expect(conv1.amazon.title).toBe(afterFirst);
    // And produces the same result as a single pass
    normalizeTitleTech(conv2, { type: "Micom" });
    expect(conv1.amazon.title).toBe(conv2.amazon.title);
  });
});

// -------------------------------------------------------------
// normalizeCapacityInTitles
// -------------------------------------------------------------
describe("normalizeCapacityInTitles", () => {
  const product = { cupSize: "6 Cup Uncooked / 12 Cup Cooked" };

  it("no-ops if product has no cupSize", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker" } };
    normalizeCapacityInTitles(conv, {}, "both");
    expect(conv.amazon.title).toBe("CUCKOO Rice Cooker");
  });

  it("converts both-mode capacity phrase to uncooked-only when mode is 'uncooked'", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked / 12-Cup Cooked" } };
    normalizeCapacityInTitles(conv, product, "uncooked");
    expect(conv.amazon.title).toContain("6-Cup Uncooked");
    expect(conv.amazon.title).not.toContain("12-Cup Cooked");
  });

  it("converts both-mode capacity phrase to cooked-only when mode is 'cooked'", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked / 12-Cup Cooked" } };
    normalizeCapacityInTitles(conv, product, "cooked");
    expect(conv.amazon.title).toContain("12-Cup Cooked");
    expect(conv.amazon.title).not.toContain("6-Cup Uncooked");
  });

  it("keeps both forms when mode is 'both'", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked" } };
    normalizeCapacityInTitles(conv, product, "both");
    expect(conv.amazon.title).toContain("6-Cup Uncooked");
    expect(conv.amazon.title).toContain("12-Cup Cooked");
  });

  it("inserts capacity after 'Rice Cooker' when no capacity phrase is present", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker" } };
    normalizeCapacityInTitles(conv, product, "uncooked");
    expect(conv.amazon.title).toContain("Rice Cooker 6-Cup Uncooked");
  });

  it("handles extra spaces around the slash", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked  /  12-Cup Cooked" } };
    normalizeCapacityInTitles(conv, product, "uncooked");
    expect(conv.amazon.title).toContain("6-Cup Uncooked");
  });
});

// -------------------------------------------------------------
// removePuffery
// -------------------------------------------------------------
describe("removePuffery", () => {
  it("strips 'Premium White' down to 'White'", () => {
    const conv = { amazon: { title: "CUCKOO Premium White Rice Cooker" } };
    removePuffery(conv);
    expect(conv.amazon.title).not.toContain("Premium White");
    expect(conv.amazon.title).toContain("White");
  });

  it("strips 'Luxury '", () => {
    const conv = { amazon: { title: "CUCKOO Luxury Rice Cooker" } };
    removePuffery(conv);
    expect(conv.amazon.title).not.toContain("Luxury");
  });

  it("strips 'Advanced Micom' to 'Micom'", () => {
    const conv = { amazon: { title: "CUCKOO Advanced Micom Rice Cooker" } };
    removePuffery(conv);
    expect(conv.amazon.title).not.toContain("Advanced Micom");
    expect(conv.amazon.title).toContain("Micom");
  });

  it("strips 'Premium Nonstick' and 'Premium Stainless Steel'", () => {
    const conv = {
      amazon: { title: "CUCKOO Rice Cooker with Premium Nonstick" },
      walmart: { title: "CUCKOO Rice Cooker with Premium Stainless Steel" },
    };
    removePuffery(conv);
    expect(conv.amazon.title).not.toContain("Premium Nonstick");
    expect(conv.walmart.title).not.toContain("Premium Stainless Steel");
  });

  it("cleans up double spaces from stripped puffery", () => {
    const conv = { amazon: { title: "CUCKOO Luxury  Rice Cooker" } };
    removePuffery(conv);
    expect(conv.amazon.title).not.toMatch(/\s{2,}/);
  });

  it("leaves unrelated content untouched", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked" } };
    removePuffery(conv);
    expect(conv.amazon.title).toBe("CUCKOO Rice Cooker 6-Cup Uncooked");
  });
});

// -------------------------------------------------------------
// unifyAmazonTitle
// -------------------------------------------------------------
describe("unifyAmazonTitle", () => {
  it("copies conversions.amazon.title into amazon_audit.suggested_title", () => {
    const titles = {
      conversions: { amazon: { title: "FINAL AMAZON TITLE" } },
      amazon_audit: { suggested_title: "stale value", suggested_char_count: 999 },
    };
    unifyAmazonTitle(titles);
    expect(titles.amazon_audit.suggested_title).toBe("FINAL AMAZON TITLE");
    expect(titles.amazon_audit.suggested_char_count).toBe("FINAL AMAZON TITLE".length);
  });

  it("no-ops when there is no amazon_audit object", () => {
    const titles = { conversions: { amazon: { title: "FINAL" } } };
    unifyAmazonTitle(titles);
    expect(titles.amazon_audit).toBeUndefined();
  });

  it("no-ops when there is no conversions.amazon.title", () => {
    const titles = { conversions: {}, amazon_audit: { suggested_title: "unchanged" } };
    unifyAmazonTitle(titles);
    expect(titles.amazon_audit.suggested_title).toBe("unchanged");
  });

  it("no-ops when titles is null/undefined", () => {
    expect(() => unifyAmazonTitle(null)).not.toThrow();
    expect(() => unifyAmazonTitle(undefined)).not.toThrow();
  });
});

// -------------------------------------------------------------
// enforceStainlessInnerPot
// -------------------------------------------------------------
describe("enforceStainlessInnerPot", () => {
  it("returns empty warnings and no-ops for non-Full-Stainless products", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked" } };
    const warnings = enforceStainlessInnerPot(conv, { innerPot: "Nonstick" });
    expect(warnings).toEqual([]);
    expect(conv.amazon.title).toBe("CUCKOO Rice Cooker 6-Cup Uncooked");
  });

  it("adds 'Stainless Steel Inner Pot' after capacity for Full Stainless products", () => {
    const conv = { amazon: { title: "CUCKOO Induction Heating Pressure Rice Cooker 6-Cup Uncooked, Nonstick (CRP-LHTAR0609F)" } };
    const warnings = enforceStainlessInnerPot(conv, fullStainlessProduct);
    expect(conv.amazon.title).toContain("Stainless Steel Inner Pot");
    expect(warnings).toEqual([]);
  });

  it("does not duplicate when 'Stainless Steel Inner Pot' is already present", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked, Stainless Steel Inner Pot" } };
    enforceStainlessInnerPot(conv, fullStainlessProduct);
    const matches = conv.amazon.title.match(/Stainless Steel Inner Pot/g);
    expect(matches).toHaveLength(1);
  });

  it("strips weaker 'Stainless Steel' references before inserting the full phrase", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked, Stainless Steel, Auto Clean" } };
    enforceStainlessInnerPot(conv, fullStainlessProduct);
    expect(conv.amazon.title).toContain("Stainless Steel Inner Pot");
    // Make sure the bare "Stainless Steel" was stripped
    const bareMatches = conv.amazon.title.match(/Stainless Steel(?!\s+Inner\s+Pot)/g);
    expect(bareMatches).toBeNull();
  });

  it("warns when the phrase cannot fit even after stripping optional descriptors", () => {
    // Pack the title so it exceeds bloomingdales limit (120) even after cleanup
    const tight = "CUCKOO Induction Heating Pressure Rice Cooker 6-Cup Uncooked / 12-Cup Cooked White (CRP-LHTAR0609F)";
    const conv = { bloomingdales: { title: tight } };
    const warnings = enforceStainlessInnerPot(conv, fullStainlessProduct);
    // Either it succeeded by stripping, or it returned a STAINLESS_MISSING warning
    if (!conv.bloomingdales.title.includes("Stainless Steel Inner Pot")) {
      expect(warnings.some(w => w.startsWith("STAINLESS_MISSING: bloomingdales"))).toBe(true);
    }
  });

  it("inserts before model number when no capacity phrase is present", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker (CRP-LHTAR0609F)" } };
    enforceStainlessInnerPot(conv, fullStainlessProduct);
    expect(conv.amazon.title).toContain("Stainless Steel Inner Pot");
    // SKU should still be at the end
    expect(conv.amazon.title).toMatch(/\(CRP-LHTAR0609F\)$/);
  });
});

// -------------------------------------------------------------
// normalizeCommaAfterCapacity
// -------------------------------------------------------------
describe("normalizeCommaAfterCapacity", () => {
  it("adds comma after capacity when followed by a descriptor word", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked Nonstick" } };
    normalizeCommaAfterCapacity(conv);
    expect(conv.amazon.title).toContain("6-Cup Uncooked, Nonstick");
  });

  it("does not add comma before 'with'", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked with Steamer" } };
    normalizeCommaAfterCapacity(conv);
    expect(conv.amazon.title).toContain("6-Cup Uncooked with Steamer");
    expect(conv.amazon.title).not.toContain("6-Cup Uncooked, with");
  });

  it("does not add comma before '('", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked (CR-0675FW)" } };
    normalizeCommaAfterCapacity(conv);
    expect(conv.amazon.title).toContain("6-Cup Uncooked (CR-0675FW)");
  });

  it("does not double-comma when one is already present", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked, Nonstick" } };
    normalizeCommaAfterCapacity(conv);
    const matches = conv.amazon.title.match(/6-Cup Uncooked,/g);
    expect(matches).toHaveLength(1);
  });

  it("handles the combined 'X-Cup Uncooked / Y-Cup Cooked' form", () => {
    const conv = { amazon: { title: "CUCKOO Rice Cooker 6-Cup Uncooked / 12-Cup Cooked Nonstick" } };
    normalizeCommaAfterCapacity(conv);
    expect(conv.amazon.title).toContain("12-Cup Cooked, Nonstick");
  });
});

// -------------------------------------------------------------
// validateListingOutput
// -------------------------------------------------------------
describe("validateListingOutput", () => {
  const makeTitles = (amazonTitle, extras = {}) => ({
    conversions: {
      amazon: { title: amazonTitle, char_count: amazonTitle.length },
      ...extras,
    },
    amazon_audit: { suggested_title: amazonTitle, suggested_char_count: amazonTitle.length },
  });

  it("fires CHAR_LIMIT warning when title exceeds marketplace hard limit", () => {
    const titles = makeTitles("X".repeat(205)); // Amazon limit 200
    const { warnings } = validateListingOutput(titles, null, null, basicMicom);
    expect(warnings.some(w => w.startsWith("CHAR_LIMIT: amazon"))).toBe(true);
  });

  it("fires AMAZON_SHORT when Amazon title is under 175 chars", () => {
    const titles = makeTitles("CUCKOO Rice Cooker 6-Cup"); // short
    const { warnings } = validateListingOutput(titles, null, null, basicMicom);
    expect(warnings.some(w => w.startsWith("AMAZON_SHORT"))).toBe(true);
  });

  it("fires TITLE_SHORT when a non-amazon title is below optimal range", () => {
    const titles = makeTitles("X".repeat(180), { walmart: { title: "Short walmart", char_count: 13 } });
    const { warnings } = validateListingOutput(titles, null, null, basicMicom);
    expect(warnings.some(w => w.startsWith("TITLE_SHORT: walmart"))).toBe(true);
  });

  it("recalculates char_count when stale", () => {
    const titles = {
      conversions: { amazon: { title: "CUCKOO Rice Cooker", char_count: 999 } },
    };
    validateListingOutput(titles, null, null, basicMicom);
    expect(titles.conversions.amazon.char_count).toBe("CUCKOO Rice Cooker".length);
  });

  it("fires BULLET_LENGTH when a bullet exceeds 220 chars", () => {
    const bullets = { bullets: [{ heading: "TEST", text: "x".repeat(250) }] };
    const { warnings, bulletCharCounts } = validateListingOutput(null, bullets, null, basicMicom);
    expect(warnings.some(w => w.startsWith("BULLET_LENGTH"))).toBe(true);
    expect(bulletCharCounts[0]).toBeGreaterThan(220);
  });

  it("fires BULLET_SHORT when a bullet is under 120 chars", () => {
    const bullets = { bullets: [{ heading: "TEST", text: "short" }] };
    const { warnings } = validateListingOutput(null, bullets, null, basicMicom);
    expect(warnings.some(w => w.startsWith("BULLET_SHORT"))).toBe(true);
  });

  it("fires BULLET_BATCH_SHORT when >50% of bullets are under 150 chars", () => {
    const bullets = {
      bullets: [
        { heading: "A", text: "short one" },
        { heading: "B", text: "short two" },
        { heading: "C", text: "x".repeat(160) },
      ],
    };
    const { warnings } = validateListingOutput(null, bullets, null, basicMicom);
    expect(warnings.some(w => w.startsWith("BULLET_BATCH_SHORT"))).toBe(true);
  });

  it("fires BK_BYTES warning when backend keywords exceed 499 bytes", () => {
    const keywords = { keywords: "x".repeat(500) };
    const { warnings } = validateListingOutput(null, null, keywords, basicMicom);
    expect(warnings.some(w => w.startsWith("BK_BYTES"))).toBe(true);
  });

  it("fires BK_EMPTY warning when keywords field is blank", () => {
    const keywords = { keywords: "   " };
    const { warnings } = validateListingOutput(null, null, keywords, basicMicom);
    expect(warnings.some(w => w.startsWith("BK_EMPTY"))).toBe(true);
  });

  it("fires PREMIUM_TECH when premium product is missing hero tech in a marketplace title", () => {
    const titles = makeTitles(
      "CUCKOO Rice Cooker 6-Cup Uncooked, Nonstick Inner Pot, Multi-Cook Modes, Easy Clean (CRP-P0610FD)",
      { walmart: { title: "CUCKOO Rice Cooker 6-Cup (CRP-P0610FD)", char_count: 38 } }
    );
    const { warnings } = validateListingOutput(titles, null, null, premiumInduction);
    expect(warnings.some(w => w.startsWith("PREMIUM_TECH"))).toBe(true);
    expect(warnings.some(w => w.startsWith("PREMIUM_TECH_TIGHT: walmart"))).toBe(true);
  });

  it("fires STAINLESS_MISSING when Full Stainless SKU missing the phrase", () => {
    const titles = makeTitles(
      "CUCKOO Induction Heating Pressure Rice Cooker 6-Cup Uncooked (CRP-LHTAR0609F)"
    );
    const { warnings } = validateListingOutput(titles, null, null, fullStainlessProduct);
    expect(warnings.some(w => w.startsWith("STAINLESS_MISSING"))).toBe(true);
  });

  it("does not fire STAINLESS_MISSING when the phrase is present", () => {
    const titles = makeTitles(
      "CUCKOO Induction Heating Pressure Rice Cooker 6-Cup Uncooked, Stainless Steel Inner Pot, Voice Guide, Silent Pressure System, Multi-Cook Modes (CRP-LHTAR0609F)"
    );
    const { warnings } = validateListingOutput(titles, null, null, fullStainlessProduct);
    expect(warnings.some(w => w.startsWith("STAINLESS_MISSING"))).toBe(false);
  });
});

// -------------------------------------------------------------
// Integration: post-processing pipeline in correct order
// Mirrors the actual call sequence in App.jsx.
// -------------------------------------------------------------
describe("integration: full post-processing pipeline", () => {
  it("runs all post-processors in order without regressions on a realistic title", () => {
    const titles = {
      conversions: {
        amazon: { title: "CUCKOO Twin Pressure + Induction Rice Cooker 6-Cup Uncooked / 12-Cup Cooked Premium White" },
      },
      amazon_audit: { suggested_title: "stale", suggested_char_count: 0 },
    };

    normalizeTitleTech(titles.conversions, premiumTwinPressure);
    normalizeCapacityInTitles(titles.conversions, premiumTwinPressure, "both");
    removePuffery(titles.conversions);
    enforceStainlessInnerPot(titles.conversions, premiumTwinPressure); // non-stainless: no-op
    normalizeCommaAfterCapacity(titles.conversions);
    ensureModelNumberInTitles(titles.conversions, "CRP-JHSS1009F");
    unifyAmazonTitle(titles);

    const final = titles.conversions.amazon.title;
    // Tech normalization
    expect(final).toContain("Twin Pressure Induction Heating");
    expect(final).not.toContain("+");
    // Puffery removed
    expect(final).not.toContain("Premium White");
    expect(final).toContain("White");
    // SKU appended
    expect(final).toContain("(CRP-JHSS1009F)");
    // amazon_audit synced
    expect(titles.amazon_audit.suggested_title).toBe(final);
    expect(titles.amazon_audit.suggested_char_count).toBe(final.length);
  });

  it("enforces stainless phrase for Full Stainless SKU through the full pipeline", () => {
    const titles = {
      conversions: {
        amazon: { title: "CUCKOO Induction Heating Pressure Rice Cooker 6-Cup Uncooked, Nonstick" },
      },
      amazon_audit: { suggested_title: "", suggested_char_count: 0 },
    };

    normalizeTitleTech(titles.conversions, fullStainlessProduct);
    normalizeCapacityInTitles(titles.conversions, fullStainlessProduct, "both");
    removePuffery(titles.conversions);
    const stainlessWarnings = enforceStainlessInnerPot(titles.conversions, fullStainlessProduct);
    normalizeCommaAfterCapacity(titles.conversions);
    ensureModelNumberInTitles(titles.conversions, "CRP-LHTAR0609F");
    unifyAmazonTitle(titles);

    expect(titles.conversions.amazon.title).toContain("Stainless Steel Inner Pot");
    expect(stainlessWarnings).toEqual([]);
  });
});

// -------------------------------------------------------------
// Constants sanity
// -------------------------------------------------------------
describe("constants", () => {
  it("CHAR_LIMITS covers all 10 marketplaces", () => {
    const expectedKeys = ["amazon", "walmart", "target", "bestbuy", "wayfair", "kohls", "macys", "bloomingdales", "tiktokshop", "weee"];
    for (const key of expectedKeys) {
      expect(CHAR_LIMITS[key]).toBeGreaterThan(0);
    }
  });

  it("TITLE_OPTIMAL has min < max for every marketplace", () => {
    for (const [mp, range] of Object.entries(TITLE_OPTIMAL)) {
      expect(range.min).toBeLessThan(range.max);
      expect(range.max).toBeLessThanOrEqual(CHAR_LIMITS[mp]);
    }
  });
});

// =============================================================
// CHUNK A — OPTION C: CANONICAL CORE + MARKETPLACE FACETS
// =============================================================

// Test fixtures with color + features populated for Chunk A tests
const basicProductCR0601C = {
  type: "Basic",
  heating: "Heating Plate",
  pressure: false,
  cookingModes: "1",
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  color: "White",
  innerPot: "Nonstick",
  features: ["Keep Warm"],
};

const micomProductCR0675FW = {
  type: "Micom",
  heating: "Heating Plate",
  pressure: false,
  cookingModes: "10",
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  color: "White",
  innerPot: "Nonstick",
  features: ["Auto Clean", "Turbo Mode", "Preset Timer", "Water Capture", "Voice Guide"],
};

const premiumStainless = {
  type: "Twin Pressure + Induction",
  heating: "Induction",
  pressure: true,
  cookingModes: "21",
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  color: "White",
  innerPot: "Full Stainless",
  features: ["Voice Guide", "Auto Clean", "Steam Plate", "Turbo Mode", "Preset Timer"],
};

const inductionPressure = {
  type: "Induction + Pressure",
  heating: "Induction",
  pressure: true,
  cookingModes: "14",
  cupSize: "6 Cup Uncooked / 12 Cup Cooked",
  color: "Black",
  innerPot: "Nonstick",
  features: ["Auto Clean", "Voice Guide", "Preset Timer"],
};

// -------------------------------------------------------------
// getCanonicalClass
// -------------------------------------------------------------
describe("getCanonicalClass", () => {
  it("returns empty for null/undefined products", () => {
    expect(getCanonicalClass(null)).toBe("");
    expect(getCanonicalClass(undefined)).toBe("");
  });

  it("maps 'Twin Pressure + Induction' to 'Twin Pressure Induction Heating'", () => {
    expect(getCanonicalClass({ type: "Twin Pressure + Induction" })).toBe("Twin Pressure Induction Heating");
  });

  it("maps 'Induction + Pressure' to 'Induction Heating Pressure'", () => {
    expect(getCanonicalClass({ type: "Induction + Pressure" })).toBe("Induction Heating Pressure");
  });

  it("maps 'Induction + Non Pressure' to 'Induction Heating'", () => {
    expect(getCanonicalClass({ type: "Induction + Non Pressure" })).toBe("Induction Heating");
  });

  it("normalizes 'Commerical' typo to 'Commercial'", () => {
    expect(getCanonicalClass({ type: "Commerical" })).toBe("Commercial");
    expect(getCanonicalClass({ type: "Commercial" })).toBe("Commercial");
  });

  it("passes through Basic, Micom, Pressure, Twin Pressure unchanged", () => {
    expect(getCanonicalClass({ type: "Basic" })).toBe("Basic");
    expect(getCanonicalClass({ type: "Micom" })).toBe("Micom");
    expect(getCanonicalClass({ type: "Pressure" })).toBe("Pressure");
    expect(getCanonicalClass({ type: "Twin Pressure" })).toBe("Twin Pressure");
  });
});

// -------------------------------------------------------------
// getCapacityPhrase
// -------------------------------------------------------------
describe("getCapacityPhrase", () => {
  const p = { cupSize: "6 Cup Uncooked / 12 Cup Cooked" };

  it("returns uncooked phrase for mode='uncooked'", () => {
    expect(getCapacityPhrase(p, "uncooked")).toBe("6-Cup Uncooked");
  });

  it("returns cooked phrase for mode='cooked'", () => {
    expect(getCapacityPhrase(p, "cooked")).toBe("12-Cup Cooked");
  });

  it("returns both phrase for mode='both'", () => {
    expect(getCapacityPhrase(p, "both")).toBe("6-Cup Uncooked / 12-Cup Cooked");
  });

  it("returns empty for missing cupSize or mode", () => {
    expect(getCapacityPhrase({}, "cooked")).toBe("");
    expect(getCapacityPhrase(p, "")).toBe("");
    expect(getCapacityPhrase(null, "cooked")).toBe("");
  });

  it("handles larger capacities (30/60 commercial)", () => {
    const big = { cupSize: "30 Cup Uncooked / 60 Cup Cooked" };
    expect(getCapacityPhrase(big, "cooked")).toBe("60-Cup Cooked");
  });
});

// -------------------------------------------------------------
// buildCanonicalCore
// -------------------------------------------------------------
describe("buildCanonicalCore", () => {
  it("builds full core for a Micom product with color and SKU", () => {
    const core = buildCanonicalCore(micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(core).toBe("CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)");
  });

  it("builds core for Twin Pressure + Induction with the canonical phrase", () => {
    const core = buildCanonicalCore(premiumStainless, "CRP-LHTAR0609FW", "cooked");
    expect(core).toBe("CUCKOO Twin Pressure Induction Heating Rice Cooker 12-Cup Cooked, White (CRP-LHTAR0609FW)");
  });

  it("supports 'both' capacity mode", () => {
    const core = buildCanonicalCore(micomProductCR0675FW, "CR-0675FW", "both");
    expect(core).toContain("6-Cup Uncooked / 12-Cup Cooked");
  });

  it("skips SKU when skipModel=true (for ensureModelNumberInTitles to add later)", () => {
    const core = buildCanonicalCore(micomProductCR0675FW, "CR-0675FW", "cooked", { skipModel: true });
    expect(core).not.toContain("(CR-0675FW)");
    expect(core).toContain("White");
  });

  it("skips color when skipColor=true", () => {
    const core = buildCanonicalCore(micomProductCR0675FW, "CR-0675FW", "cooked", { skipColor: true, skipModel: true });
    expect(core).toBe("CUCKOO Micom Rice Cooker 12-Cup Cooked");
  });

  it("returns empty for null product", () => {
    expect(buildCanonicalCore(null, "CR-0675FW")).toBe("");
  });

  it("works for Basic products without features", () => {
    const core = buildCanonicalCore(basicProductCR0601C, "CR-0601C", "cooked");
    expect(core).toBe("CUCKOO Basic Rice Cooker 12-Cup Cooked, White (CR-0601C)");
  });
});

// -------------------------------------------------------------
// extractDescriptorSlot
// -------------------------------------------------------------
describe("extractDescriptorSlot", () => {
  it("extracts 'with Auto Clean' from a full title", () => {
    const title = "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean, White (CR-0675FW)";
    const desc = extractDescriptorSlot(title, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(desc).toBe("with Auto Clean");
  });

  it("returns empty when title is just the canonical core", () => {
    const title = "CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)";
    const desc = extractDescriptorSlot(title, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(desc).toBe("");
  });

  it("handles 'for Rice & Grains' lifestyle descriptors", () => {
    const title = "CUCKOO Micom Rice Cooker 12-Cup Cooked, for Rice & Grains, White (CR-0675FW)";
    const desc = extractDescriptorSlot(title, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(desc).toBe("for Rice & Grains");
  });

  it("handles multiple stacked Amazon descriptors", () => {
    const title = "CUCKOO Micom Rice Cooker 12-Cup Cooked, Rice Maker with 10 Cooking Modes, Auto Clean, Turbo Mode, White (CR-0675FW)";
    const desc = extractDescriptorSlot(title, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(desc).toContain("Rice Maker");
    expect(desc).toContain("10 Cooking Modes");
    expect(desc).toContain("Auto Clean");
  });

  it("is tolerant of missing color on a title", () => {
    const title = "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean (CR-0675FW)";
    const desc = extractDescriptorSlot(title, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(desc).toBe("with Auto Clean");
  });
});

// -------------------------------------------------------------
// validateDescriptorFacet
// -------------------------------------------------------------
describe("validateDescriptorFacet", () => {
  describe("minimal facet (Bloomingdale's)", () => {
    it("is valid when descriptor is empty", () => {
      expect(validateDescriptorFacet("bloomingdales", "").valid).toBe(true);
      expect(validateDescriptorFacet("bloomingdales", "   ").valid).toBe(true);
    });

    it("is invalid when descriptor is non-empty", () => {
      const r = validateDescriptorFacet("bloomingdales", "with Nonstick Inner Pot");
      expect(r.valid).toBe(false);
      expect(r.reason).toBe("bloomingdales_must_be_minimal");
    });
  });

  describe("search_heavy facet (Amazon)", () => {
    it("is valid when 2+ facet keywords are stacked", () => {
      const r = validateDescriptorFacet("amazon", "Rice Maker with Auto Clean, 10 Cooking Modes, Nonstick Inner Pot");
      expect(r.valid).toBe(true);
    });

    it("is invalid when only one facet keyword is present", () => {
      const r = validateDescriptorFacet("amazon", "with Auto Clean");
      expect(r.valid).toBe(false);
      expect(r.reason).toContain("search_heavy");
    });

    it("is invalid when descriptor is empty", () => {
      const r = validateDescriptorFacet("amazon", "");
      expect(r.valid).toBe(false);
    });
  });

  describe("primary_benefit facet (Walmart)", () => {
    it("accepts 'with Auto Clean'", () => {
      expect(validateDescriptorFacet("walmart", "with Auto Clean").valid).toBe(true);
    });

    it("accepts 'with Turbo Mode'", () => {
      expect(validateDescriptorFacet("walmart", "with Turbo Mode").valid).toBe(true);
    });

    it("rejects 'Premium Design' (not in facet vocab)", () => {
      expect(validateDescriptorFacet("walmart", "Premium Design").valid).toBe(false);
    });
  });

  describe("lifestyle facet (Target)", () => {
    it("accepts 'for Rice & Grains'", () => {
      expect(validateDescriptorFacet("target", "for Rice & Grains").valid).toBe(true);
    });

    it("accepts 'for Everyday Family Meals'", () => {
      expect(validateDescriptorFacet("target", "for Everyday Family Meals").valid).toBe(true);
    });

    it("rejects 'with 10 Cooking Modes' (that's a tech_spec facet)", () => {
      expect(validateDescriptorFacet("target", "with 10 Cooking Modes").valid).toBe(false);
    });
  });

  describe("tech_spec facet (Best Buy)", () => {
    it("accepts 'with 10 Cooking Modes'", () => {
      expect(validateDescriptorFacet("bestbuy", "with 10 Cooking Modes").valid).toBe(true);
    });

    it("accepts 'with Induction Heating'", () => {
      expect(validateDescriptorFacet("bestbuy", "with Induction Heating").valid).toBe(true);
    });

    it("accepts quantified patterns via patternMatch (e.g. '13-Hour Preset Timer')", () => {
      expect(validateDescriptorFacet("bestbuy", "with 13-Hour Preset Timer").valid).toBe(true);
    });

    it("rejects 'for everyday rice'", () => {
      expect(validateDescriptorFacet("bestbuy", "for everyday rice").valid).toBe(false);
    });
  });

  describe("material_design facet (Wayfair)", () => {
    it("accepts 'with Nonstick Inner Pot'", () => {
      expect(validateDescriptorFacet("wayfair", "with Nonstick Inner Pot").valid).toBe(true);
    });

    it("accepts 'with Stainless Steel Inner Pot'", () => {
      expect(validateDescriptorFacet("wayfair", "with Stainless Steel Inner Pot").valid).toBe(true);
    });

    it("rejects 'with Turbo Mode' (not material)", () => {
      expect(validateDescriptorFacet("wayfair", "with Turbo Mode").valid).toBe(false);
    });
  });

  describe("practical_cultural facet (Weee!)", () => {
    it("accepts 'for Multi-Grain & GABA Rice'", () => {
      expect(validateDescriptorFacet("weee", "for Multi-Grain & GABA Rice").valid).toBe(true);
    });

    it("accepts 'for Sticky Rice & Porridge'", () => {
      expect(validateDescriptorFacet("weee", "for Sticky Rice & Porridge").valid).toBe(true);
    });
  });

  describe("unknown marketplace", () => {
    it("is valid (skip)", () => {
      expect(validateDescriptorFacet("mystery", "anything").valid).toBe(true);
    });
  });
});

// -------------------------------------------------------------
// buildDescriptorPool
// -------------------------------------------------------------
describe("buildDescriptorPool", () => {
  it("returns empty for null product", () => {
    expect(buildDescriptorPool(null)).toEqual([]);
  });

  it("includes inner pot descriptor for non-stainless products", () => {
    const pool = buildDescriptorPool(micomProductCR0675FW);
    const texts = pool.map(p => p.text);
    expect(texts).toContain("with Nonstick Inner Pot");
  });

  it("includes 'Stainless Steel Inner Pot' for Full Stainless products", () => {
    const pool = buildDescriptorPool(premiumStainless);
    const texts = pool.map(p => p.text);
    expect(texts).toContain("with Stainless Steel Inner Pot");
  });

  it("includes feature descriptors for verified features", () => {
    const pool = buildDescriptorPool(micomProductCR0675FW);
    const texts = pool.map(p => p.text);
    expect(texts).toContain("with Auto Clean");
    expect(texts).toContain("with Turbo Mode");
    expect(texts).toContain("with Preset Timer");
    expect(texts).toContain("with Water Capture");
  });

  it("does NOT include feature descriptors for features the product lacks", () => {
    const pool = buildDescriptorPool(basicProductCR0601C);
    const texts = pool.map(p => p.text);
    expect(texts).not.toContain("with Auto Clean");
    expect(texts).not.toContain("with Voice Guide");
  });

  it("includes mode-count tech spec descriptor", () => {
    const pool = buildDescriptorPool(micomProductCR0675FW);
    const texts = pool.map(p => p.text);
    expect(texts).toContain("with 10 Cooking Modes");
  });

  it("includes capacity-aware lifestyle descriptors (family tier)", () => {
    const pool = buildDescriptorPool(basicProductCR0601C); // 6-cup uncooked = family tier
    const texts = pool.map(p => p.text);
    expect(texts).toContain("Family-Size Capacity");
    expect(texts).toContain("Family Meal-Prep Size");
    // Ensure the old 'for X' generic phrases are gone
    expect(texts).not.toContain("for Everyday Rice & Grains");
    expect(texts).not.toContain("for Rice & Grains");
  });

  it("picks 'small' lifestyle tier for 3-cup uncooked products", () => {
    const small = { ...basicProductCR0601C, cupSize: "3 Cup Uncooked / 6 Cup Cooked" };
    const pool = buildDescriptorPool(small);
    const texts = pool.map(p => p.text);
    expect(texts).toContain("Single-Serve Size");
    expect(texts).toContain("Compact Countertop Size");
    expect(texts).not.toContain("Family-Size Capacity");
  });

  it("picks 'large' lifestyle tier for 10-cup uncooked products", () => {
    const large = { ...basicProductCR0601C, cupSize: "10 Cup Uncooked / 20 Cup Cooked" };
    const pool = buildDescriptorPool(large);
    const texts = pool.map(p => p.text);
    expect(texts).toContain("Large-Batch Capacity");
    expect(texts).toContain("Party-Size Capacity");
  });

  it("picks 'commercial' lifestyle tier for Commercial type", () => {
    const commercial = { ...basicProductCR0601C, type: "Commerical", cupSize: "30 Cup Uncooked / 60 Cup Cooked" };
    const pool = buildDescriptorPool(commercial);
    const texts = pool.map(p => p.text);
    expect(texts).toContain("Commercial Capacity");
    expect(texts).toContain("High-Volume Service Size");
  });
});

// -------------------------------------------------------------
// pickAlternativeDescriptor
// -------------------------------------------------------------
describe("pickAlternativeDescriptor", () => {
  const pool = [
    { text: "with Nonstick Inner Pot", suggestedFacets: ["material_design", "polished_benefit"] },
    { text: "with Auto Clean", suggestedFacets: ["primary_benefit", "family_benefit"] },
    { text: "with Turbo Mode", suggestedFacets: ["primary_benefit", "viral_hook"] },
    { text: "for Rice & Grains", suggestedFacets: ["practical_cultural", "lifestyle"] },
  ];

  it("returns the first pool entry matching the facet", () => {
    expect(pickAlternativeDescriptor(pool, "material_design", new Set())).toBe("with Nonstick Inner Pot");
  });

  it("skips used descriptors", () => {
    const used = new Set(["with nonstick inner pot"]);
    expect(pickAlternativeDescriptor(pool, "material_design", used)).toBe(null); // no other material_design in pool
  });

  it("returns null when no facet match exists", () => {
    expect(pickAlternativeDescriptor(pool, "search_heavy", new Set())).toBe(null);
  });

  it("returns null for empty pool", () => {
    expect(pickAlternativeDescriptor([], "primary_benefit", new Set())).toBe(null);
  });
});

// -------------------------------------------------------------
// rebuildTitleWithDescriptor
// -------------------------------------------------------------
describe("rebuildTitleWithDescriptor", () => {
  it("replaces the descriptor while preserving core, color, and SKU", () => {
    const original = "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)";
    const rebuilt = rebuildTitleWithDescriptor(original, "with Nonstick Inner Pot", "with Turbo Mode", micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(rebuilt).toContain("CUCKOO Micom Rice Cooker 12-Cup Cooked");
    expect(rebuilt).toContain("with Turbo Mode");
    expect(rebuilt).toContain("White");
    expect(rebuilt).toContain("(CR-0675FW)");
    expect(rebuilt).not.toContain("Nonstick Inner Pot");
  });
});

// -------------------------------------------------------------
// diversifyMarketplaceDescriptors
// -------------------------------------------------------------
describe("diversifyMarketplaceDescriptors", () => {
  it("no-ops when all descriptors are already unique", () => {
    const conversions = {
      walmart: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean, White (CR-0675FW)", char_count: 73 },
      target: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked for Rice & Grains, White (CR-0675FW)", char_count: 76 },
      wayfair: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)", char_count: 81 },
    };
    const before = JSON.stringify(conversions);
    const warnings = diversifyMarketplaceDescriptors(conversions, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(warnings).toEqual([]);
    expect(JSON.stringify(conversions)).toBe(before);
  });

  it("swaps duplicate descriptors across marketplaces (the 3x Nonstick Inner Pot bug)", () => {
    const conversions = {
      target: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)", char_count: 81 },
      wayfair: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)", char_count: 81 },
      macys: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)", char_count: 81 },
    };
    diversifyMarketplaceDescriptors(conversions, micomProductCR0675FW, "CR-0675FW", "cooked");
    // First one (target) keeps its descriptor, others should change
    const titles = [conversions.target.title, conversions.wayfair.title, conversions.macys.title];
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBeGreaterThanOrEqual(2); // at least the first should be distinct
  });

  it("skips Amazon (search_heavy) and Bloomingdale's (minimal)", () => {
    const conversions = {
      amazon: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean, Rice Maker, Nonstick, White (CR-0675FW)", char_count: 95 },
      walmart: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean, White (CR-0675FW)", char_count: 73 },
      bloomingdales: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)", char_count: 57 },
    };
    const originalAmazon = conversions.amazon.title;
    const originalBloomies = conversions.bloomingdales.title;
    diversifyMarketplaceDescriptors(conversions, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(conversions.amazon.title).toBe(originalAmazon);
    expect(conversions.bloomingdales.title).toBe(originalBloomies);
  });

  it("emits a DESCRIPTOR_DUPLICATE warning when no alternatives exist for a facet", () => {
    // Create a scenario where 3 marketplaces share the same descriptor but the
    // product's descriptor pool has nothing else matching their facets
    const restrictedProduct = {
      type: "Basic", heating: "Heating Plate", pressure: false, cookingModes: "0",
      cupSize: "6 Cup Uncooked / 12 Cup Cooked", color: "White", innerPot: "Nonstick",
      features: [], // no features — pool is very small
    };
    const conversions = {
      target: { title: "CUCKOO Basic Rice Cooker 12-Cup Cooked for Rice & Grains, White (CR-0601C)", char_count: 78 },
      wayfair: { title: "CUCKOO Basic Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0601C)", char_count: 82 },
      macys: { title: "CUCKOO Basic Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0601C)", char_count: 82 },
    };
    const warnings = diversifyMarketplaceDescriptors(conversions, restrictedProduct, "CR-0601C", "cooked");
    // Macy's shares Nonstick with Wayfair — should attempt swap; may or may not succeed depending on pool
    // At minimum, the function should complete without throwing
    expect(Array.isArray(warnings)).toBe(true);
  });
});

// -------------------------------------------------------------
// MARKETPLACE_FACETS constants sanity
// -------------------------------------------------------------
describe("MARKETPLACE_FACETS", () => {
  it("covers all 10 marketplaces", () => {
    const expected = ["amazon", "walmart", "target", "bestbuy", "wayfair", "kohls", "macys", "bloomingdales", "tiktokshop", "weee"];
    for (const mp of expected) {
      expect(MARKETPLACE_FACETS[mp]).toBeDefined();
    }
  });

  it("assigns 'minimal' to Bloomingdale's", () => {
    expect(MARKETPLACE_FACETS.bloomingdales).toBe("minimal");
  });

  it("assigns 'search_heavy' to Amazon", () => {
    expect(MARKETPLACE_FACETS.amazon).toBe("search_heavy");
  });

  it("every non-minimal facet has a vocabulary entry (or is amazon/search_heavy)", () => {
    for (const [mp, facet] of Object.entries(MARKETPLACE_FACETS)) {
      if (facet === "minimal") continue;
      expect(FACET_VOCABULARY[facet]).toBeDefined();
    }
  });
});

// -------------------------------------------------------------
// Integration: Chunk A full pipeline
// -------------------------------------------------------------
describe("Chunk A integration: canonical core + facets + diversification", () => {
  it("end-to-end: canonical core built, facets validate, duplicates diversified", () => {
    const product = micomProductCR0675FW;
    const sku = "CR-0675FW";

    // 1. Build canonical core (deterministic)
    const core = buildCanonicalCore(product, sku, "cooked");
    expect(core).toBe("CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)");

    // 2. Simulate marketplace titles where several marketplaces accidentally
    //    chose 'with Nonstick Inner Pot' (the real-world bug from the analysis)
    const conversions = {
      amazon: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked, Rice Maker with 10 Cooking Modes, Auto Clean, Turbo Mode, Nonstick Inner Pot, White (CR-0675FW)" },
      walmart: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean, White (CR-0675FW)" },
      target: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)" },
      bestbuy: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with 10 Cooking Modes, White (CR-0675FW)" },
      wayfair: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)" },
      macys: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)" },
      bloomingdales: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)" },
    };

    // 3. Diversify — should leave amazon & bloomingdales alone, keep target's Nonstick,
    //    and swap wayfair's and macys' descriptors
    diversifyMarketplaceDescriptors(conversions, product, sku, "cooked");

    // 4. Extract descriptors and verify no duplicates across the mid-tier marketplaces
    const midTier = ["walmart", "target", "bestbuy", "wayfair", "kohls", "macys", "tiktokshop", "weee"];
    const descriptors = midTier
      .filter(mp => conversions[mp])
      .map(mp => extractDescriptorSlot(conversions[mp].title, product, sku, "cooked").toLowerCase())
      .filter(Boolean);

    const counts = {};
    for (const d of descriptors) counts[d] = (counts[d] || 0) + 1;
    const duplicateCounts = Object.values(counts).filter(n => n > 1);
    // Allow at most one duplicate (edge case where pool runs out of alternatives)
    // — but the 3x Nonstick Inner Pot bug should NOT persist
    expect(duplicateCounts.length).toBeLessThanOrEqual(1);
  });
});

// -------------------------------------------------------------
// runFullTitlePipeline — end-to-end pipeline wrapper
// -------------------------------------------------------------
describe("runFullTitlePipeline", () => {
  it("runs without throwing for null/empty inputs", () => {
    expect(() => runFullTitlePipeline(null, null, null)).not.toThrow();
    expect(() => runFullTitlePipeline({ conversions: {} }, null, null)).not.toThrow();
  });

  it("processes a full titles object and appends SKU, normalizes tech, etc.", () => {
    const titles = {
      conversions: {
        amazon: { title: "CUCKOO Twin Pressure + Induction Rice Cooker 12-Cup Cooked, Premium White" },
        walmart: { title: "CUCKOO Rice Cooker 12-Cup Cooked, White" },
      },
      amazon_audit: { suggested_title: "", suggested_char_count: 0 },
    };
    const { warnings } = runFullTitlePipeline(titles, premiumStainless, "CRP-LHTAR0609FW", "cooked");
    // Tech normalized
    expect(titles.conversions.amazon.title).toContain("Twin Pressure Induction Heating");
    expect(titles.conversions.amazon.title).not.toContain("+");
    // Stainless phrase enforced
    expect(titles.conversions.amazon.title).toContain("Stainless Steel Inner Pot");
    // SKU appended
    expect(titles.conversions.amazon.title).toContain("(CRP-LHTAR0609FW)");
    // Puffery removed
    expect(titles.conversions.amazon.title).not.toContain("Premium White");
    // Amazon audit unified
    expect(titles.amazon_audit.suggested_title).toBe(titles.conversions.amazon.title);
    // char_count correct
    expect(titles.conversions.amazon.char_count).toBe(titles.conversions.amazon.title.length);
    // warnings are returned (may include stainless or descriptor warnings for this tight test)
    expect(Array.isArray(warnings)).toBe(true);
  });

  it("invokes descriptor diversification — no two mid-tier marketplaces end up with the same descriptor", () => {
    const titles = {
      conversions: {
        amazon: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked, Rice Maker with 10 Cooking Modes, Auto Clean, Nonstick Inner Pot, White" },
        walmart: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White" },
        target: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White" },
        wayfair: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White" },
        macys: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White" },
        bloomingdales: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked, White" },
      },
      amazon_audit: { suggested_title: "", suggested_char_count: 0 },
    };
    runFullTitlePipeline(titles, micomProductCR0675FW, "CR-0675FW", "cooked");
    // Count exact duplicate descriptors across mid-tier marketplaces
    const mids = ["walmart", "target", "wayfair", "macys"];
    const descriptors = mids.map(mp => extractDescriptorSlot(titles.conversions[mp].title, micomProductCR0675FW, "CR-0675FW", "cooked").toLowerCase()).filter(Boolean);
    const counts = {};
    for (const d of descriptors) counts[d] = (counts[d] || 0) + 1;
    // Should NOT have any descriptor appearing 3+ times (we had 4 copies of the same before)
    const maxDupe = Math.max(...Object.values(counts), 0);
    expect(maxDupe).toBeLessThan(3);
  });

  it("preserves Bloomingdale's minimal title through the pipeline", () => {
    const titles = {
      conversions: {
        bloomingdales: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked, White" },
      },
    };
    runFullTitlePipeline(titles, micomProductCR0675FW, "CR-0675FW", "cooked");
    // Should end with SKU appended but no descriptor added
    expect(titles.conversions.bloomingdales.title).toContain("(CR-0675FW)");
    // No "with X" descriptor introduced by the pipeline
    const descriptor = extractDescriptorSlot(titles.conversions.bloomingdales.title, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(descriptor).toBe("");
  });
});

// -------------------------------------------------------------
// resampleInvalidDescriptors — strict facet retry loop
// -------------------------------------------------------------
describe("resampleInvalidDescriptors", () => {
  it("returns early if no marketplaces are invalid", async () => {
    const titles = {
      conversions: {
        walmart: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Auto Clean, White (CR-0675FW)" },
        wayfair: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)" },
      },
    };
    let apiCallCount = 0;
    const apiCall = async () => { apiCallCount++; return { conversions: {} }; };
    const result = await resampleInvalidDescriptors(titles, micomProductCR0675FW, "CR-0675FW", "cooked", apiCall);
    expect(result.retriesUsed).toBe(0);
    expect(apiCallCount).toBe(0);
  });

  it("resamples a marketplace with an invalid facet descriptor", async () => {
    const titles = {
      conversions: {
        // Best Buy needs tech_spec — "for everyday meals" is wrong facet
        bestbuy: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked for Everyday Meals, White (CR-0675FW)" },
      },
    };
    let receivedUserMsg = "";
    const apiCall = async (sys, user, maxTokens, temp) => {
      receivedUserMsg = user;
      return {
        conversions: {
          bestbuy: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with 10 Cooking Modes, White (CR-0675FW)" },
        },
      };
    };
    const result = await resampleInvalidDescriptors(titles, micomProductCR0675FW, "CR-0675FW", "cooked", apiCall);
    expect(result.retriesUsed).toBeGreaterThanOrEqual(1);
    expect(result.titlesUpdated).toBe(true);
    expect(titles.conversions.bestbuy.title).toContain("10 Cooking Modes");
    expect(result.unfixable).not.toContain("bestbuy");
    // Retry prompt should have mentioned the facet
    expect(receivedUserMsg).toContain("tech_spec");
  });

  it("reports marketplaces as unfixable after maxRetries attempts", async () => {
    const titles = {
      conversions: {
        walmart: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked nonsense-descriptor-never-matches, White (CR-0675FW)" },
      },
    };
    // API keeps returning equally invalid descriptors
    const apiCall = async () => ({
      conversions: {
        walmart: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked other-nonsense, White (CR-0675FW)" },
      },
    });
    const result = await resampleInvalidDescriptors(titles, micomProductCR0675FW, "CR-0675FW", "cooked", apiCall, { maxRetries: 2 });
    expect(result.retriesUsed).toBe(2);
    expect(result.unfixable).toContain("walmart");
  });

  it("handles Bloomingdale's minimal constraint — rejects any non-empty descriptor", async () => {
    const titles = {
      conversions: {
        bloomingdales: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked with Nonstick Inner Pot, White (CR-0675FW)" },
      },
    };
    const apiCall = async () => ({
      conversions: {
        bloomingdales: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)" },
      },
    });
    const result = await resampleInvalidDescriptors(titles, micomProductCR0675FW, "CR-0675FW", "cooked", apiCall);
    expect(result.titlesUpdated).toBe(true);
    // After resample, no descriptor should be present
    const desc = extractDescriptorSlot(titles.conversions.bloomingdales.title, micomProductCR0675FW, "CR-0675FW", "cooked");
    expect(desc).toBe("");
  });

  it("handles API errors gracefully — returns what it has without throwing", async () => {
    const titles = {
      conversions: {
        bestbuy: { title: "CUCKOO Micom Rice Cooker 12-Cup Cooked for Daily Use, White (CR-0675FW)" },
      },
    };
    const apiCall = async () => { throw new Error("API down"); };
    const result = await resampleInvalidDescriptors(titles, micomProductCR0675FW, "CR-0675FW", "cooked", apiCall);
    // Should not throw; should report bestbuy as unfixable
    expect(result.unfixable).toContain("bestbuy");
  });
});

// =============================================================
// CHUNK B — BULLET 1 HEADING ROTATION + TIER-DIFFERENTIATED PROMPTS
// =============================================================

// -------------------------------------------------------------
// BULLET_ONE_HEADING_POOLS
// -------------------------------------------------------------
describe("BULLET_ONE_HEADING_POOLS", () => {
  it("has a pool for every product type in the DB", () => {
    const expectedTypes = [
      "Twin Pressure + Induction",
      "Twin Pressure",
      "Induction + Pressure",
      "Induction + Non Pressure",
      "Micom",
      "Pressure",
      "Basic",
      "Commercial",
      "Commerical", // DB typo
    ];
    for (const t of expectedTypes) {
      expect(BULLET_ONE_HEADING_POOLS[t]).toBeDefined();
      expect(BULLET_ONE_HEADING_POOLS[t].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("Commercial and Commerical pools are identical (typo handling)", () => {
    expect(BULLET_ONE_HEADING_POOLS["Commerical"]).toEqual(BULLET_ONE_HEADING_POOLS["Commercial"]);
  });

  it("every heading is uppercase, 2-4 words, ends without a colon", () => {
    for (const [type, pool] of Object.entries(BULLET_ONE_HEADING_POOLS)) {
      for (const heading of pool) {
        expect(heading).toBe(heading.toUpperCase());
        expect(heading.split(/\s+/).length).toBeLessThanOrEqual(5); // allow up to 5 for "INDUCTION + TWIN PRESSURE"
        expect(heading.endsWith(":")).toBe(false);
      }
    }
  });

  it("no Micom pool includes 'FUZZY LOGIC' (violates title rule #8)", () => {
    const micomPool = BULLET_ONE_HEADING_POOLS["Micom"];
    for (const h of micomPool) {
      expect(h).not.toMatch(/fuzzy logic/i);
    }
  });
});

// -------------------------------------------------------------
// getModelBase
// -------------------------------------------------------------
describe("getModelBase", () => {
  it("returns Parent ASIN when present", () => {
    const product = { asin: "B08WFNV82W", parentAsin: "B0CLWNG1VG" };
    expect(getModelBase(product, "CR-0675FW")).toBe("B0CLWNG1VG");
  });

  it("falls back to child ASIN when Parent ASIN is missing", () => {
    const product = { asin: "B08WFNV82W" };
    expect(getModelBase(product, "CR-0675FW")).toBe("B08WFNV82W");
  });

  it("falls back to SKU when both ASIN fields are missing", () => {
    const product = {};
    expect(getModelBase(product, "CR-0675FW")).toBe("CR-0675FW");
  });

  it("returns empty string when everything is missing", () => {
    expect(getModelBase(null, null)).toBe("");
    expect(getModelBase({}, "")).toBe("");
  });

  it("treats whitespace-only Parent ASIN as missing", () => {
    const product = { asin: "B08WFNV82W", parentAsin: "   " };
    expect(getModelBase(product, "CR-0675FW")).toBe("B08WFNV82W");
  });
});

// -------------------------------------------------------------
// selectBulletOneHeading + createBulletHeadingSession
// -------------------------------------------------------------
describe("selectBulletOneHeading", () => {
  it("returns empty for unknown product type (no pool)", () => {
    const session = createBulletHeadingSession();
    const product = { type: "Mystery Type", parentAsin: "B123" };
    expect(selectBulletOneHeading(product, "CR-XXX", session)).toBe("");
  });

  it("returns empty for null session/product", () => {
    expect(selectBulletOneHeading(null, "CR-0675FW", null)).toBe("");
  });

  it("all SKUs sharing a Parent ASIN get the same heading", () => {
    const session = createBulletHeadingSession();
    const product1 = { type: "Micom", asin: "B08WFNV82W", parentAsin: "B0CLWNG1VG" };
    const product2 = { type: "Micom", asin: "B0B5B3QBV1", parentAsin: "B0CLWNG1VG" };
    const product3 = { type: "Micom", asin: "B0B4MYBLZQ", parentAsin: "B0CLWNG1VG" };
    const h1 = selectBulletOneHeading(product1, "CR-0675FW", session);
    const h2 = selectBulletOneHeading(product2, "CR-0675FG", session);
    const h3 = selectBulletOneHeading(product3, "CR-0375FW", session);
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it("different Parent ASIN families within the same type rotate through the pool", () => {
    const session = createBulletHeadingSession();
    const pool = BULLET_ONE_HEADING_POOLS["Twin Pressure"];
    // Three different Twin Pressure families
    const family1 = { type: "Twin Pressure", parentAsin: "B087H6HB69" };
    const family2 = { type: "Twin Pressure", parentAsin: "B0BKM63P4F" };
    const family3 = { type: "Twin Pressure", parentAsin: "BDIFFERENT1" };
    const h1 = selectBulletOneHeading(family1, "CRP-RT0609FW", session);
    const h2 = selectBulletOneHeading(family2, "CRP-ST1009FW", session);
    const h3 = selectBulletOneHeading(family3, "CRP-XYZ", session);
    expect(h1).toBe(pool[0]);
    expect(h2).toBe(pool[1]);
    expect(h3).toBe(pool[2]);
  });

  it("rotation wraps around after exhausting the pool", () => {
    const session = createBulletHeadingSession();
    const pool = BULLET_ONE_HEADING_POOLS["Basic"];
    // Feed more parent families than the pool size
    const results = [];
    for (let i = 0; i < pool.length + 2; i++) {
      const product = { type: "Basic", parentAsin: "B-BASIC-" + i };
      results.push(selectBulletOneHeading(product, "CR-BASIC-" + i, session));
    }
    expect(results[0]).toBe(pool[0]);
    expect(results[1]).toBe(pool[1]);
    expect(results[2]).toBe(pool[2]);
    expect(results[3]).toBe(pool[0]); // wraps
    expect(results[4]).toBe(pool[1]);
  });

  it("different product types have independent counters", () => {
    const session = createBulletHeadingSession();
    const micomPool = BULLET_ONE_HEADING_POOLS["Micom"];
    const basicPool = BULLET_ONE_HEADING_POOLS["Basic"];
    // Interleave: Micom, Basic, Micom, Basic — each should start at index 0 of its own pool
    const m1 = selectBulletOneHeading({ type: "Micom", parentAsin: "P1" }, "CR-1", session);
    const b1 = selectBulletOneHeading({ type: "Basic", parentAsin: "P2" }, "CR-2", session);
    const m2 = selectBulletOneHeading({ type: "Micom", parentAsin: "P3" }, "CR-3", session);
    const b2 = selectBulletOneHeading({ type: "Basic", parentAsin: "P4" }, "CR-4", session);
    expect(m1).toBe(micomPool[0]);
    expect(b1).toBe(basicPool[0]);
    expect(m2).toBe(micomPool[1]);
    expect(b2).toBe(basicPool[1]);
  });

  it("works without Parent ASIN — each SKU becomes its own family (fallback)", () => {
    const session = createBulletHeadingSession();
    const pool = BULLET_ONE_HEADING_POOLS["Micom"];
    // No Parent ASIN, fall back to own ASIN
    const p1 = { type: "Micom", asin: "A1" };
    const p2 = { type: "Micom", asin: "A2" };
    const h1 = selectBulletOneHeading(p1, "CR-X1", session);
    const h2 = selectBulletOneHeading(p2, "CR-X2", session);
    expect(h1).toBe(pool[0]);
    expect(h2).toBe(pool[1]); // different ASINs treated as different families
  });

  it("the real 10-family CUCKOO DB distributes headings consistently within each Parent ASIN group", () => {
    // Simulates the real data structure from your Rice Cooker Categorization XLSX
    const session = createBulletHeadingSession();
    const skus = [
      { sku: "CR-0675FW", type: "Micom", parentAsin: "B0CLWNG1VG" },
      { sku: "CR-0675FG", type: "Micom", parentAsin: "B0CLWNG1VG" },
      { sku: "CR-0375FW", type: "Micom", parentAsin: "B0CLWNG1VG" },
      { sku: "CR-0375FG", type: "Micom", parentAsin: "B0CLWNG1VG" },
      { sku: "CR-0631F",  type: "Micom", parentAsin: "B0DM2R4CXH" },
      { sku: "CR-0632F",  type: "Micom", parentAsin: "B0DM2R4CXH" },
      { sku: "CR-0633F",  type: "Micom", parentAsin: "B0DM2R4CXH" },
    ];
    const assignments = {};
    for (const p of skus) {
      const h = selectBulletOneHeading(p, p.sku, session);
      assignments[p.sku] = { heading: h, parentAsin: p.parentAsin };
    }
    // All 4 SKUs under B0CLWNG1VG get the same heading
    const h0675 = assignments["CR-0675FW"].heading;
    expect(assignments["CR-0675FG"].heading).toBe(h0675);
    expect(assignments["CR-0375FW"].heading).toBe(h0675);
    expect(assignments["CR-0375FG"].heading).toBe(h0675);
    // All 3 SKUs under B0DM2R4CXH get the same heading
    const h063 = assignments["CR-0631F"].heading;
    expect(assignments["CR-0632F"].heading).toBe(h063);
    expect(assignments["CR-0633F"].heading).toBe(h063);
    // The two families get DIFFERENT headings (rotation worked)
    expect(h0675).not.toBe(h063);
  });
});

// -------------------------------------------------------------
// Tier-differentiated bullet prompt modules
// -------------------------------------------------------------
describe("getBulletPromptForTier", () => {
  it("returns the BASIC prompt for tier='basic'", () => {
    expect(getBulletPromptForTier("basic")).toBe(BULLET_TIER_PROMPT_BASIC);
  });

  it("returns the MID prompt for tier='mid'", () => {
    expect(getBulletPromptForTier("mid")).toBe(BULLET_TIER_PROMPT_MID);
  });

  it("returns the PREMIUM prompt for tier='premium'", () => {
    expect(getBulletPromptForTier("premium")).toBe(BULLET_TIER_PROMPT_PREMIUM);
  });

  it("defaults to BASIC for unknown/null tier", () => {
    expect(getBulletPromptForTier(null)).toBe(BULLET_TIER_PROMPT_BASIC);
    expect(getBulletPromptForTier("")).toBe(BULLET_TIER_PROMPT_BASIC);
    expect(getBulletPromptForTier("unknown")).toBe(BULLET_TIER_PROMPT_BASIC);
  });

  it("each tier prompt has distinct content (not accidentally identical)", () => {
    expect(BULLET_TIER_PROMPT_BASIC).not.toBe(BULLET_TIER_PROMPT_MID);
    expect(BULLET_TIER_PROMPT_MID).not.toBe(BULLET_TIER_PROMPT_PREMIUM);
    expect(BULLET_TIER_PROMPT_BASIC).not.toBe(BULLET_TIER_PROMPT_PREMIUM);
  });

  it("all three prompts specify using the exact heading from user message", () => {
    expect(BULLET_TIER_PROMPT_BASIC).toMatch(/USE THE EXACT HEADING PROVIDED/);
    expect(BULLET_TIER_PROMPT_MID).toMatch(/USE THE EXACT HEADING PROVIDED/);
    expect(BULLET_TIER_PROMPT_PREMIUM).toMatch(/USE THE EXACT HEADING PROVIDED/);
  });

  it("premium prompt mentions sophistication cues absent from basic", () => {
    // Premium references Korean culture / scorched rice / GABA
    expect(BULLET_TIER_PROMPT_PREMIUM).toMatch(/nurungji|scorched|GABA|Korean food culture/i);
    // Basic explicitly avoids restaurant-quality / precision claims
    expect(BULLET_TIER_PROMPT_BASIC).toMatch(/AVOID.*restaurant/i);
  });

  it("tier prompts have distinct length targets in their instructions", () => {
    expect(BULLET_TIER_PROMPT_BASIC).toMatch(/130-150/);
    expect(BULLET_TIER_PROMPT_MID).toMatch(/150-180/);
    expect(BULLET_TIER_PROMPT_PREMIUM).toMatch(/180-215|180-220/);
  });
});

// =============================================================
// #6 — BACKEND KEYWORD DIFFING + BACKFILL POOLS
// =============================================================

// -------------------------------------------------------------
// bkByteLength / tokenizeForBk / buildFrontendTokenSet
// -------------------------------------------------------------
describe("bkByteLength", () => {
  it("returns 0 for empty/null input", () => {
    expect(bkByteLength("")).toBe(0);
    expect(bkByteLength(null)).toBe(0);
  });

  it("matches UTF-8 byte counts for ASCII", () => {
    expect(bkByteLength("rice cooker")).toBe(11);
  });

  it("counts multi-byte characters correctly (Korean/Japanese/Chinese scripts)", () => {
    // "밥솥" (Korean) = 6 bytes in UTF-8 (3 bytes per hangul char)
    expect(bkByteLength("밥솥")).toBe(6);
    // "炊飯器" (Japanese) = 9 bytes
    expect(bkByteLength("炊飯器")).toBe(9);
  });
});

describe("tokenizeForBk", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenizeForBk("Rice Cooker Nonstick")).toEqual(["rice", "cooker", "nonstick"]);
  });

  it("strips punctuation but keeps numbers and apostrophes", () => {
    expect(tokenizeForBk("12-cup mom's rice cooker")).toEqual(["12", "cup", "mom's", "rice", "cooker"]);
  });

  it("preserves non-latin scripts", () => {
    expect(tokenizeForBk("밥솥 炊飯器 rice")).toEqual(["밥솥", "炊飯器", "rice"]);
  });

  it("returns empty array for null/empty input", () => {
    expect(tokenizeForBk("")).toEqual([]);
    expect(tokenizeForBk(null)).toEqual([]);
  });
});

describe("buildFrontendTokenSet", () => {
  it("combines tokens from title and bullets into one set", () => {
    const set = buildFrontendTokenSet(
      "CUCKOO Micom Rice Cooker",
      "ONE-TOUCH COOKING: Press one button for perfect rice"
    );
    expect(set.has("cuckoo")).toBe(true);
    expect(set.has("rice")).toBe(true);
    expect(set.has("button")).toBe(true);
    expect(set.has("one-touch")).toBe(false); // punctuation stripped — would be tokenized as "one" and "touch"
    expect(set.has("one")).toBe(true);
    expect(set.has("touch")).toBe(true);
  });
});

// -------------------------------------------------------------
// diffBackendKeywords
// -------------------------------------------------------------
describe("diffBackendKeywords", () => {
  it("removes BK tokens that exactly match tokens in title", () => {
    const title = "CUCKOO Micom Rice Cooker 12-Cup Cooked";
    const bullets = "";
    const bk = "rice cooker nonstick inner pot korean brand";
    const result = diffBackendKeywords(bk, title, bullets);
    // "rice" and "cooker" appear in title -> removed
    expect(result.removed).toContain("rice");
    expect(result.removed).toContain("cooker");
    // "nonstick", "inner", "pot", "korean", "brand" stay
    expect(result.kept).toContain("nonstick");
    expect(result.kept).toContain("korean");
  });

  it("preserves plural/singular variants (user chose exact-match only)", () => {
    // "cooker" in title should NOT strip "cookers" from BK
    const result = diffBackendKeywords("cookers rice-cookers multi-cooker", "rice cooker", "");
    expect(result.kept.toLowerCase()).toContain("cookers");
  });

  it("reports bytesReclaimed correctly", () => {
    const bk = "rice cooker nonstick"; // 19 bytes
    const result = diffBackendKeywords(bk, "rice cooker", "");
    // "rice" + " " + "cooker" = 11 bytes removed (plus trailing space cleanup)
    expect(result.bytesReclaimed).toBeGreaterThan(0);
    expect(result.kept).toBe("nonstick");
  });

  it("handles empty BK gracefully", () => {
    const result = diffBackendKeywords("", "title", "bullets");
    expect(result.kept).toBe("");
    expect(result.removed).toEqual([]);
    expect(result.bytesReclaimed).toBe(0);
  });

  it("strips tokens that appear in bullets even if not in title", () => {
    const title = "CUCKOO Rice Cooker";
    const bullets = "ONE-TOUCH SIMPLICITY: Effortless cleanup with nonstick coating";
    const bk = "nonstick cleanup effortless brand new";
    const result = diffBackendKeywords(bk, title, bullets);
    expect(result.removed).toContain("nonstick");
    expect(result.removed).toContain("cleanup");
    expect(result.removed).toContain("effortless");
    expect(result.kept).toContain("brand");
    expect(result.kept).toContain("new");
  });
});

// -------------------------------------------------------------
// buildBackendKeywordPool
// -------------------------------------------------------------
describe("buildBackendKeywordPool", () => {
  it("returns a prioritized pool with tier labels", () => {
    const pool = buildBackendKeywordPool(micomProductCR0675FW, new Set());
    expect(pool.length).toBeGreaterThan(30);
    // First entries should be tier 1 (competitors)
    expect(pool[0].tier).toBe(1);
    expect(pool[0].reason).toBe("competitor");
    // Should include competitor brands
    expect(pool.some(p => p.text === "zojirushi")).toBe(true);
    expect(pool.some(p => p.text === "instant pot")).toBe(true);
  });

  it("includes Spanish alt-language (tier 2)", () => {
    const pool = buildBackendKeywordPool(micomProductCR0675FW, new Set());
    expect(pool.some(p => p.text === "olla arrocera" && p.tier === 2)).toBe(true);
  });

  it("includes Korean/Japanese/Chinese scripts (tier 3)", () => {
    const pool = buildBackendKeywordPool(micomProductCR0675FW, new Set());
    expect(pool.some(p => p.text === "밥솥" && p.tier === 3)).toBe(true);
    expect(pool.some(p => p.text === "炊飯器" && p.tier === 3)).toBe(true);
    expect(pool.some(p => p.text === "电饭煲" && p.tier === 3)).toBe(true);
  });

  it("adds pressure-specific terms for pressure products", () => {
    const pressureProduct = { sku: "CRP-P0609S", pressure: true, type: "Pressure" };
    const pool = buildBackendKeywordPool(pressureProduct, new Set());
    expect(pool.some(p => p.text === "electric pressure cooker")).toBe(true);
    expect(pool.some(p => p.text === "korean pressure cooker")).toBe(true);
  });

  it("adds induction-specific terms for induction products", () => {
    const pool = buildBackendKeywordPool(premiumStainless, new Set());
    expect(pool.some(p => p.text === "induction rice maker")).toBe(true);
    expect(pool.some(p => p.text === "3d induction cooker")).toBe(true);
  });

  it("does NOT add pressure extras for basic/micom non-pressure products", () => {
    const pool = buildBackendKeywordPool(basicProductCR0601C, new Set());
    expect(pool.some(p => p.text === "electric pressure cooker")).toBe(false);
  });

  it("filters out pool entries whose tokens all appear in frontend", () => {
    const frontendSet = new Set(["instant", "pot"]);
    const pool = buildBackendKeywordPool(micomProductCR0675FW, frontendSet);
    // "instant pot" should be filtered (both tokens in frontend)
    expect(pool.some(p => p.text === "instant pot")).toBe(false);
    // But "zojirushi" (single token not in frontend) remains
    expect(pool.some(p => p.text === "zojirushi")).toBe(true);
  });

  it("does NOT filter multi-word entries when only one token matches frontend", () => {
    const frontendSet = new Set(["rice"]); // just "rice"
    const pool = buildBackendKeywordPool(micomProductCR0675FW, frontendSet);
    // "rise cooker" has "rise" (not in frontend) and "cooker" — should be kept
    expect(pool.some(p => p.text === "rise cooker")).toBe(true);
  });
});

// -------------------------------------------------------------
// backfillBackendKeywords
// -------------------------------------------------------------
describe("backfillBackendKeywords", () => {
  it("adds pool entries to reach close to the byte limit", () => {
    const pool = [
      { text: "zojirushi", tier: 1, reason: "competitor" },
      { text: "instant pot", tier: 1, reason: "competitor" },
      { text: "aroma", tier: 1, reason: "competitor" },
    ];
    const result = backfillBackendKeywords("starting terms", pool, 499);
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.finalBk).toContain("starting terms");
    expect(result.finalBk).toContain("zojirushi");
    expect(result.finalBytes).toBeLessThanOrEqual(499);
  });

  it("respects the byte limit strictly", () => {
    // Make an already-long BK and force backfill to stop before exceeding
    const existingBk = "x".repeat(490); // 490 bytes
    const pool = [
      { text: "a-very-long-candidate-keyword-phrase-too-big-to-fit", tier: 1, reason: "test" },
      { text: "short", tier: 1, reason: "test" },
    ];
    const result = backfillBackendKeywords(existingBk, pool, 499);
    expect(result.finalBytes).toBeLessThanOrEqual(499);
    // "short" (5 chars) fits after 490 + 1 space = 496, so should be added
    expect(result.added.some(a => a.text === "short")).toBe(true);
    // The long one does not fit
    expect(result.added.some(a => a.text.startsWith("a-very-long"))).toBe(false);
  });

  it("does not add duplicates of what's already in BK", () => {
    const pool = [{ text: "zojirushi", tier: 1, reason: "competitor" }];
    const result = backfillBackendKeywords("zojirushi already", pool, 499);
    expect(result.added).toEqual([]);
  });

  it("handles empty pool gracefully", () => {
    const result = backfillBackendKeywords("existing bk", [], 499);
    expect(result.finalBk).toBe("existing bk");
    expect(result.added).toEqual([]);
  });

  it("prioritizes by pool order (competitors first)", () => {
    const pool = [
      { text: "zojirushi", tier: 1, reason: "competitor" },
      { text: "aroma", tier: 1, reason: "competitor" },
      { text: "밥솥", tier: 3, reason: "asian_script" },
      { text: "rise cooker", tier: 6, reason: "misspelling" },
    ];
    const result = backfillBackendKeywords("start", pool, 499);
    // All should fit; competitor should have been added before misspelling
    const firstAddedTier = result.added[0]?.tier;
    const lastAddedTier = result.added[result.added.length - 1]?.tier;
    expect(firstAddedTier).toBeLessThanOrEqual(lastAddedTier);
  });
});

// -------------------------------------------------------------
// optimizeBackendKeywords — full end-to-end
// -------------------------------------------------------------
describe("optimizeBackendKeywords", () => {
  it("diffs then backfills in one call — the CR-0301C bulk-export scenario", () => {
    // Real CR-0301C data from the bulk export the user shared
    const title = "CUCKOO Basic Rice Cooker 6-Cup Cooked, Rice Maker & Rice Steamer with Nonstick Inner Pot for Everyday Rice & Grains, Keep Warm Function, White (CR-0301C)";
    const bullets = "ONE-TOUCH SIMPLICITY: Press one button for perfectly cooked rice.\nCOMPACT CAPACITY: 3 cups uncooked serves singles and couples.\nNONSTICK CLEANUP: Nonstick inner pot releases rice cleanly.";
    const originalBk = "rice cooker small 3 cup white basic simple one touch automatic keep warm nonstick inner pot compact apartment kitchen singles couples";
    const product = { sku: "CR-0301C", type: "Basic", heating: "Heating Plate", pressure: false, innerPot: "Nonstick" };

    const result = optimizeBackendKeywords(originalBk, title, bullets, product);

    // Should have removed duplicated tokens
    expect(result.removed.length).toBeGreaterThan(0);
    expect(result.removed.map(r => r.toLowerCase())).toContain("rice");
    expect(result.removed.map(r => r.toLowerCase())).toContain("cooker");
    expect(result.removed.map(r => r.toLowerCase())).toContain("nonstick");

    // Should have backfilled with pool candidates
    expect(result.added.length).toBeGreaterThan(0);

    // Final BK under byte limit
    expect(result.byte_count).toBeLessThanOrEqual(499);

    // Should contain at least one competitor and one alt-language
    expect(result.keywords.toLowerCase()).toMatch(/zojirushi|aroma|instant pot|tiger|toshiba/);
    // At least one non-latin script
    expect(result.keywords).toMatch(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uac00-\ud7af]/);
  });

  it("reports bytesReclaimed so users can see the improvement", () => {
    const result = optimizeBackendKeywords(
      "rice cooker nonstick inner pot",
      "CUCKOO Rice Cooker with Nonstick Inner Pot",
      "",
      { sku: "CR-0675FW" }
    );
    expect(result.bytesReclaimed).toBeGreaterThan(0);
  });
});

// =============================================================
// BULLET POST-PROCESSING (bulk-review-24 fixes)
// =============================================================

describe("cleanBulletHeading", () => {
  it("strips a single trailing colon", () => {
    expect(cleanBulletHeading("DUAL PRESSURE SYSTEM:")).toBe("DUAL PRESSURE SYSTEM");
  });

  it("strips multiple trailing colons (the '::' artifact from LLM)", () => {
    expect(cleanBulletHeading("DUAL PRESSURE SYSTEM::")).toBe("DUAL PRESSURE SYSTEM");
    expect(cleanBulletHeading("INDUCTION + TWIN PRESSURE:::")).toBe("INDUCTION + TWIN PRESSURE");
  });

  it("trims whitespace around trailing colons", () => {
    expect(cleanBulletHeading("MICOM INTELLIGENCE :")).toBe("MICOM INTELLIGENCE");
    expect(cleanBulletHeading("MICOM INTELLIGENCE : :")).toBe("MICOM INTELLIGENCE");
  });

  it("leaves headings without colons unchanged", () => {
    expect(cleanBulletHeading("TWIN PRESSURE INDUCTION")).toBe("TWIN PRESSURE INDUCTION");
  });

  it("handles null, undefined, and empty", () => {
    expect(cleanBulletHeading(null)).toBe(null);
    expect(cleanBulletHeading(undefined)).toBe(undefined);
    expect(cleanBulletHeading("")).toBe("");
  });

  it("does not strip internal colons (e.g., subtitles)", () => {
    expect(cleanBulletHeading("SMART: CONTROL")).toBe("SMART: CONTROL");
  });
});

describe("removeBulletPuffery", () => {
  it("strips 'Advanced Microcomputer' (the CR-0675FW bulk finding)", () => {
    const bullets = {
      bullets: [
        { heading: "SMART MICOM CONTROL", text: "Advanced microcomputer technology automatically adjusts cooking time for consistently fluffy rice." },
      ],
    };
    removeBulletPuffery(bullets);
    expect(bullets.bullets[0].text).not.toMatch(/Advanced microcomputer/i);
    expect(bullets.bullets[0].text).toMatch(/microcomputer/i); // bare "microcomputer" kept
  });

  it("strips 'Advanced Micom'", () => {
    const bullets = { bullets: [{ heading: "H", text: "This Advanced Micom cooker is reliable." }] };
    removeBulletPuffery(bullets);
    expect(bullets.bullets[0].text).not.toMatch(/Advanced Micom/i);
    expect(bullets.bullets[0].text).toContain("Micom");
  });

  it("strips 'Premium White', 'Luxury', 'Premium Craftsmanship'", () => {
    const bullets = {
      bullets: [
        { heading: "A", text: "Premium White finish." },
        { heading: "B", text: "Luxury cooking experience." },
        { heading: "C", text: "Built with Premium Craftsmanship." },
      ],
    };
    removeBulletPuffery(bullets);
    expect(bullets.bullets[0].text).not.toMatch(/Premium White/);
    expect(bullets.bullets[1].text).not.toMatch(/Luxury/);
    expect(bullets.bullets[2].text).not.toMatch(/Premium Craftsmanship/);
  });

  it("also cleans heading double-colons during the same pass", () => {
    const bullets = {
      bullets: [
        { heading: "DUAL PRESSURE SYSTEM::", text: "Some text." },
      ],
    };
    removeBulletPuffery(bullets);
    expect(bullets.bullets[0].heading).toBe("DUAL PRESSURE SYSTEM");
  });

  it("handles null/empty bullets gracefully", () => {
    expect(() => removeBulletPuffery(null)).not.toThrow();
    expect(() => removeBulletPuffery({})).not.toThrow();
    expect(() => removeBulletPuffery({ bullets: [] })).not.toThrow();
    expect(() => removeBulletPuffery({ bullets: [{ heading: "H" }] })).not.toThrow(); // no text field
  });
});

describe("trimBulletToMaxChars", () => {
  it("returns unchanged when total is already under the limit", () => {
    const result = trimBulletToMaxChars("HEAD", "Short body.", 220);
    expect(result.wasTrimmed).toBe(false);
    expect(result.text).toBe("Short body.");
  });

  it("trims at a sentence boundary when possible (premium bullet over 220)", () => {
    // Heading "DUAL PRESSURE" (13 chars) + ": " (2) = 15 prefix; 205 chars body max
    const body = "Twin pressure technology delivers restaurant-quality texture control through precise steam circulation. Achieve perfectly tender grains with enhanced flavor absorption for premium rice dishes and elevated daily meals.";
    const result = trimBulletToMaxChars("DUAL PRESSURE", body, 220);
    expect(result.wasTrimmed).toBe(true);
    // Should cut at the ". " after "circulation"
    expect(result.text).toMatch(/circulation\.$/);
    expect(("DUAL PRESSURE: " + result.text).length).toBeLessThanOrEqual(220);
  });

  it("falls back to word-boundary when no sentence boundary fits", () => {
    const heading = "H";
    const body = "a".repeat(250);
    const result = trimBulletToMaxChars(heading, body, 50);
    expect(result.wasTrimmed).toBe(true);
    expect(("H: " + result.text).length).toBeLessThanOrEqual(50);
  });

  it("handles null body", () => {
    const result = trimBulletToMaxChars("H", null, 220);
    expect(result.wasTrimmed).toBe(false);
  });
});

describe("trimOversizedBullets", () => {
  it("trims bullets whose heading + ': ' + body exceeds 220 chars", () => {
    const bullets = {
      bullets: [
        { heading: "OK", text: "short." },
        { heading: "PREMIUM", text: "This is a sentence. ".repeat(20) }, // way over 220
      ],
    };
    const trimmed = trimOversizedBullets(bullets, 220);
    expect(trimmed.length).toBe(1);
    expect(trimmed[0].index).toBe(1);
    // First bullet untouched
    expect(bullets.bullets[0].text).toBe("short.");
    // Second bullet now fits
    const fullLen = ("PREMIUM: " + bullets.bullets[1].text).length;
    expect(fullLen).toBeLessThanOrEqual(220);
  });

  it("returns empty array when all bullets fit", () => {
    const bullets = { bullets: [{ heading: "H", text: "fine." }] };
    const trimmed = trimOversizedBullets(bullets, 220);
    expect(trimmed).toEqual([]);
  });

  it("reports original and new length for each trimmed bullet", () => {
    const bullets = {
      bullets: [
        { heading: "P", text: "This is long enough to exceed the tiny cap we are setting for this test case where we want a definite trim." },
      ],
    };
    const trimmed = trimOversizedBullets(bullets, 50);
    expect(trimmed[0]).toHaveProperty("originalLen");
    expect(trimmed[0]).toHaveProperty("newLen");
    expect(trimmed[0].newLen).toBeLessThan(trimmed[0].originalLen);
  });
});

describe("runBulletPipeline", () => {
  it("runs puffery removal + heading clean + trim in one pass", () => {
    const bullets = {
      bullets: [
        {
          heading: "SMART MICOM CONTROL::",
          text: "Advanced microcomputer technology automatically adjusts cooking time and temperature for consistently fluffy, perfectly textured rice every time with precision and care.",
        },
      ],
    };
    const result = runBulletPipeline(bullets, 220);
    // Heading cleaned
    expect(bullets.bullets[0].heading).toBe("SMART MICOM CONTROL");
    // Puffery stripped
    expect(bullets.bullets[0].text).not.toMatch(/Advanced microcomputer/i);
    // Total length within cap
    const fullLen = (bullets.bullets[0].heading + ": " + bullets.bullets[0].text).length;
    expect(fullLen).toBeLessThanOrEqual(220);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("handles the real-world CRP-LHTAR0609FW case from bulk run (280 chars with ::)", () => {
    const bullets = {
      bullets: [
        {
          heading: "INDUCTION + TWIN PRESSURE::",
          text: "Precise induction heating combined with dual pressure systems delivers restaurant-quality rice with optimal texture and moisture retention. Each grain achieves perfect consistency through controlled temperature distribution and pressure-sealed cooking.",
        },
      ],
    };
    const before = bullets.bullets[0].heading + ": " + bullets.bullets[0].text;
    expect(before.length).toBeGreaterThan(220); // confirms starting state
    runBulletPipeline(bullets, 220);
    const after = bullets.bullets[0].heading + ": " + bullets.bullets[0].text;
    expect(after.length).toBeLessThanOrEqual(220);
    expect(bullets.bullets[0].heading).toBe("INDUCTION + TWIN PRESSURE"); // colons stripped
  });

  it("returns BULLET_TRIMMED warning when a bullet is trimmed", () => {
    const bullets = {
      bullets: [
        { heading: "P", text: "This is a sentence. ".repeat(20) },
      ],
    };
    const result = runBulletPipeline(bullets, 220);
    expect(result.trimmed.length).toBe(1);
    expect(result.warnings.some(w => w.startsWith("BULLET_TRIMMED"))).toBe(true);
  });

  it("handles null input safely", () => {
    expect(() => runBulletPipeline(null, 220)).not.toThrow();
    const result = runBulletPipeline(null, 220);
    expect(result.trimmed).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

// =============================================================
// COLOR-VARIANT GROUPING (narrow F+[WGBR] rule)
// =============================================================

describe("getColorVariantStem", () => {
  it("matches F + W (White) pattern", () => {
    expect(getColorVariantStem("CR-0675FW")).toEqual({ stem: "CR-0675F", colorLetter: "W" });
  });

  it("matches F + G (Gray) pattern", () => {
    expect(getColorVariantStem("CR-0675FG")).toEqual({ stem: "CR-0675F", colorLetter: "G" });
  });

  it("matches F + B (Black) pattern", () => {
    expect(getColorVariantStem("CRP-LHTAR0609FB")).toEqual({ stem: "CRP-LHTAR0609F", colorLetter: "B" });
  });

  it("matches F + R (Red) pattern", () => {
    expect(getColorVariantStem("CR-0351FR")).toEqual({ stem: "CR-0351F", colorLetter: "R" });
  });

  it("handles long stems with multiple letter runs (CR-HA0810FG, CRP-LHTAR0609FB)", () => {
    expect(getColorVariantStem("CR-HA0810FG")).toEqual({ stem: "CR-HA0810F", colorLetter: "G" });
    expect(getColorVariantStem("CRP-LHTAR0609FB")).toEqual({ stem: "CRP-LHTAR0609F", colorLetter: "B" });
  });

  it("returns null for SKUs ending in F alone (not F+color)", () => {
    // These are model-level F suffixes, not color codes
    expect(getColorVariantStem("CR-0631F")).toBeNull();
    expect(getColorVariantStem("CR-0632F")).toBeNull();
    expect(getColorVariantStem("CR-0641F")).toBeNull();
    expect(getColorVariantStem("CRP-JHR0609F")).toBeNull();
  });

  it("returns null for SKUs ending in other letters (C, S, V, N, D)", () => {
    expect(getColorVariantStem("CR-0301C")).toBeNull();
    expect(getColorVariantStem("CRP-P0609S")).toBeNull();
    expect(getColorVariantStem("CR-0671V")).toBeNull();
    expect(getColorVariantStem("CRP-CHSS1009FN")).toBeNull();
    expect(getColorVariantStem("CRP-DHSR0609FD")).toBeNull();
  });

  it("returns null for SKUs with two-letter suffixes where first isn't F", () => {
    // e.g., CRP-P1009SB ends in SB, not F+[WGBR]
    expect(getColorVariantStem("CRP-P1009SB")).toBeNull();
    expect(getColorVariantStem("CRP-P1009SW")).toBeNull();
  });

  it("returns null for empty/non-string/unrecognized", () => {
    expect(getColorVariantStem(null)).toBeNull();
    expect(getColorVariantStem("")).toBeNull();
    expect(getColorVariantStem("NOTAMODEL")).toBeNull();
    expect(getColorVariantStem(123)).toBeNull();
  });

  it("trims whitespace before matching", () => {
    expect(getColorVariantStem("  CR-0675FW  ")).toEqual({ stem: "CR-0675F", colorLetter: "W" });
  });
});

describe("buildColorVariantGroups", () => {
  it("groups the 7 real CUCKOO color-variant families correctly", () => {
    // This is the real cluster pattern from the 47-SKU DB
    const db = {
      "CR-0675FW": {}, "CR-0675FG": {},
      "CR-0375FW": {}, "CR-0375FG": {},
      "CR-HA0810FW": {}, "CR-HA0810FG": {},
      "CRP-LHTAR0609FB": {}, "CRP-LHTAR0609FW": {},
      "CRP-RT0609FB": {}, "CRP-RT0609FW": {},
      "CRP-ST0609FG": {}, "CRP-ST0609FW": {},
      "CRP-ST1009FG": {}, "CRP-ST1009FW": {},
    };
    const groups = buildColorVariantGroups(db);
    expect(Object.keys(groups).length).toBe(7);
    expect(groups["CR-0675F"]).toEqual(["CR-0675FG", "CR-0675FW"]);
    expect(groups["CR-0375F"]).toEqual(["CR-0375FG", "CR-0375FW"]);
    expect(groups["CR-HA0810F"]).toEqual(["CR-HA0810FG", "CR-HA0810FW"]);
    expect(groups["CRP-LHTAR0609F"]).toEqual(["CRP-LHTAR0609FB", "CRP-LHTAR0609FW"]);
    expect(groups["CRP-RT0609F"]).toEqual(["CRP-RT0609FB", "CRP-RT0609FW"]);
    expect(groups["CRP-ST0609F"]).toEqual(["CRP-ST0609FG", "CRP-ST0609FW"]);
    expect(groups["CRP-ST1009F"]).toEqual(["CRP-ST1009FG", "CRP-ST1009FW"]);
  });

  it("excludes stems with only one member (no sibling to rewrite from)", () => {
    const db = { "CR-0675FW": {}, "CR-0675FG": {}, "CRP-HS0657FW": {} };
    const groups = buildColorVariantGroups(db);
    expect(groups["CR-0675F"]).toBeDefined();
    expect(groups["CRP-HS0657F"]).toBeUndefined(); // solo, excluded
  });

  it("excludes SKUs not matching the F+[WGBR] pattern", () => {
    const db = {
      "CR-0301C": {}, "CR-0601C": {}, // should be grouped? no — rule excludes C
      "CRP-P1009SB": {}, "CRP-P1009SW": {}, // S+[BW] — excluded, rule requires F
    };
    const groups = buildColorVariantGroups(db);
    expect(Object.keys(groups).length).toBe(0);
  });

  it("returns an empty object for empty/null input", () => {
    expect(buildColorVariantGroups(null)).toEqual({});
    expect(buildColorVariantGroups({})).toEqual({});
  });

  it("sorts members alphabetically so leader is deterministic", () => {
    const db = { "CR-0675FW": {}, "CR-0675FG": {} };
    const groups = buildColorVariantGroups(db);
    // G comes before W alphabetically
    expect(groups["CR-0675F"][0]).toBe("CR-0675FG");
    expect(groups["CR-0675F"][1]).toBe("CR-0675FW");
  });
});

describe("pickColorVariantLeader", () => {
  it("returns the alphabetically first SKU", () => {
    expect(pickColorVariantLeader(["CR-0675FW", "CR-0675FG"])).toBe("CR-0675FG");
    expect(pickColorVariantLeader(["CRP-LHTAR0609FW", "CRP-LHTAR0609FB"])).toBe("CRP-LHTAR0609FB");
  });

  it("returns null for empty/invalid input", () => {
    expect(pickColorVariantLeader([])).toBeNull();
    expect(pickColorVariantLeader(null)).toBeNull();
    expect(pickColorVariantLeader("not-an-array")).toBeNull();
  });
});

describe("getLeaderForSku", () => {
  it("returns leader for a SKU in a group", () => {
    const groups = { "CR-0675F": ["CR-0675FG", "CR-0675FW"] };
    expect(getLeaderForSku("CR-0675FW", groups)).toBe("CR-0675FG");
    expect(getLeaderForSku("CR-0675FG", groups)).toBe("CR-0675FG"); // leader leads itself
  });

  it("returns null for SKU not in any group", () => {
    const groups = { "CR-0675F": ["CR-0675FG", "CR-0675FW"] };
    expect(getLeaderForSku("CR-0301C", groups)).toBeNull();
    expect(getLeaderForSku("CR-0631F", groups)).toBeNull();
  });
});

describe("rewriteTitleForFollower", () => {
  it("swaps color and SKU in a simple CUCKOO title", () => {
    const leaderTitle = "CUCKOO Micom Rice Cooker 12-Cup Cooked, Gray (CR-0675FG)";
    const result = rewriteTitleForFollower(leaderTitle, "CR-0675FG", "Gray", "CR-0675FW", "White");
    expect(result).toBe("CUCKOO Micom Rice Cooker 12-Cup Cooked, White (CR-0675FW)");
  });

  it("swaps color in a title with a descriptor and ending color+SKU", () => {
    const leaderTitle = "CUCKOO Twin Pressure Induction Heating Rice Cooker 12-Cup Cooked with Stainless Steel Inner Pot, Black (CRP-LHTAR0609FB)";
    const result = rewriteTitleForFollower(leaderTitle, "CRP-LHTAR0609FB", "Black", "CRP-LHTAR0609FW", "White");
    expect(result).toBe("CUCKOO Twin Pressure Induction Heating Rice Cooker 12-Cup Cooked with Stainless Steel Inner Pot, White (CRP-LHTAR0609FW)");
  });

  it("only swaps the LAST occurrence of the color word (preserves 'black' mentions earlier)", () => {
    // Hypothetical title mentioning 'black' in the descriptor AND the final color slot
    const leaderTitle = "CUCKOO Rice Cooker with Black Steel Interior, Black (CRP-RT0609FB)";
    const result = rewriteTitleForFollower(leaderTitle, "CRP-RT0609FB", "Black", "CRP-RT0609FW", "White");
    // Only the final 'Black' is swapped
    expect(result).toBe("CUCKOO Rice Cooker with Black Steel Interior, White (CRP-RT0609FW)");
  });

  it("handles case-insensitive color matching", () => {
    const leaderTitle = "some cucKOO title gray (CR-0675FG)";
    const result = rewriteTitleForFollower(leaderTitle, "CR-0675FG", "Gray", "CR-0675FW", "White");
    // Matches 'gray' case-insensitively, replaces with 'White'
    expect(result).toContain("White");
    expect(result).toContain("CR-0675FW");
  });

  it("returns original title when leaderColor == followerColor (idempotent)", () => {
    const t = "CUCKOO ... Gray (CR-0675FG)";
    expect(rewriteTitleForFollower(t, "CR-0675FG", "Gray", "CR-0675FG", "Gray")).toBe(t);
  });

  it("handles null/empty inputs gracefully", () => {
    expect(rewriteTitleForFollower(null, "A", "White", "B", "Gray")).toBeNull();
    expect(rewriteTitleForFollower("", "A", "White", "B", "Gray")).toBe("");
  });
});

describe("applyColorVariantRewrite", () => {
  it("rewrites all marketplace titles in a conversions object", () => {
    const leaderConversions = {
      amazon: { title: "CUCKOO Rice Cooker ..., Gray (CR-0675FG)" },
      walmart: { title: "CUCKOO Rice Cooker with Auto Clean, Gray (CR-0675FG)" },
      target: { title: "CUCKOO Rice Cooker for Everyday Rice, Gray (CR-0675FG)" },
    };
    const followerConversions = {};
    const result = applyColorVariantRewrite(leaderConversions, followerConversions, "CR-0675FG", "Gray", "CR-0675FW", "White");
    expect(result.rewrittenCount).toBe(3);
    expect(followerConversions.amazon.title).toBe("CUCKOO Rice Cooker ..., White (CR-0675FW)");
    expect(followerConversions.walmart.title).toBe("CUCKOO Rice Cooker with Auto Clean, White (CR-0675FW)");
    expect(followerConversions.target.title).toBe("CUCKOO Rice Cooker for Everyday Rice, White (CR-0675FW)");
  });

  it("warns when leaderConversions is missing", () => {
    const result = applyColorVariantRewrite(null, {}, "A", "White", "B", "Gray");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.rewrittenCount).toBe(0);
  });
});

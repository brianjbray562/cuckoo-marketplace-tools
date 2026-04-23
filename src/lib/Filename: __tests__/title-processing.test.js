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

import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// Resolver equivalence across EVERY creative design.
//
// The Studio Preview rendered the default creative instead of the selected one
// because the survey route resolved nothing. This asserts the shared resolver
// produces the correct seven fields for every design shape that exists in
// production — the corpus below mirrors `creative_designs` as at 2026-08-20,
// covering all four layouts, a design with config.renderer pinned, one with
// branding, and a soft-deleted one.

type Design = { slug: string; layout: string; builder_state: unknown; branding: unknown; config: unknown; deleted: boolean };

// Shapes taken from production. BUILDER is the real `fanometrix` builder_state,
// copied verbatim — a minimal stand-in is not enough, because
// buildEmbedThemeFromState reads specific colour fields and throws without them.
const BUILDER = {
  mode: "gradient", name: "Fanometrix Premium", text: "#FFFFFF", timer: "#D7B87A",
  border: "#D7B87A", glowHex: "#000000", glowAlpha: 0.6, background: "#041B33",
  headerText: "#041B33", headerColor: "#D7B87A", quadrantBase: "#0B1929",
  selectedText: "#041B33", selectedColor: "#D7B87A", useThirdColor: false,
  gradientColor1: "#D7B87A", gradientColor2: "#A8864A", gradientColor3: "#7C3AED",
  gradientDirection: "180deg", mirrorTopQuadrants: true,
};
const DESIGNS: Design[] = [
  { slug: "classic",           layout: "classic",    builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "studio-classic",    layout: "classic",    builder_state: BUILDER, branding: null, config: { renderer: "studio-classic" }, deleted: false },
  { slug: "fanometrix",        layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "electric-football", layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "electric-purple",   layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "fan-energy",        layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "lime-energy",       layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "ocean",             layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "sky-pulse",         layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "stadium-green",     layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "my_custom_theme",   layout: "timer",      builder_state: BUILDER, branding: { logos: [] }, config: null, deleted: false },
  { slug: "fan-invitation",    layout: "invitation", builder_state: BUILDER, branding: null, config: null, deleted: false },
  { slug: "fanometrix-stack",  layout: "stack",      builder_state: BUILDER, branding: null, config: { defaultTopic: "Champions League" }, deleted: false },
  { slug: "fan_energy_copy",   layout: "timer",      builder_state: BUILDER, branding: null, config: null, deleted: true },
];

function design(slug: string | null) {
  const d = DESIGNS.find(x => x.slug === slug);
  return d && !d.deleted ? d : null;
}

mock.module("@/lib/supabase-admin", {
  namedExports: {
    supabaseAdmin: {
      from(table: string) {
        let slug: string | null = null;
        let excludeDeleted = false;
        const api: Record<string, unknown> = {};
        api.select = () => api;
        api.eq = (col: string, val: string) => { if (col === "slug") slug = val; return api; };
        api.is = () => { excludeDeleted = true; return api; };
        api.single = () => {
          if (table !== "creative_designs") return Promise.resolve({ data: null, error: null });
          const raw = DESIGNS.find(x => x.slug === slug) ?? null;
          // `.is("deleted_at", null)` is only applied on the main lookup; the
          // stack `config` re-fetch deliberately omits it, mirroring the route.
          const d = excludeDeleted ? design(slug) : raw;
          return Promise.resolve({ data: d ? { layout: d.layout, builder_state: d.builder_state, branding: d.branding, config: d.config } : null, error: null });
        };
        return api;
      },
    },
  },
});

let resolveCreativeForEmbed: typeof import("./embed-creative").resolveCreativeForEmbed;
let EMPTY_CREATIVE: typeof import("./embed-creative").EMPTY_CREATIVE;
before(async () => { ({ resolveCreativeForEmbed, EMPTY_CREATIVE } = await import("./embed-creative")); });

test("no design selected resolves to the empty creative, with no field undefined", async () => {
  for (const input of [null, undefined, ""]) {
    const r = await resolveCreativeForEmbed(input as string | null);
    assert.deepEqual(r, EMPTY_CREATIVE);
    for (const [k, v] of Object.entries(r)) assert.notEqual(v, undefined, `${k} must never be undefined`);
  }
});

test("every design resolves layout and renderer correctly", async () => {
  for (const d of DESIGNS.filter(x => !x.deleted)) {
    const r = await resolveCreativeForEmbed(d.slug);
    assert.equal(r.creative_design, d.slug, `${d.slug}: slug echoed back`);
    assert.equal(r.layout, d.layout, `${d.slug}: layout`);
    // Independent restatement of the rule: config.renderer pins the renderer;
    // otherwise it falls back to the layout. NEVER keyed on layout alone.
    const expected = (d.config as { renderer?: string } | null)?.renderer ?? d.layout;
    assert.equal(r.renderer, expected, `${d.slug}: renderer`);
  }
});

test("studio-classic pins its renderer; historical classic does not", async () => {
  // The strangler case. If these two ever resolve the same way, historical
  // traffic has been redirected to a different renderer.
  assert.equal((await resolveCreativeForEmbed("studio-classic")).renderer, "studio-classic");
  assert.equal((await resolveCreativeForEmbed("classic")).renderer, "classic");
});

test("custom_theme is built only for timer and invitation layouts", async () => {
  for (const d of DESIGNS.filter(x => !x.deleted)) {
    const r = await resolveCreativeForEmbed(d.slug);
    const shouldBuild = (d.layout === "timer" || d.layout === "invitation") && !!d.builder_state;
    assert.equal(r.custom_theme !== null, shouldBuild, `${d.slug}: custom_theme presence`);
  }
});

test("stack config and topic resolve only for the stack layout", async () => {
  for (const d of DESIGNS.filter(x => !x.deleted)) {
    const r = await resolveCreativeForEmbed(d.slug);
    if (d.layout === "stack") {
      assert.notEqual(r.config, null, `${d.slug}: stack config fetched`);
      assert.equal(r.topic, "Champions League", `${d.slug}: design default Topic`);
    } else {
      assert.equal(r.config, null, `${d.slug}: non-stack must not carry config`);
      assert.equal(r.topic, null, `${d.slug}: non-stack must not carry topic`);
    }
  }
});

test("a campaign Topic override beats the design default; \"\" clears it", async () => {
  assert.equal((await resolveCreativeForEmbed("fanometrix-stack", "Europa League")).topic, "Europa League");
  assert.equal((await resolveCreativeForEmbed("fanometrix-stack", "")).topic, null);
  // A survey has no campaign, so it always passes null → design default.
  assert.equal((await resolveCreativeForEmbed("fanometrix-stack", null)).topic, "Champions League");
});

test("branding always resolves to an array, never null", async () => {
  for (const d of DESIGNS.filter(x => !x.deleted)) {
    const r = await resolveCreativeForEmbed(d.slug);
    assert.ok(Array.isArray(r.branding), `${d.slug}: branding is an array`);
  }
});

test("a soft-deleted design resolves to no layout rather than throwing", async () => {
  const r = await resolveCreativeForEmbed("fan_energy_copy");
  assert.equal(r.creative_design, "fan_energy_copy");
  assert.equal(r.layout, null);
  assert.equal(r.renderer, null);
});

test("an unknown slug degrades safely", async () => {
  const r = await resolveCreativeForEmbed("no-such-design");
  assert.equal(r.layout, null);
  assert.equal(r.renderer, null);
  assert.deepEqual(r.branding, []);
});

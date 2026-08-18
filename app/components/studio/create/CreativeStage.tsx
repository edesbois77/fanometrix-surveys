"use client";

// ── Creative stage (Survey Studio Create — interaction-type model) ───────────
// ONE substantial card per Creative interaction TYPE (Countdown Clock · Stack ·
// Classic), each dominated by a large STATIC representative question frame of the
// currently-explored design VARIANT. Variants live inside the type (colour/design
// swatches — the decision here is visual), the
// Fanometrix variant is always the default, and exploring a variant is PROVISIONAL
// — nothing persists until "Use". "Use" commits the explored variant's existing
// slug to surveys.creative_design (via the parent's autosave), gated by the
// renderer compatibility check (block-without-delete). Preview (image or button)
// opens the real production Preview of the explored variant. `invitation` is not
// a type here — it stays a legacy timer+intro implementation for historical
// campaigns. Publisher-specific variants are already filtered server-side.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StudioIcon } from "../studio-icons";
import { Card, Button, Eyebrow, StatusBadge, Skeleton, EmptyState } from "@/app/components/workspace-ui";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import type { BuilderState } from "@/lib/creative-theme-builder";
import { buildGradientCss } from "@/lib/creative-theme-builder";
import { resolveCreativeRules } from "@/lib/creative-rules";
import { checkCreativeCompatibility, type SurveyContentSummary, type CompatibilityIssue, type RendererConstraints } from "@/lib/creative-compatibility";
import { groupIntoTypes, defaultVariant, mechanicForLayout, type CreativeTypeInfo } from "@/lib/creative-library";
import { CreativeCardPreview } from "./CreativeCardPreview";

type DesignRow = {
  id: string;
  slug: string;
  name: string;
  theme: string;
  sub_theme: string | null;
  layout: "timer" | "classic" | "invitation" | "stack";
  builder_state?: BuilderState;
  config?: unknown;
  rules?: unknown;
  publisher_org_id?: string | null;
  publisher_name?: string | null;
  is_system?: boolean;
  usage_count?: number;
  created_at?: string | null;
};

// The swatch is derived from the SAME design data that drives the renderer: a
// gradient design yields a gradient circle (via the same buildGradientCss helper
// buildEmbedThemeFromState uses), a solid design yields a flat circle, and any
// design without a builder palette (e.g. Stack, whose identity lives in config)
// degrades to a sensible flat fill. No hand-maintained second palette.
function swatchBackground(bs: BuilderState | undefined): string {
  if (bs && bs.mode === "gradient" && bs.gradientColor1) {
    const colors = bs.useThirdColor
      ? [bs.gradientColor1, bs.gradientColor2, bs.gradientColor3]
      : [bs.gradientColor1, bs.gradientColor2];
    return buildGradientCss(colors.filter(Boolean), bs.gradientDirection ?? "180deg");
  }
  return (bs && bs.background) || "#0B1929";
}

function constraintsFor(row: DesignRow, type: CreativeTypeInfo): RendererConstraints {
  const rules = resolveCreativeRules(row.rules, row.layout);
  return { maxOptions: rules.maxOptions, maxQChars: rules.maxQChars, maxOptChars: rules.maxOptChars, supportsIntro: type.supportsIntro };
}

// ── Lightweight modal overlay ────────────────────────────────────────────────
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius-panel)] overflow-hidden" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--text-tertiary)" }} aria-label="Close">Close</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ── Variant swatch ───────────────────────────────────────────────────────────
// A compact circular colour/design swatch derived from the variant's own Creative
// data (builder_state — the same source the renderer uses). The user's decision
// here is visual, so the NAME is not on the swatch — it is shown once, on the
// DESIGN line. Selection is signalled by a gold ring AND a check glyph (never
// colour alone), plus aria-pressed for assistive tech; the accessible name/title
// always carries the design name.
//
// A publisher-specific variant (publisher_org_id present — a fact already resolved
// and filtered SERVER-SIDE by the governed Current Organisation boundary; the
// client only reflects it) participates in the SAME selector with a small, quiet
// organisation marker, and its title/aria-label + the DESIGN line identify it as
// an organisation-specific design. No internal organisation ID is ever exposed.
function VariantSwatch({ row, active, onClick }: { row: DesignRow; active: boolean; onClick: () => void }) {
  const isPublisher = !!row.publisher_org_id;
  const label = isPublisher
    ? `${row.name} — ${row.publisher_name ?? "your organisation"} (organisation-specific design)`
    : row.name;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className="relative w-8 h-8 rounded-full flex items-center justify-center transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-offset-1"
      style={{ transform: active ? "scale(1.06)" : "scale(1)" }}
    >
      {/* Design fill — flat colour or gradient, derived from the real design data */}
      <span className="w-7 h-7 rounded-full" style={{ background: swatchBackground(row.builder_state), boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.22)" }} aria-hidden />
      {/* Selected ring — a non-colour cue (thickness/shape), reinforced by the check below */}
      {active && <span className="absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 2px var(--surface), 0 0 0 4px var(--accent-gold)" }} aria-hidden />}
      {/* Selected check — legible on any swatch fill; not reliant on colour alone */}
      {active && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex items-center justify-center rounded-full" style={{ width: 16, height: 16, background: "rgba(11,25,41,0.82)", color: "#fff" }}>
            <StudioIcon.check size={11} strokeWidth={2.5} />
          </span>
        </span>
      )}
      {/* Publisher marker — small, quiet, corner (never an org ID) */}
      {isPublisher && (
        <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full" style={{ width: 13, height: 13, background: "var(--surface)", color: "var(--text-tertiary)", boxShadow: "0 0 0 1px var(--border-default)" }} aria-hidden>
          <StudioIcon.org size={9} />
        </span>
      )}
    </button>
  );
}

// ── One interaction-type card ────────────────────────────────────────────────
function TypeCard({ type, variants, exploredSlug, selectedSlug, onExplore, onPreview, onUse }: {
  type: CreativeTypeInfo;
  variants: DesignRow[];
  exploredSlug: string;
  selectedSlug: string | null;
  onExplore: (slug: string) => void;
  onPreview: (slug: string) => void;
  onUse: (row: DesignRow) => void;
}) {
  const explored = variants.find((v) => v.slug === exploredSlug) ?? variants[0];
  const isSelected = selectedSlug != null && variants.some((v) => v.slug === selectedSlug) && selectedSlug === explored.slug;
  const someVariantSelected = selectedSlug != null && variants.some((v) => v.slug === selectedSlug);

  return (
    <Card className="h-full flex flex-col" padding="none">
      {/* Large STATIC representative image of the explored variant — the whole
          image is the primary "open Preview" affordance. No permanent badge; a
          hover/focus scrim reveals the Preview hint instead. (The explicit Preview
          button below remains the obvious accessible secondary path.) */}
      {/* Clickable card affordance. This is a role="button" DIV, not a <button>,
          because it embeds a live creative preview that legitimately contains its
          own interactive buttons (e.g. the Countdown Privacy control) — a real
          <button> here would nest buttons and cause a hydration error. Keyboard
          parity is preserved via tabIndex + Enter/Space; the explicit Preview
          button below remains the primary accessible path. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onPreview(explored.slug)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPreview(explored.slug); } }}
        className="group relative block w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-inset"
        aria-label={`Preview ${type.label}, ${explored.name}`}
      >
        {/* The preview is a representation inside the card affordance — non-
            interactive so all clicks/taps drive the card's Preview action. */}
        <div className="pointer-events-none">
          <CreativeCardPreview design={explored} />
        </div>
        {someVariantSelected && (
          <span className="absolute top-2 right-2 z-10"><StatusBadge label="Selected" tone="success" dot /></span>
        )}
        {/* Hover / keyboard-focus affordance — appears on interaction, not permanent */}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ background: "rgba(11,25,41,0.24)" }}
          aria-hidden
        >
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(11,25,41,0.88)", color: "#fff" }}>Preview</span>
        </span>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{type.label}</h3>
        <p className="text-sm mt-1 leading-snug" style={{ color: "var(--text-secondary)" }}>{type.description}</p>

        {/* Variant selector (provisional) — colour/design swatches. A single
            compact DESIGN line names the currently-explored variant and follows
            exploration immediately; nothing persists until Select Creative. A
            single-design type shows the name quietly with no pointless picker. */}
        <div className="mt-3.5">
          <div className="flex items-baseline gap-1.5 mb-2 min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>Design</span>
            <span aria-hidden className="text-[11px] font-semibold flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>·</span>
            <span className="text-xs font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{explored.name}</span>
            {explored.publisher_org_id && (
              <span className="inline-flex items-center gap-1 flex-shrink-0 text-[10px] font-medium" style={{ color: "var(--text-tertiary)" }} title="Organisation-specific design">
                <StudioIcon.org size={10} /> Organisation-specific
              </span>
            )}
          </div>
          {variants.length > 1 && (
            <div className="flex flex-wrap items-center gap-2.5">
              {variants.map((v) => (
                <VariantSwatch key={v.id} row={v} active={v.slug === explored.slug} onClick={() => onExplore(v.slug)} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 flex items-center gap-2">
          <Button onClick={() => onPreview(explored.slug)} variant="secondary" size="md">Preview</Button>
          {isSelected ? (
            <Button variant="secondary" size="md" disabled>Selected ✓</Button>
          ) : (
            <Button onClick={() => onUse(explored)} variant="primary" size="md">Select Creative</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function CreativeStage({ selectedSlug, surveyContent, onSelect }: {
  selectedSlug: string | null;
  surveyContent: SurveyContentSummary;
  onSelect: (slug: string) => void;
}) {
  const [rows, setRows] = useState<DesignRow[] | null>(null);
  const [explored, setExplored] = useState<Record<string, string>>({}); // mechanic → slug
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ label: string; issues: CompatibilityIssue[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/creative-designs");
      const json = res.ok ? await res.json() : null;
      const data = (json?.data ?? []) as DesignRow[];
      // Initialise the explored variant per type: the persisted selection where
      // one belongs to that type, otherwise the Fanometrix default (never a
      // publisher-specific variant).
      const groups = groupIntoTypes(data);
      const init: Record<string, string> = {};
      for (const g of groups) {
        const persisted = selectedSlug && g.variants.find((v) => v.slug === selectedSlug);
        init[g.type.mechanic] = persisted ? selectedSlug! : (defaultVariant(g.variants)?.slug ?? g.variants[0].slug);
      }
      setExplored(init);
      setRows(data);
    } catch {
      setRows([]);
    }
    // selectedSlug intentionally read once at load; commits don't reset exploration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- idiomatic memoized loader
  useEffect(() => { load(); }, [load]);

  const attemptUse = (row: DesignRow) => {
    if (row.slug === selectedSlug) return;
    const type = groupIntoTypes(rows ?? []).find((g) => g.type.mechanic === mechanicForLayout(row.layout))?.type;
    if (!type) return;
    const result = checkCreativeCompatibility(surveyContent, constraintsFor(row, type));
    if (result.compatible) {
      onSelect(row.slug);
      setPreviewSlug(null);
    } else {
      setBlocked({ label: type.label, issues: result.issues });
    }
  };

  if (rows === null) {
    return (
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-96" />)}
      </div>
    );
  }

  const groups = groupIntoTypes(rows);
  if (groups.length === 0) {
    return <div className="mt-6"><EmptyState title="No creatives available" description="There are no approved creative templates to choose from yet." /></div>;
  }

  const previewRow = previewSlug ? rows.find((r) => r.slug === previewSlug) : null;

  return (
    <div className="mt-6">
      <div className="mb-5">
        <Eyebrow className="mb-1">Creative</Eyebrow>
        <h2 className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Choose how fans interact</h2>
        <p className="text-sm mt-0.5 max-w-xl" style={{ color: "var(--text-secondary)" }}>
          Pick an interaction type. You&apos;ll set up the questions themselves in the next step.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {groups.map((g) => (
          <TypeCard
            key={g.type.mechanic}
            type={g.type}
            variants={g.variants}
            exploredSlug={explored[g.type.mechanic] ?? (defaultVariant(g.variants)?.slug ?? g.variants[0].slug)}
            selectedSlug={selectedSlug}
            onExplore={(slug) => setExplored((e) => ({ ...e, [g.type.mechanic]: slug }))}
            onPreview={(slug) => setPreviewSlug(slug)}
            onUse={attemptUse}
          />
        ))}
      </div>

      {/* Quiet secondary path — a different visual treatment, via the existing Request journey */}
      <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <Link href="/survey-studio/request" className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: "var(--accent-ink)" }}>
          Need a different look? Request a creative design <StudioIcon.arrowRight size={14} />
        </Link>
      </div>

      {/* Full production Preview of the explored variant */}
      {previewRow && (
        <Overlay title={`Preview: ${previewRow.name}`} onClose={() => setPreviewSlug(null)}>
          <div className="flex justify-center">
            <CreativeDesignPreview designId={previewRow.slug} topic={null} />
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button onClick={() => setPreviewSlug(null)} variant="secondary" size="sm">Close</Button>
            <Button onClick={() => attemptUse(previewRow)} variant="primary" size="sm" disabled={previewRow.slug === selectedSlug}>
              {previewRow.slug === selectedSlug ? "Selected ✓" : "Select Creative"}
            </Button>
          </div>
        </Overlay>
      )}

      {/* Incompatible type switch — blocked with explicit reasons; nothing deleted */}
      {blocked && (
        <Overlay title="This creative doesn't fit your survey" onClose={() => setBlocked(null)}>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Switching to <strong style={{ color: "var(--text-primary)" }}>{blocked.label}</strong> would leave some of your
            survey behind, so the change is blocked. Nothing has been removed. Adjust your survey first, then switch.
          </p>
          <ul className="mt-3 space-y-1.5">
            {blocked.issues.map((iss, i) => (
              <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                <span aria-hidden style={{ color: "#B4694C" }}><StudioIcon.bell size={14} /></span>
                <span>{iss.message}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-end">
            <Button onClick={() => setBlocked(null)} variant="primary" size="sm">Got it</Button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

"use client";

// ── Workspace UI — living style guide (UI v2, Phase 1) ────────────────────────
// A single page that renders every foundation primitive so the team can see the
// visual language in one place and copy the exact component for each use. This
// is documentation, not product — it renders its own AdminShell chrome and is
// reachable at /creative-lab/foundation. When the foundation changes, this page
// changes with it because it imports the same components every area uses.

import { useState } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import {
  PageContainer, WorkspaceHeader, HeaderMetaItem,
  Card, Panel, Divider, SectionHeading, StatTile,
  StatusBadge, ConfidenceIndicator, Eyebrow,
  EmptyState, ErrorState, PageLoadingState, InlineEmpty,
  Button, type Tone,
  // Phase 2 — intelligence components
  InsightPanel, AIRecommendation, ThemeCard, SentimentBar,
  SourceCard, EvidenceCard, EvidenceDrawer,
  MetricTile, ProgressBar, ProgressSteps, GenerationProgress,
  Timeline, ActivityFeed,
  ChartContainer, ChartLegend, Sparkline, seriesColor,
  FilterBar, FilterSearch, FilterSelect, SegmentedControl, FilterChip,
} from "@/app/components/workspace-ui";

const TONES: Tone[] = ["neutral", "info", "success", "warning", "danger", "accent"];
const SPARK = [12, 18, 15, 22, 19, 28, 24, 34, 30, 41];

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg border flex-shrink-0" style={{ background: value, borderColor: "var(--border-default)" }} />
      <div className="min-w-0">
        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{name}</p>
        <p className="text-[11px] fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>{value}</p>
      </div>
    </div>
  );
}

function Block({ title, eyebrow = "Foundation", children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <Card>
      <SectionHeading eyebrow={eyebrow} title={title} />
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-4">
      <span className="h-px flex-1" style={{ background: "var(--border-default)" }} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="h-px flex-1" style={{ background: "var(--border-default)" }} />
    </div>
  );
}

export default function FoundationStyleGuide() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [facets, setFacets] = useState<string[]>(["UK"]);
  const toggleFacet = (f: string) => setFacets(s => s.includes(f) ? s.filter(x => x !== f) : [...s, f]);

  return (
    <AdminShell>
      <PageContainer gap="lg">
        <WorkspaceHeader
          organisation={{ name: "Fanometrix" }}
          eyebrow="Design system"
          title="Workspace foundation"
          description="The premium, neutral visual language every Research Project area inherits — surfaces, typography, status and state. Closer to Linear, Stripe and Notion than a survey tool."
          status={{ label: "Phase 1", tone: "accent", dot: true }}
          meta={
            <>
              <HeaderMetaItem label="Module">app/components/workspace-ui</HeaderMetaItem>
              <HeaderMetaItem label="Tokens">tokens.ts + globals.css</HeaderMetaItem>
            </>
          }
          secondaryActions={<Button variant="secondary">View tokens</Button>}
          primaryAction={<Button variant="primary">Primary action</Button>}
        />

        {/* Colour ─────────────────────────────────────────────────────────── */}
        <Block title="Colour — neutral surfaces, restrained accent">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Swatch name="Page" value="#F6F7F9" />
            <Swatch name="Surface" value="#FFFFFF" />
            <Swatch name="Sunken" value="#F1F3F5" />
            <Swatch name="Border" value="#E3E6EA" />
            <Swatch name="Text primary" value="#181B20" />
            <Swatch name="Text secondary" value="#565E6B" />
            <Swatch name="Brand navy" value="#0B1929" />
            <Swatch name="Accent gold" value="#D7B87A" />
          </div>
        </Block>

        {/* Typography ─────────────────────────────────────────────────────── */}
        <Block title="Typography — Geist, tightening tracking as size grows">
          <div className="space-y-3">
            <Eyebrow>Eyebrow · 11px uppercase</Eyebrow>
            <p className="text-[28px] font-bold tracking-[-0.025em]" style={{ color: "var(--text-primary)" }}>Display heading</p>
            <p className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>Page title (h1)</p>
            <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Section title</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Body copy — the calm, readable default for descriptions and long-form text at 14px.</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Caption / meta — 12px tertiary.</p>
          </div>
        </Block>

        {/* Surfaces ───────────────────────────────────────────────────────── */}
        <Block title="Surface hierarchy — page → card → sunken panel">
          <div className="space-y-4">
            <Panel>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                A <strong style={{ color: "var(--text-primary)" }}>Panel</strong> — the sunken well for reference material inside a card.
              </p>
            </Panel>
            <Divider />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="Responses" value="5,284" caption="+312 today" tone="success" />
              <StatTile label="Sources" value="3" caption="2 surveys · 1 doc" />
              <StatTile label="Coverage" value="86%" caption="of target" />
              <StatTile label="Confidence" value="High" tone="success" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card tone="success" padding="sm"><p className="text-xs font-semibold" style={{ color: "#3F5D42" }}>Success surface</p></Card>
              <Card tone="warning" padding="sm"><p className="text-xs font-semibold" style={{ color: "#8A6A2F" }}>Warning surface</p></Card>
              <Card tone="info" padding="sm"><p className="text-xs font-semibold" style={{ color: "#3B5A8A" }}>Info surface</p></Card>
            </div>
          </div>
        </Block>

        {/* Badges + confidence ────────────────────────────────────────────── */}
        <Block title="Status badges & confidence indicators">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => <StatusBadge key={t} label={t} tone={t} dot size="md" />)}
            </div>
            <Divider spacing="none" />
            <div className="flex flex-col gap-3">
              <ConfidenceIndicator level="low" basis="single source" />
              <ConfidenceIndicator level="medium" basis="2 sources agree" />
              <ConfidenceIndicator level="high" basis="triangulated across 3 sources" />
            </div>
          </div>
        </Block>

        {/* Actions ─────────────────────────────────────────────────────────── */}
        <Block title="Action vocabulary">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="brand">Brand</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </div>
        </Block>

        {/* States ─────────────────────────────────────────────────────────── */}
        <Block title="Standard states — empty & error">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EmptyState
              icon="＋"
              title="No research sources yet"
              description="Attach a survey, conversation search or document to begin."
              action={<Button variant="primary">+ Add source</Button>}
              compact
            />
            <ErrorState
              title="Couldn't load this area"
              description="Something went wrong fetching the project."
              backHref={null}
              action={<Button variant="secondary">Retry</Button>}
            />
          </div>
          <div className="mt-4">
            <InlineEmpty>Inline empty — the lightweight one-liner for an empty region inside a card.</InlineEmpty>
          </div>
        </Block>

        <Block title="Loading state — skeleton, layout-preserving">
          <div style={{ background: "var(--page-bg)", borderRadius: 12, padding: 24 }}>
            <PageLoadingState lines={2} />
          </div>
        </Block>

        {/* ══ PHASE 2 — INTELLIGENCE COMPONENTS ═══════════════════════════════ */}
        <SectionRule label="Phase 2 · Intelligence components" />

        {/* Insight Panel (primary) ─────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Insight Panel — the primary component">
          <InsightPanel
            eyebrow="Key finding 01"
            tone="opportunity"
            title="Matchday fans are 3× more likely to buy merchandise when engaged within 24 hours of a win."
            summary="Across survey and conversation evidence, post-victory engagement windows drive the strongest purchase intent — a lever currently unused in the club's CRM cadence."
            confidence={{ level: "high", basis: "triangulated across 3 sources" }}
            evidence={{ count: 3, onView: () => setDrawerOpen(true) }}
            metrics={[
              { label: "Purchase intent", value: "68%", caption: "+22pts vs baseline" },
              { label: "Response window", value: "24h", caption: "optimal" },
              { label: "Sample", value: "1,284", caption: "responses" },
            ]}
            actions={<Button variant="primary" size="sm">Add to report</Button>}
          />
        </Block>

        {/* AI Recommendation ───────────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="AI Recommendation">
          <AIRecommendation
            title="Prioritise a 24-hour post-match merchandise push"
            rationale="The evidence points to a short, high-intent window after wins. Configuring an automated CRM trigger here is the single highest-leverage next step."
            confidence="high"
            basis="based on 3 corroborating sources"
            action={<><Button variant="ghost" size="sm">Dismiss</Button><Button variant="brand" size="sm">Set up trigger</Button></>}
            onDismiss={() => {}}
          />
        </Block>

        {/* Source & Evidence Cards + Drawer ────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Source Card & Evidence Card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SourceCard
              type="survey"
              name="Fan Motivation Survey — UK"
              subtitle="Fielded 12 Jun · closed 28 Jun"
              status={{ label: "Complete", tone: "success", dot: true }}
              metrics={[{ label: "Responses", value: "1,284" }, { label: "Questions", value: "18" }, { label: "Markets", value: "3" }]}
              onOpen={() => setDrawerOpen(true)}
              footer={<button onClick={() => setDrawerOpen(true)} className="text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>Open source →</button>}
            />
            <SourceCard
              type="conversation"
              name="Reddit & X — Matchday Sentiment"
              subtitle="Rolling 90 days"
              status={{ label: "Collecting", tone: "info", dot: true }}
              metrics={[{ label: "Mentions", value: "8,410" }, { label: "Platforms", value: "2" }, { label: "Positive", value: "61%" }]}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <EvidenceCard
              kind="quote"
              content="The moment we won I wanted to buy the shirt — but the email came three days later and I'd moved on."
              sourceType="conversation" sourceName="r/soccer" meta="14 Jun" sentiment="positive" confidence="medium"
              onOpen={() => setDrawerOpen(true)}
            />
            <EvidenceCard
              kind="stat"
              content="68%"
              sourceType="survey" sourceName="Fan Motivation Survey" meta="Q12 · purchase intent" confidence="high"
              tag="Purchase intent"
            />
          </div>
        </Block>

        {/* Theme Card ──────────────────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Theme Card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ThemeCard name="Matchday emotional highs" description="Fans describe intense post-win excitement that fades within days." prevalence={42} mentions={3540} sentiment={{ positive: 71, neutral: 20, negative: 9 }} onOpen={() => setDrawerOpen(true)} />
            <ThemeCard name="Merchandise friction" description="Complaints about slow, mistimed retail communications." prevalence={28} mentions={2210} sentiment={{ positive: 18, neutral: 34, negative: 48 }} />
            <ThemeCard name="Community & belonging" description="Long-term identity and pride in the club." prevalence={30} mentions={2660} sentiment={{ positive: 64, neutral: 30, negative: 6 }} />
          </div>
        </Block>

        {/* Metric Tiles ────────────────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Metric Tile">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile label="Responses" value="5,284" delta={{ value: "+312", direction: "up" }} caption="today" icon="survey" spark={<Sparkline data={SPARK} width={140} />} />
            <MetricTile label="Sentiment" value="61" unit="% pos" delta={{ value: "-4pts", direction: "down" }} caption="7-day" />
            <MetricTile label="Target" value="86%" target={{ pct: 86, label: "of 6,000" }} />
            <MetricTile label="Cost / response" value="£1.42" delta={{ value: "-8%", direction: "down", sentiment: "good" }} caption="vs last run" icon="target" />
          </div>
        </Block>

        {/* Chart Container ──────────────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Chart Container (frame) — loaded, empty & loading">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChartContainer
              title="Response volume by market"
              description="Cumulative survey responses"
              legend={[{ label: "UK", value: "2.1k" }, { label: "US", value: "1.6k" }, { label: "DE", value: "0.9k" }]}
              source="Source: 4,600 survey responses"
              actions={<SegmentedControl value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} />}
            >
              {/* Placeholder plot — the real workspace drops a Recharts chart here. */}
              <div className="h-full flex items-end gap-2">
                {SPARK.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t" style={{ height: `${(h / 41) * 100}%`, background: seriesColor(i % 3), opacity: 0.85 }} />
                ))}
              </div>
            </ChartContainer>
            <ChartContainer title="Conversation sentiment" description="Awaiting first collection" empty source="No data yet" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <ChartContainer title="Loading state" loading />
            <ChartContainer title="Legend only" legend={[{ label: "Positive" }, { label: "Neutral" }, { label: "Negative" }]}>
              <div className="h-full flex items-center justify-center"><ChartLegend items={[{ label: "Positive", value: "61%" }, { label: "Neutral", value: "28%" }, { label: "Negative", value: "11%" }]} /></div>
            </ChartContainer>
          </div>
        </Block>

        {/* Filter Bar ───────────────────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Filter Bar">
          <FilterBar resultCount={{ value: 42, noun: "sources" }} onClear={() => { setQuery(""); setSource("all"); setFacets([]); }}>
            <FilterSearch value={query} onChange={setQuery} placeholder="Search evidence…" />
            <FilterSelect label="Source" value={source} onChange={setSource} options={[{ value: "all", label: "All" }, { value: "survey", label: "Surveys" }, { value: "conversation", label: "Conversations" }, { value: "document", label: "Documents" }]} />
            <div className="flex items-center gap-1.5">
              {["UK", "US", "DE"].map(f => <FilterChip key={f} label={f} selected={facets.includes(f)} onClick={() => toggleFacet(f)} />)}
            </div>
          </FilterBar>
        </Block>

        {/* Timeline & Activity Feed ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Block eyebrow="Intelligence" title="Timeline">
            <Timeline items={[
              { title: "Research question defined", timestamp: "12 Jun", tone: "success", icon: "check", description: "Does post-match timing drive merchandise sales?" },
              { title: "Survey fielded", timestamp: "14 Jun", tone: "info", icon: "survey", description: "1,284 responses across 3 markets." },
              { title: "Intelligence generated", timestamp: "28 Jun", tone: "accent", icon: "sparkles" },
              { title: "Report pending", timestamp: "—", tone: "neutral", icon: "document" },
            ]} />
          </Block>
          <Block eyebrow="Intelligence" title="Activity Feed">
            <ActivityFeed items={[
              { actor: "Edward Desbois", action: "approved the", target: "Executive Report", timestamp: "2h ago" },
              { actor: "Sana Malik", action: "attached a", target: "conversation search", timestamp: "5h ago" },
              { action: "Intelligence generation completed", icon: "sparkles", tone: "accent", timestamp: "1d ago" },
              { actor: "Tom Reilly", action: "created the project", timestamp: "3d ago" },
            ]} />
          </Block>
        </div>

        {/* Progressive states ──────────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Progressive states">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <ProgressBar value={72} label="Collection progress" />
              <ProgressBar indeterminate label="Syncing responses" />
              <ProgressSteps steps={[
                { label: "Collect evidence", description: "3 sources attached", state: "done" },
                { label: "Analyse findings", description: "Generating intelligence", state: "active" },
                { label: "Communicate", description: "Reports & article", state: "pending" },
                { label: "Conclude", state: "pending" },
              ]} />
            </div>
            <GenerationProgress
              status="Analysing 1,284 responses across 3 markets…"
              steps={[
                { label: "Parsing", state: "done" },
                { label: "Clustering themes", state: "active" },
                { label: "Scoring confidence", state: "pending" },
                { label: "Drafting", state: "pending" },
              ]}
            />
          </div>
        </Block>

        {/* SentimentBar standalone ─────────────────────────────────────────── */}
        <Block eyebrow="Intelligence" title="Sentiment split">
          <div className="max-w-md"><SentimentBar positive={61} neutral={28} negative={11} /></div>
        </Block>
      </PageContainer>

      {/* The Evidence Drawer, driven by the demos above. */}
      <EvidenceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        eyebrow="Evidence"
        title="Fan Motivation Survey — UK"
        subtitle="3 supporting items · high confidence"
        footer={<div className="flex items-center justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => setDrawerOpen(false)}>Close</Button><Button variant="primary" size="sm">Cite in report</Button></div>}
      >
        <div className="space-y-3">
          <ConfidenceIndicator level="high" basis="triangulated across 3 sources" />
          <EvidenceCard kind="stat" content="68%" sourceType="survey" sourceName="Q12 · purchase intent" confidence="high" />
          <EvidenceCard kind="quote" content="I wanted the shirt the moment we won — but nothing came until days later." sourceType="conversation" sourceName="r/soccer" meta="14 Jun" sentiment="positive" />
          <EvidenceCard kind="excerpt" content="Retail comms currently fire on a weekly batch, decoupled from match results." sourceType="document" sourceName="CRM Audit 2026" meta="p.14" />
        </div>
      </EvidenceDrawer>
    </AdminShell>
  );
}

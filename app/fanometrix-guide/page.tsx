/**
 * Fanometrix Platform Guide
 *
 * This page imports live constants from the codebase so key values stay
 * in sync automatically when the platform changes:
 *   - SURVEY_LIMITS  → MPU content limits table
 *   - STATUS_META    → Campaign status table
 *   - ACTION_LABELS  → Campaign action descriptions
 *
 * Narrative sections (step-by-step instructions, descriptions) are static
 * text and must be reviewed manually when related features change.
 */
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SURVEY_LIMITS } from "@/lib/survey-validation";
import { STATUS_META, ACTION_LABELS } from "@/lib/campaign-status";
import styles from "./guide.module.css";

const N = "#0B1929";
const G = "#D7B87A";

export const metadata: Metadata = {
  title: "Fanometrix Platform Guide",
  description: "A complete guide to the Fanometrix Pulse platform.",
  icons: [
    { rel: "icon",          url: "/FLogo.png", type: "image/png" },
    { rel: "apple-touch-icon", url: "/FLogo.png" },
  ],
};

// ─── Reusable layout primitives ───────────────────────────────────────────────

function Section({ children, gray, id }: { children: React.ReactNode; gray?: boolean; id?: string }) {
  return (
    <section id={id} style={{ padding: "64px 24px", background: gray ? "#F9FAFB" : "#fff" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: G, marginBottom: 10 }}>{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: "clamp(22px, 3.5vw, 30px)", fontWeight: 700, color: N, lineHeight: 1.2, marginBottom: 14 }}>{children}</h2>;
}

function Subtitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 15, color: "#6B7280", lineHeight: 1.7, marginBottom: 32 }}>{children}</p>;
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: N, borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 14, marginTop: 20 }}>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,.82)", lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 26, height: 26, minWidth: 26, background: N, color: G, fontSize: 11, fontWeight: 800, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
            {i + 1}
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0 }}>{item}</p>
        </div>
      ))}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ background: "#F8F9FA" }}>
          {headers.map(h => (
            <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: N, borderBottom: "1px solid #E5E7EB" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: "10px 14px", color: "#374151" }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Pill({ green }: { green?: boolean }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: green ? "#D1FAE5" : "#FEE2E2", color: green ? "#065F46" : "#991B1B" }}>
      {green ? "Yes" : "No"}
    </span>
  );
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        {title}
        <span className={styles.toggle}>+</span>
      </summary>
      <div className={styles.detailBody}>{children}</div>
    </details>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8, padding: 0 }}>
      {items.map(item => (
        <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14 }}>
          <span style={{ color: G, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FanometrixGuidePage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh", background: "#fff", color: "#374151" }}>

      {/* ── Nav ── */}
      <nav style={{ background: N, position: "sticky", top: 0, zIndex: 40 }}>
        <div className={styles.navInner}>
          {/*
            Logo links to /login.
            The middleware redirects logged-in users /login → /home automatically
            so this works for both: logged in → /home, logged out → login form.
          */}
          <Link href="/login" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <Image src="/Fanometrix_Logo.png" alt="Fanometrix" width={110} height={18} style={{ objectFit: "contain", objectPosition: "left" }} />
          </Link>
          <Link href="/home" style={{ color: "rgba(255,255,255,.6)", fontSize: 13, textDecoration: "none" }}>
            ← Back to platform
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{ background: N, padding: "clamp(40px,5vw,64px) 24px clamp(56px,7vw,80px)", textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: G, marginBottom: 16 }}>Platform Guide</p>
        <h1 style={{ fontSize: "clamp(30px,5vw,48px)", fontWeight: 800, color: "#fff", lineHeight: 1.1, letterSpacing: "-.02em", marginBottom: 20 }}>
          Fanometrix <span style={{ color: G }}>Pulse</span>
        </h1>
        <p style={{ fontSize: "clamp(14px,2vw,17px)", color: "rgba(255,255,255,.65)", lineHeight: 1.7, maxWidth: 600, margin: "0 auto 36px" }}>
          A complete guide to creating surveys, running campaigns, building campaign groups and serving fan intelligence through publisher embeds.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {[["◫","Surveys"],["◎","Campaigns"],["⬡","Campaign Groups"],["</>","Deployment"],["◉","User Management"]].map(([icon, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 40, padding: "8px 16px", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span style={{ color: "#fff", fontSize: 12, fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────── */}
      {/* 1. How the platform works                  */}
      {/* ─────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <SectionLabel>Overview</SectionLabel>
          <H2>How the platform works</H2>
          <Subtitle>Three core building blocks. Understanding how they relate makes everything else straightforward.</Subtitle>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {[
            { icon: "◫", title: "Survey", body: "The questionnaire — up to questions with multiple-choice answers. A survey is a reusable template, not tied to any specific campaign or publisher. The same survey can run in dozens of campaigns simultaneously." },
            { icon: "◎", title: "Campaign", body: "One survey running for one publisher, with specific dates, a response target, and a live/paused/closed status. The campaign controls whether responses are collected. Each campaign gets its own embed code." },
            { icon: "⬡", title: "Campaign Group", body: "A bundle of campaigns served through a single embed code. When the embed loads, Fanometrix picks an eligible campaign and serves it. The publisher only ever needs one URL." },
          ].map(({ icon, title, body }) => (
            <div key={title} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "26px 24px", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 24, marginBottom: 14 }}>{icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: N, marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>{body}</p>
            </div>
          ))}
        </div>
        <InfoBox>
          💡 <strong style={{ color: G }}>Key principle:</strong> Surveys are templates. Campaigns are delivery vehicles. Campaign Groups are playlists. Publishers get one URL and you control everything else from the admin.
        </InfoBox>
      </Section>

      {/* ─────────────────────────────────────────── */}
      {/* 2. Surveys                                 */}
      {/* ─────────────────────────────────────────── */}
      <Section gray>
        <SectionLabel>Section 2</SectionLabel>
        <H2>Surveys</H2>
        <Subtitle>A survey is a questionnaire — up to {SURVEY_LIMITS.MAX_QUESTIONS} questions, each with up to {SURVEY_LIMITS.MAX_OPTIONS} multiple-choice answers. Surveys are reusable templates, independent of campaigns.</Subtitle>

        <div className={styles.accordion}>
          <Accordion title="Survey statuses">
            <DataTable
              headers={["Status", "Meaning"]}
              rows={[
                [<strong key="d">Draft</strong>,    "Still being written. Cannot be attached to a campaign yet."],
                [<strong key="r">Ready</strong>,    "Complete and approved. Can be attached to any campaign."],
                [<strong key="a">Archived</strong>, "Hidden from the default view but still searchable and reusable."],
                [<strong key="x">Deleted</strong>,  "Soft deleted. Not visible by default. Can still be restored by an admin."],
              ]}
            />
            <InfoBox>
              A survey is <strong style={{ color: G }}>never Live</strong>. Campaigns control serving. The same survey can be in a Live campaign, a Paused campaign, and a Closed campaign simultaneously.
            </InfoBox>
          </Accordion>

          <Accordion title="Creating a survey">
            <Steps items={[
              <span key="1">Go to <strong>Surveys</strong> in the left navigation and click <strong>+ Create Survey</strong>.</span>,
              <span key="2">Give the survey a <strong>name</strong> and optional description. Set status to <strong>Draft</strong>.</span>,
              <span key="3">Add up to <strong>{SURVEY_LIMITS.MAX_QUESTIONS} questions</strong>, each with {SURVEY_LIMITS.MAX_OPTIONS <= 4 ? `up to ${SURVEY_LIMITS.MAX_OPTIONS}` : SURVEY_LIMITS.MAX_OPTIONS} answer options.</span>,
              <span key="4">Customise the <strong>Thank You screen</strong> shown to fans after completing the survey.</span>,
              <span key="5">Click <strong>Preview</strong> to see how it looks in the 300×250 MPU. No responses are recorded in preview mode.</span>,
              <span key="6">When approved, change status to <strong>Ready</strong>. It can now be attached to campaigns.</span>,
            ]} />
          </Accordion>

          <Accordion title={`MPU content limits (auto-synced from codebase)`}>
            <DataTable
              headers={["Field", "Limit", "Reason"]}
              rows={[
                ["Questions per survey",   `${SURVEY_LIMITS.MAX_QUESTIONS} max`,               "MPU body height constraint"],
                ["Answers per question",   `${SURVEY_LIMITS.MAX_OPTIONS} max`,                 "Fits within 250px height"],
                ["Question text",          `${SURVEY_LIMITS.MAX_Q_CHARS} characters`,           "Two wrapped lines at 11.5px"],
                ["Answer option",          `${SURVEY_LIMITS.MAX_OPT_CHARS} characters`,         "Single line at 10.5px"],
                ["Thank-you title",        `${SURVEY_LIMITS.MAX_TY_TITLE} characters`,          "Single bold line"],
                ["Thank-you message",      `${SURVEY_LIMITS.MAX_TY_BODY} characters`,           "~3 lines at 10.5px"],
              ]}
            />
          </Accordion>

          <Accordion title="Deletion rules">
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>A survey can only be deleted if it has <strong>zero responses</strong> and is <strong>not linked to any campaigns</strong>. If either condition is not met, the Delete button is disabled. Archive instead — archived surveys remain searchable and can be restored.</p>
          </Accordion>
        </div>
      </Section>

      {/* ─────────────────────────────────────────── */}
      {/* 3. Campaigns                               */}
      {/* ─────────────────────────────────────────── */}
      <Section>
        <SectionLabel>Section 3</SectionLabel>
        <H2>Campaigns</H2>
        <Subtitle>A campaign connects a survey to a publisher. It controls when responses are collected, how many are targeted, and whether the embed is currently live.</Subtitle>

        <div className={styles.accordion}>
          <Accordion title="Campaign lifecycle (auto-synced from codebase)">
            <DataTable
              headers={["Status", "Meaning", "Accepts responses?"]}
              rows={Object.entries(STATUS_META).map(([key, m]) => [
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                  <span>{m.dot}</span> {m.label}
                </span>,
                key === "draft"     ? "Being set up, not yet deployed" :
                key === "scheduled" ? "Ready but start date hasn't arrived" :
                key === "live"      ? "Actively collecting responses" :
                key === "paused"    ? "Temporarily stopped, can be resumed" :
                key === "closed"    ? "Permanently finished" :
                                      "Hidden from the default view — historical record",
                <Pill key={key} green={key === "live"} />,
              ])}
            />
            <InfoBox>
              ⚡ Fanometrix <strong style={{ color: G }}>automatically</strong> moves a campaign from Scheduled → Live on the start date, and from Live → Closed when the end date passes or the target response count is reached.
            </InfoBox>
          </Accordion>

          <Accordion title="Campaign actions (auto-synced from codebase)">
            <DataTable
              headers={["Action", "When available", "What it does"]}
              rows={[
                [ACTION_LABELS.publish,  "Draft",            "Sets to Scheduled (waiting for start date)"],
                [ACTION_LABELS.go_live,  "Draft or Scheduled","Makes the campaign immediately Live"],
                [ACTION_LABELS.pause,    "Live or Scheduled", "Temporarily stops collecting responses"],
                [ACTION_LABELS.resume,   "Paused",            "Resumes collecting responses"],
                [ACTION_LABELS.close,    "Live or Paused",    "Permanently ends the campaign"],
                [ACTION_LABELS.archive,  "Closed",            "Moves to the Archived tab"],
                [ACTION_LABELS.restore,  "Archived",          "Brings back to Closed status"],
                ["Duplicate",            "Always",            "Creates a Draft copy with dates cleared and responses reset to zero"],
              ]}
            />
          </Accordion>

          <Accordion title="Creating a campaign">
            <Steps items={[
              <span key="1">Go to <strong>Campaigns</strong> and click <strong>+ Create Campaign</strong>.</span>,
              <span key="2">Enter <strong>Brand Name</strong> and <strong>Campaign Name</strong>. Click <strong>Auto</strong> to generate the Campaign ID.</span>,
              <span key="3">Set <strong>Start Date</strong> and <strong>End Date</strong>. Automatic transitions happen on these dates.</span>,
              <span key="4">Optionally set a <strong>Target Responses</strong> number — the campaign closes automatically when this is hit.</span>,
              <span key="5">Select the <strong>Survey</strong> and enter the <strong>Publisher</strong> name.</span>,
              <span key="6">Save as <strong>Draft</strong>. When ready, click <strong>Go Live Now</strong> or <strong>Publish</strong>.</span>,
            ]} />
          </Accordion>

          <Accordion title="Deletion rules">
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>Campaigns can only be deleted if status is <strong>Draft</strong> or <strong>Scheduled</strong> AND they have <strong>zero responses</strong>. Campaigns with responses can never be hard-deleted — archive them instead. This protects reporting integrity and historical audit trails.</p>
          </Accordion>
        </div>
      </Section>

      {/* ─────────────────────────────────────────── */}
      {/* 4. Campaign Groups                         */}
      {/* ─────────────────────────────────────────── */}
      <Section gray>
        <SectionLabel>Section 4</SectionLabel>
        <H2>Campaign Groups</H2>
        <Subtitle>A Campaign Group bundles multiple campaigns together under one embed code. When the embed loads, Fanometrix picks an eligible campaign and serves it. Responses link to the specific campaign served — not the group.</Subtitle>

        <div className={styles.accordion}>
          <Accordion title="When to use a Campaign Group">
            <CheckList items={[
              "You want to run multiple surveys on the same publisher placement at the same time",
              "You want to rotate between surveys without the publisher updating their embed code",
              "You want a fallback if one campaign pauses or closes mid-flight",
              "You want to run one survey across multiple publishers (one campaign per publisher, all in a group)",
            ]} />
            <InfoBox>
              🏗️ The publisher gets <strong style={{ color: G }}>one URL</strong> and trafficks it once. You control which surveys run, add or remove campaigns, or pause the whole group — without asking the publisher to change anything.
            </InfoBox>
          </Accordion>

          <Accordion title="Rotation types">
            <DataTable
              headers={["Type", "How it works", "Best for"]}
              rows={[
                ["Equal",    "Each eligible campaign has the same chance on every load",    "Most situations — default"],
                ["Weighted", "Campaigns with higher weight values are served more often",   "When one survey should run more frequently"],
                ["Priority", "The eligible campaign with the lowest priority number serves first", "One primary survey with fallback backups"],
              ]}
            />
          </Accordion>

          <Accordion title="Eligibility rules">
            <p style={{ fontSize: 14, marginBottom: 12 }}>Every time the embed loads, Fanometrix checks each campaign in the group:</p>
            <CheckList items={[
              "Group must be Live and within its date range",
              "Campaign must have status Live",
              "Campaign must be within its own start and end dates",
              "Campaign must not have reached its target response count",
              "Campaign's survey must exist, not be deleted, and pass MPU validation",
            ]} />
            <p style={{ fontSize: 14, marginTop: 12, color: "#6B7280" }}>If no campaigns are eligible the embed renders blank — publishers see an empty ad slot, not an error.</p>
          </Accordion>

          <Accordion title="The group embed code">
            <pre style={{ background: "#0d1117", color: "#7ee787", fontSize: 12, borderRadius: 10, padding: "14px 16px", overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6, fontFamily: "ui-monospace,monospace" }}>
{`/embed?group=carlsberg_research_wave1_fotmob
  &publisher=fotmob
  &placement=homepage-mpu
  &country=%%COUNTRY%%`}
            </pre>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 12 }}>Copy directly from the group card in Campaign Groups. The publisher trafficks it once; you control everything else.</p>
          </Accordion>
        </div>
      </Section>

      {/* ─────────────────────────────────────────── */}
      {/* 5. Embed Codes                             */}
      {/* ─────────────────────────────────────────── */}
      <Section>
        <SectionLabel>Section 5</SectionLabel>
        <H2>Embed Codes</H2>
        <Subtitle>The embed is a standard 300×250 iframe that publishers drop into their ad serving system. Once trafficked, you control everything from the Fanometrix admin.</Subtitle>

        <div className={styles.accordion}>
          <Accordion title="Two types of embed">
            <DataTable
              headers={["Type", "URL format", "When to use"]}
              rows={[
                ["Single campaign",  "/embed?campaign=slug", "One campaign, one placement"],
                ["Campaign Group",   "/embed?group=slug",    "Multiple campaigns rotating through one placement"],
              ]}
            />
          </Accordion>

          <Accordion title="URL parameters">
            <DataTable
              headers={["Parameter", "Required?", "Example"]}
              rows={[
                [<code key="c">campaign=</code>, "Yes (single)", <code key="v">carlsberg_ucl_2026</code>],
                [<code key="g">group=</code>,    "Yes (group)",  <code key="v2">carlsberg_wave1</code>],
                [<code key="p">publisher=</code>,"Recommended",  <code key="v3">fotmob</code>],
                [<code key="pl">placement=</code>,"Recommended", <code key="v4">homepage-mpu</code>],
                [<code key="co">country=</code>, "Recommended",  <code key="v5">%%COUNTRY%%</code>],
                [<code key="cl">club=</code>,    "Optional",     <code key="v6">Arsenal</code>],
                [<code key="cm">competition=</code>,"Optional",  <code key="v7">Premier+League</code>],
              ]}
            />
          </Accordion>

          <Accordion title="Country macros by ad server">
            <DataTable
              headers={["Ad Server", "Country Macro"]}
              rows={[
                ["Google Ad Manager / DV360",  <code key="gam">%%COUNTRY%%</code>],
                ["Xandr (AppNexus)",            <code key="x">${"{GEO_COUNTRY}"}</code>],
                ["Freewheel",                   <code key="fw">[country]</code>],
                ["The Trade Desk",              <code key="ttd">##COUNTRY##</code>],
                ["Direct / hardcoded test",     <code key="d">GB</code>],
              ]}
            />
          </Accordion>

          <Accordion title="End-to-end launch checklist">
            <Steps items={[
              <span key="1">Create a <strong>Survey</strong> and set status to <strong>Ready</strong></span>,
              <span key="2">Create a <strong>Campaign</strong>, attach the survey, add dates and a publisher</span>,
              <span key="3">Use the <strong>Deployment</strong> page to generate the iframe code</span>,
              <span key="4">Test the embed URL in a browser (hardcode <code>country=GB</code>)</span>,
              <span key="5">Send the iframe code to the publisher</span>,
              <span key="6">Click <strong>Go Live Now</strong> on the campaign card</span>,
              <span key="7">Monitor responses on the <strong>Dashboard</strong></span>,
            ]} />
          </Accordion>
        </div>
      </Section>

      {/* ─────────────────────────────────────────── */}
      {/* 6. User Management                         */}
      {/* ─────────────────────────────────────────── */}
      <Section gray>
        <SectionLabel>Section 6</SectionLabel>
        <H2>User Management</H2>
        <Subtitle>Fanometrix accounts are organisation-based. Each account represents a company — a brand, agency or publisher — not an individual. No personal data (names, emails) is stored.</Subtitle>

        <div className={styles.accordion}>
          <Accordion title="Account roles">
            <DataTable
              headers={["Role", "What they can see"]}
              rows={[
                [<strong key="a">Admin</strong>,     "Everything — full platform access including user management"],
                [<strong key="b">Brand</strong>,     "Dashboard, Campaign Reports, Exports, Insights — for their allowed campaigns only"],
                [<strong key="ag">Agency</strong>,   "Dashboard, Campaign Reports, Publisher Performance, Exports — for their allowed campaigns and publishers"],
                [<strong key="p">Publisher</strong>, "Dashboard, Publisher Performance — filtered to their own publisher data"],
              ]}
            />
          </Accordion>

          <Accordion title="Creating an account">
            <Steps items={[
              <span key="1">Go to <strong>User Management</strong> and click <strong>+ New Account</strong></span>,
              <span key="2">Set a <strong>Username</strong> — letters, numbers, underscores and hyphens. Login is not case-sensitive.</span>,
              <span key="3">Click <strong>⚡ Generate Temporary Password</strong>. Copy the credentials — the password is shown only once.</span>,
              <span key="4">Leave <strong>Force password change on first login</strong> ticked — the user sets their own permanent password on first login.</span>,
              <span key="5">Select <strong>Access Rights</strong> and enter the <strong>Organisation Name</strong>.</span>,
              <span key="6">Optionally set <strong>Campaign Access</strong> and <strong>Publisher Access</strong> to restrict the account to specific data.</span>,
            ]} />
          </Accordion>

          <Accordion title="Password policy">
            <CheckList items={[
              "Passwords are stored as hashed values only — never visible to admins",
              "Use Generate Temporary Password to create a strong random password",
              "Share credentials via Teams, Slack, email or WhatsApp",
              "The user sets their own permanent password on first login",
              "Reset a password at any time via Edit → Generate Temporary Password",
            ]} />
          </Accordion>
        </div>
      </Section>

      {/* ─────────────────────────────────────────── */}
      {/* 7. Reporting                               */}
      {/* ─────────────────────────────────────────── */}
      <Section>
        <SectionLabel>Section 7</SectionLabel>
        <H2>Reporting</H2>
        <Subtitle>Every response is stored and linked to the exact campaign that served it. Filter and segment by campaign, publisher, placement, country, device and more.</Subtitle>

        <div className={styles.accordion}>
          <Accordion title="What is captured per response">
            <DataTable
              headers={["Field", "Description"]}
              rows={[
                ["Campaign",       "Which campaign served this response"],
                ["Survey",         "Which survey was shown"],
                ["Publisher",      "Which publisher's site this came from"],
                ["Placement",      "Which placement on the publisher's site"],
                ["Country",        "The viewer's country (from ad server macro)"],
                ["Device",         "Desktop, mobile or tablet"],
                ["Browser",        "Chrome, Safari, Firefox etc."],
                ["Response time",  "How long the fan took to complete the survey"],
                ["Q1–Q4",          "The answer chosen for each question"],
                ["Timestamp",      "When the response was submitted"],
              ]}
            />
          </Accordion>

          <Accordion title="Demo data">
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>The <strong>Demo Data</strong> page lets you generate sample responses for any campaign. These are flagged as demo data and excluded from all reporting and response counts. Useful for testing embeds before real fans respond. Demo responses can be deleted at any time without affecting real data.</p>
          </Accordion>

          <Accordion title="Looker Studio integration">
            <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 12 }}>The platform exposes a reporting view (<code>vw_campaign_responses</code>) that connects directly to Google Looker Studio via the PostgreSQL connector. See the <strong>Reporting</strong> page in the admin for connection details and API documentation.</p>
            <InfoBox>📊 Responses, campaigns and surveys with real data can never be hard-deleted, protecting your reporting and audit trail.</InfoBox>
          </Accordion>
        </div>
      </Section>

      {/* ─────────────────────────────────────────── */}
      {/* 8. Quick Reference                         */}
      {/* ─────────────────────────────────────────── */}
      <Section gray>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <SectionLabel>Section 8</SectionLabel>
          <H2>Quick Reference</H2>
        </div>

        <div className={styles.accordion}>
          <Accordion title="Key rules at a glance">
            <DataTable
              headers={["Rule", "Reason"]}
              rows={[
                ['A survey has no "Live" status',                                   "Campaigns control serving, not surveys"],
                ["Surveys with responses cannot be hard-deleted",                   "Protects reporting integrity"],
                ["Campaigns with responses cannot be deleted",                      "Protects reporting integrity"],
                ["Only draft/scheduled campaigns with 0 responses can be deleted",  "Prevents accidental data loss"],
                ["One campaign = one publisher",                                    "Use Campaign Groups for multi-publisher research"],
                ["Group embed serves only Live campaigns",                          "Paused/closed campaigns are skipped automatically"],
                ["Passwords are write-only",                                        "Admin can set or reset but never view passwords"],
              ]}
            />
          </Accordion>

          <Accordion title="Common questions">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { q: "Can I use the same survey in two campaigns at once?",           a: "Yes. A survey is a template. You can attach it to as many campaigns as you like, all running simultaneously. Responses are separated by campaign in reporting." },
                { q: "What happens if all campaigns in a group are paused?",           a: "The embed renders blank — publishers see an empty ad slot. As soon as any campaign becomes eligible again, the embed starts serving automatically." },
                { q: "Can I change the survey attached to a live campaign?",           a: "Yes, by editing the campaign. It's usually safer to close the old campaign and create a new one to avoid mixing question sets in reporting." },
                { q: "How do I give a client access to their campaign data only?",     a: "When creating their account, use Campaign Access to select only the campaigns they should see. Their dashboard and reports are filtered automatically." },
              ].map(({ q, a }) => (
                <div key={q} style={{ padding: "14px 16px", background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB" }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: N, marginBottom: 6 }}>{q}</p>
                  <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>{a}</p>
                </div>
              ))}
            </div>
          </Accordion>
        </div>
      </Section>

      {/* ── Contact ── */}
      <section style={{ background: N, padding: "64px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: G, marginBottom: 12 }}>Support</p>
            <h2 style={{ fontSize: "clamp(22px,3.5vw,32px)", fontWeight: 700, color: "#fff", marginBottom: 14 }}>Need help?</h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,.65)", lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>The Fanometrix team is available to help with integration, platform questions and commercial enquiries.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
            {[
              { icon: "🔧", title: "Integration Support",     email: "publishers@fanometrix.com",  desc: "Tag implementation, ad server setup and QA" },
              { icon: "🔒", title: "Privacy Questions",       email: "privacy@fanometrix.com",      desc: "GDPR, compliance documentation and privacy queries" },
              { icon: "🤝", title: "Commercial Partnerships", email: "partnerships@fanometrix.com", desc: "Revenue share, insight reports and benchmarking" },
            ].map(({ icon, title, email, desc }) => (
              <a key={title} href={`mailto:${email}`}
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 24, display: "block", textDecoration: "none", transition: "background .2s" }}>
                <div style={{ fontSize: 26, marginBottom: 12 }}>{icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 12, color: G, marginBottom: 8, wordBreak: "break-all" }}>{email}</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.55 }}>{desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: "#060F19", padding: "28px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/login">
              <Image src="/Fanometrix_Logo.png" alt="Fanometrix" width={80} height={14} style={{ objectFit: "contain", opacity: 0.5 }} />
            </Link>
            <span style={{ color: "rgba(255,255,255,.25)", fontSize: 12 }}>Platform Guide · June 2026</span>
          </div>
          <nav style={{ display: "flex", gap: 20 }}>
            <Link href="/privacy" style={{ color: "rgba(255,255,255,.4)", fontSize: 12, textDecoration: "none" }}>Privacy Policy</Link>
            <Link href="/home"    style={{ color: "rgba(255,255,255,.4)", fontSize: 12, textDecoration: "none" }}>Back to platform</Link>
            <a href="mailto:publishers@fanometrix.com" style={{ color: "rgba(255,255,255,.4)", fontSize: 12, textDecoration: "none" }}>Contact</a>
          </nav>
        </div>
      </footer>

    </div>
  );
}

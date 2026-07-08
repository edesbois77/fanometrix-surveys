// Reusable analyst: turns a Survey's raw responses into a structured,
// client-ready intelligence report — the survey-side counterpart to
// analyseConversation.ts, same shape (fetch context → aggregate → build
// prompt → completeJSON() → return typed report), same "pure generation
// only, never persists" contract.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import type { LocalisedQuestion } from "@/lib/survey-locale";

// Below this, a synthesized narrative claim reads as more authoritative
// than the evidence supports — worst-case (p=0.5) 95% margin of error is
// ~14% at n=50 vs ~18% at the app's existing "Medium confidence" floor
// (app/components/InsightsEngine.tsx uses n>=30). Chosen deliberately
// higher than that existing floor: a generated narrative is a heavier
// claim than a single flagged statistic, so it earns a stronger bar.
const MIN_RESPONSES = 50;

export type SurveyIntelligenceReport = {
  headline:            string;
  executive_summary:   string;
  key_findings:        string[];
  notable_differences: { finding: string; segments: string[] }[];
  recommended_actions: { action: string; rationale: string }[];
  generated_at:        string;
  response_count:      number;
};

type QuestionSummary = { text: string; options: { label: string; count: number; pct: number }[] };
type GroupCount       = { label: string; count: number };
type CountryBreakdown = { country: string; options: { label: string; pct: number }[] };

function buildSurveyPrompt(
  survey: { name: string; topic: string | null; study_type: string },
  summary: {
    total: number;
    questions: QuestionSummary[];
    byCountry: GroupCount[];
    byFanSegment: GroupCount[];
    byPublisher: GroupCount[];
    countryBreakdown: CountryBreakdown[];
  }
): string {
  return `You are a senior football fan intelligence analyst at Fanometrix. You are writing a client-ready intelligence report for a brand, club or agency based on survey responses.

Survey: "${survey.name}"
Topic: ${survey.topic ?? "General fan research"}
Study type: ${survey.study_type}

DATA SUMMARY
Total responses analysed: ${summary.total}

${summary.questions.map((q, i) => `Question ${i + 1}: "${q.text}"\n${q.options.map(o => `- ${o.label}: ${o.count} (${o.pct}%)`).join("\n")}`).join("\n\n")}

By Country:
${summary.byCountry.map(c => `- ${c.label}: ${c.count} responses`).join("\n") || "- (not recorded)"}

By Fan Segment:
${summary.byFanSegment.map(f => `- ${f.label}: ${f.count} responses`).join("\n") || "- (not recorded)"}

By Publisher:
${summary.byPublisher.map(p => `- ${p.label}: ${p.count} responses`).join("\n") || "- (not recorded)"}

Question 1 answer breakdown by country:
${summary.countryBreakdown.map(cb => `${cb.country}: ${cb.options.map(o => `${o.label} ${o.pct}%`).join(", ")}`).join("\n") || "- (not enough country spread)"}

YOUR TASK:
Write a structured intelligence report. Use client-ready language — write as you would present to Carlsberg, Liverpool FC, Nike or a Premier League rights holder. Do NOT write statistics — write insights and implications.

Return ONLY valid JSON:
{
  "headline": "One punchy, specific headline summarising the most important finding (max 15 words)",
  "executive_summary": "2-3 sentences. The single most important story in this data. What does this mean for the client?",
  "key_findings": [
    "3-5 specific findings from the response data. Written as client-ready insights, not statistics. E.g. 'Fans strongly favour matchday experiences over digital content, suggesting investment in physical activations will outperform app features.'"
  ],
  "notable_differences": [
    {
      "finding": "A specific, actionable difference between segments — markets, fan segments or publishers. E.g. 'Indian fans significantly prioritise streaming access over UK fans, who focus on matchday experience.'",
      "segments": ["IN", "GB"]
    }
  ],
  "recommended_actions": [
    {
      "action": "Specific recommended action for the client (a brand, club or agency)",
      "rationale": "Why — based on the data"
    }
  ]
}

Write as a senior analyst. Be specific, insightful and commercially relevant. Never write generic observations.`;
}

export async function analyseSurvey(surveyId: string): Promise<SurveyIntelligenceReport> {
  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("name, topic, study_type, questions")
    .eq("id", surveyId)
    .single();

  if (!survey) throw new IntelligenceError(404, "Survey not found");

  const { data: responses } = await supabaseAdmin
    .from("responses")
    .select("q1, q2, q3, country, fan_segment, publisher")
    .eq("survey_id", surveyId);

  const all = responses ?? [];
  if (all.length < MIN_RESPONSES) {
    throw new IntelligenceError(
      400,
      `At least ${MIN_RESPONSES} responses are required for a reliable summary (${all.length} collected so far).`
    );
  }

  // Questions are stored as one JSONB array on the survey; responses store
  // each answer as the selected option's stable numeric id (not its text),
  // positionally against q1/q2/q3 — resolve id -> English option label.
  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);

  function resolveLabel(question: LocalisedQuestion | undefined, raw: string | null): string | null {
    if (!question || raw == null || raw === "") return null;
    const optionId = Number(raw);
    const option = question.options.find(o => o.id === optionId);
    return option?.text.en ?? raw;
  }

  function tallyQuestion(question: LocalisedQuestion | undefined, key: "q1" | "q2" | "q3"): QuestionSummary | null {
    if (!question) return null;
    const counts: Record<string, number> = {};
    let answered = 0;
    for (const r of all) {
      const label = resolveLabel(question, r[key] as string | null);
      if (!label) continue;
      counts[label] = (counts[label] ?? 0) + 1;
      answered++;
    }
    const options = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: answered ? Math.round((count / answered) * 100) : 0 }));
    return { text: question.text.en ?? "", options };
  }

  const questionKeys = ["q1", "q2", "q3"] as const;
  const questionSummaries = questions
    .map((q, i) => tallyQuestion(q, questionKeys[i]))
    .filter((q): q is QuestionSummary => q !== null);

  function tallyGroup(field: "country" | "fan_segment" | "publisher"): GroupCount[] {
    const counts: Record<string, number> = {};
    for (const r of all) {
      const v = r[field] as string | null;
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }

  const byCountry    = tallyGroup("country");
  const byFanSegment = tallyGroup("fan_segment");
  const byPublisher  = tallyGroup("publisher");

  // First question's answer distribution split by country gives the model
  // concrete cross-tab data to write "notable differences" from —
  // mirrors analyseConversation's per-market sentiment breakdown.
  const firstQuestion = questions[0];
  const countryBreakdown: CountryBreakdown[] = firstQuestion
    ? byCountry.slice(0, 4).map(({ label: country }) => {
        const countryResponses = all.filter(r => r.country === country);
        const counts: Record<string, number> = {};
        let answered = 0;
        for (const r of countryResponses) {
          const label = resolveLabel(firstQuestion, r.q1 as string | null);
          if (!label) continue;
          counts[label] = (counts[label] ?? 0) + 1;
          answered++;
        }
        const options = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([label, count]) => ({ label, pct: answered ? Math.round((count / answered) * 100) : 0 }));
        return { country, options };
      })
    : [];

  const summary = {
    total: all.length,
    questions: questionSummaries,
    byCountry, byFanSegment, byPublisher,
    countryBreakdown,
  };

  const report = await completeJSON<Omit<SurveyIntelligenceReport, "generated_at" | "response_count">>({
    prompt: buildSurveyPrompt(
      { name: survey.name, topic: survey.topic, study_type: survey.study_type },
      summary
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    maxTokens:   2048,
  });

  return { ...report, generated_at: new Date().toISOString(), response_count: all.length };
}

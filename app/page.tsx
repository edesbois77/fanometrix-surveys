"use client";

import { useState, useEffect } from "react";

const QUESTIONS = [
  {
    id: "q1",
    text: "How often do you attend live events?",
    options: ["Never", "1–2 times a year", "3–5 times a year", "More than 5 times a year"],
  },
  {
    id: "q2",
    text: "How would you rate your overall fan experience?",
    options: ["Poor", "Average", "Good", "Excellent"],
  },
  {
    id: "q3",
    text: "How likely are you to recommend us to a friend?",
    options: ["Not likely", "Somewhat likely", "Likely", "Very likely"],
  },
];

const COUNTRIES = [
  "United Kingdom", "United States", "France", "Germany", "Spain",
  "Italy", "Brazil", "Argentina", "Australia", "Japan", "Other",
];

export default function SurveyPage() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [country, setCountry] = useState("");
  const [fanSegment, setFanSegment] = useState("");
  const [campaignId, setCampaignId] = useState("default");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("campaign");
    if (c) setCampaignId(c);
  }, []);

  function handleAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!answers.q1) {
      alert("Please answer at least the first question.");
      return;
    }
    if (!country) {
      alert("Please select your country.");
      return;
    }

    setStatus("submitting");

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        q1: answers.q1 ?? null,
        q2: answers.q2 ?? null,
        q3: answers.q3 ?? null,
        country,
        fan_segment: fanSegment || null,
      }),
    });

    if (res.ok) {
      setStatus("success");
    } else {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
          <p className="text-gray-500">Your response has been recorded.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-md p-8 max-w-xl w-full space-y-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-indigo-700">Fanometrix Pulse</h1>
          <p className="mt-1 text-gray-500 text-sm">
            Your feedback helps us improve the fan experience. Takes 60 seconds.
          </p>
        </div>

        {QUESTIONS.map((q) => (
          <fieldset key={q.id} className="space-y-3">
            <legend className="font-semibold text-gray-800">{q.text}</legend>
            <div className="space-y-2">
              {q.options.map((opt) => (
                <label
                  key={opt}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    answers[q.id] === opt
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300"
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => handleAnswer(q.id, opt)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="space-y-2">
          <label className="font-semibold text-gray-800 block">Country</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:border-indigo-500"
            required
          >
            <option value="">Select your country…</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="font-semibold text-gray-800 block">
            Fan segment{" "}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <p className="text-xs text-gray-400">
            e.g. Season ticket holder, Casual viewer, VIP member
          </p>
          <input
            type="text"
            value={fanSegment}
            onChange={(e) => setFanSegment(e.target.value)}
            placeholder="Describe your fan type…"
            className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {status === "error" && (
          <p className="text-red-500 text-sm">Something went wrong. Please try again.</p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
        >
          {status === "submitting" ? "Submitting…" : "Submit your response"}
        </button>
      </form>
    </main>
  );
}

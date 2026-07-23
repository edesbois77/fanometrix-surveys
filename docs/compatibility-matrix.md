# Assertion Type × Contribution Kind — the Compatibility Matrix

> **Status:** **Canonical for Phase 2.** The artefact that determines what
> Fanometrix may legitimately claim, and from what. Referenced by
> `docs/intelligence-model.md` §12.4 as the piece that must be agreed before
> anything is built against it.
>
> Implements Principle 9 (evidence suitability is enforced, not advisory) and
> completes the source-side model designed in `docs/evidence-contribution.md`.
> No implementation detail. Versioned: see §8.

---

## 1. What this decides

One question, asked 42 times:

> **May evidence of this kind be used to support a claim of this kind, and if so,
> under what constraint?**

The answer is a gate. Evidence that fails it is excluded from the claim with a
stated reason and retained on the record. It is not down-weighted, not flagged
for review, not left to a prompt's judgement. This is the difference between
suitability being enforced and being advised, and it is the mechanism that scales:
with six sources a person can reason about admissibility case by case, with forty
they cannot.

**What this does not decide.** Whether a claim is true, whether it is material,
whether it is well written, or how confident we are. It decides only what may be
brought to bear.

---

## 2. The two axes

Neither axis is invented here. Both are recorded so the matrix is readable alone.

**Contribution Kind** (`docs/evidence-contribution.md` §3) — what a source can
produce. Each carries one prohibition, and that prohibition is what generates its
row in the matrix.

| Kind | Establishes | Its single prohibition |
|---|---|---|
| `elicited_perception` | What people say when asked | Self-reported, never observed |
| `unprompted_discourse` | What people say unbidden, and what is rising or fading | Never population magnitude |
| `documented_activity` | What verifiably happened, and how it was reported | Never what anyone thought of it |
| `interested_claim` | What a party says about itself | Never that the claim is true |
| `expert_judgement` | A named professional's assessment | Never consensus |
| `established_knowledge` | Prior research, benchmarks, market structure | Never that it holds here |

**Assertion Type** (`docs/intelligence-model.md` §4) — what kind of claim is being
made: `descriptive`, `comparative`, `magnitude`, `temporal`, `causal`,
`predictive`, `absence`.

---

## 3. The verdict vocabulary

Four readings, three gate values. Nativeness is a separate property from
admissibility, because "may be used" and "is what this kind is for" are different
questions and collapsing them loses the second.

| Symbol | Gate | Nativeness | Meaning |
|---|---|---|---|
| ● | admissible | native | This is what the kind exists to establish. It may carry the claim. |
| ○ | admissible | not native | Legitimate, but the kind is working outside its home ground. |
| ◐ | admissible with limits | not native | May support, but **cannot carry the claim alone**. Always constrained. |
| ✕ | inadmissible | n/a | May never support a claim of this kind, however relevant it appears. |

---

## 4. The matrix

|  | elicited perception | unprompted discourse | documented activity | interested claim | expert judgement | established knowledge |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **descriptive** | ● | ● | ● | ◐ | ◐ | ◐ |
| **comparative** | ○ | ◐ | ● | ✕ | ◐ | ◐ |
| **magnitude** | ● | ✕ | ● | ✕ | ✕ | ◐ |
| **temporal** | ◐ | ● | ● | ✕ | ◐ | ◐ |
| **causal** | ◐ | ◐ | ◐ | ✕ | ◐ | ◐ |
| **predictive** | ◐ | ✕ | ◐ | ✕ | ◐ | ◐ |
| **absence** | governed by search adequacy, not by kind. See §7. |

The matrix has an internal logic worth checking against: **each row of a kind
follows from that kind's single prohibition.** `interested_claim` is inadmissible
almost everywhere because it can only ever establish that a claim was made.
`established_knowledge` is with-limits almost everywhere because it can never
establish that it holds here. If a proposed cell does not follow from the kind's
prohibition, either the cell is wrong or the prohibition is incomplete.

---

## 5. The constraints, cell by cell

Only cells that constrain are listed. Where a cell is ● with no entry, the kind
is doing what it exists for and the general rules in §6 apply.

### descriptive

- `documented_activity` ● — describes events, never reception. "The activation ran
  in four markets" is admissible; "the activation landed well" is not.
- `interested_claim` ◐ — may establish only **that the claim was made**, and the
  statement must attribute it. "X said its activation reached two million people",
  never "X's activation reached two million people".
- `expert_judgement` ◐ — describes one professional's assessment, attributed.
  Never the state of the world without corroboration from another kind.
- `established_knowledge` ◐ — describes what prior research found **elsewhere**.
  Describing this engagement's situation requires local evidence.

### comparative

- `elicited_perception` ○ — admissible only where **both sides were measured by
  the same instrument on comparable populations**. An asymmetric comparison is
  inadmissible, not merely weaker.
- `unprompted_discourse` ◐ — may compare **what is said** about two subjects,
  never **how much**. Discourse volume tracks baseline salience: a larger brand
  generates more conversation regardless of the question being asked.
- `documented_activity` ● — comparing what two parties verifiably did is a home
  strength.
- `interested_claim` ✕ — **a party's account of itself may never ground a
  comparison against a rival.** This is the most commercially dangerous cell in
  the matrix: it is the mechanism by which a client's own case study becomes
  evidence that it outperformed a competitor.
- `expert_judgement` ◐ — only where the named expert assessed **both** sides.
- `established_knowledge` ◐ — a benchmark compares only if this engagement falls
  inside the benchmark's population. State the population.

### magnitude

- `elicited_perception` ● — the kind built for it. Constrained to magnitude **of
  stated attitude**, within the sampled population, which becomes the claim's
  scope mandatorily (§6.4).
- `unprompted_discourse` ✕ — **the single most important prohibition in this
  document.** Conversation volume is a product of platform, collection window,
  query design and salience. It can never establish what share of a population
  thinks anything. Share-of-voice between subjects collected the same way is a
  magnitude of *discourse*, and if claimed must be framed as a `descriptive`
  claim about discourse, not as a magnitude about people.
- `documented_activity` ● — counts of verifiable events are magnitudes of
  activity. Two constraints: magnitude of **activity, never of opinion**; and a
  count of **items, never of independent sources**. Fifty articles is fifty
  articles and one line of evidence, and both are true.
- `interested_claim` ✕ — a party's own reach, impact or engagement figures are
  claims, not measurements, whatever their precision.
- `expert_judgement` ✕ — an informed estimate is not a measurement.
- `established_knowledge` ◐ — a prior magnitude may be cited as a **benchmark**,
  never restated as this engagement's measurement.

### temporal

- `elicited_perception` ◐ — requires **repeated measurement with the same
  instrument**. A single wave cannot show change, however suggestive.
- `unprompted_discourse` ● — salience over time is a home strength. Constrained to
  change in **discourse**, not change in **opinion**, and valid only where
  collection was continuous and comparable across the window. A changed query or
  a changed connector invalidates the series.
- `documented_activity` ● — chronology is a home strength.
- `interested_claim` ✕.
- `expert_judgement` ◐ — attributed.
- `established_knowledge` ◐ — may establish a historical trend, never the current
  one.

### causal

No kind is native to causation, and this is deliberate. See §6.1: **no causal
claim may rest on a single contribution kind.**

- `elicited_perception` ◐ — a self-reported reason is an **attribution**, not a
  cause. Admissible only where the claim is framed as what people say caused it.
- `unprompted_discourse` ◐ — as above, unprompted. People explaining themselves is
  still self-report.
- `documented_activity` ◐ — establishes **sequence**, never cause. Post hoc ergo
  propter hoc is the failure this cell exists to prevent.
- `interested_claim` ✕ — "our activation drove awareness" is the purest form of
  unwarranted causal claim, and it arrives pre-written in most client material.
- `expert_judgement` ◐ — an attributed causal assessment, never presented as
  established.
- `established_knowledge` ◐ — the one kind that can carry real causal weight, and
  only where **the cited research design supports causal inference**. A
  correlational study cited for a causal claim is inadmissible even though the
  kind is admissible.

### predictive

- `elicited_perception` ◐ — stated intent is weakly predictive and systematically
  overstated. Must be labelled as stated intent, never as expected behaviour.
- `unprompted_discourse` ✕ — discourse trends describe attention, not outcomes.
- `documented_activity` ◐ — an announced or contracted plan is a documented
  **intention**, not a prediction of its outcome.
- `interested_claim` ✕.
- `expert_judgement` ◐ — an attributed forecast.
- `established_knowledge` ◐ — a base rate applies only if this engagement is
  inside the population it was derived from.

---

## 6. Combination rules

Four rules no single cell can express. They govern the grounds as a set.

**6.1 No causal or predictive claim may rest on a single contribution kind.**
Every cell in those rows is at best ◐, so a claim resting on one kind rests
entirely on evidence that cannot carry it. Corroboration must cross kinds, not
merely cross sources.

**6.2 Grounds that are entirely `with limits` cannot yield high confidence.**
"Cannot carry the claim alone" is meaningless if enough such evidence can. A claim
whose every supporting citation is ◐ is capped, regardless of volume.

**6.3 A comparative claim requires symmetric grounds.** Both sides must be
established by the same kind, gathered comparably. Asymmetry is inadmissible, not
a weakness to be noted. Enforced at warranting, where both sides are visible.

**6.4 A magnitude claim inherits its sampled population as scope, mandatorily.**
The population that was measured is the population the claim is about. This is the
one place where the matrix directly writes a field on the claim.

---

## 7. Absence is governed separately

An `absence` claim has no grounds by definition, so no cell can govern it. It is
governed instead by **search adequacy**: how much admissible evidence was examined
against the need, and whether the examination actually ran.

The distinction that matters, and it is a distinction the platform must never
blur:

- **We examined the admissible evidence and none of it answers this.** A null
  finding. Reportable, deliverable, and confident in proportion to the size and
  quality of what was examined.
- **No evidence of a kind that could answer this was ever collected.** Not a
  finding at all. An open information need, and a collection requirement.

The first says something about the world. The second says something about our
research. Presenting the second as the first is how a gap in our diligence becomes
a claim about a client's audience.

---

## 8. Revision

This matrix will be wrong somewhere, and the errors will only surface in use. It
is therefore **versioned**, and findings record the version they were formed
under, so a 2027 finding remains interpretable after a 2029 revision.

Amendment rules:

1. **A cell may be tightened freely.** Moving toward inadmissible is always safe.
2. **Loosening a cell requires the prohibition it rests on to be revisited.**
   If `unprompted_discourse × magnitude` ever moves off ✕, it is because the
   kind's prohibition changed, and that is an amendment to
   `docs/evidence-contribution.md`, not a local exception.
3. **A new contribution kind must carry a prohibition none of the six carry**, and
   arrives with its full row.
4. **A new assertion type arrives with its full column**, and a stated demand
   level.
5. **No cell is decided by a prompt, a model or a runtime judgement.** If a case
   is genuinely unclear, it is amended here first.

---

*The matrix is small on purpose. Forty-two decisions, each following from a
prohibition, is a thing an organisation can hold in its head and argue about.
That is worth considerably more than a sophisticated rule the platform applies
and nobody can check.*

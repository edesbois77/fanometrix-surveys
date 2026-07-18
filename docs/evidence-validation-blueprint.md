# Fanometrix — Evidence Validation Blueprint

> **Status:** Agreed / canonical design. **Implementation pending** — this is the
> reference a future build works from. Adds a researcher-controlled validation
> gate between Collection and Analysis. Extends the Research Engine constitution
> (`docs/research-engine-architecture.md`) and the Evidence Lifecycle
> (`docs/evidence-lifecycle.md`) — it changes *what feeds Analysis*, never how
> evidence is stored (append-only is preserved).

---

## 1. The principle

- **Collection is automated.** Connectors gather candidate conversations.
- **Evidence is researcher-controlled.** A human validates it before it counts.
- **Only Approved evidence feeds Analysis and Reports.**

Approval and exclusion are *states and flags* over the append-only base — nothing
is deleted to validate evidence, and every decision is audited. (Deleting a whole
search — for a genuine mistake — is the one destructive exception, §5.)

---

## 2. The search lifecycle

One state per Conversation Search. **No "Rejected"** — a wrong search is deleted;
otherwise the flow is a straight line with a re-approval loop for new evidence:

```
 Draft ──Run──▶ Collecting ──completes with new evidence──▶ Pending Approval ──Approve──▶ Approved
   ▲                                                              ▲                          │
 (edit)                                                           └──── run adds NEW ─────────┘
                                                                        evidence
 Approved ──Archive──▶ Archived        (Archived preserves approval; collection frozen)
 Any state ──Delete──▶ (removed — the one destructive action, §5)
```

| State | Meaning | Feeds Analysis? |
|---|---|---|
| **Draft** | Configured, never collected. | No |
| **Collecting** | A run is in progress (transient; derived from the live run). | No |
| **Pending Approval** | Collection added new evidence awaiting the researcher. | **No** |
| **Approved** | Researcher validated the evidence. | **Yes** |
| **Archived** | Completed; collection frozen. **Preserves prior approval.** | **Yes** (it was Approved) |

**Approval is at the Conversation Search level**, never per run — you approve *the
search*, and its Approved evidence flows to Analysis.

---

## 3. New evidence and delta review — the crux

Collection is append-only and incremental, so re-approval must be **incremental too**:

- After a run that adds **genuinely new** evidence, the search returns to **Pending
  Approval**. A run that adds **nothing new** (duplicates / metadata only) leaves an
  Approved search **Approved**.
- The researcher reviews **only the delta** — the conversations collected *since the
  last approval* (`first_seen_at > approved_watermark`). **Previously approved
  evidence stays approved; previously excluded evidence stays excluded.** No
  conversation is ever reviewed twice.
- Approving advances `approved_watermark` to cover the new evidence; the search
  returns to **Approved**.

This reuses the same `first_seen_at` watermark the synthesis-staleness check uses,
so the two compose: *new evidence → Pending Approval → approve the delta →
synthesis Out of date → re-synthesise.* **Approval sits upstream of synthesis.**

---

## 4. Conversations: Included / Excluded

Each conversation has one of two states, **persistent across all future collections**:

- **Included** (default) — counts as evidence when its search is Approved.
- **Excluded** — set aside as off-topic / spam / unsuitable. **Never deleted**: the
  row stays in the base with a flag (`excluded_at`, `excluded_by`,
  `exclusion_reason`), so the audit trail is intact. Excluded once, excluded
  forever (until a researcher restores it) — it **never requires review again**.

Two hide mechanisms, one gate into Analysis: **AI relevance** (automatic, below
threshold) and **researcher exclusion** (manual, permanent, reason-tagged).
Analysis sees neither.

---

## 5. What feeds Analysis — and Delete/Archive

**Analysis and Reports read a conversation only if:** its search is **Approved**
(or Archived-having-been-Approved), it is **Included** (not excluded), and it is
**relevant** (≥ the search's threshold). A project whose searches are all Pending
Approval has nothing to synthesise yet — which is the point.

| Action | Search | Evidence | Analysis | Reversible | Use |
|---|---|---|---|---|---|
| **Archive** | kept, frozen | retained | yes (approval preserved) | yes (reactivate) | research complete, stop collecting |
| **Delete** | **removed** | **removed** (runs + observations cascade) | gone | **no** | a *mistake* — wrong scope / test search |

**Delete** is the only destructive action and the deliberate exception to
append-only (which governs *collection*, not permanent immortality of a mistaken
search). It requires explicit confirmation; the deletion itself is logged in
project activity even though the rows go.

---

## 6. Where it lives — review on the search, read on the global page

The **review workflow lives on the Conversation Search page** (per-search, in
Execution); the **global Evidence page shows only approved evidence across all
approved searches**.

```
Research      → configure the search (Draft)
Execution     → Run Collection → Collecting → Pending Approval.
                THE CONVERSATION SEARCH PAGE is the review surface:
                  • the delta (new conversations since last approval) to review,
                  • Include / Exclude each conversation (with a reason),
                  • Approve the search  ·  Archive  ·  Delete.
Dashboard     → monitors ALL collected evidence (approved or not — monitoring
                answers "what have we collected?", and is never gated).
Evidence      → the VALIDATED corpus: approved searches, Included conversations
 (Dashboard ›   only, across the whole project. Read-only — it shows exactly what
  CI › Evidence) Analysis will use. (Review/exclusion happens per-search, above.)
Analysis      → reads ONLY Approved, Included, relevant evidence. Unreviewed
                searches surface as "N searches await approval before analysis."
```

The gate is felt as one new step — **review the new evidence on the search, then
approve it** — between Dashboard (what we collected) and Analysis (what it means).

---

## 7. Data model (proposed)

- **`social_searches`**: `review_status` (draft | collecting | pending_approval |
  approved | archived), `approved_by`, `approved_at`, `approved_watermark` (the
  evidence high-water mark approval covers — new evidence past it → Pending
  Approval), `archived_at`. The existing Draft/Active/Paused/Archived `status`
  collapses into this lifecycle; auto-collection cadence becomes a separate
  "collection schedule" attribute, orthogonal to review.
- **`social_mentions`**: `excluded` boolean (Included = false), `excluded_at`,
  `excluded_by`, `exclusion_reason`. Append-only flag — never a delete.
- **`evidence_review_events`** (audit): `(id, search_id, event, actor, at, note,
  run_id?)` — `submitted_for_approval | approved | archived | reactivated |
  conversation_excluded | conversation_restored`. With the existing
  `collection_runs` + `evidence_observations` ledgers, this gives a complete
  collection-*and*-validation trail.

Nothing above rewrites or deletes evidence rows (except the explicit Delete).

---

## 8. Invariants

1. Evidence is **append-only**; approval and exclusion are states/flags over it,
   never deletions (Delete-search is the one audited exception).
2. **Only Approved + Included + relevant evidence feeds Analysis/Reports.**
3. **New evidence resets approval** (Pending Approval); a no-new-evidence run does
   not. Only the **delta** is ever reviewed — prior approvals and exclusions persist.
4. **Everything is audited** — collection (runs + observations) and validation
   (review events + exclusion metadata).
5. Monitoring (Dashboard) is **not** gated; only synthesis (Analysis) is.
6. Review happens on the **Conversation Search page**; the global Evidence page
   is the read-only **approved** corpus.

---

## 9. Locked decisions

1. **Archive preserves approval** and freezes future collection. ✔
2. **Approval is at the Conversation Search level**, not per run. ✔
3. **Exclusions persist** across future collections — excluded evidence never needs
   review again. ✔
4. **Review lives on the Conversation Search page**; the global Evidence page shows
   only approved evidence across approved searches. ✔
5. **No "Rejected" state** — Draft → Collecting → Pending Approval → Approved →
   Archived; a wrong search is deleted. ✔
6. Conversations have **Included / Excluded** states. ✔
7. **Delta review only** — subsequent collections require approving just the newly
   collected evidence. ✔

---

## 10. Phasing (when built)

1. **Lifecycle + gate:** `review_status` + `approved_watermark`; Analysis reads
   Approved+Included only; Approve/Archive on the Conversation Search page; delta
   detection; Execution + Analysis surface the state.
2. **Conversation Include/Exclude:** `excluded` flag + per-search review UI
   (exclude/restore with reason) + global Evidence page = approved corpus.
3. **Audit + governance:** `evidence_review_events`, Delete/Archive with
   confirmation and logging, and the review-history view.

Each phase is independently valuable and preserves the Evidence Lifecycle.

---

*This is where Fanometrix stops being an automated collector and becomes a
research instrument: a researcher stands between raw collection and analysis, and
every finding provably rests on evidence a human chose to trust — reviewed once,
at the delta, with a complete trail.*

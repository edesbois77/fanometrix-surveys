"use client";

// ── useAutosave — the reusable Create autosave foundation (Phase 0) ──────────
// A debounced, SERIALISED save loop over an existing persistence function. It is
// deliberately field-agnostic: callers own their editable state and pass the
// latest value to schedule(); this hook only decides WHEN to persist and exposes
// a status for the "Saving… / Saved just now" indicator.
//
// Safety (per the plan): overlapping saves must never let an older in-flight
// write silently clobber newer client state.
//   • Only ONE save runs at a time (savingRef). A change during a save queues a
//     trailing save rather than racing it.
//   • Every save sends latestRef.current — always the newest value, never a
//     stale snapshot captured when the timer was set.
//   • The hook NEVER writes a server response back into the caller's field, so a
//     save completing after later keystrokes cannot overwrite them.
// NOTE: this guards against overlapping saves from ONE client. It does not do
// cross-tab/version conflict detection — there is no version column on surveys
// today, and that is out of scope for Phase 0 (flagged for a later phase).

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutosave<T>({
  save,
  delay = 800,
}: {
  /** Persist the value. Must reject/throw on failure so the hook can show error. */
  save: (value: T) => Promise<void>;
  /** Debounce window in ms. */
  delay?: number;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const latestRef = useRef<T | null>(null);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True when a value has been scheduled/requested but not yet confirmed saved.
  // With a longer (≈60s) debounce this lets us flush a genuinely-pending change on
  // unmount so navigating away from Create never loses it.
  const pendingRef = useRef(false);

  // Keep the latest `save` in a ref WITHOUT mutating during render (updated in an
  // effect), so a save that fires later always calls the current persistence fn.
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);

  // Plain self-referencing function (no memoization): its trailing-save recursion
  // needs no memoized callback, and it never assigns a ref during render. It only
  // ever runs from a timeout or event handler, never during render.
  async function flush() {
    if (savingRef.current) {
      // A save is already running — queue exactly one trailing save.
      queuedRef.current = true;
      return;
    }
    if (latestRef.current === null) return;

    savingRef.current = true;
    setStatus("saving");
    const snapshot = latestRef.current;
    try {
      await saveRef.current(snapshot);
      setLastSavedAt(Date.now());
      // If the value moved on while we were saving, stay in "saving" — the
      // queued flush below will persist the newer value and then flip to saved.
      const upToDate = latestRef.current === snapshot;
      setStatus(upToDate ? "saved" : "saving");
      if (upToDate) pendingRef.current = false;
    } catch {
      setStatus("error");
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void flush();
      }
    }
  }

  /** Call on every change with the newest value; debounced persist follows. */
  function schedule(value: T) {
    latestRef.current = value;
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, delay);
  }

  /** Persist immediately (manual Save, retry, navigation), skipping the debounce.
   *  Flushes any pending change through the SAME serialised/CAS save path. */
  function saveNow(value?: T) {
    if (value !== undefined) latestRef.current = value;
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    void flush();
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Navigation safety: a still-pending debounced change is flushed fire-and-forget
    // on unmount (no setState — the component is gone). A save already in flight is
    // left to complete on its own; the CAS guard still prevents any clobber.
    if (pendingRef.current && !savingRef.current && latestRef.current !== null) {
      void saveRef.current(latestRef.current).catch(() => {});
    }
  }, []);

  return { status, lastSavedAt, schedule, saveNow };
}

# Migration validation checklist

Standing checklist applied to every migration in the Demo Projects / Simulation series (`supabase-migration-075.sql` onward) before it's considered validated. Added after migration 075's `DEFAULT 'real'` was found missing from the live column during Phase 6 — a gap this checklist would have caught immediately, since Phase 1's validation only tested `UPDATE` behavior (immutability, the CHECK constraint), never a bare `INSERT` omitting the column.

For any migration that adds a column with a `DEFAULT`:

- [ ] **Insert a row omitting the defaulted column entirely** (not just querying existing rows) and confirm the default actually applies. Do this via a direct insert against the table, bypassing the application layer, so the check isolates the database's own state.
- [ ] Confirm the default is visible at the schema level: `SELECT column_default FROM information_schema.columns WHERE table_name = '<table>' AND column_name = '<column>';`

For any migration that adds a `CHECK` constraint:

- [ ] Attempt an insert/update that violates it and confirm rejection.
- [ ] Confirm a valid value still succeeds.

For any migration that adds a trigger:

- [ ] Positive case: an insert/update that should pass, does.
- [ ] Negative case: an insert/update that should be rejected, is — and confirm the row was **not** partially written.

For any migration that adds a foreign key:

- [ ] Confirm a dangling/nonexistent reference is rejected.

This list is applied going forward for every remaining phase of this build, not just retroactively.

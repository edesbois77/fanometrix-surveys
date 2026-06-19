-- Migration 007: Add delete policy for demo rows on responses table
--
-- The original setup only created INSERT and SELECT policies.
-- Without a DELETE policy, the anon key is blocked by RLS and deletes silently
-- affect 0 rows. This policy restricts deletion to rows where is_demo = true,
-- so real survey responses can never be deleted via the anon key.

create policy "Anyone can delete demo rows"
  on responses
  for delete
  using (is_demo = true);

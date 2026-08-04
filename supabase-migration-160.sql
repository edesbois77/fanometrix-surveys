-- Migration 160 - ORG-004 BP-04 / IC-07+IC-08: office-holding mechanism (type) with the
-- external holder-subject dependency PRESERVED
--
-- PHASE A - PROPOSED, NOT YET APPLIED. Awaiting migration control review.
--
-- Per control determination F-1, this prepares the governed office-holding Relationship
-- MECHANISM without fabricating a holder:
--   * R06 FR-016 - office-holding is a specialised canonical Relationship between an
--     Organisational Office and its holder (NOT an independent OfficeHolding subject). The
--     mechanism is a system Relationship TYPE 'office_holding' on the BP-03 substrate.
--   * The HOLDER (FR-018) references an actor governed by an EXTERNAL holder-subject
--     architecture that does not exist in Fanometrix and is deliberately PRESERVED. Therefore
--     ACTUAL office-holding facts remain UNAVAILABLE until an eligible holder subject exists.
--
-- This migration does NOT create a Person/Actor/holder registry, does NOT weaken the >=2
-- participant invariant, and does NOT create any placeholder/phantom/synthetic holder. It
-- records and ENFORCES the preserved dependency at the database level: the 'office_holding'
-- type exists (the mechanism), but a guard rejects creation of any office_holding Relationship
-- instance until the holder-subject architecture is admitted (at which point the guard is
-- dropped). Ordinary (non-office-holding) Office participation remains permitted (FR-011/017).
--
-- Additive, reversible, idempotent.

-- Seed the office-holding system relationship type (the mechanism). Directed: the holder holds
-- the Office (roles e.g. 'holder' / 'office'). Protected by the BP-03 system-type guard.
INSERT INTO relationship_types (key, label, description, directionality, is_system) VALUES
  ('office_holding', 'Office-Holding',
   'Specialised Relationship: an eligible holder holds an Organisational Office (R06 FR-016). The holder participant references an actor under an external holder-subject architecture that is a PRESERVED dependency; office-holding instances are not yet establishable.',
   'directed', true)
ON CONFLICT (key) DO NOTHING;

-- Preserved-dependency guard: reject creation of any office_holding Relationship instance while
-- the holder-subject architecture is unresolved. Relaxed/removed by the future package that
-- admits an eligible holder subject. search_path pinned + schema-qualified (BP-03/157 posture).
CREATE OR REPLACE FUNCTION public.guard_office_holding_pending_holder()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.relationship_types t
             WHERE t.id = NEW.type_id AND t.key = 'office_holding') THEN
    RAISE EXCEPTION 'office-holding relationships are not yet establishable: the holder subject architecture is a preserved external dependency (R06 FR-016/FR-018)'
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS organisation_relationships_office_holding_guard ON organisation_relationships;
CREATE TRIGGER organisation_relationships_office_holding_guard
  BEFORE INSERT ON organisation_relationships
  FOR EACH ROW EXECUTE FUNCTION public.guard_office_holding_pending_holder();

NOTIFY pgrst, 'reload schema';

-- -- Rollback --------------------------------------------------------------------
--   DROP TRIGGER IF EXISTS organisation_relationships_office_holding_guard ON organisation_relationships;
--   DROP FUNCTION IF EXISTS public.guard_office_holding_pending_holder();
--   DELETE FROM relationship_types WHERE key = 'office_holding';  -- (system-type protect trigger
--     -- blocks DELETE; temporarily: ALTER TABLE relationship_types DISABLE TRIGGER relationship_types_protect;
--     -- DELETE; ENABLE TRIGGER; -- only if no office_holding relationships exist, which the guard guarantees)

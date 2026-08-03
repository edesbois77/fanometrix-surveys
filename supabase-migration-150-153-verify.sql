-- ██ VERIFICATION ONLY — DO NOT APPLY AS A MIGRATION ██
--
-- Run AFTER migrations 150–153 are applied. Every write test is wrapped in
-- BEGIN … ROLLBACK, so this mutates NO production data. Read the NOTICEs: each
-- prints PASS. Maps to BP-02 §20 acceptance points A–H.

-- ── A. BP-01 regression (read-only) ─────────────────────────────────────────────
-- Organisation identity + subject registration untouched. Expect organisations=84,
-- organisation-kind subjects=84, and NO Office subjects/facts anywhere.
SELECT
  (SELECT count(*) FROM organisations)                                              AS organisations,
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisation')    AS org_subjects,
  (SELECT count(*) FROM organisation_subjects WHERE subject_kind='organisational_office') AS office_subjects;

-- ── C. Name backfill (read-only): one primary display Name per organisation ─────
-- Expect primary_names = organisations (84) and projection_matches = 84.
SELECT
  (SELECT count(*) FROM organisation_names WHERE subject_kind='organisation' AND is_primary AND deleted_at IS NULL) AS primary_org_names,
  (SELECT count(*) FROM organisations o JOIN organisation_names n
      ON n.subject_id=o.id AND n.is_primary AND n.deleted_at IS NULL AND n.value=o.name)                            AS projection_matches;

-- ── E. Classification backfill (read-only) ──────────────────────────────────────
-- Expect brand/agency/publisher assignments to match legacy type counts, and
-- internal organisations to have ZERO organisation_category assignments.
SELECT c.key AS category,
  (SELECT count(*) FROM organisations WHERE type=c.key AND type IN ('brand','agency','publisher')) AS legacy_type_rows,
  count(a.id) AS assignments
FROM classification_categories c
JOIN classification_schemes s ON s.id=c.scheme_id AND s.key='organisation_category'
LEFT JOIN classification_assignments a ON a.category_id=c.id AND a.deleted_at IS NULL
GROUP BY c.key ORDER BY c.key;

SELECT count(*) AS internal_orgs,
       (SELECT count(*) FROM classification_assignments a
          JOIN organisations o ON o.id=a.subject_id
          JOIN classification_categories c ON c.id=a.category_id
          JOIN classification_schemes s ON s.id=c.scheme_id AND s.key='organisation_category'
        WHERE o.type='internal') AS internal_category_assignments   -- expect 0
FROM organisations WHERE type='internal';

-- ── B. Organisation Unit integrity (rolled back) ────────────────────────────────
BEGIN;
DO $$
DECLARE org uuid; org2 uuid; root uuid; child uuid; k text;
BEGIN
  SELECT id INTO org  FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO org2 FROM organisations WHERE deleted_at IS NULL AND id<>org LIMIT 1;

  -- root unit belongs to an organisation, and is registered as 'organisation_unit'
  INSERT INTO organisation_units (organisation_id, name) VALUES (org, '__root__') RETURNING id INTO root;
  SELECT subject_kind INTO k FROM organisation_subjects WHERE subject_id=root;
  IF k <> 'organisation_unit' THEN RAISE EXCEPTION 'FAIL: unit not registered as organisation_unit (got %)', k; END IF;

  -- nested unit in the SAME organisation is allowed
  INSERT INTO organisation_units (organisation_id, parent_unit_id, name) VALUES (org, root, '__child__') RETURNING id INTO child;
  RAISE NOTICE 'PASS: root+nested units created and registered as organisation_unit';

  -- self-parenting rejected (CHECK)
  BEGIN
    UPDATE organisation_units SET parent_unit_id=child WHERE id=child;
    RAISE EXCEPTION 'FAIL: self-parenting accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: self-parenting rejected'; END;

  -- circular containment rejected (trigger): make root a child of its own descendant
  BEGIN
    UPDATE organisation_units SET parent_unit_id=child WHERE id=root;
    RAISE EXCEPTION 'FAIL: circular containment accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: circular containment rejected';
  END;

  -- cross-organisation nesting rejected (trigger)
  IF org2 IS NOT NULL THEN
    BEGIN
      INSERT INTO organisation_units (organisation_id, parent_unit_id, name) VALUES (org2, root, '__xorg__');
      RAISE EXCEPTION 'FAIL: cross-organisation nesting accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS: cross-organisation nesting rejected';
    END;

    -- cross-organisation MOVEMENT of an existing unit rejected (control remediation B)
    BEGIN
      UPDATE organisation_units SET organisation_id=org2 WHERE id=root;
      RAISE EXCEPTION 'FAIL: cross-organisation unit movement accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
      RAISE NOTICE 'PASS: cross-organisation unit movement rejected';
    END;
  END IF;
END $$;
ROLLBACK;

-- ── A(remediation). Classification history preserved on type change (rolled back) ─
BEGIN;
DO $$
DECLARE org uuid; scheme uuid; brand_cat uuid; agency_cat uuid; cur_count int;
BEGIN
  SELECT id INTO org FROM organisations WHERE type='brand' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO scheme FROM classification_schemes WHERE key='organisation_category';
  SELECT id INTO brand_cat  FROM classification_categories WHERE scheme_id=scheme AND key='brand';
  SELECT id INTO agency_cat FROM classification_categories WHERE scheme_id=scheme AND key='agency';

  IF NOT EXISTS (SELECT 1 FROM classification_assignments
      WHERE subject_id=org AND category_id=brand_cat AND deleted_at IS NULL AND effective_to IS NULL) THEN
    RAISE EXCEPTION 'FAIL: precondition — no current Brand assignment for %', org;
  END IF;

  -- legacy type is the driver
  UPDATE organisations SET type='agency' WHERE id=org;

  -- former Brand retained as HISTORY (retired via effective_to, NOT deleted)
  IF NOT EXISTS (SELECT 1 FROM classification_assignments
      WHERE subject_id=org AND category_id=brand_cat AND deleted_at IS NULL AND effective_to IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: former Brand classification not retained as history';
  END IF;
  IF EXISTS (SELECT 1 FROM classification_assignments
      WHERE subject_id=org AND category_id=brand_cat AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL: former Brand classification was deleted rather than retired';
  END IF;

  -- Agency is now the single CURRENT classification, and only one current exists
  SELECT count(*) INTO cur_count FROM classification_assignments a
    JOIN classification_categories c ON c.id=a.category_id AND c.scheme_id=scheme
    WHERE a.subject_id=org AND a.deleted_at IS NULL AND a.effective_to IS NULL;
  IF cur_count <> 1 THEN RAISE EXCEPTION 'FAIL: expected one current assignment, got %', cur_count; END IF;
  IF NOT EXISTS (SELECT 1 FROM classification_assignments
      WHERE subject_id=org AND category_id=agency_cat AND deleted_at IS NULL AND effective_to IS NULL) THEN
    RAISE EXCEPTION 'FAIL: Agency is not the current classification';
  END IF;

  -- Half-open transition boundary: on the transition date CURRENT_DATE, exactly one
  -- organisation_category fact is applicable (from-inclusive, to-exclusive) — no overlap.
  SELECT count(*) INTO cur_count FROM classification_assignments a
    JOIN classification_categories c ON c.id=a.category_id AND c.scheme_id=scheme
    WHERE a.subject_id=org AND a.deleted_at IS NULL
      AND (a.effective_from IS NULL OR a.effective_from <= CURRENT_DATE)
      AND (a.effective_to   IS NULL OR CURRENT_DATE < a.effective_to);
  IF cur_count <> 1 THEN RAISE EXCEPTION 'FAIL: transition-date overlap — % facts applicable today', cur_count; END IF;
  -- retired Brand (effective_to = CURRENT_DATE, exclusive) is NOT applicable today
  IF EXISTS (SELECT 1 FROM classification_assignments
      WHERE subject_id=org AND category_id=brand_cat AND deleted_at IS NULL
        AND (effective_to IS NULL OR CURRENT_DATE < effective_to)) THEN
    RAISE EXCEPTION 'FAIL: retired Brand still applicable on transition date (overlap)';
  END IF;

  RAISE NOTICE 'PASS: brand→agency — Brand retired as history, Agency current, single current, no transition-date overlap, type-driven';
END $$;
ROLLBACK;

-- ── C. Name correction vs genuine change + multiplicity (rolled back) ───────────
BEGIN;
DO $$
DECLARE org uuid; proj text; primary_id uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  SELECT id INTO primary_id FROM organisation_names WHERE subject_id=org AND is_primary AND deleted_at IS NULL;

  -- multiple concurrent names allowed (add a secondary legal name)
  INSERT INTO organisation_names (subject_id, subject_kind, value, name_form) VALUES (org,'organisation','__legal__','legal');

  -- CORRECTION: edit primary value in place → projection follows, no new history row
  UPDATE organisation_names SET value='__corrected__' WHERE id=primary_id;
  SELECT name INTO proj FROM organisations WHERE id=org;
  IF proj <> '__corrected__' THEN RAISE EXCEPTION 'FAIL: projection did not follow correction (got %)', proj; END IF;
  RAISE NOTICE 'PASS: multiplicity + correction projected to legacy name';

  -- GENUINE CHANGE: close current primary, open a new primary → projection follows new
  UPDATE organisation_names SET is_primary=false, effective_to=DATE '2020-01-01' WHERE id=primary_id;
  INSERT INTO organisation_names (subject_id, subject_kind, value, is_primary, effective_from)
    VALUES (org,'organisation','__renamed__',true, DATE '2020-01-02');
  SELECT name INTO proj FROM organisations WHERE id=org;
  IF proj <> '__renamed__' THEN RAISE EXCEPTION 'FAIL: projection did not follow rename (got %)', proj; END IF;
  -- earlier name retained as history
  IF NOT EXISTS (SELECT 1 FROM organisation_names WHERE id=primary_id AND value='__corrected__') THEN
    RAISE EXCEPTION 'FAIL: earlier name not retained';
  END IF;
  RAISE NOTICE 'PASS: genuine change keeps old name + projects new primary';
END $$;
ROLLBACK;

-- ── C. Legacy direct write to organisations.name stays consistent (rolled back) ─
BEGIN;
DO $$
DECLARE org uuid; v text;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  UPDATE organisations SET name='__legacy_edit__' WHERE id=org;   -- legacy path
  SELECT value INTO v FROM organisation_names WHERE subject_id=org AND is_primary AND deleted_at IS NULL;
  IF v <> '__legacy_edit__' THEN RAISE EXCEPTION 'FAIL: canonical primary did not follow legacy edit (got %)', v; END IF;
  RAISE NOTICE 'PASS: legacy name edit rerouted into canonical primary (no divergence)';
END $$;
ROLLBACK;

-- ── D. Identifier semantics (rolled back) ───────────────────────────────────────
BEGIN;
DO $$
DECLARE org uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  -- same designation under two different schemes is allowed
  INSERT INTO organisation_identifiers (subject_id, subject_kind, scheme, designation) VALUES (org,'organisation','lei','CODE123');
  INSERT INTO organisation_identifiers (subject_id, subject_kind, scheme, designation) VALUES (org,'organisation','duns','CODE123');
  RAISE NOTICE 'PASS: same designation under different schemes allowed (no global uniqueness)';
  -- exact duplicate fact rejected
  BEGIN
    INSERT INTO organisation_identifiers (subject_id, subject_kind, scheme, designation) VALUES (org,'organisation','lei','CODE123');
    RAISE EXCEPTION 'FAIL: duplicate identifier fact accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS: exact-duplicate identifier fact rejected'; END;
  -- empty designation rejected (sufficient context/value required)
  BEGIN
    INSERT INTO organisation_identifiers (subject_id, subject_kind, scheme, designation) VALUES (org,'organisation','lei','   ');
    RAISE EXCEPTION 'FAIL: blank designation accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: blank designation rejected'; END;
END $$;
ROLLBACK;

-- ── E. Classification: extensibility + not-arbitrary (rolled back) ──────────────
BEGIN;
DO $$
DECLARE org uuid; sch uuid; cat uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  -- add a brand-new scheme + category with NO schema migration (row inserts only)
  INSERT INTO classification_schemes (key,label) VALUES ('agency_specialism','Agency Specialism') RETURNING id INTO sch;
  INSERT INTO classification_categories (scheme_id,key,label) VALUES (sch,'sports_marketing','Sports Marketing Agency') RETURNING id INTO cat;
  INSERT INTO classification_assignments (subject_id,subject_kind,category_id) VALUES (org,'organisation',cat);
  RAISE NOTICE 'PASS: new scheme+category+assignment added with no migration';
  -- membership cannot point at a non-existent category (not arbitrary metadata)
  BEGIN
    INSERT INTO classification_assignments (subject_id,subject_kind,category_id)
      VALUES (org,'organisation','00000000-0000-0000-0000-0000000000cc');
    RAISE EXCEPTION 'FAIL: assignment to non-existent category accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: assignment requires a defined category'; END;
  -- system scheme is protected from deletion
  BEGIN
    DELETE FROM classification_schemes WHERE key='organisation_category';
    RAISE EXCEPTION 'FAIL: system scheme deleted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: system scheme protected from deletion';
  END;
END $$;
ROLLBACK;

-- ── F. Effective Applicability interval integrity (rolled back) ─────────────────
BEGIN;
DO $$
DECLARE org uuid;
BEGIN
  SELECT id INTO org FROM organisations WHERE deleted_at IS NULL LIMIT 1;
  BEGIN
    INSERT INTO organisation_names (subject_id,subject_kind,value,effective_from,effective_to)
      VALUES (org,'organisation','__bad__',DATE '2024-01-01',DATE '2023-01-01');
    RAISE EXCEPTION 'FAIL: reversed interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: reversed effective interval rejected'; END;
  -- zero-length [d,d) rejected (half-open convention: end must be strictly after start)
  BEGIN
    INSERT INTO organisation_names (subject_id,subject_kind,value,effective_from,effective_to)
      VALUES (org,'organisation','__zero__',DATE '2024-01-01',DATE '2024-01-01');
    RAISE EXCEPTION 'FAIL: zero-length interval accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: zero-length [d,d) interval rejected'; END;
  -- open-ended interval allowed
  INSERT INTO organisation_names (subject_id,subject_kind,value,effective_from,effective_to)
    VALUES (org,'organisation','__open__',DATE '2024-01-01',NULL);
  -- adjacent half-open intervals [a,b)+[b,c) are both valid and non-overlapping
  INSERT INTO organisation_names (subject_id,subject_kind,value,effective_from,effective_to)
    VALUES (org,'organisation','__adj1__',DATE '2023-01-01',DATE '2024-01-01');
  INSERT INTO organisation_names (subject_id,subject_kind,value,effective_from,effective_to)
    VALUES (org,'organisation','__adj2__',DATE '2024-01-01',DATE '2025-01-01');
  RAISE NOTICE 'PASS: open-ended + adjacent half-open intervals allowed';
END $$;
ROLLBACK;

-- ── G. Subject integrity: no phantom / wrong-kind / Office facts (rolled back) ──
BEGIN;
DO $$
BEGIN
  -- fact pointing at a non-registered subject rejected (composite FK)
  BEGIN
    INSERT INTO organisation_names (subject_id,subject_kind,value)
      VALUES ('00000000-0000-0000-0000-0000000000ab','organisation','__phantom__');
    RAISE EXCEPTION 'FAIL: name on non-existent subject accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS: fact on non-registered subject rejected'; END;
  -- Office discriminator cannot be used for a fact (CHECK excludes it — Office is BP-04)
  BEGIN
    INSERT INTO organisation_names (subject_id,subject_kind,value)
      VALUES (gen_random_uuid(),'organisational_office','__office__');
    RAISE EXCEPTION 'FAIL: office-kind fact accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: office-kind fact rejected (no phantom Office)'; END;
END $$;
ROLLBACK;

-- ── H. Scope boundary (read-only): none of the out-of-scope tables exist ────────
-- Expect 0 rows.
SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN
    ('organisational_offices','organisation_offices','office_holdings','organisation_relationships',
     'organisation_identities','organisation_authorities','organisation_status','organisation_history');

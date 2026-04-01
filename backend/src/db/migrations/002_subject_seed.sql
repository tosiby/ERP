-- =============================================================
-- KJSIS — Migration 002: Subject Seed Data
-- Academic Rules:
--   IT          → all classes (1–12)
--   Malayalam   → classes 1–8 (mandatory)
--   Hindi       → classes 1–6 (mandatory)
--   Class 7–8   → Hindi/French elective group
--   Class 9–12  → No Hindi/French unless school adds manually
--   GK          → all classes, term_only
--   Moral Sci   → all classes, term_only
--   English, Maths, Science, Social → standard per class
-- =============================================================

DO $$
DECLARE
  -- Class IDs (fetched by grade_number)
  c1  UUID; c2  UUID; c3  UUID; c4  UUID;
  c5  UUID; c6  UUID; c7  UUID; c8  UUID;
  c9  UUID; c10 UUID; c11 UUID; c12 UUID;
BEGIN

  SELECT id INTO c1  FROM classes WHERE grade_number = 1;
  SELECT id INTO c2  FROM classes WHERE grade_number = 2;
  SELECT id INTO c3  FROM classes WHERE grade_number = 3;
  SELECT id INTO c4  FROM classes WHERE grade_number = 4;
  SELECT id INTO c5  FROM classes WHERE grade_number = 5;
  SELECT id INTO c6  FROM classes WHERE grade_number = 6;
  SELECT id INTO c7  FROM classes WHERE grade_number = 7;
  SELECT id INTO c8  FROM classes WHERE grade_number = 8;
  SELECT id INTO c9  FROM classes WHERE grade_number = 9;
  SELECT id INTO c10 FROM classes WHERE grade_number = 10;
  SELECT id INTO c11 FROM classes WHERE grade_number = 11;
  SELECT id INTO c12 FROM classes WHERE grade_number = 12;

  -- ─────────────────────────────────────────
  -- CLASSES 1–6: English, Maths, Science, Social, Malayalam, Hindi, IT, GK, Moral
  -- ─────────────────────────────────────────
  INSERT INTO subjects (name, code, class_id, subject_type, is_elective, display_order) VALUES
    -- Class 1
    ('English',          'ENG',  c1, 'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c1, 'regular',   FALSE, 2),
    ('Environmental Studies', 'EVS', c1, 'regular', FALSE, 3),
    ('Malayalam',        'MAL',  c1, 'regular',   FALSE, 4),
    ('Hindi',            'HIN',  c1, 'regular',   FALSE, 5),
    ('Information Technology', 'IT', c1, 'regular', FALSE, 6),
    ('General Knowledge','GK',   c1, 'term_only', FALSE, 7),
    ('Moral Science',    'MOR',  c1, 'term_only', FALSE, 8),

    -- Class 2
    ('English',          'ENG',  c2, 'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c2, 'regular',   FALSE, 2),
    ('Environmental Studies', 'EVS', c2, 'regular', FALSE, 3),
    ('Malayalam',        'MAL',  c2, 'regular',   FALSE, 4),
    ('Hindi',            'HIN',  c2, 'regular',   FALSE, 5),
    ('Information Technology', 'IT', c2, 'regular', FALSE, 6),
    ('General Knowledge','GK',   c2, 'term_only', FALSE, 7),
    ('Moral Science',    'MOR',  c2, 'term_only', FALSE, 8),

    -- Class 3
    ('English',          'ENG',  c3, 'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c3, 'regular',   FALSE, 2),
    ('Science',          'SCI',  c3, 'regular',   FALSE, 3),
    ('Social Studies',   'SOC',  c3, 'regular',   FALSE, 4),
    ('Malayalam',        'MAL',  c3, 'regular',   FALSE, 5),
    ('Hindi',            'HIN',  c3, 'regular',   FALSE, 6),
    ('Information Technology', 'IT', c3, 'regular', FALSE, 7),
    ('General Knowledge','GK',   c3, 'term_only', FALSE, 8),
    ('Moral Science',    'MOR',  c3, 'term_only', FALSE, 9),

    -- Class 4
    ('English',          'ENG',  c4, 'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c4, 'regular',   FALSE, 2),
    ('Science',          'SCI',  c4, 'regular',   FALSE, 3),
    ('Social Studies',   'SOC',  c4, 'regular',   FALSE, 4),
    ('Malayalam',        'MAL',  c4, 'regular',   FALSE, 5),
    ('Hindi',            'HIN',  c4, 'regular',   FALSE, 6),
    ('Information Technology', 'IT', c4, 'regular', FALSE, 7),
    ('General Knowledge','GK',   c4, 'term_only', FALSE, 8),
    ('Moral Science',    'MOR',  c4, 'term_only', FALSE, 9),

    -- Class 5
    ('English',          'ENG',  c5, 'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c5, 'regular',   FALSE, 2),
    ('Science',          'SCI',  c5, 'regular',   FALSE, 3),
    ('Social Studies',   'SOC',  c5, 'regular',   FALSE, 4),
    ('Malayalam',        'MAL',  c5, 'regular',   FALSE, 5),
    ('Hindi',            'HIN',  c5, 'regular',   FALSE, 6),
    ('Information Technology', 'IT', c5, 'regular', FALSE, 7),
    ('General Knowledge','GK',   c5, 'term_only', FALSE, 8),
    ('Moral Science',    'MOR',  c5, 'term_only', FALSE, 9),

    -- Class 6
    ('English',          'ENG',  c6, 'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c6, 'regular',   FALSE, 2),
    ('Science',          'SCI',  c6, 'regular',   FALSE, 3),
    ('Social Studies',   'SOC',  c6, 'regular',   FALSE, 4),
    ('Malayalam',        'MAL',  c6, 'regular',   FALSE, 5),
    ('Hindi',            'HIN',  c6, 'regular',   FALSE, 6),
    ('Information Technology', 'IT', c6, 'regular', FALSE, 7),
    ('General Knowledge','GK',   c6, 'term_only', FALSE, 8),
    ('Moral Science',    'MOR',  c6, 'term_only', FALSE, 9);

  -- ─────────────────────────────────────────
  -- CLASSES 7–8: Hindi/French elective; Malayalam mandatory
  -- ─────────────────────────────────────────
  INSERT INTO subjects (name, code, class_id, subject_type, is_elective, elective_group, display_order) VALUES
    -- Class 7
    ('English',          'ENG',  c7, 'regular',   FALSE, NULL,            1),
    ('Mathematics',      'MATH', c7, 'regular',   FALSE, NULL,            2),
    ('Science',          'SCI',  c7, 'regular',   FALSE, NULL,            3),
    ('Social Studies',   'SOC',  c7, 'regular',   FALSE, NULL,            4),
    ('Malayalam',        'MAL',  c7, 'regular',   FALSE, NULL,            5),
    ('Hindi',            'HIN',  c7, 'regular',   TRUE,  'hindi_french',  6),
    ('French',           'FRE',  c7, 'regular',   TRUE,  'hindi_french',  7),
    ('Information Technology', 'IT', c7, 'regular', FALSE, NULL,          8),
    ('General Knowledge','GK',   c7, 'term_only', FALSE, NULL,            9),
    ('Moral Science',    'MOR',  c7, 'term_only', FALSE, NULL,           10),

    -- Class 8
    ('English',          'ENG',  c8, 'regular',   FALSE, NULL,            1),
    ('Mathematics',      'MATH', c8, 'regular',   FALSE, NULL,            2),
    ('Science',          'SCI',  c8, 'regular',   FALSE, NULL,            3),
    ('Social Studies',   'SOC',  c8, 'regular',   FALSE, NULL,            4),
    ('Malayalam',        'MAL',  c8, 'regular',   FALSE, NULL,            5),
    ('Hindi',            'HIN',  c8, 'regular',   TRUE,  'hindi_french',  6),
    ('French',           'FRE',  c8, 'regular',   TRUE,  'hindi_french',  7),
    ('Information Technology', 'IT', c8, 'regular', FALSE, NULL,          8),
    ('General Knowledge','GK',   c8, 'term_only', FALSE, NULL,            9),
    ('Moral Science',    'MOR',  c8, 'term_only', FALSE, NULL,           10);

  -- ─────────────────────────────────────────
  -- CLASSES 9–10: No Malayalam/Hindi mandatory; standard board subjects
  -- ─────────────────────────────────────────
  INSERT INTO subjects (name, code, class_id, subject_type, is_elective, display_order) VALUES
    -- Class 9
    ('English',          'ENG',  c9,  'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c9,  'regular',   FALSE, 2),
    ('Science',          'SCI',  c9,  'regular',   FALSE, 3),
    ('Social Science',   'SOC',  c9,  'regular',   FALSE, 4),
    ('Information Technology', 'IT', c9, 'regular', FALSE, 5),
    ('General Knowledge','GK',   c9,  'term_only', FALSE, 6),
    ('Moral Science',    'MOR',  c9,  'term_only', FALSE, 7),

    -- Class 10
    ('English',          'ENG',  c10, 'regular',   FALSE, 1),
    ('Mathematics',      'MATH', c10, 'regular',   FALSE, 2),
    ('Science',          'SCI',  c10, 'regular',   FALSE, 3),
    ('Social Science',   'SOC',  c10, 'regular',   FALSE, 4),
    ('Information Technology', 'IT', c10, 'regular', FALSE, 5),
    ('General Knowledge','GK',   c10, 'term_only', FALSE, 6),
    ('Moral Science',    'MOR',  c10, 'term_only', FALSE, 7);

  -- ─────────────────────────────────────────
  -- CLASSES 11–12: Stream-based (school configures dynamically)
  -- Pre-seeding Science + Commerce core only; others added by admin
  -- ─────────────────────────────────────────
  INSERT INTO subjects (name, code, class_id, subject_type, is_elective, display_order) VALUES
    -- Class 11
    ('English',          'ENG',  c11, 'regular', FALSE, 1),
    ('Physics',          'PHY',  c11, 'regular', TRUE,  2),
    ('Chemistry',        'CHE',  c11, 'regular', TRUE,  3),
    ('Mathematics',      'MATH', c11, 'regular', TRUE,  4),
    ('Biology',          'BIO',  c11, 'regular', TRUE,  5),
    ('Accountancy',      'ACC',  c11, 'regular', TRUE,  6),
    ('Business Studies', 'BST',  c11, 'regular', TRUE,  7),
    ('Economics',        'ECO',  c11, 'regular', TRUE,  8),
    ('Information Technology', 'IT', c11, 'regular', FALSE, 9),

    -- Class 12
    ('English',          'ENG',  c12, 'regular', FALSE, 1),
    ('Physics',          'PHY',  c12, 'regular', TRUE,  2),
    ('Chemistry',        'CHE',  c12, 'regular', TRUE,  3),
    ('Mathematics',      'MATH', c12, 'regular', TRUE,  4),
    ('Biology',          'BIO',  c12, 'regular', TRUE,  5),
    ('Accountancy',      'ACC',  c12, 'regular', TRUE,  6),
    ('Business Studies', 'BST',  c12, 'regular', TRUE,  7),
    ('Economics',        'ECO',  c12, 'regular', TRUE,  8),
    ('Information Technology', 'IT', c12, 'regular', FALSE, 9);

END $$;

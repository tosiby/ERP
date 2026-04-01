// =============================================================
// KJSIS — Subject Name Normalizer
//
// The teacher_subject_map CSV is generated from a timetable and
// contains many artefacts:
//
//   "Mon\tEnglish"         → "English"       (day prefix + tab)
//   "Eng Lan"              → "English Language"
//   "Eng Lit"              → "English Literature"
//   "Cca\tCca\tEvs"        → SKIP            (co-curricular marker)
//   "V P Mam\tGeo"         → "Geography"     (teacher note before tab)
//   "Hin/Frn\tBio Susan\tEng Lan" → SKIP    (ambiguous multi-subject)
//   "Fre  \tMath"          → "Mathematics"   (whitespace + tab)
//   "Social"               → "Social Science"
//   "C A"                  → "Computer Applications"
//   "G K", "Gk"            → "General Knowledge"
//   "Mal"                  → "Malayalam"
//   "It", "I T"            → "Information Technology"
// =============================================================

// ─── Day-of-week prefixes to strip ───────────────────────────
const DAY_PREFIXES = /^(mon|tue|wed|thu|fri|sat)\s*/i;

// ─── Strings that indicate a non-academic / junk row ─────────
const SKIP_TOKENS = new Set([
  'cca', 'craft', 'drawing', 'draw', 'lib', 'ped', 'free',
  'game', 'games', 'sport', 'pt', 'assembly', 'prayer',
  '', 'x',
]);

// ─── Tokens that look like teacher names mixed into subject ──
const TEACHER_NAME_PATTERNS = [
  /^v\.?p\.?$/i,         // V P
  /^mam$/i,
  /^sir$/i,
  /^ben$/i,
  /^siby$/i,
  /^agna$/i,
  /^meenu$/i,
  /^syam$/i,
  /^susan[^\s]*/i,
  /^sreevidya$/i,
  /^remya$/i,
];

// ─── Full normalization map (lowercase input → canonical name) ─
const SUBJECT_MAP: Record<string, string> = {
  // English
  'english':                   'English',
  'eng':                       'English',
  'english language':          'English Language',
  'eng lan':                   'English Language',
  'eng language':              'English Language',
  'english lan':               'English Language',
  'english lit':               'English Literature',
  'english literature':        'English Literature',
  'eng lit':                   'English Literature',
  'eng literature':            'English Literature',

  // Mathematics
  'mathematics':               'Mathematics',
  'math':                      'Mathematics',
  'maths':                     'Mathematics',
  'mat':                       'Mathematics',

  // Science
  'science':                   'Science',
  'sci':                       'Science',
  'evs':                       'Environmental Studies',
  'environmental studies':     'Environmental Studies',
  'environmental science':     'Environmental Studies',
  'biology':                   'Biology',
  'bio':                       'Biology',
  'physics':                   'Physics',
  'phy':                       'Physics',
  'chemistry':                 'Chemistry',
  'che':                       'Chemistry',
  'chem':                      'Chemistry',

  // Social Studies
  'social science':            'Social Science',
  'social studies':            'Social Science',
  'social':                    'Social Science',
  'sst':                       'Social Science',
  'history':                   'History',
  'his':                       'History',
  'hist':                      'History',
  'geography':                 'Geography',
  'geo':                       'Geography',

  // Languages
  'malayalam':                 'Malayalam',
  'mal':                       'Malayalam',
  'hindi':                     'Hindi',
  'hin':                       'Hindi',
  'french':                    'French',
  'fre':                       'French',
  'fren':                      'French',
  'french/hindi':              'French',   // elective — keep as French
  'hindi/french':              'Hindi',    // elective — keep as Hindi

  // IT / Computer
  'information technology':    'Information Technology',
  'it':                        'Information Technology',
  'i t':                       'Information Technology',
  'computer':                  'Information Technology',
  'computer science':          'Information Technology',
  'computer applications':     'Computer Applications',
  'c a':                       'Computer Applications',
  'ca':                        'Computer Applications',

  // GK
  'general knowledge':         'General Knowledge',
  'gk':                        'General Knowledge',
  'g k':                       'General Knowledge',

  // Moral / Value Education
  'moral science':             'Moral Science',
  'moral':                     'Moral Science',
  'value education':           'Moral Science',
};

// ─── Tokens to skip entirely (non-subjects) ──────────────────
const SKIP_SUBJECTS = new Set([
  'craft', 'drawing', 'draw', 'art', 'lib', 'library',
  'ped', 'pe', 'physical education', 'sports', 'pt',
  'cca', 'cep', 'assembly', 'prayer', 'free period',
  'break', 'recess', 'moral and values',
]);

// ─────────────────────────────────────────────────────────────
// MAIN: Normalise a raw subject cell from the CSV
// Returns null if the row should be skipped
// ─────────────────────────────────────────────────────────────
export const normalizeSubject = (raw: string): string | null => {
  if (!raw) return null;

  // 1. The CSV uses tab as a secondary separator in some cells
  //    Split on tab, take all parts, work from RIGHT to LEFT
  //    (notes/prefixes come before the actual subject)
  const parts = raw
    .split(/\t/)
    .map((p) => p.trim())
    .filter(Boolean);

  // 2. Try each part from last to first until we find a valid subject
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = cleanPart(parts[i]);
    if (!candidate) continue;

    // Skip if it looks like a teacher name
    if (isTeacherName(candidate)) continue;

    const normalised = lookupSubject(candidate);
    if (normalised) return normalised;
  }

  return null; // nothing salvageable
};

/** Strip day prefix, extra whitespace, and noise from a single token */
const cleanPart = (raw: string): string => {
  return raw
    .replace(DAY_PREFIXES, '')    // strip "Mon ", "Tue ", etc.
    .replace(/\s+/g, ' ')         // collapse whitespace
    .trim();
};

/** Check if a string looks like a teacher name mixed into the data */
const isTeacherName = (s: string): boolean => {
  return TEACHER_NAME_PATTERNS.some((p) => p.test(s));
};

/** Look up a cleaned token in the subject map */
const lookupSubject = (token: string): string | null => {
  const lower = token.toLowerCase();

  // Direct map lookup
  const direct = SUBJECT_MAP[lower];
  if (direct) return direct;

  // Check skip list
  if (SKIP_SUBJECTS.has(lower)) return null;
  if (SKIP_TOKENS.has(lower))    return null;

  // Partial prefix matching (handles "Hin/Frn", "Mal / Fre", etc.)
  for (const [key, val] of Object.entries(SUBJECT_MAP)) {
    if (lower.startsWith(key) || key.startsWith(lower)) {
      if (Math.abs(lower.length - key.length) <= 3) return val;
    }
  }

  return null; // genuinely unknown
};

/** Extract a clean canonical list of unique subjects from raw rows */
export const extractUniqueSubjects = (
  rawSubjects: string[],
): { raw: string; normalised: string }[] => {
  const seen = new Set<string>();
  const result: { raw: string; normalised: string }[] = [];

  for (const raw of rawSubjects) {
    const normalised = normalizeSubject(raw);
    if (!normalised) continue;
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    result.push({ raw, normalised });
  }

  return result;
};

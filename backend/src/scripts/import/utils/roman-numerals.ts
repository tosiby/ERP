// =============================================================
// KJSIS — Roman Numeral → Integer Converter
// Used for students.csv where class = "I", "II" … "XII"
// Also handles plain numbers "1" … "12" (pass-through)
// =============================================================

const ROMAN_MAP: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6,
  VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
};

/**
 * Convert class string to grade number (1–12).
 * Accepts: Roman numerals ("I", "VII") or plain numbers ("1", "7").
 * Returns null if unrecognised.
 */
export const parseClassToGrade = (raw: string): number | null => {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase();

  // Plain integer
  const asInt = parseInt(cleaned, 10);
  if (!isNaN(asInt) && asInt >= 1 && asInt <= 12) return asInt;

  // Roman numeral
  const fromRoman = ROMAN_MAP[cleaned];
  if (fromRoman !== undefined) return fromRoman;

  // "Class 7" format
  const classMatch = cleaned.match(/^CLASS\s*(\d+)$/);
  if (classMatch) {
    const n = parseInt(classMatch[1], 10);
    if (n >= 1 && n <= 12) return n;
  }

  return null;
};

/** Inverse: grade number → Roman numeral string */
export const gradeToRoman = (grade: number): string => {
  const entry = Object.entries(ROMAN_MAP).find(([, v]) => v === grade);
  return entry ? entry[0] : String(grade);
};

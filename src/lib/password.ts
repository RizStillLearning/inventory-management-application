// Password rules for new accounts, and an advisory strength score.
// Letters and symbols are Unicode-aware, so "ä" counts as a letter, not a symbol.

const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;
const SYMBOL = /[^\p{L}\p{N}\s]/u;
const WHITESPACE = /\s/u;

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => [...p].length >= 8 },
  { id: 'letter', label: 'At least 1 letter', test: (p) => LETTER.test(p) },
  { id: 'digit', label: 'At least 1 number', test: (p) => DIGIT.test(p) },
  { id: 'symbol', label: 'At least 1 symbol (!@#…)', test: (p) => SYMBOL.test(p) },
  { id: 'space', label: 'No spaces', test: (p) => p.length > 0 && !WHITESPACE.test(p) },
];

export const meetsPasswordRules = (password: string) => PASSWORD_RULES.every((r) => r.test(password));

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  /** 0 = nothing typed yet, then 1 Weak, 2 Fair, 3 Good, 4 Strong. */
  level: StrengthLevel;
  label: string;
  tip?: string;
}

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

const COMMON = [
  'password', 'qwerty', 'asdf', 'zxcv', 'letmein', 'welcome', 'admin', 'login', 'iloveyou', 'monkey',
  'dragon', 'master', 'sunshine', 'princess', 'football', 'baseball', 'shadow', 'secret', 'abc123', 'test',
];

// Undo common character swaps so "P@ssw0rd" is recognised as "password".
const unleet = (s: string) =>
  s.toLowerCase().replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/[1!|]/g, 'i').replace(/0/g, 'o').replace(/[5$]/g, 's').replace(/7/g, 't');

function hasCommonWord(password: string, email?: string): boolean {
  const plain = password.toLowerCase();
  const swapped = unleet(password);
  const name = email?.split('@')[0]?.toLowerCase() ?? '';
  if (name.length >= 3 && plain.includes(name)) return true;
  return COMMON.some((w) => plain.includes(w) || swapped.includes(w));
}

const codePoints = (s: string) => [...s.toLowerCase()].map((c) => c.codePointAt(0)!);

/** The same character three times in a row, like "aaa". */
function hasRepeat(password: string): boolean {
  const c = codePoints(password);
  return c.some((v, i) => i >= 2 && v === c[i - 1] && v === c[i - 2]);
}

/** A run of four like "abcd", "1234" or "4321", the usual way to pad a password past the rules. */
function hasSequence(password: string): boolean {
  const c = codePoints(password);
  return c.some((_, i) => {
    if (i < 3) return false;
    const steps = [c[i - 2] - c[i - 3], c[i - 1] - c[i - 2], c[i] - c[i - 1]];
    return steps.every((s) => s === 1) || steps.every((s) => s === -1);
  });
}

/**
 * Advisory score shown in the meter. Anything that fails the rules is Weak. Otherwise the
 * score is the lower of a length level and a character-variety level (16+ characters is
 * Strong by itself), minus penalties for common words, sequences and repeats.
 */
export function passwordStrength(password: string, email?: string): PasswordStrength {
  if (!password) return { level: 0, label: '' };
  if (!meetsPasswordRules(password)) return { level: 1, label: LABELS[1] };

  const length = [...password].length;
  const hasLower = /\p{Ll}/u.test(password);
  const hasUpper = /\p{Lu}/u.test(password);
  // Rules guarantee a letter, a digit and a symbol, so variety is 3, or 4 with mixed case.
  const variety = hasLower && hasUpper ? 4 : 3;
  const lengthLevel = length >= 14 ? 4 : length >= 10 ? 3 : 2;
  let level = length >= 16 ? 4 : Math.min(lengthLevel, variety);

  const common = hasCommonWord(password, email);
  const sequence = hasSequence(password);
  const repeat = hasRepeat(password);
  if (common) level -= 2;
  if (sequence) level -= 2;
  if (repeat) level -= 1;
  const final = Math.max(1, Math.min(4, level)) as StrengthLevel;

  let tip: string | undefined;
  if (common) tip = 'Avoid common words and your email name.';
  else if (sequence || repeat) tip = 'Avoid sequences like 1234 or repeated characters.';
  else if (final < 4 && length < 14 && variety === 4) tip = 'Longer is stronger: try 14+ characters.';
  else if (final < 4 && variety === 3) tip = 'Mix upper and lower case, or use 16+ characters.';

  return { level: final, label: LABELS[final], tip };
}

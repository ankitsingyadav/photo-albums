import bcrypt from "bcryptjs";

export const MIN_PASSWORD_LENGTH = 10;
/** bcrypt silently ignores everything after 72 BYTES, so longer passwords are rejected instead of truncated. */
export const MAX_PASSWORD_BYTES = 72;

// A small list of the passwords attackers try first. It is checked against the password as typed and against
// its letters only, so "Password123!" and "p@ssw0rd" style variants are caught too.
const COMMON = new Set(`password passw0rd p@ssword qwerty qwertyuiop qwertyui asdfghjkl asdfgh zxcvbnm 1qaz2wsx qazwsx
iloveyou welcome letmein admin administrator login master monkey dragon sunshine princess football baseball soccer
hockey basketball batman superman starwars pokemon naruto cheese michael jennifer jordan hunter shadow ashley
bailey charlie donald freedom whatever trustno1 abc123 abcdef abcdefgh abcdefghij changeme secret default test
testing tester guest user root toor hello hello123 welcome1 summer winter spring autumn flower computer internet
samsung google facebook whatsapp instagram snapchat youtube iphone android cricket india india123 delhi mumbai
mypassword mypass pass pass1234 passpass qwerty123 admin123 1234 12345 123456 1234567 12345678 123456789 1234567890
0123456789 987654321 111111 000000 654321 666666 121212 112233 123123 123321 7777777 password1 password12 password123
photo photos photoalbum photoalbums album albums demo demo1234 demouser letmein1 iloveu loveyou lovely sweetheart
secret123 passwd pwd qwe123 zaq12wsx q1w2e3r4 1q2w3e4r 1q2w3e qweasd qweasdzxc zxcvbn lol123 football1 baseball1`.split(/\s+/));

/**
 * Common ways people disguise a weak password: the text itself, letters only, and with "leetspeak"
 * undone (p@ssw0rd -> password). Trailing decoration ("!!!!", "2024") is removed first, so a year
 * on the end doesn't get its digits mistaken for letters.
 */
function variants(lower: string): string[] {
  const core = lower.replace(/[^a-z]+$/, "");
  const unleet = (s: string, one: "i" | "l") =>
    s.replace(/[@4]/g, "a").replace(/[$5]/g, "s").replace(/0/g, "o").replace(/3/g, "e").replace(/7/g, "t").replace(/1/g, one).replace(/[^a-z]/g, "");
  const extra = new Set([lower.replace(/[^a-z]/g, ""), unleet(core, "i"), unleet(core, "l")]);
  return [lower, ...[...extra].filter((v) => v.length >= 4)];
}

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

/** Returns a message describing what is wrong with the password, or null if it is acceptable. */
export function checkPasswordPolicy(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return `Password is too long (at most ${MAX_PASSWORD_BYTES} bytes; some characters count as more than one)`;
  }
  const lower = password.toLowerCase();
  if (variants(lower).some((v) => COMMON.has(v))) return "That password is too common. Choose something harder to guess";
  if (new Set(lower).size < 5) return "Password needs more variety (it repeats the same few characters)";
  if (isSequence(lower)) return "Password is a simple sequence. Choose something harder to guess";
  if (KEYBOARD_ROWS.some((row) => containsRun(row, lower))) return "Password follows a keyboard pattern. Choose something harder to guess";
  if (email) {
    const local = email.toLowerCase().split("@")[0];
    if (lower === email.toLowerCase() || (local.length >= 4 && lower.includes(local))) return "Password must not contain your email name";
  }
  return null;
}

function isSequence(s: string) {
  let up = true, down = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

/** True when most of the password is one long run of a keyboard row (forwards or backwards). */
function containsRun(row: string, pw: string) {
  const rev = [...row].reverse().join("");
  for (const r of [row, rev]) {
    for (let i = 0; i + 6 <= r.length; i++) if (pw.includes(r.slice(i, i + 6)) && pw.length <= r.length + 4) return true;
  }
  return false;
}

export const hashPassword = (password: string, rounds: number) => bcrypt.hash(password, rounds);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** True when a stored hash uses a weaker cost than we use today (it is then upgraded at the next login). */
export function needsRehash(hash: string, rounds: number) {
  try { return bcrypt.getRounds(hash) < rounds; } catch { return true; }
}

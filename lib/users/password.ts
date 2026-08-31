/**
 * A readable starting password for a hand-delivered account.
 *
 * Avoids look-alike characters (i/l/1, o/0) because this gets written on paper
 * and typed by someone wearing gloves. Uses Web Crypto rather than
 * Math.random, which exists in both Node and the browser - so the server can
 * generate the suggestion and hand it to the form as a prop, which is what
 * keeps the first client render identical to the server's.
 */

const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

function pick(alphabet: string, count: number): string {
  const bytes = new Uint32Array(count);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function suggestPassword(): string {
  return pick(LETTERS, 6) + pick(DIGITS, 3);
}

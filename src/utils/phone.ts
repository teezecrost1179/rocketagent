// Normalize to something close to E.164 for North America
export function normalizePhone(raw: string): string {
  if (!raw) return raw;
  let digits = raw.trim();

  // Strip non-digits except leading +
  digits = digits.replace(/(?!^\+)\D/g, "");

  if (!digits.startsWith("+")) {
    // Assume North America if 10 digits
    if (/^\d{10}$/.test(digits)) {
      return "+1" + digits;
    }
  }

  return digits;
}

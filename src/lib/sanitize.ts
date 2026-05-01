export const sanitizeText = (input: string): string => {
  return input.replace(/<[^>]*>/g, "").trim();
};

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
};

export const isValidPhone = (phone: string): boolean => {
  return /^[+\d\s\-()]{7,20}$/.test(phone);
};

export const enforceMaxLength = (input: string, max: number): string => {
  return input.slice(0, max);
};

// Format a Philippine mobile number as the user types. Accepts free-form
// input (paste, partial typing, leading +63, leading 0, parentheses, etc.)
// and returns the canonical "0917 123 4567" or "+63 917 123 4567" shape.
//
// Only formats numbers that *could* be PH mobile (start with 09, 9, or
// +63 9). Anything else (international other than +63, landlines, gibberish)
// is returned untouched so we don't fight the user.
export const formatPhPhone = (raw: string): string => {
  if (!raw) return "";
  // Trim everything that isn't a digit or leading '+'.
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return hasPlus ? "+" : "";

  // Normalise to the 10-digit core (917 123 4567).
  let core = "";
  let prefix = "";
  if (digits.startsWith("63") && digits.length > 2) {
    prefix = "+63 ";
    core = digits.slice(2);
  } else if (digits.startsWith("0")) {
    prefix = "0";
    core = digits.slice(1);
  } else if (digits.startsWith("9")) {
    // Bare 9XXXXXXXXX — assume the leading 0 was dropped.
    prefix = "0";
    core = digits;
  } else {
    // Not a PH mobile pattern — leave raw input alone.
    return raw;
  }

  // Cap to 10 digits of core (PH mobile is always 10 after the 0/+63).
  core = core.slice(0, 10);

  // Group as XXX XXX XXXX progressively (so the user sees grouping take
  // shape as they type, not just after they finish).
  const parts: string[] = [];
  if (core.length > 0) parts.push(core.slice(0, 3));
  if (core.length > 3) parts.push(core.slice(3, 6));
  if (core.length > 6) parts.push(core.slice(6, 10));

  return `${prefix}${parts.join(" ")}`.trimEnd();
};

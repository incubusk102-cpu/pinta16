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

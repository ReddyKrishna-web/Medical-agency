export const emailPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i,
  // Deliberately permissive international phone shape.
  phone: /^\+?[0-9][0-9\s\-()]{6,19}$/
} as const;

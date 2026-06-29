/** Environment variable names: uppercase letters, digits, underscores; must start with a letter. */
export const ENV_VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function normalizeEnvVarName(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

export function validateEnvVarName(key: string): { valid: boolean; error?: string; normalized: string } {
  const normalized = normalizeEnvVarName(key);
  if (!normalized) {
    return { valid: false, normalized, error: 'Variable name is required' };
  }
  if (!ENV_VAR_NAME_PATTERN.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Use uppercase letters, numbers, and underscores only (e.g. BASE_URL)',
    };
  }
  return { valid: true, normalized };
}

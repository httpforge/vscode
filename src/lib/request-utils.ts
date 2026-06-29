import type { EnvVariable } from '../domain';

export function resolveEnvVars(text: string, variables: EnvVariable[]): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim();
    const match = variables.find((v) => v.key === trimmed);
    const value = match?.value?.trim();
    if (value) return value;
    return `{{${trimmed}}}`;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function tryParseJson(body: string): unknown | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export function tryFormatJson(body: string): string {
  const parsed = tryParseJson(body);
  if (parsed !== null) {
    return JSON.stringify(parsed, null, 2);
  }
  return body;
}

export function formatTimeAgo(timestamp: number): string {
  const sec = Math.floor((Date.now() - timestamp) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} hr ago`;
}

export function computeAvgResponse(durations: number[]): number {
  if (durations.length === 0) return 0;
  return Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
}

export function computeSuccessRate(statuses: number[]): number {
  if (statuses.length === 0) return 0;
  const success = statuses.filter((s) => s >= 200 && s < 400).length;
  return Math.round((success / statuses.length) * 1000) / 10;
}

export function computeRequestsPerSec(history: { timestamp: number }[]): string {
  if (history.length === 0) return '0';
  if (history.length === 1) return '1.0';

  const recent = history.slice(0, 20);
  const newest = recent[0].timestamp;
  const oldest = recent[recent.length - 1].timestamp;
  const spanSec = Math.max(1, (newest - oldest) / 1000);
  return (recent.length / spanSec).toFixed(1);
}

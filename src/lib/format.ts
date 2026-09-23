export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

export function formatLatency(value: number): string {
  if (!value) return "0 ms";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace("T", " ")
    .replace(/\.\d+/, "")
    .replace(/[+-]\d{2}:\d{2}$/, "")
    .replace(/Z$/, "");
}

export function maskSecret(value: string): string {
  if (value.length <= 16) return "••••••••";
  return `${value.slice(0, 12)}…${value.slice(-4)}`;
}

export function errorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  return "操作失败";
}

export function nowIso(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function todayKey(): string {
  return nowIso().slice(0, 10);
}

export function clientBase(host: string, port: number): string {
  const visible = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `http://${visible}:${port}/v1`;
}

export function parseList(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\n,，]/)) {
    const item = part.trim();
    if (item) seen.add(item);
  }
  return [...seen];
}

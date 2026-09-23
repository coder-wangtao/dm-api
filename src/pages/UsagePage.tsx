import { useMemo, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Banner, EmptyState } from "../components/ui/Badge";
import { SelectField } from "../components/ui/Field";
import { useAsync } from "../hooks/useAsync";
import { logApi } from "../lib/api";
import { formatLatency, formatNumber } from "../lib/format";
import type { LogStats } from "../types";

export function UsagePage() {
  const [days, setDays] = useState(14);
  const query = useAsync(() => logApi.getStats(days), [days]);
  const rows = useMemo(
    () => fillDays(query.data ?? [], days),
    [query.data, days],
  );
  const max = Math.max(...rows.map((item) => item.requests), 1);
  const totalRequests = rows.reduce((sum, item) => sum + item.requests, 0);
  const totalTokens = rows.reduce((sum, item) => sum + item.total_tokens, 0);
  const latencyBase = rows.filter((item) => item.requests > 0);
  const avgLatency = latencyBase.length
    ? Math.round(
        latencyBase.reduce((sum, item) => sum + item.avg_latency_ms, 0) /
          latencyBase.length,
      )
    : 0;

  return (
    <section>
      <PageHeader
        title="用量"
        description="按日汇总请求数、Token 和平均延迟。"
        action={
          <div className="w-36">
            <SelectField
              label="范围"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>近 7 天</option>
              <option value={14}>近 14 天</option>
              <option value={30}>近 30 天</option>
            </SelectField>
          </div>
        }
      />
      {query.error ? <Banner tone="danger">{query.error}</Banner> : null}
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Summary label="请求数" value={formatNumber(totalRequests)} />
        <Summary label="Token" value={formatNumber(totalTokens)} />
        <Summary label="平均延迟" value={formatLatency(avgLatency)} />
      </div>
      {totalRequests === 0 ? (
        <EmptyState title="所选时间范围内还没有用量。" />
      ) : (
        <div className="rounded-2xl border border-line bg-elevated p-5">
          <div className="flex h-56 items-end gap-1.5">
            {rows.map((item, index) => (
              <div
                key={item.date}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                <div
                  className="rounded-t-md bg-accent"
                  style={{
                    height: `${Math.max((item.requests / max) * 100, item.requests ? 6 : 0)}%`,
                  }}
                  title={`${item.date} · ${item.requests} 次 · ${formatNumber(item.total_tokens)} Token`}
                />
                <div className="mt-2 h-4 text-center text-[11px] text-muted">
                  {showDateLabel(index, rows.length) ? item.date.slice(5) : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function showDateLabel(index: number, total: number): boolean {
  const step = total <= 7 ? 1 : total <= 14 ? 2 : 5;
  return index === total - 1 || index % step === 0;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-line bg-elevated px-4 py-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="num mt-2 text-2xl font-semibold">{value}</div>
    </article>
  );
}

function fillDays(stats: LogStats[], days: number): LogStats[] {
  const map = new Map(stats.map((item) => [item.date, item]));
  const rows: LogStats[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    rows.push(
      map.get(key) ?? {
        date: key,
        requests: 0,
        total_tokens: 0,
        avg_latency_ms: 0,
      },
    );
  }
  return rows;
}

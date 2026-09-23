import { Link } from "react-router-dom";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, Banner, EmptyState } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useAsync } from "../hooks/useAsync";
import { useServerStatus } from "../hooks/useServerStatus";
import { logApi, statsApi } from "../lib/api";
import {
  clientBase,
  formatLatency,
  formatNumber,
  formatTime,
} from "../lib/format";
import { isTauri } from "../lib/runtime";

export function DashboardPage() {
  const statsQuery = useAsync(() => statsApi.getDashboard(), []);
  const logsQuery = useAsync(() => logApi.getAll({ limit: 6 }), []);
  const status = useServerStatus((state) => state.status);
  const stats = statsQuery.data;
  const cards = [
    {
      label: "今日请求数",
      value: formatNumber(stats?.today_requests ?? 0),
      hint: `累计 ${formatNumber(stats?.total_requests ?? 0)}`,
    },
    {
      label: "Token 消耗",
      value: formatNumber(stats?.today_total_tokens ?? 0),
      hint: `累计 ${formatNumber(stats?.total_tokens ?? 0)}`,
    },
    {
      label: "活跃渠道",
      value: formatNumber(stats?.active_channels ?? 0),
      hint: `共 ${formatNumber(stats?.total_channels ?? 0)} 个渠道`,
    },
    {
      label: "平均延迟",
      value: formatLatency(stats?.avg_latency_ms ?? 0),
      hint: "今日成功请求",
    },
  ];

  return (
    <section>
      <PageHeader
        title="仪表盘"
        description="今日请求、Token、渠道和延迟一览。"
      />
      {!isTauri() ? (
        <Banner>
          当前是浏览器预览，示例数据保存在本地浏览器。桌面端会写入
          SQLite，并启动本地网关。
        </Banner>
      ) : null}
      {statsQuery.error ? (
        <Banner tone="danger">{statsQuery.error}</Banner>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-elevated px-4 py-3 text-sm">
        <div>
          <div className="text-muted">OpenAI 兼容地址</div>
          <div className="num mt-1 font-medium">
            {status?.running
              ? clientBase(status.host, status.port)
              : "网关未启动"}
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            if (status?.running)
              void navigator.clipboard.writeText(
                clientBase(status.host, status.port),
              );
          }}
        >
          复制地址
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-line bg-elevated px-4 py-4"
          >
            <div className="text-sm text-muted">{card.label}</div>
            <div className="num mt-3 text-3xl font-semibold tracking-tight">
              {card.value}
            </div>
            <div className="mt-2 text-xs text-muted">{card.hint}</div>
          </article>
        ))}
      </div>
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">最近请求</h2>
          <Link to="/logs" className="text-sm text-accent">
            查看日志
          </Link>
        </div>
        {logsQuery.data && logsQuery.data.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-line bg-elevated">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunken/70 text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">渠道</th>
                  <th className="px-4 py-3 font-medium">模型</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">Token</th>
                  <th className="px-4 py-3 font-medium">延迟</th>
                </tr>
              </thead>
              <tbody>
                {logsQuery.data.map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="px-4 py-3 text-muted">
                      {formatTime(item.created_at)}
                    </td>
                    <td className="px-4 py-3">{item.channel_name || "—"}</td>
                    <td className="px-4 py-3">{item.model}</td>
                    <td className="px-4 py-3">
                      <Badge tone={item.status_code < 400 ? "ok" : "danger"}>
                        {item.status_code}
                      </Badge>
                    </td>
                    <td className="num px-4 py-3">
                      {formatNumber(item.total_tokens)}
                    </td>
                    <td className="num px-4 py-3">
                      {formatLatency(item.duration_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="还没有请求记录。通过网关调用模型后，会显示在这里。" />
        )}
      </div>
    </section>
  );
}

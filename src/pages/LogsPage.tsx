import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, Banner, EmptyState } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SelectField, TextField } from "../components/ui/Field";
import { useAsync } from "../hooks/useAsync";
import { channelApi, logApi } from "../lib/api";
import { errorMessage, formatLatency, formatNumber, formatTime } from "../lib/format";

export function LogsPage() {
  const [keyword, setKeyword] = useState("");
  const [channel, setChannel] = useState("");
  const [model, setModel] = useState("");
  const [debounced, setDebounced] = useState("");
  const [notice, setNotice] = useState("");
  const channels = useAsync(() => channelApi.getAll(), []);
  const logs = useAsync(
    () => logApi.getAll({ keyword: debounced, channel_name: channel, model }),
    [debounced, channel, model],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const modelOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of channels.data ?? []) {
      for (const name of item.models) values.add(name);
    }
    for (const item of logs.data ?? []) values.add(item.model);
    return [...values];
  }, [channels.data, logs.data]);

  async function remove(id: string) {
    try {
      await logApi.delete(id);
      logs.reload();
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  return (
    <section>
      <PageHeader title="日志" description="按关键词、渠道和模型筛选请求记录。" />
      {notice ? <Banner tone="danger">{notice}</Banner> : null}
      {logs.error ? <Banner tone="danger">{logs.error}</Banner> : null}
      <div className="mb-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <TextField
          label="关键词"
          value={keyword}
          placeholder="渠道、模型、密钥或错误信息"
          onChange={(event) => setKeyword(event.target.value)}
        />
        <SelectField label="渠道" value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="">全部渠道</option>
          {(channels.data ?? []).map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </SelectField>
        <SelectField label="模型" value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="">全部模型</option>
          {modelOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </SelectField>
      </div>
      {logs.data && logs.data.length === 0 ? (
        <EmptyState title="没有符合条件的请求日志。" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-sunken/70 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">密钥</th>
                <th className="px-4 py-3 font-medium">渠道</th>
                <th className="px-4 py-3 font-medium">模型</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">延迟</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {(logs.data ?? []).map((item) => (
                <tr key={item.id} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-muted">{formatTime(item.created_at)}</td>
                  <td className="px-4 py-3">{item.api_key_name || "—"}</td>
                  <td className="px-4 py-3">{item.channel_name || "—"}</td>
                  <td className="px-4 py-3">
                    <div>{item.model}</div>
                    {item.error_message ? <div className="mt-1 text-xs text-danger">{item.error_message}</div> : null}
                    {item.risk_level !== "none" ? (
                      <div className="mt-1 text-xs text-warn">风险 {item.risk_level}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={item.status_code < 400 ? "ok" : "danger"}>{item.status_code}</Badge>
                  </td>
                  <td className="num px-4 py-3">{formatNumber(item.total_tokens)}</td>
                  <td className="num px-4 py-3">{formatLatency(item.duration_ms)}</td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" onClick={() => void remove(item.id)}>删除</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

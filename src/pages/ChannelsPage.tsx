import { useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, Banner, EmptyState } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SelectField, TextAreaField, TextField } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { useAsync } from "../hooks/useAsync";
import { channelApi } from "../lib/api";
import { CHANNEL_TYPES, channelLabel } from "../lib/constants";
import { errorMessage, formatTime, parseList } from "../lib/format";
import type { Channel } from "../types";

interface ChannelForm {
  id?: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  models: string;
  priority: number;
  weight: number;
  status: number;
}

const emptyForm = (): ChannelForm => ({
  name: "",
  type: "openai",
  base_url: CHANNEL_TYPES[0].baseUrl,
  api_key: "",
  models: CHANNEL_TYPES[0].models,
  priority: 0,
  weight: 1,
  status: 1,
});

export function ChannelsPage() {
  const query = useAsync(() => channelApi.getAll(), []);
  const [form, setForm] = useState<ChannelForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Channel | null>(null);
  const [notice, setNotice] = useState<{
    tone: "ok" | "danger";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  function changeType(next: string) {
    const preset =
      CHANNEL_TYPES.find((item) => item.id === next) ?? CHANNEL_TYPES[0];
    setForm((current) => {
      if (!current) return current;
      const previous = CHANNEL_TYPES.find((item) => item.id === current.type);
      return {
        ...current,
        type: next,
        base_url:
          !current.base_url || current.base_url === previous?.baseUrl
            ? preset.baseUrl
            : current.base_url,
        models:
          !current.models || current.models === previous?.models
            ? preset.models
            : current.models,
      };
    });
  }

  async function submit() {
    if (!form) return;
    if (
      !form.name.trim() ||
      !form.base_url.trim() ||
      (!form.id && !form.api_key.trim())
    ) {
      setNotice({ tone: "danger", text: "请填写名称、Base URL 和 API Key。" });
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: form.name.trim(),
        type: form.type,
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        models: parseList(form.models),
        priority: Number(form.priority) || 0,
        weight: Number(form.weight) || 1,
        status: form.status,
      };
      if (form.id) await channelApi.update({ id: form.id, ...input });
      else await channelApi.create(input);
      setForm(null);
      setNotice({
        tone: "ok",
        text: form.id ? "渠道已更新。" : "渠道已添加。",
      });
      query.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function test(channel: Channel) {
    try {
      const result = await channelApi.test(channel.id);
      setNotice({
        tone: result.ok ? "ok" : "danger",
        text: `${channel.name}：${result.message}`,
      });
      query.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  async function toggle(channel: Channel) {
    try {
      await channelApi.toggle(channel.id, channel.status === 1 ? 0 : 1);
      query.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    try {
      await channelApi.delete(pendingDelete.id);
      setPendingDelete(null);
      setNotice({ tone: "ok", text: "渠道已删除。" });
      query.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  const channels = query.data ?? [];

  return (
    <section>
      <PageHeader
        title="渠道"
        description="管理 OpenAI、DeepSeek、Claude、Gemini 和自定义上游。"
        action={
          <Button variant="primary" onClick={() => setForm(emptyForm())}>
            添加渠道
          </Button>
        }
      />
      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      {query.error ? <Banner tone="danger">{query.error}</Banner> : null}
      {channels.length === 0 ? (
        <EmptyState
          title="还没有渠道。添加一个上游后即可开始转发。"
          action={
            <Button variant="primary" onClick={() => setForm(emptyForm())}>
              添加渠道
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-sunken/70 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">模型</th>
                <th className="px-4 py-3 font-medium">优先级 / 权重</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">最近测试</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <div className="font-medium">{channel.name}</div>
                    <div className="mt-1 max-w-56 truncate text-xs text-muted">
                      {channel.base_url}
                    </div>
                  </td>
                  <td className="px-4 py-3">{channelLabel(channel.type)}</td>
                  <td className="px-4 py-3 text-muted">
                    {channel.models.length ? channel.models.join("、") : "全部"}
                  </td>
                  <td className="num px-4 py-3">
                    {channel.priority} / {channel.weight}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={channel.status === 1 ? "ok" : "neutral"}>
                      {channel.status === 1 ? "启用" : "停用"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {channel.last_test_at ? (
                      <span>
                        {channel.last_test_ok ? "成功" : "失败"} ·{" "}
                        {formatTime(channel.last_test_at)}
                      </span>
                    ) : (
                      "未测试"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        onClick={() => void test(channel)}
                      >
                        测试
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setForm({
                            id: channel.id,
                            name: channel.name,
                            type: channel.type,
                            base_url: channel.base_url,
                            api_key: "",
                            models: channel.models.join(", "),
                            priority: channel.priority,
                            weight: channel.weight,
                            status: channel.status,
                          })
                        }
                      >
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void toggle(channel)}
                      >
                        {channel.status === 1 ? "停用" : "启用"}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setPendingDelete(channel)}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(form)}
        title={form?.id ? "编辑渠道" : "添加渠道"}
        onClose={() => setForm(null)}
        footer={
          <>
            <Button onClick={() => setForm(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving ? "保存中" : "保存"}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="grid gap-4">
            <TextField
              label="名称"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            <SelectField
              label="类型"
              value={form.type}
              onChange={(event) => changeType(event.target.value)}
            >
              {CHANNEL_TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Base URL"
              value={form.base_url}
              onChange={(event) =>
                setForm({ ...form, base_url: event.target.value })
              }
            />
            <TextField
              label="API Key"
              type="password"
              value={form.api_key}
              hint={form.id ? "留空则保持原密钥" : undefined}
              onChange={(event) =>
                setForm({ ...form, api_key: event.target.value })
              }
            />
            <TextAreaField
              label="模型"
              value={form.models}
              placeholder="用逗号或换行分隔，留空表示接受全部模型"
              onChange={(event) =>
                setForm({ ...form, models: event.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="优先级"
                type="number"
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: Number(event.target.value) })
                }
              />
              <TextField
                label="权重"
                type="number"
                min={1}
                value={form.weight}
                onChange={(event) =>
                  setForm({ ...form, weight: Number(event.target.value) })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={form.status === 1}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.checked ? 1 : 0 })
                }
              />
              启用渠道
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        title="删除渠道"
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="danger" onClick={() => void remove()}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          确定删除「{pendingDelete?.name}」？已产生的日志仍会保留渠道名称。
        </p>
      </Modal>
    </section>
  );
}

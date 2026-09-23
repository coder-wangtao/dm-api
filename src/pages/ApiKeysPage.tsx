import { useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge, Banner, EmptyState } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { useAsync } from "../hooks/useAsync";
import { apiKeyApi } from "../lib/api";
import { errorMessage, formatNumber, maskSecret, parseList } from "../lib/format";
import type { ApiKey } from "../types";

interface KeyForm {
  id?: string;
  name: string;
  quota_limit: number;
  allowed_models: string;
}

export function ApiKeysPage() {
  const query = useAsync(() => apiKeyApi.getAll(), []);
  const [form, setForm] = useState<KeyForm | null>(null);
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiKey | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form || !form.name.trim()) {
      setNotice({ tone: "danger", text: "请填写密钥名称。" });
      return;
    }
    if (form.quota_limit < 0) {
      setNotice({ tone: "danger", text: "配额不能为负数。" });
      return;
    }
    setSaving(true);
    try {
      const models = parseList(form.allowed_models);
      if (form.id) {
        await apiKeyApi.update({
          id: form.id,
          name: form.name.trim(),
          quota_limit: form.quota_limit,
          allowed_models: models,
        });
        setNotice({ tone: "ok", text: "密钥已更新。" });
      } else {
        const key = await apiKeyApi.create({
          name: form.name.trim(),
          quota_limit: form.quota_limit,
          allowed_models: models,
        });
        setCreated(key);
        setCopied(false);
      }
      setForm(null);
      query.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(key: ApiKey) {
    try {
      await apiKeyApi.update({ id: key.id, status: key.status === 1 ? 0 : 1 });
      query.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    try {
      await apiKeyApi.delete(pendingDelete.id);
      setPendingDelete(null);
      setNotice({ tone: "ok", text: "密钥已删除。" });
      query.reload();
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  const keys = query.data ?? [];

  return (
    <section>
      <PageHeader
        title="密钥"
        description="创建 sk-waliapi-* 访问密钥，并设置 Token 配额。"
        action={
          <Button variant="primary" onClick={() => setForm({ name: "", quota_limit: 0, allowed_models: "" })}>
            创建密钥
          </Button>
        }
      />
      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      {query.error ? <Banner tone="danger">{query.error}</Banner> : null}
      {keys.length === 0 ? (
        <EmptyState title="还没有密钥。客户端使用这里创建的密钥访问本地网关。" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-elevated">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-sunken/70 text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">密钥</th>
                <th className="px-4 py-3 font-medium">配额</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const ratio = key.quota_limit > 0 ? Math.min(100, (key.quota_used / key.quota_limit) * 100) : 0;
                return (
                  <tr key={key.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{key.name}</td>
                    <td className="num px-4 py-3 font-mono text-xs">{maskSecret(key.key)}</td>
                    <td className="px-4 py-3">
                      <div className="num">
                        {formatNumber(key.quota_used)} / {key.quota_limit > 0 ? formatNumber(key.quota_limit) : "不限"}
                      </div>
                      {key.quota_limit > 0 ? (
                        <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full bg-accent" style={{ width: `${ratio}%` }} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={key.status === 1 ? "ok" : "neutral"}>{key.status === 1 ? "启用" : "停用"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setForm({
                              id: key.id,
                              name: key.name,
                              quota_limit: key.quota_limit,
                              allowed_models: key.allowed_models.join(", "),
                            })
                          }
                        >
                          编辑
                        </Button>
                        <Button variant="ghost" onClick={() => void toggle(key)}>
                          {key.status === 1 ? "停用" : "启用"}
                        </Button>
                        <Button variant="danger" onClick={() => setPendingDelete(key)}>删除</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(form)}
        title={form?.id ? "编辑密钥" : "创建密钥"}
        onClose={() => setForm(null)}
        footer={
          <>
            <Button onClick={() => setForm(null)}>取消</Button>
            <Button variant="primary" disabled={saving} onClick={() => void submit()}>
              {saving ? "保存中" : form?.id ? "保存" : "创建"}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="grid gap-4">
            <TextField label="名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <TextField
              label="Token 配额"
              type="number"
              min={0}
              value={form.quota_limit}
              hint="0 表示不限制"
              onChange={(event) => setForm({ ...form, quota_limit: Number(event.target.value) })}
            />
            <TextField
              label="允许的模型"
              value={form.allowed_models}
              hint="可选，逗号分隔。留空表示不限制模型"
              onChange={(event) => setForm({ ...form, allowed_models: event.target.value })}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(created)}
        title="密钥已创建"
        onClose={() => setCreated(null)}
        footer={<Button variant="primary" onClick={() => setCreated(null)}>我已复制</Button>}
      >
        {created ? (
          <div>
            <p className="text-sm text-muted">请立即复制。关闭后列表里只显示掩码。</p>
            <div className="num mt-3 break-all rounded-lg bg-sunken px-3 py-3 font-mono text-xs">{created.key}</div>
            <Button
              className="mt-3"
              onClick={() => {
                void navigator.clipboard.writeText(created.key);
                setCopied(true);
              }}
            >
              {copied ? "已复制" : "复制密钥"}
            </Button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        title="删除密钥"
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="danger" onClick={() => void remove()}>删除</Button>
          </>
        }
      >
        <p className="text-sm text-muted">确定删除「{pendingDelete?.name}」？使用该密钥的客户端将无法继续访问。</p>
      </Modal>
    </section>
  );
}

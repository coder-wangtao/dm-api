import { useEffect, useState } from "react";
import { PageHeader } from "../components/layout/PageHeader";
import { Banner } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SelectField, SwitchRow, TextField } from "../components/ui/Field";
import { useServerStatus } from "../hooks/useServerStatus";
import { serverApi, settingsApi } from "../lib/api";
import { DEFAULT_SETTINGS } from "../lib/constants";
import { clientBase, errorMessage } from "../lib/format";
import type { Settings } from "../types";

const tabs = [
  { id: "server", label: "服务配置" },
  { id: "general", label: "通用设置" },
  { id: "ui", label: "界面设置" },
  { id: "retry", label: "重试策略" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("server");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const status = useServerStatus((state) => state.status);
  const refresh = useServerStatus((state) => state.refresh);

  useEffect(() => {
    settingsApi
      .get()
      .then((value) => {
        setSettings(value);
        applyTheme(value);
      })
      .catch((err: unknown) => setNotice({ tone: "danger", text: errorMessage(err) }));
    void refresh();
  }, [refresh]);

  function patch(partial: Partial<Settings>) {
    setSettings((current) => {
      const next = { ...current, ...partial };
      if (partial.ui_theme || partial.ui_language) applyTheme(next);
      return next;
    });
  }

  async function save() {
    if (!settings.server_host.trim() || settings.server_port < 1 || settings.server_port > 65535) {
      setNotice({ tone: "danger", text: "请填写有效的监听地址和端口。" });
      return;
    }
    setSaving(true);
    try {
      await settingsApi.save(settings);
      applyTheme(settings);
      await refresh();
      setNotice({ tone: "ok", text: "设置已保存。" });
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function control(action: "start" | "stop" | "restart") {
    try {
      if (action === "start") await serverApi.start();
      if (action === "stop") await serverApi.stop();
      if (action === "restart") await serverApi.restart();
      await refresh();
      setNotice({ tone: "ok", text: action === "stop" ? "网关已停止。" : "网关已启动。" });
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  async function exportBackup() {
    try {
      const text = await settingsApi.exportData();
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "damao-api-backup.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  async function importBackup(file: File) {
    try {
      await settingsApi.importData(await file.text());
      const next = await settingsApi.get();
      setSettings(next);
      applyTheme(next);
      await refresh();
      setNotice({ tone: "ok", text: "备份已导入。" });
    } catch (err) {
      setNotice({ tone: "danger", text: errorMessage(err) });
    }
  }

  return (
    <section>
      <PageHeader title="设置" description="服务、界面、安全和失败重试。" />
      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === item.id ? "bg-accent text-accent-ink" : "bg-sunken text-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-elevated px-5 py-4">
        {tab === "server" ? (
          <div className="grid max-w-xl gap-4">
            <TextField
              label="监听地址"
              value={settings.server_host}
              onChange={(event) => patch({ server_host: event.target.value })}
            />
            <TextField
              label="端口"
              type="number"
              min={1}
              max={65535}
              value={settings.server_port}
              onChange={(event) => patch({ server_port: Number(event.target.value) })}
            />
            <p className="text-sm text-muted">
              客户端 Base URL：{clientBase(settings.server_host || "127.0.0.1", settings.server_port || 8787)}
              。当前状态：{status?.running ? "运行中" : "已停止"}
              {status?.address ? `（${status.address}）` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void control("start")} disabled={status?.running}>启动</Button>
              <Button onClick={() => void control("stop")} disabled={!status?.running}>停止</Button>
              <Button onClick={() => void control("restart")}>重启</Button>
            </div>
          </div>
        ) : null}
        {tab === "general" ? (
          <div className="max-w-2xl">
            <SwitchRow
              label="开机自动启动"
              description="登录系统后自动打开大猫网关。"
              checked={settings.auto_start}
              onChange={(checked) => patch({ auto_start: checked })}
            />
            <SwitchRow
              label="关闭时最小化到托盘"
              description="关闭窗口后保留网关进程，可从托盘重新打开。"
              checked={settings.close_to_tray}
              onChange={(checked) => patch({ close_to_tray: checked })}
            />
            <SwitchRow
              label="启动时最小化到托盘"
              checked={settings.minimize_to_tray}
              onChange={(checked) => patch({ minimize_to_tray: checked })}
            />
            <div className="mt-6 text-sm font-medium">安全审计</div>
            <SwitchRow
              label="启用安全审计"
              checked={settings.security_enabled}
              onChange={(checked) => patch({ security_enabled: checked })}
            />
            <div className="max-w-xs py-3">
              <SelectField
                label="策略模式"
                value={settings.security_mode}
                onChange={(event) => patch({ security_mode: event.target.value })}
              >
                <option value="audit">审计：只记录风险</option>
                <option value="enforce">拦截：严重风险时拒绝请求</option>
              </SelectField>
            </div>
            <SwitchRow label="扫描零宽字符" checked={settings.security_scan_unicode} onChange={(checked) => patch({ security_scan_unicode: checked })} />
            <SwitchRow label="扫描提示词注入" checked={settings.security_scan_tools} onChange={(checked) => patch({ security_scan_tools: checked })} />
            <SwitchRow label="扫描内网地址" checked={settings.security_scan_network} onChange={(checked) => patch({ security_scan_network: checked })} />
            <SwitchRow label="扫描上游响应" checked={settings.security_scan_response} onChange={(checked) => patch({ security_scan_response: checked })} />
            <SwitchRow label="脱敏密钥" checked={settings.security_redact_secrets} onChange={(checked) => patch({ security_redact_secrets: checked })} />
            <SwitchRow
              label="严重风险时拦截"
              description="仅在拦截模式下生效。"
              checked={settings.security_block_on_critical}
              onChange={(checked) => patch({ security_block_on_critical: checked })}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void exportBackup()}>导出配置</Button>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-elevated px-3 py-2 text-sm">
                导入配置
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importBackup(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}
        {tab === "ui" ? (
          <div className="grid max-w-md gap-4">
            <SelectField label="主题" value={settings.ui_theme} onChange={(event) => patch({ ui_theme: event.target.value })}>
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </SelectField>
            <SelectField
              label="语言"
              value={settings.ui_language}
              onChange={(event) => patch({ ui_language: event.target.value })}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </SelectField>
          </div>
        ) : null}
        {tab === "retry" ? (
          <div className="max-w-xl">
            <SwitchRow
              label="启用失败重试"
              description="上游返回 5xx、429 或网络错误时，按优先级改派到其他渠道。"
              checked={settings.retry_enabled}
              onChange={(checked) => patch({ retry_enabled: checked })}
            />
            <div className="max-w-xs pt-4">
              <TextField
                label="额外重试次数"
                type="number"
                min={0}
                max={10}
                value={settings.retry_times}
                hint="0 到 10。这是失败后的额外尝试次数。"
                onChange={(event) => patch({ retry_times: Number(event.target.value) })}
              />
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-4">
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "保存中" : "保存设置"}
        </Button>
      </div>
    </section>
  );
}

function applyTheme(settings: Settings) {
  document.documentElement.setAttribute("data-theme", settings.ui_theme || "dark");
  document.documentElement.lang = settings.ui_language || "zh-CN";
}

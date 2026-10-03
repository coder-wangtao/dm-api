import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { UniversalTransition } from "echarts/features";
import { statsApi } from "../lib/api";
import type { DashboardStats, ModelStats, TokenTrendPoint } from "../types";
import { formatNumber, formatDuration } from "../lib/constants";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
  UniversalTransition,
]);
import {
  Activity,
  Radio,
  Key,
  Zap,
  TrendingUp,
  ShieldCheck,
  Workflow,
  Plus,
  BookOpen,
  FileText,
  Globe,
  HelpCircle,
  X,
  Check,
  Layers,
  DatabaseZap,
} from "lucide-react";

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [tokenTrend, setTokenTrend] = useState<TokenTrendPoint[]>([]);
  const [trendHours, setTrendHours] = useState<24 | 168 | 720>(24);
  const [loadError, setLoadError] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const doLoad = () =>
      statsApi
        .getDashboard()
        .then(setStats)
        .catch(() => setLoadError(true));
    doLoad();
    const interval = setInterval(doLoad, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const doLoad = () =>
      statsApi
        .getModelStats()
        .then(setModelStats)
        .catch(() => {});
    doLoad();
    const interval = setInterval(doLoad, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const doLoad = () =>
      statsApi
        .getTokenTrend(trendHours)
        .then(setTokenTrend)
        .catch(() => {});
    doLoad();
    const interval = setInterval(doLoad, 30000);
    return () => clearInterval(interval);
  }, [trendHours]);

  if (loadError && !stats) {
    return (
      <div className="page-shell flex flex-col items-center justify-center gap-3 text-sm text-slate-500">
        <p>数据加载失败，请检查服务是否已启动。</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
        >
          重新加载
        </button>
      </div>
    );
  }

  if (!stats) {
    return <div className="page-shell text-sm text-slate-500">加载中...</div>;
  }

  // 服务可用率 = 可用上游 / 全部上游，上游包含 API 渠道与 Auth 账号两类。
  // 字段缺失（旧后端 + 新前端的版本错位）按 0 优雅降级，避免 NaN（NEW-4）。
  const activeUpstreams =
    (stats.active_channels ?? 0) + (stats.active_auth_accounts ?? 0);
  const totalUpstreams =
    (stats.total_channels ?? 0) + (stats.total_auth_accounts ?? 0);
  const availability =
    totalUpstreams > 0
      ? Math.round((activeUpstreams / totalUpstreams) * 100)
      : 0;

  // 上 5：请求与渠道 | 下 5：知识服务
  const cacheRate = (cached: number, prompt: number) =>
    prompt > 0 ? `${Math.round((cached / prompt) * 100)}%` : "0%";

  const topMetrics = [
    {
      label: "今日请求",
      value: formatNumber(stats.today_requests),
      icon: Activity,
      color: "text-blue-600",
      tone: "bg-blue-50",
    },
    {
      label: "今日 Token",
      value: formatNumber(stats.today_total_tokens),
      icon: Zap,
      color: "text-amber-600",
      tone: "bg-amber-50",
    },
    {
      label: "今日缓存命中",
      value: cacheRate(stats.today_cached_tokens, stats.today_prompt_tokens),
      sub: `节省 ${formatNumber(stats.today_cached_tokens)} tokens`,
      icon: DatabaseZap,
      color: "text-emerald-600",
      tone: "bg-emerald-50",
    },
    {
      label: "累计请求",
      value: formatNumber(stats.total_requests),
      icon: TrendingUp,
      color: "text-indigo-600",
      tone: "bg-indigo-50",
    },
    {
      label: "累计 Token",
      value: formatNumber(stats.total_tokens),
      icon: Zap,
      color: "text-orange-600",
      tone: "bg-orange-50",
    },
    {
      label: "活跃上游",
      value: `${activeUpstreams}/${totalUpstreams}`,
      sub: `渠道 ${stats.active_channels}/${stats.total_channels} · 账号 ${stats.active_auth_accounts}/${stats.total_auth_accounts}`,
      icon: Radio,
      color: "text-teal-600",
      tone: "bg-teal-50",
    },
  ];
  const bottomMetrics = [
    {
      label: "平均延迟",
      value: formatDuration(Math.round(stats.avg_latency_ms)),
      icon: Workflow,
      color: "text-violet-600",
      tone: "bg-violet-50",
    },
    {
      label: "累计缓存命中",
      value: cacheRate(stats.total_cached_tokens, stats.total_prompt_tokens),
      sub: `节省 ${formatNumber(stats.total_cached_tokens)} tokens`,
      icon: DatabaseZap,
      color: "text-lime-600",
      tone: "bg-lime-50",
    },
  ];

  const quickActions = [
    { title: "新建渠道", icon: Plus, action: () => navigate("/channels") },
    { title: "管理密钥", icon: Key, action: () => navigate("/api-keys") },
    { title: "接入示例", icon: BookOpen, action: () => navigate("/usage") },
    { title: "审计日志", icon: FileText, action: () => navigate("/logs") },
    {
      title: "安全设置",
      icon: ShieldCheck,
      action: () => navigate("/settings"),
    },
    { title: "渠道管理", icon: Globe, action: () => navigate("/channels") },
  ];

  return (
    <div className="page-shell space-y-5">
      {/* 顶部：欢迎 + 快速操作 */}
      <section className="surface rounded-[24px] p-6 md:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <Workflow className="h-3.5 w-3.5" /> 控制台首页
            </div>
            <div className="mt-4 flex items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">
                欢迎使用 DamaoAPI
              </h1>
              <button
                onClick={() => setShowHelp(true)}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 p-1 text-slate-400 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                title="使用帮助"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2.5 text-sm leading-6 text-slate-500 md:text-[15px]">
              在一个统一入口中管理上游模型渠道、下游密钥、请求统计与故障切换，让本地
              LLM 网关更稳定、更清晰、更易运维。
            </p>

            {/* 快速操作按钮 */}
            <div className="mt-5 flex flex-wrap gap-2">
              {quickActions.map(({ title, icon: Icon, action }) => (
                <button
                  key={title}
                  onClick={action}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:border-blue-200 hover:bg-white hover:text-blue-700 hover:shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {title}
                </button>
              ))}
            </div>
          </div>

          {/* 健康度徽章 */}
          <div className="flex gap-3 xl:w-auto">
            <div
              className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${availability >= 80 ? "border-emerald-200 bg-emerald-50" : availability >= 50 ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"}`}
            >
              <ShieldCheck
                className={`h-5 w-5 ${availability >= 80 ? "text-emerald-600" : availability >= 50 ? "text-amber-600" : "text-rose-600"}`}
              />
              <div>
                <div className="text-xs text-slate-500">服务可用率</div>
                <div
                  className={`text-lg font-semibold ${availability >= 80 ? "text-emerald-700" : availability >= 50 ? "text-amber-700" : "text-rose-700"}`}
                >
                  {availability}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 指标卡片 — 上排：请求与渠道 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {topMetrics.map(({ label, value, sub, icon: Icon, color, tone }) => (
          <div key={label} className="surface data-card">
            <div className="flex items-center justify-between">
              <div className={`rounded-xl ${tone} p-2`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              {value}
            </div>
            <div className="text-xs text-slate-500">{label}</div>
            {sub && (
              <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* 指标卡片 — 下排：知识服务 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {bottomMetrics.map(({ label, value, sub, icon: Icon, color, tone }) => (
          <div key={label} className="surface data-card">
            <div className="flex items-center justify-between">
              <div className={`rounded-xl ${tone} p-2`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              {value}
            </div>
            <div className="text-xs text-slate-500">{label}</div>
            {sub && (
              <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* 模型分布表格 */}
      <ModelDistributionTable data={modelStats} />

      {/* Token 使用趋势图 */}
      <TokenTrendChart
        data={tokenTrend}
        hours={trendHours}
        onHoursChange={setTrendHours}
      />

      {/* 运维建议 */}
      <section className="surface rounded-[20px] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">运维建议</h2>
            <p className="mt-1 text-sm text-slate-500">
              根据当前系统状态给出的运维参考
            </p>
          </div>
          <TrendingUp className="h-5 w-5 text-slate-400" />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-slate-900">
                渠道健康度
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              {availability >= 80
                ? "当前上游运行正常，渠道与账号线路可用。"
                : availability >= 50
                  ? "部分上游不可用，建议检查渠道与 Auth 账号并启用备用线路。"
                  : "活跃上游较少，请前往渠道/Auth 账号页测试并启用。"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-medium text-slate-900">
                密钥配额
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              {stats.total_api_keys > 0
                ? `共 ${stats.total_api_keys} 个密钥，定期检查配额使用情况。`
                : "尚未创建密钥，请前往 API 密钥页创建。"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-slate-900">
                性能监控
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              {stats.avg_latency_ms < 2000
                ? `平均延迟 ${formatDuration(Math.round(stats.avg_latency_ms))}，响应正常。`
                : `平均延迟 ${formatDuration(Math.round(stats.avg_latency_ms))}，建议查看日志排查慢请求。`}
            </p>
          </div>
        </div>
      </section>

      {/* 使用帮助弹窗 */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="relative my-auto w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowHelp(false)}
              className="absolute right-5 top-5 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-2.5">
                <HelpCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  快速上手指南
                </h2>
                <p className="text-xs text-slate-500">
                  几步完成本地 LLM 网关配置
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3.5">
              {[
                {
                  num: "1",
                  required: true,
                  title: "添加上游渠道",
                  desc: "进入「渠道管理」页面，点击「新建渠道」，填写名称、Base URL、API Key 和支持的模型，保存即可。",
                  route: "/channels",
                  routeLabel: "前往渠道管理",
                },
                {
                  num: "2",
                  required: true,
                  title: "创建本地密钥",
                  desc: "进入「API 密钥」页面，点击「新建密钥」生成 `sk-damaoapi-*` 格式的本地访问令牌，用于下游客户端调用。",
                  route: "/api-keys",
                  routeLabel: "前往 API 密钥",
                },
                {
                  num: "3",
                  required: true,
                  title: "查看接入示例",
                  desc: "进入「接入示例」页面，复制 cURL / Python / Node.js 代码，将 `base_url` 指向 `http://127.0.0.1:8777/v1`，使用本地密钥即可调用。",
                  route: "/usage",
                  routeLabel: "前往接入示例",
                },
                {
                  num: "4",
                  required: false,
                  title: "配置服务与重试",
                  desc: "在「设置 → 服务配置」中调整监听地址与端口；在「重试策略」中开启失败自动重试，提升服务稳定性。",
                  route: "/settings",
                  routeLabel: "前往设置",
                },
                {
                  num: "5",
                  required: false,
                  title: "开启安全审计",
                  desc: "在「设置 → 安全审计」中启用请求风险检测，自动识别凭证泄露、敏感路径、工具外联与 Unicode 隐写。",
                  route: "/settings",
                  routeLabel: "前往安全设置",
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${step.required ? "bg-blue-600" : "bg-slate-400"}`}
                    >
                      {step.num}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {step.title}
                        </span>
                        {step.required ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            <Check className="h-2.5 w-2.5" />
                            必选
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            可选
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-5 text-slate-500">
                        {step.desc}
                      </p>
                      <button
                        onClick={() => {
                          navigate(step.route);
                          setShowHelp(false);
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {step.routeLabel}
                        <span aria-hidden>→</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-start gap-2.5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <div className="text-sm font-medium text-emerald-900">
                    调用后可查看审计日志
                  </div>
                  <p className="mt-1 text-xs leading-5 text-emerald-700">
                    发起请求后，进入「审计日志」页面查看每次调用的状态码、Token
                    消耗、工具调用、安全风险等级与上游路由详情。
                  </p>
                  <button
                    onClick={() => {
                      navigate("/logs");
                      setShowHelp(false);
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    前往审计日志<span aria-hidden>→</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
              <span className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">1、2、3</span>{" "}
                为必选步骤 ·{" "}
                <span className="font-semibold text-slate-700">4、5</span>{" "}
                为可选增强
              </span>
              <button
                onClick={() => setShowHelp(false)}
                className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 模型分布表格
// ════════════════════════════════════════════════════════════

const MODEL_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-fuchsia-500",
  "bg-orange-500",
];

function ModelDistributionTable({ data }: { data: ModelStats[] }) {
  const maxTokens = Math.max(...data.map((d) => d.total_tokens), 1);

  return (
    <section className="surface rounded-[20px] p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">模型分布</h2>
          <p className="mt-1 text-sm text-slate-500">
            各模型调用次数、Token 消耗、缓存命中与成功率
          </p>
        </div>
        <Layers className="h-5 w-5 text-slate-400" />
      </div>

      {data.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400">
          暂无调用记录
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4 font-medium">模型</th>
                <th className="pb-2 pr-4 font-medium text-right">请求数</th>
                <th className="pb-2 pr-4 font-medium text-right">输入 Token</th>
                <th className="pb-2 pr-4 font-medium text-right">输出 Token</th>
                <th className="pb-2 pr-4 font-medium text-right">缓存命中</th>
                <th className="pb-2 pr-4 font-medium text-right">总 Token</th>
                <th className="pb-2 pr-4 font-medium">Token 占比</th>
                <th className="pb-2 pr-4 font-medium text-right">成功率</th>
                <th className="pb-2 font-medium text-right">平均延迟</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={row.model}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${MODEL_COLORS[i % MODEL_COLORS.length]}`}
                      />
                      <span className="font-medium text-slate-900">
                        {row.model}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-slate-600">
                    {formatNumber(row.request_count)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">
                    {formatNumber(row.input_tokens)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">
                    {formatNumber(row.output_tokens)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {(row.cached_tokens ?? 0) > 0 ? (
                      <div>
                        <div className="font-medium text-emerald-600">
                          {formatNumber(row.cached_tokens)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {row.input_tokens > 0
                            ? `${((row.cached_tokens / row.input_tokens) * 100).toFixed(1)}%`
                            : "-"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-slate-900">
                    {formatNumber(row.total_tokens)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className={`h-1.5 rounded-full ${MODEL_COLORS[i % MODEL_COLORS.length]}`}
                        style={{
                          width: `${(row.total_tokens / maxTokens) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    <span
                      className={
                        row.success_rate >= 0.95
                          ? "text-emerald-600"
                          : row.success_rate >= 0.8
                            ? "text-amber-600"
                            : "text-rose-600"
                      }
                    >
                      {(row.success_rate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-500">
                    {formatDuration(Math.round(row.avg_latency_ms))}
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

// ════════════════════════════════════════════════════════════
// Token 使用趋势图（ECharts：输入 / 输出 / 缓存同时展示）
// ════════════════════════════════════════════════════════════

const TREND_LINE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#ef4444", // rose
  "#06b6d4", // cyan
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#d946ef", // fuchsia
  "#f97316", // orange
];

const SERIES_SEP = "\u0001";
type TrendMetric = "input" | "output" | "cached";

function seriesName(model: string, metric: TrendMetric) {
  return `${model}${SERIES_SEP}${metric}`;
}

function parseSeriesName(name: string): { model: string; metric: TrendMetric } {
  const index = name.lastIndexOf(SERIES_SEP);
  if (index < 0) return { model: name, metric: "input" };
  const metric = name.slice(index + SERIES_SEP.length);
  if (metric === "output" || metric === "cached" || metric === "input") {
    return { model: name.slice(0, index), metric };
  }
  return { model: name, metric: "input" };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function TokenTrendChart({
  data,
  hours,
  onHoursChange,
}: {
  data: TokenTrendPoint[];
  hours: 24 | 168 | 720;
  onHoursChange: (h: 24 | 168 | 720) => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.EChartsType | null>(null);
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

  const { hoursList, modelList, seriesByModel } = useMemo(() => {
    const modelSet = new Set<string>();
    data.forEach((d) => modelSet.add(d.model));
    const modelsArr = Array.from(modelSet);

    const map = new Map<string, Map<string, TokenTrendPoint>>();
    data.forEach((d) => {
      if (!map.has(d.hour)) map.set(d.hour, new Map());
      map.get(d.hour)!.set(d.model, d);
    });

    const bucketMs =
      hours === 24 ? 3600_000 : hours === 168 ? 3 * 3600_000 : 86_400_000;
    const totalBuckets = hours === 24 ? 24 : hours === 168 ? 56 : 30;

    const now = new Date();
    const start = new Date(now);
    if (bucketMs >= 86_400_000) {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setMinutes(0, 0, 0);
      start.setMinutes(
        start.getMinutes() - (start.getMinutes() % (bucketMs / 60_000)),
      );
    }
    start.setTime(start.getTime() - bucketMs * (totalBuckets - 1));

    const hoursArr: string[] = [];
    for (let i = 0; i < totalBuckets; i++) {
      const d = new Date(start.getTime() + i * bucketMs);
      hoursArr.push(d.toISOString());
    }

    const series = modelsArr.map((m) => ({
      model: m,
      points: hoursArr.map((h) => {
        const bucketStart = new Date(h);
        const bucketEnd = new Date(bucketStart.getTime() + bucketMs);
        let input = 0,
          output = 0,
          cached = 0,
          total = 0,
          requests = 0;
        for (const [rawHour, modelMap] of map) {
          const rawDate = new Date(rawHour);
          if (rawDate >= bucketStart && rawDate < bucketEnd) {
            const p = modelMap.get(m);
            if (p) {
              input += p.input_tokens;
              output += p.output_tokens;
              cached += p.cached_tokens ?? 0;
              total += p.total_tokens;
              requests += p.request_count;
            }
          }
        }
        return { hour: h, input, output, cached, total, requests };
      }),
    }));

    return { hoursList: hoursArr, modelList: modelsArr, seriesByModel: series };
  }, [data, hours]);

  const toggleModel = (model: string) => {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const formatHourLabel = (h: string) => {
    const d = new Date(h);
    if (hours === 24)
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
    if (hours === 168)
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatHourShort = (h: string) => {
    const d = new Date(h);
    if (hours === 24) return `${String(d.getHours()).padStart(2, "0")}:00`;
    if (hours === 168)
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}h`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartInstance.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;
    if (data.length === 0 || modelList.length === 0) {
      chart.clear();
      return;
    }

    const labelInterval = Math.max(1, Math.floor(hoursList.length / 10));
    const visible = seriesByModel.filter((s) => !hiddenModels.has(s.model));
    const series = visible.flatMap((s) => {
      const color =
        TREND_LINE_COLORS[
          Math.max(0, modelList.indexOf(s.model)) % TREND_LINE_COLORS.length
        ];
      const metrics: {
        metric: TrendMetric;
        values: number[];
        lineType: "solid" | "dashed" | "dotted";
      }[] = [
        {
          metric: "input",
          values: s.points.map((p) => p.input),
          lineType: "solid",
        },
        {
          metric: "output",
          values: s.points.map((p) => p.output),
          lineType: "dashed",
        },
        {
          metric: "cached",
          values: s.points.map((p) => p.cached),
          lineType: "dotted",
        },
      ];
      return metrics.map((item) => ({
        name: seriesName(s.model, item.metric),
        type: "line" as const,
        smooth: true,
        showSymbol: false,
        symbol: "circle",
        symbolSize: 7,
        color,
        lineStyle: {
          width: 2,
          type: item.lineType,
          color,
        },
        itemStyle: { color },
        ...(item.metric === "input"
          ? { areaStyle: { color, opacity: 0.08 } }
          : {}),
        data: item.values,
      }));
    });

    chart.setOption(
      {
        animationDuration: 300,
        grid: { left: 56, right: 16, top: 16, bottom: 28 },
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(255,255,255,0.96)",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: 12,
          textStyle: { color: "#0f172a", fontSize: 12 },
          extraCssText:
            "border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,0.12);",
          axisPointer: {
            type: "line",
            lineStyle: { color: "#cbd5e1", type: "dashed" },
          },
          formatter: (raw: unknown) => {
            const items = (Array.isArray(raw) ? raw : [raw]) as {
              seriesName?: string;
              dataIndex?: number;
              value?: unknown;
              color?: string;
            }[];
            const dataIndex = items[0]?.dataIndex ?? 0;
            const title = escapeHtml(
              formatHourLabel(hoursList[dataIndex] ?? ""),
            );
            const byModel = new Map<
              string,
              { input: number; output: number; cached: number; color: string }
            >();
            for (const item of items) {
              const parsed = parseSeriesName(item.seriesName ?? "");
              const value = typeof item.value === "number" ? item.value : 0;
              const row = byModel.get(parsed.model) ?? {
                input: 0,
                output: 0,
                cached: 0,
                color: typeof item.color === "string" ? item.color : "#64748b",
              };
              row[parsed.metric] = value;
              byModel.set(parsed.model, row);
            }
            const rows = [...byModel.entries()].filter(
              ([, row]) => row.input > 0 || row.output > 0 || row.cached > 0,
            );
            if (rows.length === 0) {
              return `<div style="font-weight:600">${title}</div><div style="margin-top:6px;color:#94a3b8">无数据</div>`;
            }
            const totals = rows.reduce(
              (sum, [, row]) => ({
                input: sum.input + row.input,
                output: sum.output + row.output,
                cached: sum.cached + row.cached,
              }),
              { input: 0, output: 0, cached: 0 },
            );
            const body = rows
              .map(([model, row]) => {
                return `<div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                  <span style="width:8px;height:8px;border-radius:999px;background:${row.color};flex:none"></span>
                  <span style="flex:1;color:#475569">${escapeHtml(model)}</span>
                  <span style="width:64px;text-align:right;font-variant-numeric:tabular-nums">${formatNumber(row.input)}</span>
                  <span style="width:64px;text-align:right;font-variant-numeric:tabular-nums">${formatNumber(row.output)}</span>
                  <span style="width:64px;text-align:right;font-variant-numeric:tabular-nums">${formatNumber(row.cached)}</span>
                </div>`;
              })
              .join("");
            return `<div style="min-width:280px">
              <div style="font-weight:600">${title}</div>
              <div style="display:flex;gap:8px;margin-top:8px;color:#94a3b8;font-size:10px">
                <span style="width:8px"></span>
                <span style="flex:1">模型</span>
                <span style="width:64px;text-align:right">输入</span>
                <span style="width:64px;text-align:right">输出</span>
                <span style="width:64px;text-align:right">缓存</span>
              </div>
              ${body}
              <div style="display:flex;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;font-weight:600">
                <span style="width:8px"></span>
                <span style="flex:1;color:#94a3b8;font-weight:400">合计</span>
                <span style="width:64px;text-align:right;font-variant-numeric:tabular-nums">${formatNumber(totals.input)}</span>
                <span style="width:64px;text-align:right;font-variant-numeric:tabular-nums">${formatNumber(totals.output)}</span>
                <span style="width:64px;text-align:right;font-variant-numeric:tabular-nums">${formatNumber(totals.cached)}</span>
              </div>
            </div>`;
          },
        },
        xAxis: {
          type: "category",
          data: hoursList.map(formatHourShort),
          boundaryGap: false,
          axisLine: { lineStyle: { color: "#e2e8f0" } },
          axisTick: { show: false },
          axisLabel: {
            color: "#94a3b8",
            fontSize: 10,
            interval: labelInterval - 1,
          },
        },
        yAxis: {
          type: "value",
          min: 0,
          axisLabel: {
            color: "#94a3b8",
            fontSize: 10,
            formatter: (value: number) => formatNumber(value),
          },
          splitLine: { lineStyle: { color: "#f1f5f9" } },
        },
        series,
      },
      true,
    );
  }, [data.length, hours, hoursList, modelList, seriesByModel, hiddenModels]);

  return (
    <section className="surface rounded-[20px] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Token 使用趋势
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {hours === 24
              ? "最近 24 小时"
              : hours === 168
                ? "最近 7 天"
                : "最近 30 天"}{" "}
            · {hours === 24 ? "按小时" : hours === 168 ? "按 3 小时" : "按天"}
            粒度 · 实线输入 · 虚线输出 · 点线缓存
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(
            [
              { v: 24, label: "日" },
              { v: 168, label: "周" },
              { v: 720, label: "月" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              onClick={() => onHoursChange(opt.v)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                hours === opt.v
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {modelList.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {modelList.map((m, i) => {
            const hidden = hiddenModels.has(m);
            return (
              <button
                key={m}
                onClick={() => toggleModel(m)}
                title={hidden ? "点击显示该模型" : "点击隐藏该模型"}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-all hover:bg-slate-100 ${
                  hidden ? "opacity-40" : ""
                }`}
              >
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{
                    backgroundColor:
                      TREND_LINE_COLORS[i % TREND_LINE_COLORS.length],
                  }}
                />
                <span
                  className={`text-xs ${hidden ? "text-slate-400 line-through" : "text-slate-600"}`}
                >
                  {m}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative mt-4 h-[280px] w-full">
        <div ref={chartRef} className="h-full w-full" />
        {data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            暂无趋势数据
          </div>
        )}
      </div>
    </section>
  );
}

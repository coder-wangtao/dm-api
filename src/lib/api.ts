import { invoke } from "./runtime";
import type {
  Channel,
  CreateChannelInput,
  UpdateChannelInput,
  TestChannelResult,
  ChannelKey,
  ApiKey,
  CreateApiKeyInput,
  ApiKeyStats,
  RequestLog,
  LogStats,
  SecurityFinding,
  DashboardStats,
  ModelStats,
  TokenTrendPoint,
  Settings,
  ServerStatus,
  BuiltinRule,
  CustomRule,
  CreateCustomRuleInput,
  UpdateBuiltinRuleInput,
  ChannelProtocolPresetGroup,
  DraftChannelTestInput,
  DraftChannelTestResult,
  UpstreamModelsResult,
  AuthAccount,
  AuthLoginSessionStatus,
  AuthLoginStart,
  AuthMutationResult,
  AuthLogoutResult,
  AuthExportResult,
  AuthQuotaStatus,
  AuthUpdateInput,
  AuthProviderInfo,
  AuthLoginMethod,
} from "../types";

/**
 * 保存前草稿连通性测试（T07）。后端 `test_channel_draft` 命令已接入。
 *
 * 不落库：不创建/更新渠道、不计数配额、不写生产 request log；仅执行每个已选
 * 端点的最小非流推理探测（可能产生极少上游费用）并返回逐端点结果 + 草稿指纹。
 */
export async function testChannelDraft(
  input: DraftChannelTestInput,
): Promise<DraftChannelTestResult> {
  return invoke<DraftChannelTestResult>("test_channel_draft", { input });
}

// Channel stats
export interface ChannelStats {
  channel_id: string;
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_latency_ms: number;
  last_call_at: string | null;
}

// Channel commands
export const channelApi = {
  getAll: () => invoke<Channel[]>("get_channels"),
  get: (id: string) => invoke<Channel>("get_channel", { id }),
  getApiKey: (id: string) => invoke<string>("get_channel_api_key", { id }),
  create: (input: CreateChannelInput) =>
    invoke<Channel>("create_channel", { input }),
  update: (input: UpdateChannelInput) =>
    invoke<Channel>("update_channel", { input }),
  toggle: (id: string, status: number) =>
    invoke<void>("toggle_channel", { id, status }),
  delete: (id: string) => invoke<void>("delete_channel", { id }),
  test: (id: string) => invoke<TestChannelResult>("test_channel", { id }),
  getStats: () => invoke<ChannelStats[]>("get_channel_stats"),
  reorder: (orderedIds: string[]) =>
    invoke<void>("reorder_channels", { orderedIds }),
  /** 获取全部协议及其提供商模板（只读；`presets[0]` 恒为 custom option）。 */
  getPresets: () => invoke<ChannelProtocolPresetGroup[]>("get_channel_presets"),
  /** 保存前草稿连通性测试（T07，真实后端命令，不落库）。 */
  testDraft: (input: DraftChannelTestInput) => testChannelDraft(input),
  /** 拉取上游模型列表（T14）。绝不写库：不覆盖已有模型列表，返回结果供弹窗勾选合并。 */
  syncUpstreamModels: (input: DraftChannelTestInput) =>
    invoke<UpstreamModelsResult>("sync_upstream_models", { input }),
  /** 获取渠道的额外 API Keys（masked）。 */
  getExtraKeys: (id: string) =>
    invoke<ChannelKey[]>("get_channel_extra_keys", { id }),
  /** 获取单个额外 Key 的完整值（unmasked）。 */
  getExtraKeyValue: (keyId: string) =>
    invoke<string>("get_channel_extra_key_value", { keyId }),
  /** 启用/禁用一个额外 Key。 */
  toggleExtraKey: (keyId: string, status: number) =>
    invoke<void>("toggle_channel_extra_key", { keyId, status }),
  /** 删除一个额外 Key。 */
  deleteExtraKey: (keyId: string) =>
    invoke<void>("delete_channel_extra_key", { keyId }),
};

// API Key commands
export const apiKeyApi = {
  getAll: () => invoke<ApiKey[]>("get_api_keys"),
  // FIX-13：列表只回掩码，复制/示例代码等显式动作经此按需取全量。
  getFull: (id: string) => invoke<string>("get_api_key_full", { id }),
  create: (input: CreateApiKeyInput) =>
    invoke<ApiKey>("create_api_key", { input }),
  update: (input: {
    id: string;
    name?: string;
    quota_limit?: number;
    status?: number;
    allowed_models?: string[];
    allowed_channels?: string[];
    denied_models?: string[];
    denied_channels?: string[];
  }) => invoke<void>("update_api_key", { input }),
  delete: (id: string) => invoke<void>("delete_api_key", { id }),
  getStats: () => invoke<ApiKeyStats[]>("get_api_key_stats"),
};

export interface GetLogsInput {
  limit?: number;
  offset?: number;
  keyword?: string;
  api_key_name?: string;
  channel_name?: string;
  model?: string;
  date_from?: string;
  date_to?: string;
  trace_id?: string;
  upstream_type?: "channel" | "auth_account";
}

// Log commands
export const logApi = {
  /** 列表接口只返回摘要；正文由 get 按日志展开时懒加载。 */
  getAll: (input?: GetLogsInput) =>
    invoke<RequestLog[]>("get_logs", { input: input || {} }),
  /** 与 getAll 相同过滤条件下的日志总数，用于分页页码展示。 */
  count: (input?: GetLogsInput) =>
    invoke<number>("count_logs", { input: input || {} }),
  get: (id: string) => invoke<RequestLog>("get_log", { id }),
  getSecurityFindings: (logId: string) =>
    invoke<SecurityFinding[]>("get_log_security_findings", { logId }),
  /** 流式请求的已生成内容段（detailed 策略下落库；按 seq 升序拼接即完整内容）。 */
  getStreamSegments: (logId: string) =>
    invoke<Array<{ seq: number; content: string }>>("get_log_stream_segments", {
      logId,
    }),
  getStats: (days?: number) => invoke<LogStats[]>("get_log_stats", { days }),
  delete: (id: string) => invoke<void>("delete_log", { id }),
  deleteBefore: (beforeDate: string) =>
    invoke<number>("delete_logs_before", { beforeDate }),
  deleteAll: () => invoke<number>("delete_all_logs"),
};

// Auth account commands. All result contracts are safe summaries; credential
// payloads remain inside the native command layer.
export const authApi = {
  accountsList: () => invoke<AuthAccount[]>("auth_accounts_list"),
  providersList: () => invoke<AuthProviderInfo[]>("auth_providers_list"),
  /**
   * @deprecated Synchronous login for Codex compatibility only.  Kimi (and any
   * DeviceCode provider) must use `loginStart`; the backend refuses `login`
   * for them before any network request.
   */
  login: (provider: string) =>
    invoke<AuthMutationResult>("auth_login", { provider }),
  loginStart: (
    provider: string,
    replaceAccountId?: string,
    loginMethod?: AuthLoginMethod,
  ) =>
    invoke<AuthLoginStart>("auth_login_start", {
      provider,
      replaceAccountId: replaceAccountId ?? null,
      loginMethod: loginMethod ?? null,
    }),
  loginStatus: (sessionId: string) =>
    invoke<AuthLoginSessionStatus>("auth_login_status", { sessionId }),
  loginCancel: (sessionId: string) =>
    invoke<AuthLoginSessionStatus>("auth_login_cancel", { sessionId }),
  /** format: "codex"（默认）| "sub2api" | "cpa"，见 AuthFileFormat。 */
  loginImport: (provider?: string, path?: string, format?: string) =>
    invoke<AuthMutationResult>("auth_login_import", { provider, path, format }),
  /** Web 版：直接上传 auth 文件内容导入（无服务器文件路径）。 */
  loginImportContent: (provider: string, content: string, format?: string) =>
    invoke<AuthMutationResult>("auth_login_import_content", {
      provider,
      content,
      format,
    }),
  defaultImportPath: (provider?: string) =>
    invoke<string>("auth_default_import_path", { provider: provider ?? null }),
  logout: (id: string) => invoke<AuthLogoutResult>("auth_logout", { id }),
  refreshToken: (id: string) =>
    invoke<AuthAccount>("auth_refresh_token", { id }),
  refreshQuota: (id: string) =>
    invoke<AuthAccount>("auth_refresh_quota", { id }),
  syncModels: (id: string) => invoke<AuthAccount>("auth_sync_models", { id }),
  exportJson: (id: string, path: string) =>
    invoke<AuthExportResult>("auth_export_json", { id, path }),
  /** Web 版：导出 auth.json 内容，由浏览器触发下载。 */
  exportJsonContent: (id: string) =>
    invoke<string>("auth_export_json_content", { id }),
  toggle: (id: string, disabled: boolean) =>
    invoke<AuthAccount>("auth_toggle", { id, disabled }),
  quotaStatus: (id: string) =>
    invoke<AuthQuotaStatus>("auth_quota_status", { id }),
  update: (input: AuthUpdateInput) =>
    invoke<AuthAccount>("auth_update", { input }),
  /** 手动拖拽排序：按传入顺序重写 sort_order。 */
  reorder: (orderedIds: string[]) =>
    invoke<void>("auth_reorder_accounts", { orderedIds }),
};

// Stats commands
export const statsApi = {
  getDashboard: () => invoke<DashboardStats>("get_dashboard_stats"),
  getModelStats: () => invoke<ModelStats[]>("get_model_stats"),
  getTokenTrend: (hours?: number) =>
    invoke<TokenTrendPoint[]>("get_token_trend", { hours: hours ?? 24 }),
};

// Settings commands
export interface FeatureFlagsDto {
  new_routeplan: boolean;
  cross_protocol_codec: boolean;
  native_responses: boolean;
  ollama_native: boolean;
  prefer_auth_accounts: boolean;
  prefer_same_protocol: boolean;
}

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  save: (settings: Settings) => invoke<void>("save_settings", { settings }),
  applyTheme: (theme: string) => invoke<void>("apply_theme", { theme }),
  setAutoStart: (enabled: boolean) =>
    invoke<void>("set_auto_start", { enabled }),
  getFeatureFlags: () => invoke<FeatureFlagsDto>("get_feature_flags"),
};

// 出站代理（VPN 固定转发端口）自动探测
export interface ProxyCandidate {
  url: string;
  source: "env" | "scan" | string;
  label: string;
  latency_ms: number | null;
}

export const networkApi = {
  detectLocalProxies: () => invoke<ProxyCandidate[]>("detect_local_proxies"),
};

// Server commands
export const serverApi = {
  getStatus: () => invoke<ServerStatus>("get_server_status"),
  restart: () => invoke<void>("restart_server"),
};

// Import / Export
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ScannedSource {
  source: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  api_format: string;
  raw: Record<string, unknown>;
}

export interface ScanResult {
  sources: ScannedSource[];
}

export const importExportApi = {
  exportChannels: () => invoke<string>("export_channels"),
  importDamaocodeBackup: (content: string) =>
    invoke<ImportResult>("import_damaocode_backup", { content }),
  importDamaoapiExport: (content: string) =>
    invoke<ImportResult>("import_damaoapi_export", { content }),
  scanLocalAiConfigs: () => invoke<ScanResult>("scan_local_ai_configs"),
  importScannedSources: (sources: ScannedSource[]) =>
    invoke<ImportResult>("import_scanned_sources", { sources }),
  pickImportFile: () => invoke<string | null>("pick_import_file"),
  saveExportFile: (content: string, defaultName: string) =>
    invoke<boolean>("save_export_file", { content, defaultName }),
};

// Security rules
export const securityApi = {
  getBuiltinRules: () => invoke<BuiltinRule[]>("get_builtin_security_rules"),
  updateBuiltinRule: (id: string, input: UpdateBuiltinRuleInput) =>
    invoke<void>("update_builtin_security_rule", { id, input }),
  deleteBuiltinRule: (id: string) =>
    invoke<void>("delete_builtin_security_rule", { id }),
  resetBuiltinRules: () =>
    invoke<BuiltinRule[]>("reset_builtin_security_rules"),
  getCustomRules: () => invoke<CustomRule[]>("get_custom_security_rules"),
  createCustomRule: (input: CreateCustomRuleInput) =>
    invoke<CustomRule>("create_custom_security_rule", { input }),
  toggleCustomRule: (id: string, enabled: boolean) =>
    invoke<void>("toggle_custom_security_rule", { id, enabled }),
  deleteCustomRule: (id: string) =>
    invoke<void>("delete_custom_security_rule", { id }),
};

// ── App Config (应用配置) ──
export interface AppInfo {
  name: string;
  label: string;
  icon: string;
  description: string;
  config_path: string;
  config_format: string;
  available: boolean;
  applied: boolean;
  download_url: string;
}

export interface ApplyResult {
  success: boolean;
  message: string;
  /** Codex 专用：切回后检测到 auth.json 处于 API Key 模式 */
  authWarning?: string | null;
}

export interface ConfigContent {
  exists: boolean;
  content: string;
  error: string | null;
}

export const appConfigApi = {
  getApps: () => invoke<AppInfo[]>("get_app_configs"),
  apply: (appName: string, apiKey: string, model: string) =>
    invoke<ApplyResult>("apply_app_config", { appName, apiKey, model }),
  clear: (appName: string) =>
    invoke<ApplyResult>("clear_app_config", { appName }),
  resetCodexAuth: () => invoke<ApplyResult>("reset_codex_auth"),
  getContent: (appName: string) =>
    invoke<ConfigContent>("get_app_config_content", { appName }),
  openFolder: (appName: string) =>
    invoke<void>("open_config_folder", { appName }),
};

// 语义缓存管理命令（C-02）
export const semanticCacheApi = {
  clear: (model?: string) =>
    invoke<number>("clear_semantic_cache", { model: model ?? null }),
};

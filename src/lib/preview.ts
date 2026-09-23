import { DEFAULT_SETTINGS } from "./constants";
import { nowIso, todayKey } from "./format";
import type {
  ApiKey,
  Channel,
  CreateApiKeyInput,
  CreateChannelInput,
  DashboardStats,
  GetLogsInput,
  LogStats,
  RequestLog,
  ServerStatus,
  Settings,
  TestChannelResult,
  UpdateApiKeyInput,
  UpdateChannelInput,
} from "../types";

const STORAGE_KEY = "damao-api-preview";

interface PreviewStore {
  version: 1;
  channels: Channel[];
  apiKeys: ApiKey[];
  logs: RequestLog[];
  settings: Settings;
  serverRunning: boolean;
}

function load(): PreviewStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PreviewStore;
      if (parsed.version === 1 && Array.isArray(parsed.channels)) return parsed;
    }
  } catch {
    // 预览数据损坏时重新生成示例。
  }
  const initial = seed();
  save(initial);
  return initial;
}

function save(store: PreviewStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function update(mutator: (store: PreviewStore) => void): PreviewStore {
  const store = load();
  mutator(store);
  save(store);
  return store;
}

function seed(): PreviewStore {
  const now = nowIso();
  return {
    version: 1,
    serverRunning: true,
    settings: { ...DEFAULT_SETTINGS },
    channels: [
      {
        id: "demo-openai",
        name: "示例 · OpenAI",
        type: "openai",
        base_url: "https://api.openai.com/v1",
        api_key: "sk-demo-openai",
        models: ["gpt-4o-mini", "gpt-4o"],
        status: 1,
        priority: 10,
        weight: 2,
        config: {},
        model_mapping: {},
        created_at: now,
        updated_at: now,
        last_test_at: now,
        last_test_ok: 1,
      },
      {
        id: "demo-deepseek",
        name: "示例 · DeepSeek",
        type: "deepseek",
        base_url: "https://api.deepseek.com/v1",
        api_key: "sk-demo-deepseek",
        models: ["deepseek-chat"],
        status: 1,
        priority: 5,
        weight: 1,
        config: {},
        model_mapping: {},
        created_at: now,
        updated_at: now,
        last_test_at: null,
        last_test_ok: null,
      },
    ],
    apiKeys: [
      {
        id: "demo-key",
        name: "示例 · 本地调试",
        key: "sk-waliapi-demo0123456789abcdef",
        status: 1,
        allowed_models: [],
        allowed_channels: [],
        quota_limit: 100000,
        quota_used: 2380,
        expires_at: null,
        created_at: now,
        updated_at: now,
      },
    ],
    logs: [
      log("1", "示例 · 本地调试", "示例 · OpenAI", "gpt-4o-mini", 200, 820, 180),
      log("2", "示例 · 本地调试", "示例 · DeepSeek", "deepseek-chat", 200, 1460, 260),
      log("3", "示例 · 本地调试", "示例 · OpenAI", "gpt-4o", 502, 0, 940, "上游暂时不可用"),
    ],
  };
}

function log(
  seq: string,
  apiKeyName: string,
  channelName: string,
  model: string,
  status: number,
  tokens: number,
  duration: number,
  error: string | null = null,
): RequestLog {
  return {
    id: `demo-log-${seq}`,
    seq: Number(seq),
    api_key_name: apiKeyName,
    channel_name: channelName,
    model,
    upstream_model: model,
    mode: "chat",
    status_code: status,
    prompt_tokens: Math.round(tokens * 0.7),
    completion_tokens: Math.round(tokens * 0.3),
    total_tokens: tokens,
    duration_ms: duration,
    error_message: error,
    is_stream: false,
    is_retry: false,
    created_at: nowIso(),
    request_body: null,
    risk_level: "none",
    risk_score: 0,
    risk_summary: null,
    security_action: "allow",
    sanitized: false,
    blocked_reason: null,
  };
}

function newApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  return `sk-waliapi-${hex}`;
}

export const preview = {
  getChannels: async () => load().channels,
  createChannel: async (input: CreateChannelInput) => {
    const now = nowIso();
    const channel: Channel = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      type: input.type,
      base_url: input.base_url.trim(),
      api_key: input.api_key.trim(),
      models: input.models,
      status: input.status ?? 1,
      priority: input.priority,
      weight: Math.max(1, input.weight),
      config: input.config ?? {},
      model_mapping: input.model_mapping ?? {},
      created_at: now,
      updated_at: now,
      last_test_at: null,
      last_test_ok: null,
    };
    update((store) => store.channels.unshift(channel));
    return channel;
  },
  updateChannel: async (input: UpdateChannelInput) => {
    const store = update((current) => {
      current.channels = current.channels.map((channel) => {
        if (channel.id !== input.id) return channel;
        return {
          ...channel,
          name: input.name.trim(),
          type: input.type,
          base_url: input.base_url.trim(),
          api_key: input.api_key.trim() || channel.api_key,
          models: input.models,
          status: input.status ?? channel.status,
          priority: input.priority,
          weight: Math.max(1, input.weight),
          updated_at: nowIso(),
        };
      });
    });
    const updated = store.channels.find((channel) => channel.id === input.id);
    if (!updated) throw new Error("渠道不存在");
    return updated;
  },
  toggleChannel: async (id: string, status: number) => {
    update((store) => {
      store.channels = store.channels.map((channel) =>
        channel.id === id ? { ...channel, status, updated_at: nowIso() } : channel,
      );
    });
  },
  deleteChannel: async (id: string) => {
    update((store) => {
      store.channels = store.channels.filter((channel) => channel.id !== id);
    });
  },
  testChannel: async (id: string): Promise<TestChannelResult> => {
    const channel = load().channels.find((item) => item.id === id);
    if (!channel) throw new Error("渠道不存在");
    const ok = Boolean(channel.base_url.trim() && channel.api_key.trim());
    const message = ok
      ? "预览模式未连接上游，已确认地址和密钥已填写"
      : "请填写 Base URL 和 API Key";
    update((store) => {
      store.channels = store.channels.map((item) =>
        item.id === id
          ? { ...item, last_test_at: nowIso(), last_test_ok: ok ? 1 : 0 }
          : item,
      );
    });
    return { ok, latency_ms: ok ? 12 : 0, message };
  },
  getApiKeys: async () => load().apiKeys,
  createApiKey: async (input: CreateApiKeyInput) => {
    const now = nowIso();
    const key: ApiKey = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      key: newApiKey(),
      status: 1,
      allowed_models: input.allowed_models ?? [],
      allowed_channels: input.allowed_channels ?? [],
      quota_limit: Math.max(0, input.quota_limit),
      quota_used: 0,
      expires_at: input.expires_at ?? null,
      created_at: now,
      updated_at: now,
    };
    update((store) => store.apiKeys.unshift(key));
    return key;
  },
  updateApiKey: async (input: UpdateApiKeyInput) => {
    const store = update((current) => {
      current.apiKeys = current.apiKeys.map((key) => {
        if (key.id !== input.id) return key;
        return {
          ...key,
          name: input.name?.trim() || key.name,
          status: input.status ?? key.status,
          quota_limit: input.quota_limit ?? key.quota_limit,
          allowed_models: input.allowed_models ?? key.allowed_models,
          allowed_channels: input.allowed_channels ?? key.allowed_channels,
          updated_at: nowIso(),
        };
      });
    });
    if (!store.apiKeys.some((key) => key.id === input.id)) throw new Error("密钥不存在");
  },
  deleteApiKey: async (id: string) => {
    update((store) => {
      store.apiKeys = store.apiKeys.filter((key) => key.id !== id);
    });
  },
  getLogs: async (input?: GetLogsInput) => {
    const keyword = input?.keyword?.trim().toLowerCase() ?? "";
    const channel = input?.channel_name?.trim() ?? "";
    const model = input?.model?.trim() ?? "";
    return load().logs.filter((item) => {
      const haystack = [item.channel_name, item.model, item.api_key_name, item.error_message]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (channel && item.channel_name !== channel) return false;
      if (model && item.model !== model) return false;
      return true;
    });
  },
  deleteLog: async (id: string) => {
    update((store) => {
      store.logs = store.logs.filter((item) => item.id !== id);
    });
  },
  getLogStats: async (days = 14): Promise<LogStats[]> => {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startKey = start.toISOString().slice(0, 10);
    const grouped = new Map<string, LogStats>();
    for (const item of load().logs) {
      const date = item.created_at.slice(0, 10);
      if (date < startKey && date !== todayKey()) continue;
      const current = grouped.get(date) ?? {
        date,
        requests: 0,
        total_tokens: 0,
        avg_latency_ms: 0,
      };
      current.requests += 1;
      current.total_tokens += item.total_tokens;
      current.avg_latency_ms += item.duration_ms;
      grouped.set(date, current);
    }
    return [...grouped.values()]
      .map((item) => ({
        ...item,
        avg_latency_ms: item.requests ? Math.round(item.avg_latency_ms / item.requests) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  getDashboard: async (): Promise<DashboardStats> => {
    const store = load();
    const today = todayKey();
    const todayLogs = store.logs.filter((item) => item.created_at.startsWith(today));
    const success = todayLogs.filter((item) => item.status_code < 400);
    const avg =
      success.reduce((sum, item) => sum + item.duration_ms, 0) / (success.length || 1);
    return {
      today_requests: todayLogs.length,
      today_total_tokens: todayLogs.reduce((sum, item) => sum + item.total_tokens, 0),
      active_channels: store.channels.filter((item) => item.status === 1).length,
      avg_latency_ms: success.length ? Math.round(avg) : 0,
      total_channels: store.channels.length,
      total_api_keys: store.apiKeys.length,
      total_requests: store.logs.length,
      total_tokens: store.logs.reduce((sum, item) => sum + item.total_tokens, 0),
    };
  },
  getSettings: async () => load().settings,
  saveSettings: async (settings: Settings) => {
    update((store) => {
      store.settings = settings;
    });
  },
  getServerStatus: async (): Promise<ServerStatus> => {
    const store = load();
    return {
      running: store.serverRunning,
      host: store.settings.server_host,
      port: store.settings.server_port,
      address: store.serverRunning
        ? `${store.settings.server_host}:${store.settings.server_port}`
        : "",
    };
  },
  startServer: async () => {
    update((store) => {
      store.serverRunning = true;
    });
    return preview.getServerStatus();
  },
  stopServer: async () => {
    update((store) => {
      store.serverRunning = false;
    });
    return preview.getServerStatus();
  },
  exportData: async () => {
    const store = load();
    return JSON.stringify(
      {
        version: 1,
        channels: store.channels,
        api_keys: store.apiKeys,
        settings: store.settings,
        security_rules: [],
      },
      null,
      2,
    );
  },
  importData: async (payload: string) => {
    const parsed = JSON.parse(payload) as {
      channels?: Channel[];
      api_keys?: ApiKey[];
      settings?: Settings;
    };
    update((store) => {
      if (parsed.channels) store.channels = parsed.channels;
      if (parsed.api_keys) store.apiKeys = parsed.api_keys;
      if (parsed.settings) store.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
    });
  },
};

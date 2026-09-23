import { invoke } from "@tauri-apps/api/core";
import { preview } from "./preview";
import { isTauri } from "./runtime";
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

async function call<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  fallback: () => Promise<T>,
): Promise<T> {
  if (!isTauri()) return fallback();
  return invoke<T>(command, args);
}

export const channelApi = {
  getAll: () => call<Channel[]>("get_channels", undefined, preview.getChannels),
  create: (input: CreateChannelInput) =>
    call<Channel>("create_channel", { input }, () =>
      preview.createChannel(input),
    ),
  update: (input: UpdateChannelInput) =>
    call<Channel>("update_channel", { input }, () =>
      preview.updateChannel(input),
    ),
  toggle: (id: string, status: number) =>
    call<void>("toggle_channel", { id, status }, () =>
      preview.toggleChannel(id, status),
    ),
  delete: (id: string) =>
    call<void>("delete_channel", { id }, () => preview.deleteChannel(id)),
  test: (id: string) =>
    call<TestChannelResult>("test_channel", { id }, () =>
      preview.testChannel(id),
    ),
};

export const apiKeyApi = {
  getAll: () => call<ApiKey[]>("get_api_keys", undefined, preview.getApiKeys),
  create: (input: CreateApiKeyInput) =>
    call<ApiKey>("create_api_key", { input }, () =>
      preview.createApiKey(input),
    ),
  update: (input: UpdateApiKeyInput) =>
    call<void>("update_api_key", { input }, () => preview.updateApiKey(input)),
  delete: (id: string) =>
    call<void>("delete_api_key", { id }, () => preview.deleteApiKey(id)),
};

export const logApi = {
  getAll: (input?: GetLogsInput) =>
    call<RequestLog[]>("get_logs", { input: input ?? {} }, () =>
      preview.getLogs(input),
    ),
  delete: (id: string) =>
    call<void>("delete_log", { id }, () => preview.deleteLog(id)),
  getStats: (days?: number) =>
    call<LogStats[]>("get_log_stats", { days: days ?? null }, () =>
      preview.getLogStats(days),
    ),
};

export const statsApi = {
  getDashboard: () =>
    call<DashboardStats>(
      "get_dashboard_stats",
      undefined,
      preview.getDashboard,
    ),
};

export const settingsApi = {
  get: () => call<Settings>("get_settings", undefined, preview.getSettings),
  save: (settings: Settings) =>
    call<void>("save_settings", { settings }, () =>
      preview.saveSettings(settings),
    ),
  exportData: () => call<string>("export_data", undefined, preview.exportData),
  importData: (payload: string) =>
    call<void>("import_data", { payload }, () => preview.importData(payload)),
};

export const serverApi = {
  getStatus: () =>
    call<ServerStatus>("get_server_status", undefined, preview.getServerStatus),
  start: () =>
    call<ServerStatus>("start_server", undefined, preview.startServer),
  stop: () => call<ServerStatus>("stop_server", undefined, preview.stopServer),
  restart: () =>
    call<ServerStatus>("restart_server", undefined, preview.startServer),
};

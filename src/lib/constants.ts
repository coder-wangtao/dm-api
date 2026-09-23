import type { Settings } from "../types";

export const CHANNEL_TYPES = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: "gpt-4o-mini, gpt-4o",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: "deepseek-chat, deepseek-reasoner",
  },
  {
    id: "claude",
    label: "Claude",
    baseUrl: "https://api.anthropic.com",
    models: "claude-sonnet-4-5, claude-haiku-4-5",
  },
  {
    id: "gemini",
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: "gemini-2.5-flash, gemini-2.5-pro",
  },
  {
    id: "custom",
    label: "自定义",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: "",
  },
] as const;

export function channelLabel(type: string): string {
  return CHANNEL_TYPES.find((item) => item.id === type)?.label ?? type;
}

export const DEFAULT_SETTINGS: Settings = {
  server_port: 8787,
  server_host: "127.0.0.1",
  ui_theme: "dark",
  ui_language: "zh-CN",
  minimize_to_tray: false,
  close_to_tray: false,
  auto_start: false,
  retry_enabled: true,
  retry_times: 2,
  security_enabled: true,
  security_mode: "audit",
  security_scan_unicode: true,
  security_scan_tools: true,
  security_scan_network: true,
  security_scan_response: false,
  security_redact_secrets: true,
  security_block_on_critical: true,
};

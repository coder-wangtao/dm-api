import { NavLink } from "react-router-dom";
import { useEffect } from "react";
import logo from "../../assets/logo.svg";
import { isTauri } from "../../lib/runtime";
import { useServerStatus } from "../../hooks/useServerStatus";

const items = [
  { to: "/", label: "仪表盘", end: true, icon: DashboardIcon },
  { to: "/usage", label: "用量", end: false, icon: UsageIcon },
  { to: "/channels", label: "渠道", end: false, icon: ChannelIcon },
  { to: "/api-keys", label: "密钥", end: false, icon: KeyIcon },
  { to: "/logs", label: "日志", end: false, icon: LogIcon },
  { to: "/settings", label: "设置", end: false, icon: SettingsIcon },
];

export function Sidebar() {
  const status = useServerStatus((state) => state.status);
  const refresh = useServerStatus((state) => state.refresh);
  const preview = !isTauri();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = status?.running ?? false;

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-ink">
      <div className="flex items-center gap-3 px-5 py-6">
        <img src={logo} alt="" className="h-9 w-9" />
        <div>
          <div className="text-sm font-semibold tracking-wide">大猫网关</div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-sidebar-muted">Local LLM</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink"
              }`
            }
          >
            <item.icon />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-white/5 px-3 py-3 text-xs">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${running ? "bg-ok" : "bg-warn"}`} />
          <span>{preview ? "预览模式" : running ? "网关运行中" : "网关已停止"}</span>
        </div>
        <div className="mt-1 pl-4 text-sidebar-muted">
          {status ? `${status.host}:${status.port}` : "正在读取状态"}
        </div>
      </div>
    </aside>
  );
}

function iconProps() {
  return {
    viewBox: "0 0 24 24",
    className: "h-[18px] w-[18px]",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    "aria-hidden": true as const,
  };
}

function DashboardIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function UsageIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-4" />
      <path d="M12 16V8" />
      <path d="M16 16v-6" />
    </svg>
  );
}

function ChannelIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="18" cy="17" r="2" />
      <path d="M8 12h6M16 8.5 8.8 11M16 15.5 8.8 13" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="8" cy="14" r="3.2" />
      <path d="M11 14h9l-2 2M16 14v2" />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M7 3.5h8l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M15 3.5V8h4M9 12h6M9 16h6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" />
    </svg>
  );
}

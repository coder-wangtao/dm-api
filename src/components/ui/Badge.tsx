import type { ReactNode } from "react";

const tones = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  neutral: "bg-sunken text-muted",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

const banners = {
  info: "border-line bg-sunken text-ink",
  ok: "border-ok/30 bg-ok/10 text-ok",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export function Banner({
  tone = "info",
  children,
}: {
  tone?: keyof typeof banners;
  children: ReactNode;
}) {
  return <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${banners[tone]}`}>{children}</div>;
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <p className="text-sm text-muted">{title}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

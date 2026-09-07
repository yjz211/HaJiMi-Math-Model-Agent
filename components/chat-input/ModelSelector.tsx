"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../I18nProvider";
import type { ThinkingLevelOption } from "@/hooks/agent-session/session-lifecycle-reset";

interface ModelSelectorProps {
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  onModelChange?: (provider: string, modelId: string) => void | Promise<void>;
  thinkingLevel?: ThinkingLevelOption;
  onThinkingLevelChange?: (level: ThinkingLevelOption) => void | Promise<void>;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
}

const levels: ThinkingLevelOption[] = ["auto", "off", "minimal", "low", "medium", "high", "xhigh"];

export function ModelSelector({ model, modelList = [], modelNames, onModelChange,
  thinkingLevel = "auto", onThinkingLevelChange, availableThinkingLevels, thinkingLevelMap }: ModelSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ bottom: 0, left: 0 });
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const current = modelList.find(m => m.id === model?.modelId && m.provider === model?.provider);
  const name = current?.name ?? (model ? modelNames?.[`${model.provider}:${model.modelId}`] ?? model.modelId : t("shell.models"));
  const effort = thinkingLevelMap?.[thinkingLevel] ?? t(`hajimi.effort_${thinkingLevel}`);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!button.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const resize = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); window.removeEventListener("resize", resize); };
  }, [open]);

  async function change(work: () => void | Promise<void>) {
    setBusy(true); setError(null);
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return <>
    <button ref={button} type="button" aria-label={t("hajimi.modelAndEffort")} aria-expanded={open}
      onClick={() => { const rect = button.current!.getBoundingClientRect(); setPosition({ bottom: window.innerHeight - rect.top + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)) }); setOpen(v => !v); }}
      className="flex max-w-[320px] items-center gap-2 rounded-full border border-border bg-bg-hover px-3 py-1.5 text-[12px] text-text hover:bg-bg-selected">
      <span className="truncate font-medium">{name}</span><span className="shrink-0 text-text-muted">{effort}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && createPortal(<div ref={panel} style={{ position: "fixed", ...position, zIndex: 1200, maxHeight: "min(560px, 75vh)", width: "min(320px, calc(100vw - 16px))" }}
      className="material-popover overflow-y-auto rounded-panel border border-border p-2 shadow-popover" aria-label={t("hajimi.modelAndEffort")}>
      <div className="px-2 py-2 text-xs text-text-muted">{t("shell.models")}</div>
      {modelList.map(option => <button key={`${option.provider}:${option.id}`} disabled={busy}
        onClick={() => void change(() => onModelChange?.(option.provider, option.id))}
        className="flex w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-sm text-text hover:bg-bg-hover disabled:opacity-50">
        <span>{option.name}<span className="ml-2 text-[10px] text-text-dim">{option.provider}</span></span>
        {option.id === model?.modelId && option.provider === model?.provider && <span>✓</span>}
      </button>)}
      <div className="mt-2 border-t border-divider px-2 py-2 text-xs text-text-muted">{t("chat.thinkingLevel")}</div>
      <div className="flex flex-wrap gap-1 px-1 pb-1">
        {levels.filter(level => level === "auto" || !availableThinkingLevels || availableThinkingLevels.includes(level)).map(level =>
          <button key={level} disabled={busy} onClick={() => void change(() => onThinkingLevelChange?.(level))}
            aria-pressed={thinkingLevel === level}
            className={`rounded-control border px-2 py-1.5 text-xs disabled:opacity-50 ${thinkingLevel === level ? "border-accent bg-bg-selected text-accent" : "border-border text-text-muted hover:bg-bg-hover"}`}>
            {thinkingLevelMap?.[level] ?? t(`hajimi.effort_${level}`)}
          </button>)}
      </div>
      {error && <p role="alert" className="px-2 py-2 text-xs text-danger">{error}</p>}
    </div>, document.body)}
  </>;
}

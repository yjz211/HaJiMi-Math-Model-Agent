"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "./I18nProvider";

type MilestoneStatus = "not_started" | "in_progress" | "satisfied" | "stale" | "blocked" | "waived";

export interface HajimiStatusPayload {
  task: {
    identity: { title: string };
    state: {
      status: "active" | "waiting_for_user" | "completed";
      revision: number;
      currentObjective: string;
      nextAction: string;
      focus: { stage: number; questionId: string | null };
      interaction?: { mode: "unselected" | "automatic" | "supervised"; pending: { kind: string } | null; finalAccepted?: boolean; runtimeFailure?: { message: string } };
      milestones: Array<{ stage: number; title: string; status: MilestoneStatus }>;
      openGates: Array<{ gateId: string; gate: string; summary: string }>;
      questions: Array<{ questionId: string; status: string }>;
      provenance: {
        freezes: Array<{ status: string }>;
        bindings: Array<{ status: string }>;
      };
      capabilityRoutes: Array<{
        capabilityId: string;
        capabilityVersion: string;
        stage: number;
        availability: "ready" | "blocked_missing_input";
      }>;
    };
  };
  backend:
    | { status: "ready"; detail: { distribution?: string; python?: string; xelatex?: string | null } }
    | { status: "error"; error: string };
  validation: null | {
    strict: boolean;
    passed: boolean;
    summary: { passed: number; failed: number };
  };
}

export interface HajimiStatusResult {
  payload: HajimiStatusPayload | null;
  loading: boolean;
  unavailable: boolean;
}

const STAGE_TITLE_KEYS = [
  "hajimi.stage0",
  "hajimi.stage1",
  "hajimi.stage2",
  "hajimi.stage3",
  "hajimi.stage4",
  "hajimi.stage5",
  "hajimi.stage6",
  "hajimi.stage7",
  "hajimi.stage8",
  "hajimi.stage9",
] as const;

const STAGE_STATUS_KEYS = {
  not_started: "hajimi.notStarted",
  in_progress: "hajimi.inProgress",
  satisfied: "hajimi.satisfied",
  stale: "hajimi.stale",
  blocked: "hajimi.blocked",
  waived: "hajimi.waived",
} as const;

function milestoneTone(status: MilestoneStatus | undefined, active: boolean): string {
  if (active) return "border-accent bg-warning-bg text-text-strong shadow-input";
  if (status === "satisfied" || status === "waived") return "border-success-border bg-success-bg text-success";
  if (status === "blocked" || status === "stale") return "border-danger-border bg-danger-bg text-danger";
  return "border-border bg-bg-elevated text-text-muted";
}

export function useHajimiStatus(cwd: string | null, refreshKey: number): HajimiStatusResult {
  const [snapshot, setSnapshot] = useState<{ cwd: string; payload: HajimiStatusPayload } | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setUnavailable(false);
    if (!cwd) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { fetch(`/api/hajimi/status?cwd=${encodeURIComponent(cwd)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as HajimiStatusPayload;
        if (controller.signal.aborted) return;
        setSnapshot({ cwd, payload });
        setUnavailable(false);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && (error as Error).name !== "AbortError") setUnavailable(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(refresh, 8000);
        }
      }); };
    refresh();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [cwd, refreshKey]);

  return { payload: snapshot?.cwd === cwd ? snapshot.payload : null, loading, unavailable };
}

function WorkflowRail({ payload }: { payload: HajimiStatusPayload | null }) {
  const { t } = useI18n();
  const focus = payload?.task.state.focus.stage ?? 0;
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    const card = rail?.children[focus] as HTMLElement | undefined;
    if (rail && card) rail.scrollTo({ left: Math.max(0, card.offsetLeft - rail.offsetLeft - 16), behavior: "smooth" });
  }, [focus]);
  const milestones = new Map(payload?.task.state.milestones.map((item) => [item.stage, item.status]) ?? []);

  return (
    <div aria-label={t("hajimi.workflowPath")}>
      <div className="mb-2 flex items-center justify-between text-xs text-text-muted"><span>{t("hajimi.workflowPath")}</span><div className="flex gap-2"><button aria-label={t("hajimi.previousStages")} onClick={() => railRef.current?.scrollBy({ left: -330, behavior: "smooth" })}>←</button><button aria-label={t("hajimi.nextStages")} onClick={() => railRef.current?.scrollBy({ left: 330, behavior: "smooth" })}>→</button></div></div>
      <div ref={railRef} className="relative flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]" tabIndex={0}>
        {STAGE_TITLE_KEYS.map((key, stage) => {
          const status = milestones.get(stage);
          const active = Boolean(payload) && focus === stage;
          return (
            <div
              key={key}
              className={`relative w-[150px] shrink-0 snap-start min-h-[72px] rounded-panel border px-2 py-2 transition-colors ${milestoneTone(status, active)}`}
              aria-current={active ? "step" : undefined}
              title={`${stage}. ${t(key)}${status ? ` · ${t(STAGE_STATUS_KEYS[status])}` : ""}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] font-semibold">{String(stage).padStart(2, "0")}</span>
                {(status === "satisfied" || status === "waived") && (
                  <span className="text-[10px]" aria-hidden="true">✓</span>
                )}
                {(status === "blocked" || status === "stale") && (
                  <span className="text-[10px]" aria-hidden="true">!</span>
                )}
              </div>
              <div className="mt-1 text-[10px] font-medium leading-[1.3]">{t(key)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HajimiStatus({ result }: { result: HajimiStatusResult }) {
  const { t } = useI18n();
  const state = result.payload?.task.state;
  const backendReady = result.payload?.backend.status === "ready";
  const waiting = state?.status === "waiting_for_user";
  const completed = state?.status === "completed";
  const dotClass = result.loading
    ? "bg-text-dim"
    : !result.payload
      ? "bg-text-dim"
    : backendReady
      ? waiting
        ? "bg-warning"
        : "bg-success"
      : "bg-danger";
  const label = result.loading
    ? t("hajimi.loading")
    : waiting
      ? t("hajimi.waiting")
      : completed
        ? t("hajimi.completed")
        : result.payload
          ? t("hajimi.running")
          : t("hajimi.workflowShort");

  return (
    <div
      className="flex h-full items-center gap-1.5 px-2 text-[11px] text-text-muted [-webkit-app-region:no-drag]"
      aria-label={t("hajimi.status")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {state && <span className="font-mono text-text">S{state.focus.stage}</span>}
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

export function HajimiDashboard({ result }: { result: HajimiStatusResult; cwd: string }) {
  const { t } = useI18n();
  const payload = result.payload;
  const state = payload?.task.state;
  const completedStages = state?.milestones.filter((item) => item.status === "satisfied" || item.status === "waived").length ?? 0;
  const completedQuestions = state?.questions.filter((item) => item.status === "satisfied").length ?? 0;
  const activeFreeze = state?.provenance.freezes.some((item) => item.status === "active") ?? false;
  const backendReady = payload?.backend.status === "ready";
  const validationLabel = payload?.validation
    ? payload.validation.passed
      ? t("hajimi.passed")
      : `${payload.validation.summary.failed} ${t("hajimi.failed")}`
    : t("hajimi.notRun");

  return (
    <section className="shrink-0 border-b border-divider bg-bg-panel px-3 py-3" aria-label={t("hajimi.dashboard")}>
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{t("hajimi.agentEyebrow")}</span>
              {state && <span className="font-mono text-[10px] text-text-dim">rev {state.revision}</span>}
            </div>
            <div className="mt-1 truncate text-[13px] font-semibold text-text-strong">
              {payload?.task.identity.title ?? t("hajimi.notInitializedTitle")}
            </div>

          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className={`rounded-full border px-2 py-1 ${backendReady ? "border-success-border bg-success-bg text-success" : "border-border bg-bg-elevated text-text-muted"}`}>
              {t("hajimi.backend")} · {backendReady ? t("hajimi.ready") : t("hajimi.unavailable")}
            </span>
            <span className={`rounded-full border px-2 py-1 ${activeFreeze ? "border-success-border bg-success-bg text-success" : "border-border bg-bg-elevated text-text-muted"}`}>
              {t("hajimi.evidenceFreeze")} · {activeFreeze ? t("hajimi.active") : t("hajimi.notRun")}
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-panel border border-border bg-bg-elevated px-3 py-2">
              <div className="text-[10px] font-medium text-text-dim">{t("hajimi.objective")}</div>
              <div className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-text">
                {state?.currentObjective ?? (result.loading ? t("hajimi.loading") : t("hajimi.notInitializedHint"))}
              </div>
            </div>
            <div className="rounded-panel border border-border bg-bg-elevated px-3 py-2">
              <div className="text-[10px] font-medium text-text-dim">{t("hajimi.nextAction")}</div>
              <div className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-text">
                {state?.nextAction ?? t("hajimi.startHint")}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              [t("hajimi.plan"), `${completedStages}/10`],
              [t("hajimi.questions"), state?.questions.length ? `${completedQuestions}/${state.questions.length}` : "—"],
              [t("hajimi.gates"), String(state?.openGates.length ?? 0)],
              [t("hajimi.validation"), validationLabel],
            ].map(([label, value]) => (
              <div key={label} className="rounded-panel border border-border bg-bg-elevated px-2 py-2 text-center">
                <div className="truncate text-[9px] text-text-dim" title={label}>{label}</div>
                <div className="mt-1 truncate text-[11px] font-semibold text-text" title={value}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <WorkflowRail payload={payload} />
        </div>

        <div className="mt-2 rounded-panel bg-bg-elevated px-3 py-2 text-[12px] leading-relaxed text-text" aria-live="polite">
          {t(`hajimi.guide${state?.focus.stage ?? 0}` as Parameters<typeof t>[0])}
        </div>
      </div>
    </section>
  );
}

export function HajimiWelcome({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  const { t } = useI18n();

  return (
    <section className="flex h-full flex-col items-center justify-center overflow-y-auto px-5 py-10 text-center" aria-label={t("hajimi.welcomeTitle")}>
      <div className="grid h-12 w-12 place-items-center rounded-[15px] border border-warning-border bg-warning-bg font-mono text-[23px] font-semibold text-accent shadow-input">H</div>
      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{t("hajimi.agentEyebrow")}</div>
      <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text-strong">{t("hajimi.welcomeTitle")}</h1>
      <p className="mt-2 max-w-2xl text-[12px] leading-[1.7] text-text-muted">{t("hajimi.welcomeDescription")}</p>
      <div className="mt-7 w-full max-w-[980px] text-left">
        <WorkflowRail payload={null} />
      </div>
      <button onClick={onCreate} disabled={creating} className="mt-7 rounded-full bg-accent px-9 py-3 text-[18px] font-semibold text-accent-contrast shadow-input hover:opacity-90 disabled:opacity-50">{t(creating ? "hajimi.creating" : "hajimi.newModeling")}</button>
      <p className="mt-3 text-[12px] text-text-muted">{t("hajimi.createHint")}</p>
    </section>
  );
}

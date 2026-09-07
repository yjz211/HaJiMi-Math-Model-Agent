"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentEventsManager, type AgentEvent, type ConnectionStatus } from "./agent-events-manager";

export type { AgentEvent, ConnectionStatus };

interface UseAgentEventsOptions {
  agentRunning: boolean;
}

export function useAgentEvents({ agentRunning }: UseAgentEventsOptions) {
  const managerRef = useRef<AgentEventsManager | null>(null);
  const handleAgentEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");

  if (!managerRef.current) {
    managerRef.current = new AgentEventsManager();
  }

  useEffect(() => {
    managerRef.current?.setAgentRunning(agentRunning);
  }, [agentRunning]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    manager.setEventHandler((event) => {
      handleAgentEventRef.current?.(event);
    });
    manager.setStatusChangeHandler(setConnectionStatus);
    return () => {
      manager.setStatusChangeHandler(null);
      manager.cleanup();
    };
  }, []);

  const connectEvents = useCallback((sid: string): Promise<boolean> => {
    // expectRunning=true: connect may fire before the [agentRunning] effect
    // reaches the manager (see handleSend ordering); express intent now so an
    // early SSE onerror reconnects instead of leaving the UI stuck on Waiting.
    managerRef.current?.connect(sid, true, true);
    // A fast model can finish before EventSource connects. Prompt dispatch must
    // wait for the server subscription, otherwise agent_end is lost forever.
    const source = managerRef.current?.getEventSource();
    if (!source) return Promise.resolve(false);
    if (source.readyState === EventSource.OPEN) return Promise.resolve(true);
    return new Promise(resolve => {
      const done = (ready: boolean) => {
        clearTimeout(timer);
        source.removeEventListener("open", opened);
        source.removeEventListener("error", failed);
        resolve(ready);
      };
      const opened = () => done(true);
      const failed = () => done(false);
      const timer = setTimeout(() => done(false), 15000);
      source.addEventListener("open", opened, { once: true });
      source.addEventListener("error", failed, { once: true });
    });
  }, []);

  const eventSourceRef = {
    get current() {
      return managerRef.current?.getEventSource() ?? null;
    },
    set current(_val) {
      // no-op, managed internally
    }
  };

  const agentRunningRef = {
    get current() {
      return managerRef.current?.getAgentRunning() ?? false;
    },
    set current(val) {
      if (managerRef.current) {
        managerRef.current.setAgentRunning(val);
      }
    }
  };

  return {
    eventSourceRef,
    agentRunningRef,
    handleAgentEventRef,
    connectEvents,
    connectionStatus,
  };
}

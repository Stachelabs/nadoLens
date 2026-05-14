"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type ServiceStatus = "online" | "degraded" | "offline";

interface StatusData {
  status: ServiceStatus;
  services: { api: boolean; wsProxy: boolean; nado: boolean };
  timestamp: string;
}

interface UseNadoLensStatusReturn {
  status: ServiceStatus | null;
  nadoOk: boolean | null;
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL = 60_000;

export function useNadoLensStatus(): UseNadoLensStatusReturn {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [nadoOk, setNadoOk] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/status", { signal: controller.signal });
      if (!res.ok) {
        setError("Status check failed");
        setStatus("offline");
        return;
      }
      const data: StatusData = await res.json();
      setStatus(data.status);
      setNadoOk(data.services.nado);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError("Status check failed");
      setStatus("offline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchStatus]);

  return { status, nadoOk, loading, error };
}

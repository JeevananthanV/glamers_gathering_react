import { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE, getToken } from "./adminClient";

export type RemainingSlots = {
  audience: number;
  models: number;
  "makeup-artists": number;
  "stall-owners": number;
};

export type RealtimeConnectionState = "connected" | "connecting" | "disconnected";

export type ActivityItem = {
  category: "audience" | "models" | "makeup-artists" | "stall-owners" | "checkin";
  id: number;
  full_name: string;
  tickets?: number;
  contact_number?: string | null;
  email?: string | null;
  ticket_code?: string | null;
  timestamp: string;
  action_label?: string;
};

export type AdminStats = {
  counts: Record<string, number>;
  targets: Record<string, number>;
  remaining: Record<string, number>;
  total: number;
  entryCount: number;
  entryTickets: number;
};

/**
 * Public Real-time Hook for the main landing page.
 * Subscribes via SSE to live slot and ticket counts.
 */
export function usePublicRealtime(initialRemaining: RemainingSlots) {
  const [remaining, setRemaining] = useState<RemainingSlots>(initialRemaining);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: number | undefined;
    let unmounted = false;

    function connect() {
      if (typeof window === "undefined" || unmounted) return;

      try {
        es = new EventSource(`${API_BASE}/api/realtime/public`);

        es.onopen = () => {
          if (unmounted) return;
          setConnected(true);
        };

        es.addEventListener("init", (e: MessageEvent) => {
          if (unmounted) return;
          try {
            const data = JSON.parse(e.data);
            if (data.remaining) {
              setRemaining(data.remaining);
              setLastUpdated(new Date());
            }
          } catch {
            // ignore JSON parse error
          }
        });

        es.addEventListener("slot_update", (e: MessageEvent) => {
          if (unmounted) return;
          try {
            const data = JSON.parse(e.data);
            if (data.remaining) {
              setRemaining(data.remaining);
              setLastUpdated(new Date());
            }
          } catch {
            // ignore
          }
        });

        es.onerror = () => {
          if (unmounted) return;
          setConnected(false);
          es?.close();
          // Auto reconnect after 4 seconds
          reconnectTimeout = window.setTimeout(connect, 4000);
        };
      } catch {
        setConnected(false);
        reconnectTimeout = window.setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (es) {
        es.close();
      }
    };
  }, []);

  return { remaining, connected, lastUpdated };
}

/**
 * Admin Real-time Hook for the dashboard, categories, and gate check-in.
 * Streams submissions, ticket scans, edits, and live stats over authenticated SSE.
 */
export function useAdminRealtime(
  onEvent?: (eventName: string, data: any) => void
) {
  const [status, setStatus] = useState<RealtimeConnectionState>("connecting");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const token = getToken();
    if (!token || typeof window === "undefined") {
      setStatus("disconnected");
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let isDisposed = false;

    function startStream() {
      if (isDisposed) return;
      const currentToken = getToken();
      if (!currentToken) {
        setStatus("disconnected");
        return;
      }

      setStatus("connecting");
      const url = `${API_BASE}/api/realtime/admin?token=${encodeURIComponent(currentToken)}`;

      try {
        es = new EventSource(url);

        es.onopen = () => {
          if (isDisposed) return;
          setStatus("connected");
        };

        es.addEventListener("init", (event: MessageEvent) => {
          if (isDisposed) return;
          try {
            const payload = JSON.parse(event.data);
            setStats({
              counts: payload.counts || {},
              targets: payload.targets || {},
              remaining: payload.remaining || {},
              total: payload.total || 0,
              entryCount: payload.entryCount || 0,
              entryTickets: payload.entryTickets || 0,
            });
            if (Array.isArray(payload.recentActivity)) {
              setActivityFeed(payload.recentActivity);
            }
          } catch {
            // ignore
          }
        });

        es.addEventListener("stats_updated", (event: MessageEvent) => {
          if (isDisposed) return;
          try {
            const payload = JSON.parse(event.data);
            setStats((prev) => ({
              counts: payload.counts ?? prev?.counts ?? {},
              targets: payload.targets ?? prev?.targets ?? {},
              remaining: payload.remaining ?? prev?.remaining ?? {},
              total: payload.total ?? prev?.total ?? 0,
              entryCount: payload.entryCount ?? prev?.entryCount ?? 0,
              entryTickets: payload.entryTickets ?? prev?.entryTickets ?? 0,
            }));
            if (payload.action) {
              const newActivity: ActivityItem = {
                category: payload.action.category || "audience",
                id: payload.action.id || Date.now(),
                full_name: payload.action.name || payload.action.businessName || "Participant",
                tickets: payload.action.tickets,
                ticket_code: payload.action.ticketCode,
                timestamp: payload.action.time || new Date().toISOString(),
                action_label: `New ${payload.action.category} update`,
              };
              setActivityFeed((list) => [newActivity, ...list.slice(0, 29)]);
            }
            onEventRef.current?.("stats_updated", payload);
          } catch {
            // ignore
          }
        });

        es.addEventListener("new_submission", (event: MessageEvent) => {
          if (isDisposed) return;
          try {
            const payload = JSON.parse(event.data);
            const rec = payload.record || {};
            const item: ActivityItem = {
              category: payload.category,
              id: rec.id || Date.now(),
              full_name: rec.full_name || rec.business_name || "Applicant",
              tickets: rec.tickets || 1,
              contact_number: rec.contact_number,
              email: rec.email,
              ticket_code: rec.ticket_code,
              timestamp: rec.created_at || new Date().toISOString(),
              action_label: `New ${payload.category} registration`,
            };
            setActivityFeed((list) => [item, ...list.slice(0, 29)]);
            onEventRef.current?.("new_submission", payload);
          } catch {
            // ignore
          }
        });

        es.addEventListener("checkin", (event: MessageEvent) => {
          if (isDisposed) return;
          try {
            const payload = JSON.parse(event.data);
            const entry = payload.entry || {};
            const item: ActivityItem = {
              category: "checkin",
              id: entry.id || Date.now(),
              full_name: entry.full_name || "Attendee",
              tickets: entry.tickets || 1,
              contact_number: entry.contact_number,
              email: entry.email,
              ticket_code: entry.ticket_code,
              timestamp: entry.scanned_at || new Date().toISOString(),
              action_label: `Gate Check-in (${entry.tickets || 1} Tickets)`,
            };
            setActivityFeed((list) => [item, ...list.slice(0, 29)]);
            setStats((prev) =>
              prev
                ? {
                    ...prev,
                    entryCount: payload.entryCount ?? prev.entryCount + 1,
                    entryTickets:
                      payload.entryTickets ??
                      prev.entryTickets + (Number(entry.tickets) || 1),
                  }
                : null
            );
            onEventRef.current?.("checkin", payload);
          } catch {
            // ignore
          }
        });

        es.addEventListener("submission_updated", (event: MessageEvent) => {
          if (isDisposed) return;
          try {
            const payload = JSON.parse(event.data);
            onEventRef.current?.("submission_updated", payload);
          } catch {
            // ignore
          }
        });

        es.addEventListener("submission_deleted", (event: MessageEvent) => {
          if (isDisposed) return;
          try {
            const payload = JSON.parse(event.data);
            onEventRef.current?.("submission_deleted", payload);
          } catch {
            // ignore
          }
        });

        es.onerror = () => {
          if (isDisposed) return;
          setStatus("disconnected");
          es?.close();
          reconnectTimer = window.setTimeout(startStream, 3500);
        };
      } catch {
        setStatus("disconnected");
        reconnectTimer = window.setTimeout(startStream, 5000);
      }
    }

    startStream();

    return () => {
      isDisposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, []);

  return { status, stats, activityFeed };
}


/**
 * Client-Side Background Heartbeat & Overdue Watcher
 * Keeps the server awake and triggers any due scheduled overdue broadcasts
 * whenever any tab is active or loaded.
 */

type Listener = (status: { lastPing: string | null; success: boolean }) => void;

class SchedulerHeartbeat {
  private intervalId: any = null;
  private isChecking = false;
  private listeners: Set<Listener> = new Set();
  private lastStatus: { lastPing: string | null; success: boolean } = {
    lastPing: null,
    success: true,
  };

  start() {
    if (typeof window === "undefined") return;
    if (this.intervalId) return;

    // Initial check on boot
    this.ping();

    // Regular heartbeat every 25 seconds
    this.intervalId = setInterval(() => {
      this.ping();
    }, 25000);

    // Ping whenever tab becomes visible (user returns to page / unlocks phone)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.ping();
      }
    });

    // Ping on window focus
    window.addEventListener("focus", () => {
      this.ping();
    });

    // Ping when network reconnects
    window.addEventListener("online", () => {
      this.ping();
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async ping(): Promise<{ success: boolean; result?: any; status?: any }> {
    if (this.isChecking) return { success: true };
    this.isChecking = true;

    try {
      const res = await fetch("/api/discord/scheduler/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "client-heartbeat", timestamp: new Date().toISOString() }),
      });

      const data = await res.json();
      this.lastStatus = {
        lastPing: new Date().toLocaleTimeString("th-TH"),
        success: Boolean(data?.success),
      };
      this.notify();
      return data;
    } catch (err) {
      this.lastStatus = {
        lastPing: new Date().toLocaleTimeString("th-TH"),
        success: false,
      };
      this.notify();
      return { success: false };
    } finally {
      this.isChecking = false;
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.lastStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.lastStatus);
      } catch (_) {}
    }
  }

  getStatus() {
    return this.lastStatus;
  }

  getCronPingUrl(): string {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api/discord/scheduler/cron-ping`;
    }
    return "/api/discord/scheduler/cron-ping";
  }
}

export const schedulerHeartbeat = new SchedulerHeartbeat();

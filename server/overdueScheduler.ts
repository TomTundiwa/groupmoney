import { db } from "../src/lib/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { Group } from "../src/types";
import { buildCheckEmbed, fetchGroupData } from "./discordBotService";

// Helper to validate Discord Webhook URL
function isValidDiscordWebhookUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  return (
    url.startsWith("https://discord.com/api/webhooks/") ||
    url.startsWith("https://discordapp.com/api/webhooks/") ||
    url.startsWith("https://ptb.discord.com/api/webhooks/") ||
    url.startsWith("https://canary.discord.com/api/webhooks/")
  );
}

// Scheduled time slots in Bangkok Time (UTC+7)
// 06:00, 09:00, 11:30, 12:00, 15:00, 20:00
export interface ScheduledTimeSlot {
  hour: number;
  minute: number;
  label: string;
}

export const SCHEDULED_BANGKOK_TIME_SLOTS: ScheduledTimeSlot[] = [
  { hour: 6, minute: 0, label: "06:00" },
  { hour: 9, minute: 0, label: "09:00" },
  { hour: 11, minute: 30, label: "11:30" },
  { hour: 12, minute: 0, label: "12:00" },
  { hour: 15, minute: 0, label: "15:00" },
  { hour: 20, minute: 0, label: "20:00" },
];

export const SCHEDULED_TIME_SLOT_LABELS = SCHEDULED_BANGKOK_TIME_SLOTS.map((s) => s.label);
export const SCHEDULED_BANGKOK_HOURS = [6, 9, 11, 12, 15, 20];

/**
 * Get current time details in Asia/Bangkok
 */
export function getBangkokTimeDetails(): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateKey: string;
  timeLabel: string;
  totalMinutes: number;
} {
  const now = new Date();
  const bkkFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = bkkFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "0";

  const year = parseInt(getPart("year"), 10);
  const month = parseInt(getPart("month"), 10);
  const day = parseInt(getPart("day"), 10);
  const hour = parseInt(getPart("hour"), 10);
  const minute = parseInt(getPart("minute"), 10);

  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");
  const hourStr = String(hour).padStart(2, "0");
  const minStr = String(minute).padStart(2, "0");

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateKey: `${year}-${monthStr}-${dayStr}`,
    timeLabel: `${hourStr}:${minStr}`,
    totalMinutes: hour * 60 + minute,
  };
}

/**
 * Get closest or current slot label based on current Bangkok time
 */
export function getClosestOrCurrentSlotLabel(bkk = getBangkokTimeDetails()): string {
  const currentTotalMinutes = bkk.totalMinutes;
  let closestSlot = SCHEDULED_BANGKOK_TIME_SLOTS[0];
  let minDiff = Infinity;

  for (const slot of SCHEDULED_BANGKOK_TIME_SLOTS) {
    const slotMinutes = slot.hour * 60 + slot.minute;
    const diff = Math.abs(currentTotalMinutes - slotMinutes);
    if (diff < minDiff) {
      minDiff = diff;
      closestSlot = slot;
    }
  }

  return closestSlot.label;
}

/**
 * Find all scheduled slots whose start time has arrived today up to this minute
 */
export function getReachedSlotsToday(bkk = getBangkokTimeDetails()): ScheduledTimeSlot[] {
  const currentTotal = bkk.totalMinutes;
  return SCHEDULED_BANGKOK_TIME_SLOTS.filter((s) => s.hour * 60 + s.minute <= currentTotal);
}

/**
 * Send payload to Discord with automatic retry, timeout, and 429 rate limit backoff
 */
async function sendToDiscordWithRetry(
  url: string,
  payload: any,
  maxRetries = 3
): Promise<{ ok: boolean; status: number; text: string }> {
  let attempt = 0;
  let lastError = "";
  let lastStatus = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await res.text();
      lastStatus = res.status;

      if (res.ok) {
        return { ok: true, status: res.status, text };
      }

      // Handle Discord 429 Rate Limit
      if (res.status === 429) {
        let retryAfterMs = 2500;
        try {
          const parsed = JSON.parse(text);
          if (parsed.retry_after) {
            retryAfterMs = Math.ceil(Number(parsed.retry_after) * 1000) + 300;
          }
        } catch (_) {}
        console.warn(`[AutoOverdue] Discord 429 rate limited. Sleeping ${retryAfterMs}ms before attempt ${attempt + 1}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, retryAfterMs));
        continue;
      }

      // 5xx Server errors
      if (res.status >= 500 && attempt < maxRetries) {
        console.warn(`[AutoOverdue] Discord 5xx (${res.status}). Waiting 2s before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      return { ok: false, status: res.status, text };
    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`[AutoOverdue] Discord fetch error (attempt ${attempt}/${maxRetries}):`, lastError);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  return { ok: false, status: lastStatus || 500, text: lastError || "Network timeout or connection error" };
}

/**
 * Broadcast overdue report to Discord Webhook for a specific group
 */
export async function sendOverdueBroadcastForGroup(
  group: Group,
  triggerReason: string = "scheduled",
  targetTimeSlot?: string
): Promise<{ success: boolean; error?: string; unpaidCount?: number }> {
  if (!group.discordOverdueWebhookUrl || !isValidDiscordWebhookUrl(group.discordOverdueWebhookUrl)) {
    return { success: false, error: "No valid overdue webhook URL configured" };
  }

  try {
    const data = await fetchGroupData(group.id);
    if (!data || !data.group) {
      return { success: false, error: "Group not found" };
    }

    const { members, transactions } = data;
    const embed = buildCheckEmbed(data.group, members, transactions, "current");

    const timeSlotLabel = targetTimeSlot ? `รอบเวลา ${targetTimeSlot} น.` : "";
    embed.description = `⏰ **แจ้งเตือนยอดค้างอัตโนมัติประจำวัน ${timeSlotLabel}** (ส่ง 6 รอบ: 06:00, 09:00, 11:30, 12:00, 15:00, 20:00 น.)\n\n${embed.description || ""}`;

    const payload: Record<string, any> = {
      username: `แจ้งเตือนยอดค้าง • ${data.group.name || "ก๊วนออมเงิน"}`,
      avatar_url: "https://cdn-icons-png.flaticon.com/512/5501/5501375.png",
      embeds: [embed],
    };

    if (data.group.discordOverdueMentionText?.trim()) {
      payload.content = data.group.discordOverdueMentionText.trim();
    }

    const discordResult = await sendToDiscordWithRetry(group.discordOverdueWebhookUrl.trim(), payload, 3);

    if (!discordResult.ok) {
      return { success: false, error: `Discord HTTP ${discordResult.status}: ${discordResult.text}` };
    }

    // Update sent slot tracking in Firestore
    const bkk = getBangkokTimeDetails();
    const effectiveSlot = targetTimeSlot || getClosestOrCurrentSlotLabel(bkk);
    const slotKey = `${bkk.dateKey}_${effectiveSlot}`;

    try {
      const existingSent: string[] = Array.isArray(group.discordSentSlotsToday) ? [...group.discordSentSlotsToday] : [];
      const todaySent = existingSent.filter((k) => k.startsWith(bkk.dateKey));
      if (!todaySent.includes(slotKey)) {
        todaySent.push(slotKey);
      }

      await updateDoc(doc(db, "groups", group.id), {
        discordLastAutoOverdueBroadcast: new Date().toISOString(),
        discordLastAutoOverdueSlot: effectiveSlot,
        lastAutoOverdueSlotKey: slotKey,
        discordSentSlotsToday: todaySent,
      });
    } catch (updateErr) {
      console.warn(`[AutoOverdue] Failed to update sent status for group ${group.id}:`, updateErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[AutoOverdue] Error broadcasting for group ${group.id}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Check and execute scheduled overdue broadcasts for all enabled groups.
 * Guarantees that EVERY slot (06:00, 09:00, 11:30, 12:00, 15:00, 20:00) that has arrived today
 * and has not been sent yet will be dispatched.
 */
export async function executeScheduledOverdueBroadcast(
  forceTimeSlot?: string,
  bypassDedup: boolean = false
): Promise<{ checked: number; sent: number; timeSlot: string; details: any[] }> {
  const bkk = getBangkokTimeDetails();
  const timeSlot = forceTimeSlot || getClosestOrCurrentSlotLabel(bkk);

  console.log(`[AutoOverdue] Running check for Bangkok time: ${bkk.timeLabel} (${bkk.dateKey})`);

  let checkedCount = 0;
  let sentCount = 0;
  const details: any[] = [];

  try {
    const snap = await getDocs(collection(db, "groups"));

    for (const d of snap.docs) {
      const group = { id: d.id, ...d.data() } as Group;
      const isWebhookConfigured = Boolean(group.discordOverdueWebhookUrl?.trim());
      const isEnabled = group.discordOverdueWebhookEnabled ?? isWebhookConfigured;
      const isAutoScheduleEnabled = group.discordOverdueAutoSchedule ?? true;

      if (!isWebhookConfigured || !isEnabled) {
        continue;
      }
      if (!bypassDedup && !isAutoScheduleEnabled) {
        continue;
      }

      checkedCount++;

      // Determine which slots to send
      let slotsToSend: string[] = [];

      if (forceTimeSlot) {
        // Specific manual slot requested
        const targetKey = `${bkk.dateKey}_${forceTimeSlot}`;
        const hasAlreadySent =
          !bypassDedup &&
          (group.discordSentSlotsToday?.includes(targetKey) || group.lastAutoOverdueSlotKey === targetKey);

        if (!hasAlreadySent) {
          slotsToSend.push(forceTimeSlot);
        }
      } else {
        // Auto check: find all slots whose time has arrived today and have not been sent yet
        const reachedSlots = getReachedSlotsToday(bkk);

        for (const slot of reachedSlots) {
          const slotKey = `${bkk.dateKey}_${slot.label}`;
          const alreadySent =
            group.discordSentSlotsToday?.includes(slotKey) || group.lastAutoOverdueSlotKey === slotKey;

          if (!alreadySent) {
            slotsToSend.push(slot.label);
          }
        }
      }

      // Execute dispatch for each slot needing to be sent
      for (let i = 0; i < slotsToSend.length; i++) {
        const slotLabel = slotsToSend[i];
        console.log(`[AutoOverdue] 🚀 Dispatching overdue notification for group "${group.name || group.id}" (Slot ${slotLabel})...`);

        const result = await sendOverdueBroadcastForGroup(group, "scheduled", slotLabel);

        details.push({
          groupId: group.id,
          groupName: group.name,
          slot: slotLabel,
          success: result.success,
          error: result.error,
        });

        if (result.success) {
          sentCount++;
        }

        // Space out multiple dispatches to prevent Discord rate-limiting
        if (i < slotsToSend.length - 1) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
    }
  } catch (err) {
    console.error("[AutoOverdue] Error scanning groups:", err);
  }

  console.log(`[AutoOverdue] Completed check: Checked ${checkedCount} groups, Sent ${sentCount} notifications`);
  return { checked: checkedCount, sent: sentCount, timeSlot, details };
}

/**
 * Service to manage background periodic scheduler (every 20 seconds)
 */
class OverdueSchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isChecking = false;

  start() {
    if (this.intervalId) return;

    console.log("[AutoOverdue Scheduler] Started background daemon. Target Bangkok slots:", SCHEDULED_TIME_SLOT_LABELS);

    // Initial check after 3 seconds
    setTimeout(() => {
      this.checkTick().catch((err) => console.error("[AutoOverdue] Initial check error:", err));
    }, 3000);

    // Run check every 20 seconds
    this.intervalId = setInterval(() => {
      this.checkTick().catch((err) => console.error("[AutoOverdue Scheduler] Tick error:", err));
    }, 20000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkTick(): Promise<{ checked: number; sent: number; timeSlot: string; details: any[] } | null> {
    if (this.isChecking) return null;
    this.isChecking = true;

    try {
      return await executeScheduledOverdueBroadcast();
    } finally {
      this.isChecking = false;
    }
  }

  getStatus() {
    const bkk = getBangkokTimeDetails();
    const reachedSlots = getReachedSlotsToday(bkk).map((s) => s.label);

    return {
      running: Boolean(this.intervalId),
      bangkokTime: `${bkk.dateKey} ${bkk.timeLabel}`,
      bangkokHour: bkk.hour,
      bangkokMinute: bkk.minute,
      scheduledHours: SCHEDULED_BANGKOK_HOURS,
      scheduledSlots: SCHEDULED_TIME_SLOT_LABELS,
      reachedSlotsToday: reachedSlots,
    };
  }
}

export const overdueScheduler = new OverdueSchedulerService();

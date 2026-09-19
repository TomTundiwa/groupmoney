import { db } from "../src/lib/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { Group, Member, Transaction } from "../src/types";
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

// Scheduled hours in Bangkok Time (UTC+7)
// 6:00, 12:00, 15:00, 20:00
export const SCHEDULED_BANGKOK_HOURS = [6, 12, 15, 20];

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
  };
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

    // Check if anyone owes
    const timeSlotLabel = targetTimeSlot ? `รอบเวลา ${targetTimeSlot} น.` : "";
    embed.description = `⏰ **แจ้งเตือนยอดค้างอัตโนมัติประจำวัน ${timeSlotLabel}** (เวลา 06:00, 12:00, 15:00, 20:00 น.)\n\n${embed.description || ""}`;

    const payload: Record<string, any> = {
      username: `แจ้งเตือนยอดค้าง • ${data.group.name || "ก๊วนออมเงิน"}`,
      avatar_url: "https://cdn-icons-png.flaticon.com/512/5501/5501375.png",
      embeds: [embed],
    };

    if (data.group.discordOverdueMentionText?.trim()) {
      payload.content = data.group.discordOverdueMentionText.trim();
    }

    const res = await fetch(group.discordOverdueWebhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Discord HTTP ${res.status}: ${errText}` };
    }

    // Update last broadcast timestamp on group doc in Firestore
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, "groups", group.id), {
        discordLastAutoOverdueBroadcast: nowIso,
        discordLastAutoOverdueSlot: targetTimeSlot || `${getBangkokTimeDetails().hour}:00`,
      });
    } catch (updateErr) {
      console.warn(`[AutoOverdue] Failed to update timestamp for ${group.id}:`, updateErr);
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[AutoOverdue] Error broadcasting for group ${group.id}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Check and execute scheduled overdue broadcasts for all enabled groups
 */
export async function executeScheduledOverdueBroadcast(
  forceTimeSlot?: string
): Promise<{ checked: number; sent: number; timeSlot: string }> {
  const bkk = getBangkokTimeDetails();
  const timeSlot = forceTimeSlot || `${String(bkk.hour).padStart(2, "0")}:00`;
  const slotKey = `${bkk.dateKey}_${timeSlot}`;

  console.log(`[AutoOverdue] Running check for Bangkok time: ${bkk.timeLabel} (Slot: ${timeSlot})`);

  let checkedCount = 0;
  let sentCount = 0;

  try {
    const snap = await getDocs(collection(db, "groups"));
    for (const d of snap.docs) {
      const group = { id: d.id, ...d.data() } as Group;
      // Group must have webhook URL and (enabled === true or not explicitly disabled if URL is present)
      const isWebhookConfigured = Boolean(group.discordOverdueWebhookUrl?.trim());
      const isEnabled = group.discordOverdueWebhookEnabled ?? isWebhookConfigured;
      // If user toggled auto schedule off explicitly, skip (default true)
      const isAutoScheduleEnabled = group.discordOverdueAutoSchedule ?? true;

      if (!isWebhookConfigured || !isEnabled || !isAutoScheduleEnabled) {
        continue;
      }

      checkedCount++;

      // Check if this group has already been sent for this exact date and hour slot
      if (!forceTimeSlot && (group as any).lastAutoOverdueSlotKey === slotKey) {
        continue;
      }

      const result = await sendOverdueBroadcastForGroup(group, "scheduled", timeSlot);
      if (result.success) {
        sentCount++;
        // Record slot key in group doc to avoid duplicate sends across server restarts
        try {
          await updateDoc(doc(db, "groups", group.id), {
            lastAutoOverdueSlotKey: slotKey,
          });
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error("[AutoOverdue] Error scanning groups:", err);
  }

  console.log(`[AutoOverdue] Completed run for slot ${timeSlot}: Checked ${checkedCount}, Sent ${sentCount}`);
  return { checked: checkedCount, sent: sentCount, timeSlot };
}

/**
 * Service to manage background periodic scheduler (every 30 seconds check)
 */
class OverdueSchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private handledSlotsThisDay: Set<string> = new Set();
  private lastCheckedDateKey: string = "";

  start() {
    if (this.intervalId) return;

    console.log("[AutoOverdue Scheduler] Started background daemon. Target Bangkok hours:", SCHEDULED_BANGKOK_HOURS);

    // Run check every 30 seconds
    this.intervalId = setInterval(() => {
      this.checkTick().catch((err) => {
        console.error("[AutoOverdue Scheduler] Tick error:", err);
      });
    }, 30000);

    // Initial check after 5 seconds
    setTimeout(() => {
      this.checkTick().catch(() => {});
    }, 5000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkTick() {
    const bkk = getBangkokTimeDetails();

    // Reset handled set if new day
    if (this.lastCheckedDateKey !== bkk.dateKey) {
      this.lastCheckedDateKey = bkk.dateKey;
      this.handledSlotsThisDay.clear();
    }

    // Check if current Bangkok hour matches one of scheduled hours: 6, 12, 15, 20
    if (SCHEDULED_BANGKOK_HOURS.includes(bkk.hour)) {
      const slotHourStr = `${String(bkk.hour).padStart(2, "0")}:00`;
      const slotKey = `${bkk.dateKey}_${slotHourStr}`;

      // Only trigger if not already handled this slot on this day
      // and within the first 15 minutes of the hour (e.g. 06:00 - 06:15)
      if (!this.handledSlotsThisDay.has(slotKey) && bkk.minute < 15) {
        this.handledSlotsThisDay.add(slotKey);
        console.log(`[AutoOverdue Scheduler] 🔔 Triggering automatic broadcast for slot ${slotHourStr} (Bangkok: ${bkk.timeLabel})`);
        await executeScheduledOverdueBroadcast(slotHourStr);
      }
    }
  }

  getStatus() {
    const bkk = getBangkokTimeDetails();
    return {
      running: Boolean(this.intervalId),
      bangkokTime: `${bkk.dateKey} ${bkk.timeLabel}`,
      bangkokHour: bkk.hour,
      bangkokMinute: bkk.minute,
      scheduledHours: SCHEDULED_BANGKOK_HOURS,
      handledSlotsToday: Array.from(this.handledSlotsThisDay),
    };
  }
}

export const overdueScheduler = new OverdueSchedulerService();

/**
 * Safe API request helper that guarantees no JSON parsing crashes on HTML responses.
 * Prevents "Unexpected token 'T', 'The page c'... is not valid JSON" errors.
 */
import { calculateMemberCarryover } from "./carryover";
import { Group, Member, Transaction } from "../types";

export interface SafeApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";

    // Check if response is JSON
    if (!contentType.toLowerCase().includes("application/json")) {
      let rawText = "";
      try {
        rawText = await res.text();
      } catch (e) {
        // ignore
      }

      let errorMsg = `เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (${res.status})`;
      if (res.status === 404) {
        errorMsg = "ไม่พบ API Endpoint ฝั่งเซิร์ฟเวอร์ (HTTP 404) ระบบหลังบ้านอาจกำลังบูตหรือยังไม่พร้อมทำงาน";
      } else if (res.status === 502 || res.status === 503) {
        errorMsg = `เซิร์ฟเวอร์หลังบ้านกำลังเริ่มระบบ (HTTP ${res.status}) กรุณาลองใหม่อีกครั้งใน 1-2 นาที`;
      } else if (rawText && rawText.length < 150 && !rawText.includes("<")) {
        errorMsg = `เซิร์ฟเวอร์: ${rawText.trim()}`;
      } else if (rawText.toLowerCase().includes("the page cannot be found") || rawText.toLowerCase().includes("the page could not")) {
        errorMsg = "ระบบหลังบ้าน (Custom Server) ยังไม่เริ่มทำงาน หรือยังไม่มีการเปิดเซิร์ฟเวอร์ Node.js สำหรับ Discord Bot";
      }

      return {
        ok: false,
        status: res.status,
        error: errorMsg,
      };
    }

    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: json,
        error: json.error || json.message || `เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (HTTP ${res.status})`,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: json,
    };
  } catch (err: any) {
    console.error(`[safeFetchJson] Error fetching ${url}:`, err);
    return {
      ok: false,
      status: 0,
      error: err.message?.includes("Failed to fetch")
        ? "ไม่สามารถเชื่อมต่อไปยังเซิร์ฟเวอร์ได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือสถานะเซิร์ฟเวอร์"
        : `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message || "Network error"}`,
    };
  }
}

/**
 * Direct Discord Webhook test from browser as a zero-dependency fallback
 */
export async function testDiscordWebhookDirect(webhookUrl: string, groupName: string) {
  const embed = {
    title: "🔔 ทดสอบการเชื่อมต่อ Discord Webhook สำเร็จ! (Direct Web)",
    description: `ระบบแจ้งเตือนของก๊วน **${groupName || "ก๊วนออมเงิน"}** ได้เชื่อมต่อกับ Discord Webhook นี้เรียบร้อยแล้ว 🎉`,
    color: 0x5865F2,
    fields: [
      { name: "🏢 กลุ่ม", value: groupName || "ก๊วนออมเงิน", inline: true },
      { name: "🕒 เวลา", value: new Date().toLocaleTimeString("th-TH"), inline: true },
      { name: "🛡️ สถานะ", value: "พร้อมรับแจ้งเตือน (Direct)", inline: true },
    ],
    footer: { text: "Group Money Tracker • Direct Notification" },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl.trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Group Money Bot",
      avatar_url: "https://cdn-icons-png.flaticon.com/512/9028/9028031.png",
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Discord Webhook error (${response.status}): ${txt}`);
  }
  return { success: true };
}

/**
 * Direct Discord Overdue Webhook test from browser
 */
export async function testDiscordOverdueWebhookDirect(webhookUrl: string, groupName: string) {
  const embed = {
    title: "🚨 ทดสอบการเชื่อมต่อ Webhook แจ้งเตือนยอดค้าง สำเร็จ!",
    description: `ระบบแจ้งเตือนรายชื่อยอดค้างของก๊วน **${groupName || "ก๊วนออมเงิน"}** ได้เชื่อมต่อเรียบร้อยแล้ว\nพร้อมสำหรับส่งรายงานสรุปยอดค้างและรายชื่อสมาชิกที่ยังไม่โอนเงิน 📋`,
    color: 0xEF4444, // Red
    fields: [
      { name: "🏢 ก๊วน", value: groupName || "ก๊วนออมเงิน", inline: true },
      { name: "📌 ประเภท Webhook", value: "แจ้งเตือนรายชื่อยอดค้าง", inline: true },
      { name: "🕒 เวลาทดสอบ", value: new Date().toLocaleTimeString("th-TH"), inline: true },
    ],
    footer: { text: "Group Money Tracker • Overdue Reminder Webhook" },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(webhookUrl.trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: `แจ้งเตือนยอดค้าง • ${groupName || "ก๊วนออมเงิน"}`,
      avatar_url: "https://cdn-icons-png.flaticon.com/512/5501/5501375.png",
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Discord Webhook error (${response.status}): ${txt}`);
  }
  return { success: true };
}

/**
 * Direct Discord Overdue Webhook notification sender from browser
 */
export async function sendDiscordOverdueWebhookDirect(
  webhookUrl: string,
  groupName: string,
  embed: any,
  mentionText?: string
) {
  const payload: Record<string, any> = {
    username: `แจ้งเตือนยอดค้าง • ${groupName || "ก๊วนออมเงิน"}`,
    avatar_url: "https://cdn-icons-png.flaticon.com/512/5501/5501375.png",
    embeds: [embed],
  };

  if (mentionText && mentionText.trim()) {
    payload.content = mentionText.trim();
  }

  const response = await fetch(webhookUrl.trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Discord Webhook error (${response.status}): ${txt}`);
  }
  return { success: true };
}

/**
 * Helper to build an Overdue Discord Embed directly in browser
 */
export function createClientOverdueEmbed(
  group: Group,
  members: Member[],
  transactions: Transaction[],
  period: "current" | "previous" = "current"
) {
  const isPrevious = period === "previous";
  const targetPerMember = Number(group.targetAmountPerMember) || 200;
  const lateFeePerWeek = Number(group.lateFeePerWeek) || 0;

  if (members.length === 0) {
    return {
      title: `📋 สรุปสถานะการโอนเงิน: ${group.name}`,
      description: "ยังไม่มีสมาชิกในก๊วนนี้",
      color: 0x64748b,
      fields: [],
      timestamp: new Date().toISOString(),
    };
  }

  const memberStatuses = members.map((member) => {
    const calc = calculateMemberCarryover(
      member.id,
      transactions,
      targetPerMember,
      group.createdAt,
      lateFeePerWeek,
      member.initialCarryover || 0,
      member.customLateFee,
      group.lateFeeGraceWeeks || 0,
      member.customLateFeeGraceWeeks
    );

    const weeksCount = calc.weeksHistory.length;

    let targetWeekData;
    let deficit = 0;
    let isPaidFully = false;
    let rawPaid = 0;
    let totalLateFee = 0;
    let carriedOut = 0;
    let isLateFeeWaived = false;

    if (isPrevious && weeksCount >= 2) {
      targetWeekData = calc.weeksHistory[weeksCount - 2];
      deficit = targetWeekData.deficit || 0;
      isPaidFully = targetWeekData.isPaidFully && deficit <= 0;
      rawPaid = targetWeekData.rawPaid || 0;
      carriedOut = targetWeekData.carriedOut || 0;
      totalLateFee = targetWeekData.lateFee || 0;
      isLateFeeWaived = targetWeekData.isLateFeeWaived || false;
    } else {
      targetWeekData = calc.weeksHistory[weeksCount - 1];
      deficit = calc.currentWeekStatus.deficit || 0;
      isPaidFully = calc.currentWeekStatus.isPaidFully && deficit <= 0;
      rawPaid = calc.currentWeekStatus.rawPaidThisWeek || 0;
      carriedOut = calc.currentWeekStatus.carriedOut || 0;
      totalLateFee = calc.currentWeekStatus.lateFeeThisWeek || 0;
      isLateFeeWaived = calc.currentWeekStatus.isLateFeeWaived || false;
    }

    return {
      member,
      deficit,
      isPaidFully,
      rawPaid,
      carriedOut,
      totalLateFee,
      isLateFeeWaived,
      targetWeekData,
    };
  });

  const unpaidList = memberStatuses.filter((s) => !s.isPaidFully || s.deficit > 0);
  const paidList = memberStatuses.filter((s) => s.isPaidFully && s.deficit <= 0);
  const totalUnpaidAmount = unpaidList.reduce((sum, s) => sum + s.deficit, 0);
  const totalLateFeeAmount = unpaidList.reduce((sum, s) => sum + s.totalLateFee, 0);
  const totalPaidThisPeriod = memberStatuses.reduce((sum, s) => sum + (s.rawPaid || 0), 0);
  const totalFundBalance = (transactions || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const groupTotalTarget = targetPerMember * (members.length || 1);

  const targetWeekLabel = memberStatuses[0]?.targetWeekData?.label || (isPrevious ? "อาทิตย์ก่อน" : "รอบปัจจุบัน");
  const targetCycleLabel = memberStatuses[0]?.targetWeekData?.cycleLabel;

  let unpaidValue = "";
  if (unpaidList.length === 0) {
    unpaidValue = isPrevious
      ? "🎉 **สมาชิกทุกคนโอนเงินครบถ้วนในอาทิตย์ก่อนหน้า ไม่มีใครค้างยอด**"
      : "🎉 **สมาชิกทุกคนโอนเงินครบถ้วนแล้วในรอบนี้ ไม่มีใครค้างยอด**";
  } else {
    unpaidValue = unpaidList
      .map((s, idx) => {
        const discordTag = s.member.discordUserId
          ? ` <@${s.member.discordUserId}>`
          : s.member.discordUsername ? ` (@${s.member.discordUsername})` : "";
        const namePart = s.member.name && s.member.name !== s.member.nickname ? ` (${s.member.name})` : "";
        const labelText = s.totalLateFee > 0 ? "ค้างจ่าย" : "ค้าง";
        const finePart = s.totalLateFee > 0
          ? ` (รวมค่าปรับ +฿${s.totalLateFee.toLocaleString("th-TH")})`
          : s.isLateFeeWaived
          ? " (🛡️ สิทธิ์ละเว้นค่าปรับ)"
          : "";
        const paidPart = s.rawPaid > 0 ? ` • โอนแล้ว ฿${s.rawPaid.toLocaleString("th-TH")}` : "";
        return `${idx + 1}. 🔴 **${s.member.nickname}**${discordTag}${namePart}: **${labelText} ฿${s.deficit.toLocaleString("th-TH")}**${finePart}${paidPart}`;
      })
      .join("\n");
  }

  let paidValue = "";
  if (paidList.length === 0) {
    paidValue = isPrevious ? "ไม่มีสมาชิกที่โอนครบในอาทิตย์ก่อนหน้า" : "ยังไม่มีสมาชิกโอนเงินครบในรอบนี้";
  } else {
    paidValue = paidList
      .map((s, idx) => {
        const discordTag = s.member.discordUserId
          ? ` <@${s.member.discordUserId}>`
          : s.member.discordUsername ? ` (@${s.member.discordUsername})` : "";
        const bonusPart = s.carriedOut > 0 ? ` *(ทบเกิน +฿${s.carriedOut.toLocaleString("th-TH")})*` : "";
        return `${idx + 1}. 🟢 **${s.member.nickname}**${discordTag}: ครบถ้วน (โอนแล้ว ฿${s.rawPaid.toLocaleString("th-TH")}${bonusPart})`;
      })
      .join("\n");
  }

  const embedColor = unpaidList.length > 0 ? 0xef4444 : 0x10b981;
  const cycleDetails = targetCycleLabel ? `\n⏰ ช่วงเวลารอบนี้: **${targetCycleLabel}**` : "\n⏰ ตัดรอบ: **ทุกวันจันทร์ เวลา 00:00 น.**";
  const graceNote = (group.lateFeeGraceWeeks ?? 0) > 0 ? ` • ละเว้น ${group.lateFeeGraceWeeks} สัปดาห์แรกที่ค้าง` : "";

  return {
    title: isPrevious ? `📋 สรุปสถานะการโอนเงิน (อาทิตย์ก่อน): ${group.name}` : `📋 สรุปสถานะการโอนเงิน (รอบปัจจุบัน): ${group.name}`,
    description: `📅 ${isPrevious ? "รอบอาทิตย์ก่อน" : "รอบสัปดาห์ปัจจุบัน"}: **${targetWeekLabel}**${cycleDetails}\n🎯 เป้าหมายคนละ: **฿${targetPerMember.toLocaleString("th-TH")}**${lateFeePerWeek > 0 ? ` (ค่าปรับจ่ายช้า ฿${lateFeePerWeek.toLocaleString("th-TH")}/สัปดาห์${graceNote})` : ""}\n💰 ยอดเงินรวมกองกลางทั้งหมด: **฿${totalFundBalance.toLocaleString("th-TH")}**`,
    color: embedColor,
    fields: [
      {
        name: isPrevious ? `❌ สมาชิกที่ค้างจ่ายในอาทิตย์ก่อน (${unpaidList.length} คน)` : `❌ ยังไม่โอน / ค้างชำระในรอบปัจจุบัน (${unpaidList.length} คน)`,
        value: unpaidValue.length > 1024 ? unpaidValue.slice(0, 1020) + "..." : unpaidValue,
        inline: false,
      },
      {
        name: isPrevious ? `✅ โอนครบแล้วในอาทิตย์ก่อน (${paidList.length} คน)` : `✅ โอนครบแล้วในรอบปัจจุบัน (${paidList.length} คน)`,
        value: paidValue.length > 1024 ? paidValue.slice(0, 1020) + "..." : paidValue,
        inline: false,
      },
      {
        name: "💰 ยอดเงินรวมกองกลางทั้งหมด",
        value: `**฿${totalFundBalance.toLocaleString("th-TH")}**`,
        inline: true,
      },
      {
        name: "🔴 ยอดค้างชำระรวม",
        value: `**฿${totalUnpaidAmount.toLocaleString("th-TH")}** (${unpaidList.length} คน${totalLateFeeAmount > 0 ? ` • ค่าปรับ ฿${totalLateFeeAmount.toLocaleString("th-TH")}` : ""})`,
        inline: true,
      },
      {
        name: "🟢 ยอดโอนเข้าในรอบนี้",
        value: `**฿${totalPaidThisPeriod.toLocaleString("th-TH")}** / ฿${groupTotalTarget.toLocaleString("th-TH")} (ครบแล้ว ${paidList.length}/${members.length} คน)`,
        inline: true,
      },
    ],
    footer: {
      text: "Group Money Tracker • แจ้งเตือนรายชื่อยอดค้าง",
    },
    timestamp: new Date().toISOString(),
  };
}



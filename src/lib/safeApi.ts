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
  const totalFundBalance = (transactions || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const targetWeekLabel = memberStatuses[0]?.targetWeekData?.label || (isPrevious ? "อาทิตย์ก่อน" : "รอบปัจจุบัน");

  if (unpaidList.length === 0) {
    const paidLines = paidList.map((s, idx) => {
      const discordTag = s.member.discordUserId
        ? ` <@${s.member.discordUserId}>`
        : s.member.discordUsername
        ? ` (@${s.member.discordUsername})`
        : "";
      const realName = s.member.name && s.member.name !== s.member.nickname ? ` (${s.member.name})` : "";
      return `${idx + 1}. 🟢 **${s.member.nickname}**${discordTag}${realName}: โอนครบถ้วนแล้ว`;
    });

    return {
      title: `✅ สรุปยอดการโอนเงิน: ${group.name}`,
      description: `📅 ประจำรอบ: **${targetWeekLabel}**\n💰 ยอดเงินรวมปัจจุบัน: **฿${totalFundBalance.toLocaleString("th-TH")}**\n🎉 **สมาชิกทุกคนโอนเงินครบถ้วนแล้ว ไม่มีใครมียอดค้างชำระ**`,
      color: 0x10b981,
      fields: [
        {
          name: `✅ รายชื่อสมาชิกที่จ่ายแล้วครบทุกคน (${paidList.length} คน)`,
          value: paidLines.length > 0 ? paidLines.join("\n").slice(0, 1020) : "ทุกคนชำระเงินครบถ้วนแล้ว",
          inline: false,
        },
        {
          name: "💰 ยอดเงินรวมปัจจุบัน",
          value: `**฿${totalFundBalance.toLocaleString("th-TH")}**`,
          inline: true,
        },
        {
          name: "🔴 ยอดค้างชำระ",
          value: "**฿0** (ไม่มีคนค้าง)",
          inline: true,
        },
      ],
      footer: {
        text: "ระบบแจ้งเตือนยอดอัตโนมัติ",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Format list of unpaid members strictly: Name + Overdue amount
  const unpaidLines = unpaidList.map((s, idx) => {
    const discordTag = s.member.discordUserId
      ? ` <@${s.member.discordUserId}>`
      : s.member.discordUsername
      ? ` (@${s.member.discordUsername})`
      : "";
    const realName = s.member.name && s.member.name !== s.member.nickname ? ` (${s.member.name})` : "";
    const fineText = s.totalLateFee > 0 ? ` *(รวมค่าปรับ +฿${s.totalLateFee.toLocaleString("th-TH")})*` : "";
    return `${idx + 1}. 🔴 **${s.member.nickname}**${discordTag}${realName}: **ค้างจ่าย ฿${s.deficit.toLocaleString("th-TH")}**${fineText}`;
  });

  // Format list of paid members
  const paidLines = paidList.map((s, idx) => {
    const discordTag = s.member.discordUserId
      ? ` <@${s.member.discordUserId}>`
      : s.member.discordUsername
      ? ` (@${s.member.discordUsername})`
      : "";
    const realName = s.member.name && s.member.name !== s.member.nickname ? ` (${s.member.name})` : "";
    const paidInfo = s.rawPaid > 0 ? ` (โอนแล้ว ฿${s.rawPaid.toLocaleString("th-TH")})` : "";
    return `${idx + 1}. 🟢 **${s.member.nickname}**${discordTag}${realName}: ครบถ้วน${paidInfo}`;
  });

  // Handle Discord 1024 char field limits by splitting lines into fields if necessary
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  let currentChunk: string[] = [];
  let currentLength = 0;
  let partIndex = 1;

  for (const line of unpaidLines) {
    if (currentLength + line.length + 1 > 1000) {
      fields.push({
        name: partIndex === 1 ? `❌ ยังไม่โอน / ค้างชำระ (${unpaidList.length} คน)` : `❌ ยังไม่โอน / ค้างชำระ (ต่อ - ส่วนที่ ${partIndex})`,
        value: currentChunk.join("\n"),
        inline: false,
      });
      partIndex++;
      currentChunk = [line];
      currentLength = line.length;
    } else {
      currentChunk.push(line);
      currentLength += line.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    fields.push({
      name: partIndex === 1 ? `❌ ยังไม่โอน / ค้างชำระ (${unpaidList.length} คน)` : `❌ ยังไม่โอน / ค้างชำระ (ต่อ - ส่วนที่ ${partIndex})`,
      value: currentChunk.join("\n"),
      inline: false,
    });
  }

  // Add paid members list field
  if (paidLines.length > 0) {
    const paidValue = paidLines.join("\n");
    fields.push({
      name: `✅ โอนครบแล้ว / จ่ายแล้ว (${paidList.length} คน)`,
      value: paidValue.length > 1024 ? paidValue.slice(0, 1020) + "..." : paidValue,
      inline: false,
    });
  } else {
    fields.push({
      name: "✅ โอนครบแล้ว / จ่ายแล้ว (0 คน)",
      value: "ยังไม่มีสมาชิกโอนเงินครบในรอบนี้",
      inline: false,
    });
  }

  // Add total fund balance (ยอดรวมปัจจุบัน) and overdue total
  fields.push({
    name: "💰 ยอดเงินรวมปัจจุบัน (กองกลางสะสม)",
    value: `**฿${totalFundBalance.toLocaleString("th-TH")}**`,
    inline: true,
  });

  fields.push({
    name: "🔴 ยอดเงินค้างชำระรวม",
    value: `**฿${totalUnpaidAmount.toLocaleString("th-TH")}** (${unpaidList.length} คน)`,
    inline: true,
  });

  return {
    title: `🚨 แจ้งเตือนยอดค้างชำระ: ${group.name}`,
    description: `📅 ประจำรอบ: **${targetWeekLabel}**\n💰 **ยอดเงินรวมปัจจุบัน: ฿${totalFundBalance.toLocaleString("th-TH")}**\n🔴 **มียอดค้างชำระทั้งหมด ${unpaidList.length} คน • รวมเป็นเงิน ฿${totalUnpaidAmount.toLocaleString("th-TH")}**`,
    color: 0xef4444,
    fields,
    footer: {
      text: "ระบบแจ้งเตือนยอดค้างอัตโนมัติ • โปรดตรวจสอบและโอนเงินเข้าก๊วน",
    },
    timestamp: new Date().toISOString(),
  };
}



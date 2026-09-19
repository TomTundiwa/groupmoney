import { Client, GatewayIntentBits } from "discord.js";
import { db } from "../src/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { calculateMemberCarryover, getMondayOfDate, parseTxDateTime, toBangkokDate } from "../src/lib/carryover";
import { Group, Member, Transaction } from "../src/types";

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

// Format currency
const formatBaht = (num: number): string => {
  return Number(num || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

/**
 * Generate embed for "!เช็ค" (current week) or "!เช็คก่อน" (previous week)
 * Shows who hasn't transferred and how much they owe
 */
export function buildCheckEmbed(
  group: Group,
  members: Member[],
  transactions: Transaction[],
  period: "current" | "previous" = "current"
): DiscordEmbed {
  const targetPerMember = Number(group.targetAmountPerMember) || 200;
  const lateFeePerWeek = Number(group.lateFeePerWeek) || 0;
  const isPrevious = period === "previous";

  // If previous week requested but no members, handle gracefully
  if (members.length === 0) {
    return {
      title: `📋 สรุปสถานะการโอนเงิน: ${group.name}`,
      description: "ยังไม่มีสมาชิกในก๊วนนี้",
      color: 0x64748B,
      fields: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Pre-check if previous week exists
  const firstMemberCalc = calculateMemberCarryover(
    members[0].id,
    transactions,
    targetPerMember,
    group.createdAt,
    lateFeePerWeek,
    members[0].initialCarryover || 0,
    members[0].customLateFee
  );

  if (isPrevious && firstMemberCalc.weeksHistory.length < 2) {
    return {
      title: `📋 สรุปสถานะการโอนเงิน (อาทิตย์ก่อน): ${group.name}`,
      description: `ℹ️ **ก๊วนนี้เพิ่งเริ่มต้นในรอบสัปดาห์ปัจจุบัน** (${firstMemberCalc.weeksHistory[0]?.label || "สัปดาห์นี้"})\nยังไม่มีประวัติรอบสัปดาห์ก่อนหน้าให้ตรวจสอบ\n\n💡 พิมพ์ **!เช็ค** เพื่อดูยอดค้างของสัปดาห์ปัจจุบัน`,
      color: 0x3B82F6,
      fields: [
        {
          name: "💡 คำแนะนำ",
          value: "พิมพ์ `!เช็ค` เพื่อดูยอดค้างจ่ายปัจจุบัน หรือ `!ยอดเงิน` เพื่อดูยอดกองกลางสะสม",
          inline: false,
        },
      ],
      footer: {
        text: "Group Money Bot • พิมพ์ !เช็ค เพื่อดูยอดปัจจุบัน หรือ !คำสั่ง",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Calculate carryover and debt status for each member
  const memberStatuses = members.map((member) => {
    const calc = calculateMemberCarryover(
      member.id,
      transactions,
      targetPerMember,
      group.createdAt,
      lateFeePerWeek,
      member.initialCarryover || 0,
      member.customLateFee
    );

    const weeksCount = calc.weeksHistory.length;

    let targetWeekData;
    let deficit = 0;
    let isPaidFully = false;
    let rawPaid = 0;
    let available = 0;
    let carriedOut = 0;
    let totalLateFee = 0;

    if (isPrevious && weeksCount >= 2) {
      targetWeekData = calc.weeksHistory[weeksCount - 2];
      deficit = targetWeekData.deficit || 0;
      isPaidFully = targetWeekData.isPaidFully && deficit <= 0;
      rawPaid = targetWeekData.rawPaid || 0;
      available = targetWeekData.available || 0;
      carriedOut = targetWeekData.carriedOut || 0;
      totalLateFee = targetWeekData.lateFee || 0;
    } else {
      targetWeekData = calc.weeksHistory[weeksCount - 1];
      deficit = calc.currentWeekStatus.deficit || 0;
      isPaidFully = calc.currentWeekStatus.isPaidFully && deficit <= 0;
      rawPaid = calc.currentWeekStatus.rawPaidThisWeek || 0;
      available = calc.currentWeekStatus.available || 0;
      carriedOut = calc.currentWeekStatus.carriedOut || 0;
      totalLateFee = calc.currentWeekStatus.lateFeeThisWeek || 0;
    }

    return {
      member,
      calc,
      targetWeekData,
      deficit,
      isPaidFully,
      rawPaid,
      available,
      carriedOut,
      totalLateFee,
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

  // Format Unpaid Field value
  let unpaidValue = "";
  if (unpaidList.length === 0) {
    unpaidValue = isPrevious
      ? "🎉 **ยอดเยี่ยมมาก! สมาชิกทุกคนโอนเงินครบถ้วนในอาทิตย์ก่อนหน้า ไม่มีใครค้างยอด**"
      : "🎉 **ยอดเยี่ยมมาก! สมาชิกทุกคนโอนเงินครบถ้วนแล้วในรอบนี้ ไม่มีใครค้างยอด**";
  } else {
    unpaidValue = unpaidList
      .map((s, idx) => {
        const discordPart = s.member.discordUserId
          ? ` <@${s.member.discordUserId}>`
          : (s.member.discordUsername ? ` (@${s.member.discordUsername})` : "");
        const namePart = s.member.name && s.member.name !== s.member.nickname ? ` (${s.member.name})` : "";
        const labelText = s.totalLateFee > 0 ? "ค้างจ่าย" : "ค้าง";
        const fineText = s.totalLateFee > 0 ? ` (รวมค่าปรับ +฿${formatBaht(s.totalLateFee)})` : "";
        const paidText = s.rawPaid > 0 ? ` • โอนแล้ว ฿${formatBaht(s.rawPaid)}` : "";
        return `${idx + 1}. 🔴 **${s.member.nickname}**${discordPart}${namePart}: **${labelText} ฿${formatBaht(s.deficit)}**${fineText}${paidText}`;
      })
      .join("\n");
  }

  // Format Paid Field value
  let paidValue = "";
  if (paidList.length === 0) {
    paidValue = isPrevious ? "ไม่มีสมาชิกที่โอนครบในอาทิตย์ก่อนหน้า" : "ยังไม่มีสมาชิกโอนเงินครบในรอบนี้";
  } else {
    paidValue = paidList
      .map((s, idx) => {
        const discordPart = s.member.discordUserId
          ? ` <@${s.member.discordUserId}>`
          : (s.member.discordUsername ? ` (@${s.member.discordUsername})` : "");
        const bonusPart = s.carriedOut > 0 ? ` *(ทบเกิน +฿${formatBaht(s.carriedOut)})*` : "";
        return `${idx + 1}. 🟢 **${s.member.nickname}**${discordPart}: ครบถ้วน (โอนแล้ว ฿${formatBaht(s.rawPaid)}${bonusPart})`;
      })
      .join("\n");
  }

  // Embed color: Red if anyone owes, Green if everyone paid
  const embedColor = unpaidList.length > 0 ? 0xEF4444 : 0x10B981;

  const title = isPrevious
    ? `📋 สรุปสถานะการโอนเงิน (อาทิตย์ก่อน): ${group.name}`
    : `📋 สรุปสถานะการโอนเงิน (รอบปัจจุบัน): ${group.name}`;

  const periodLabel = isPrevious ? "รอบอาทิตย์ก่อน" : "รอบสัปดาห์ปัจจุบัน";
  const unpaidFieldName = isPrevious
    ? `❌ สมาชิกที่ค้างจ่ายในอาทิตย์ก่อน (${unpaidList.length} คน)`
    : `❌ ยังไม่โอน / ค้างชำระในรอบปัจจุบัน (${unpaidList.length} คน)`;

  const paidFieldName = isPrevious
    ? `✅ โอนครบแล้วในอาทิตย์ก่อน (${paidList.length} คน)`
    : `✅ โอนครบแล้วในรอบปัจจุบัน (${paidList.length} คน)`;

  const summaryFieldName = isPrevious ? "📊 สรุปยอดค้างชำระของอาทิตย์ก่อน" : "📊 สรุปยอดค้างชำระรอบปัจจุบัน";

  const footerText = isPrevious
    ? "Group Money Bot • ตัดรอบทุกวันจันทร์ 00:00 น. • พิมพ์ !เช็ค เพื่อดูยอดปัจจุบัน หรือ !ยอดเงิน"
    : "Group Money Bot • ตัดรอบทุกวันจันทร์ 00:00 น. • พิมพ์ !เช็คก่อน เพื่อดูยอดอาทิตย์ก่อน หรือ !ยอดเงิน";

  const cycleDetails = targetCycleLabel ? `\n⏰ ช่วงเวลารอบนี้: **${targetCycleLabel}**` : "\n⏰ ตัดรอบ: **ทุกวันจันทร์ เวลา 00:00 น.**";

  return {
    title,
    description: `📅 ${periodLabel}: **${targetWeekLabel}**${cycleDetails}\n🎯 เป้าหมายคนละ: **฿${formatBaht(targetPerMember)}**${lateFeePerWeek > 0 ? ` (ค่าปรับจ่ายช้า ฿${formatBaht(lateFeePerWeek)}/สัปดาห์)` : ""}\n💰 ยอดเงินรวมกองกลางทั้งหมด: **฿${formatBaht(totalFundBalance)}**`,
    color: embedColor,
    fields: [
      {
        name: unpaidFieldName,
        value: unpaidValue.length > 1024 ? unpaidValue.slice(0, 1020) + "..." : unpaidValue,
        inline: false,
      },
      {
        name: paidFieldName,
        value: paidValue.length > 1024 ? paidValue.slice(0, 1020) + "..." : paidValue,
        inline: false,
      },
      {
        name: "💰 ยอดเงินรวมกองกลางทั้งหมด",
        value: `**฿${formatBaht(totalFundBalance)}**`,
        inline: true,
      },
      {
        name: "🔴 ยอดค้างชำระรวม",
        value: `**฿${formatBaht(totalUnpaidAmount)}** (${unpaidList.length} คน${totalLateFeeAmount > 0 ? ` • ค่าปรับ ฿${formatBaht(totalLateFeeAmount)}` : ""})`,
        inline: true,
      },
      {
        name: "🟢 ยอดโอนเข้าในรอบนี้",
        value: `**฿${formatBaht(totalPaidThisPeriod)}** / ฿${formatBaht(groupTotalTarget)} (${paidList.length}/${members.length} คน)`,
        inline: true,
      },
    ],
    footer: {
      text: footerText,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate embed for "!ยอดเงิน" or "!balance"
 * Shows current total balance, target, and recent transactions
 */
export function buildBalanceEmbed(
  group: Group,
  members: Member[],
  transactions: Transaction[]
): DiscordEmbed {
  const targetPerMember = group.targetAmountPerMember || 0;
  const groupTotalTarget = targetPerMember * (members.length || 1);

  // Total collected all time
  const totalAllTime = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const progressPercent = groupTotalTarget > 0 ? Math.round((totalAllTime / groupTotalTarget) * 100) : 0;

  // Current week transactions (cut off every Monday at 00:00:00)
  const currentWeekStart = getMondayOfDate(new Date());

  const thisWeekTxs = transactions.filter((t) => {
    const txDate = parseTxDateTime(t);
    return txDate >= currentWeekStart;
  });
  const totalThisWeek = thisWeekTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Recent 3 transactions
  const sortedTxs = [...transactions].sort((a, b) => {
    const dateA = parseTxDateTime(a).getTime();
    const dateB = parseTxDateTime(b).getTime();
    return dateB - dateA;
  });

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const recentList = sortedTxs.slice(0, 3).map((tx, idx) => {
    const m = memberMap.get(tx.memberId);
    const nick = m?.nickname || tx.senderNameText || "สมาชิก";
    const discordMention = m?.discordUserId ? ` (<@${m.discordUserId}>)` : "";
    return `${idx + 1}. **${nick}**${discordMention} +฿${formatBaht(tx.amount)} (${tx.date} ${tx.time || ""})`;
  });

  const recentText = recentList.length > 0 ? recentList.join("\n") : "ยังไม่มีรายการโอนล่าสุด";

  return {
    title: `💰 สรุปยอดเงินกองกลาง: ${group.name}`,
    description: `สรุปสถานะยอดเงินออมและยอดสะสมของก๊วน ณ ปัจจุบัน (ตัดรอบทุกวันจันทร์ 00:00 น.)`,
    color: 0x3B82F6, // Brand Blue
    fields: [
      {
        name: "💵 ยอดเงินกองกลางสะสมทั้งหมด",
        value: `**฿${formatBaht(totalAllTime)}**`,
        inline: true,
      },
      {
        name: "🎯 เป้าหมายรวมของก๊วน",
        value: `**฿${formatBaht(groupTotalTarget)}** (${progressPercent}%)`,
        inline: true,
      },
      {
        name: "📅 ยอดโอนเข้าสัปดาห์นี้ (นับตั้งแต่ จ. 00:00 น.)",
        value: `**฿${formatBaht(totalThisWeek)}** (${thisWeekTxs.length} รายการ)`,
        inline: true,
      },
      {
        name: "👥 สมาชิกในก๊วน",
        value: `${members.length} คน (ผูก Discord แล้ว ${members.filter((m) => m.discordUserId).length} คน)`,
        inline: true,
      },
      {
        name: "🕒 3 รายการโอนเงินล่าสุด",
        value: recentText,
        inline: false,
      },
    ],
    footer: {
      text: "Group Money Bot • ตัดรอบทุกวันจันทร์ 00:00 น. • พิมพ์ !เช็ค หรือ !ของฉัน",
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate embed for "!ของฉัน" or "!me" (Personal member status)
 */
export function buildMemberPersonalStatusEmbed(
  group: Group,
  member: Member,
  transactions: Transaction[]
): DiscordEmbed {
  const targetPerMember = group.targetAmountPerMember || 0;
  const lateFeePerWeek = group.lateFeePerWeek || 0;

  const calc = calculateMemberCarryover(
    member.id,
    transactions,
    targetPerMember,
    group.createdAt,
    lateFeePerWeek,
    member.initialCarryover || 0,
    member.customLateFee
  );

  const curStatus = calc.currentWeekStatus;
  const deficit = curStatus.deficit || 0;
  const rawPaid = curStatus.rawPaidThisWeek || 0;
  const isPaidFully = curStatus.isPaidFully && deficit <= 0;
  const totalFine = curStatus.lateFeeThisWeek || 0;
  const carriedOut = curStatus.carriedOut || 0;

  // Member's all-time transactions
  const memberTxs = transactions.filter((t) => t.memberId === member.id);
  const totalAllTimePaid = memberTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const statusColor = isPaidFully ? 0x10B981 : 0xEF4444;
  const statusBadge = isPaidFully ? "🟢 โอนครบถ้วนแล้ว" : "🔴 ยังค้างชำระ";

  return {
    title: `👤 ข้อมูลสถานะการเงินส่วนตัว: ${member.nickname}`,
    description: `ก๊วน: **${group.name}**\nDiscord: <@${member.discordUserId}> (${member.name && member.name !== member.nickname ? `ชื่อบัญชี: ${member.name}` : `@${member.discordUsername || "discord"}`})\n⏰ ตัดรอบสัปดาห์: **ทุกวันจันทร์ เวลา 00:00 น.**`,
    color: statusColor,
    fields: [
      {
        name: "📌 สถานะรอบปัจจุบัน",
        value: `**${statusBadge}**${isPaidFully ? " 🎉" : ` (ค้าง **฿${formatBaht(deficit)}**)`}`,
        inline: true,
      },
      {
        name: "🎯 เป้าหมายประจำสัปดาห์",
        value: `**฿${formatBaht(targetPerMember)}**`,
        inline: true,
      },
      {
        name: "💸 โอนแล้วสัปดาห์นี้",
        value: `**฿${formatBaht(rawPaid)}**${carriedOut > 0 ? ` *(ทบเกิน +฿${formatBaht(carriedOut)})*` : ""}`,
        inline: true,
      },
      {
        name: "⚠️ ยอดค้างชำระสุทธิ",
        value: deficit > 0 ? `**฿${formatBaht(deficit)}**` : "฿0 (ไม่มีหนี้ค้าง)",
        inline: true,
      },
      ...(totalFine > 0
        ? [
            {
              name: "🚨 ค่าปรับรวม",
              value: `**฿${formatBaht(totalFine)}**`,
              inline: true,
            },
          ]
        : []),
      {
        name: "🏆 ยอดโอนสะสมทั้งหมด",
        value: `**฿${formatBaht(totalAllTimePaid)}** (${memberTxs.length} รายการ)`,
        inline: true,
      },
    ],
    footer: {
      text: "Group Money Bot • ตัดรอบทุกวันจันทร์ 00:00 น. • พิมพ์ !เช็ค หรือ !ยอดเงิน",
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate embed for "!ใครผูกแล้ว" or "!สมาชิก" (List all members and their Discord link status)
 */
export function buildMembersListEmbed(group: Group, members: Member[]): DiscordEmbed {
  const linkedCount = members.filter((m) => Boolean(m.discordUserId)).length;

  const memberLines = members.map((m, idx) => {
    if (m.discordUserId) {
      return `${idx + 1}. 🟢 **${m.nickname}** ➔ ผูกกับ <@${m.discordUserId}> (@${m.discordUsername || "discord"})`;
    }
    return `${idx + 1}. ⚪ **${m.nickname}** ➔ *ยังไม่ผูก* (พิมพ์ \`!ผูก ${m.nickname}\`)`;
  });

  const memberListText = memberLines.join("\n");

  return {
    title: `👥 รายชื่อสมาชิกในก๊วน: ${group.name}`,
    description: `สถานะการเชื่อมต่อ Discord: **ผูกแล้ว ${linkedCount}/${members.length} คน**\nสมาชิกทุกคนสามารถเชื่อมต่อบัญชี Discord ของตัวเองได้ทันที`,
    color: 0x5865F2,
    fields: [
      {
        name: "📋 รายชื่อสมาชิกและบัญชี Discord",
        value: memberListText.length > 1024 ? memberListText.slice(0, 1020) + "..." : memberListText,
        inline: false,
      },
      {
        name: "🔗 วิธีผูกบัญชี Discord ของคุณ",
        value: "พิมพ์ `!ผูก [ชื่อเล่น]` (เช่น `!ผูก " + (members[0]?.nickname || "ชื่อเล่น") + "`)\n• หลังจากผูกแล้ว บอทจะแท็กชื่อคุณเมื่อมีคำสั่ง `!เช็ค`\n• สามารถพิมพ์ `!ของฉัน` เพื่อดูสถานะส่วนตัวของคุณได้ตลอดเวลา",
        inline: false,
      },
    ],
    footer: {
      text: "Group Money Bot • ตัดรอบทุกวันจันทร์ 00:00 น. • พิมพ์ !ผูก [ชื่อเล่น]",
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate embed for "!คำสั่ง" or "!help"
 */
export function buildHelpEmbed(group?: Group): DiscordEmbed {
  return {
    title: `🤖 คำสั่งบอทก๊วนออมเงิน (${group?.name || "Group Money Tracker"})`,
    description: "สามารถพิมพ์คำสั่งต่อไปนี้ในห้องแชท Discord ได้ทันที:",
    color: 0x5865F2, // Discord Blurple
    fields: [
      {
        name: "📌 `!เช็ค` (หรือ `!check`, `!ค้าง`)",
        value: "ตรวจสอบรายชื่อสมาชิกที่**ยังไม่โอนเงิน / ค้างชำระในรอบปัจจุบัน** (ตัดรอบทุกวันจันทร์ 00:00 น.) พร้อมแท็กชื่อ Discord คนค้าง",
        inline: false,
      },
      {
        name: "📌 `!เช็คก่อน` (หรือ `!checkprev`, `!เช็คอาทิตย์ก่อน`)",
        value: "ตรวจสอบรายชื่อสมาชิกที่**ค้างชำระของรอบอาทิตย์ก่อนหน้า** (ก่อนวันจันทร์ 00:00 น. ล่าสุด) พร้อมยอดค้างและค่าปรับ",
        inline: false,
      },
      {
        name: "📌 `!ยอดเงิน` (หรือ `!balance`, `!เงิน`)",
        value: "ดู**ยอดเงินกองกลางรวมทั้งหมด** ยอดประจำสัปดาห์ (ตั้งแต่ จ. 00:00 น.) ความคืบหน้าของเป้าหมาย และรายการโอนล่าสุด",
        inline: false,
      },
      {
        name: "🔗 `!ผูก [ชื่อเล่น]` (หรือ `!link [ชื่อเล่น]`)",
        value: "เชื่อมโยงบัญชี Discord ของคุณเข้ากับชื่อสมาชิกในก๊วน (เช่น `!ผูก บอย`) เพื่อให้บอทแท็กแจ้งเตือนและเช็คยอดส่วนตัวได้",
        inline: false,
      },
      {
        name: "👤 `!ของฉัน` (หรือ `!me`, `!สถานะ`)",
        value: "ตรวจสอบ**ยอดเงินและสถานะส่วนตัวของคุณ** (ต้องผูกบัญชีก่อน) เช่น ยอดที่ต้องโอนในสัปดาห์นี้ หรือยอดโอนสะสม",
        inline: false,
      },
      {
        name: "👥 `!ใครผูกแล้ว` (หรือ `!สมาชิก`, `!members`)",
        value: "ดูรายชื่อสมาชิกทุกคนในก๊วน และตรวจสอบว่าใครเชื่อมต่อบัญชี Discord แล้วบ้าง",
        inline: false,
      },
      {
        name: "🔓 `!ยกเลิกผูก` (หรือ `!unlink`)",
        value: "ยกเลิกการเชื่อมโยงบัญชี Discord ของคุณออกจากสมาชิกในก๊วน",
        inline: false,
      },
      {
        name: "⏰ `กฎการตัดรอบรายสัปดาห์`",
        value: "ระบบจะ**ตัดรอบอัตโนมัติทุกๆ วันจันทร์ เวลา 00:00 น.**\n• โอนก่อนวันจันทร์ 00:00 น. = นับเป็นรอบสัปดาห์เดิม\n• โอนตั้งแต่วันจันทร์ 00:00 น. เป็นต้นไป = นับเป็นรอบสัปดาห์ใหม่ทันที",
        inline: false,
      },
    ],
    footer: {
      text: "Group Money Bot • ตัดรอบทุกวันจันทร์ 00:00 น. • ตอบกลับอัตโนมัติ 24 ชม.",
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fetch group data from Firestore by Group ID
 */
export async function fetchGroupData(groupId: string): Promise<{
  group: Group;
  members: Member[];
  transactions: Transaction[];
} | null> {
  try {
    const groupDoc = await getDoc(doc(db, "groups", groupId));
    if (!groupDoc.exists()) return null;

    const group = { id: groupDoc.id, ...groupDoc.data() } as Group;

    const membersSnap = await getDocs(
      query(collection(db, "members"), where("groupId", "==", groupId))
    );
    const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Member[];

    const txSnap = await getDocs(
      query(collection(db, "transactions"), where("groupId", "==", groupId))
    );
    const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Transaction[];

    return { group, members, transactions };
  } catch (err) {
    console.error(`[DISCORD] Error fetching group data for ${groupId}:`, err);
    return null;
  }
}

/**
 * Discord Bot Manager: Manages active Discord bot client connections
 */
class DiscordBotManager {
  private clients: Map<string, { client: Client; groupId: string; token: string }> = new Map();
  private isSyncing = false;

  constructor() {
    // Initial sync
    setTimeout(() => {
      this.syncBots().catch((err) => console.error("[DISCORD BOT] Sync error:", err));
    }, 3000);
  }

  /**
   * Connect a bot for a group
   */
  async connectBot(groupId: string, botToken: string, channelId?: string): Promise<{ success: boolean; error?: string }> {
    const cleanToken = botToken.trim();
    if (!cleanToken) {
      return { success: false, error: "กรุณาระบุ Discord Bot Token" };
    }

    // If already connected with same token, return success
    const existing = this.clients.get(groupId);
    if (existing && existing.token === cleanToken && existing.client.isReady()) {
      return { success: true };
    }

    // If existing has different token, destroy it first
    if (existing) {
      try {
        existing.client.destroy();
      } catch (e) {
        // ignore
      }
      this.clients.delete(groupId);
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    return new Promise((resolve) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            client.destroy();
          } catch (e) {}
          resolve({ success: false, error: "เชื่อมต่อ Discord Bot ไม่สำเร็จ (Timeout) กรุณาตรวจสอบ Bot Token" });
        }
      }, 15000);

      client.once("ready", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.log(`[DISCORD BOT] Logged in as ${client.user?.tag} for group ${groupId}`);
          this.clients.set(groupId, { client, groupId, token: cleanToken });
          resolve({ success: true });
        }
      });

      client.on("error", (err) => {
        console.error(`[DISCORD BOT] Client error for group ${groupId}:`, err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ success: false, error: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ Discord Bot" });
        }
      });

      // Handle incoming messages
      client.on("messageCreate", async (message) => {
        try {
          if (message.author.bot) return;

          // If channelId is restricted, check it
          if (channelId && message.channelId !== channelId) {
            return;
          }

          const rawContent = message.content.trim();
          const content = rawContent.toLowerCase();

          // Command: !ผูก or !link or !connect (Link Discord account to group member)
          if (content.startsWith("!ผูก") || content.startsWith("!link") || content.startsWith("!connect")) {
            const data = await fetchGroupData(groupId);
            if (!data) {
              await message.reply("⚠️ ไม่พบข้อมูลก๊วนออมเงินนี้");
              return;
            }

            // Extract argument (member name or nickname)
            const parts = rawContent.split(/\s+/);
            const targetName = parts.slice(1).join(" ").trim().toLowerCase();

            if (!targetName) {
              const availableMembers = data.members
                .map((m) => `• **${m.nickname}**${m.discordUserId ? ` (ผูกกับ <@${m.discordUserId}> แล้ว)` : " *(ยังว่าง)*"}`)
                .join("\n");
              await message.reply(
                `ℹ️ **กรุณาระบุชื่อเล่นที่ต้องการผูก**\nรูปแบบ: \`!ผูก [ชื่อเล่นของคุณ]\` เช่น \`!ผูก ${data.members[0]?.nickname || "ชื่อเล่น"}\`\n\n**รายชื่อสมาชิกในก๊วน:**\n${availableMembers}`
              );
              return;
            }

            // Find member by nickname or name
            const matchedMember = data.members.find(
              (m) =>
                (m.nickname && m.nickname.trim().toLowerCase() === targetName) ||
                (m.name && m.name.trim().toLowerCase() === targetName)
            ) || data.members.find(
              (m) =>
                (m.nickname && m.nickname.trim().toLowerCase().includes(targetName)) ||
                (m.name && m.name.trim().toLowerCase().includes(targetName))
            );

            if (!matchedMember) {
              const memberNames = data.members.map((m) => `\`${m.nickname}\``).join(", ");
              await message.reply(
                `❌ ไม่พบสมาชิกชื่อ **"${parts.slice(1).join(" ")}"** ในก๊วน\nสมาชิกที่มีอยู่: ${memberNames}\n(ลองพิมพ์ \`!ผูก [ชื่อเล่น]\`)`
              );
              return;
            }

            // Update in Firestore
            try {
              await updateDoc(doc(db, "members", matchedMember.id), {
                discordUserId: message.author.id,
                discordUsername: message.author.username,
              });

              await message.reply(
                `🎉 **เชื่อมโยงสำเร็จ!**\nบัญชี Discord <@${message.author.id}> (@${message.author.username}) ถูกผูกกับสมาชิก **"${matchedMember.nickname}"** เรียบร้อยแล้ว\n• บอทจะแท็กชื่อคุณเมื่อมีคำสั่ง \`!เช็ค\`\n• พิมพ์ \`!ของฉัน\` เพื่อดูยอดเงินและสถานะส่วนตัวของคุณได้ทันที!`
              );
            } catch (err: any) {
              console.error("[DISCORD BOT] Error linking member:", err);
              await message.reply(`⚠️ เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${err.message || "Unknown error"}`);
            }
            return;
          }

          // Command: !ยกเลิกผูก or !unlink or !ปลดผูก
          if (content.startsWith("!ยกเลิกผูก") || content.startsWith("!unlink") || content.startsWith("!ปลดผูก")) {
            const data = await fetchGroupData(groupId);
            if (!data) {
              await message.reply("⚠️ ไม่พบข้อมูลก๊วนออมเงินนี้");
              return;
            }

            const linkedMember = data.members.find((m) => m.discordUserId === message.author.id);
            if (!linkedMember) {
              await message.reply("⚠️ บัญชี Discord ของคุณยังไม่ได้ผูกกับสมาชิกคนใดในก๊วน (พิมพ์ `!ผูก [ชื่อเล่น]` เพื่อผูกบัญชี)");
              return;
            }

            try {
              await updateDoc(doc(db, "members", linkedMember.id), {
                discordUserId: deleteField(),
                discordUsername: deleteField(),
              });
              await message.reply(`🔓 **ยกเลิกการเชื่อมโยงแล้ว!**\nปลดการผูกบัญชี Discord <@${message.author.id}> ออกจาก **"${linkedMember.nickname}"** เรียบร้อยแล้ว`);
            } catch (err: any) {
              console.error("[DISCORD BOT] Error unlinking member:", err);
              await message.reply(`⚠️ เกิดข้อผิดพลาดในการยกเลิก: ${err.message || "Unknown error"}`);
            }
            return;
          }

          // Command: !ของฉัน or !me or !สถานะ or !my (Personal status)
          if (content.startsWith("!ของฉัน") || content === "!me" || content.startsWith("!สถานะ") || content === "!my") {
            const data = await fetchGroupData(groupId);
            if (!data) {
              await message.reply("⚠️ ไม่พบข้อมูลก๊วนออมเงินนี้");
              return;
            }

            const linkedMember = data.members.find((m) => m.discordUserId === message.author.id);
            if (!linkedMember) {
              const exampleNick = data.members[0]?.nickname || "ชื่อเล่น";
              await message.reply(
                `⚠️ **บัญชี Discord ของคุณยังไม่ได้ผูกกับสมาชิกในก๊วน**\nกรุณาพิมพ์ \`!ผูก [ชื่อเล่นของคุณ]\` เพื่อผูกบัญชีก่อน\nตัวอย่าง: \`!ผูก ${exampleNick}\` หรือพิมพ์ \`!สมาชิก\` เพื่อดูรายชื่อทั้งหมด`
              );
              return;
            }

            const embed = buildMemberPersonalStatusEmbed(data.group, linkedMember, data.transactions);
            await message.reply({ embeds: [embed] });
            return;
          }

          // Command: !ใครผูกแล้ว or !สมาชิก or !รายชื่อ or !members or !list
          if (
            content.startsWith("!ใครผูกแล้ว") ||
            content.startsWith("!สมาชิก") ||
            content.startsWith("!รายชื่อ") ||
            content.startsWith("!members") ||
            content.startsWith("!list")
          ) {
            const data = await fetchGroupData(groupId);
            if (!data) {
              await message.reply("⚠️ ไม่พบข้อมูลก๊วนออมเงินนี้");
              return;
            }
            const embed = buildMembersListEmbed(data.group, data.members);
            await message.reply({ embeds: [embed] });
            return;
          }

          // Command: !เช็คก่อน or !checkprev or !เช็คอาทิตย์ก่อน (Previous week check)
          if (
            content.startsWith("!เช็คก่อน") ||
            content.startsWith("!checkprev") ||
            content.startsWith("!เช็คอาทิตย์ก่อน") ||
            content.startsWith("!เช็คสัปดาห์ก่อน") ||
            content.startsWith("!ค้างก่อน")
          ) {
            const data = await fetchGroupData(groupId);
            if (!data) {
              await message.reply("⚠️ ไม่พบข้อมูลก๊วนออมเงินนี้");
              return;
            }
            const embed = buildCheckEmbed(data.group, data.members, data.transactions, "previous");
            await message.reply({ embeds: [embed] });
            return;
          }

          // Command: !เช็ค or !check or !ค้าง (Current week check)
          if (
            content.startsWith("!เช็ค") ||
            content.startsWith("!check") ||
            content.startsWith("!ค้าง") ||
            content.startsWith("!หนี้") ||
            content.startsWith("!เช็คปัจจุบัน")
          ) {
            const data = await fetchGroupData(groupId);
            if (!data) {
              await message.reply("⚠️ ไม่พบข้อมูลก๊วนออมเงินนี้");
              return;
            }
            const embed = buildCheckEmbed(data.group, data.members, data.transactions, "current");
            await message.reply({ embeds: [embed] });
            return;
          }

          // Command: !ยอดเงิน or !balance or !เงิน or !money
          if (content.startsWith("!ยอดเงิน") || content.startsWith("!balance") || content.startsWith("!เงิน") || content.startsWith("!money")) {
            const data = await fetchGroupData(groupId);
            if (!data) {
              await message.reply("⚠️ ไม่พบข้อมูลก๊วนออมเงินนี้");
              return;
            }
            const embed = buildBalanceEmbed(data.group, data.members, data.transactions);
            await message.reply({ embeds: [embed] });
            return;
          }

          // Command: !คำสั่ง or !help or !ช่วย
          if (content.startsWith("!คำสั่ง") || content.startsWith("!help") || content.startsWith("!ช่วย")) {
            const data = await fetchGroupData(groupId);
            const embed = buildHelpEmbed(data?.group);
            await message.reply({ embeds: [embed] });
            return;
          }
        } catch (msgErr) {
          console.error("[DISCORD BOT] Error handling message:", msgErr);
        }
      });

      client.login(cleanToken).catch((loginErr) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error("[DISCORD BOT] Login failed:", loginErr);
          resolve({
            success: false,
            error: `เข้าสู่ระบบบอทไม่สำเร็จ: ${loginErr.message || "Invalid Token / Missing Privileged Intents"}`,
          });
        }
      });
    });
  }

  /**
   * Disconnect a bot for a group
   */
  disconnectBot(groupId: string) {
    const existing = this.clients.get(groupId);
    if (existing) {
      try {
        existing.client.destroy();
      } catch (e) {}
      this.clients.delete(groupId);
      console.log(`[DISCORD BOT] Disconnected bot for group ${groupId}`);
    }
  }

  /**
   * Get status of bot for a group
   */
  getBotStatus(groupId: string): { isConnected: boolean; botUsername?: string } {
    const existing = this.clients.get(groupId);
    if (existing && existing.client.isReady()) {
      return {
        isConnected: true,
        botUsername: existing.client.user?.tag,
      };
    }
    return { isConnected: false };
  }

  /**
   * Sync all bots from Firestore
   */
  async syncBots() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      const snap = await getDocs(collection(db, "groups"));
      for (const d of snap.docs) {
        const group = { id: d.id, ...d.data() } as Group;
        if (group.discordBotEnabled && group.discordBotToken) {
          await this.connectBot(group.id, group.discordBotToken, group.discordChannelId);
        } else {
          this.disconnectBot(group.id);
        }
      }
    } catch (err) {
      console.error("[DISCORD BOT] Error during syncBots:", err);
    } finally {
      this.isSyncing = false;
    }
  }
}

export const discordBotManager = new DiscordBotManager();

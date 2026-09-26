import { Member, Transaction } from "../types";

export interface WeekCarryoverData {
  label: string; // "14 ก.ค. - 20 ก.ค."
  cycleLabel?: string; // "จ. 14 ก.ค. 00:00 น. - อา. 20 ก.ค. 23:59 น."
  startDate: Date;
  endDate: Date;
  rawPaid: number;          // Actual amount paid in this specific week
  carriedIn: number;        // Carried over from the previous week
  lateFee: number;          // ค่าปรับจ่ายล่าช้าสำหรับสัปดาห์นี้
  isLateFeeWaived?: boolean; // สัปดาห์นี้ได้รับการละเว้นค่าปรับหรือไม่
  waivedLateFeeAmount?: number; // ยอดเงินค่าปรับที่ได้รับการยกเว้นในสัปดาห์นี้
  overdueWeekNumber?: number; // สัปดาห์ที่ค้างชำระติดต่อกัน (1, 2, 3...)
  available: number;        // rawPaid + carriedIn - lateFee
  target: number;           // targetAmountPerMember
  isPaidFully: boolean;
  deficit: number;          // If not fully paid, how much is still needed
  carriedOut: number;       // Excess carried over to the next week
}

export interface MemberCarryoverResult {
  memberId: string;
  totalPaidAllTime: number;
  currentWeekStatus: {
    isPaidFully: boolean;
    available: number;
    deficit: number;
    carriedIn: number;
    carriedOut: number;
    rawPaidThisWeek: number;
    lateFeeThisWeek: number;
    isLateFeeWaived: boolean;
    waivedLateFeeAmount: number;
    overdueWeekNumber: number;
    graceWeeks: number;
  };
  weeksHistory: WeekCarryoverData[];
}

/**
 * Convert any Date or date string to Bangkok Local Time (UTC+7) Date object
 * whose getHours(), getMinutes(), getDay(), getDate(), etc. represent Thailand time.
 */
export function toBangkokDate(dateInput?: Date | string | number | null): Date {
  let d: Date;
  if (!dateInput) {
    d = new Date();
  } else if (typeof dateInput === "string" || typeof dateInput === "number") {
    d = new Date(dateInput);
  } else {
    d = new Date(dateInput.getTime());
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  // Calculate UTC time in ms
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  // Bangkok is UTC + 7 hours
  return new Date(utcMs + 7 * 3600000);
}

export function getEarliestDate(groupCreatedAt: string, transactions: Transaction[]): Date {
  let earliest = new Date(groupCreatedAt);
  if (isNaN(earliest.getTime())) {
    earliest = new Date();
  }
  return earliest;
}

/**
 * Calculate the starting Monday 00:00:00 for the weekly cycle that contains the given date.
 * Weekly cycle: Every Monday 00:00:00 until Sunday 23:59:59.
 * Cut-off is precisely every Monday at 00:00 น.
 */
export function getMondayOfDate(date: Date): Date {
  const d = toBangkokDate(date);
  const day = d.getDay();
  // day: 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  // If Sunday (0), go back 6 days to Monday
  // If Monday (1), 00:00:00 starts the new week
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);

  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0); // Monday 00:00:00.000
  return monday;
}

/**
 * Parse transaction date and time into a Date object matching Bangkok local time.
 */
export function parseTxDateTime(tx: Transaction): Date {
  if (tx.date) {
    const parts = tx.date.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const year = parts[0];
      const month = parts[1] - 1;
      const day = parts[2];
      let hour = 12;
      let minute = 0;
      let second = 0;
      if (tx.time) {
        const timeParts = tx.time.split(":").map(Number);
        if (!isNaN(timeParts[0])) hour = timeParts[0];
        if (!isNaN(timeParts[1])) minute = timeParts[1];
        if (timeParts.length > 2 && !isNaN(timeParts[2])) second = timeParts[2];
      }
      return new Date(year, month, day, hour, minute, second, 0);
    }
  }
  if (tx.createdAt) {
    return toBangkokDate(tx.createdAt);
  }
  return toBangkokDate();
}

export function generateWeeks(groupCreatedAt: string, transactions: Transaction[]): { label: string; cycleLabel: string; startDate: Date; endDate: Date }[] {
  const earliestDate = getEarliestDate(groupCreatedAt, transactions);
  let startMonday = getMondayOfDate(earliestDate);
  const currentMonday = getMondayOfDate(new Date());

  // Cap: If group creation date is in the future, cap startMonday to currentMonday
  if (startMonday > currentMonday) {
    startMonday = new Date(currentMonday);
  }

  // Cap: Do not allow generating more than 12 weeks into the past
  const twelveWeeksAgo = new Date(currentMonday);
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);
  if (startMonday < twelveWeeksAgo) {
    startMonday = twelveWeeksAgo;
  }

  const weeks: { label: string; cycleLabel: string; startDate: Date; endDate: Date }[] = [];
  const iterDate = new Date(startMonday);

  // Helper to format date in Thai
  const formatDate = (d: Date) => {
    return d.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
    });
  };

  // Generate weeks up to current week (Cut-off: Every Monday at 00:00:00)
  while (iterDate <= currentMonday) {
    const startOfWeek = new Date(iterDate); // Monday 00:00:00.000
    const nextMonday = new Date(iterDate);
    nextMonday.setDate(iterDate.getDate() + 7);
    nextMonday.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(nextMonday.getTime() - 1); // Sunday 23:59:59.999

    const endSunday = new Date(startOfWeek);
    endSunday.setDate(startOfWeek.getDate() + 6);

    const label = `${formatDate(startOfWeek)} - ${formatDate(endSunday)}`;
    const cycleLabel = `จ. ${formatDate(startOfWeek)} 00:00 น. - อา. ${formatDate(endSunday)} 23:59 น.`;

    weeks.push({
      label,
      cycleLabel,
      startDate: startOfWeek,
      endDate: endOfWeek,
    });

    // Move to next Monday
    iterDate.setDate(iterDate.getDate() + 7);
  }

  // Fallback: make sure we have at least the current week
  if (weeks.length === 0) {
    const startOfWeek = new Date(currentMonday);
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(currentMonday.getDate() + 7);
    nextMonday.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(nextMonday.getTime() - 1);

    const endSunday = new Date(startOfWeek);
    endSunday.setDate(startOfWeek.getDate() + 6);

    const label = `${formatDate(startOfWeek)} - ${formatDate(endSunday)}`;
    const cycleLabel = `จ. ${formatDate(startOfWeek)} 00:00 น. - อา. ${formatDate(endSunday)} 23:59 น.`;

    weeks.push({
      label,
      cycleLabel,
      startDate: startOfWeek,
      endDate: endOfWeek,
    });
  }

  return weeks;
}

export function calculateMemberCarryover(
  memberId: string,
  transactions: Transaction[],
  targetAmount: number,
  groupCreatedAt: string,
  lateFeePerWeek: number = 0,
  initialCarryover: number = 0,
  customLateFee?: number,
  lateFeeGraceWeeks: number = 0,
  customLateFeeGraceWeeks?: number
): MemberCarryoverResult {
  const memberTxs = transactions.filter((t) => t.memberId === memberId);
  const totalPaidAllTime = memberTxs.reduce((sum, t) => sum + t.amount, 0);

  const weekSpecs = generateWeeks(groupCreatedAt, transactions);
  const weeksHistory: WeekCarryoverData[] = [];

  let currentCarryOver = initialCarryover;
  let consecutiveOverdueWeeks = 0;

  const effectiveGraceWeeks = (customLateFeeGraceWeeks !== undefined && customLateFeeGraceWeeks !== null && String(customLateFeeGraceWeeks).trim() !== "")
    ? Math.max(0, Number(customLateFeeGraceWeeks))
    : Math.max(0, Number(lateFeeGraceWeeks) || 0);

  weekSpecs.forEach((spec, weekIdx) => {
    // Filter transactions for this member in this week
    const isFirstWeek = weekIdx === 0;
    const txsInWeek = memberTxs.filter((tx) => {
      const txDate = parseTxDateTime(tx);
      if (isFirstWeek) {
        return txDate <= spec.endDate;
      }
      return txDate >= spec.startDate && txDate <= spec.endDate;
    });

    const rawPaid = txsInWeek.reduce((sum, tx) => sum + tx.amount, 0);
    const effectiveLateFee = (customLateFee !== undefined && customLateFee !== null && String(customLateFee).trim() !== "") ? Number(customLateFee) : lateFeePerWeek;

    // ตรวจสอบว่าสัปดาห์นี้เริ่มต้นด้วยยอดค้างชำระยกมา หรือยอดโอนในสัปดาห์นี้ยังไม่ถึงเป้าหมาย
    const hasCarriedDeficit = currentCarryOver < 0 && (!isFirstWeek || initialCarryover < 0);
    const isUnpaidThisWeek = (rawPaid + currentCarryOver) < targetAmount;

    if (hasCarriedDeficit) {
      consecutiveOverdueWeeks += 1;
    } else if (isUnpaidThisWeek) {
      consecutiveOverdueWeeks = 1;
    } else {
      consecutiveOverdueWeeks = 0;
    }

    let lateFee = 0;
    let isLateFeeWaived = false;
    let waivedLateFeeAmount = 0;

    // คิดค่าปรับเมื่อมีหนี้ค้าง (ไม่ว่าจะยกมาหรือยังจ่ายไม่ครบในสัปดาห์ปัจจุบัน) และมีการตั้งค่าปรับไว้
    if ((hasCarriedDeficit || isUnpaidThisWeek) && effectiveLateFee > 0) {
      if (effectiveGraceWeeks > 0 && consecutiveOverdueWeeks <= effectiveGraceWeeks) {
        // อยู่ในช่วงละเว้นค่าปรับ (Grace Period เช่น ละเว้น 1 สัปดาห์แรก)
        isLateFeeWaived = true;
        waivedLateFeeAmount = effectiveLateFee;
        lateFee = 0;
      } else {
        // พ้นระยะเวลาละเว้น หรือตั้งค่าละเว้นเป็น 0 (คิดค่าปรับทันทีในอาทิตย์ปัจจุบันที่มีหนี้ค้าง)
        lateFee = effectiveLateFee;
        isLateFeeWaived = false;
        waivedLateFeeAmount = 0;
      }
    }

    // ยอดเงินที่มีในสัปดาห์นี้ = ยอดโอนสัปดาห์นี้ + ยอดยกมา (ติดลบคือหนี้) - ค่าปรับ
    const available = rawPaid + currentCarryOver - lateFee;

    let isPaidFully = false;
    let deficit = 0;
    let carriedOut = 0;

    if (available >= targetAmount) {
      isPaidFully = true;
      consecutiveOverdueWeeks = 0;
      // หากจ่ายครบถ้วน (ครอบคลุมทั้งเป้าหมาย ยอดค้าง และค่าปรับ) ยอดส่วนเกินจะถูกทบเป็นยอดบวก (+)
      carriedOut = available - targetAmount;
      deficit = 0;
    } else {
      isPaidFully = false;
      // หากโอนยอดไม่ครบตามที่ค้างตอนนั้น ยอดเงินค่าปรับและยอดค้างทั้งหมดจะยังคงอยู่และทบไปสัปดาห์ถัดไป
      carriedOut = available - targetAmount;
      deficit = targetAmount - available;
    }

    weeksHistory.push({
      label: spec.label,
      cycleLabel: spec.cycleLabel,
      startDate: spec.startDate,
      endDate: spec.endDate,
      rawPaid,
      carriedIn: currentCarryOver,
      lateFee,
      isLateFeeWaived,
      waivedLateFeeAmount,
      overdueWeekNumber: consecutiveOverdueWeeks,
      available,
      target: targetAmount,
      isPaidFully,
      deficit,
      carriedOut,
    });

    // Set carryover for next week
    currentCarryOver = carriedOut;
  });

  // The last element in weeksHistory represents the current week
  const currentWeekIdx = weeksHistory.length - 1;
  const currentWeek = weeksHistory[currentWeekIdx];

  return {
    memberId,
    totalPaidAllTime,
    currentWeekStatus: {
      isPaidFully: currentWeek?.isPaidFully ?? false,
      available: currentWeek?.available ?? 0,
      deficit: currentWeek?.deficit ?? 0,
      carriedIn: currentWeek?.carriedIn ?? 0,
      carriedOut: currentWeek?.carriedOut ?? 0,
      rawPaidThisWeek: currentWeek?.rawPaid ?? 0,
      lateFeeThisWeek: currentWeek?.lateFee ?? 0,
      isLateFeeWaived: currentWeek?.isLateFeeWaived ?? false,
      waivedLateFeeAmount: currentWeek?.waivedLateFeeAmount ?? 0,
      overdueWeekNumber: currentWeek?.overdueWeekNumber ?? 0,
      graceWeeks: effectiveGraceWeeks,
    },
    weeksHistory,
  };
}

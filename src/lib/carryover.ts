import { Member, Transaction } from "../types";

export interface WeekCarryoverData {
  label: string; // "14 ก.ค. - 20 ก.ค."
  cycleLabel?: string; // "จ. 14 ก.ค. 00:01 น. - จ. 21 ก.ค. 00:00 น."
  startDate: Date;
  endDate: Date;
  rawPaid: number;          // Actual amount paid in this specific week
  carriedIn: number;        // Carried over from the previous week
  lateFee: number;          // ค่าปรับจ่ายล่าช้าสำหรับสัปดาห์นี้
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
 * Calculate the starting Monday 00:01:00 for the weekly cycle that contains the given date.
 * Weekly cycle: Every Monday 00:01:00 until next Monday 00:00:59.
 * If the date is Monday before 00:01:00 (e.g. 00:00:30), it belongs to the PREVIOUS cycle.
 */
export function getMondayOfDate(date: Date): Date {
  const d = toBangkokDate(date);
  const day = d.getDay();
  // day: 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  let diff = d.getDate() - day + (day === 0 ? -6 : 1);

  // If it's Monday but before 00:01:00 (0 hours, 0 mins), it belongs to the previous week!
  if (day === 1 && d.getHours() === 0 && d.getMinutes() < 1) {
    diff -= 7;
  }

  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 1, 0, 0); // Monday 00:01:00.000
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

  // Generate weeks up to current week (Cut-off: Monday 00:01:00 to next Monday 00:00:59)
  while (iterDate <= currentMonday) {
    const startOfWeek = new Date(iterDate); // Monday 00:01:00.000
    const endOfWeek = new Date(iterDate);
    endOfWeek.setDate(iterDate.getDate() + 7);
    endOfWeek.setHours(0, 0, 59, 999); // Next Monday 00:00:59.999

    const endSunday = new Date(startOfWeek);
    endSunday.setDate(startOfWeek.getDate() + 6);

    const label = `${formatDate(startOfWeek)} - ${formatDate(endSunday)}`;
    const cycleLabel = `จ. ${formatDate(startOfWeek)} 00:01 น. - จ. ${formatDate(endOfWeek)} 00:00 น.`;

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
    const endOfWeek = new Date(currentMonday);
    endOfWeek.setDate(currentMonday.getDate() + 7);
    endOfWeek.setHours(0, 0, 59, 999);

    const endSunday = new Date(startOfWeek);
    endSunday.setDate(startOfWeek.getDate() + 6);

    const label = `${formatDate(startOfWeek)} - ${formatDate(endSunday)}`;
    const cycleLabel = `จ. ${formatDate(startOfWeek)} 00:01 น. - จ. ${formatDate(endOfWeek)} 00:00 น.`;

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
  customLateFee?: number
): MemberCarryoverResult {
  const memberTxs = transactions.filter((t) => t.memberId === memberId);
  const totalPaidAllTime = memberTxs.reduce((sum, t) => sum + t.amount, 0);

  const weekSpecs = generateWeeks(groupCreatedAt, transactions);
  const weeksHistory: WeekCarryoverData[] = [];

  let currentCarryOver = initialCarryover;

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

    // ค่าปรับจ่ายล่าช้าคิดสำหรับสมาชิกที่มียอดค้างชำระยกมา (currentCarryOver < 0)
    // โดยถ้าระบุ customLateFee เฉพาะบุคคล จะใช้ยอดนั้นแทนค่าปรับของกลุ่ม (เช่น 0 = ยกเว้น หรือระบุยอดเฉพาะ เช่น 50)
    const rawPaid = txsInWeek.reduce((sum, tx) => sum + tx.amount, 0);
    const effectiveLateFee = (customLateFee !== undefined && customLateFee !== null && String(customLateFee).trim() !== "") ? Number(customLateFee) : lateFeePerWeek;
    const lateFee = (currentCarryOver < 0 && effectiveLateFee > 0 && (!isFirstWeek || initialCarryover < 0)) ? effectiveLateFee : 0;

    // ยอดเงินที่มีในสัปดาห์นี้ = ยอดโอนสัปดาห์นี้ + ยอดยกมา (ติดลบคือหนี้) - ค่าปรับ
    const available = rawPaid + currentCarryOver - lateFee;

    let isPaidFully = false;
    let deficit = 0;
    let carriedOut = 0;

    if (available >= targetAmount) {
      isPaidFully = true;
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
      isPaidFully: currentWeek.isPaidFully,
      available: currentWeek.available,
      deficit: currentWeek.deficit,
      carriedIn: currentWeek.carriedIn,
      carriedOut: currentWeek.carriedOut,
      rawPaidThisWeek: currentWeek.rawPaid,
      lateFeeThisWeek: currentWeek.lateFee,
    },
    weeksHistory,
  };
}

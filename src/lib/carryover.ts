import { Member, Transaction } from "../types";

export interface WeekCarryoverData {
  label: string; // "14 ก.ค. - 20 ก.ค."
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

export function getEarliestDate(groupCreatedAt: string, transactions: Transaction[]): Date {
  let earliest = new Date(groupCreatedAt);
  if (isNaN(earliest.getTime())) {
    earliest = new Date();
  }
  return earliest;
}

export function getMondayOfDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // day: 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  let diff = d.getDate() - day + (day === 0 ? -6 : 1);

  // If it's Monday but before 00:01 (0 hours, 0 mins), it belongs to the previous week!
  if (day === 1 && d.getHours() === 0 && d.getMinutes() < 1) {
    diff -= 7;
  }

  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 1, 0, 0); // Monday 00:01:00
  return monday;
}

export function parseTxDateTime(tx: Transaction): Date {
  if (tx.time && tx.date) {
    const timeStr = tx.time.length === 5 ? `${tx.time}:00` : tx.time;
    const d = new Date(`${tx.date}T${timeStr}`);
    if (!isNaN(d.getTime())) return d;
  }
  if (tx.createdAt) {
    const d = new Date(tx.createdAt);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(`${tx.date}T12:00:00`);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function generateWeeks(groupCreatedAt: string, transactions: Transaction[]): { label: string; startDate: Date; endDate: Date }[] {
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

  const weeks: { label: string; startDate: Date; endDate: Date }[] = [];
  const iterDate = new Date(startMonday);

  // Helper to format date in Thai
  const formatDate = (d: Date) => {
    return d.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
    });
  };

  // Generate weeks up to current week
  while (iterDate <= currentMonday) {
    const startOfWeek = new Date(iterDate); // Monday 00:01:00
    const endOfWeek = new Date(iterDate);
    endOfWeek.setDate(iterDate.getDate() + 7);
    endOfWeek.setHours(0, 0, 59, 999); // Next Monday 00:00:59

    const endDisplay = new Date(startOfWeek);
    endDisplay.setDate(startOfWeek.getDate() + 6);

    const label = `${formatDate(startOfWeek)} - ${formatDate(endDisplay)}`;
    weeks.push({
      label,
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

    const endDisplay = new Date(startOfWeek);
    endDisplay.setDate(startOfWeek.getDate() + 6);

    weeks.push({
      label: `${formatDate(startOfWeek)} - ${formatDate(endDisplay)}`,
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
  let unpaidLateFeeCarry = 0;

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
    // โดยถ้าระบุ customLateFee เฉพาะบุคคล จะใช้ยอดนั้นแทนค่าปรับของกลุ่ม (เช่น 0 = ยกเว้น)
    // หากยังไม่จ่ายค่าปรับในสัปดาห์ก่อนหน้า ค่าปรับจะเพิ่มขึ้นอีกสะสมจากสัปดาห์ที่ค้าง (unpaidLateFeeCarry + newLateFee)
    const rawPaid = txsInWeek.reduce((sum, tx) => sum + tx.amount, 0);
    const effectiveLateFee = (customLateFee !== undefined && customLateFee !== null && customLateFee !== "" as any) ? Number(customLateFee) : lateFeePerWeek;
    const shouldChargeNewLateFee = currentCarryOver < 0 && effectiveLateFee > 0 && (!isFirstWeek || initialCarryover < 0);
    const newLateFeeThisWeek = shouldChargeNewLateFee ? effectiveLateFee : 0;
    const lateFee = unpaidLateFeeCarry + newLateFeeThisWeek;

    // คำนวณยอดชำระที่ใช้ตัดค่าปรับ และค่าปรับที่ยังเหลือค้างอยู่
    const paidTowardsLateFee = Math.min(rawPaid, lateFee);
    const remainingUnpaidLateFee = lateFee - paidTowardsLateFee;

    // เงินที่จ่ายในสัปดาห์นี้ หลังจากหักชำระค่าปรับ (ถ้ามี) แล้ว — เพื่อให้ค่าปรับที่จ่ายไปไม่ทบอาทิตย์ถัดไป
    const effectivePaidForPrincipal = Math.max(0, rawPaid - lateFee);
    const availableBeforeFee = rawPaid + currentCarryOver;
    const available = availableBeforeFee - lateFee;

    let isPaidFully = false;
    let deficit = 0;
    let carriedOut = 0;

    if (available >= targetAmount) {
      isPaidFully = true;
      // หากจ่ายครบถ้วน ยอดส่วนเกิน (เกินจากยอดค้าง + ค่าปรับ + เป้าประจำสัปดาห์) จะถูกทบเป็นยอดบวก (+)
      carriedOut = available - targetAmount;
      deficit = 0;
      unpaidLateFeeCarry = 0; // จ่ายครบถ้วนแล้ว ไม่มียอดค่าปรับค้างสะสม
    } else {
      isPaidFully = false;
      // ยอดค่าปรับหากจ่ายแล้วจะไม่ทบอาทิตย์ถัดไป แต่ค่าปรับที่ยังไม่จ่ายจะสะสมเป็นค่าปรับเพิ่มขึ้นอีกในสัปดาห์ถัดไป
      carriedOut = effectivePaidForPrincipal + currentCarryOver - targetAmount;
      deficit = targetAmount - available;
      unpaidLateFeeCarry = remainingUnpaidLateFee;
    }

    weeksHistory.push({
      label: spec.label,
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

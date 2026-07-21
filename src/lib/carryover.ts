import { Member, Transaction } from "../types";

export interface WeekCarryoverData {
  label: string; // "14 ก.ค. - 20 ก.ค."
  startDate: Date;
  endDate: Date;
  rawPaid: number;          // Actual amount paid in this specific week
  carriedIn: number;        // Carried over from the previous week
  available: number;        // rawPaid + carriedIn
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
  };
  weeksHistory: WeekCarryoverData[];
}

export function getEarliestDate(groupCreatedAt: string, transactions: Transaction[]): Date {
  let earliest = new Date(groupCreatedAt);
  if (isNaN(earliest.getTime())) {
    earliest = new Date();
  }

  transactions.forEach((tx) => {
    const txDate = new Date(`${tx.date}T12:00:00`);
    if (!isNaN(txDate.getTime()) && txDate < earliest) {
      earliest = txDate;
    }
  });

  return earliest;
}

export function getMondayOfDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // day: 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function generateWeeks(groupCreatedAt: string, transactions: Transaction[]): { label: string; startDate: Date; endDate: Date }[] {
  const earliestDate = getEarliestDate(groupCreatedAt, transactions);
  const startMonday = getMondayOfDate(earliestDate);
  const currentMonday = getMondayOfDate(new Date());

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
    const startOfWeek = new Date(iterDate);
    const endOfWeek = new Date(iterDate);
    endOfWeek.setDate(iterDate.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const label = `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`;
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
    endOfWeek.setDate(currentMonday.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    weeks.push({
      label: `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`,
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
  groupCreatedAt: string
): MemberCarryoverResult {
  const memberTxs = transactions.filter((t) => t.memberId === memberId);
  const totalPaidAllTime = memberTxs.reduce((sum, t) => sum + t.amount, 0);

  const weekSpecs = generateWeeks(groupCreatedAt, transactions);
  const weeksHistory: WeekCarryoverData[] = [];

  let currentCarryOver = 0;

  weekSpecs.forEach((spec) => {
    // Filter transactions for this member in this week
    const txsInWeek = memberTxs.filter((tx) => {
      const txDate = new Date(`${tx.date}T12:00:00`);
      return txDate >= spec.startDate && txDate <= spec.endDate;
    });

    const rawPaid = txsInWeek.reduce((sum, tx) => sum + tx.amount, 0);
    const available = rawPaid + currentCarryOver;

    let isPaidFully = false;
    let deficit = 0;
    let carriedOut = 0;

    if (available >= targetAmount) {
      isPaidFully = true;
      carriedOut = available - targetAmount;
      deficit = 0;
    } else {
      isPaidFully = false;
      carriedOut = available - targetAmount; // Carry over the negative deficit
      deficit = targetAmount - available;
    }

    weeksHistory.push({
      label: spec.label,
      startDate: spec.startDate,
      endDate: spec.endDate,
      rawPaid,
      carriedIn: currentCarryOver,
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
    },
    weeksHistory,
  };
}

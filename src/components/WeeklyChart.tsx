import { useMemo, useState } from "react";
import { Transaction, Member } from "../types";
import { Calendar, TrendingUp, DollarSign, CalendarRange, Info } from "lucide-react";
import { motion } from "motion/react";

interface WeeklyChartProps {
  transactions: Transaction[];
  members: Member[];
}

interface WeekData {
  label: string; // "6 ก.ค. - 12 ก.ค."
  shortLabel: string; // "W1"
  startDate: Date;
  endDate: Date;
  amount: number;
  count: number;
  txs: Transaction[];
}

export default function WeeklyChart({ transactions, members }: WeeklyChartProps) {
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null);

  const weeklyData = useMemo(() => {
    // Generate the last 6 weeks of data up to the current date
    const weeks: WeekData[] = [];
    const now = new Date();

    // Generate weeks dynamically
    for (let i = 5; i >= 0; i--) {
      const startOfWeek = new Date();
      // Adjust to Monday of that week
      const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday...
      const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      startOfWeek.setDate(now.getDate() + diffToMonday - i * 7);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Format Labels
      const formatDate = (d: Date) => {
        return d.toLocaleDateString("th-TH", {
          day: "numeric",
          month: "short",
        });
      };

      const label = `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`;
      const shortLabel = `สัปดาห์ที่ ${6 - i}`;

      weeks.push({
        label,
        shortLabel,
        startDate: startOfWeek,
        endDate: endOfWeek,
        amount: 0,
        count: 0,
        txs: [],
      });
    }

    // Populate data with actual transactions
    transactions.forEach((tx) => {
      const txDate = new Date(`${tx.date}T12:00:00`); // Use noon to prevent timezone shifts

      weeks.forEach((week) => {
        if (txDate >= week.startDate && txDate <= week.endDate) {
          week.amount += tx.amount;
          week.count += 1;
          week.txs.push(tx);
        }
      });
    });

    return weeks;
  }, [transactions]);

  const maxAmount = useMemo(() => {
    const max = Math.max(...weeklyData.map((w) => w.amount), 0);
    return max === 0 ? 1000 : max; // Default high watermark to draw scale
  }, [weeklyData]);

  const currentWeek = weeklyData[5];
  const lastWeek = weeklyData[4];

  const percentChange = useMemo(() => {
    if (!lastWeek || lastWeek.amount === 0) return currentWeek.amount > 0 ? 100 : 0;
    return Math.round(((currentWeek.amount - lastWeek.amount) / lastWeek.amount) * 100);
  }, [currentWeek, lastWeek]);

  // Map member IDs to nicknames/names
  const getMemberDisplayName = (memberId: string, senderNameText: string) => {
    const member = members.find((m) => m.id === memberId);
    if (member) {
      return member.nickname ? `${member.nickname} (${member.name})` : member.name;
    }
    return senderNameText || "ไม่ระบุชื่อ";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6" id="weekly-overview-section">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-sans font-bold text-slate-100">ตรวจสอบยอดรายอาทิตย์</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2.5 py-1 rounded-full">
          ย้อนหลัง 6 สัปดาห์
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI Summaries */}
        <div className="space-y-4 md:col-span-1">
          <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-2xl">
            <p className="text-xs text-slate-400 font-sans">โอนเข้าสัปดาห์นี้</p>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              ฿{currentWeek?.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 }) || "0.00"}
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <TrendingUp className={`w-4 h-4 ${percentChange >= 0 ? "text-emerald-400" : "text-rose-400"}`} />
              <span className={`text-xs font-mono font-medium ${percentChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {percentChange >= 0 ? "+" : ""}{percentChange}%
              </span>
              <span className="text-[10px] text-slate-500">เทียบกับสัปดาห์ก่อนหน้า</span>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-2xl">
            <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
              <span>สัปดาห์นี้ทั้งหมด</span>
              <span className="font-mono text-slate-300 font-bold">{currentWeek?.count || 0} รายการ</span>
            </div>
            <div className="text-[11px] text-slate-400 leading-relaxed font-sans mt-2">
              <Info className="w-3.5 h-3.5 inline mr-1 text-slate-400 -mt-0.5" />
              คลิกเลือกแท่งกราฟเพื่อดูรายละเอียดของยอดโอนในสัปดาห์นั้น ๆ
            </div>
          </div>
        </div>

        {/* Custom Visual Bar Chart */}
        <div className="md:col-span-2 flex flex-col justify-between bg-slate-800/20 border border-slate-800/60 p-5 rounded-2xl">
          {/* Chart Graphic */}
          <div className="h-44 flex items-end justify-between gap-2 pt-6">
            {weeklyData.map((week, idx) => {
              const heightPercent = Math.max((week.amount / maxAmount) * 100, 4); // Min height to show empty/small bars
              const isSelected = selectedWeekIdx === idx;

              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center group cursor-pointer"
                  onClick={() => setSelectedWeekIdx(isSelected ? null : idx)}
                >
                  {/* Tooltip on top of bar on hover/selection */}
                  <div className="relative w-full flex justify-center">
                    <div
                      className={`absolute bottom-full mb-1 bg-slate-950 text-slate-100 text-[10px] font-mono px-2 py-1 rounded-md border border-slate-700 whitespace-nowrap shadow-lg pointer-events-none transition-all duration-150 ${
                        isSelected ? "opacity-100 scale-100" : "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100"
                      }`}
                    >
                      ฿{week.amount.toLocaleString("th-TH")}
                    </div>
                  </div>

                  {/* The bar */}
                  <div className="w-full bg-slate-800/60 rounded-t-lg h-36 flex items-end overflow-hidden border border-slate-700/30">
                    <motion.div
                      className={`w-full rounded-t-md transition-all duration-200 ${
                        isSelected
                          ? "bg-gradient-to-t from-emerald-600 to-teal-400 shadow-md"
                          : "bg-gradient-to-t from-emerald-500/60 to-teal-400/60 group-hover:from-emerald-500 group-hover:to-teal-400"
                      }`}
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPercent}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.05 }}
                    />
                  </div>

                  {/* Label */}
                  <span className={`text-[10px] font-mono mt-2 text-center truncate w-full ${isSelected ? "text-emerald-400 font-bold" : "text-slate-400"}`}>
                    {week.label.split(" - ")[0]}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-4 border-t border-slate-800/50 pt-2">
            <span>เริ่มต้น ({weeklyData[0]?.label.split(" - ")[0]})</span>
            <span>ปัจจุบัน ({currentWeek?.label.split(" - ")[1]})</span>
          </div>
        </div>
      </div>

      {/* Selected Week Detail Modal/Section */}
      {selectedWeekIdx !== null && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-6 border-t border-slate-800 pt-5"
          id="week-detail-panel"
        >
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-sans font-bold text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-400" />
              รายละเอียดสัปดาห์ที่ {weeklyData[selectedWeekIdx].label}
            </h3>
            <button
              onClick={() => setSelectedWeekIdx(null)}
              className="text-xs text-slate-400 hover:text-slate-200 font-medium font-sans"
            >
              ปิดส่วนนี้
            </button>
          </div>

          {weeklyData[selectedWeekIdx].txs.length === 0 ? (
            <div className="bg-slate-800/30 border border-slate-800/50 text-slate-400 text-xs py-4 px-4 rounded-xl text-center">
              ไม่มีการโอนเงินเข้ามาในช่วงเวลานี้
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800 font-sans">
                    <th className="py-2.5 font-medium">ผู้โอนเงิน</th>
                    <th className="py-2.5 font-medium">วันที่โอน</th>
                    <th className="py-2.5 font-medium">ธนาคาร</th>
                    <th className="py-2.5 font-medium text-right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {weeklyData[selectedWeekIdx].txs.map((tx) => (
                    <tr key={tx.id} className="text-slate-300 hover:bg-slate-800/20 font-sans">
                      <td className="py-2.5">
                        <span className="font-medium text-slate-200">
                          {getMemberDisplayName(tx.memberId, tx.senderNameText)}
                        </span>
                        {tx.isAiParsed && (
                          <span className="ml-1.5 text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/15 font-mono">
                            AI สแกน
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 font-mono text-slate-400">
                        {tx.date} {tx.time}
                      </td>
                      <td className="py-2.5 font-mono text-slate-400">
                        {tx.bank}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-emerald-400">
                        ฿{tx.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

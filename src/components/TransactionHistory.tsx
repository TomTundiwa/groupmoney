import React, { useState } from "react";
import { Transaction, Member } from "../types";
import { FileText, Plus, Search, Trash2, SlidersHorizontal, Sparkles, PlusCircle, Lock, Edit2, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface TransactionHistoryProps {
  transactions: Transaction[];
  members: Member[];
  onAddManualTransaction: (amount: number, memberId: string, bank: string, notes?: string) => void;
  onDeleteTransaction: (id: string) => void;
  onEditTransaction?: (
    id: string,
    amount: number,
    memberId: string,
    bank: string,
    notes?: string,
    date?: string,
    time?: string
  ) => void;
  isLeader?: boolean;
  isGlobalLeader?: boolean;
}

export default function TransactionHistory({
  transactions,
  members,
  onAddManualTransaction,
  onDeleteTransaction,
  onEditTransaction,
  isLeader = false,
  isGlobalLeader = false,
}: TransactionHistoryProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "ai" | "manual">("all");

  // Form states
  const [manualAmount, setManualAmount] = useState<number>(0);
  const [manualMemberId, setManualMemberId] = useState("");
  const [manualBank, setManualBank] = useState("เงินสด");
  const [manualNotes, setManualNotes] = useState("");

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMemberId || manualAmount <= 0) return;
    onAddManualTransaction(manualAmount, manualMemberId, manualBank, manualNotes);

    // Reset fields
    setManualAmount(0);
    setManualMemberId("");
    setManualBank("เงินสด");
    setManualNotes("");
    setShowAddForm(false);
  };

  // Edit States for Transactions
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editMemberId, setEditMemberId] = useState<string>("");
  const [editBank, setEditBank] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editTime, setEditTime] = useState<string>("");

  const handleStartEditTx = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setEditAmount(tx.amount);
    setEditMemberId(tx.memberId);
    setEditBank(tx.bank);
    setEditNotes(tx.notes || "");
    setEditDate(tx.date);
    setEditTime(tx.time || "");
  };

  const handleCancelEditTx = () => {
    setEditingTxId(null);
  };

  const handleSaveEditTx = (id: string) => {
    if (editAmount <= 0) return;
    if (onEditTransaction) {
      onEditTransaction(id, editAmount, editMemberId, editBank, editNotes, editDate, editTime);
    }
    setEditingTxId(null);
  };

  const getMemberNickname = (memberId: string, senderNameText: string) => {
    const member = members.find((m) => m.id === memberId);
    if (member) return member.nickname;
    return senderNameText || "ไม่ระบุชื่อ";
  };

  // Filter & Search Logic
  const filteredTxs = transactions.filter((tx) => {
    const matchesSearch =
      getMemberNickname(tx.memberId, tx.senderNameText).toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.bank.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.notes || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      filterType === "all" ||
      (filterType === "ai" && tx.isAiParsed) ||
      (filterType === "manual" && !tx.isAiParsed);

    return matchesSearch && matchesType;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6" id="transaction-history-section">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-sans font-bold text-slate-100">ประวัติการโอนเงินทั้งหมด</h2>
        </div>
        {isLeader && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 focus:outline-none cursor-pointer"
            id="toggle-manual-tx-btn"
          >
            <Plus className="w-4 h-4" /> บันทึกยอดแมนนวล
          </button>
        )}
      </div>

      {/* Inline Form: Add Manual Transaction */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddSubmit}
            className="bg-slate-800/30 border border-slate-850 p-4 rounded-2xl mb-5 space-y-3 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-2 font-sans">
              <PlusCircle className="w-4 h-4" /> จดบันทึกยอดเงินแบบกรอกมือ (เช่น จ่ายสด/โอนตรง)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-sans">เลือกเพื่อนที่จ่าย</label>
                <select
                  required
                  value={manualMemberId}
                  onChange={(e) => setManualMemberId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                  id="manual-member-select"
                >
                  <option value="" disabled>-- เลือกรายชื่อเพื่อน --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nickname} ({m.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-sans">จำนวนเงิน (บาท)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={manualAmount || ""}
                  onChange={(e) => setManualAmount(Number(e.target.value))}
                  placeholder="เช่น 150"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-sans">ช่องทางจ่ายเงิน</label>
                <input
                  type="text"
                  value={manualBank}
                  onChange={(e) => setManualBank(e.target.value)}
                  placeholder="เช่น เงินสด, โอนบัญชี"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-sans">บันทึกช่วยจำ (ไม่บังคับ)</label>
              <input
                type="text"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="เช่น จ่ายค่าสุกี้ล่วงหน้า"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-sans">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-slate-400 hover:text-slate-200"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition"
              >
                เพิ่มประวัติการจ่าย
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Control Area: Search & Filter Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-center mb-4">
        {/* Search */}
        <div className="relative w-full sm:w-64">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาชื่อเพื่อน, ช่องทาง หรือหมายเหตุ..."
            className="w-full pl-9 pr-4 py-2 bg-slate-800/40 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        {/* Filter Type tabs */}
        <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium font-sans transition ${
              filterType === "all" ? "bg-slate-700 text-emerald-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => setFilterType("ai")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium font-sans transition flex items-center gap-1 ${
              filterType === "ai" ? "bg-slate-700 text-emerald-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> AI สแกนสลิป
          </button>
          <button
            onClick={() => setFilterType("manual")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium font-sans transition ${
              filterType === "manual" ? "bg-slate-700 text-emerald-400" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            กรอกแมนนวล
          </button>
        </div>
      </div>

      {/* Transaction List */}
      {filteredTxs.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs font-sans">
          ไม่มีประวัติการโอนเงินตรงตามที่ค้นหา
        </div>
      ) : (
        <div className="overflow-x-auto" id="transactions-ledger">
          <table className="w-full text-left text-xs text-slate-300">
            <thead>
              <tr className="text-slate-400 border-b border-slate-850 font-sans">
                <th className="py-3 font-medium">ชื่อคนโอนเงิน</th>
                <th className="py-3 font-medium">วันเวลา</th>
                <th className="py-3 font-medium">ช่องทาง/ธนาคาร</th>
                <th className="py-3 font-medium">หมายเหตุ</th>
                <th className="py-3 font-medium text-right">ยอดโอน</th>
                <th className="py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredTxs.map((tx) => (
                editingTxId === tx.id ? (
                  <tr key={tx.id} className="bg-slate-800/30 border border-emerald-500/20 font-sans">
                    {/* Member Select */}
                    <td className="py-2 pr-2" colSpan={1}>
                      <select
                        value={editMemberId}
                        onChange={(e) => setEditMemberId(e.target.value)}
                        className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">-- ไม่ระบุชื่อ --</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nickname} ({m.name})
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* Date & Time */}
                    <td className="py-2 pr-2" colSpan={1}>
                      <div className="flex flex-col gap-1">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] text-slate-100 focus:outline-none focus:border-emerald-500"
                        />
                        <input
                          type="text"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          placeholder="12:00"
                          className="w-full px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </td>
                    {/* Bank/Channel */}
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={editBank}
                        onChange={(e) => setEditBank(e.target.value)}
                        placeholder="ธนาคาร/เงินสด"
                        className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </td>
                    {/* Notes */}
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="หมายเหตุ"
                        className="w-full px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </td>
                    {/* Amount */}
                    <td className="py-2 pr-2 text-right">
                      <input
                        type="number"
                        step="any"
                        value={editAmount}
                        onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                        className="w-20 px-1.5 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-right font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                      />
                    </td>
                    {/* Action buttons */}
                    <td className="py-2 text-right pl-2 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSaveEditTx(tx.id)}
                          className="p-1 bg-emerald-500 text-slate-950 rounded hover:bg-emerald-400 transition"
                          title="บันทึก"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleCancelEditTx}
                          className="p-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition"
                          title="ยกเลิก"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={tx.id} className="hover:bg-slate-800/10 font-sans group">
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">
                          {getMemberNickname(tx.memberId, tx.senderNameText)}
                        </span>
                        {tx.isAiParsed ? (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/15 font-mono">
                            AI
                          </span>
                        ) : (
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700/50 font-mono">
                            Manual
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-2 font-mono text-slate-400 whitespace-nowrap">
                      {tx.date} {tx.time}
                    </td>
                    <td className="py-3 pr-2 text-slate-400 font-mono">
                      {tx.bank}
                    </td>
                    <td className="py-3 pr-2 text-slate-400 truncate max-w-[150px]" title={tx.notes}>
                      {tx.notes || "-"}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold text-emerald-400">
                      ฿{tx.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 text-right pl-2">
                      {isLeader && (
                        <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleStartEditTx(tx)}
                            className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition duration-150"
                            title="แก้ไขรายการ"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteTransaction(tx.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition duration-150"
                            title="ลบรายการโอน"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

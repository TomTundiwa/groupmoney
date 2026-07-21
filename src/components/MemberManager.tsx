import React, { useState } from "react";
import { Member, Transaction } from "../types";
import { Users, Plus, Search, ChevronRight, UserCheck, AlertTriangle, Sparkles, Trash2, Lock, Edit2, Check, X, Calendar, Clock, Landmark, CreditCard, Info, Award, ArrowRightLeft, Coins, History } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { calculateMemberCarryover, MemberCarryoverResult } from "../lib/carryover";

interface MemberManagerProps {
  members: Member[];
  transactions: Transaction[];
  targetAmountPerMember: number;
  groupCreatedAt: string;
  onAddMember: (name: string, nickname: string) => void;
  onDeleteMember: (id: string) => void;
  onEditMember?: (id: string, name: string, nickname: string, newTotalPaid?: number) => void;
  isLeader?: boolean;
  isGlobalLeader?: boolean;
  profileMemberId?: string;
  profileEmoji?: string;
  profileNickname?: string;
}

export default function MemberManager({
  members,
  transactions,
  targetAmountPerMember,
  groupCreatedAt,
  onAddMember,
  onDeleteMember,
  onEditMember,
  isLeader = false,
  isGlobalLeader = false,
  profileMemberId = "",
  profileEmoji = "🦊",
  profileNickname = "",
}: MemberManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"default" | "unpaid" | "paid" | "alphabetical">("default");

  // Edit States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editTotalPaid, setEditTotalPaid] = useState<number | string>(0);

  const handleStartEdit = (m: any) => {
    setEditingId(m.id);
    setEditName(m.name);
    setEditNickname(m.nickname);
    setEditTotalPaid(m.totalPaid || 0);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditNickname("");
    setEditTotalPaid(0);
  };

  const handleSaveEdit = (id: string) => {
    if (!editNickname.trim()) return;
    if (onEditMember) {
      const parsedAmount = typeof editTotalPaid === "string" ? parseFloat(editTotalPaid) : editTotalPaid;
      onEditMember(
        id,
        editName.trim() || editNickname.trim(),
        editNickname.trim(),
        isNaN(parsedAmount) ? 0 : parsedAmount
      );
    }
    handleCancelEdit();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    onAddMember(nameInput.trim(), nicknameInput.trim() || nameInput.trim());
    setNameInput("");
    setNicknameInput("");
    setShowAddForm(false);
  };

  // Compute payment statistics for each member with weekly rollover/carryover
  const memberListWithStats = members.map((member) => {
    const carryoverResult = calculateMemberCarryover(
      member.id,
      transactions,
      targetAmountPerMember,
      groupCreatedAt
    );
    const memberTxs = transactions.filter((t) => t.memberId === member.id);

    return {
      ...member,
      totalPaid: carryoverResult.totalPaidAllTime,
      isPaidFully: carryoverResult.currentWeekStatus.isPaidFully,
      isPartial: carryoverResult.currentWeekStatus.available > 0 && !carryoverResult.currentWeekStatus.isPaidFully,
      txCount: memberTxs.length,
      carryover: carryoverResult,
    };
  });

  const filteredMembers = memberListWithStats.filter((m) => {
    const term = searchTerm.toLowerCase();
    return (
      m.name.toLowerCase().includes(term) ||
      m.nickname.toLowerCase().includes(term)
    );
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (sortBy === "paid") {
      // Paid fully first
      if (a.isPaidFully && !b.isPaidFully) return -1;
      if (!a.isPaidFully && b.isPaidFully) return 1;
      // Partial vs Unpaid (Partial first)
      if (a.isPartial && !b.isPartial) return -1;
      if (!a.isPartial && b.isPartial) return 1;
      return 0;
    }
    if (sortBy === "unpaid") {
      // Unpaid / Not paid fully first (deficit first)
      if (!a.isPaidFully && b.isPaidFully) return -1;
      if (a.isPaidFully && !b.isPaidFully) return 1;
      // Completely Unpaid (not partial) first
      if (!a.isPartial && b.isPartial) return -1;
      if (a.isPartial && !b.isPartial) return 1;
      return 0;
    }
    if (sortBy === "alphabetical") {
      return a.nickname.localeCompare(b.nickname, "th");
    }
    return 0; // "default" preserves database / original group order
  });

  const selectedMember = memberListWithStats.find((m) => m.id === selectedMemberId);
  const selectedMemberTxs = selectedMember
    ? transactions.filter((t) => t.memberId === selectedMember.id)
    : [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6" id="member-manager-section">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-sans font-bold text-slate-100">สมาชิกกลุ่ม ({members.length})</h2>
        </div>
        {isLeader && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 focus:outline-none cursor-pointer"
            id="toggle-add-member-btn"
          >
            <Plus className="w-4 h-4" /> เพิ่มรายชื่อเพื่อน
          </button>
        )}
      </div>

      {/* Inline Add Member Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="bg-slate-800/30 border border-slate-850 p-4 rounded-2xl mb-4 space-y-3 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-sans">ชื่อเล่น (ใช้ในก๊วน)</label>
                <input
                  type="text"
                  required
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="เช่น พี่ป๊อบ, น้องโอม"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-sans">ชื่อจริง (เพื่อเช็คกับสลิป)</label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="เช่น สมชาย ดีมาก"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
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
                บันทึกรายชื่อ
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Search Input */}
      <div className="relative mb-3">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="ค้นหาชื่อเพื่อนหรือชื่อเล่น..."
          className="w-full pl-9 pr-4 py-2 bg-slate-800/40 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Modern Sorting Options Segment Control */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 text-[11px] font-sans text-slate-400 bg-slate-950/40 p-1.5 rounded-xl border border-slate-850">
        <span className="pl-1 mr-1 text-slate-500 font-medium">เรียงลำดับ:</span>
        <button
          type="button"
          onClick={() => setSortBy("default")}
          className={`px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer ${
            sortBy === "default"
              ? "bg-slate-800 text-slate-100 font-semibold shadow-sm border border-slate-700"
              : "text-slate-400 border border-transparent hover:text-slate-200"
          }`}
        >
          ทั่วไป
        </button>
        <button
          type="button"
          onClick={() => setSortBy("unpaid")}
          className={`px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1 ${
            sortBy === "unpaid"
              ? "bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20"
              : "text-slate-400 border border-transparent hover:text-slate-200"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          ยังไม่จ่ายก่อน
        </button>
        <button
          type="button"
          onClick={() => setSortBy("paid")}
          className={`px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer flex items-center gap-1 ${
            sortBy === "paid"
              ? "bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20"
              : "text-slate-400 border border-transparent hover:text-slate-200"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          จ่ายแล้วก่อน
        </button>
        <button
          type="button"
          onClick={() => setSortBy("alphabetical")}
          className={`px-2.5 py-1 rounded-lg transition-all duration-150 cursor-pointer ${
            sortBy === "alphabetical"
              ? "bg-slate-800 text-slate-100 font-semibold shadow-sm border border-slate-700"
              : "text-slate-400 border border-transparent hover:text-slate-200"
          }`}
        >
          ก-ฮ
        </button>
      </div>

      {/* Member Items Grid/List */}
      {sortedMembers.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
          ยังไม่มีรายชื่อสมาชิกในกลุ่มนี้
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1" id="members-list">
          {sortedMembers.map((m) => (
            editingId === m.id ? (
              <div
                key={m.id}
                className="flex flex-col gap-2 p-3 bg-slate-800/20 border border-emerald-500/30 rounded-2xl transition"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-slate-400 mb-0.5">ชื่อเล่น</label>
                    <input
                      type="text"
                      value={editNickname}
                      onChange={(e) => setEditNickname(e.target.value)}
                      placeholder="ชื่อเล่น"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400 mb-0.5">ยอดเงินที่จ่ายแล้ว (฿)</label>
                    <input
                      type="number"
                      step="any"
                      value={editTotalPaid}
                      onChange={(e) => setEditTotalPaid(e.target.value)}
                      placeholder="ยอดโอนสะสม"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-emerald-400 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 mb-0.5">ชื่อจริงสำหรับตรวจสอบสลิป</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="ชื่อจริง (ใช้ตรวจสลิป)"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    onClick={handleCancelEdit}
                    className="p-1 px-2 text-slate-400 hover:text-slate-200 text-[10px] font-medium flex items-center gap-1 rounded hover:bg-slate-700/50 transition"
                  >
                    <X className="w-3 h-3" /> ยกเลิก
                  </button>
                  <button
                    onClick={() => handleSaveEdit(m.id)}
                    className="p-1 px-2.5 bg-emerald-500 text-slate-950 text-[10px] font-bold flex items-center gap-1 rounded hover:bg-emerald-400 transition"
                  >
                    <Check className="w-3 h-3" /> บันทึก
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                onClick={() => setSelectedMemberId(m.id)}
                className="flex items-center justify-between p-3 bg-slate-800/10 hover:bg-slate-800/30 border border-slate-800/80 hover:border-slate-700 rounded-2xl cursor-pointer transition group"
                title="คลิกเพื่อดูข้อมูลสมาชิกและประวัติการโอนอย่างละเอียด"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Visual Status Avatar */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold font-sans text-xs flex-shrink-0 transition group-hover:scale-105 ${
                      m.isPaidFully
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : m.isPartial
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-700/50"
                    }`}
                  >
                    {m.id === profileMemberId ? (profileEmoji || "🦊") : m.nickname.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-emerald-400 transition">{m.nickname}</p>
                      {m.id === profileMemberId && (
                        <span className="text-[9px] font-sans font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/25 px-1.5 py-0.5 rounded shrink-0">
                          คุณ (Me)
                        </span>
                      )}
                      {m.name !== m.nickname && (
                        <p className="text-[10px] text-slate-500 truncate">({m.name})</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      <p className="text-[10px] font-mono text-slate-400">
                        สัปดาห์นี้: ฿{m.carryover.currentWeekStatus.available.toLocaleString("th-TH")} / ฿{targetAmountPerMember.toLocaleString("th-TH")}
                      </p>
                      {m.carryover.currentWeekStatus.carriedIn > 0 && (
                        <span className="text-[9px] font-sans text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded w-fit">
                          💰 ทบมาจากสัปดาห์ก่อน ฿{m.carryover.currentWeekStatus.carriedIn.toLocaleString("th-TH")}
                        </span>
                      )}
                      {m.carryover.currentWeekStatus.carriedIn < 0 && (
                        <span className="text-[9px] font-sans text-rose-400 bg-rose-500/5 border border-rose-500/10 px-1.5 py-0.5 rounded w-fit flex items-center gap-1">
                          ⚠️ ค้างทบมาจากสัปดาห์ก่อน ฿{Math.abs(m.carryover.currentWeekStatus.carriedIn).toLocaleString("th-TH")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Pill and Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.isPaidFully ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[9px] font-sans font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <UserCheck className="w-3 h-3" /> ครบถ้วน
                      </span>
                      {m.carryover.currentWeekStatus.carriedOut > 0 && (
                        <span className="text-[8px] text-emerald-300 font-mono">
                          ทบถัดไป ฿{m.carryover.currentWeekStatus.carriedOut.toLocaleString("th-TH")}
                        </span>
                      )}
                    </div>
                  ) : m.isPartial ? (
                    <span className="text-[9px] font-sans font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" /> ค้าง ฿{m.carryover.currentWeekStatus.deficit.toLocaleString("th-TH")}
                    </span>
                  ) : (
                    <span className="text-[9px] font-sans font-bold text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                      ยังไม่โอน
                    </span>
                  )}

                  {isLeader ? (
                    <div className="flex items-center gap-0.5 border-l border-slate-800 pl-1.5 ml-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(m);
                        }}
                        className="p-1 text-slate-500 hover:text-emerald-400 rounded-lg hover:bg-emerald-500/10 transition"
                        title="แก้ไขชื่อและยอดเงินสะสมของสมาชิก"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteMember(m.id);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                        title="ลบรายชื่อ"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition ml-1" />
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Memory Hint Footnote */}
      <div className="mt-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 flex items-start gap-2 text-[10px] text-slate-400 leading-relaxed font-sans">
        <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-300">ระบบจำชื่อผู้โอนอัตโนมัติ:</span>{" "}
          หากอัปเดตชื่อจริงให้ตรงกับข้อมูลที่สแกนจากสลิปธนาคารครั้งแรก ครั้งต่อไป AI
          จะทำการแมตช์สลิปเข้ากับรายชื่อเพื่อนคนนั้นโดยอัตโนมัติทันที
        </div>
      </div>

      {/* Member Details Modal */}
      <AnimatePresence>
        {selectedMemberId && selectedMember && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl text-slate-100 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg font-sans ${
                      selectedMember.isPaidFully
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : selectedMember.isPartial
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-slate-800 text-slate-400 border border-slate-750"
                    }`}
                  >
                    {selectedMember.nickname.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5 font-sans">
                      {selectedMember.nickname}
                      {selectedMember.isPaidFully && (
                        <Award className="w-4 h-4 text-amber-400" title="จ่ายครบก๊วนแล้ว" />
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 font-sans">
                      ชื่อจริง: {selectedMember.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMemberId(null)}
                  className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="flex-1 overflow-y-auto space-y-5 pr-1 font-sans">
                {/* Visual Progress Status */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-sans">ความคืบหน้าการชำระเงินสัปดาห์นี้</span>
                    <span className={`font-bold font-mono ${selectedMember.isPaidFully ? "text-emerald-400" : "text-amber-400"}`}>
                      {Math.max(0, Math.min(100, Math.round((selectedMember.carryover.currentWeekStatus.available / targetAmountPerMember) * 100)))}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedMember.isPaidFully ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, (selectedMember.carryover.currentWeekStatus.available / targetAmountPerMember) * 100))}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                    <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50">
                      <p className="text-[10px] text-slate-400">โอนจริงสัปดาห์นี้</p>
                      <p className="text-xs font-bold font-mono text-slate-200 mt-0.5">
                        ฿{selectedMember.carryover.currentWeekStatus.rawPaidThisWeek.toLocaleString("th-TH")}
                      </p>
                    </div>
                    <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50">
                      <p className="text-[10px] text-slate-400">
                        {selectedMember.carryover.currentWeekStatus.carriedIn >= 0 ? "เงินทบสะสมมา" : "ยอดค้างสะสมมา"}
                      </p>
                      <p className={`text-xs font-bold font-mono mt-0.5 ${selectedMember.carryover.currentWeekStatus.carriedIn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {selectedMember.carryover.currentWeekStatus.carriedIn >= 0 ? "+" : ""}฿{selectedMember.carryover.currentWeekStatus.carriedIn.toLocaleString("th-TH")}
                      </p>
                    </div>
                    <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50">
                      <p className="text-[10px] text-slate-400">ยอดรวมสัปดาห์นี้</p>
                      <p className={`text-xs font-bold font-mono mt-0.5 ${selectedMember.carryover.currentWeekStatus.available >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ฿{selectedMember.carryover.currentWeekStatus.available.toLocaleString("th-TH")}
                      </p>
                    </div>
                  </div>

                  {selectedMember.isPaidFully ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5 justify-center font-semibold">
                        <Sparkles className="w-4 h-4 animate-spin-slow" /> จ่ายครบถ้วนสัปดาห์นี้แล้ว ขอบคุณน้า! 🎉
                      </div>
                      {selectedMember.carryover.currentWeekStatus.carriedOut > 0 && (
                        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] py-1.5 px-3 rounded-xl flex items-center gap-1.5 justify-center">
                          <Coins className="w-4 h-4 text-amber-400" />
                          <span>มียอดเงินโอนเกินสะสมทบไปสัปดาห์หน้า: <strong className="text-emerald-400">฿{selectedMember.carryover.currentWeekStatus.carriedOut.toLocaleString("th-TH")}</strong></span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs py-2 px-3 rounded-xl flex items-center gap-1.5 justify-center font-medium">
                      <AlertTriangle className="w-4 h-4" /> ยังค้างสัปดาห์นี้อีก ฿{(selectedMember.carryover.currentWeekStatus.deficit).toLocaleString("th-TH")} (เป้าสัปดาห์ละ ฿{targetAmountPerMember.toLocaleString("th-TH")})
                    </div>
                  )}
                </div>

                {/* Rollover / Carryover History Timeline */}
                <div className="bg-slate-950/20 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-400" />
                    ประวัติการทบยอดเงินรายสัปดาห์ ({selectedMember.carryover.weeksHistory.length})
                  </h4>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {selectedMember.carryover.weeksHistory.map((week, idx) => {
                      const isLast = idx === selectedMember.carryover.weeksHistory.length - 1;
                      return (
                        <div key={idx} className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              สัปดาห์ที่ {idx + 1}: {week.label}
                              {isLast && (
                                <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1 py-0.2 rounded">สัปดาห์ปัจจุบัน</span>
                              )}
                            </span>
                            {week.isPaidFully ? (
                              <span className="text-[9px] font-sans font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                                ครบถ้วน
                              </span>
                            ) : (
                              <span className="text-[9px] font-sans font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full">
                                ค้าง ฿{week.deficit.toLocaleString("th-TH")}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-400 border-t border-slate-800/40 pt-1.5 font-sans">
                            <div className="flex items-center justify-between">
                              <span>ยอดโอนจริงสัปดาห์นี้:</span>
                              <span className="font-mono text-slate-200">฿{week.rawPaid}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{week.carriedIn >= 0 ? "ยกมาจากสัปดาห์ก่อน:" : "ยอดค้างจากสัปดาห์ก่อน:"}</span>
                              <span className={`font-mono ${week.carriedIn >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {week.carriedIn >= 0 ? `+฿${week.carriedIn.toLocaleString("th-TH")}` : `-฿${Math.abs(week.carriedIn).toLocaleString("th-TH")}`}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>เป้าหมายประจำสัปดาห์:</span>
                              <span className="font-mono text-slate-300">฿{week.target}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>รวมยอดที่มีในระบบ:</span>
                              <span className={`font-mono ${week.available >= 0 ? "text-slate-200" : "text-rose-400"}`}>
                                ฿{week.available.toLocaleString("th-TH")}
                              </span>
                            </div>
                          </div>

                          {week.carriedOut > 0 && (
                            <div className="bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 text-[10px] py-1 px-2 rounded-lg flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <ArrowRightLeft className="w-3 h-3 text-emerald-400" />
                                <span>ยอดเงินส่วนเกินโอนสะสมทบไป:</span>
                              </span>
                              <strong className="font-mono">฿{week.carriedOut}</strong>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Slip AI Auto Match Details */}
                <div className="bg-slate-950/20 border border-slate-850 p-3.5 rounded-2xl space-y-2 text-xs">
                  <h4 className="font-bold text-slate-200 flex items-center gap-1.5 font-sans">
                    <Info className="w-4 h-4 text-emerald-400" /> ข้อมูลสำหรับการสแกนสลิปด้วย AI
                  </h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed font-sans">
                    เมื่ออัปโหลดสลิปที่โอนโดยคุณ <strong className="text-slate-200">"{selectedMember.name}"</strong> ระบบ AI สลิปบัดดี้จะทำการสแกนชื่อผู้โอนในสลิปและจับคู่เข้ากับบัญชีนี้โดยอัตโนมัติทันที
                  </p>
                  {isLeader && (
                    <div className="pt-1">
                      <button
                        onClick={() => {
                          handleStartEdit(selectedMember);
                          setSelectedMemberId(null);
                        }}
                        className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 focus:outline-none"
                      >
                        <Edit2 className="w-3 h-3" /> แก้ไขชื่อหรือยอดโอนสะสมโดยหัวหน้ากลุ่ม
                      </button>
                    </div>
                  )}
                </div>

                {/* Member Transactions */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    ประวัติการทำรายการ ({selectedMemberTxs.length})
                  </h4>

                  {selectedMemberTxs.length === 0 ? (
                    <div className="text-center py-8 bg-slate-950/30 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs font-sans">
                      ยังไม่มีรายการโอนเงินในกลุ่มนี้
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {selectedMemberTxs.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 bg-slate-950/40 border border-slate-800/60 rounded-xl text-xs hover:border-slate-800 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-emerald-400 flex-shrink-0">
                              <Landmark className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-200 truncate">
                                โอนผ่าน {tx.bank || "ธนาคาร"}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-2.5 h-2.5" /> {tx.date}
                                </span>
                                <span className="flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" /> {tx.time}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0 pl-2">
                            <p className="font-bold font-mono text-emerald-400 text-xs">
                              +฿{tx.amount.toLocaleString("th-TH")}
                            </p>
                            {tx.isAiParsed ? (
                              <span className="text-[8px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-1 py-0.2 rounded font-sans">
                                AI สแกนผ่าน
                              </span>
                            ) : (
                              <span className="text-[8px] font-semibold text-slate-500 bg-slate-850 border border-slate-800 px-1 py-0.2 rounded font-sans">
                                คีย์มือ
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-slate-800 pt-4 mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedMemberId(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs transition"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

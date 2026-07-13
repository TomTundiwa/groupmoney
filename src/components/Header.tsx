import React, { useState } from "react";
import { Group, Member, Transaction } from "../types";
import { Plus, Users, Landmark, PiggyBank, Target, ChevronDown, Lock, Unlock, ShieldAlert, ShieldCheck, Trash2, Key, Copy, Check, Smartphone, RefreshCw, Laptop } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface HeaderProps {
  groups: Group[];
  activeGroupId: string;
  onGroupChange: (groupId: string) => void;
  onAddGroup: (name: string, targetPerPerson: number, description?: string, passcode?: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onJoinGroupWithPasscode?: (passcode: string) => { success: boolean; groupName?: string; error?: string };
  members: Member[];
  transactions: Transaction[];
  isLeader: boolean;
  onDeleteActiveGroup?: () => void;
  createdGroupIds?: string[];
  deviceId?: string;
  onSyncDevice?: (targetDeviceId: string) => Promise<{ success: boolean; error?: string }>;
}

export default function Header({
  groups,
  activeGroupId,
  onGroupChange,
  onAddGroup,
  onJoinGroupWithPasscode,
  members,
  transactions,
  isLeader,
  onDeleteActiveGroup,
  createdGroupIds = [],
  deviceId = "",
  onSyncDevice,
}: HeaderProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTarget, setNewGroupTarget] = useState<number>(200);
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupPasscode, setNewGroupPasscode] = useState("");
  const [createGroupError, setCreateGroupError] = useState("");
  const [showSelector, setShowSelector] = useState(false);

  // Device states
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [syncDeviceInput, setSyncDeviceInput] = useState("");
  const [syncDeviceError, setSyncDeviceError] = useState("");
  const [syncDeviceSuccess, setSyncDeviceSuccess] = useState(false);
  const [copiedDeviceId, setCopiedDeviceId] = useState(false);

  // Join group states
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinPasscode, setJoinPasscode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");

  // Copy passcode state
  const [copiedPasscode, setCopiedPasscode] = useState(false);

  // Reset System States
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetSuccess, setShowResetSuccess] = useState(false);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const result = await onAddGroup(newGroupName, newGroupTarget, newGroupDesc, newGroupPasscode);
    if (result.success) {
      setNewGroupName("");
      setNewGroupTarget(200);
      setNewGroupDesc("");
      setNewGroupPasscode("");
      setCreateGroupError("");
      setShowAddModal(false);
    } else {
      setCreateGroupError(result.error || "เกิดข้อผิดพลาดในการสร้างกลุ่ม");
    }
  };

  const handleJoinGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinPasscode.trim()) return;
    if (onJoinGroupWithPasscode) {
      const result = onJoinGroupWithPasscode(joinPasscode);
      if (result.success) {
        setJoinSuccess(result.groupName || "สำเร็จ");
        setJoinError("");
        setTimeout(() => {
          setShowJoinModal(false);
          setJoinSuccess("");
          setJoinPasscode("");
        }, 1500);
      } else {
        setJoinError(result.error || "ไม่สามารถเข้าร่วมกลุ่มได้");
        setJoinSuccess("");
      }
    }
  };

  const handleConfirmDeleteGroup = () => {
    if (onDeleteActiveGroup) {
      onDeleteActiveGroup();
    }
    setShowResetConfirm(false);
    setShowResetSuccess(true);
  };

  // Calculate Stats
  const totalCollected = transactions.reduce((sum, t) => sum + t.amount, 0);

  // Group members payment tracking: a member is paid if they have any transaction
  const paidMembersCount = members.filter((m) =>
    transactions.some((t) => t.memberId === m.id)
  ).length;

  const totalMembers = members.length;
  const targetPerPerson = activeGroup?.targetAmountPerMember || 0;
  const totalTarget = totalMembers * targetPerPerson;
  const progressPercent = totalTarget > 0 ? Math.min(Math.round((totalCollected / totalTarget) * 100), 100) : 0;

  return (
    <header className="w-full bg-slate-900 border-b border-slate-800 text-slate-100 py-6" id="app-header">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        {/* Top bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-inner">
              <Landmark className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-sans font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                สลิปบัดดี้ (SlipBuddy)
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                ระบบจัดการเงินกลุ่ม &amp; ตรวจสลิปด้วย AI
              </p>
            </div>
          </div>

          {/* Group Selector */}
          <div className="relative flex flex-wrap items-center gap-2">
            <div className="text-right hidden lg:block">
              <p className="text-xs text-slate-400">กลุ่มก๊วนที่เลือก</p>
              <p className="text-sm font-medium text-emerald-400 truncate max-w-[120px]">{activeGroup?.name || "ยังไม่มีกลุ่ม"}</p>
            </div>

            <button
              onClick={() => setShowSelector(!showSelector)}
              className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl transition duration-200 text-sm font-medium focus:outline-none"
              id="group-select-btn"
            >
              <span className="truncate max-w-[100px] sm:max-w-[180px]">{activeGroup?.name || "เลือกกลุ่ม..."}</span>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {activeGroup?.passcode && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 flex items-center gap-1.5 text-xs font-mono shrink-0">
                <span className="text-slate-400 hidden sm:inline">รหัสก๊วน:</span>
                <span className="text-amber-400 font-bold tracking-wider">{activeGroup.passcode}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(activeGroup.passcode || "");
                    setCopiedPasscode(true);
                    setTimeout(() => setCopiedPasscode(false), 2000);
                  }}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                  title="คัดลอกรหัสกลุ่มเพื่อแชร์ให้เพื่อน"
                >
                  {copiedPasscode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            <button
              onClick={() => {
                setShowAddModal(true);
              }}
              className="p-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition-all duration-200 hover:scale-105 shadow-md flex items-center gap-1.5 text-sm cursor-pointer"
              title="สร้างกลุ่มใหม่"
              id="new-group-btn"
            >
              <Plus className="w-5 h-5 shrink-0" />
              <span className="hidden sm:inline">กลุ่มใหม่</span>
            </button>

             {/* Leader Badge & Reset System */}
             <div className="flex flex-wrap items-center gap-1.5 ml-1">
               {deviceId && (
                 <button
                   onClick={() => setShowDeviceModal(true)}
                   className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700/80 text-emerald-400 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm transition cursor-pointer"
                   title="ข้อมูลระบบอุปกรณ์ & กู้คืน"
                 >
                   <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                   <span className="hidden md:inline">จำเครื่องแล้ว:</span>
                   <span>{deviceId}</span>
                 </button>
               )}

               {isLeader ? (
                 <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm">
                   <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                   <span>👑 หัวหน้าก๊วน</span>
                 </div>
               ) : null}

               {onDeleteActiveGroup && isLeader && (
                 <button
                   onClick={() => setShowResetConfirm(true)}
                   className="flex items-center gap-1 px-2.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-sans font-bold transition focus:outline-none cursor-pointer"
                   title="ลบเซิฟเวอร์นี้ออกจากระบบ"
                 >
                   <Trash2 className="w-3.5 h-3.5" />
                   <span>ลบเซิฟเวอร์นี้</span>
                 </button>
               )}
             </div>

            {/* Dropdown Selector */}
            <AnimatePresence>
              {showSelector && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSelector(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 top-full mt-2 w-72 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-2.5 z-20"
                  >
                    <div className="px-3 py-2 border-b border-slate-700/50 mb-1 flex justify-between items-center">
                      <p className="text-xs font-mono text-slate-400">สลับก๊วนเก็บเงิน</p>
                      {createdGroupIds.includes(activeGroupId) && (
                        <span className="text-[10px] text-emerald-500 font-sans font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          คุณเป็นหัวหน้าก๊วนนี้
                        </span>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {groups.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-4">ไม่มีกลุ่มที่มองเห็น</p>
                      ) : (
                        groups.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => {
                              onGroupChange(g.id);
                              setShowSelector(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition duration-150 ${
                              g.id === activeGroupId
                                ? "bg-emerald-500/10 text-emerald-400 font-semibold border-l-2 border-emerald-500"
                                : "hover:bg-slate-700/50 text-slate-300"
                            }`}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <div className="flex flex-col truncate">
                                <span className="truncate flex items-center gap-1">
                                  {g.name}
                                  {g.passcode && (
                                    <Key className="w-3 h-3 text-amber-400 shrink-0" title="กลุ่มล็อกรหัสผ่าน" />
                                  )}
                                </span>
                                {createdGroupIds.includes(g.id) && g.passcode && (
                                  <span className="text-[10px] text-amber-400 font-mono font-medium truncate">
                                    รหัสเข้ากลุ่ม: {g.passcode}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded shrink-0">
                                ฿{g.targetAmountPerMember}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t border-slate-700/50 mt-2 pt-2">
                      <button
                        onClick={() => {
                          setShowJoinModal(true);
                          setShowSelector(false);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/20 rounded-xl transition"
                      >
                        <Key className="w-3.5 h-3.5 text-emerald-400" />
                        <span>เข้าร่วมกลุ่มด้วยรหัสผ่าน</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Stats Summary Panel */}
        {activeGroup && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8" id="stats-panel">
            {/* Stat 1: Total Collected */}
            <div className="bg-slate-800/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/10">
                <PiggyBank className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-sans">เก็บยอดทั้งหมดได้</p>
                <p className="text-xl md:text-2xl font-bold text-slate-100 mt-0.5 font-mono">
                  ฿{totalCollected.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Stat 2: Progress */}
            <div className="bg-slate-800/40 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-xs text-slate-400 font-sans">ความคืบหน้า</p>
                <span className="text-xs font-mono font-bold text-emerald-400">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                <motion.div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-mono text-right">
                เป้าหมายกลุ่ม: ฿{totalTarget.toLocaleString("th-TH")}
              </p>
            </div>

            {/* Stat 3: Target per Head */}
            <div className="bg-slate-800/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-3 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/10">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-sans">เป้าหมายรายหัว</p>
                <p className="text-xl md:text-2xl font-bold text-slate-100 mt-0.5 font-mono">
                  ฿{targetPerPerson.toLocaleString("th-TH")}
                </p>
              </div>
            </div>

            {/* Stat 4: Member payment ratio */}
            <div className="bg-slate-800/40 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/10">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-sans">สถานะโอนเงินแล้ว</p>
                <p className="text-xl md:text-2xl font-bold text-slate-100 mt-0.5 font-mono">
                  {paidMembersCount} / {totalMembers} คน
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add New Group Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl text-slate-100"
            >
              <h3 className="text-lg font-bold text-slate-100 mb-4 font-sans flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" /> สร้างกลุ่มก๊วนใหม่
              </h3>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    ชื่อกลุ่ม / จุดประสงค์เก็บตังค์
                  </label>
                  <input
                    type="text"
                    required
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="เช่น ค่าทริปพัทยา, หารหมูกระทะวันศุกร์"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-slate-100 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    เป้าหมายเก็บตังค์ต่อคน (บาท)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newGroupTarget || ""}
                    onChange={(e) => setNewGroupTarget(Number(e.target.value))}
                    placeholder="200"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-slate-100 transition font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    คำอธิบายเพิ่มเติม (ไม่บังคับ)
                  </label>
                  <textarea
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="เช่น หารค่าที่พัก 3 วัน 2 คืน คืนรวมอาหารเช้า"
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-slate-100 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-400" /> รหัสผ่านเข้ากลุ่ม (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={newGroupPasscode}
                    onChange={(e) => setNewGroupPasscode(e.target.value)}
                    placeholder="เช่น 1234 หรือ MyGroup99 (ว่างไว้หากเป็นกลุ่มสาธารณะ)"
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-slate-100 transition font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    หากตั้งรหัสไว้ สมาชิกคนอื่นจะต้องป้อนรหัสนี้เพื่อค้นหาและเข้าร่วมกลุ่ม
                  </p>
                </div>

                {createGroupError && (
                  <p className="text-xs text-rose-400 font-sans text-center">
                    ⚠️ {createGroupError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setCreateGroupError("");
                    }}
                    className="px-4 py-2 text-slate-400 hover:text-slate-200 transition text-sm font-medium"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-sm transition"
                  >
                    สร้างกลุ่ม
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Custom Delete Group Confirmation Modal */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl text-slate-100"
            >
              <div className="flex items-center gap-3 mb-4 text-rose-400">
                <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/15">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-sans">ยืนยันลบเซิฟเวอร์นี้?</h3>
                  <p className="text-[11px] text-rose-400/80 font-mono mt-0.5">DELETE ACTIVE GROUP</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-300 font-sans mb-6">
                <p>
                  คุณกำลังจะลบเซิฟเวอร์ <strong className="text-rose-400 font-semibold">"{activeGroup?.name}"</strong> พร้อมรายชื่อสมาชิกและประวัติการโอนเงินทั้งหมดภายในกลุ่มนี้อย่างถาวร
                </p>
                <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 text-xs text-rose-300/90 leading-relaxed">
                  ⚠️ <strong>คำเตือน:</strong> การดำเนินการนี้ไม่สามารถย้อนกลับได้ ข้อมูลทั้งหมดจะหายไปอย่างถาวร
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 font-sans">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-slate-200 transition text-sm font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteGroup}
                  className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-slate-100 rounded-xl font-bold text-sm transition shadow-lg shadow-rose-950/50 cursor-pointer"
                >
                  ใช่, ลบเซิฟเวอร์นี้
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Custom Delete Group Success Modal */}
        {showResetSuccess && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-6 shadow-2xl text-slate-100 text-center"
            >
              <div className="mx-auto w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center border border-emerald-500/20 mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 font-sans mb-2">ลบเซิฟเวอร์เสร็จสิ้น!</h3>
              <p className="text-xs text-slate-400 font-sans mb-6 leading-relaxed">
                เซิฟเวอร์นี้และข้อมูลทั้งหมดภายในกลุ่มถูกลบออกจากระบบของคุณเรียบร้อยแล้วครับ 🚀
              </p>
              <button
                type="button"
                onClick={() => setShowResetSuccess(false)}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-sm transition focus:outline-none cursor-pointer"
              >
                ตกลง
              </button>
            </motion.div>
          </div>
        )}

        {/* Join Group with Passcode Modal */}
        {showJoinModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-sm p-6 shadow-2xl text-slate-100"
            >
              <div className="flex items-center gap-3 mb-4 text-emerald-400">
                <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/15">
                  <Key className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-sans">เข้าร่วมกลุ่มด้วยรหัสผ่าน</h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">UNLOCK SECRET GROUP</p>
                </div>
              </div>

              {joinSuccess ? (
                <div className="text-center py-6 font-sans">
                  <div className="mx-auto w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center border border-emerald-500/20 mb-3 animate-bounce">
                    <Check className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 mb-1">เข้าร่วมกลุ่มสำเร็จ!</h4>
                  <p className="text-xs text-emerald-400 font-semibold truncate max-w-[250px] mx-auto">
                    กลุ่ม "{joinSuccess}"
                  </p>
                </div>
              ) : (
                <form onSubmit={handleJoinGroupSubmit} className="space-y-4 font-sans">
                  <p className="text-xs text-slate-300 font-sans leading-relaxed">
                    ป้อนรหัสผ่านที่ได้รับจากเพื่อนเพื่อค้นหาและเข้าร่วมกลุ่มก๊วนเก็บเงิน
                  </p>
                  <div>
                    <input
                      type="text"
                      required
                      value={joinPasscode}
                      onChange={(e) => setJoinPasscode(e.target.value)}
                      placeholder="ป้อนรหัสผ่านเข้ากลุ่ม"
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-center text-lg font-mono tracking-wider focus:outline-none focus:border-emerald-500 text-slate-100 transition"
                      autoFocus
                    />
                  </div>

                  {joinError && (
                    <p className="text-[11px] text-rose-400 font-sans text-center">
                      ⚠️ {joinError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowJoinModal(false);
                        setJoinError("");
                        setJoinPasscode("");
                      }}
                      className="px-4 py-2 text-slate-400 hover:text-slate-200 transition text-sm font-medium"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-sm transition"
                    >
                      ค้นหา &amp; เข้าร่วม
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}

        {/* Device ID / Sync Modal */}
        {showDeviceModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl text-slate-100"
            >
              <div className="flex items-center gap-3 mb-4 text-emerald-400">
                <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/15">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-sans">ระบบจดจำเครื่องอัตโนมัติ</h3>
                  <p className="text-[11px] text-emerald-400/80 font-mono mt-0.5">DEVICE IDENTIFIER &amp; CLOUD SYNC</p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-slate-300 font-sans mb-6">
                <p className="leading-relaxed text-xs">
                  ระบบได้เปิดใช้งาน <strong className="text-emerald-400">ระบบจดจำเครื่องเรียบร้อยแล้ว</strong> บนเบราว์เซอร์นี้ หากปิดเว็บหรือรีโหลดหน้านี้ ข้อมูลกลุ่มเดิม ประวัติ และสิทธิ์หัวหน้ากลุ่มของท่านจะไม่รีเซ็ตหรือสูญหายแน่นอน!
                </p>

                <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 space-y-2">
                  <span className="block text-xs font-semibold text-slate-400">รหัสอุปกรณ์เครื่องนี้ (Device Key)</span>
                  <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-200">
                    <span className="text-emerald-400 font-bold tracking-wider">{deviceId}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(deviceId);
                        setCopiedDeviceId(true);
                        setTimeout(() => setCopiedDeviceId(false), 2000);
                      }}
                      className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-emerald-400 transition"
                      title="คัดลอกรหัสเครื่อง"
                    >
                      {copiedDeviceId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    💡 ท่านสามารถคัดลอกรหัสนี้ไปใช้ที่เครื่องอื่นเพื่อเชื่อมข้อมูลกลุ่มเข้าด้วยกันได้ทันที!
                  </p>
                </div>

                {/* Sync form to pull data from another device */}
                {onSyncDevice && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!syncDeviceInput.trim()) return;
                      setSyncDeviceError("");
                      setSyncDeviceSuccess(false);
                      const result = await onSyncDevice(syncDeviceInput);
                      if (result.success) {
                        setSyncDeviceSuccess(true);
                        setSyncDeviceInput("");
                        setTimeout(() => {
                          setShowDeviceModal(false);
                          setSyncDeviceSuccess(false);
                        }, 2000);
                      } else {
                        setSyncDeviceError(result.error || "เชื่อมโยงเครื่องไม่สำเร็จ");
                      }
                    }}
                    className="border-t border-slate-700/50 pt-4 space-y-3"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400" /> เชื่อมข้อมูลกลุ่มจากเครื่องอื่น (Sync Device)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={syncDeviceInput}
                          onChange={(e) => setSyncDeviceInput(e.target.value)}
                          placeholder="ป้อนรหัสอุปกรณ์เครื่องเก่า เช่น DEV-XXXX"
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:border-emerald-500 text-slate-100 transition"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs transition flex-shrink-0"
                        >
                          ดึงข้อมูลมา
                        </button>
                      </div>
                    </div>

                    {syncDeviceError && (
                      <p className="text-[11px] text-rose-400 font-medium">
                        ⚠️ {syncDeviceError}
                      </p>
                    )}

                    {syncDeviceSuccess && (
                      <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> ดึงข้อมูลและจดจำระบบเครื่องเก่าสำเร็จ!
                      </p>
                    )}
                  </form>
                )}
              </div>

              <div className="flex items-center justify-end border-t border-slate-700/50 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeviceModal(false);
                    setSyncDeviceError("");
                    setSyncDeviceSuccess(false);
                  }}
                  className="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-200 transition"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}

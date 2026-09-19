import React, { useState, useMemo } from "react";
import { Group, Member, Transaction } from "../types";
import { Plus, Users, Landmark, PiggyBank, Target, ChevronDown, Lock, Unlock, ShieldAlert, ShieldCheck, Trash2, Key, Copy, Check, Smartphone, RefreshCw, Laptop, Settings, Crown, Edit2, Sparkles, DollarSign, Radio, Bot, BellRing } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { calculateMemberCarryover } from "../lib/carryover";

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
  onChangeDeviceId?: (newDeviceId: string) => Promise<{ success: boolean; error?: string }>;
  unlockedGroupIds?: string[];
  // Profile settings props
  profileNickname?: string;
  profileRealName?: string;
  profileEmoji?: string;
  profileMemberId?: string;
  onUpdateProfile?: (nickname: string, realName: string, emoji: string, memberId: string) => void;
  onOpenGroupSettings?: () => void;
  onUpdateGroupTotalMoney?: (newTotal: number, reason?: string) => Promise<void> | void;
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
  onChangeDeviceId,
  unlockedGroupIds = [],
  profileNickname = "",
  profileRealName = "",
  profileEmoji = "🦊",
  profileMemberId = "",
  onUpdateProfile,
  onOpenGroupSettings,
  onUpdateGroupTotalMoney,
}: HeaderProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTarget, setNewGroupTarget] = useState<number>(200);
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupPasscode, setNewGroupPasscode] = useState("");
  const [createGroupError, setCreateGroupError] = useState("");
  const [showSelector, setShowSelector] = useState(false);

  // Edit Group Total Modal states
  const [showEditTotalModal, setShowEditTotalModal] = useState(false);
  const [editTotalInput, setEditTotalInput] = useState("");
  const [editTotalReason, setEditTotalReason] = useState("");
  const [isUpdatingTotal, setIsUpdatingTotal] = useState(false);

  // Profile states
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileNickInput, setProfileNickInput] = useState("");
  const [profileRealInput, setProfileRealInput] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("🦊");
  const [linkedMemberSelect, setLinkedMemberSelect] = useState("");

  const EMOJIS = ["🦊", "🐼", "🐨", "🐯", "🦁", "🐱", "🐶", "🐰", "🐷", "🐸", "🐵", "🦄", "🐙", "🦖", "🐧", "🦉", "🦕", "🐹", "🐝", "🐥"];

  const handleOpenProfileModal = () => {
    setProfileNickInput(profileNickname);
    setProfileRealInput(profileRealName);
    setSelectedEmoji(profileEmoji || "🦊");
    setLinkedMemberSelect(profileMemberId);
    setShowProfileModal(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateProfile) {
      onUpdateProfile(
        profileNickInput.trim() || "เพื่อนใหม่",
        profileRealInput.trim(),
        selectedEmoji,
        linkedMemberSelect
      );
    }
    setShowProfileModal(false);
  };

  // Device states
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [syncDeviceInput, setSyncDeviceInput] = useState("");
  const [syncDeviceError, setSyncDeviceError] = useState("");
  const [syncDeviceSuccess, setSyncDeviceSuccess] = useState(false);
  const [copiedDeviceId, setCopiedDeviceId] = useState(false);
  const [customDeviceInput, setCustomDeviceInput] = useState("");
  const [customDeviceError, setCustomDeviceError] = useState("");
  const [customDeviceSuccess, setCustomDeviceSuccess] = useState(false);
  const [isEditingDeviceId, setIsEditingDeviceId] = useState(false);

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

  const handleCustomDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDeviceInput.trim()) return;
    setCustomDeviceError("");
    setCustomDeviceSuccess(false);
    if (onChangeDeviceId) {
      const result = await onChangeDeviceId(customDeviceInput);
      if (result.success) {
        setCustomDeviceSuccess(true);
        setIsEditingDeviceId(false);
        setTimeout(() => {
          setCustomDeviceSuccess(false);
        }, 3000);
      } else {
        setCustomDeviceError(result.error || "เกิดข้อผิดพลาดในการเปลี่ยนรหัสเครื่อง");
      }
    }
  };

  const targetPerPerson = activeGroup?.targetAmountPerMember || 0;
  const totalMembers = members.length;
  const totalTarget = totalMembers * targetPerPerson;

  // Calculate detailed stats for each individual member
  const memberStatsList = useMemo(() => {
    return members.map((member) => {
      const carryoverResult = calculateMemberCarryover(
        member.id,
        transactions,
        targetPerPerson,
        activeGroup?.createdAt || new Date().toISOString(),
        activeGroup?.lateFeePerWeek || 0,
        member.initialCarryover || 0,
        member.customLateFee
      );
      return {
        member,
        totalPaid: carryoverResult.totalPaidAllTime,
        isPaidFully: carryoverResult.currentWeekStatus.isPaidFully,
        available: carryoverResult.currentWeekStatus.available,
        deficit: carryoverResult.currentWeekStatus.deficit,
      };
    });
  }, [members, transactions, targetPerPerson, activeGroup]);

  // Total collected referenced by summing all members' individual paid amounts (+ unlinked transactions if any)
  const totalCollected = useMemo(() => {
    const fromMembers = memberStatsList.reduce((sum, m) => sum + m.totalPaid, 0);
    const unlinked = transactions
      .filter((t) => !members.some((m) => m.id === t.memberId))
      .reduce((sum, t) => sum + t.amount, 0);
    return fromMembers + unlinked;
  }, [memberStatsList, transactions, members]);

  // Group members payment tracking: members who have paid fully for the current week
  const paidMembersCount = useMemo(() => {
    return memberStatsList.filter((m) => m.isPaidFully).length;
  }, [memberStatsList]);

  // Progress percent based on everyone's contributions towards the group target for current week
  const currentWeekProgressCollected = useMemo(() => {
    return memberStatsList.reduce((sum, m) => sum + Math.min(targetPerPerson, Math.max(0, m.available)), 0);
  }, [memberStatsList, targetPerPerson]);

  const progressPercent = totalTarget > 0 
    ? Math.min(Math.round((currentWeekProgressCollected / totalTarget) * 100), 100) 
    : 0;

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

               <button
                 onClick={handleOpenProfileModal}
                 className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700/80 text-teal-400 border border-slate-700 hover:border-slate-600 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm transition cursor-pointer"
                 title="ตั้งค่าโปรไฟล์และรายชื่อของคุณ"
               >
                 <span className="text-sm shrink-0">{profileEmoji || "🦊"}</span>
                 <span className="hidden sm:inline">โปรไฟล์:</span>
                 <span className="max-w-[80px] truncate">{profileNickname || "ตั้งค่าโปรไฟล์"}</span>
               </button>

               <button
                 onClick={() => {
                   onOpenGroupSettings?.();
                 }}
                 className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm transition cursor-pointer"
                 title="ตั้งค่าก๊วน ค่าปรับจ่ายช้า และแอดหัวหน้ากลุ่ม"
               >
                 <Settings className="w-4 h-4 text-amber-400 animate-spin-slow" />
                 <span className="hidden sm:inline">⚙️ ตั้งค่า / แอดหัวหน้า</span>
                 <span className="sm:hidden">⚙️ ตั้งค่า</span>
               </button>

               {isLeader ? (
                 <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm">
                   <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                   <span>👑 หัวหน้าก๊วน</span>
                 </div>
               ) : null}

               {activeGroup?.discordBotEnabled && (
                 <div
                   className="flex items-center gap-1.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm"
                   title="บอท Discord เปิดใช้งานแล้ว รองรับคำสั่ง !เช็ค (ปัจจุบัน), !เช็คก่อน (อาทิตย์ก่อน) และ !ยอดเงิน"
                 >
                   <Bot className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                   <span className="hidden sm:inline">Bot: !เช็ค / !เช็คก่อน / !ยอดเงิน</span>
                   <span className="sm:hidden">Bot !เช็ค</span>
                 </div>
               )}

               {activeGroup?.discordWebhookEnabled && activeGroup?.discordWebhookUrl && (
                 <div
                   className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm"
                   title="ระบบเชื่อมต่อกับ Discord Webhook แจ้งเตือนสลิป/ยอดเงินเข้าเรียบร้อยแล้ว"
                 >
                   <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                   <span className="hidden sm:inline">Webhook สลิป</span>
                   <span className="sm:hidden">สลิป</span>
                 </div>
               )}

               {activeGroup?.discordOverdueWebhookEnabled && activeGroup?.discordOverdueWebhookUrl && (
                 <div
                   className="flex items-center gap-1.5 bg-rose-500/15 text-rose-300 border border-rose-500/30 px-3 py-2 rounded-xl text-xs font-sans font-bold shadow-sm"
                   title="ระบบเชื่อมต่อกับ Discord Webhook แจ้งเตือนรายชื่อยอดค้าง เรียบร้อยแล้ว"
                 >
                   <BellRing className="w-3.5 h-3.5 text-rose-400 animate-pulse shrink-0" />
                   <span className="hidden sm:inline">Webhook เตือนยอดค้าง</span>
                   <span className="sm:hidden">เตือนยอดค้าง</span>
                 </div>
               )}

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
                        <p className="text-xs text-slate-500 text-center py-4">ยังไม่มีกลุ่มในระบบ</p>
                      ) : (
                        groups.map((g) => {
                          const isUnlocked =
                            !g.passcode ||
                            unlockedGroupIds.includes(g.id) ||
                            createdGroupIds.includes(g.id);

                          return (
                            <button
                              key={g.id}
                              onClick={() => {
                                if (isUnlocked) {
                                  onGroupChange(g.id);
                                  setShowSelector(false);
                                } else {
                                  setJoinPasscode(g.passcode || "");
                                  setShowJoinModal(true);
                                  setShowSelector(false);
                                }
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
                                    {!isUnlocked && (
                                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded ml-1 font-sans">
                                        ใส่รหัสเข้าดู
                                      </span>
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
                          );
                        })
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
            <div className="bg-slate-800/40 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between gap-2 relative group">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/10 shrink-0">
                  <PiggyBank className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-sans">เก็บยอดทั้งหมดได้</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xl md:text-2xl font-bold text-slate-100 font-mono">
                      ฿{totalCollected.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </p>
                    {isLeader && onUpdateGroupTotalMoney && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditTotalInput(String(totalCollected));
                          setEditTotalReason("ปรับปรุงยอดกองกลางโดยตรง");
                          setShowEditTotalModal(true);
                        }}
                        className="p-1.5 bg-slate-800/90 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/40 rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                        title="แก้ไขยอดรวมของเงินกลุ่ม (เฉพาะหัวหน้าก๊วน)"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-sans hidden sm:inline">แก้ไขยอดรวม</span>
                      </button>
                    )}
                  </div>
                </div>
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
                  เพื่อแก้ปัญหาการล้างข้อมูลเบราว์เซอร์หรือการใช้โหมดไม่ระบุตัวตน (Incognito) สลิปบัดดี้เปิดโอกาสให้ท่าน <strong className="text-emerald-400">ตั้งรหัสจำเครื่องของคุณเองได้จริง</strong> ไม่ใช่แค่จำประวัติในเบราว์เซอร์เท่านั้น!
                </p>

                {customDeviceSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-2xl text-xs font-sans text-center font-semibold">
                    🎉 เปลี่ยนรหัสจำเครื่องสำเร็จ! ขณะนี้ระบบจดจำเครื่องนี้ด้วยรหัสใหม่แล้ว
                  </div>
                )}

                {!isEditingDeviceId ? (
                  <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-4 space-y-3">
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
                    
                    <button
                      type="button"
                      onClick={() => {
                        setCustomDeviceInput(deviceId);
                        setIsEditingDeviceId(true);
                        setCustomDeviceError("");
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 hover:border-amber-500/20 rounded-xl transition font-sans font-semibold cursor-pointer"
                    >
                      <span>⚙️ เปลี่ยนเป็นรหัสจำเครื่องที่คุณตั้งเอง (เช่น เบอร์มือถือ)</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCustomDeviceSubmit} className="bg-slate-900 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                    <span className="block text-xs font-semibold text-amber-400">ตั้งรหัสจำเครื่องที่คุณต้องการ</span>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      แนะนำให้ใส่เป็น <strong className="text-amber-400">เบอร์โทรศัพท์มือถือ</strong> หรือ <strong className="text-amber-400">ชื่อภาษาอังกฤษที่จำง่าย</strong> เพื่อใช้สลับหรือเปิดประวัติกลุ่มสลิปได้จากทุกเบราว์เซอร์/อุปกรณ์โดยไม่มีวันหาย
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={customDeviceInput}
                        onChange={(e) => setCustomDeviceInput(e.target.value)}
                        placeholder="เช่น 0891234567 หรือ MYIPAD"
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:border-emerald-500 text-slate-100 transition"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs transition cursor-pointer"
                      >
                        บันทึกรหัสใหม่
                      </button>
                    </div>
                    {customDeviceError && (
                      <p className="text-[11px] text-rose-400 font-medium">⚠️ {customDeviceError}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsEditingDeviceId(false)}
                      className="text-xs text-slate-400 hover:text-slate-300 font-sans cursor-pointer block"
                    >
                      ยกเลิกและย้อนกลับ
                    </button>
                  </form>
                )}

                {/* Sync form to pull data from another device */}
                {onSyncDevice && !isEditingDeviceId && (
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
                      <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin-slow" /> ดึงข้อมูลกลุ่มจากรหัสเครื่องอื่น (Sync Device)
                      </label>
                      <p className="text-[10px] text-slate-500 leading-normal mb-2">
                        หากท่านย้ายเครื่อง, ซื้อโทรศัพท์ใหม่ หรือใช้เบราว์เซอร์อื่น เพียงกรอกรหัสจำเครื่องที่ท่านเคยตั้งไว้ด้านบนเพื่อโหลดข้อมูลทั้งหมดกลับคืนมาได้ทันที
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={syncDeviceInput}
                          onChange={(e) => setSyncDeviceInput(e.target.value)}
                          placeholder="ป้อนรหัสอุปกรณ์เครื่องเก่า เช่น เบอร์โทร"
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:border-emerald-500 text-slate-100 transition"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs transition flex-shrink-0 cursor-pointer"
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
                    setIsEditingDeviceId(false);
                  }}
                  className="px-5 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-200 transition cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Setup Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl text-slate-100"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-xl">
                  👤
                </div>
                <div>
                  <h3 className="text-base font-bold font-sans">ตั้งค่าโปรไฟล์ส่วนตัวของคุณ</h3>
                  <p className="text-[10px] text-teal-400 font-mono mt-0.5">MY PROFILE SETTINGS</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4 font-sans text-xs text-slate-300">
                {/* Emojis selection */}
                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">เลือกไอคอนอิโมจิประจำตัว:</label>
                  <div className="grid grid-cols-6 gap-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-700/50 max-h-36 overflow-y-auto">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setSelectedEmoji(emoji)}
                        className={`text-xl p-2 rounded-xl hover:bg-slate-800 transition ${
                          selectedEmoji === emoji ? "bg-teal-500/20 border border-teal-500/50 scale-110" : "border border-transparent"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nickname */}
                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">ชื่อเล่น / ชื่อเรียกเพื่อนร่วมก๊วน:</label>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    value={profileNickInput}
                    onChange={(e) => setProfileNickInput(e.target.value)}
                    placeholder="เช่น รักดี, บอส, แจน"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs focus:outline-none focus:border-teal-500 text-slate-100 transition"
                  />
                </div>

                {/* Real Name */}
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    ชื่อจริง (ใช้ตรวจสอบสลิปอัตโนมัติ):
                  </label>
                  <span className="block text-[10px] text-slate-500 mb-1.5 leading-relaxed">
                    *กรอกชื่อจริงภาษาไทย/อังกฤษตามที่ปรากฏในสลิปโอนเงิน เพื่อให้ AI ตรวจจับและแมตช์สลิปของคุณโดยตรง
                  </span>
                  <input
                    type="text"
                    value={profileRealInput}
                    onChange={(e) => setProfileRealInput(e.target.value)}
                    placeholder="เช่น รักดี มีสุข, RAKDEE MEESOOK"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs focus:outline-none focus:border-teal-500 text-slate-100 transition"
                  />
                </div>

                {/* Link member in group */}
                {activeGroupId && (
                  <div>
                    <label className="block text-slate-400 mb-1.5 font-semibold">เชื่อมต่อกับรายชื่อสมาชิกในก๊วนนี้:</label>
                    <select
                      value={linkedMemberSelect}
                      onChange={(e) => setLinkedMemberSelect(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs focus:outline-none focus:border-teal-500 text-slate-100"
                    >
                      <option value="">-- ไม่ระบุ (ผู้ดูแล/ผู้สังเกตการณ์ภายนอก) --</option>
                      <option value="create_new">✨ เพิ่มรายชื่อใหม่เพื่อแทนตัวฉัน (ใช้ชื่อด้านบน)</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nickname} {m.name !== m.nickname ? `(${m.name})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-700/50 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(false)}
                    className="px-4 py-2 text-slate-400 hover:text-slate-200 transition text-xs font-semibold cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
                  >
                    บันทึกโปรไฟล์
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Edit Group Total Money Modal */}
        {showEditTotalModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl text-slate-100"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                    <PiggyBank className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 font-sans">
                      แก้ไขยอดรวมของเงินกลุ่ม
                    </h3>
                    <p className="text-[11px] text-slate-400 font-sans">
                      {activeGroup?.name || "ก๊วนปัจจุบัน"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditTotalModal(false)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const parsed = parseFloat(editTotalInput);
                  if (isNaN(parsed) || parsed < 0) {
                    alert("กรุณาระบุจำนวนเงินรวมที่ถูกต้อง (ตัวเลขมากกว่าหรือเท่ากับ 0)");
                    return;
                  }
                  if (onUpdateGroupTotalMoney) {
                    setIsUpdatingTotal(true);
                    try {
                      await onUpdateGroupTotalMoney(parsed, editTotalReason.trim() || undefined);
                      setShowEditTotalModal(false);
                    } finally {
                      setIsUpdatingTotal(false);
                    }
                  }
                }}
                className="space-y-4 text-xs"
              >
                <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-3.5 space-y-1.5">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>ยอดรวมปัจจุบันในระบบ:</span>
                    <span className="font-mono text-emerald-400 font-bold text-sm">
                      ฿{totalCollected.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                    💡 ระบบจะคำนวณส่วนต่างและบันทึกรายการปรับปรุงยอดเงินกองกลางของกลุ่มให้ทันทีโดยอัตโนมัติ
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5 flex items-center justify-between">
                    <span>ระบุยอดเงินรวมใหม่ที่ต้องการ (บาท):</span>
                    <span className="text-[10px] text-emerald-400 font-mono">฿ THB</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={editTotalInput}
                      onChange={(e) => setEditTotalInput(e.target.value)}
                      placeholder="เช่น 2500 หรือ 5000"
                      className="w-full pl-8 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base font-mono font-bold focus:outline-none focus:border-emerald-500 text-slate-100 transition shadow-inner"
                    />
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-2.5 top-3.5" />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-slate-400 w-full mb-0.5 font-sans">ทางลัดปรับยอด:</span>
                  {[0, 1000, 2000, 3000, 5000, 10000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setEditTotalInput(String(amt))}
                      className="px-2.5 py-1 bg-slate-900/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-emerald-300 rounded-lg text-[11px] font-mono transition cursor-pointer"
                    >
                      ฿{amt.toLocaleString("th-TH")}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1.5">
                    หมายเหตุ / สาเหตุการปรับยอด (ไม่บังคับ):
                  </label>
                  <input
                    type="text"
                    value={editTotalReason}
                    onChange={(e) => setEditTotalReason(e.target.value)}
                    placeholder="เช่น ปรับยอดยกมากองกลาง, เพิ่มเงินส่วนกลางพิเศษ"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-slate-100 transition"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-700/50 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditTotalModal(false)}
                    className="px-4 py-2 text-slate-400 hover:text-slate-200 transition text-xs font-semibold cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingTotal}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isUpdatingTotal ? "กำลังบันทึก..." : "บันทึกยอดรวมใหม่"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}

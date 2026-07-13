import React, { useState, useRef } from "react";
import { Member, ParsedSlipResult } from "../types";
import { UploadCloud, FileText, Check, AlertCircle, Loader2, RefreshCw, UserPlus, Copy } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SlipUploaderProps {
  members: Member[];
  onUploadSuccess: (
    parsed: ParsedSlipResult,
    memberId: string,
    createMemberName: string | null,
    createMemberNickname: string | null
  ) => void;
  activeGroupId: string;
}

export default function SlipUploader({ members, onUploadSuccess, activeGroupId }: SlipUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Result form states
  const [parsedResult, setParsedResult] = useState<ParsedSlipResult | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [createNewMember, setCreateNewMember] = useState<boolean>(false);
  const [newMemberNickname, setNewMemberNickname] = useState<string>("");

  // Auto-Success State
  const [successInfo, setSuccessInfo] = useState<{
    amount: number;
    nickname: string;
    isNew: boolean;
    senderName: string;
    bank: string;
    date: string;
    time: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopyAccount = () => {
    navigator.clipboard.writeText("132-2539319");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  // Convert file to Base64 and send to server API for Gemini processing
  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("กรุณาอัปโหลดไฟล์รูปภาพสลิปที่ถูกต้อง (JPEG, PNG, etc.)");
      return;
    }

    setLoading(true);
    setError(null);
    setParsedResult(null);
    setSuccessInfo(null);

    try {
      setLoadingStep("กำลังอัปโหลดรูปภาพสลิป...");
      const base64 = await convertToBase64(file);

      setLoadingStep("ส่งข้อมูลสลิปไปประมวลผลด้วย Gemini AI...");
      const response = await fetch("/api/parse-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type,
        }),
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || "ไม่สามารถอ่านข้อมูลสลิปนี้ได้");
      }

      const parsed: ParsedSlipResult = resJson.data;

      if (!parsed.isSuccess) {
        setError(
          "Gemini ตรวจพบว่าไฟล์นี้อาจไม่ใช่สลิปการโอนเงินสำเร็จ หรือชื่อข้อมูลไม่ถูกต้อง กรุณาอัปโหลดสลิปที่สำเร็จ"
        );
        setLoading(false);
        return;
      }

      setLoadingStep("ตรวจสอบและบันทึกยอดเงินอัตโนมัติ...");

      // Perform auto-matching and immediate transaction saving
      const matched = autoMatchMember(parsed.senderName, members);
      let finalNickname = "";
      let isNew = false;

      if (matched) {
        finalNickname = matched.nickname;
        onUploadSuccess(parsed, matched.id, null, null);
      } else {
        const cleanName = parsed.senderName.replace(/^(นาย|นาง|นางสาว|น\.ส\.|mr\.|ms\.)/i, "").trim();
        finalNickname = cleanName.split(" ")[0] || "เพื่อนใหม่";
        onUploadSuccess(parsed, "new", parsed.senderName, finalNickname);
        isNew = true;
      }

      setSuccessInfo({
        amount: parsed.amount,
        nickname: finalNickname,
        isNew,
        senderName: parsed.senderName,
        bank: parsed.bank,
        date: parsed.date,
        time: parsed.time,
      });

      // Automatically reset / dismiss after 6 seconds
      setTimeout(() => {
        setSuccessInfo((prev) => {
          if (prev && prev.amount === parsed.amount && prev.senderName === parsed.senderName) {
            return null;
          }
          return prev;
        });
      }, 6000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "เกิดข้อผิดพลาดระหว่างส่งภาพสลิปให้ AI วิเคราะห์");
    } finally {
      setLoading(false);
    }
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Fuzzy match name or nickname
  const autoMatchMember = (parsedName: string, memberList: Member[]): Member | null => {
    if (!parsedName) return null;
    const lowerParsed = parsedName.toLowerCase();

    // 1. Try exact or full contains match
    for (const member of memberList) {
      const name = member.name.toLowerCase();
      const nickname = member.nickname.toLowerCase();

      if (lowerParsed.includes(name) || name.includes(lowerParsed)) return member;
      if (nickname && (lowerParsed.includes(nickname) || nickname.includes(lowerParsed))) return member;
    }

    return null;
  };

  // Form submit handler
  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedResult) return;

    // Validate manual override modifications
    const finalAmount = Number(parsedResult.amount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      alert("กรุณาระบุจำนวนเงินโอนที่ถูกต้อง");
      return;
    }

    if (createNewMember && !parsedResult.senderName.trim()) {
      alert("กรุณาระบุชื่อคนโอนเงิน");
      return;
    }

    onUploadSuccess(
      parsedResult,
      createNewMember ? "new" : selectedMemberId,
      createNewMember ? parsedResult.senderName : null,
      createNewMember ? newMemberNickname : null
    );

    // Reset Form
    setParsedResult(null);
    setSelectedMemberId("");
    setCreateNewMember(false);
    setNewMemberNickname("");
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6" id="slip-uploader-section">
      <h2 className="text-lg font-sans font-bold text-slate-100 flex items-center gap-2 mb-4">
        <UploadCloud className="w-5 h-5 text-emerald-400" /> อัปโหลดสลิปธนาคาร (AI สแกนอัตโนมัติ)
      </h2>

      <AnimatePresence mode="wait">
        {/* Loading Screen */}
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 px-4 bg-slate-800/20 border border-dashed border-slate-700 rounded-2xl min-h-[220px]"
          >
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
            <p className="text-sm text-slate-200 font-medium font-sans animate-pulse">{loadingStep}</p>
            <p className="text-xs text-slate-500 font-mono mt-1">โมเดลประมวลผล: gemini-3.5-flash</p>
          </motion.div>
        )}

        {/* Upload Slot */}
        {!loading && !parsedResult && !successInfo && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center py-10 px-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 min-h-[220px] ${
              isDragOver
                ? "border-emerald-400 bg-emerald-500/5 text-emerald-300"
                : "border-slate-700/80 bg-slate-800/10 hover:bg-slate-800/20 text-slate-400"
            }`}
            id="drag-drop-zone"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <UploadCloud className={`w-12 h-12 mb-3 transition ${isDragOver ? "text-emerald-400 scale-110 animate-bounce" : "text-slate-500"}`} />
            <p className="text-sm font-semibold text-slate-200 font-sans text-center">
              ลากและวางรูปภาพสลิปที่นี่ หรือคลิกเพื่อเลือกไฟล์
            </p>
            <p className="text-xs text-slate-500 font-sans text-center mt-1.5">
              รองรับไฟล์นามสกุล PNG, JPG, WEBP ระบบจะสแกน ชื่อคนโอน ยอดโอน วันเวลา และจับคู่กับเพื่อนอัตโนมัติ
            </p>

            {error && (
              <div className="flex items-center gap-1.5 mt-4 text-xs font-sans text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/10">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* Auto-Success Notification Screen */}
        {!loading && successInfo && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-center flex flex-col items-center justify-center min-h-[220px]"
            id="upload-success-panel"
          >
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center border border-emerald-500/20 mb-3 animate-bounce">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-emerald-400 font-sans mb-1">
              ตรวจสอบและเพิ่มยอดเงินสำเร็จ! 🎉
            </h3>
            <p className="text-xs text-slate-300 font-sans mb-4 max-w-xs leading-relaxed">
              สแกนสลิปโอนเงินและบันทึกยอดของ <strong className="text-emerald-300">{successInfo.nickname}</strong> เรียบร้อยแล้วโดยอัตโนมัติ
            </p>

            <div className="bg-slate-950/60 rounded-2xl px-4 py-3 border border-slate-800 text-left w-full max-w-xs space-y-1.5 mb-4 font-sans shadow-inner">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">ชื่อจริงผู้โอน:</span>
                <span className="text-slate-200 font-medium truncate max-w-[150px]">{successInfo.senderName}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">ยอดเงินโอน:</span>
                <span className="text-emerald-400 font-bold font-mono">฿{successInfo.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">ช่องทาง/ธนาคาร:</span>
                <span className="text-slate-300">{successInfo.bank}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">วันเวลาที่โอน:</span>
                <span className="text-slate-400 font-mono text-[10px]">{successInfo.date} {successInfo.time}</span>
              </div>
              {successInfo.isNew && (
                <div className="text-[10px] text-amber-400 font-sans pt-1.5 border-t border-slate-800/80 mt-1.5 flex items-center gap-1">
                  ✨ ระบบสร้างและจำชื่อเล่นใหม่: <strong className="text-slate-100">{successInfo.nickname}</strong>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSuccessInfo(null)}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition focus:outline-none shadow-md shadow-emerald-950/20 cursor-pointer"
            >
              ตกลง (อัปโหลดใบต่อไป)
            </button>
          </motion.div>
        )}

        {/* Parsing Confirm Form */}
        {!loading && parsedResult && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-slate-800/40 border border-slate-800 rounded-2xl p-5"
            id="parsed-confirm-panel"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                AI สแกนข้อมูลสำเร็จเรียบร้อย
              </span>
              <button
                type="button"
                onClick={() => setParsedResult(null)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-sans"
              >
                <RefreshCw className="w-3.5 h-3.5" /> อัปสลิปใหม่
              </button>
            </div>

            <form onSubmit={handleConfirmSubmit} className="space-y-4">
              {/* Row 1: Amount & Bank */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-slate-400 font-sans mb-1">ยอดเงินตามสลิป (บาท)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={parsedResult.amount || ""}
                    onChange={(e) => setParsedResult({ ...parsedResult, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-emerald-400 font-semibold focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 font-sans mb-1">ธนาคาร</label>
                  <input
                    type="text"
                    required
                    value={parsedResult.bank || ""}
                    onChange={(e) => setParsedResult({ ...parsedResult, bank: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Row 2: Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-slate-400 font-sans mb-1">วันที่โอน (ค.ศ.)</label>
                  <input
                    type="date"
                    required
                    value={parsedResult.date || ""}
                    onChange={(e) => setParsedResult({ ...parsedResult, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 font-sans mb-1">เวลาที่โอน</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น 14:30"
                    value={parsedResult.time || ""}
                    onChange={(e) => setParsedResult({ ...parsedResult, time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Row 3: Parsed Sender Name (Real Name) */}
              <div>
                <label className="block text-[11px] text-slate-400 font-sans mb-1">ชื่อผู้โอน (จากสลิป)</label>
                <input
                  type="text"
                  required
                  value={parsedResult.senderName || ""}
                  onChange={(e) => setParsedResult({ ...parsedResult, senderName: e.target.value })}
                  placeholder="ชื่อคนโอนเงินบนสลิป"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-sans text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Row 4: Member Mapping Dropdown */}
              <div className="border-t border-slate-800 pt-3">
                <label className="block text-xs font-semibold text-slate-300 font-sans mb-1.5">
                  จับคู่รายการนี้กับใคร?
                </label>
                <div className="flex flex-col gap-2">
                  <select
                    value={selectedMemberId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedMemberId(val);
                      if (val === "new") {
                        setCreateNewMember(true);
                      } else {
                        setCreateNewMember(false);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-sans text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                    id="member-mapping-select"
                  >
                    <option value="" disabled>-- เลือกรายชื่อเพื่อน --</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nickname ? `${m.nickname} (${m.name})` : m.name}
                      </option>
                    ))}
                    <option value="new">+ เพิ่มรายชื่อเพื่อนใหม่จากสลิปนี้</option>
                  </select>

                  {/* Optional Nickname for new member */}
                  {createNewMember && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 space-y-2 mt-1"
                    >
                      <p className="text-[10px] text-emerald-400 font-sans flex items-center gap-1">
                        <UserPlus className="w-3.5 h-3.5" /> ระบบจะจำชื่อจริงและชื่อเล่นเพื่อนคนนี้อัตโนมัติสำหรับการโอนครั้งถัดไป
                      </p>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5 font-sans">ชื่อเล่นเพื่อน</label>
                        <input
                          type="text"
                          required={createNewMember}
                          value={newMemberNickname}
                          onChange={(e) => setNewMemberNickname(e.target.value)}
                          placeholder="ชื่อเล่นเพื่อน เช่น โอม, สมชาย"
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-sans text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Confirm Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setParsedResult(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 font-medium font-sans"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs flex items-center gap-1 shadow-md font-sans transition"
                  id="confirm-slip-btn"
                >
                  <Check className="w-4 h-4" /> ยืนยันบันทึกยอดเงิน
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

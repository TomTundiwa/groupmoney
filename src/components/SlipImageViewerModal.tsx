import React, { useState } from "react";
import { Transaction, Member } from "../types";
import { X, Lock, ShieldCheck, Download, ExternalLink, ZoomIn, ZoomOut, RotateCcw, Calendar, Clock, Landmark, User, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SlipImageViewerModalProps {
  transaction: Transaction | null;
  members: Member[];
  isLeader: boolean;
  onClose: () => void;
}

export default function SlipImageViewerModal({
  transaction,
  members,
  isLeader,
  onClose,
}: SlipImageViewerModalProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  if (!transaction) return null;

  const matchedMember = members.find((m) => m.id === transaction.memberId);
  const displayName = matchedMember ? matchedMember.nickname : transaction.senderNameText || "ไม่ระบุชื่อ";
  const realName = matchedMember?.name;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.75));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleDownload = () => {
    if (!transaction.slipImageUrl) return;
    const link = document.createElement("a");
    link.href = transaction.slipImageUrl;
    link.download = `slip-${transaction.date}-${transaction.amount}thb.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    if (!transaction.slipImageUrl) return;
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(
        `<body style="margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh;">
          <img src="${transaction.slipImageUrl}" style="max-width:98%;max-height:98vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 40px rgba(0,0,0,0.5);" />
        </body>`
      );
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>ตรวจสอบรูปสลิปโอนเงิน</span>
                  {isLeader ? (
                    <span className="text-[10px] font-sans font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      👑 สิทธิ์หัวหน้าก๊วน
                    </span>
                  ) : (
                    <span className="text-[10px] font-sans font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> สิทธิ์สมาชิก
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  รายการโอนของ <strong className="text-slate-200">{displayName}</strong>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Security Gate Check */}
          {!isLeader ? (
            /* NON-LEADER VIEW: Access Blocked */
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 mx-auto">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h4 className="text-base font-bold text-slate-100">
                  รูปภาพสลิปนี้ดูได้เฉพาะหัวหน้าก๊วนเท่านั้น
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  เพื่อความปลอดภัยและความเป็นส่วนตัวของข้อมูลบัญชีธนาคาร มีเพียงหัวหน้ากลุ่มเท่านั้นที่ได้รับอนุญาตให้เปิดดูรูปภาพสลิปที่แนบมา
                </p>
              </div>

              {/* Transaction Basic Summary without image */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-left text-xs space-y-2 max-w-sm mx-auto font-sans">
                <div className="flex justify-between items-center text-slate-400">
                  <span>ผู้โอน:</span>
                  <span className="font-semibold text-slate-200">{displayName}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>ยอดเงิน:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    ฿{transaction.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>วันเวลา:</span>
                  <span className="font-mono text-slate-300">{transaction.date} {transaction.time}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>ธนาคาร:</span>
                  <span className="text-slate-300">{transaction.bank}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  เข้าใจแล้ว / ปิดหน้าต่าง
                </button>
              </div>
            </div>
          ) : !transaction.slipImageUrl ? (
            /* LEADER VIEW: No slip image attached */
            <div className="p-8 text-center space-y-4 font-sans">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200">
                  ไม่มีรูปภาพสลิปแนบมากับรายการนี้
                </h4>
                <p className="text-xs text-slate-400">
                  รายการนี้อาจถูกบันทึกด้วยมือ หรืออัปโหลดก่อนที่จะเริ่มใช้งานระบบแนบรูปสลิป
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          ) : (
            /* LEADER VIEW: Full access to slip image */
            <div className="p-5 space-y-4">
              {/* Slip Metadata Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-sans">
                <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <User className="w-3 h-3 text-emerald-400" /> ผู้โอนเงิน
                  </span>
                  <p className="font-semibold text-slate-200 truncate mt-0.5">{displayName}</p>
                  {realName && realName !== displayName && (
                    <p className="text-[9px] text-slate-500 truncate">{realName}</p>
                  )}
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Landmark className="w-3 h-3 text-emerald-400" /> ยอดโอนเงิน
                  </span>
                  <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                    ฿{transaction.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-400" /> วันที่โอน
                  </span>
                  <p className="font-mono text-slate-200 mt-0.5">{transaction.date}</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-400" /> เวลา & ธนาคาร
                  </span>
                  <p className="font-mono text-slate-200 truncate mt-0.5">
                    {transaction.time || "--:--"} • {transaction.bank}
                  </p>
                </div>
              </div>

              {/* Image Control Toolbar */}
              <div className="flex items-center justify-between bg-slate-950/40 border border-slate-800 px-3 py-2 rounded-2xl text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                    title="ซูมเข้า (+)"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                    title="ซูมออก (-)"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRotate}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                    title="หมุนภาพ 90 องศา"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition text-[11px] font-mono"
                    title="รีเซ็ตขนาดภาพ"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenInNewTab}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition flex items-center gap-1 text-[11px]"
                    title="เปิดดูภาพเต็มในแท็บใหม่"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">แท็บใหม่</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition flex items-center gap-1 text-[11px]"
                    title="บันทึกรูปภาพสลิป"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ดาวน์โหลด</span>
                  </button>
                </div>
              </div>

              {/* Image Preview Container */}
              <div className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden min-h-[320px] max-h-[58vh] flex items-center justify-center p-3">
                <div
                  className="transition-transform duration-150 ease-out flex items-center justify-center"
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  }}
                >
                  <img
                    src={transaction.slipImageUrl}
                    alt={`สลิปโอนเงิน ${displayName}`}
                    className="max-h-[52vh] max-w-full object-contain rounded-lg shadow-xl cursor-zoom-in"
                    onClick={() => {
                      if (zoomLevel === 1) handleZoomIn();
                      else handleResetZoom();
                    }}
                  />
                </div>
              </div>

              {transaction.notes && (
                <div className="bg-slate-950/40 border border-slate-800/60 p-2.5 rounded-xl text-[11px] text-slate-400 font-sans">
                  <strong className="text-slate-300">หมายเหตุ:</strong> {transaction.notes}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

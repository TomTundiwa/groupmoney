import React from "react";
import { X, Check, Palette, Sparkles, Sun, Moon, Waves, Coffee, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export type AppTheme = "mint" | "light" | "ocean" | "latte" | "indigo";

export interface ThemeOption {
  id: AppTheme;
  name: string;
  subtitle: string;
  isLight: boolean;
  icon: React.ReactNode;
  bgHex: string;
  cardHex: string;
  accentHex: string;
  textHex: string;
  badgeText: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "mint",
    name: "เขียวมิ้นต์ & มรกต",
    subtitle: "ทันสมัย สบายตา นุ่มนวล ดูมีระดับ (แนะนำ)",
    isLight: false,
    icon: <Sparkles className="w-5 h-5 text-emerald-400" />,
    bgHex: "#0b111e",
    cardHex: "#111a2e",
    accentHex: "#10b981",
    textHex: "#e9f2fd",
    badgeText: "โมเดิร์น สบายตา",
  },
  {
    id: "light",
    name: "ขาวมินิมอล คลีน",
    subtitle: "สว่าง สดใส ตัวหนังสือคมชัด สบายตาที่สุด",
    isLight: true,
    icon: <Sun className="w-5 h-5 text-amber-500" />,
    bgHex: "#f8fafc",
    cardHex: "#ffffff",
    accentHex: "#059669",
    textHex: "#0f172a",
    badgeText: "สว่าง คลีน",
  },
  {
    id: "ocean",
    name: "มิดไนท์ โอเชี่ยน",
    subtitle: "น้ำเงินเข้ม สุขุม ลุ่มลึก โทนสีพรีเมียม",
    isLight: false,
    icon: <Waves className="w-5 h-5 text-cyan-400" />,
    bgHex: "#060e1b",
    cardHex: "#0c182e",
    accentHex: "#06b6d4",
    textHex: "#eaf2fd",
    badgeText: "สุขุม พรีเมียม",
  },
  {
    id: "latte",
    name: "วอร์ม โคซี่ ลาเต้",
    subtitle: "สีครีมอบอุ่น นุ่มนวลตา สไตล์คาเฟ่ & มัทฉะ",
    isLight: true,
    icon: <Coffee className="w-5 h-5 text-amber-600" />,
    bgHex: "#faf8f5",
    cardHex: "#ffffff",
    accentHex: "#15803d",
    textHex: "#14100c",
    badgeText: "อบอุ่น ละมุน",
  },
  {
    id: "indigo",
    name: "นีออน ไซเบอร์",
    subtitle: "ม่วงอินดิโก้ ล้ำสมัย สไตล์แอปการเงินยุคใหม่",
    isLight: false,
    icon: <Zap className="w-5 h-5 text-indigo-400" />,
    bgHex: "#0b0c1c",
    cardHex: "#12142d",
    accentHex: "#6366f1",
    textHex: "#eceffe",
    badgeText: "ล้ำสมัย ไซเบอร์",
  },
];

interface ThemeSelectorModalProps {
  isOpen: boolean;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
  onClose: () => void;
}

export default function ThemeSelectorModal({
  isOpen,
  currentTheme,
  onSelectTheme,
  onClose,
}: ThemeSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-xl p-6 shadow-2xl space-y-6 relative my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
                <Palette className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-sans font-bold text-slate-100 flex items-center gap-2">
                  <span>เลือกโทนสีของเว็ป</span>
                </h2>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  เปลี่ยนธีมสีให้สบายตาและน่าใช้ตามสไตล์ที่คุณชื่นชอบ
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="ปิด"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Theme Grid */}
          <div className="space-y-3">
            {THEME_OPTIONS.map((theme) => {
              const isSelected = currentTheme === theme.id;

              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => onSelectTheme(theme.id)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10 shadow-md shadow-emerald-500/10 scale-[1.01]"
                      : "border-slate-800 bg-slate-850/60 hover:bg-slate-800 hover:border-slate-700"
                  }`}
                >
                  {/* Left: Info */}
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner border border-white/10"
                      style={{ backgroundColor: theme.cardHex }}
                    >
                      {theme.icon}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100 font-sans">
                          {theme.name}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                          {theme.badgeText}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-sans mt-0.5 leading-relaxed">
                        {theme.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Right: Color Preview Swatches & Select Indicator */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                    {/* Swatches */}
                    <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-950/70 border border-slate-800">
                      <span
                        className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: theme.bgHex }}
                        title="สีพื้นหลัง"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: theme.cardHex }}
                        title="สีการ์ด"
                      />
                      <span
                        className="w-4 h-4 rounded-full shadow-sm"
                        style={{ backgroundColor: theme.accentHex }}
                        title="สีไฮไลท์"
                      />
                    </div>

                    {/* Status Badge */}
                    {isSelected ? (
                      <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-xl shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        <span>กำลังใช้งาน</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 transition">
                        เลือกโทนนี้
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Notice & Close Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
            <p className="text-[11px] text-slate-400 font-sans text-center sm:text-left">
              💡 ระบบจะบันทึกโทนสีที่คุณเลือกไว้ในเครื่องโดยอัตโนมัติ
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
            >
              ตกลง
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

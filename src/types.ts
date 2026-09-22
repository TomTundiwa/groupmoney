export interface Group {
  id: string;
  name: string;
  targetAmountPerMember: number;
  lateFeePerWeek?: number; // ค่าปรับจ่ายล่าช้า (บาท / สัปดาห์)
  lateFeeNote?: string; // เงื่อนไข/คำอธิบายค่าปรับจ่ายช้า
  description?: string;
  passcode?: string; // Optional passcode to join and see the group
  leaderPasscode?: string; // รหัสผ่านสำหรับเพิ่ม/เป็นหัวหน้ากลุ่มร่วม
  coLeaders?: string[]; // รายชื่อหัวหน้ากลุ่มร่วม
  createdAt: string;
  // Discord Webhook 1: แจ้งเตือนสลิป & ธุรกรรม
  discordWebhookUrl?: string;
  discordWebhookEnabled?: boolean;
  discordNotifyOnSlip?: boolean;
  discordNotifyOnManualTx?: boolean;
  discordSendSlipImage?: boolean; // ส่งรูปภาพสลิปแนบไปด้วยใน Discord Webhook
  // Discord Webhook 2: แจ้งเตือนรายชื่อยอดค้าง (Overdue Balances)
  discordOverdueWebhookUrl?: string;
  discordOverdueWebhookEnabled?: boolean;
  discordOverdueMentionText?: string; // เช่น @everyone หรือ @here
  discordOverdueNotifyOnTransfer?: boolean; // แจ้งเตือนอัปเดตยอดค้างทันทีเมื่อมีคนโอนเงินเข้า
  discordOverdueAutoSchedule?: boolean; // ส่งอัตโนมัติตามรอบเวลาที่เลือก
  discordOverdueScheduleSlots?: string[]; // รายการรอบเวลาทุกๆ ชั่วโมงที่เลือกให้ส่ง เช่น ["08:00", "12:00", "15:00", "18:00"]
  discordLastAutoOverdueBroadcast?: string; // วันที่และเวลาที่ส่งอัตโนมัติล่าสุด (ISO)
  discordLastAutoOverdueSlot?: string; // รอบเวลาล่าสุดที่ส่ง เช่น 08:00, 12:00
  discordSentSlotsToday?: string[]; // รายการรอบเวลาที่ส่งสำเร็จแล้วในวันนี้ เช่น ["2026-09-22_06:00", "2026-09-22_09:00"]
  lastAutoOverdueSlotKey?: string; // คีย์รอบเวลาล่าสุด เช่น 2026-09-22_11:30
  // Discord Bot integration
  discordBotToken?: string;
  discordBotEnabled?: boolean;
  discordChannelId?: string;
}

export interface Member {
  id: string;
  groupId: string;
  name: string; // Real or full name used on bank transfers
  nickname: string; // Friendly name for group tracking
  createdAt: string;
  initialCarryover?: number; // ยอดค้าง/ยอดสมทบยกมาตั้งต้น (ติดลบคือค้างจ่าย บวกคือจ่ายเกินทบมา)
  customLateFee?: number; // ค่าปรับเฉพาะบุคคล (0 = ไม่ปรับ หรือกำหนดตัวเลขที่ต้องการ)
  manualFine?: number; // ค่าปรับที่แอดมินสั่งปรับทันทีในสัปดาห์ปัจจุบัน (บาท - ปรับได้เลยไม่ต้องรอ)
  discordUserId?: string; // รหัส Discord User ID สำหรับแท็ก <@userId>
  discordUsername?: string; // ชื่อบัญชี Discord ของสมาชิก เช่น boy_123
}

export interface Transaction {
  id: string;
  groupId: string;
  memberId: string; // Linked member ID (or empty/unmatched string if not mapped yet)
  amount: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  bank: string;
  senderNameText: string; // The sender name string parsed from slip
  isAiParsed: boolean;
  notes?: string;
  createdAt: string;
  slipImageUrl?: string; // แนบรูปสลิปโอนเงิน (ดูได้เฉพาะหัวหน้ากลุ่ม)
}

export interface ParsedSlipResult {
  senderName: string;
  amount: number;
  date: string;
  time: string;
  bank: string;
  isSuccess: boolean;
  method?: string;
}

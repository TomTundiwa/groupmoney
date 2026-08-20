import { writeBatch, doc } from "firebase/firestore";
import { db } from "./firebase";
import { Group, Member, Transaction } from "../types";

export async function restoreStarterGroupData(): Promise<{ groupId: string; groupName: string }> {
  const batch = writeBatch(db);

  // Group created 4 weeks ago so that weekly rollover cycles and stats work seamlessly
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const currentWeekDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const groupId = "g-1";
  const group: Group = {
    id: groupId,
    name: "ก๊วนเตะบอลวันเสาร์",
    targetAmountPerMember: 200,
    lateFeePerWeek: 20,
    lateFeeNote: "ปรับสัปดาห์ละ 20 บาทเมื่อค้างชำระข้ามสัปดาห์",
    description: "ก๊วนเก็บเงินกองกลางรายสัปดาห์ เตะบอลทุกวันเสาร์",
    passcode: "1234",
    leaderPasscode: "8888",
    coLeaders: ["อาร์ม", "ต้น"],
    createdAt: fourWeeksAgo.toISOString(),
  };

  const members: Member[] = [
    {
      id: "m-1",
      groupId,
      name: "สมชาย รักดี",
      nickname: "ต้น",
      createdAt: fourWeeksAgo.toISOString(),
      initialCarryover: -200, // ค้างยกมา 200 + เป้าหมายรอบนี้ 200 = ยอดค้าง 400 บาท
    },
    {
      id: "m-2",
      groupId,
      name: "สมศักดิ์ มีสุข",
      nickname: "เอก",
      createdAt: fourWeeksAgo.toISOString(),
      initialCarryover: -200,
      customLateFee: 0, // ปลอดค่าปรับ
    },
    {
      id: "m-3",
      groupId,
      name: "กิตติศักดิ์ เจริญ",
      nickname: "บอย",
      createdAt: fourWeeksAgo.toISOString(),
      initialCarryover: -200,
    },
    {
      id: "m-4",
      groupId,
      name: "วีระพล ใจมั่น",
      nickname: "กอล์ฟ",
      createdAt: fourWeeksAgo.toISOString(),
      initialCarryover: -200,
    },
    {
      id: "m-5",
      groupId,
      name: "ชัยวัฒน์ บุญเรือง",
      nickname: "นัท",
      createdAt: fourWeeksAgo.toISOString(),
      initialCarryover: -200,
    },
    {
      id: "m-6",
      groupId,
      name: "ธนพล สุขสมบูรณ์",
      nickname: "ตั้ม",
      createdAt: fourWeeksAgo.toISOString(),
      initialCarryover: -200,
    },
    {
      id: "m-7",
      groupId,
      name: "ปิยะ วงศ์ใหญ่",
      nickname: "อาร์ม",
      createdAt: fourWeeksAgo.toISOString(),
      initialCarryover: -200,
    },
  ];

  const formatDateStr = (d: Date) => d.toISOString().split("T")[0];

  const transactions: Transaction[] = [
    // Historical transactions from previous weeks
    {
      id: "t-101",
      groupId,
      memberId: "m-1",
      amount: 200,
      date: formatDateStr(threeWeeksAgo),
      time: "18:30",
      bank: "KBANK",
      senderNameText: "นาย สมชาย รักดี",
      isAiParsed: true,
      notes: "โอนผ่าน K PLUS",
      createdAt: threeWeeksAgo.toISOString(),
    },
    {
      id: "t-102",
      groupId,
      memberId: "m-2",
      amount: 200,
      date: formatDateStr(threeWeeksAgo),
      time: "19:15",
      bank: "SCB",
      senderNameText: "นาย สมศักดิ์ มีสุข",
      isAiParsed: true,
      createdAt: threeWeeksAgo.toISOString(),
    },
  ];

  // Save to Firestore batch
  batch.set(doc(db, "groups", group.id), group);
  members.forEach((m) => {
    batch.set(doc(db, "members", m.id), m);
  });
  transactions.forEach((t) => {
    batch.set(doc(db, "transactions", t.id), t);
  });

  await batch.commit();

  return { groupId: group.id, groupName: group.name };
}

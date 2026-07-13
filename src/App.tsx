import React, { useState, useEffect } from "react";
import { Group, Member, Transaction, ParsedSlipResult } from "./types";
import Header from "./components/Header";
import WeeklyChart from "./components/WeeklyChart";
import SlipUploader from "./components/SlipUploader";
import MemberManager from "./components/MemberManager";
import TransactionHistory from "./components/TransactionHistory";
import { HelpCircle, Landmark, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { collection, doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot, writeBatch } from "firebase/firestore";
import { db } from "./lib/firebase";

export default function App() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deviceId, setDeviceId] = useState<string>(() => {
    let id = localStorage.getItem("sb_device_id");
    if (!id) {
      id = `DEV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      localStorage.setItem("sb_device_id", id);
    }
    return id;
  });
  const [activeGroupId, setActiveGroupId] = useState<string>(() => {
    return localStorage.getItem("sb_active_id") || "";
  });
  const [createdGroupIds, setCreatedGroupIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("sb_created_groups");
      if (saved) {
        return JSON.parse(saved);
      }
      // Migration: Treat already existing groups in storage as created by this user
      const localGroups = localStorage.getItem("sb_groups");
      if (localGroups) {
        const parsed = JSON.parse(localGroups);
        if (Array.isArray(parsed)) {
          return parsed.map((g: any) => g.id);
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const [onboardCode, setOnboardCode] = useState("");
  const [onboardError, setOnboardError] = useState("");
  const [onboardSuccess, setOnboardSuccess] = useState("");

  const [unlockedGroupIds, setUnlockedGroupIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("sb_unlocked_groups");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Compute leader status dynamically
  const isLeader = createdGroupIds.includes(activeGroupId);

  // Save unlocked group IDs and created group IDs to localStorage when changed
  useEffect(() => {
    localStorage.setItem("sb_unlocked_groups", JSON.stringify(unlockedGroupIds));
  }, [unlockedGroupIds]);

  useEffect(() => {
    localStorage.setItem("sb_created_groups", JSON.stringify(createdGroupIds));
  }, [createdGroupIds]);

  // Filter groups that the current user is authorized to see
  const visibleGroups = groups.filter((g) => {
    if (createdGroupIds.includes(g.id)) return true; // Creator can always see
    if (!g.passcode) return true; // Public group with no passcode
    return unlockedGroupIds.includes(g.id);
  });

  // Load state from Firestore in real-time
  useEffect(() => {
    const unsubscribeGroups = onSnapshot(collection(db, "groups"), (snapshot) => {
      const fetchedGroups: Group[] = [];
      snapshot.forEach((doc) => {
        fetchedGroups.push(doc.data() as Group);
      });
      fetchedGroups.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setGroups(fetchedGroups);
    });

    const unsubscribeMembers = onSnapshot(collection(db, "members"), (snapshot) => {
      const fetchedMembers: Member[] = [];
      snapshot.forEach((doc) => {
        fetchedMembers.push(doc.data() as Member);
      });
      setMembers(fetchedMembers);
    });

    const unsubscribeTransactions = onSnapshot(collection(db, "transactions"), (snapshot) => {
      const fetchedTransactions: Transaction[] = [];
      snapshot.forEach((doc) => {
        fetchedTransactions.push(doc.data() as Transaction);
      });
      fetchedTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTransactions(fetchedTransactions);
    });

    return () => {
      unsubscribeGroups();
      unsubscribeMembers();
      unsubscribeTransactions();
    };
  }, []);

  // Sync device profile from Firestore on mount & handle local migration
  useEffect(() => {
    if (!deviceId) return;

    const deviceRef = doc(db, "devices", deviceId);

    const syncDeviceProfile = async () => {
      try {
        const docSnap = await getDoc(deviceRef);
        let cloudCreated: string[] = [];
        let cloudUnlocked: string[] = [];
        let cloudActiveId = "";

        if (docSnap.exists()) {
          const data = docSnap.data();
          cloudCreated = data.createdGroupIds || [];
          cloudUnlocked = data.unlockedGroupIds || [];
          cloudActiveId = data.lastActiveGroupId || "";
        }

        // Merge cloud and local state to prevent losing access
        setCreatedGroupIds((prev) => {
          const merged = Array.from(new Set([...prev, ...cloudCreated]));
          localStorage.setItem("sb_created_groups", JSON.stringify(merged));
          return merged;
        });

        setUnlockedGroupIds((prev) => {
          const merged = Array.from(new Set([...prev, ...cloudUnlocked]));
          localStorage.setItem("sb_unlocked_groups", JSON.stringify(merged));
          return merged;
        });

        if (cloudActiveId && !activeGroupId) {
          setActiveGroupId(cloudActiveId);
          localStorage.setItem("sb_active_id", cloudActiveId);
        }

        // One-time migration: upload old localStorage data if present
        const localGroupsStr = localStorage.getItem("sb_groups");
        const localMembersStr = localStorage.getItem("sb_members");
        const localTxsStr = localStorage.getItem("sb_txs");

        if (localGroupsStr && !localStorage.getItem("sb_migrated_to_firestore")) {
          try {
            const localGroups = JSON.parse(localGroupsStr);
            const localMembers = localMembersStr ? JSON.parse(localMembersStr) : [];
            const localTxs = localTxsStr ? JSON.parse(localTxsStr) : [];

            if (Array.isArray(localGroups) && localGroups.length > 0) {
              const batch = writeBatch(db);
              localGroups.forEach((g) => {
                if (g.id !== "g-1") {
                  batch.set(doc(db, "groups", g.id), g);
                }
              });
              localMembers.forEach((m) => {
                batch.set(doc(db, "members", m.id), m);
              });
              localTxs.forEach((t) => {
                batch.set(doc(db, "transactions", t.id), t);
              });
              await batch.commit();
              console.log("Migrated local data to cloud successfully!");
            }
            localStorage.setItem("sb_migrated_to_firestore", "true");
          } catch (e) {
            console.error("Migration error:", e);
          }
        }
      } catch (err) {
        console.error("Error syncing device profile:", err);
      }
    };

    syncDeviceProfile();
  }, [deviceId]);

  // Push device profile changes to Firestore
  useEffect(() => {
    if (!deviceId) return;
    const updateDeviceCloud = async () => {
      try {
        await setDoc(doc(db, "devices", deviceId), {
          id: deviceId,
          createdGroupIds,
          unlockedGroupIds,
          lastActiveGroupId: activeGroupId,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Error backing up device state to Firestore:", err);
      }
    };
    updateDeviceCloud();
  }, [createdGroupIds, unlockedGroupIds, activeGroupId, deviceId]);

  // Auto-seed Demo group (ก๊วนเรียนรู้) if there are 0 groups in the system
  useEffect(() => {
    if (groups.length === 0) {
      const seedDemoGroup = async () => {
        try {
          const demoGroup: Group = {
            id: "demo-group",
            name: "ก๊วนทดลองเรียนรู้ (SlipBuddy Demo) 🎓",
            targetAmountPerMember: 150,
            description: "กลุ่มเรียนรู้การใช้งานสแกนสลิปและเช็คยอดเงิน ลองอัปโหลดสลิปจำลองเล่นได้เลยครับ!",
            passcode: "demo",
            createdAt: new Date().toISOString()
          };

          const demoMembers: Member[] = [
            { id: "m-demo-1", groupId: "demo-group", name: "สมยศ ใจโอน", nickname: "พี่สมยศ", createdAt: new Date().toISOString() },
            { id: "m-demo-2", groupId: "demo-group", name: "อนงค์ รักเรียน", nickname: "น้องอนงค์", createdAt: new Date().toISOString() },
            { id: "m-demo-3", groupId: "demo-group", name: "สมชาย สายโอน", nickname: "สมชาย", createdAt: new Date().toISOString() }
          ];

          const demoTransactions: Transaction[] = [
            {
              id: "t-demo-1",
              groupId: "demo-group",
              memberId: "m-demo-1",
              amount: 150,
              date: new Date().toISOString().split("T")[0],
              time: "10:30",
              bank: "ธนาคารกสิกรไทย",
              senderNameText: "นาย สมยศ ใจโอน",
              isAiParsed: true,
              notes: "สลิปจำลองระบุชื่อ สมยศ โอนเงินสำเร็จ",
              createdAt: new Date().toISOString()
            }
          ];

          const batch = writeBatch(db);
          batch.set(doc(db, "groups", "demo-group"), demoGroup);
          demoMembers.forEach((m) => {
            batch.set(doc(db, "members", m.id), m);
          });
          demoTransactions.forEach((t) => {
            batch.set(doc(db, "transactions", t.id), t);
          });
          await batch.commit();

          // Auto unlock for first-time device
          setUnlockedGroupIds((prev) => {
            const next = prev.includes("demo-group") ? prev : [...prev, "demo-group"];
            localStorage.setItem("sb_unlocked_groups", JSON.stringify(next));
            return next;
          });
        } catch (e) {
          console.error("Error seeding demo group:", e);
        }
      };
      seedDemoGroup();
    }
  }, [groups]);

  // Ensure activeGroupId is always set to a visible group
  useEffect(() => {
    if (visibleGroups.length > 0) {
      const isCurrentActiveVisible = visibleGroups.some((g) => g.id === activeGroupId);
      if (!isCurrentActiveVisible) {
        const nextActiveId = visibleGroups[0].id;
        setActiveGroupId(nextActiveId);
        localStorage.setItem("sb_active_id", nextActiveId);
      }
    } else {
      if (activeGroupId !== "") {
        setActiveGroupId("");
        localStorage.setItem("sb_active_id", "");
      }
    }
  }, [groups, unlockedGroupIds, isLeader, activeGroupId]);

  const handleGroupChange = (groupId: string) => {
    setActiveGroupId(groupId);
    localStorage.setItem("sb_active_id", groupId);
  };

  const handleAddGroup = async (name: string, targetPerPerson: number, description?: string, passcode?: string): Promise<{ success: boolean; error?: string }> => {
    const trimmedPasscode = passcode?.trim();
    if (trimmedPasscode) {
      const isDuplicate = groups.some(
        (g) => g.passcode && g.passcode.trim().toLowerCase() === trimmedPasscode.toLowerCase()
      );
      if (isDuplicate) {
        return { success: false, error: "รหัสผ่านกลุ่มนี้ถูกใช้งานแล้ว กรุณาใช้รหัสอื่นที่ไม่ซ้ำกัน" };
      }
    }

    const newGroupId = `g-${Date.now()}`;
    const newGroup: Group = {
      id: newGroupId,
      name,
      targetAmountPerMember: targetPerPerson,
      description: description || "",
      passcode: trimmedPasscode || "",
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "groups", newGroupId), newGroup);

      // Automatically unlock for creator
      setUnlockedGroupIds((prev) => {
        const next = prev.includes(newGroupId) ? prev : [...prev, newGroupId];
        localStorage.setItem("sb_unlocked_groups", JSON.stringify(next));
        return next;
      });

      // Track that the current user created this group
      setCreatedGroupIds((prev) => {
        const next = prev.includes(newGroupId) ? prev : [...prev, newGroupId];
        localStorage.setItem("sb_created_groups", JSON.stringify(next));
        return next;
      });

      setActiveGroupId(newGroupId);
      localStorage.setItem("sb_active_id", newGroupId);
      return { success: true };
    } catch (err: any) {
      console.error("Error creating group in Firestore:", err);
      return { success: false, error: "ไม่สามารถบันทึกข้อมูลไปยังระบบคลาวด์ได้" };
    }
  };

  const handleJoinGroupWithPasscode = (passcode: string): { success: boolean; groupName?: string; error?: string } => {
    const trimmed = passcode.trim();
    if (!trimmed) {
      return { success: false, error: "กรุณากรอกรหัสผ่านกลุ่ม" };
    }
    const foundGroup = groups.find((g) => g.passcode && g.passcode.trim() === trimmed);
    if (foundGroup) {
      setUnlockedGroupIds((prev) => {
        const next = prev.includes(foundGroup.id) ? prev : [...prev, foundGroup.id];
        localStorage.setItem("sb_unlocked_groups", JSON.stringify(next));
        return next;
      });
      setActiveGroupId(foundGroup.id);
      localStorage.setItem("sb_active_id", foundGroup.id);
      return { success: true, groupName: foundGroup.name };
    }
    return { success: false, error: "ไม่พบกลุ่มที่ตรงกับรหัสผ่านนี้ หรือรหัสผ่านไม่ถูกต้อง" };
  };

  const handleAddMember = async (name: string, nickname: string) => {
    const newMember: Member = {
      id: `m-${Date.now()}`,
      groupId: activeGroupId,
      name,
      nickname,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "members", newMember.id), newMember);
    } catch (err) {
      console.error("Error adding member:", err);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    const nickname = member ? member.nickname : "เพื่อนคนนี้";
    const associatedTxs = transactions.filter((t) => t.memberId === memberId && t.groupId === activeGroupId);

    if (associatedTxs.length > 0) {
      const confirmAll = confirm(
        `คุณต้องการลบรายชื่อ "${nickname}" พร้อมสลิปโอนเงินทั้งหมดของเขา (${associatedTxs.length} รายการ) ด้วยหรือไม่?\n\n- กด [ตกลง / OK] เพื่อลบทั้งรายชื่อและสลิปทั้งหมด\n- กด [ยกเลิก / Cancel] เพื่อเก็บสลิปไว้เป็นยอด "ไม่ระบุชื่อ" (ลบเฉพาะรายชื่อเพื่อน)`
      );
      
      try {
        if (confirmAll) {
          // Delete both member and transactions
          await deleteDoc(doc(db, "members", memberId));
          const batch = writeBatch(db);
          associatedTxs.forEach((tx) => {
            batch.delete(doc(db, "transactions", tx.id));
          });
          await batch.commit();
        } else {
          // Keep transactions but make them anonymous (unlinked)
          await deleteDoc(doc(db, "members", memberId));
          const batch = writeBatch(db);
          associatedTxs.forEach((tx) => {
            batch.update(doc(db, "transactions", tx.id), { memberId: "" });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error("Error deleting member and associated transactions:", err);
      }
    } else {
      if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายชื่อ "${nickname}"?`)) {
        try {
          await deleteDoc(doc(db, "members", memberId));
        } catch (err) {
          console.error("Error deleting member:", err);
        }
      }
    }
  };

  const handleEditMember = async (memberId: string, name: string, nickname: string, newTotalPaid?: number) => {
    try {
      await updateDoc(doc(db, "members", memberId), { name, nickname });

      if (newTotalPaid !== undefined) {
        const memberTxs = transactions.filter((t) => t.memberId === memberId && t.groupId === activeGroupId);
        const currentTotalPaid = memberTxs.reduce((sum, t) => sum + t.amount, 0);
        const difference = newTotalPaid - currentTotalPaid;

        if (difference !== 0) {
          if (memberTxs.length === 1) {
            await updateDoc(doc(db, "transactions", memberTxs[0].id), { amount: newTotalPaid });
          } else if (newTotalPaid === 0) {
            const batch = writeBatch(db);
            memberTxs.forEach((tx) => {
              batch.delete(doc(db, "transactions", tx.id));
            });
            await batch.commit();
          } else {
            if (memberTxs.length === 0) {
              const newTransaction: Transaction = {
                id: `t-${Date.now()}`,
                groupId: activeGroupId,
                memberId,
                amount: newTotalPaid,
                date: new Date().toISOString().split("T")[0],
                time: new Date().toTimeString().slice(0, 5),
                bank: "ปรับปรุงยอดโดยหัวหน้ากลุ่ม",
                senderNameText: name,
                isAiParsed: false,
                notes: "หัวหน้ากลุ่มปรับเปลี่ยนยอดเงินโดยตรง",
                createdAt: new Date().toISOString(),
              };
              await setDoc(doc(db, "transactions", newTransaction.id), newTransaction);
            } else {
              const lastTx = memberTxs[memberTxs.length - 1];
              await updateDoc(doc(db, "transactions", lastTx.id), { amount: lastTx.amount + difference });
            }
          }
        }
      }
    } catch (err) {
      console.error("Error editing member:", err);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการโอนเงินนี้?")) {
      try {
        await deleteDoc(doc(db, "transactions", txId));
      } catch (err) {
        console.error("Error deleting transaction:", err);
      }
    }
  };

  const handleEditTransaction = async (
    txId: string,
    amount: number,
    memberId: string,
    bank: string,
    notes?: string,
    date?: string,
    time?: string
  ) => {
    try {
      await updateDoc(doc(db, "transactions", txId), {
        amount,
        memberId,
        bank,
        notes: notes || "",
        date: date || "",
        time: time || "",
      });
    } catch (err) {
      console.error("Error editing transaction:", err);
    }
  };

  // Handle successful Slip Reading (Gemini AI or custom manual matching)
  const handleSlipUploadSuccess = async (
    parsed: ParsedSlipResult,
    memberId: string,
    createMemberName: string | null,
    createMemberNickname: string | null
  ) => {
    let finalMemberId = memberId;

    try {
      // Check if we need to create a new member first
      if (memberId === "new" && createMemberName && createMemberNickname) {
        const newMemberId = `m-${Date.now()}`;
        const newMember: Member = {
          id: newMemberId,
          groupId: activeGroupId,
          name: createMemberName,
          nickname: createMemberNickname,
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, "members", newMemberId), newMember);
        finalMemberId = newMemberId;
      }

      const newTransaction: Transaction = {
        id: `t-${Date.now()}`,
        groupId: activeGroupId,
        memberId: finalMemberId,
        amount: parsed.amount,
        date: parsed.date,
        time: parsed.time,
        bank: parsed.bank,
        senderNameText: parsed.senderName,
        isAiParsed: true,
        notes: "สแกนสลิปโอนเงินด้วยระบบ AI อัตโนมัติ",
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "transactions", newTransaction.id), newTransaction);
    } catch (err) {
      console.error("Error in slip upload success handling:", err);
    }
  };

  const handleAddManualTransaction = async (amount: number, memberId: string, bank: string, notes?: string) => {
    const matchedMember = members.find((m) => m.id === memberId);
    const newTransaction: Transaction = {
      id: `t-${Date.now()}`,
      groupId: activeGroupId,
      memberId,
      amount,
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      bank,
      senderNameText: matchedMember ? matchedMember.name : "กรอกด้วยมือ",
      isAiParsed: false,
      notes: notes || "",
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "transactions", newTransaction.id), newTransaction);
    } catch (err) {
      console.error("Error adding manual transaction:", err);
    }
  };

  const handleOnboardJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardCode.trim()) return;
    const result = handleJoinGroupWithPasscode(onboardCode);
    if (result.success) {
      setOnboardSuccess(result.groupName || "สำเร็จ");
      setOnboardError("");
      setOnboardCode("");
      setTimeout(() => {
        setOnboardSuccess("");
      }, 3000);
    } else {
      setOnboardError(result.error || "ไม่พบกลุ่มหรือรหัสผ่านไม่ถูกต้อง");
      setOnboardSuccess("");
    }
  };

  const handleSyncDevice = async (targetDeviceId: string): Promise<{ success: boolean; error?: string }> => {
    if (!targetDeviceId.trim()) return { success: false, error: "กรุณาระบุรหัสเครื่องที่ต้องการเชื่อมต่อ" };
    const cleanedId = targetDeviceId.trim().toUpperCase();
    
    try {
      const deviceRef = doc(db, "devices", cleanedId);
      const docSnap = await getDoc(deviceRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const cloudCreated = data.createdGroupIds || [];
        const cloudUnlocked = data.unlockedGroupIds || [];
        const cloudActiveId = data.lastActiveGroupId || "";

        // Save target Device ID locally
        setDeviceId(cleanedId);
        localStorage.setItem("sb_device_id", cleanedId);

        setCreatedGroupIds(cloudCreated);
        localStorage.setItem("sb_created_groups", JSON.stringify(cloudCreated));

        setUnlockedGroupIds(cloudUnlocked);
        localStorage.setItem("sb_unlocked_groups", JSON.stringify(cloudUnlocked));

        if (cloudActiveId) {
          setActiveGroupId(cloudActiveId);
          localStorage.setItem("sb_active_id", cloudActiveId);
        }
        
        return { success: true };
      } else {
        return { success: false, error: "ไม่พบรหัสเครื่องนี้ในระบบ กรุณาตรวจสอบความถูกต้องอีกครั้ง" };
      }
    } catch (err) {
      console.error("Error syncing device:", err);
      return { success: false, error: "เกิดข้อผิดพลาดในการเชื่อมต่อระบบคลาวด์" };
    }
  };

  const handleDeleteActiveGroup = async () => {
    if (!activeGroupId) return;

    try {
      // Find all members of this group
      const groupMembers = members.filter((m) => m.groupId === activeGroupId);
      // Find all transactions of this group
      const groupTxs = transactions.filter((t) => t.groupId === activeGroupId);

      const batch = writeBatch(db);

      // Delete group members
      groupMembers.forEach((member) => {
        batch.delete(doc(db, "members", member.id));
      });

      // Delete group transactions
      groupTxs.forEach((tx) => {
        batch.delete(doc(db, "transactions", tx.id));
      });

      // Delete the group itself
      batch.delete(doc(db, "groups", activeGroupId));

      await batch.commit();

      // Clean up local tracking
      const updatedCreatedGroupIds = createdGroupIds.filter((id) => id !== activeGroupId);
      const updatedUnlockedGroupIds = unlockedGroupIds.filter((id) => id !== activeGroupId);

      setCreatedGroupIds(updatedCreatedGroupIds);
      setUnlockedGroupIds(updatedUnlockedGroupIds);
      localStorage.setItem("sb_created_groups", JSON.stringify(updatedCreatedGroupIds));
      localStorage.setItem("sb_unlocked_groups", JSON.stringify(updatedUnlockedGroupIds));

      // Choose next active group
      const updatedGroups = groups.filter((g) => g.id !== activeGroupId);
      const visibleGroupsAfterDelete = updatedGroups.filter((g) => {
        if (updatedCreatedGroupIds.includes(g.id)) return true;
        if (!g.passcode) return true;
        return updatedUnlockedGroupIds.includes(g.id);
      });

      const nextActiveId = visibleGroupsAfterDelete[0]?.id || "";
      setActiveGroupId(nextActiveId);
      localStorage.setItem("sb_active_id", nextActiveId);
    } catch (err) {
      console.error("Error deleting active group from Firestore:", err);
    }
  };

  // Filter members and transactions by current active group
  const activeMembers = members.filter((m) => m.groupId === activeGroupId);
  const activeTransactions = transactions.filter((t) => t.groupId === activeGroupId);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" id="app-root">
      {/* Header Stat Board */}
      <Header
        groups={visibleGroups}
        activeGroupId={activeGroupId}
        onGroupChange={handleGroupChange}
        onAddGroup={handleAddGroup}
        onJoinGroupWithPasscode={handleJoinGroupWithPasscode}
        members={activeMembers}
        transactions={activeTransactions}
        isLeader={isLeader}
        onDeleteActiveGroup={handleDeleteActiveGroup}
        createdGroupIds={createdGroupIds}
        deviceId={deviceId}
        onSyncDevice={handleSyncDevice}
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8" id="main-content">
        {activeGroup ? (
          <div className="space-y-6">
            {/* Header info */}
            {activeGroup.description && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  <strong className="text-slate-300">รายละเอียดกลุ่ม:</strong> {activeGroup.description}
                </span>
              </div>
            )}

            {/* Weekly Analytics Section */}
            <WeeklyChart transactions={activeTransactions} members={activeMembers} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Slip Scanner Box (Col-span 7) */}
              <div className="lg:col-span-7 space-y-6">
                <SlipUploader
                  members={activeMembers}
                  onUploadSuccess={handleSlipUploadSuccess}
                  activeGroupId={activeGroupId}
                />
                <TransactionHistory
                  transactions={activeTransactions}
                  members={activeMembers}
                  onAddManualTransaction={handleAddManualTransaction}
                  onDeleteTransaction={handleDeleteTransaction}
                  onEditTransaction={handleEditTransaction}
                  isLeader={isLeader}
                  isGlobalLeader={isLeader}
                />
              </div>

              {/* Members Ledger Box (Col-span 5) */}
              <div className="lg:col-span-5">
                <MemberManager
                  members={activeMembers}
                  transactions={activeTransactions}
                  targetAmountPerMember={activeGroup.targetAmountPerMember}
                  onAddMember={handleAddMember}
                  onDeleteMember={handleDeleteMember}
                  onEditMember={handleEditMember}
                  isLeader={isLeader}
                  isGlobalLeader={isLeader}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto">
            <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-3xl border border-emerald-500/15 mb-6 shadow-inner animate-pulse">
              <Landmark className="w-12 h-12" />
            </div>
            <h2 className="text-xl font-bold font-sans tracking-tight mb-2">ยินดีต้อนรับสู่ก๊วนสลิปบัดดี้ (SlipBuddy) 👋</h2>
            <p className="text-sm text-slate-400 font-sans mb-8 leading-relaxed">
              คุณยังไม่ได้เลือกกลุ่ม หรือกลุ่มของคุณเป็นกลุ่มส่วนตัวที่ต้องใช้รหัสผ่านในการเข้าร่วม กรุณาเข้าร่วมกลุ่มด้วยรหัสผ่าน หรือสร้างกลุ่มใหม่ด้านบนเพื่อเริ่มต้น!
            </p>

            <form onSubmit={handleOnboardJoinSubmit} className="w-full bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-xl">
              <div className="text-left">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5 font-sans">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> ป้อนรหัสผ่านเพื่อเข้าร่วมก๊วนเพื่อน
                </label>
                <input
                  type="text"
                  required
                  value={onboardCode}
                  onChange={(e) => setOnboardCode(e.target.value)}
                  placeholder="เช่น รหัสผ่าน 4 หลัก หรือชื่อก๊วนที่หัวหน้ากลุ่มตั้งไว้"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-base font-mono focus:outline-none focus:border-emerald-500 text-slate-100 transition shadow-inner"
                />
              </div>

              {onboardError && (
                <p className="text-xs text-rose-400 font-sans text-center">
                  ⚠️ {onboardError}
                </p>
              )}

              {onboardSuccess && (
                <p className="text-xs text-emerald-400 font-sans font-bold text-center">
                  🎉 เข้าร่วมก๊วน "{onboardSuccess}" สำเร็จ! กำลังพาเข้ากลุ่ม...
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-sm transition focus:outline-none shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span>ค้นหาและเข้าร่วมก๊วน</span>
              </button>
            </form>

            <div className="mt-8 border-t border-slate-900 pt-6 w-full text-xs text-slate-500 font-sans">
              <p>💡 คำแนะนำสำหรับหัวหน้ากลุ่ม (Leader):</p>
              <p className="mt-1">
                คลิกปุ่ม <strong className="text-emerald-400">"หัวหน้ากลุ่ม"</strong> ด้านบนเพื่อยืนยันรหัสผ่านหัวหน้ากลุ่ม จากนั้นกดปุ่ม <strong className="text-emerald-400">"+ กลุ่มใหม่"</strong> เพื่อสร้างก๊วนแรกของคุณพร้อมกำหนดรหัสผ่านเข้ากลุ่ม
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="w-full bg-slate-950 border-t border-slate-900 text-slate-600 py-6 text-center text-xs font-mono mt-12">
        <p>© 2026 SlipBuddy. สแกนสลิปยึดใจเพื่อน ตรวจจับสลิปด้วย AI ล้ำสมัย</p>
      </footer>
    </div>
  );
}

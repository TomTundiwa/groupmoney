import React, { useState, useEffect } from "react";
import { Group, Member, Transaction, ParsedSlipResult } from "./types";
import Header from "./components/Header";
import WeeklyChart from "./components/WeeklyChart";
import SlipUploader from "./components/SlipUploader";
import MemberManager from "./components/MemberManager";
import TransactionHistory from "./components/TransactionHistory";
import { HelpCircle, Landmark, Sparkles, ShieldAlert, ShieldCheck, Trash2, Key, Share2, Copy, Check, Settings, Crown, Users, Pencil, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
  const [profileNickname, setProfileNickname] = useState<string>(() => localStorage.getItem("sb_profile_nickname") || "");
  const [profileRealName, setProfileRealName] = useState<string>(() => localStorage.getItem("sb_profile_realname") || "");
  const [profileEmoji, setProfileEmoji] = useState<string>(() => localStorage.getItem("sb_profile_emoji") || "🦊");
  const [profileMemberId, setProfileMemberId] = useState<string>(() => localStorage.getItem("sb_profile_member_id") || "");

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

  const [showMainDeleteConfirm, setShowMainDeleteConfirm] = useState(false);
  const [showMainDeleteSuccess, setShowMainDeleteSuccess] = useState(false);
  const [copiedGroupPasscode, setCopiedGroupPasscode] = useState(false);

  // Group edit states for Leader
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editTargetAmount, setEditTargetAmount] = useState<number>(200);
  const [editGroupDesc, setEditGroupDesc] = useState("");
  const [editGroupPasscode, setEditGroupPasscode] = useState("");
  const [editGroupError, setEditGroupError] = useState("");
  const [editGroupSuccess, setEditGroupSuccess] = useState(false);
  const [editLateFeePerWeek, setEditLateFeePerWeek] = useState<number>(0);
  const [editLateFeeNote, setEditLateFeeNote] = useState("");
  const [editLeaderPasscode, setEditLeaderPasscode] = useState("");
  const [editCoLeadersInput, setEditCoLeadersInput] = useState("");
  const [claimLeaderPasscodeInput, setClaimLeaderPasscodeInput] = useState("");
  const [claimLeaderError, setClaimLeaderError] = useState("");
  const [claimLeaderSuccess, setClaimLeaderSuccess] = useState(false);

  const [unlockedGroupIds, setUnlockedGroupIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("sb_unlocked_groups");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Compute leader status dynamically (Creator has leader status)
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
        let cloudNickname = "";
        let cloudRealName = "";
        let cloudEmoji = "🦊";
        let cloudMemberId = "";

        if (docSnap.exists()) {
          const data = docSnap.data();
          cloudCreated = data.createdGroupIds || [];
          cloudUnlocked = data.unlockedGroupIds || [];
          cloudActiveId = data.lastActiveGroupId || "";
          cloudNickname = data.profileNickname || "";
          cloudRealName = data.profileRealName || "";
          cloudEmoji = data.profileEmoji || "🦊";
          cloudMemberId = data.profileMemberId || "";
        }

        if (cloudNickname) {
          setProfileNickname(cloudNickname);
          localStorage.setItem("sb_profile_nickname", cloudNickname);
        }
        if (cloudRealName) {
          setProfileRealName(cloudRealName);
          localStorage.setItem("sb_profile_realname", cloudRealName);
        }
        if (cloudEmoji) {
          setProfileEmoji(cloudEmoji);
          localStorage.setItem("sb_profile_emoji", cloudEmoji);
        }
        if (cloudMemberId) {
          setProfileMemberId(cloudMemberId);
          localStorage.setItem("sb_profile_member_id", cloudMemberId);
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
          profileNickname,
          profileRealName,
          profileEmoji,
          profileMemberId,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Error backing up device state to Firestore:", err);
      }
    };
    updateDeviceCloud();
  }, [createdGroupIds, unlockedGroupIds, activeGroupId, deviceId, profileNickname, profileRealName, profileEmoji, profileMemberId]);



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
      initialCarryover: 0,
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
                bank: "ปรับปรุงยอดโดยแอดมิน",
                senderNameText: name,
                isAiParsed: false,
                notes: "แอดมินปรับเปลี่ยนยอดเงินสะสม",
                createdAt: new Date().toISOString(),
              };
              await setDoc(doc(db, "transactions", newTransaction.id), newTransaction);
            } else {
              const lastTx = memberTxs[memberTxs.length - 1];
              if (lastTx.amount + difference > 0) {
                await updateDoc(doc(db, "transactions", lastTx.id), { amount: lastTx.amount + difference });
              } else {
                const newTransaction: Transaction = {
                  id: `t-${Date.now()}`,
                  groupId: activeGroupId,
                  memberId,
                  amount: difference,
                  date: new Date().toISOString().split("T")[0],
                  time: new Date().toTimeString().slice(0, 5),
                  bank: "ปรับปรุงยอดโดยแอดมิน",
                  senderNameText: name,
                  isAiParsed: false,
                  notes: "แอดมินปรับเปลี่ยนยอดเงิน",
                  createdAt: new Date().toISOString(),
                };
                await setDoc(doc(db, "transactions", newTransaction.id), newTransaction);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Error editing member:", err);
    }
  };

  const handleUpdateGroupLateFee = async (lateFeePerWeek: number, lateFeeNote: string) => {
    if (!activeGroupId) return;
    try {
      await updateDoc(doc(db, "groups", activeGroupId), {
        lateFeePerWeek,
        lateFeeNote,
      });
    } catch (err) {
      console.error("Error updating group late fee:", err);
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

  const handleUpdateProfile = async (nickname: string, realName: string, emoji: string, memberId: string) => {
    let finalMemberId = memberId;

    if (memberId === "create_new" && activeGroupId) {
      const newMemberId = `m-${Date.now()}`;
      const newMember: Member = {
        id: newMemberId,
        groupId: activeGroupId,
        name: realName || nickname || "ฉันเอง",
        nickname: nickname || "ฉันเอง",
        createdAt: new Date().toISOString(),
      };
      try {
        await setDoc(doc(db, "members", newMemberId), newMember);
        finalMemberId = newMemberId;
      } catch (err) {
        console.error("Error creating member for profile:", err);
      }
    }

    setProfileNickname(nickname);
    setProfileRealName(realName);
    setProfileEmoji(emoji);
    setProfileMemberId(finalMemberId);

    localStorage.setItem("sb_profile_nickname", nickname);
    localStorage.setItem("sb_profile_realname", realName);
    localStorage.setItem("sb_profile_emoji", emoji);
    localStorage.setItem("sb_profile_member_id", finalMemberId);

    // If linked to an existing member, update that member's name & nickname in database
    if (finalMemberId && finalMemberId !== "create_new") {
      try {
        await updateDoc(doc(db, "members", finalMemberId), {
          nickname,
          name: realName || nickname
        });
      } catch (err) {
        console.error("Error updating linked member:", err);
      }
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

  const handleChangeDeviceId = async (newId: string): Promise<{ success: boolean; error?: string }> => {
    const trimmed = newId.trim().toUpperCase();
    if (!trimmed) {
      return { success: false, error: "กรุณาระบุรหัสจำเครื่องที่ถูกต้อง" };
    }
    if (trimmed.length < 3) {
      return { success: false, error: "รหัสจำเครื่องต้องมีอย่างน้อย 3 ตัวอักษรขึ้นไป" };
    }
    
    try {
      setDeviceId(trimmed);
      localStorage.setItem("sb_device_id", trimmed);
      return { success: true };
    } catch (err) {
      console.error("Error changing device key:", err);
      return { success: false, error: "เกิดข้อผิดพลาดในการตั้งรหัสจำเครื่อง" };
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

      // Prevent the demo-group from auto-regenerating if the user chose to delete it to start real usage
      if (activeGroupId === "demo-group") {
        localStorage.setItem("sb_demo_dismissed", "true");
      }

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

  const handleEditGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupId) return;
    if (!editGroupName.trim()) {
      setEditGroupError("กรุณาระบุชื่อกลุ่ม");
      return;
    }
    if (!editTargetAmount || editTargetAmount <= 0) {
      setEditGroupError("กรุณาระบุยอดเงินเป้าหมายต่อคนที่ถูกต้อง (มากกว่า 0 บาท)");
      return;
    }

    try {
      const groupRef = doc(db, "groups", activeGroupId);
      await setDoc(
        groupRef,
        {
          name: editGroupName.trim(),
          targetAmountPerMember: editTargetAmount,
          lateFeePerWeek: editLateFeePerWeek,
          lateFeeNote: editLateFeeNote.trim(),
          description: editGroupDesc.trim(),
          passcode: editGroupPasscode.trim(),
          leaderPasscode: editLeaderPasscode.trim(),
          coLeaders: editCoLeadersInput
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        { merge: true }
      );
      setEditGroupSuccess(true);
      setEditGroupError("");
      setTimeout(() => {
        setShowEditGroupModal(false);
        setEditGroupSuccess(false);
      }, 1000);
    } catch (err) {
      console.error("Error updating group:", err);
      setEditGroupError("เกิดข้อผิดพลาดในการบันทึกข้อมูลกลุ่ม");
    }
  };

  const handleClaimLeader = (e: React.FormEvent) => {
    e.preventDefault();
    setClaimLeaderError("");
    setClaimLeaderSuccess(false);
    const currentGroup = groups.find((g) => g.id === activeGroupId);
    if (!currentGroup) return;

    if (!currentGroup.leaderPasscode && !currentGroup.passcode) {
      setCreatedGroupIds((prev) => {
        const next = Array.from(new Set([...prev, currentGroup.id]));
        localStorage.setItem("sb_created_groups", JSON.stringify(next));
        return next;
      });
      setClaimLeaderSuccess(true);
      return;
    }

    const inputCode = claimLeaderPasscodeInput.trim();
    if (
      (currentGroup.leaderPasscode && inputCode === currentGroup.leaderPasscode) ||
      (currentGroup.passcode && inputCode === currentGroup.passcode)
    ) {
      setCreatedGroupIds((prev) => {
        const next = Array.from(new Set([...prev, currentGroup.id]));
        localStorage.setItem("sb_created_groups", JSON.stringify(next));
        return next;
      });
      setClaimLeaderSuccess(true);
      setClaimLeaderPasscodeInput("");
    } else {
      setClaimLeaderError("รหัสผ่านหัวหน้ากลุ่มไม่ถูกต้อง กรุณาตรวจสอบรหัสใหม่อีกครั้ง");
    }
  };

  const openGroupSettingsModal = () => {
    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return;
    setEditGroupName(group.name);
    setEditTargetAmount(group.targetAmountPerMember);
    setEditLateFeePerWeek(group.lateFeePerWeek || 0);
    setEditLateFeeNote(group.lateFeeNote || "");
    setEditGroupDesc(group.description || "");
    setEditGroupPasscode(group.passcode || "");
    setEditLeaderPasscode(group.leaderPasscode || "");
    setEditCoLeadersInput((group.coLeaders || []).join(", "));
    setEditGroupError("");
    setEditGroupSuccess(false);
    setClaimLeaderError("");
    setClaimLeaderSuccess(false);
    setClaimLeaderPasscodeInput("");
    setShowEditGroupModal(true);
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
        onChangeDeviceId={handleChangeDeviceId}
        profileNickname={profileNickname}
        profileRealName={profileRealName}
        profileEmoji={profileEmoji}
        profileMemberId={profileMemberId}
        onUpdateProfile={handleUpdateProfile}
        onOpenGroupSettings={openGroupSettingsModal}
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8" id="main-content">
        {activeGroup ? (
          <div className="space-y-6">
            {/* Group Administration & Information Control Board */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-xl" id="group-admin-board">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                
                {/* Left side: Info & Sharing */}
                <div className="flex-1 space-y-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg md:text-xl font-sans font-bold text-slate-100 flex items-center gap-2">
                      <span>{activeGroup.name}</span>
                    </h2>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                      เป้าหมาย: ฿{activeGroup.targetAmountPerMember.toLocaleString("th-TH")} / คน
                    </span>
                    <button
                      type="button"
                      onClick={openGroupSettingsModal}
                      className="flex items-center gap-1.5 text-[11px] font-sans font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 hover:border-amber-500/50 px-3 py-1 rounded-full transition cursor-pointer shadow-sm"
                      title="ตั้งค่าก๊วน ค่าปรับจ่ายล่าช้า และจัดการสิทธิ์หัวหน้ากลุ่ม"
                    >
                      <Settings className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
                      <span>⚙️ ตั้งค่า / แอดหัวหน้ากลุ่ม</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed max-w-2xl font-sans">
                    <strong className="text-slate-300">รายละเอียดกลุ่ม: </strong>
                    {activeGroup.description || "ไม่มีรายละเอียดคำอธิบายกลุ่ม"}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 border-t border-slate-800/60">
                    {activeGroup.passcode ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-sans flex items-center gap-1">
                          <Key className="w-3.5 h-3.5 text-amber-400" /> แชร์รหัสกลุ่มให้เพื่อนร่วมก๊วน:
                        </span>
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1 flex items-center gap-2 text-xs font-mono">
                          <span className="text-amber-400 font-bold tracking-wider">{activeGroup.passcode}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(activeGroup.passcode || "");
                              setCopiedGroupPasscode(true);
                              setTimeout(() => setCopiedGroupPasscode(false), 2000);
                            }}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                            title="คัดลอกรหัสเข้ากลุ่ม"
                          >
                            {copiedGroupPasscode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
                        <span>กลุ่มก๊วนนี้เป็นสาธารณะ ไม่จำเป็นต้องใช้รหัสผ่านในการค้นหา</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Admin Management (For Leader / Non-leader views) */}
                <div className="shrink-0 md:pl-6 md:border-l md:border-slate-800/80">
                  {isLeader ? (
                    <div className="flex flex-col items-start md:items-end justify-center space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold bg-amber-400/5 px-3 py-1.5 rounded-xl border border-amber-400/10 shadow-sm font-sans">
                        <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>👑 คุณเป็นหัวหน้ากลุ่มก๊วนนี้</span>
                      </div>
                      <p className="text-[11px] text-slate-400 text-left md:text-right leading-relaxed max-w-xs font-sans">
                        คุณคือผู้ดูแลก๊วนนี้ สามารถตั้งค่าเป้าหมาย ค่าปรับล่าช้า และแอดหัวหน้ากลุ่มได้ที่ปุ่มฟันเฟือง
                      </p>
                      <div className="flex flex-wrap md:justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={openGroupSettingsModal}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 rounded-xl text-xs font-sans font-bold transition duration-200 cursor-pointer shadow-sm"
                        >
                          <Settings className="w-3.5 h-3.5 text-amber-400" />
                          <span>⚙️ ตั้งค่า / แอดหัวหน้ากลุ่ม</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowMainDeleteConfirm(true)}
                          className="flex items-center gap-2 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 rounded-xl text-xs font-sans font-bold transition duration-200 cursor-pointer shadow-sm"
                          title="ลบเซิฟเวอร์กลุ่มสะสมเงินนี้อย่างถาวร"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>ลบก๊วนนี้</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start md:items-end justify-center space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/5 px-3 py-1.5 rounded-xl border border-emerald-500/10 shadow-sm font-sans">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>คุณคือสมาชิกกลุ่มก๊วนนี้</span>
                      </div>
                      <p className="text-[11px] text-slate-500 text-left md:text-right leading-relaxed max-w-xs font-sans">
                        ต้องการสิทธิ์หัวหน้ากลุ่มหรือแก้ไขตั้งค่า? กดปุ่มฟันเฟืองเพื่อกรอกรหัสแอดหัวหน้ากลุ่มได้เลยครับ
                      </p>
                      <button
                        type="button"
                        onClick={openGroupSettingsModal}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 hover:border-amber-500/50 rounded-xl text-xs font-sans font-bold transition duration-200 cursor-pointer shadow-sm mt-1"
                      >
                        <Settings className="w-3.5 h-3.5 text-amber-400" />
                        <span>⚙️ ตั้งค่า / แอดหัวหน้ากลุ่ม</span>
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Weekly Analytics Section */}
            <WeeklyChart transactions={activeTransactions} members={activeMembers} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Slip Scanner Box (Col-span 7) */}
              <div className="lg:col-span-7 space-y-6">
                <SlipUploader
                  members={activeMembers}
                  onUploadSuccess={handleSlipUploadSuccess}
                  activeGroupId={activeGroupId}
                  profileMemberId={profileMemberId}
                  profileRealName={profileRealName}
                  profileNickname={profileNickname}
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
                  lateFeePerWeek={activeGroup.lateFeePerWeek || 0}
                  lateFeeNote={activeGroup.lateFeeNote || ""}
                  groupCreatedAt={activeGroup.createdAt}
                  onAddMember={handleAddMember}
                  onDeleteMember={handleDeleteMember}
                  onEditMember={handleEditMember}
                  onUpdateLateFee={handleUpdateGroupLateFee}
                  isLeader={isLeader}
                  isGlobalLeader={isLeader}
                  profileMemberId={profileMemberId}
                  profileEmoji={profileEmoji}
                  profileNickname={profileNickname}
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

      {/* Main Delete Confirmation Modal */}
      <AnimatePresence>
        {showMainDeleteConfirm && (
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
                  <h3 className="text-lg font-bold font-sans">ยืนยันลบเซิฟเวอร์นี้อย่างถาวร?</h3>
                  <p className="text-[11px] text-rose-400/80 font-mono mt-0.5 font-bold">PERMANENT DELETION</p>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-300 font-sans mb-6">
                <p>
                  คุณกำลังจะลบเซิฟเวอร์กลุ่ม <strong className="text-rose-400 font-semibold">"{activeGroup?.name}"</strong> ออกจากฐานข้อมูลระบบคลาวด์อย่างถาวร
                </p>
                <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 text-xs text-rose-300/90 space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-rose-300">🚨 สิ่งที่จะเกิดขึ้นเมื่อลบ:</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>รายชื่อสมาชิกทุกคนในกลุ่มก๊วนนี้จะถูกลบทั้งหมด</li>
                    <li>ประวัติสลิปและการโอนเงินทั้งหมดจะถูกทำลาย</li>
                    <li>ลิงก์เข้ากลุ่มและรหัสผ่านจะไม่สามารถใช้งานได้อีกต่อไป</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 font-sans">
                <button
                  type="button"
                  onClick={() => setShowMainDeleteConfirm(false)}
                  className="px-4 py-2.5 text-slate-400 hover:text-slate-200 transition text-sm font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleDeleteActiveGroup();
                    setShowMainDeleteConfirm(false);
                    setShowMainDeleteSuccess(true);
                  }}
                  className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-slate-100 rounded-xl font-bold text-sm transition shadow-lg shadow-rose-950/50 cursor-pointer"
                >
                  ใช่, ลบเซิฟเวอร์นี้
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Delete Success Modal */}
      <AnimatePresence>
        {showMainDeleteSuccess && (
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
              <h3 className="text-lg font-bold text-slate-100 font-sans mb-2">ลบข้อมูลเซิฟเวอร์เสร็จสิ้น!</h3>
              <p className="text-xs text-slate-400 font-sans mb-6 leading-relaxed">
                ระบบได้ดำเนินการลบข้อมูลกลุ่มและทำลายประวัติสลิปทั้งหมดออกจากฐานข้อมูลคลาวด์เรียบร้อยแล้วครับ 🚀
              </p>
              <button
                type="button"
                onClick={() => setShowMainDeleteSuccess(false)}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-sm transition focus:outline-none cursor-pointer"
              >
                ตกลง
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Leader & Settings Group Modal (Group Info, Late Fee, and Leader Access) */}
      <AnimatePresence>
        {showEditGroupModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5 text-amber-400">
                  <div className="p-2 bg-amber-400/10 rounded-xl border border-amber-400/20">
                    <Settings className="w-5 h-5 animate-spin-slow" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-sans">ตั้งค่าก๊วน & จัดการสิทธิ์หัวหน้ากลุ่ม</h3>
                    <p className="text-[11px] text-slate-400 font-sans">
                      {isLeader ? "👑 โหมดผู้ดูแลก๊วน (Leader Mode)" : "🛡️ โหมดสมาชิก (Member View)"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditGroupModal(false)}
                  className="text-slate-400 hover:text-slate-200 transition text-sm font-bold cursor-pointer p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6 font-sans">
                {/* SECTION 1: Group Basic Settings (Leader Only) */}
                {isLeader ? (
                  <form onSubmit={handleEditGroupSubmit} className="space-y-4">
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-4">
                      <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5 text-amber-400" />
                        <span>1. ตั้งค่าข้อมูลก๊วน & ยอดเป้าหมายสะสม</span>
                      </h4>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          💰 ยอดเงินรวมเป้าหมายต่อคน (บาท / สัปดาห์) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          value={editTargetAmount}
                          onChange={(e) => setEditTargetAmount(Number(e.target.value))}
                          placeholder="เช่น 200, 300, 500"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono focus:outline-none focus:border-amber-400 text-amber-400 font-bold transition shadow-inner"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            ชื่อกลุ่มก๊วน <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={editGroupName}
                            onChange={(e) => setEditGroupName(e.target.value)}
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-slate-100 transition shadow-inner"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            รหัสผ่านเข้ากลุ่ม (Passcode)
                          </label>
                          <input
                            type="text"
                            value={editGroupPasscode}
                            onChange={(e) => setEditGroupPasscode(e.target.value)}
                            placeholder="เว้นว่างถ้าเป็นสาธารณะ"
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-400 text-amber-300 transition shadow-inner"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          คำอธิบายรายละเอียดกลุ่ม (ไม่บังคับ)
                        </label>
                        <textarea
                          rows={2}
                          value={editGroupDesc}
                          onChange={(e) => setEditGroupDesc(e.target.value)}
                          placeholder="รายละเอียดก๊วนสะสมเงิน เช่น วัตถุประสงค์ หรือกติกาในกลุ่ม"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-slate-200 transition shadow-inner resize-none"
                        />
                      </div>
                    </div>

                    {/* SECTION 2: Late Payment Fee Rules */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-4">
                      <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        <span>2. ตั้งค่าปรับจ่ายล่าช้า (Late Payment Fee)</span>
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            ⚡ ค่าปรับล่าช้า (บาท / สัปดาห์)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={editLateFeePerWeek}
                            onChange={(e) => setEditLateFeePerWeek(Number(e.target.value))}
                            placeholder="เช่น 20, 50 (0 = ไม่มีค่าปรับ)"
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono focus:outline-none focus:border-rose-400 text-rose-400 font-bold transition shadow-inner"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            เงื่อนไข / หมายเหตุค่าปรับ
                          </label>
                          <input
                            type="text"
                            value={editLateFeeNote}
                            onChange={(e) => setEditLateFeeNote(e.target.value)}
                            placeholder="เช่น ปรับถ้าจ่ายเกินวันอาทิตย์"
                            className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-rose-400 text-slate-200 transition shadow-inner"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        💡 เมื่อตั้งค่าปรับ ระบบจะคิดค่าปรับอัตโนมัติทุก 00:01 ของวันจันทร์ สำหรับสมาชิกที่มียอดค้างชำระยกมาจากสัปดาห์ก่อนหน้า (ยอดค่าปรับหากจ่ายแล้วจะไม่ทบอาทิตย์ถัดไป • ค้างจ่ายถ้าจ่ายครบแล้วจะหายไป ไม่เอาไปทบสัปดาห์อื่น • ยอดทบคือยอดที่จ่ายเกินทั้งค่าปรับและยอดรายอาทิตย์)
                      </p>
                    </div>

                    {/* SECTION 3: Leader Management & Co-Leaders (Leader Only) */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-4">
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Crown className="w-3.5 h-3.5 text-emerald-400" />
                        <span>3. จัดการแอดหัวหน้ากลุ่ม & ผู้ดูแลร่วม</span>
                      </h4>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          👑 รายชื่อหัวหน้ากลุ่มร่วม (Co-Leaders)
                        </label>
                        <input
                          type="text"
                          value={editCoLeadersInput}
                          onChange={(e) => setEditCoLeadersInput(e.target.value)}
                          placeholder="เช่น อาร์ม, แจน, มิว (คั่นด้วยเครื่องหมายจุลภาค ,)"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-slate-100 transition shadow-inner"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          ระบุชื่อเล่นหรือชื่อสมาชิกที่จะแสดงป้ายหัวหน้ากลุ่มในหน้าตารางสมาชิก
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          🔑 รหัสแอดหัวหน้ากลุ่ม (Leader Access Passcode)
                        </label>
                        <input
                          type="text"
                          value={editLeaderPasscode}
                          onChange={(e) => setEditLeaderPasscode(e.target.value)}
                          placeholder="ตั้งรหัสลับสำหรับให้เครื่องอื่นแอดสิทธิ์หัวหน้ากลุ่ม"
                          className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono focus:outline-none focus:border-amber-400 text-amber-300 transition shadow-inner"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          สมาชิกหรือแอดมินท่านอื่นสามารถนำรหัสนี้มากรอกที่ปุ่มฟันเฟือง เพื่อรับสิทธิ์หัวหน้ากลุ่มบนเครื่องของตนเอง
                        </p>
                      </div>
                    </div>

                    {editGroupError && (
                      <p className="text-xs text-rose-400 font-sans">
                        ⚠️ {editGroupError}
                      </p>
                    )}

                    {editGroupSuccess && (
                      <p className="text-xs text-emerald-400 font-sans font-bold">
                        ✓ บันทึกการตั้งค่าก๊วนและระบบหัวหน้ากลุ่มเรียบร้อยแล้ว!
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowEditGroupModal(false)}
                        className="px-4 py-2 text-slate-400 hover:text-slate-200 transition text-xs font-medium cursor-pointer"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs transition shadow-md shadow-amber-950/50 cursor-pointer flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>บันทึกการตั้งค่าทั้งหมด</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  /* FOR NON-LEADER MEMBERS: CLAIM LEADER ACCESS */
                  <div className="space-y-5">
                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-amber-400">
                        <Crown className="w-5 h-5" />
                        <h4 className="text-sm font-bold">รับสิทธิ์หัวหน้ากลุ่ม (แอดหัวหน้าก๊วน)</h4>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        หากคุณเป็นผู้สร้างกลุ่ม หรือได้รับรหัสหัวหน้ากลุ่มจากแอดมิน สามารถกรอกรหัสผ่านเพื่อรับสิทธิ์ดูแลก๊วนบนเครื่องของคุณได้ทันทีครับ
                      </p>

                      <form onSubmit={handleClaimLeader} className="space-y-3 pt-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            🔑 กรอกรหัสแอดหัวหน้ากลุ่ม (Leader Access Passcode)
                          </label>
                          <input
                            type="text"
                            value={claimLeaderPasscodeInput}
                            onChange={(e) => setClaimLeaderPasscodeInput(e.target.value)}
                            placeholder="กรอกรหัสผ่านหัวหน้ากลุ่ม หรือรหัสเข้ากลุ่ม"
                            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono focus:outline-none focus:border-amber-400 text-amber-300 transition shadow-inner"
                          />
                        </div>

                        {claimLeaderError && (
                          <p className="text-xs text-rose-400">
                            ⚠️ {claimLeaderError}
                          </p>
                        )}

                        {claimLeaderSuccess && (
                          <p className="text-xs text-emerald-400 font-bold">
                            ✓ ยืนยันสิทธิ์หัวหน้ากลุ่มสำเร็จ! ตอนนี้คุณคือผู้ดูแลก๊วนนี้แล้ว
                          </p>
                        )}

                        <button
                          type="submit"
                          className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs transition shadow-md shadow-amber-950/50 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Crown className="w-4 h-4" />
                          <span>ยืนยันรับสิทธิ์หัวหน้ากลุ่ม</span>
                        </button>
                      </form>
                    </div>

                    <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 text-xs text-slate-400 space-y-1">
                      <p className="font-bold text-slate-300">💡 ข้อมูลการตั้งค่าปัจจุบันของกลุ่ม</p>
                      <p>• ยอดส่งเป้าหมาย: <span className="text-emerald-400 font-mono font-bold">฿{activeGroup?.targetAmountPerMember.toLocaleString("th-TH")}</span> / คน / สัปดาห์</p>
                      <p>• ค่าปรับจ่ายล่าช้า: <span className="text-rose-400 font-mono font-bold">฿{activeGroup?.lateFeePerWeek || 0}</span> / สัปดาห์ (คิดค่าปรับอัตโนมัติทุก 00:01 ของวันจันทร์ • ค่าปรับถ้าจ่ายแล้วเงินค่าปรับจะหายไป ไม่เอาไปทบสัปดาห์อื่น • ยอดทบคือยอดที่จ่ายเกินทั้งค่าปรับและยอดรายอาทิตย์{activeGroup?.lateFeeNote ? ` • ${activeGroup.lateFeeNote}` : ""})</p>
                      {activeGroup?.coLeaders && activeGroup.coLeaders.length > 0 && (
                        <p>• หัวหน้าก๊วนร่วม: <span className="text-amber-400 font-bold">{activeGroup.coLeaders.join(", ")}</span></p>
                      )}
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setShowEditGroupModal(false)}
                        className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        ปิดหน้าต่าง
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import AnimatePresence support wrapper */}
      <div className="hidden" />
    </div>
  );
}

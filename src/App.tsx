import React, { useState, useEffect } from "react";
import { Group, Member, Transaction, ParsedSlipResult } from "./types";
import Header from "./components/Header";
import WeeklyChart from "./components/WeeklyChart";
import SlipUploader from "./components/SlipUploader";
import MemberManager from "./components/MemberManager";
import TransactionHistory from "./components/TransactionHistory";
import { HelpCircle, Landmark, Sparkles, ShieldAlert, ShieldCheck, Trash2, Key, Share2, Copy, Check, Settings, Crown, Users, Pencil, AlertTriangle, RotateCcw, Radio, Send, Bell, Bot, Terminal, ExternalLink, MessageSquareCode, Eye, Play } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { collection, doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot, writeBatch, deleteField, addDoc } from "firebase/firestore";
import { db } from "./lib/firebase";
import { restoreStarterGroupData } from "./lib/restoreStarterData";
import { calculateMemberCarryover } from "./lib/carryover";
import { safeFetchJson, testDiscordWebhookDirect } from "./lib/safeApi";

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
  const [showResetDataModal, setShowResetDataModal] = useState(false);
  const [resetDataLoading, setResetDataLoading] = useState(false);
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

  // Discord Webhook & Bot states
  const [editDiscordWebhookUrl, setEditDiscordWebhookUrl] = useState("");
  const [editDiscordWebhookEnabled, setEditDiscordWebhookEnabled] = useState(false);
  const [editDiscordNotifyOnSlip, setEditDiscordNotifyOnSlip] = useState(true);
  const [editDiscordNotifyOnManualTx, setEditDiscordNotifyOnManualTx] = useState(true);
  const [editDiscordSendSlipImage, setEditDiscordSendSlipImage] = useState(true);
  const [editDiscordBotToken, setEditDiscordBotToken] = useState("");
  const [editDiscordBotEnabled, setEditDiscordBotEnabled] = useState(false);
  const [editDiscordChannelId, setEditDiscordChannelId] = useState("");
  const [discordBotConnecting, setDiscordBotConnecting] = useState(false);
  const [discordBotStatus, setDiscordBotStatus] = useState<{ isConnected: boolean; botUsername?: string } | null>(null);
  const [discordTesting, setDiscordTesting] = useState(false);
  const [discordTestResult, setDiscordTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [commandPreviewCmd, setCommandPreviewCmd] = useState<string | null>(null);
  const [commandPreviewData, setCommandPreviewData] = useState<any | null>(null);
  const [commandPreviewLoading, setCommandPreviewLoading] = useState(false);
  const [commandSendSuccess, setCommandSendSuccess] = useState<string | null>(null);

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

  const handleResetGroupData = async () => {
    if (!activeGroupId) return;
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถรีเซ็ตหรือล้างข้อมูลยอดเงินได้");
      return;
    }
    setResetDataLoading(true);
    try {
      const groupTxs = transactions.filter((t) => t.groupId === activeGroupId);
      const batch = writeBatch(db);

      // 1. Delete all transactions in this group
      groupTxs.forEach((tx) => {
        batch.delete(doc(db, "transactions", tx.id));
      });

      // 2. Reset initialCarryover and customLateFee of all members in this group to 0
      const groupMembers = members.filter((m) => m.groupId === activeGroupId);
      groupMembers.forEach((m) => {
        batch.update(doc(db, "members", m.id), {
          initialCarryover: 0,
        });
      });

      // 3. Reset group creation date to now so that weekly cycles start fresh from current week
      batch.update(doc(db, "groups", activeGroupId), {
        createdAt: new Date().toISOString(),
      });

      await batch.commit();
      setShowResetDataModal(false);
      setShowEditGroupModal(false);
      alert("✓ ล้างประวัติสลิปและรีเซ็ตยอดเงินสะสมทั้งหมดเรียบร้อยแล้ว!\n(รายชื่อสมาชิกทุกคน ก๊วน และรหัสผ่านยังคงอยู่ตามเดิม)");
    } catch (err) {
      console.error("Error resetting group data:", err);
      alert("เกิดข้อผิดพลาดในการล้างข้อมูล กรุณาลองใหม่อีกครั้ง");
    } finally {
      setResetDataLoading(false);
    }
  };

  const handleRestoreStarterData = async () => {
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถคืนค่าระบบได้");
      return;
    }
    try {
      const res = await restoreStarterGroupData();
      setCreatedGroupIds((prev) => {
        const next = Array.from(new Set([...prev, res.groupId]));
        localStorage.setItem("sb_created_groups", JSON.stringify(next));
        return next;
      });
      setUnlockedGroupIds((prev) => {
        const next = Array.from(new Set([...prev, res.groupId]));
        localStorage.setItem("sb_unlocked_groups", JSON.stringify(next));
        return next;
      });
      setActiveGroupId(res.groupId);
      localStorage.setItem("sb_active_id", res.groupId);
      setShowEditGroupModal(false);
      setShowResetDataModal(false);
      alert(`✓ คืนค่าระบบและกู้คืน "${res.groupName}" พร้อมสมาชิกทั้ง 7 คนและประวัติสลิปย้อนหลังครบถ้วนเรียบร้อยแล้ว!`);
    } catch (err) {
      console.error("Error restoring starter data:", err);
      alert("เกิดข้อผิดพลาดในการคืนค่าระบบ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const handleEditMember = async (
    memberId: string,
    name: string,
    nickname: string,
    newTotalPaid?: number,
    initialCarryover?: number,
    customLateFee?: number,
    discordUserId?: string,
    discordUsername?: string
  ) => {
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถแก้ไขข้อมูลและยอดเงินของสมาชิกได้");
      return;
    }
    try {
      const updateData: any = { name, nickname };
      if (initialCarryover !== undefined) {
        updateData.initialCarryover = initialCarryover;
      }
      if (customLateFee !== undefined && !isNaN(customLateFee)) {
        updateData.customLateFee = customLateFee;
      } else if (customLateFee === undefined) {
        updateData.customLateFee = deleteField();
      }
      if (discordUserId !== undefined) {
        if (discordUserId.trim()) {
          updateData.discordUserId = discordUserId.trim();
        } else {
          updateData.discordUserId = deleteField();
        }
      }
      if (discordUsername !== undefined) {
        if (discordUsername.trim()) {
          updateData.discordUsername = discordUsername.trim();
        } else {
          updateData.discordUsername = deleteField();
        }
      }
      await updateDoc(doc(db, "members", memberId), updateData);

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
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถแก้ไขค่าปรับของกลุ่มได้");
      return;
    }
    try {
      await updateDoc(doc(db, "groups", activeGroupId), {
        lateFeePerWeek,
        lateFeeNote,
      });
    } catch (err) {
      console.error("Error updating group late fee:", err);
    }
  };

  // Adjust Group Total Money directly
  const handleUpdateGroupTotalMoney = async (newTotal: number, reason?: string) => {
    if (!activeGroupId) return;
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถปรับปรุงยอดเงินรวมของกลุ่มได้");
      return;
    }
    try {
      // Calculate current total
      const fromMembers = activeMembers.reduce((sum, member) => {
        const carry = calculateMemberCarryover(
          member.id,
          activeTransactions,
          activeGroup?.targetAmountPerMember || 0,
          activeGroup?.createdAt || new Date().toISOString(),
          activeGroup?.lateFeePerWeek || 0,
          member.initialCarryover || 0,
          member.customLateFee
        );
        return sum + carry.totalPaidAllTime;
      }, 0);

      const unlinked = activeTransactions
        .filter((t) => !activeMembers.some((m) => m.id === t.memberId))
        .reduce((sum, t) => sum + t.amount, 0);

      const currentTotal = fromMembers + unlinked;
      const difference = newTotal - currentTotal;

      if (Math.abs(difference) < 0.01) {
        return;
      }

      const newTx: Omit<Transaction, "id"> = {
        groupId: activeGroupId,
        memberId: "",
        amount: difference,
        date: new Date().toISOString().split("T")[0],
        time: new Date().toTimeString().slice(0, 5),
        bank: "กองกลาง (ปรับปรุงยอดรวม)",
        senderNameText: reason || "ปรับปรุงยอดกองกลางโดยตรง",
        isAiParsed: false,
        notes: reason || `ปรับปรุงยอดรวมเงินกลุ่ม (เป้าหมายยอดรวม: ฿${newTotal.toLocaleString("th-TH")})`,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "transactions"), newTx);
    } catch (err) {
      console.error("Error updating group total money:", err);
      alert("เกิดข้อผิดพลาดในการปรับปรุงยอดเงินกลุ่ม กรุณาลองใหม่อีกครั้ง");
    }
  };

  // Update custom late fee for a specific member directly
  const handleUpdateMemberCustomLateFee = async (memberId: string, customLateFee: number | undefined) => {
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถตั้งค่าปรับเฉพาะบุคคลได้");
      return;
    }
    try {
      if (customLateFee !== undefined && !isNaN(customLateFee) && customLateFee >= 0) {
        await updateDoc(doc(db, "members", memberId), {
          customLateFee: customLateFee,
        });
      } else {
        await updateDoc(doc(db, "members", memberId), {
          customLateFee: deleteField(),
        });
      }
    } catch (err) {
      console.error("Error updating member custom late fee:", err);
      alert("เกิดข้อผิดพลาดในการตั้งค่าปรับเฉพาะบุคคล");
    }
  };

  // Set all members in current group to have a 400 Baht deficit
  const handleSetAllMembersDeficit400 = async () => {
    if (!activeGroupId || !activeGroup || activeMembers.length === 0) return;
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถตั้งค่ายอดค้างชำระได้");
      return;
    }
    try {
      const target = activeGroup.targetAmountPerMember || 200;
      for (const member of activeMembers) {
        const carry = calculateMemberCarryover(
          member.id,
          activeTransactions,
          target,
          activeGroup.createdAt,
          activeGroup.lateFeePerWeek || 0,
          0,
          member.customLateFee
        );
        // We want current deficit = 400
        // deficit = target - available => available = target - 400 (e.g. 200 - 400 = -200)
        // available = totalPaidAllTime + initialCarryover
        // initialCarryover = (target - 400) - carry.totalPaidAllTime
        const targetCarryover = (target - 400) - carry.totalPaidAllTime;

        await updateDoc(doc(db, "members", member.id), {
          initialCarryover: targetCarryover,
          manualFine: deleteField(),
        });
      }
    } catch (err) {
      console.error("Error setting all members deficit to 400:", err);
      alert("เกิดข้อผิดพลาดในการตั้งค่ายอดค้าง กรุณาลองใหม่อีกครั้ง");
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถลบรายการโอนเงินได้");
      return;
    }
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
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถแก้ไขรายการโอนเงินได้");
      return;
    }
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

  // Send Discord webhook notification when a transaction is added
  const sendDiscordTransactionNotification = async (params: {
    memberId: string;
    amount: number;
    bank: string;
    date: string;
    time: string;
    notes?: string;
    isAiParsed: boolean;
    hasSlipImage: boolean;
    slipImageUrl?: string;
    overrideMemberNickname?: string;
    overrideMemberName?: string;
  }) => {
    const currentGroup = groups.find((g) => g.id === activeGroupId);
    if (!currentGroup?.discordWebhookUrl || !currentGroup?.discordWebhookEnabled) {
      return;
    }
    if (params.isAiParsed && currentGroup.discordNotifyOnSlip === false) {
      return;
    }
    if (!params.isAiParsed && currentGroup.discordNotifyOnManualTx === false) {
      return;
    }

    const member = members.find((m) => m.id === params.memberId);
    const memberNickname = params.overrideMemberNickname || member?.nickname || "สมาชิก";
    const memberName = params.overrideMemberName || member?.name || memberNickname;

    const pastMemberTxs = transactions.filter(
      (t) => t.memberId === params.memberId && t.groupId === activeGroupId
    );
    const newTotal = pastMemberTxs.reduce((sum, t) => sum + t.amount, 0) + params.amount;
    const target = currentGroup.targetAmountPerMember || 0;
    const progressPercent = target > 0 ? Math.round((newTotal / target) * 100) : 0;

    try {
      const { ok, error } = await safeFetchJson("/api/discord/notify-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: currentGroup.discordWebhookUrl,
          groupName: currentGroup.name,
          memberNickname,
          memberName,
          amount: params.amount,
          bank: params.bank,
          date: params.date,
          time: params.time,
          notes: params.notes,
          method: params.isAiParsed ? "AI สแกนสลิป" : "บันทึกด้วยมือ",
          memberTotalPaid: newTotal,
          targetAmount: target,
          progressPercent,
          hasSlipImage: params.hasSlipImage,
          slipImageUrl: currentGroup.discordSendSlipImage !== false ? params.slipImageUrl : undefined,
        }),
      });

      if (!ok) {
        console.warn("[DISCORD] Server notification failed, fallback to direct webhook post...", error);
        // Direct browser fallback to webhook
        const embed = {
          title: "💸 มีการบันทึกยอดเงินเข้าใหม่!",
          description: `ก๊วน **${currentGroup.name}**\n👤 ผู้โอน: **${memberNickname}**${memberName && memberName !== memberNickname ? ` (${memberName})` : ""}\n💰 ยอดเงิน: **${params.amount.toLocaleString("th-TH")} บาท**\n🏦 บัญชี: ${params.bank || "-"}\n📅 วันเวลา: ${params.date} ${params.time}`,
          color: 0x10B981,
          fields: [
            { name: "📊 สะสมของสมาชิก", value: `${newTotal.toLocaleString("th-TH")} บาท`, inline: true },
            { name: "🎯 เป้าหมาย", value: `${target.toLocaleString("th-TH")} บาท (${progressPercent}%)`, inline: true },
            { name: "📝 บันทึกโดย", value: params.isAiParsed ? "🤖 AI สแกนสลิป" : "✍️ บันทึกด้วยมือ", inline: true },
          ],
          footer: { text: "Group Money Tracker • Direct Notification" },
          timestamp: new Date().toISOString(),
        };
        fetch(currentGroup.discordWebhookUrl.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "Group Money Bot",
            avatar_url: "https://cdn-icons-png.flaticon.com/512/9028/9028031.png",
            embeds: [embed],
          }),
        }).catch((directErr) => console.warn("[DISCORD] Direct webhook send also failed:", directErr));
      } else {
        console.log("[DISCORD] Successfully notified Discord webhook!");
      }
    } catch (err) {
      console.warn("[DISCORD] Error sending Discord notification:", err);
    }
  };

  // Handle successful Slip Reading (Gemini AI or custom manual matching)
  const handleSlipUploadSuccess = async (
    parsed: ParsedSlipResult,
    memberId: string,
    createMemberName: string | null,
    createMemberNickname: string | null,
    slipImageUrl?: string | null
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
        ...(slipImageUrl ? { slipImageUrl } : {}),
      };

      await setDoc(doc(db, "transactions", newTransaction.id), newTransaction);

      // Trigger Discord Webhook Notification in background
      sendDiscordTransactionNotification({
        memberId: finalMemberId,
        amount: parsed.amount,
        bank: parsed.bank,
        date: parsed.date,
        time: parsed.time,
        notes: "สแกนสลิปโอนเงินด้วยระบบ AI อัตโนมัติ",
        isAiParsed: true,
        hasSlipImage: !!slipImageUrl,
        slipImageUrl: slipImageUrl || undefined,
        overrideMemberNickname: createMemberNickname || undefined,
        overrideMemberName: createMemberName || undefined,
      });
    } catch (err) {
      console.error("Error in slip upload success handling:", err);
    }
  };

  const handleAddManualTransaction = async (
    amount: number,
    memberId: string,
    bank: string,
    notes?: string,
    slipImageUrl?: string
  ) => {
    if (!isLeader) {
      alert("เฉพาะหัวหน้าก๊วนเท่านั้นที่สามารถบันทึกยอดเงินแบบกรอกมือได้");
      return;
    }
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
      ...(slipImageUrl ? { slipImageUrl } : {}),
    };

    try {
      await setDoc(doc(db, "transactions", newTransaction.id), newTransaction);

      // Trigger Discord Webhook Notification in background
      sendDiscordTransactionNotification({
        memberId,
        amount,
        bank,
        date: newTransaction.date,
        time: newTransaction.time,
        notes,
        isAiParsed: false,
        hasSlipImage: !!slipImageUrl,
        slipImageUrl: slipImageUrl || undefined,
      });
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
          discordWebhookUrl: editDiscordWebhookUrl.trim(),
          discordWebhookEnabled: editDiscordWebhookEnabled,
          discordNotifyOnSlip: editDiscordNotifyOnSlip,
          discordNotifyOnManualTx: editDiscordNotifyOnManualTx,
          discordSendSlipImage: editDiscordSendSlipImage,
          discordBotToken: editDiscordBotToken.trim(),
          discordBotEnabled: editDiscordBotEnabled,
          discordChannelId: editDiscordChannelId.trim(),
        },
        { merge: true }
      );

      // If bot is enabled and token is present, connect automatically
      if (editDiscordBotEnabled && editDiscordBotToken.trim()) {
        safeFetchJson("/api/discord/bot/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: activeGroupId,
            botToken: editDiscordBotToken.trim(),
            channelId: editDiscordChannelId.trim() || undefined,
          }),
        }).catch(() => {});
      } else if (!editDiscordBotEnabled) {
        safeFetchJson("/api/discord/bot/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: activeGroupId }),
        }).catch(() => {});
      }

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

  const handleTestDiscordWebhook = async () => {
    if (!editDiscordWebhookUrl.trim()) {
      setDiscordTestResult({ success: false, message: "กรุณาระบุ Discord Webhook URL ก่อนกดทดสอบ" });
      return;
    }
    setDiscordTesting(true);
    setDiscordTestResult(null);
    try {
      const { ok, data, error } = await safeFetchJson<{ success: boolean; message?: string; error?: string }>(
        "/api/discord/test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            webhookUrl: editDiscordWebhookUrl.trim(),
            groupName: editGroupName.trim() || activeGroup?.name || "ก๊วนออมเงิน",
          }),
        }
      );

      if (!ok || !data?.success) {
        // Fallback to direct client-side test if server returned error or is unreachable
        try {
          const direct = await testDiscordWebhookDirect(
            editDiscordWebhookUrl.trim(),
            editGroupName.trim() || activeGroup?.name || "ก๊วนออมเงิน"
          );
          if (direct.success) {
            setDiscordTestResult({
              success: true,
              message: "ส่งข้อความทดสอบสำเร็จตรงไปยัง Discord Webhook เรียบร้อยแล้ว! 🎉",
            });
            return;
          }
        } catch (directErr: any) {
          console.warn("Direct webhook send error:", directErr);
        }

        setDiscordTestResult({
          success: false,
          message: data?.error || error || "ส่งข้อความไม่สำเร็จ โปรดตรวจสอบ Webhook URL",
        });
      } else {
        setDiscordTestResult({
          success: true,
          message: data.message || "ส่งข้อความทดสอบสำเร็จ! ตรวจสอบในห้อง Discord ได้ทันที",
        });
      }
    } catch (err: any) {
      setDiscordTestResult({
        success: false,
        message: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อไปยัง Discord",
      });
    } finally {
      setDiscordTesting(false);
    }
  };

  const handleConnectDiscordBot = async () => {
    if (!editDiscordBotToken.trim()) {
      setDiscordTestResult({ success: false, message: "กรุณาระบุ Discord Bot Token ก่อนกดเชื่อมต่อ" });
      return;
    }
    setDiscordBotConnecting(true);
    setDiscordTestResult(null);
    try {
      const { ok, data, error } = await safeFetchJson<{
        success: boolean;
        botUsername?: string;
        message?: string;
        error?: string;
      }>("/api/discord/bot/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: activeGroupId,
          botToken: editDiscordBotToken.trim(),
          channelId: editDiscordChannelId.trim() || undefined,
        }),
      });

      if (!ok || !data?.success) {
        setDiscordTestResult({
          success: false,
          message:
            data?.error ||
            error ||
            "เชื่อมต่อ Discord Bot ไม่สำเร็จ โปรดตรวจสอบ Bot Token และสิทธิ์ Privileged Gateway Intents (Message Content Intent)",
        });
      } else {
        setDiscordBotStatus({ isConnected: true, botUsername: data.botUsername });
        setDiscordTestResult({
          success: true,
          message: data.message || `เชื่อมต่อ Discord Bot สำเร็จในชื่อ @${data.botUsername}! พร้อมตอบคำสั่งในห้อง Discord แล้ว`,
        });
      }
    } catch (err: any) {
      setDiscordTestResult({
        success: false,
        message: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อบอท",
      });
    } finally {
      setDiscordBotConnecting(false);
    }
  };

  const handleDisconnectDiscordBot = async () => {
    try {
      await safeFetchJson("/api/discord/bot/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: activeGroupId }),
      });
      setDiscordBotStatus({ isConnected: false });
      setDiscordTestResult({ success: true, message: "ตัดการเชื่อมต่อ Discord Bot เรียบร้อยแล้ว" });
    } catch (err) {}
  };

  const handleRunDiscordCommand = async (command: string, sendToWebhook = false) => {
    if (!activeGroupId) return;
    setCommandPreviewCmd(command);
    setCommandPreviewLoading(true);
    setCommandSendSuccess(null);
    try {
      const { ok, data, error } = await safeFetchJson<any>("/api/discord/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: activeGroupId,
          command,
          sendToWebhook,
        }),
      });
      if (ok && data?.success && data.embed) {
        setCommandPreviewData(data.embed);
        if (sendToWebhook) {
          if (data.webhookResult?.sent) {
            setCommandSendSuccess(`ส่งผลลัพธ์คำสั่ง "${command}" ไปยังห้อง Discord สำเร็จแล้ว! 🎉`);
          } else {
            setCommandSendSuccess(`ไม่สามารถส่งเข้า Webhook ได้: ${data.webhookResult?.error || "โปรดตรวจสอบ Webhook URL"}`);
          }
        }
      } else {
        setCommandSendSuccess(`เกิดข้อผิดพลาดในการรันคำสั่ง: ${data?.error || error || "ไม่สามารถประมวลผลคำสั่งได้"}`);
      }
    } catch (err: any) {
      console.error("Error previewing command:", err);
      setCommandSendSuccess(`เกิดข้อผิดพลาด: ${err.message || "ไม่สามารถประมวลผลคำสั่งได้"}`);
    } finally {
      setCommandPreviewLoading(false);
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
    setEditDiscordWebhookUrl(group.discordWebhookUrl || "");
    setEditDiscordWebhookEnabled(group.discordWebhookEnabled ?? false);
    setEditDiscordNotifyOnSlip(group.discordNotifyOnSlip ?? true);
    setEditDiscordNotifyOnManualTx(group.discordNotifyOnManualTx ?? true);
    setEditDiscordSendSlipImage(group.discordSendSlipImage ?? true);
    setEditDiscordBotToken(group.discordBotToken || "");
    setEditDiscordBotEnabled(group.discordBotEnabled ?? false);
    setEditDiscordChannelId(group.discordChannelId || "");
    setDiscordTestResult(null);
    setCommandPreviewCmd(null);
    setCommandPreviewData(null);
    setCommandSendSuccess(null);

    // Check bot connection status
    safeFetchJson<any>(`/api/discord/bot/status/${group.id}`)
      .then(({ ok, data }) => {
        if (ok && data?.success) {
          setDiscordBotStatus({ isConnected: data.isConnected, botUsername: data.botUsername });
        }
      })
      .catch(() => {});

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
        onUpdateGroupTotalMoney={handleUpdateGroupTotalMoney}
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
                  onUpdateMemberCustomLateFee={handleUpdateMemberCustomLateFee}
                  onUpdateLateFee={handleUpdateGroupLateFee}
                  onSetAllDeficit400={handleSetAllMembersDeficit400}
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

            <div className="mt-4 w-full">
              <button
                type="button"
                onClick={handleRestoreStarterData}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800/90 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-300 hover:text-emerald-200 rounded-2xl font-bold text-xs transition shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-emerald-400" />
                <span>🔄 คืนค่าระบบ & กู้คืนก๊วนตัวอย่างเดิม (พร้อมสมาชิก 7 คน และสลิปย้อนหลัง)</span>
              </button>
            </div>

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

      {/* Reset Group Data (Keep Members & Group) Confirmation Modal */}
      <AnimatePresence>
        {showResetDataModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-md p-6 shadow-2xl text-slate-100"
            >
              <div className="flex items-center gap-3 mb-4 text-rose-400">
                <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                  <RotateCcw className="w-6 h-6 animate-spin-slow" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-sans text-rose-300">ล้างประวัติสลิปและยอดเงินทั้งหมด</h3>
                  <p className="text-xs text-slate-400 font-sans">รีเซ็ตยอดเงินสะสมกลับเป็น 0 บาท</p>
                </div>
              </div>

              <div className="space-y-3 bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs leading-relaxed text-slate-300 font-sans">
                <p className="font-semibold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>คำเตือน: การกระทำนี้ไม่สามารถย้อนกลับได้</span>
                </p>
                <p>
                  ระบบจะทำการลบประวัติสลิปการโอนเงินทั้งหมดในก๊วนนี้ (
                  <span className="text-rose-300 font-bold">
                    {transactions.filter((t) => t.groupId === activeGroupId).length} รายการ
                  </span>
                  ) และรีเซ็ตยอดเงินสะสมของสมาชิกทุกคนกลับเป็น <span className="text-amber-300 font-bold">0 บาท</span> เพื่อเริ่มรอบใหม่
                </p>
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300">
                  ✓ <span className="font-bold">ก๊วนยังอยู่</span>, <span className="font-bold">รายชื่อสมาชิกทุกคน ({activeMembers.length} คน) ยังอยู่</span>, และ <span className="font-bold">รหัสผ่านเดิมยังคงใช้งานได้ตามปกติ</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowResetDataModal(false)}
                  disabled={resetDataLoading}
                  className="px-4 py-2.5 text-slate-400 hover:text-slate-200 transition text-xs font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleResetGroupData}
                  disabled={resetDataLoading}
                  className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-slate-100 rounded-xl font-bold text-xs transition shadow-lg shadow-rose-950/50 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {resetDataLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-100/30 border-t-slate-100 rounded-full animate-spin" />
                      <span>กำลังล้างข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>ยืนยันล้างข้อมูลและยอดเงิน</span>
                    </>
                  )}
                </button>
              </div>
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
                      <p className="text-[11px] text-rose-300/90 leading-relaxed font-medium bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
                        💡 กฎค่าปรับ: หากจ่ายช้าจะถูกปรับ {editLateFeePerWeek || 0} บาท คิดค่าปรับอัตโนมัติทุกๆวันจันทร์ เวลา 00:00 น.
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

                    {/* SECTION: Discord Webhook & Discord Bot Integration */}
                    <div className="bg-slate-950/60 border border-indigo-500/30 rounded-2xl p-4 space-y-5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Bot className="w-4 h-4 text-indigo-400" />
                          <span>4. ระบบบอทและแจ้งเตือน Discord (Discord Bot & Webhook)</span>
                        </h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-semibold border border-indigo-500/30">
                          คำสั่ง !เช็ค & !ยอดเงิน
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                        เมื่อมีคนพิมพ์คำสั่ง <span className="font-mono text-indigo-300 font-bold bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-500/30">!เช็ค</span> บอทจะสรุปทันทีว่าใครยังไม่โอนและค้างยอดเท่าไหร่ และพิมพ์ <span className="font-mono text-emerald-300 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">!ยอดเงิน</span> เพื่อดูยอดเงินกองกลางสะสม
                      </p>

                      {/* SUB-SECTION 1: Discord Bot Setup */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-xs font-bold text-slate-200">Discord Bot (รับคำสั่งแชท !เช็ค / !ยอดเงิน)</span>
                          </div>
                          {discordBotStatus?.isConnected ? (
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              <span>ออนไลน์ ({discordBotStatus.botUsername || "Bot"})</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-full">
                              ยังไม่ได้เชื่อมต่อบอท
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between py-1 border-y border-slate-800/60">
                          <span className="text-xs text-slate-300">เปิดใช้งาน Discord Bot ตอบรับคำสั่ง</span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editDiscordBotEnabled}
                              onChange={(e) => setEditDiscordBotEnabled(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                            <span className="ml-2 text-xs font-semibold text-slate-300">
                              {editDiscordBotEnabled ? "เปิด" : "ปิด"}
                            </span>
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Discord Bot Token
                          </label>
                          <input
                            type="password"
                            value={editDiscordBotToken}
                            onChange={(e) => setEditDiscordBotToken(e.target.value)}
                            placeholder="MTAyNz... (วาง Bot Token จาก Discord Developer Portal)"
                            className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500 text-indigo-200 transition shadow-inner"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Discord Channel ID (ไม่บังคับ - ปล่อยว่างไว้เพื่อตอบทุกห้องที่เชิญบอทเข้า)
                          </label>
                          <input
                            type="text"
                            value={editDiscordChannelId}
                            onChange={(e) => setEditDiscordChannelId(e.target.value)}
                            placeholder="เช่น 123456789012345678 (คลิกขวาที่ห้องแชทแล้วเลือก Copy Channel ID)"
                            className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500 text-slate-300 transition shadow-inner"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={discordBotConnecting || !editDiscordBotToken.trim()}
                            onClick={handleConnectDiscordBot}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                              discordBotConnecting || !editDiscordBotToken.trim()
                                ? "bg-slate-800/60 text-slate-600 border border-slate-800 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm cursor-pointer active:scale-98"
                            }`}
                          >
                            <Bot className="w-3.5 h-3.5" />
                            <span>{discordBotConnecting ? "กำลังเชื่อมต่อ..." : "เชื่อมต่อ Discord Bot"}</span>
                          </button>

                          {discordBotStatus?.isConnected && (
                            <button
                              type="button"
                              onClick={handleDisconnectDiscordBot}
                              className="py-2 px-3 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition cursor-pointer"
                            >
                              ตัดการเชื่อมต่อ
                            </button>
                          )}
                        </div>

                        {/* Bot Guide Card */}
                        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-[11px] text-slate-400 space-y-1.5">
                          <p className="font-bold text-indigo-300 flex items-center gap-1.5">
                            <ExternalLink className="w-3 h-3" />
                            <span>วิธีสร้างและตั้งค่า Discord Bot ใน 3 ขั้นตอน:</span>
                          </p>
                          <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
                            <li>ไปที่ <strong className="text-white">discord.com/developers/applications</strong> &gt; กด <strong>New Application</strong></li>
                            <li>ไปที่แท็บ <strong className="text-white">Bot</strong> &gt; เลื่อนลงมาเปิด <strong className="text-amber-300 underline">MESSAGE CONTENT INTENT</strong> (จำเป็นมากเพื่อให้บอทอ่านคำสั่งได้) &gt; กด <strong>Reset Token</strong> แล้วคัดลอกมาใส่ช่องข้างบน</li>
                            <li>ไปที่แท็บ <strong className="text-white">OAuth2</strong> &gt; URL Generator &gt; ติ๊ก <strong className="text-white">bot</strong> &gt; ติ๊กสิทธิ์ <em>Send Messages, Embed Links, Read Message History</em> แล้วเปิดลิงก์เพื่อเชิญบอทเข้าเซิร์ฟเวอร์ Discord</li>
                          </ol>
                          <div className="pt-1.5 border-t border-slate-800 text-[10px] text-indigo-200/90 flex flex-wrap gap-x-3 gap-y-1">
                            <span>💬 <strong className="text-rose-300 font-mono">!เช็ค</strong>: ยอดค้างปัจจุบัน</span>
                            <span>💬 <strong className="text-amber-300 font-mono">!เช็คก่อน</strong>: ยอดค้างอาทิตย์ก่อน</span>
                            <span>💬 <strong className="text-indigo-300 font-mono">!ยอดเงิน</strong>: ยอดเงินกองกลาง</span>
                            <span>💬 <strong className="text-slate-300 font-mono">!คำสั่ง</strong>: ดูคำสั่งทั้งหมด</span>
                          </div>
                        </div>
                      </div>

                      {/* SUB-SECTION 2: Discord Webhook Integration */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                            <span className="text-xs font-bold text-slate-200">Discord Webhook (แจ้งเตือนสลิป & ยอดเงินเข้า)</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editDiscordWebhookEnabled}
                              onChange={(e) => setEditDiscordWebhookEnabled(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                            <span className="ml-2 text-xs font-semibold text-slate-300">
                              {editDiscordWebhookEnabled ? "เปิด" : "ปิด"}
                            </span>
                          </label>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1">
                            Discord Webhook URL
                          </label>
                          <input
                            type="url"
                            value={editDiscordWebhookUrl}
                            onChange={(e) => {
                              setEditDiscordWebhookUrl(e.target.value);
                              setDiscordTestResult(null);
                            }}
                            placeholder="https://discord.com/api/webhooks/..."
                            className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-500 text-indigo-200 transition shadow-inner"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            วิธีสร้าง: ใน Discord &gt; Edit Channel &gt; Integrations &gt; Webhooks &gt; New Webhook &gt; Copy Webhook URL
                          </p>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={editDiscordNotifyOnSlip}
                              onChange={(e) => setEditDiscordNotifyOnSlip(e.target.checked)}
                              className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-800"
                            />
                            <span>แจ้งเตือนเมื่อสมาชิกสแกนสลิปผ่าน AI สำเร็จ</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={editDiscordNotifyOnManualTx}
                              onChange={(e) => setEditDiscordNotifyOnManualTx(e.target.checked)}
                              className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-800"
                            />
                            <span>แจ้งเตือนเมื่อหัวหน้ากลุ่มบันทึกยอดเงินแบบกรอกมือ</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 bg-indigo-950/30 border border-indigo-500/20 p-2 rounded-xl">
                            <input
                              type="checkbox"
                              checked={editDiscordSendSlipImage}
                              onChange={(e) => setEditDiscordSendSlipImage(e.target.checked)}
                              className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-800"
                            />
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-indigo-200">📷 แนบรูปภาพสลิปส่งไปด้วยใน Discord</span>
                              <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                แสดงรูปในแชททันที
                              </span>
                            </span>
                          </label>
                        </div>

                        <button
                          type="button"
                          disabled={discordTesting || !editDiscordWebhookUrl.trim()}
                          onClick={handleTestDiscordWebhook}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                            discordTesting || !editDiscordWebhookUrl.trim()
                              ? "bg-slate-800/60 text-slate-600 border border-slate-800 cursor-not-allowed"
                              : "bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/40 cursor-pointer shadow-sm active:scale-98"
                          }`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{discordTesting ? "กำลังส่งข้อความทดสอบ..." : "🔔 ทดสอบส่งข้อความไปยัง Discord (Test Webhook)"}</span>
                        </button>
                      </div>

                      {/* SUB-SECTION 3: Interactive Command Simulator & Broadcast */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MessageSquareCode className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-xs font-bold text-slate-200">ทดสอบผลลัพธ์คำสั่ง Discord และส่งรายงาน</span>
                          </div>
                          <span className="text-[10px] text-slate-400">กดเพื่อดูตัวอย่างการ์ด</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => handleRunDiscordCommand("!เช็ค")}
                            className={`py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                              commandPreviewCmd === "!เช็ค"
                                ? "bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-sm"
                                : "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300"
                            }`}
                          >
                            <span className="font-mono font-bold text-rose-400">!เช็ค</span>
                            <span className="text-[11px]">(ยอดค้างปัจจุบัน)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRunDiscordCommand("!เช็คก่อน")}
                            className={`py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                              commandPreviewCmd === "!เช็คก่อน"
                                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm"
                                : "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300"
                            }`}
                          >
                            <span className="font-mono font-bold text-amber-400">!เช็คก่อน</span>
                            <span className="text-[11px]">(ยอดค้างอาทิตย์ก่อน)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRunDiscordCommand("!ยอดเงิน")}
                            className={`py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                              commandPreviewCmd === "!ยอดเงิน"
                                ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-sm"
                                : "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300"
                            }`}
                          >
                            <span className="font-mono font-bold text-indigo-400">!ยอดเงิน</span>
                            <span className="text-[11px]">(สรุปยอดกองกลาง)</span>
                          </button>
                        </div>

                        {/* Loading Indicator */}
                        {commandPreviewLoading && (
                          <div className="py-4 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                            <span>กำลังประมวลผลคำสั่ง Discord...</span>
                          </div>
                        )}

                        {/* Discord Card Preview */}
                        {commandPreviewData && !commandPreviewLoading && (
                          <div className="mt-2 space-y-3">
                            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center justify-between">
                              <span>ตัวอย่างข้อความที่บอทจะตอบกลับใน Discord:</span>
                              <span className="font-mono text-indigo-400">{commandPreviewCmd}</span>
                            </div>

                            {/* Realistic Discord Embed Mock */}
                            <div className="bg-[#2B2D31] border-l-4 rounded-r-lg p-3.5 text-xs font-sans text-slate-200 shadow-lg space-y-2.5"
                              style={{
                                borderLeftColor: commandPreviewData.color ? `#${commandPreviewData.color.toString(16).padStart(6, "0")}` : "#5865F2",
                              }}
                            >
                              <div className="font-bold text-white text-sm">
                                {commandPreviewData.title}
                              </div>

                              {commandPreviewData.description && (
                                <div className="text-slate-300 text-[11px] whitespace-pre-line leading-relaxed">
                                  {commandPreviewData.description}
                                </div>
                              )}

                              <div className="space-y-2 pt-1">
                                {commandPreviewData.fields?.map((f: any, i: number) => (
                                  <div key={i} className="bg-[#1E1F22]/70 rounded p-2 border border-white/5 space-y-1">
                                    <div className="font-bold text-slate-300 text-[11px]">{f.name}</div>
                                    <div className="text-slate-200 text-[11px] whitespace-pre-line leading-relaxed font-mono">
                                      {f.value}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {commandPreviewData.footer && (
                                <div className="text-[10px] text-slate-400 pt-1 border-t border-white/10 flex items-center justify-between">
                                  <span>{commandPreviewData.footer.text}</span>
                                  <span>วันนี้ {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                              )}
                            </div>

                            {/* Broadcast / Send to Webhook button */}
                            {editDiscordWebhookUrl.trim() && (
                              <button
                                type="button"
                                onClick={() => handleRunDiscordCommand(commandPreviewCmd || "!เช็ค", true)}
                                className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>🚀 ส่งการ์ด {commandPreviewCmd} นี้เข้าห้อง Discord ทันที (Broadcast)</span>
                              </button>
                            )}

                            {commandSendSuccess && (
                              <div className="p-2.5 rounded-xl text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
                                <span>✓</span>
                                <span>{commandSendSuccess}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Toast / Result Message */}
                      {discordTestResult && (
                        <div
                          className={`p-2.5 rounded-xl text-xs font-sans flex items-start gap-2 ${
                            discordTestResult.success
                              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                              : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
                          }`}
                        >
                          <span className="shrink-0">{discordTestResult.success ? "✓" : "⚠️"}</span>
                          <span className="leading-tight">{discordTestResult.message}</span>
                        </div>
                      )}
                    </div>

                    {/* SECTION 5: Member Management & Safe Deletion (Leader Only) */}
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-rose-400" />
                          <span>4. จัดการและลบรายชื่อสมาชิกในก๊วน ({activeMembers.length} คน)</span>
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                        คุณสามารถลบรายชื่อสมาชิกที่ไม่ต้องการได้ที่นี่ (ย้ายปุ่มลบมาไว้ในเมนูตั้งค่านี้เพื่อป้องกันการเผลอกดลบจากหน้าหลัก)
                      </p>

                      {activeMembers.length === 0 ? (
                        <p className="text-xs text-slate-500 italic text-center py-3">ยังไม่มีรายชื่อสมาชิกในกลุ่มนี้</p>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {activeMembers.map((m) => {
                            const memberTxsCount = transactions.filter((t) => t.memberId === m.id && t.groupId === activeGroupId).length;
                            return (
                              <div
                                key={m.id}
                                className="flex items-center justify-between p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl hover:border-slate-700 transition"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-slate-300 shrink-0">
                                    {m.nickname.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-xs font-bold text-slate-200 truncate">{m.nickname}</p>
                                      {m.customLateFee === 0 ? (
                                        <span className="text-[9px] font-sans font-bold text-teal-400 bg-teal-500/10 border border-teal-500/25 px-1.5 py-0.2 rounded shrink-0">
                                          🛡️ ปลอดค่าปรับ
                                        </span>
                                      ) : m.customLateFee !== undefined && m.customLateFee > 0 ? (
                                        <span className="text-[9px] font-sans font-bold text-rose-300 bg-rose-500/10 border border-rose-500/25 px-1.5 py-0.2 rounded shrink-0">
                                          ⚡ ปรับ ฿{m.customLateFee}/สัปดาห์
                                        </span>
                                      ) : null}
                                      {m.discordUserId && (
                                        <span className="text-[9px] font-sans font-semibold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1" title={`ผูก Discord ID: ${m.discordUserId}`}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                          <span>@{m.discordUsername || "Discord"}</span>
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {m.name} {memberTxsCount > 0 ? `• สลิป ${memberTxsCount} รายการ` : "• ยังไม่มีสลิป"}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMember(m.id)}
                                    className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0"
                                    title={`ลบรายชื่อ ${m.nickname}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>ลบรายชื่อ</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* SECTION 5: Reset All Slips & Money (Keep Group & Members) */}
                    <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                          <span>5. ล้างประวัติสลิป & ยอดเงินทั้งหมด (คงสมาชิกและก๊วนไว้)</span>
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                        ลบประวัติสลิปการโอนเงินทั้งหมดในก๊วนนี้ ({transactions.filter((t) => t.groupId === activeGroupId).length} รายการ) และรีเซ็ตยอดเงินสะสมของสมาชิกทุกคนกลับเป็น 0 บาท <span className="text-amber-300 font-semibold">(โดยที่ก๊วน, รหัสผ่านเดิม, และรายชื่อสมาชิกทุกคนยังคงอยู่ตามปกติ)</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowResetDataModal(true)}
                        className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 text-rose-300 hover:text-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ล้างประวัติสลิปและรีเซ็ตยอดเงินในก๊วนนี้</span>
                      </button>
                    </div>

                    {/* SECTION 6: Restore Starter Group & History */}
                    <div className="bg-emerald-950/25 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          <span>6. คืนค่าระบบก่อนล้างข้อมูล / กู้คืนก๊วนเริ่มต้น</span>
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                        คืนค่าก๊วนเดิม "ก๊วนเตะบอลวันเสาร์" พร้อมสมาชิกทั้ง 7 คน (ต้น, เอก, บอย, กอล์ฟ, นัท, ตั้ม, อาร์ม), ประวัติสลิปย้อนหลังครบทุกสัปดาห์, ยอดเงิน, และสิทธิ์แอดมินครบถ้วน
                      </p>
                      <button
                        type="button"
                        onClick={handleRestoreStarterData}
                        className="w-full py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 hover:border-emerald-500/60 text-emerald-300 hover:text-emerald-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>🔄 คืนค่าระบบเดิม & กู้คืนก๊วนตัวอย่างพร้อมสมาชิก 7 คน</span>
                      </button>
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
                      <p>• กฎค่าปรับ: หากจ่ายช้าจะถูกปรับ <span className="text-rose-400 font-mono font-bold">฿{activeGroup?.lateFeePerWeek || 0}</span> บาท คิดค่าปรับอัตโนมัติทุกๆวันจันทร์ เวลา 00:00 น.</p>
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

export interface Group {
  id: string;
  name: string;
  targetAmountPerMember: number;
  description?: string;
  passcode?: string; // Optional passcode to join and see the group
  createdAt: string;
}

export interface Member {
  id: string;
  groupId: string;
  name: string; // Real or full name used on bank transfers
  nickname: string; // Friendly name for group tracking
  createdAt: string;
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

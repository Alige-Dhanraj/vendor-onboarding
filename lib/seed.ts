// Synthetic reference data. All companies, IDs and bank accounts are fictional.
import { hashAccount, last4, makeGstin } from "./engine/ids";
import type { BlocklistEntry, TestRegistry, VendorRecord } from "./engine/types";

export const BANK = {
  deccan: "30112233445566",
};

export const VENDOR_MASTER_SEED: VendorRecord[] = [
  { id: "VM-001", legal_name: "Deccan Steel Traders Pvt Ltd", pan: "AAPCD7781E", gstin: makeGstin("29", "AAPCD7781E"), bank_account_hash: hashAccount(BANK.deccan), bank_last4: last4(BANK.deccan) },
  { id: "VM-002", legal_name: "Malabar Packaging LLP", pan: "ABHFM2290K", gstin: makeGstin("32", "ABHFM2290K"), bank_account_hash: hashAccount("40998877665544"), bank_last4: "5544" },
  { id: "VM-003", legal_name: "Sunrise Logistics Pvt Ltd", pan: "AAKCS5521P", gstin: makeGstin("27", "AAKCS5521P"), bank_account_hash: hashAccount("91827364554433"), bank_last4: "4433" },
];

export const BLOCKLIST_SEED: BlocklistEntry[] = [
  { name: "Quickpay Global Trading Pvt Ltd", reason: "Prior invoice fraud (internal record)" },
];

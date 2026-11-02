import { redirect } from "next/navigation";
import SettingsPanel from "@/components/SettingsPanel";
import { ACCOUNTS } from "@/lib/auth/accounts";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") redirect("/");
  let host: string | null = null;
  try { host = process.env.ACCOUNTING_WEBHOOK_URL ? new URL(process.env.ACCOUNTING_WEBHOOK_URL).host : null; } catch { host = null; }
  return <SettingsPanel users={ACCOUNTS.map((a) => ({ name: a.name, email: a.email, role: a.role }))} accountingHost={host} />;
}

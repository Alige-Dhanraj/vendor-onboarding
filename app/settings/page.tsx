import { redirect } from "next/navigation";
import SettingsPanel from "@/components/SettingsPanel";
import { ACCOUNTS } from "@/lib/auth/accounts";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSession();
  if (!s || s.role !== "ADMIN") redirect("/");
  return <SettingsPanel users={ACCOUNTS.map((a) => ({ name: a.name, email: a.email, role: a.role }))} />;
}

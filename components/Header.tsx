import { getSession } from "@/lib/auth/server";
import AppHeader from "./AppHeader";

export default async function Header() {
  const s = await getSession();
  return <AppHeader user={s ? { name: s.name, email: s.email, role: s.role } : null} />;
}

import Home from "@/components/Home";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await getSession();
  return <Home firstName={s?.name.split(" ")[0] ?? ""} />;
}

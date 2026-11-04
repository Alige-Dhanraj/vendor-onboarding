import type { Metadata } from "next";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "./globals.css";
import Frame from "@/components/Frame";
import { getSession } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "VendorGate · Vendor onboarding",
  description: "Vendor submission to Approved, Pending or Rejected, with every decision traced to its evidence.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Frame user={s ? { name: s.name, email: s.email, role: s.role } : null}>{children}</Frame>
      </body>
    </html>
  );
}

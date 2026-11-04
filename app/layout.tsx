import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export const metadata: Metadata = {
  title: "VendorGate · Vendor onboarding",
  description: "Vendor submission to Approved, Pending or Rejected, with every decision traced to its evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-white">
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}

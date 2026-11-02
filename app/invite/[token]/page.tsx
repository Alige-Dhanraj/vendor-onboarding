import { Suspense } from "react";
import VendorPortal from "@/components/VendorPortal";

export const metadata = { title: "Vendor registration", robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Suspense fallback={null}><VendorPortal token={token} /></Suspense>;
}

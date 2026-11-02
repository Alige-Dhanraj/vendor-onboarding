import { Suspense } from "react";
import Vendors from "@/components/Vendors";

export default function VendorsPage() {
  return <Suspense fallback={null}><Vendors /></Suspense>;
}

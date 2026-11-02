import { Suspense } from "react";
import SubmitForm from "@/components/SubmitForm";

export default function NewVendor() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New vendor</h1>
      <Suspense fallback={null}><SubmitForm /></Suspense>
    </div>
  );
}

import { Suspense } from "react";
import SubmitForm from "@/components/SubmitForm";

export default function Home() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New vendor submission</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Submit a vendor's details and documents. The process reads the documents, runs four layers of checks
          (complete, valid, consistent, credible), and returns Approved, Pending or Rejected with every reason traced to its evidence.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
        <SubmitForm />
      </Suspense>
    </div>
  );
}

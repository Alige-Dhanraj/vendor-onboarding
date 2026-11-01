import { CATALOGUE } from "@/lib/engine/catalogue";
import { LAYER_LABEL } from "@/lib/ui-labels";
import { Card, SectionTitle } from "@/components/ui";

const POLICY = [
  ["Any hard stop", "Rejected", "Blocklisted, GST registration cancelled, or an exact duplicate of an existing vendor."],
  ["Otherwise, any review signal", "Pending + review flag", "A person decides with the evidence; the reason is logged. A signal is not proof."],
  ["Otherwise, anything fixable or unreadable", "Pending", "The vendor gets one message listing every fix."],
  ["Otherwise", "Approved", "Notes are shown to the reviewer but don't block."],
];

export default function RulesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">How it decides</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          AI reads documents, judges whether two names are the same entity, and drafts messages. Fixed rules make every decision,
          so each outcome can be explained and audited. Nothing here claims a verification the system can't do: GST status comes
          from a labelled test registry, and a matching name is not proof that a bank account belongs to the vendor.
        </p>
      </div>

      <Card className="p-5">
        <SectionTitle>Decision policy, applied in order</SectionTitle>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {POLICY.map(([when, then, why]) => (
              <tr key={when}><td className="py-2 pr-4 font-medium text-slate-800">{when}</td><td className="py-2 pr-4 whitespace-nowrap text-slate-900">→ {then}</td><td className="py-2 text-slate-600">{why}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      {(["COMPLETE", "VALID", "CONSISTENT", "CREDIBLE"] as const).map((layer) => (
        <Card key={layer} className="p-5">
          <SectionTitle>{LAYER_LABEL[layer]}</SectionTitle>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="w-12 pb-2 font-medium">ID</th><th className="pb-2 font-medium">Check</th><th className="pb-2 font-medium">How</th><th className="pb-2 font-medium">If it fails</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {CATALOGUE.filter((c) => c.layer === layer).map((c) => (
                <tr key={c.id}><td className="mono py-2 text-xs text-slate-500">{c.id}</td><td className="py-2 pr-4 text-slate-900">{c.title}</td><td className="py-2 pr-4 text-slate-600">{c.how}</td><td className="py-2 text-slate-600">{c.severity}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

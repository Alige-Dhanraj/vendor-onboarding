# VendorGate: AI vendor onboarding and verification

Case-study build for the Zamp AI Solutions Analyst role (PS-2). A vendor submission (form + documents) goes in;
a decision comes out: **Approved, Pending or Rejected**, with every reason traced to its evidence and a drafted
message back to the vendor for anything not approved.

**Design line: AI reads and writes, rules decide.**

- The AI (OpenAI Responses API, strict JSON output) reads and classifies documents, and judges whether two names are
  the same entity when rules can't tell. Vendor messages are fixed short templates built from the verified findings: an email must never invent a requirement.
- 22 deterministic checks in four layers (Complete, Valid, Consistent, Credible) produce the evidence.
- A fixed policy turns check results into the outcome. No AI score is involved.
- Supabase stores every run, stage event, check result and reviewer action: the audit log.

## What it does

| Stage | What happens |
| --- | --- |
| Intake | Files validated (type, size), hashed, stored in a private bucket |
| Read documents | AI classifies each file and extracts fields with a confidence per field (cached by file hash) |
| Complete | Required fields and documents present, right document in each slot, legible |
| Valid | PAN, GSTIN structure + check character, IFSC / routing number, EIN, contact formats |
| Consistent | PAN inside GSTIN, PAN holder type, GSTIN state, legal name and bank holder across documents |
| Credible | Duplicate vendor, bank account reuse, blocklist, GST status (TEST REGISTRY) |
| Decide | Hard stop → Rejected; review signal → Pending + review flag; fixable → Pending; else Approved |
| Communicate | Short vendor message from a template (numbered list, bold document names). Draft only, never auto-sent |
| Record | Audit log saved; approved vendors added to the vendor master |

Every flagged check answers: **what was checked, where each value came from, which rule applied, why, and what next**.

## Honest limits

- GST status comes from a **labelled TEST REGISTRY**, not the live GST portal.
- A matching account-holder name is **not proof** the account belongs to the vendor. Production would add a
  bank-account (penny-drop) verification.
- All vendors, IDs, bank accounts and documents are synthetic and marked SAMPLE.
- The live view adds a short pause between stages (`DEMO_PACING_MS`) so people can follow it; recorded durations are real.

## Run it locally

```bash
npm install
cp .env.example .env.local      # fill in keys, or leave empty for offline mode
npm run dev                     # http://localhost:3000
```

Without `OPENAI_API_KEY`, sample documents are read from their known test values (offline mode, labelled in the UI).
Without Supabase keys, data is kept in memory (local only).

## Tests

```bash
npm test          # 28 unit tests: ID rules, GSTIN check character, names, policy, every scenario, evidence
npm run e2e       # full workflow on the real SAMPLE files: 12 scenarios, resubmission, reviewer rules
```

With `OPENAI_API_KEY` set, `npm run e2e` makes the AI read the actual files, so it doubles as the accuracy test.

## Sign-in and roles

Every page and API route needs a signed-in user. Three demo accounts (fictional names) share one password, set by you:

| Account | Role | Can |
| --- | --- | --- |
| buyer@vendorgate.example | Buyer | Submit vendors, view results; flagged cases are read-only |
| reviewer@vendorgate.example | Reviewer | Everything a Buyer can, plus decide flagged cases |
| admin@vendorgate.example | Admin | Everything, plus reset demo data |

Set `SESSION_SECRET` (long random text) and `DEMO_PASSWORD` in the environment. Without them, nobody can sign in in production.
Sessions are signed cookies (HMAC), valid 12 hours. Reviewer names on audit records come from the session, not the request.
Production would use single sign-on and a real user table; that is listed as the next step.

## Set up Supabase

1. Create a project at supabase.com.
2. SQL editor → run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`.
3. Project Settings → API: copy the **Project URL** and the **service_role** key.

Row Level Security is on with no public policies: the browser never talks to Supabase; the server does, with the
service-role key. Re-running `seed.sql` resets the demo data.

## Deploy on Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add environment variables: `OPENAI_API_KEY`, `OPENAI_MODEL` (a vision-capable model on your account),
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `DEMO_PASSWORD`, `DEMO_PACING_MS=400`.
3. Deploy. The run endpoint allows up to 300 s (the Hobby maximum); a run normally takes well under a minute.

## Test vendors (open `/new?demo=1`, or Settings > Open test vendors)

| # | Scenario | Expected |
| --- | --- | --- |
| 0 | Happy path: Kaveri Precision Components | Approved |
| 1A | Bank name abbreviated ("Comp. Pvt. Ltd.") | Approved, AI explains why the names match |
| 1B | Cheque in the name of "Ramesh Traders" | Pending + review (K6) |
| 2 | PAN card in the cheque slot, GST certificate missing; then corrected | Pending (C2, C3) → Approved on v2 |
| 3A | Existing vendor applies again (same GSTIN) | Rejected as duplicate (R2) |
| 3B | New vendor reuses a known bank account | Pending + review (R1) |
| 4 | PAN card is an individual's and contradicts the GSTIN | Pending + review (K1, K2) |
| N1 | Optional fields blank | Approved (no false alarm) |
| N2 | GSTIN with one wrong character | Pending (V3) |
| Reserve | US vendor with an Indian-format tax ID / blurry cheque / cancelled GST | Pending / Pending / Rejected |

Submitting the happy path twice shows memory across runs: the second time is caught as a duplicate.

## Project layout

```
app/              pages (home, vendors, new, runs/[id], settings, login) and API routes
components/       SubmitForm, RunView (result + problems + reviewer), Home, Vendors, HelpPanel
lib/engine/       checks, ID rules, name rules, policy, template message (pure, unit-tested)
lib/ai/           read-document, compare-names (OpenAI Responses API)
lib/workflow/     intake, orchestrator (writes run events), reviewer actions
lib/store/        Store interface, Supabase and in-memory implementations
supabase/         schema migration and generated seed
test-data/        SAMPLE documents; scripts/make_documents.py regenerates them
```

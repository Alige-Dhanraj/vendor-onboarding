"use client";

export default function SignOut() {
  return (
    <button
      className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
    >
      Sign out
    </button>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function EmailSecurityControls() {
  const status = trpc.customer.emailStatus.useQuery();
  const prefs = trpc.customer.emailPreferences.useQuery();
  const request = trpc.auth.requestEmailVerification.useMutation();
  const confirm = trpc.auth.confirmEmailVerification.useMutation({ onSuccess: () => { void status.refetch(); setCode(""); setMessage("Inbox verified. This does not complete identity verification/KYC."); } });
  const update = trpc.customer.updateEmailPreferences.useMutation({ onSuccess: () => { void prefs.refetch(); setMessage("Email preferences saved."); } });
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const verified = status.data?.emailVerified === true;
  const requestCode = async () => {
    setMessage("");
    try {
      const result = await request.mutateAsync();
      setMessage(result.issued ? "Verification code queued; check your inbox. It expires in 15 minutes." : result.throttled ? "Please wait before requesting another code." : "Email delivery is not configured yet. Ask the administrator to configure SMTP.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not request a code."); }
  };
  const toggle = (key: "systemAlerts" | "transactionAlerts" | "dailyTradingReports" | "adminMessages", value: boolean) => update.mutate({ [key]: value });
  return <div className="settings-card email-security-controls arb-page">
    <div className="eyebrow">Email delivery</div><h2>Verify your inbox</h2>
    <p className="settings-copy">{verified ? "This inbox is verified." : "Inbox verification is required for account alerts and daily summaries."} Email verification is separate from KYC and does not establish identity.</p>
    {!verified && <button type="button" className="secondary-button" disabled={request.isPending} onClick={() => void requestCode()}>{request.isPending ? "Requesting…" : "Send verification code"}</button>}
    {!verified && <form onSubmit={e => { e.preventDefault(); confirm.mutate({ code }); }}>
      <label>Eight-digit verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} required /></label>
      <button className="primary-button" disabled={confirm.isPending || code.length !== 8}>{confirm.isPending ? "Verifying…" : "Verify inbox"}</button>
    </form>}
    <div className="email-preference-list">
      <label><input type="checkbox" checked={prefs.data?.systemAlerts ?? true} onChange={e => toggle("systemAlerts", e.target.checked)} disabled={update.isPending} /> System notifications by email</label>
      <label><input type="checkbox" checked={prefs.data?.transactionAlerts ?? true} onChange={e => toggle("transactionAlerts", e.target.checked)} disabled={update.isPending} /> Demo-ledger adjustment alerts</label>
      <label><input type="checkbox" checked={prefs.data?.dailyTradingReports ?? true} onChange={e => toggle("dailyTradingReports", e.target.checked)} disabled={update.isPending} /> Daily activity summary</label>
      <label><input type="checkbox" checked={prefs.data?.adminMessages ?? true} onChange={e => toggle("adminMessages", e.target.checked)} disabled={update.isPending} /> Direct admin messages</label>
    </div>
    {message && <p role="status" className="test-notice">{message}</p>}
  </div>;
}

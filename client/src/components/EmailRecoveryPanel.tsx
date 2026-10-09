import { useState } from "react";

type Props = { defaultEmail?: string; onClose?: () => void };

export function EmailRecoveryPanel({ defaultEmail = "", onClose }: Props) {
  const [stage, setStage] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/customer/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to request a reset code");
      setStage("confirm"); setMessage(data.message || "If the account exists and email is configured, a code will arrive shortly.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to request a reset code"); }
    finally { setBusy(false); }
  }

  async function confirmReset(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/customer/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, password }), credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The reset code is invalid or expired");
      setPassword(""); setCode(""); setMessage("Password changed. Previously issued local sessions have been invalidated; sign in with your new password.");
    } catch (e) { setError(e instanceof Error ? e.message : "Password reset failed"); }
    finally { setBusy(false); }
  }

  return <section className="settings-card email-recovery-panel">
    <div className="eyebrow">Account recovery</div><h2>Reset password</h2>
    {stage === "request" ? <form onSubmit={requestCode}>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <p className="settings-copy">If the account exists and SMTP is configured, an eight-digit, one-time code will be sent. Requests are rate-limited.</p>
      <button className="primary-button" disabled={busy}>{busy ? "Requesting…" : "Send reset code"}</button>
    </form> : <form onSubmit={confirmReset}>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Eight-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} /></label>
      <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <p className="settings-copy">The code expires in 30 minutes and is limited to five attempts.</p>
      <button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Set new password"}</button>
      <button type="button" className="secondary-button" onClick={() => { setStage("request"); setCode(""); setPassword(""); }}>Request another code</button>
    </form>}
    {message && <p role="status" className="test-notice">{message}</p>}{error && <p role="alert" className="auth-error">{error}</p>}
    {onClose && <button type="button" className="secondary-button" onClick={onClose}>Close</button>}
  </section>;
}

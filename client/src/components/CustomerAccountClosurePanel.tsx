import { useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2, ShieldCheck, UserRoundX } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ClosureReasonId = "not-using" | "experience" | "fees" | "privacy" | "support";

export function CustomerAccountClosurePanel({ push }: { push: (message: string) => void }) {
  const [closureReasons, setClosureReasons] = useState<ClosureReasonId[]>([]);
  const [closureAcknowledged, setClosureAcknowledged] = useState(false);
  const [closureMessage, setClosureMessage] = useState("");
  const [closureSubmitted, setClosureSubmitted] = useState(false);
  const createClosureTicket = trpc.customer.requestAccountClosure.useMutation({
    onSuccess: (result) => {
      setClosureSubmitted(true);
      const statusMessage = result.alreadyPending
        ? `Your existing account-closure request is already awaiting administration review. Reference: ${result.ticketNumber}. Your account remains active while the request is reviewed.`
        : `Your account-closure request has been sent to the administration team. Reference: ${result.ticketNumber}. Your account remains active while the request is reviewed.`;
      setClosureMessage(statusMessage);
      push(`Account-closure request ${result.alreadyPending ? "already pending" : "submitted"} · ${result.ticketNumber}`);
    },
    onError: (error) => setClosureMessage(error.message || "We could not submit your request. Please try again."),
  });
  const closureOptions: { id: ClosureReasonId; label: string; detail: string }[] = [
    { id: "not-using", label: "I no longer use the platform", detail: "My needs or circumstances have changed." },
    { id: "experience", label: "The platform experience did not meet my expectations", detail: "Navigation, features, reliability, or ease of use." },
    { id: "fees", label: "Costs, fees, or available features", detail: "The service no longer fits my expectations." },
    { id: "privacy", label: "Privacy or account-security concerns", detail: "I have concerns about information, access, or security." },
    { id: "support", label: "Customer support or another reason", detail: "My concern is not covered by the options above." },
  ];
  const toggleClosureReason = (reason: ClosureReasonId) => setClosureReasons((current) =>
    current.includes(reason) ? current.filter((value) => value !== reason) : [...current, reason],
  );
  const submitClosureRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (closureReasons.length < 3 || !closureAcknowledged || createClosureTicket.isPending || closureSubmitted) return;
    setClosureMessage("");
    createClosureTicket.mutate({ reasons: closureReasons, acknowledged: true });
  };

  return (
    <div className="customer-resource-panel-grid">
      <section className="settings-card preference-card" aria-labelledby="closure-feedback-heading">
        <div className="settings-card-icon"><UserRoundX size={20} /></div>
        <span className="eyebrow">Before you go</span>
        <h2 id="closure-feedback-heading">Help us understand your decision</h2>
        <p>Select at least three reasons. Your feedback will be attached to a private account-closure support ticket for the administration team.</p>
        {closureSubmitted ? (
          <div className="test-notice" role="status"><CheckCircle2 size={16} /><span>{closureMessage}</span></div>
        ) : (
          <form onSubmit={submitClosureRequest}>
            <fieldset disabled={createClosureTicket.isPending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend style={{ fontWeight: 700, marginBottom: 12 }}>
                Why are you considering closing your account? <span>({closureReasons.length}/5 selected; choose at least 3)</span>
              </legend>
              <div style={{ display: "grid", gap: 10 }}>
                {closureOptions.map((option) => (
                  <label key={option.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, border: "1px solid var(--arb-color-border,var(--border,#dce5e1))", borderRadius: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={closureReasons.includes(option.id)} onChange={() => toggleClosureReason(option.id)} style={{ marginTop: 4, flexShrink: 0 }} />
                    <span><strong>{option.label}</strong><small style={{ display: "block", marginTop: 3, opacity: .8 }}>{option.detail}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div style={{ marginTop: 18, padding: 14, border: "1px solid var(--arb-color-border,var(--border,#dce5e1))", borderRadius: 12 }}>
              <h3 style={{ marginTop: 0 }}>Important information about account closure</h3>
              <p>Submitting this request does not close your account. An authorized administrator must review it and record a decision. Your account and access remain active until approval and any required follow-up steps are completed.</p>
              <p>If closure is approved, Arbitrade will delete or anonymize personal data that is eligible for deletion, subject to applicable law. Some records may need to be retained for legal or regulatory compliance, financial and transaction records, security, fraud prevention, audits, or resolving disputes. We therefore cannot promise that every record will be erased immediately or where retention is legally required.</p>
              <p>Account closure may be irreversible. You may lose access to the account, services, and account history that is eligible for deletion. Please ensure you have saved any statements or information you are entitled to retain before closure is completed.</p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12 }}>
                <input type="checkbox" checked={closureAcknowledged} onChange={(event) => setClosureAcknowledged(event.target.checked)} disabled={createClosureTicket.isPending} style={{ marginTop: 4, flexShrink: 0 }} />
                <span>I have read and understood the account-closure information above. I am requesting an administrator review and understand that this request does not immediately close my account.</span>
              </label>
            </div>
            {closureMessage && !closureSubmitted && <p className="auth-error" role="alert">{closureMessage}</p>}
            <button type="submit" className="primary-button" disabled={closureReasons.length < 3 || !closureAcknowledged || createClosureTicket.isPending}>
              {createClosureTicket.isPending ? "Submitting request…" : "Submit account-closure request"} <ArrowUpRight size={14} />
            </button>
            <p className="form-feedback" role="note">The submit button becomes available after you select at least three reasons and confirm the disclosure.</p>
          </form>
        )}
      </section>
      <section className="settings-card preference-card preference-card-secondary">
        <div className="settings-card-icon"><ShieldCheck size={18} /></div>
        <h2>Your account stays open during review</h2>
        <p>After submission, a high-priority ticket is created for the administration team. The team must review your reasons and explicitly decide whether to approve or reject the request.</p>
        <p>Submitting this form does not delete your information, change your account status, or affect your balances. If your request is approved, data handling remains subject to applicable legal and record-retention obligations.</p>
        <span className="preference-status"><CheckCircle2 size={14} /> No account changes before approval</span>
      </section>
    </div>
  );
}

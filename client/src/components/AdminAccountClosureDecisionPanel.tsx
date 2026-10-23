import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Decision = "approve" | "reject";

export function AdminAccountClosureDecisionPanel({
  ticketId,
  onDecisionComplete,
}: {
  ticketId: number;
  onDecisionComplete: () => Promise<unknown> | unknown;
}) {
  const [reason, setReason] = useState("");
  const decision = trpc.adminOperations.decideAccountClosure.useMutation({
    onSuccess: async (result) => {
      setReason("");
      await onDecisionComplete();
      window.alert(
        result.decision === "approve"
          ? "Account closure approved. Direct profile identity was anonymized and access revoked; financial and audit records remain preserved for required retention."
          : "Account closure rejected. The customer account remains active.",
      );
    },
    onError: (error) => window.alert(error.message),
  });

  const submitDecision = (choice: Decision) => {
    const reviewReason = reason.trim();
    if (reviewReason.length < 10 || decision.isPending) return;
    const confirmation =
      choice === "approve"
        ? "Approve account closure? The customer's direct profile and authentication will be anonymized/revoked. Financial, audit, and certain support records will be retained; closure is permanent."
        : "Reject this account-closure request? The customer's account will remain active.";
    if (!window.confirm(confirmation)) return;
    decision.mutate({ ticketId, decision: choice, reason: reviewReason });
  };

  return (
    <section className="settings-card ticket-closure-review" aria-labelledby={`closure-review-title-${ticketId}`}>
      <div className="eyebrow">Restricted account action</div>
      <h3 id={`closure-review-title-${ticketId}`}>Account-closure decision</h3>
      <p>
        Review the customer's reasons. Approval is refused while balances, pending payouts,
        active trading or staking positions, active subscriptions, or other open support cases
        remain. Approval anonymizes direct profile fields and revokes access; financial and
        audit history is retained.
      </p>
      <label htmlFor={`closure-review-reason-${ticketId}`}>Required administrative decision note</label>
      <textarea
        id={`closure-review-reason-${ticketId}`}
        rows={3}
        maxLength={2000}
        minLength={10}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Record why you are approving or rejecting this request…"
        disabled={decision.isPending}
      />
      <small>{reason.trim().length}/2,000 characters · at least 10 required</small>
      <div className="thread-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={decision.isPending || reason.trim().length < 10}
          onClick={() => submitDecision("reject")}
        >
          {decision.isPending ? "Processing…" : "Reject request"}
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={decision.isPending || reason.trim().length < 10}
          onClick={() => submitDecision("approve")}
        >
          {decision.isPending ? "Processing…" : "Approve & anonymize account"} <ShieldCheck size={15} />
        </button>
      </div>
    </section>
  );
}

import { useState } from "react";

type OpportunityCloseActionProps = {
  offerId: number;
  pending: boolean;
  onClose: (offerId: number, reason: string) => void;
};

export function OpportunityCloseAction({ offerId, pending, onClose }: OpportunityCloseActionProps) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const inputId = `opportunity-close-reason-${offerId}`;

  if (!expanded) {
    return <button type="button" className="secondary-button" onClick={() => setExpanded(true)} disabled={pending}>
      Close opportunity…
    </button>;
  }

  return <form className="opportunity-close-action" onSubmit={(event) => {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (!pending && trimmedReason) onClose(offerId, trimmedReason);
  }}>
    <label htmlFor={inputId}>Required reason for manual close
      <textarea id={inputId} value={reason} maxLength={2000} rows={2} required
        onChange={(event) => setReason(event.target.value)}
        placeholder="Explain why this published opportunity should stop being considered for future delivery." />
    </label>
    <small>Closing removes this published record from future delivery consideration; existing delivered popup and trade history are left unchanged.</small>
    <div className="opportunity-close-action__buttons">
      <button type="submit" className="secondary-button" disabled={pending || !reason.trim()}>
        {pending ? "Closing and verifying…" : "Confirm close"}
      </button>
      <button type="button" className="mini-button" disabled={pending} onClick={() => { setReason(""); setExpanded(false); }}>
        Cancel
      </button>
    </div>
  </form>;
}

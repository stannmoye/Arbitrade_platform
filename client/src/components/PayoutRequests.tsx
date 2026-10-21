import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, Send, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import "../payout-requests.css";

const PAYOUT_ASSETS = ["USD", "EUR", "GBP", "BTC", "ETH", "USDT"] as const;
type PayoutAsset = (typeof PAYOUT_ASSETS)[number];
type PayoutDestination = "bank_transfer" | "crypto_transfer";

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `payout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseMinorUnits(raw: string, scale: number): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isInteger(scale) || scale < 0 || scale > 8) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) return null;
  try {
    const factor = 10n ** BigInt(scale);
    const minor = BigInt(whole) * factor + BigInt((fraction + "0".repeat(scale)).slice(0, scale) || "0");
    return minor > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(minor);
  } catch {
    return null;
  }
}

function formatPayoutAmount(amountMinor: number, currency: string, scale: number) {
  const value = Number(amountMinor) / (10 ** scale);
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(value)}`;
}

function payoutStatusLabel(status: string) {
  switch (status) {
    case "pending": return "Pending manual review";
    case "paid": return "Marked paid";
    case "rejected": return "Rejected · funds released";
    case "cancelled": return "Cancelled · funds released";
    default: return status;
  }
}

export function CustomerPayoutRequests() {
  const balances = trpc.customer.balances.useQuery(undefined, { refetchInterval: 10_000 });
  const requests = trpc.customer.payoutRequests.useQuery(undefined, { refetchInterval: 10_000 });
  const [currency, setCurrency] = useState<PayoutAsset>("USD");
  const [amountText, setAmountText] = useState("");
  const [destinationType, setDestinationType] = useState<PayoutDestination>("bank_transfer");
  const [destinationDetails, setDestinationDetails] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [feedback, setFeedback] = useState("");

  const requestMutation = trpc.customer.requestPayout.useMutation({
    onSuccess: (request) => {
      setFeedback(`Payout request ${request.requestReference} was recorded. Funds are reserved pending manual review; no transfer has been sent.`);
      setAmountText("");
      setDestinationDetails("");
      setIdempotencyKey(newIdempotencyKey());
      void requests.refetch();
      void balances.refetch();
    },
    onError: (error) => setFeedback(error.message),
  });
  const cancelMutation = trpc.customer.cancelPayoutRequest.useMutation({
    onSuccess: (request) => {
      setFeedback(`Payout request ${request.requestReference} was cancelled and its reserved funds were returned.`);
      void requests.refetch();
      void balances.refetch();
    },
    onError: (error) => setFeedback(error.message),
  });

  const currencyInfo = useMemo(
    () => (balances.data?.currencies || []).find((entry: any) => String(entry.code).toUpperCase() === currency),
    [balances.data?.currencies, currency],
  );
  const wallet = (balances.data?.balances || []).find((entry: any) => String(entry.currency).toUpperCase() === currency);
  const scale = Math.max(0, Math.min(8, Number(currencyInfo?.scale ?? 2)));
  const isCryptoAsset = ["BTC", "ETH", "USDT"].includes(currency);
  const available = Number(wallet?.availableMinor ?? 0);
  const promotional = Number(wallet?.promotionalMinor ?? 0);
  const eligibleMinor = Number.isSafeInteger(available) && Number.isSafeInteger(promotional)
    ? Math.max(0, available - promotional)
    : 0;
  const amountMinor = parseMinorUnits(amountText, scale);
  const amountValid = amountMinor !== null && amountMinor > 0 && amountMinor <= eligibleMinor;
  const isBusy = requestMutation.isPending || cancelMutation.isPending;

  const changeFormValue = (change: () => void) => {
    if (isBusy) return;
    change();
    setIdempotencyKey(newIdempotencyKey());
    setFeedback("");
  };

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!amountValid || amountMinor === null || !destinationDetails.trim() || isBusy) return;
    setFeedback("");
    requestMutation.mutate({
      currency,
      amountMinor,
      destinationType,
      destinationDetails: destinationDetails.trim(),
      idempotencyKey,
    });
  };

  const cancelRequest = (requestId: number) => {
    if (isBusy || !globalThis.confirm?.("Cancel this pending payout request and return its reserved funds to your available wallet?")) return;
    setFeedback("");
    cancelMutation.mutate({ requestId });
  };

  return (
    <section className="payout-request-panel" aria-labelledby="payout-requests-heading">
      <header className="payout-request-heading">
        <div>
          <span className="payout-request-eyebrow">Manual processing · no automatic transfers</span>
          <h2 id="payout-requests-heading">Payout requests</h2>
          <p>Request payment from an eligible non-promotional wallet balance. Funds are reserved until an administrator marks the request paid or rejects it.</p>
        </div>
        <button className="payout-refresh" type="button" onClick={() => { void requests.refetch(); void balances.refetch(); }} disabled={requests.isFetching || balances.isFetching}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      <form className="payout-request-form" onSubmit={submitRequest}>
        <div className="payout-form-field">
          <label htmlFor="payout-currency">Payout currency</label>
          <select id="payout-currency" value={currency} disabled={isBusy} onChange={(event) => changeFormValue(() => { const nextCurrency = event.target.value as PayoutAsset; setCurrency(nextCurrency); setAmountText(""); setDestinationType(["BTC", "ETH", "USDT"].includes(nextCurrency) ? "crypto_transfer" : "bank_transfer"); })}>
            {PAYOUT_ASSETS.map((asset) => <option key={asset} value={asset}>{asset}</option>)}
          </select>
          <small>CKI is not eligible for payout. Swap it into a supported wallet currency first.</small>
        </div>
        <div className="payout-form-field">
          <label htmlFor="payout-amount">Amount</label>
          <input id="payout-amount" type="text" inputMode="decimal" autoComplete="off" placeholder={scale ? `0.${"0".repeat(Math.min(scale, 2))}` : "0"} value={amountText} disabled={isBusy} onChange={(event) => changeFormValue(() => setAmountText(event.target.value))} />
          <small>Available for payout: {formatPayoutAmount(eligibleMinor, currency, scale)}</small>
          {amountText && !amountValid && <small className="payout-form-error">Enter a positive amount within the available balance, using at most {scale} decimal places.</small>}
        </div>
        <div className="payout-form-field">
          <span className="payout-form-label">Destination type</span>
          <div className="payout-destination-type" id="payout-destination-type" role="status">{isCryptoAsset ? "Crypto wallet transfer" : "Bank transfer"}</div>
          <small>The destination type follows the currency. No currency conversion is performed.</small>
        </div>
        <div className="payout-form-field payout-destination-details">
          <label htmlFor="payout-destination-details">{destinationType === "bank_transfer" ? "Beneficiary and bank details" : "Public wallet address and network"}</label>
          <textarea
            id="payout-destination-details"
            rows={3}
            maxLength={1000}
            value={destinationDetails}
            disabled={isBusy}
            placeholder={destinationType === "bank_transfer" ? "Beneficiary name, bank, account number, and routing / SWIFT / IBAN details" : "Public wallet address and network name"}
            onChange={(event) => changeFormValue(() => setDestinationDetails(event.target.value))}
          />
        </div>
        <div className="payout-request-warning">
          <AlertCircle size={16} />
          <span>Never enter passwords, PINs, private keys, or seed phrases. The destination is recorded for administrator review; this form does not send funds.</span>
        </div>
        {feedback && <div className={/was recorded|was cancelled/.test(feedback) ? "payout-feedback success" : "payout-feedback"} role="status">{feedback}</div>}
        <div className="payout-submit-row">
          <button className="payout-submit" type="submit" disabled={!amountValid || !destinationDetails.trim() || isBusy || balances.isLoading}>
            <Send size={15} /> {requestMutation.isPending ? "Submitting request…" : "Request payout"}
          </button>
          {balances.isError && <small className="payout-form-error">Wallet balances could not be loaded. Refresh before submitting.</small>}
        </div>
      </form>

      <div className="payout-history-heading">
        <h3>Your requests</h3>
        <span>{requests.data?.length ?? 0} recent</span>
      </div>
      {requests.isLoading ? <p className="payout-empty">Loading payout requests…</p> : requests.isError ? <p className="payout-form-error">Payout requests could not be loaded. Try refreshing.</p> : !(requests.data || []).length ? <p className="payout-empty">No payout requests have been recorded.</p> : (
        <div className="payout-request-list">
          {(requests.data as any[]).map((request) => {
            const requestScale = Math.max(0, Math.min(8, Number((balances.data?.currencies || []).find((item: any) => item.code === request.currency)?.scale ?? 2)));
            return <article className="payout-request-item" key={request.id}>
              <div className="payout-request-item-top">
                <div><strong>{formatPayoutAmount(Number(request.amountMinor), request.currency, requestScale)}</strong><small>{request.requestReference}</small></div>
                <span className={`payout-status payout-status-${request.status}`}>{request.status === "paid" ? <CheckCircle2 size={13} /> : request.status === "pending" ? <Clock3 size={13} /> : <XCircle size={13} />}{payoutStatusLabel(request.status)}</span>
              </div>
              <div className="payout-request-item-details">
                <span>{request.destinationType === "bank_transfer" ? "Bank transfer" : "Crypto transfer"}</span>
                <time>{request.createdAt ? new Date(request.createdAt).toLocaleString() : ""}</time>
              </div>
              {request.externalReference && <p>External reference: <strong>{request.externalReference}</strong></p>}
              {request.resolutionNote && <p>Administrator note: {request.resolutionNote}</p>}
              {request.status === "pending" && <button className="payout-cancel" type="button" disabled={isBusy} onClick={() => cancelRequest(Number(request.id))}><XCircle size={14} /> {cancelMutation.isPending ? "Cancelling…" : "Cancel request"}</button>}
            </article>;
          })}
        </div>
      )}
    </section>
  );
}

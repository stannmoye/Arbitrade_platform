import React, { type ReactNode, type Ref } from "react";
import {
  ArrowUpRight,
  BadgeInfo,
  Check,
  ChevronDown,
  Clock3,
  Info,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

type PopupRecord = Record<string, any>;

type CustomerOpportunityReviewPanelProps = {
  popup: PopupRecord;
  companyLogo: ReactNode;
  rootRef: Ref<HTMLDivElement>;
  minimized: boolean;
  insufficientBalance: boolean;
  sufficientBalance: boolean;
  requiredMoney: string;
  availableMoney: string;
  shortfallMoney: string;
  expiryLabel: string;
  expiryCountdown: string;
  expiryConfirmed: boolean;
  expiryProgress: number;
  closesLabel: string;
  openedLabel: string;
  connectionStatus: "connected" | "updating" | "offline";
  connectionLabel: string;
  detailsExpanded: boolean;
  setDetailsExpanded: (expanded: boolean) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onDismiss: () => void;
  onReview: () => void;
};

function parseCompanyMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function savedText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number")
    return "Unavailable";
  const text = String(value).trim();
  return text || "Unavailable";
}

function countryFlag(countryCode: unknown): string | null {
  const code =
    typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...Array.from(code, letter => 0x1f1e6 + letter.charCodeAt(0) - 65)
  );
}

function configuredRate(value: unknown): string {
  const bps = Number(value);
  if (!Number.isSafeInteger(bps) || bps < 0) return "Unavailable";
  return `${(bps / 100).toFixed(2)}%`;
}

function configuredDuration(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return "Unavailable";
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export function CustomerOpportunityReviewPanel({
  popup,
  companyLogo,
  rootRef,
  minimized,
  insufficientBalance,
  sufficientBalance,
  requiredMoney,
  availableMoney,
  shortfallMoney,
  expiryLabel,
  expiryCountdown,
  expiryConfirmed,
  expiryProgress,
  closesLabel,
  openedLabel,
  connectionStatus,
  connectionLabel,
  detailsExpanded,
  setDetailsExpanded,
  onMinimize,
  onMaximize,
  onDismiss,
  onReview,
}: CustomerOpportunityReviewPanelProps) {
  const metadata = parseCompanyMetadata(popup.companyReferenceMetadataJson);
  const companyName = savedText(popup.companyDisplayName);
  const symbol = savedText(popup.symbol);
  const countryName =
    typeof metadata.countryName === "string" ? metadata.countryName.trim() : "";
  const flag = countryFlag(metadata.countryCode);
  const companyStatus =
    popup.companyReferenceOnly === true
      ? "Reference data only"
      : "Reference status unavailable";
  const rate = configuredRate(
    popup.configuredProfitRateBps ?? popup.expectedRewardBps
  );
  const duration = configuredDuration(
    popup.configuredDurationSeconds ?? popup.durationSeconds
  );
  const serverStatus = savedText(popup.expiryStatus || popup.offerStatus);
  const statusLabel = insufficientBalance
    ? "MISSED · INSUFFICIENT BALANCE"
    : sufficientBalance
      ? "OFFER AVAILABLE · NOT ALLOCATED"
      : "BALANCE STATUS UNAVAILABLE";

  if (minimized) {
    return (
      <div
        className="opportunity-popup-dock opportunity-review-dock"
        role="region"
        aria-label="Minimized opportunity alert"
        aria-live="polite"
      >
        <div className="opportunity-popup-dock__content">
          <strong>
            {insufficientBalance
              ? "Missed — insufficient balance"
              : sufficientBalance
                ? "Opportunity available · not allocated"
                : "Opportunity status unavailable"}
          </strong>
          <span>
            {companyName !== "Unavailable" ? companyName : symbol} ·{" "}
            {expiryLabel}: {expiryCountdown}
          </span>
          <span>Opportunity expiry: {closesLabel}</span>
          {insufficientBalance && (
            <span>
              Required: {requiredMoney} · Available at server check:{" "}
              {availableMoney} · Shortfall: {shortfallMoney}
            </span>
          )}
        </div>
        <div className="opportunity-popup-dock__actions">
          <button
            type="button"
            aria-label="Maximize opportunity alert"
            onClick={onMaximize}
          >
            Maximize
          </button>
          <button
            type="button"
            className="opportunity-popup-dock__dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="center-opportunity-toast opportunity-review-panel"
      role="region"
      aria-label="Opportunity review"
    >
      <header className="opportunity-review-header">
        <div className="opportunity-review-brand">
          <span className="opportunity-review-shield" aria-hidden="true">
            <ShieldCheck size={22} />
          </span>
          <div>
            <span className="opportunity-review-eyebrow">
              ARBITRADE · OPPORTUNITY REVIEW
            </span>
            <h2>Review opportunity</h2>
            <p>Persisted offer details · server-timed · informational only</p>
          </div>
        </div>
        <div className="opportunity-review-header-actions">
          <span
            className={`opportunity-review-status opportunity-review-status--${insufficientBalance ? "missed" : "open"}`}
          >
            {statusLabel}
          </span>
          <span
            className={`opportunity-popup-connection opportunity-popup-connection--${connectionStatus}`}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            {connectionLabel}
          </span>
          <button
            type="button"
            className="opportunity-popup-minimize"
            aria-label="Minimize opportunity alert"
            onClick={onMinimize}
          >
            Minimize
          </button>
        </div>
      </header>

      <div className="opportunity-review-grid">
        <section
          className="opportunity-review-card opportunity-review-asset"
          aria-labelledby="opportunity-review-asset-title"
        >
          <div className="opportunity-review-card-heading">
            <span className="opportunity-review-icon">
              <BadgeInfo size={16} />
            </span>
            <h3 id="opportunity-review-asset-title">Company reference</h3>
            <span className="opportunity-review-chip">{companyStatus}</span>
          </div>
          <div className="opportunity-review-company">
            {companyLogo ?? (
              <span
                className="opportunity-review-logo-fallback"
                aria-label="Company identity unavailable"
              >
                —
              </span>
            )}
            <div className="opportunity-review-company-copy">
              <strong>{companyName}</strong>
              <span>
                {symbol !== "Unavailable"
                  ? `Supplied code · ${symbol}`
                  : "Company code unavailable"}
              </span>
              <span className="opportunity-review-country">
                {flag && <span aria-hidden="true">{flag}</span>}{" "}
                {countryName || "Country unverified"}
              </span>
            </div>
          </div>
          <dl className="opportunity-review-facts">
            <div>
              <dt>Catalogue classification</dt>
              <dd>{savedText(metadata.tickerClassification)}</dd>
            </div>
            <div>
              <dt>Listing marker</dt>
              <dd>{savedText(metadata.listingStatus)}</dd>
            </div>
            <div>
              <dt>Company reference ID</dt>
              <dd>{savedText(popup.companyReferenceId)}</dd>
            </div>
          </dl>
          <p className="opportunity-review-note">
            Company catalogue information is reference data; it does not verify
            a live listing, market price, or trade.
          </p>
        </section>

        <section
          className="opportunity-review-card"
          aria-labelledby="opportunity-review-terms-title"
        >
          <div className="opportunity-review-card-heading">
            <span className="opportunity-review-icon opportunity-review-icon--violet">
              <Info size={16} />
            </span>
            <h3 id="opportunity-review-terms-title">Saved offer terms</h3>
            {popup.badgeLabel && (
              <span className="opportunity-review-chip">
                {String(popup.badgeLabel)}
              </span>
            )}
          </div>
          <div className="opportunity-review-metrics">
            <div>
              <span>Required capital</span>
              <strong>{requiredMoney}</strong>
              <small>Saved minimum for this offer</small>
            </div>
            <div>
              <span>Configured return rate</span>
              <strong>{rate}</strong>
              <small>Policy-defined return · not market-earned profit</small>
            </div>
            <div>
              <span>Configured trade duration</span>
              <strong>{duration}</strong>
              <small>Server-saved duration snapshot</small>
            </div>
          </div>
          <div className="opportunity-review-policy">
            <Info size={15} />
            <span>
              No live entry price or verified market return is recorded in this
              offer.
            </span>
          </div>
          <div className="opportunity-review-fee-row">
            <span>Platform fee / settlement</span>
            <strong>Not charged · no trade allocated</strong>
          </div>
        </section>

        <section
          className={`opportunity-review-card opportunity-review-balance${insufficientBalance ? " is-insufficient" : ""}`}
          aria-labelledby="opportunity-review-balance-title"
          role="status"
        >
          <div className="opportunity-review-card-heading">
            <span className="opportunity-review-icon opportunity-review-icon--blue">
              <WalletCards size={16} />
            </span>
            <h3 id="opportunity-review-balance-title">Balance check</h3>
            <span className="opportunity-review-chip">
              {insufficientBalance
                ? "Not allocated"
                : sufficientBalance
                  ? "Eligible at check"
                  : "Unavailable"}
            </span>
          </div>
          <div className="opportunity-review-metrics opportunity-review-metrics--balance">
            <div>
              <span>Available balance at server check</span>
              <strong>{availableMoney}</strong>
            </div>
            <div>
              <span>Required capital</span>
              <strong>{requiredMoney}</strong>
            </div>
            {insufficientBalance && (
              <div>
                <span>Shortfall</span>
                <strong>{shortfallMoney}</strong>
              </div>
            )}
          </div>
          <p>
            {insufficientBalance
              ? "This offer was recorded as missed because the available balance was below the saved requirement. No funds were moved."
              : sufficientBalance
                ? "The server reported sufficient available balance for review. This notice does not reserve or move funds."
                : "The server could not confirm the balance status. No funds were allocated or moved."}
          </p>
        </section>

        <section
          className="opportunity-review-card opportunity-review-return"
          aria-labelledby="opportunity-review-return-title"
        >
          <div className="opportunity-review-card-heading">
            <span className="opportunity-review-icon opportunity-review-icon--green">
              <Check size={16} />
            </span>
            <h3 id="opportunity-review-return-title">
              Return &amp; wallet status
            </h3>
          </div>
          <div className="opportunity-review-return-grid">
            <div>
              <span>Realized profit</span>
              <strong>Not recorded</strong>
            </div>
            <div>
              <span>Fee assessed</span>
              <strong>None</strong>
            </div>
            <div>
              <span>Funds moved</span>
              <strong>No</strong>
            </div>
          </div>
          <div className="opportunity-review-no-movement">
            <WalletCards size={16} />
            <span>
              No allocation, debit, lock, credit, or settlement is triggered by
              this popup.
            </span>
          </div>
        </section>

        <section
          className="opportunity-review-card opportunity-review-timeline"
          aria-labelledby="opportunity-review-timeline-title"
        >
          <div className="opportunity-review-card-heading">
            <span className="opportunity-review-icon opportunity-review-icon--blue">
              <Clock3 size={16} />
            </span>
            <h3 id="opportunity-review-timeline-title">Opportunity timeline</h3>
            <span className="opportunity-review-chip">{serverStatus}</span>
          </div>
          <div className="opportunity-review-time-grid">
            <div>
              <span>Offer opened</span>
              <strong>{openedLabel}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>{duration}</strong>
            </div>
            <div>
              <span>Scheduled expiry</span>
              <strong>{closesLabel}</strong>
            </div>
          </div>
          <div className="opportunity-review-expiry">
            <div className="opportunity-review-expiry-ring">
              <svg viewBox="0 0 76 76" aria-hidden="true">
                <circle
                  className="opportunity-review-expiry-track"
                  cx="38"
                  cy="38"
                  r="31"
                />
                <circle
                  className="opportunity-review-expiry-value"
                  cx="38"
                  cy="38"
                  r="31"
                  style={{
                    strokeDashoffset: 194.78 * (1 - expiryProgress / 100),
                  }}
                />
              </svg>
              <Clock3 size={17} aria-hidden="true" />
            </div>
            <div>
              <span>{expiryLabel}</span>
              <strong>{expiryCountdown}</strong>
              <small>
                {expiryConfirmed
                  ? "Server-confirmed expired status"
                  : "Countdown target comes from saved closesAt"}
              </small>
            </div>
          </div>
        </section>

        <section
          className="opportunity-review-card opportunity-review-audit"
          aria-labelledby="opportunity-review-audit-title"
        >
          <div className="opportunity-review-card-heading">
            <span className="opportunity-review-icon">
              <ShieldCheck size={16} />
            </span>
            <h3 id="opportunity-review-audit-title">Record &amp; audit</h3>
          </div>
          <dl className="opportunity-review-facts opportunity-review-facts--audit">
            <div>
              <dt>Opportunity reference</dt>
              <dd>{savedText(popup.id)}</dd>
            </div>
            <div>
              <dt>Policy version</dt>
              <dd>
                {savedText(
                  popup.packagePolicyVersionSnapshot ?? popup.policyVersion
                )}
              </dd>
            </div>
            <div>
              <dt>Delivery event</dt>
              <dd>{savedText(popup.deliveryEventId)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section
        className="opportunity-popup-details opportunity-review-extra"
        aria-label="Additional saved opportunity fields"
      >
        <button
          type="button"
          className="opportunity-popup-details__toggle"
          aria-expanded={detailsExpanded}
          onClick={() => setDetailsExpanded(!detailsExpanded)}
        >
          {detailsExpanded ? "Hide" : "Show"} additional saved details{" "}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {detailsExpanded && (
          <dl className="opportunity-popup-details__grid">
            <div>
              <dt>Company</dt>
              <dd>{companyName}</dd>
            </div>
            <div>
              <dt>Assigned package label</dt>
              <dd>{savedText(popup.packageBadgeLabel ?? popup.badgeLabel)}</dd>
            </div>
            <div>
              <dt>Supplied symbol</dt>
              <dd>{symbol}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{savedText(popup.currency)}</dd>
            </div>
            <div>
              <dt>Opened at</dt>
              <dd>{openedLabel}</dd>
            </div>
            <div>
              <dt>Scheduled expiry</dt>
              <dd>{closesLabel}</dd>
            </div>
            <div>
              <dt>Server status</dt>
              <dd>{serverStatus}</dd>
            </div>
            <div>
              <dt>Configured rate snapshot</dt>
              <dd>{rate}</dd>
            </div>
          </dl>
        )}
      </section>

      <footer className="opportunity-review-footer">
        <div className="opportunity-review-risk">
          <Info size={15} />
          <span>
            Informational only. This notice does not execute a trade, allocate
            capital, or change a wallet balance. No automatic financial
            execution or guaranteed return is represented here.
          </span>
        </div>
        <div className="opportunity-review-actions">
          <button
            type="button"
            className="opportunity-review-secondary"
            onClick={onDismiss}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="opportunity-review-primary"
            onClick={onReview}
          >
            Review in Trading <ArrowUpRight size={15} />
          </button>
        </div>
      </footer>
    </div>
  );
}

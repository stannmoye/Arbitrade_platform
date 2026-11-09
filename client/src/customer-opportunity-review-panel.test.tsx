import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerOpportunityReviewPanel } from "./components/CustomerOpportunityReviewPanel";

type ReviewPanelProps = ComponentProps<typeof CustomerOpportunityReviewPanel>;

const baseProps: ReviewPanelProps = {
  popup: {
    id: 2841,
    companyDisplayName: "Fixture Reference Co",
    companyReferenceId: "LOGO-2841",
    companyReferenceOnly: true,
    companyReferenceMetadataJson: JSON.stringify({
      countryCode: "GB",
      countryName: "United Kingdom",
      tickerClassification: "Placeholder",
      listingStatus: "Unverified",
    }),
    symbol: "FIXTURE",
    currency: "USD",
    configuredProfitRateBps: 150,
    configuredDurationSeconds: 1200,
    packagePolicyVersionSnapshot: 7,
    deliveryEventId: 903,
    offerStatus: "open",
    expiryStatus: "active",
    badgeLabel: "Assigned tier label",
  },
  companyLogo: createElement(
    "span",
    { "aria-label": "Local company logo" },
    "Logo"
  ),
  rootRef: { current: null },
  minimized: false,
  insufficientBalance: false,
  sufficientBalance: true,
  requiredMoney: "USD 250.00",
  availableMoney: "USD 800.00",
  shortfallMoney: "USD 0.00",
  expiryLabel: "Opportunity expires in",
  expiryCountdown: "12:34",
  expiryConfirmed: false,
  expiryProgress: 50,
  closesLabel: "12/01/2026, 12:00:00",
  openedLabel: "12/01/2026, 11:40:00",
  connectionStatus: "connected" as const,
  connectionLabel: "Server connection active",
  detailsExpanded: false,
  setDetailsExpanded: () => undefined,
  onMinimize: () => undefined,
  onMaximize: () => undefined,
  onDismiss: () => undefined,
  onReview: () => undefined,
};

function renderPanel(overrides: Partial<ReviewPanelProps> = {}) {
  return renderToStaticMarkup(
    createElement(CustomerOpportunityReviewPanel, {
      ...baseProps,
      ...overrides,
    })
  );
}

describe("customer opportunity review panel", () => {
  it("renders persisted company and offer data without implying a live quote or execution", () => {
    const html = renderPanel();
    expect(html).toContain("Fixture Reference Co");
    expect(html).toContain("FIXTURE");
    expect(html).toContain("🇬🇧");
    expect(html).toContain("United Kingdom");
    expect(html).toContain("LOGO-2841");
    expect(html).toContain("1.50%");
    expect(html).toContain("20 minutes");
    expect(html).toContain("Reference data only");
    expect(html).toContain(
      "No live entry price or verified market return is recorded in this offer."
    );
    expect(html).toContain("No automatic financial execution");
    expect(html).toContain("Review in Trading");
    expect(html).not.toContain("Confirm &amp; Execute");
    expect(html).not.toContain(">LIVE<");
  });

  it("uses explicit unavailable labels instead of guessing missing company metadata", () => {
    const html = renderPanel({
      popup: {
        ...baseProps.popup,
        companyDisplayName: null,
        companyReferenceId: null,
        companyReferenceOnly: false,
        companyReferenceMetadataJson: "{}",
        symbol: null,
      },
      companyLogo: null,
    });
    expect(html).toContain("Company identity unavailable");
    expect(html).toContain("Company code unavailable");
    expect(html).toContain("Country unverified");
    expect(html).toContain("Reference status unavailable");
    expect(html).not.toContain("🇺🇸");
  });

  it("shows required, available, and shortfall values for a missed offer without allocating funds", () => {
    const html = renderPanel({
      insufficientBalance: true,
      sufficientBalance: false,
      requiredMoney: "USD 900.00",
      availableMoney: "USD 400.00",
      shortfallMoney: "USD 500.00",
    });
    expect(html).toContain("MISSED · INSUFFICIENT BALANCE");
    expect(html).toContain("USD 900.00");
    expect(html).toContain("USD 400.00");
    expect(html).toContain("USD 500.00");
    expect(html).toContain("No funds were moved.");
    expect(html).toContain("Funds moved");
    expect(html).toContain(
      "No allocation, debit, lock, credit, or settlement is triggered by this popup."
    );
  });

  it("keeps the fixed minimized dock limited to the same offer status and server expiry", () => {
    const html = renderPanel({ minimized: true });
    expect(html).toContain("Minimized opportunity alert");
    expect(html).toContain("Maximize");
    expect(html).toContain("Dismiss");
    expect(html).toContain("Fixture Reference Co");
    expect(html).toContain("12:34");
    expect(html).not.toContain("Review in Trading");
  });
});

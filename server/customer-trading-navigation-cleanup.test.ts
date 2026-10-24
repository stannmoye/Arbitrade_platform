import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const menuSource = readFileSync(new URL("../client/src/components/CustomerSlideMenu.tsx", import.meta.url), "utf8");

function between(source: string, start: string, end: string) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  expect(startAt, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing section end: ${end}`).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

describe("customer trading and Mining navigation cleanup", () => {
  it("removes the navigation-only calculator and routes shortcuts to working pages", () => {
    const dashboard = between(appSource, "function CustomerDashboard(", "function CustomerOpportunities(");
    expect(appSource).not.toContain("Trade Calculator");
    expect(dashboard).toContain("<strong>Trading Opportunities</strong>");
    expect(dashboard).toContain('onClick={()=>nav("wallet")}><Plus size={15}/> Add funds');
    expect(dashboard).toContain('onClick={()=>nav("opportunities")}');
    expect(dashboard).toContain("<span>Open opportunities</span>");
  });

  it("does not present the administrator daily ceiling as a customer control", () => {
    const dashboard = between(appSource, "function CustomerDashboard(", "function CustomerOpportunities(");
    expect(dashboard).not.toContain("dailyTradeLimitMinor");
    expect(dashboard).not.toContain("autoTradeSettings.useQuery");
    expect(dashboard).not.toContain("Administrator daily ceiling");
    expect(dashboard).not.toContain("Per-opportunity amount");
  });

  it("shows trade progress only on Home and Trading Opportunities", () => {
    expect(appSource).toContain('{(section==="dashboard"||section==="opportunities")&&<CustomerTradeProgress/>}');
    expect(appSource).toContain('name={String(user.name||user.email||"Customer").split("@")[0]}');
    expect(appSource).not.toContain("Welcome back, Jordan.");
    expect(appSource).not.toContain("CustomerInvestmentCategory");
  });

  it("keeps the customer drawer focused on active destinations and tools", () => {
    const groups = between(menuSource, "const destinationGroups:", "const destinations =");
    const searchDestinations = between(menuSource, "const mainPageSearchDestinations:", "const menuTargets =");
    expect(groups).toContain('target: "advanced"');
    expect(groups).toContain('target: "intelligence"');
    expect(groups).not.toContain('target: "account"');
    for (const retired of ["treasury-bond", "cooperate-dept", "litigation-funds", "ip-royalties", "music-royalties", "agro-investment", "carbon-credit", "green-energy", "token-launch", "tokenomics"]) {
      expect(searchDestinations).not.toContain(retired);
      expect(groups).not.toContain(retired);
    }
    expect(menuSource).not.toContain("item.planned");
    expect(menuSource).not.toContain("Items marked Planned");
    expect(menuSource).toContain('import { useEffect, useMemo, useRef, useState } from "react";');
    expect(menuSource).toContain('import { trpc } from "@/lib/trpc";');
    expect(menuSource).toContain('import { createPortal } from "react-dom";');
  });

  it("removes static resource/category shells while preserving the account Privacy Centre", () => {
    expect(appSource).not.toContain("customerResourceNavigation");
    expect(appSource).not.toContain("CustomerResourcePanel");
    expect(appSource).not.toContain("customerResourceIds");
    expect(appSource).toContain("<CustomerPrivacyCenter/>");
  });
  it("keeps the working Trade & Earn and Stake & Earn routes visible in the primary workspace menu", () => {
    const workspaceMenu = between(appSource, "function CustomerTopWorkspaceMenu(", "type CustomerPreferenceItem =");
    expect(workspaceMenu).toContain('onNavigate("opportunities")');
    expect(workspaceMenu).toContain('onNavigate("yield")');
    expect(workspaceMenu).toContain("customerInvestmentNavigation.map");
    expect(appSource).toContain('id:"crypto-mining"');
    expect(workspaceMenu).toContain('onNavigate("support")');
  });

});

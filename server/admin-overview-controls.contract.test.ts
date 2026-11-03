import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const operationsUi = readFileSync(resolve(process.cwd(), "client/src/components/AdminOperationsPages.tsx"), "utf8");

describe("admin Home content and navigation", () => {
  it("keeps Trading controls out of Home and other pages unless Package Configuration is selected", () => {
    expect(app).toContain('{section==="tradePackageConfiguration"&&<AdminPackageConfiguration/>}');
    expect(app).not.toContain('{section!=="overview"&&<AdminTradingGlobalControls/>}');
    expect(app).toContain('<PortalRenderBoundary key={section} portal="admin">');
  });

  it("starts navigation groups collapsed and does not auto-expand the active group on Home", () => {
    expect(app).toContain('const [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({});');
    expect(app).toContain('useEffect(()=>{if(section==="overview") setExpandedGroups({})},[section]);');
    expect(app).toContain('const isOpen=Boolean(expandedGroups[group.id] || (section!=="overview" && group.items.some((item)=>item.target===section && item.focus===focus)));');
  });

  it("distinguishes unconfirmed settlement reviews from confirmed trades awaiting wallet credit", () => {
    const start = operationsUi.indexOf("export function AdminTradeSettingsOverview()");
    const end = operationsUi.indexOf("export function AdminVerificationOversight()", start);
    const overview = operationsUi.slice(start, end);

    expect(overview).toContain('label="Manual settlements requiring review"');
    expect(overview).toContain('trade.settlementStatus === "pending"');
    expect(overview).toContain('pending.data?.filter((trade) => trade.settlementStatus === "pending").length');
    expect(overview).toContain('label="Confirmed, awaiting wallet credit"');
    expect(overview).toContain('trade.settlementStatus === "confirmed_awaiting_credit"');
    expect(overview).toContain('pending.data?.filter((trade) => trade.settlementStatus === "confirmed_awaiting_credit").length');
    expect(overview).toContain("Unconfirmed results awaiting administrator review");
    expect(overview).toContain("Result confirmed; waiting for scheduled wallet credit");
    expect(overview).not.toContain('label="Manual settlements pending"');
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("admin Home content and navigation", () => {
  it("keeps global Trading controls off Home while preserving them on other admin pages", () => {
    expect(app).toContain('{section!=="overview"&&<AdminTradingGlobalControls/>}');
    expect(app).toContain('<PortalRenderBoundary key={section} portal="admin">');
  });

  it("starts navigation groups collapsed and does not auto-expand the active group on Home", () => {
    expect(app).toContain('const [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({});');
    expect(app).toContain('useEffect(()=>{if(section==="overview") setExpandedGroups({})},[section]);');
    expect(app).toContain('const isOpen=Boolean(expandedGroups[group.id] || (section!=="overview" && group.items.some((item)=>item.target===section && item.focus===focus)));');
  });
});

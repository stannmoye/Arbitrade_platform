import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { getPageCount } from "../trading-catalogue-pagination";

const PAGE_SIZE = 10;
type AdminCompanyStatus = "verified" | "unverified" | "archived";

export default function AdminCompanyCatalogue() {
  const [search, setSearch] = useState("");
  const [countryName, setCountryName] = useState("");
  const [page, setPage] = useState(0);
  const [viewAll, setViewAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | AdminCompanyStatus>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const summary = trpc.companyCatalogueReference.summary.useQuery();
  const count = trpc.companyCatalogueReference.count.useQuery({
    search: search.trim() || undefined,
    countryName: countryName || undefined,
  });
  // Fetch the bounded, fixed catalogue once per filter so selection can span every
  // matching record without confusing "select all" with the current visible page.
  const records = trpc.companyCatalogueReference.search.useQuery({
    search: search.trim() || undefined,
    countryName: countryName || undefined,
    offset: 0,
    limit: 1811,
  });
  const adminState = trpc.companyCatalogueReference.adminState.useQuery();
  const utils = trpc.useUtils();
  const updateStatus = trpc.companyCatalogueReference.updateAdminState.useMutation({
    onSuccess: async () => {
      await utils.companyCatalogueReference.adminState.invalidate();
      setSelectedIds(new Set());
    },
  });

  const total = count.data ?? 0;
  const statuses = adminState.data?.statusById ?? {};
  const countries = useMemo(
    () => Object.keys(summary.data?.countryCounts ?? {}).sort((a, b) => a.localeCompare(b)),
    [summary.data?.countryCounts],
  );
  const filteredRecords = useMemo(() => (records.data ?? []).filter((company) => {
    const status = (statuses[company.id]?.status ?? "unverified") as AdminCompanyStatus;
    return statusFilter === "all" ? status !== "archived" : status === statusFilter;
  }), [records.data, statuses, statusFilter]);
  const pageCount = getPageCount(filteredRecords.length, PAGE_SIZE);
  const displayedRecords = viewAll ? filteredRecords : filteredRecords.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const firstRecord = filteredRecords.length === 0 ? 0 : viewAll ? 1 : page * PAGE_SIZE + 1;
  const lastRecord = viewAll ? filteredRecords.length : Math.min((page + 1) * PAGE_SIZE, filteredRecords.length);
  const selectedCount = selectedIds.size;
  const allMatchingSelected = filteredRecords.length > 0 && filteredRecords.every((company) => selectedIds.has(company.id));
  const allVisibleSelected = displayedRecords.length > 0 && displayedRecords.every((company) => selectedIds.has(company.id));

  useEffect(() => { setPage(0); }, [search, countryName, statusFilter, viewAll]);
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const toggleCompany = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const selectVisible = () => setSelectedIds((current) => {
    const next = new Set(current);
    displayedRecords.forEach((company) => next.add(company.id));
    return next;
  });
  const selectAllMatches = () => setSelectedIds((current) => {
    const next = new Set(current);
    filteredRecords.forEach((company) => next.add(company.id));
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const applyStatus = async (status: AdminCompanyStatus) => {
    const ids = [...selectedIds];
    if (!ids.length || updateStatus.isPending) return;
    const label = status === "archived" ? "archive" : status === "verified" ? "mark as admin-verified" : "mark as unverified";
    const confirmed = window.confirm(`You are about to ${label} ${ids.length.toLocaleString()} selected compan${ids.length === 1 ? "y" : "ies"}. Continue?`);
    if (!confirmed) return;
    const reason = status === "archived" ? "Administrator archived selected catalogue records." : status === "verified" ? "Administrator marked selected catalogue records as verified." : "Administrator marked selected catalogue records as unverified.";
    await updateStatus.mutateAsync({ ids, status, reason });
  };

  const restoreSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length || updateStatus.isPending) return;
    if (!window.confirm(`Restore ${ids.length.toLocaleString()} selected archived compan${ids.length === 1 ? "y" : "ies"} to the unverified catalogue?`)) return;
    await updateStatus.mutateAsync({ ids, status: "unverified", reason: "Administrator restored archived catalogue records." });
  };

  return <div className="arb-page portal-page admin-company-catalogue">
    <div className="portal-page-top">
      <div>
        <div className="eyebrow">Trade · Company reference catalogue</div>
        <h1>Company names shown</h1>
        <p>Manage the saved company/logo reference collection. Admin verification is an internal catalogue label; it does not certify a stock-market listing or make a company eligible for trade execution.</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => { void summary.refetch(); void count.refetch(); void records.refetch(); void adminState.refetch(); }} disabled={summary.isFetching || count.isFetching || records.isFetching || adminState.isFetching}>Refresh catalogue</button>
    </div>

    <div className="admin-kpi-grid">
      <div><span>Saved company records</span><strong>{summary.data?.total?.toLocaleString() ?? "—"}</strong><b>Stable Logo ID catalogue</b></div>
      <div><span>Matching records</span><strong>{total.toLocaleString()}</strong><b>Search and country filter</b></div>
      <div><span>Admin marked verified</span><strong>{Object.values(statuses).filter((entry) => entry.status === "verified").length.toLocaleString()}</strong><b>Internal admin status only</b></div>
      <div><span>Selected companies</span><strong>{selectedCount.toLocaleString()}</strong><b>Ready for bulk action</b></div>
    </div>

    <section className="admin-table-card company-catalogue-panel">
      <div className="company-catalogue-filters">
        <label>Search companies, domain, ticker or exchange
          <input type="search" value={search} maxLength={100} placeholder="Search company names or supplied codes…" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>Country folder
          <select value={countryName} onChange={(event) => setCountryName(event.target.value)}>
            <option value="">All country folders</option>
            {countries.map((country) => <option key={country} value={country}>{country}</option>)}
          </select>
        </label>
        <label>Catalogue status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | AdminCompanyStatus)}>
            <option value="all">All active companies</option>
            <option value="unverified">Unverified</option>
            <option value="verified">Admin marked verified</option>
            <option value="archived">Archived / deleted</option>
          </select>
        </label>
      </div>

      <div className="company-catalogue-toolbar">
        <div className="company-catalogue-toolbar-group">
          <button className="secondary-button" type="button" onClick={() => setViewAll((current) => !current)}>{viewAll ? "Show 10 per page" : "View all companies"}</button>
          <button className="secondary-button" type="button" onClick={selectVisible} disabled={!displayedRecords.length || allVisibleSelected}>Select visible</button>
          <button className="secondary-button" type="button" onClick={selectAllMatches} disabled={!filteredRecords.length || allMatchingSelected}>Select all {filteredRecords.length.toLocaleString()} matches</button>
          <button className="secondary-button" type="button" onClick={clearSelection} disabled={!selectedCount}>Clear selection</button>
        </div>
        <strong>{selectedCount.toLocaleString()} selected</strong>
      </div>

      {records.isLoading || adminState.isLoading ? <div className="empty-state" role="status">Loading company catalogue…</div> : null}
      {(records.isError || adminState.isError) && <div className="admin-ops-empty error" role="alert">
        <strong>Company catalogue could not be loaded.</strong>
        <p>{records.error?.message ?? adminState.error?.message}</p>
        <button className="secondary-button" type="button" onClick={() => { void records.refetch(); void adminState.refetch(); }}>Retry loading</button>
      </div>}

      {!records.isLoading && !records.isError && filteredRecords.length === 0 && <div className="empty-state">No company records match these filters.</div>}

      <div className={`company-catalogue-list ${viewAll ? "is-view-all" : ""}`}>
        {displayedRecords.map((company) => {
          const logoId = company.id.replace(/^logo-brand-/, "");
          const status = (statuses[company.id]?.status ?? "unverified") as AdminCompanyStatus;
          const statusLabel = status === "verified" ? "Admin marked verified" : status === "archived" ? "Archived" : "Unverified";
          return <article className={`company-catalogue-row ${selectedIds.has(company.id) ? "is-selected" : ""}`} key={company.id}>
            <label className="company-catalogue-select" aria-label={`Select ${company.name}`}>
              <input type="checkbox" checked={selectedIds.has(company.id)} onChange={(event) => toggleCompany(company.id, event.target.checked)} />
            </label>
            <img src={company.logoUrl} alt={company.name + " logo"} loading="lazy" />
            <div className="company-catalogue-main">
              <div className="company-catalogue-title"><strong>{company.name}</strong><span>Logo ID {logoId}</span></div>
              <div className="company-catalogue-meta">
                <span>Country folder: {company.countryName}</span>
                <span>Code: {company.ticker || "Not supplied"}</span>
                <span>Exchange: {company.exchangeCode || "Not supplied"}</span>
              </div>
              <div className="company-catalogue-meta">
                <span>Workbook status: {company.tickerResearchStatus}</span>
                <span>Classification: {company.tickerClassification}</span>
                {company.parentTicker && <span>Parent ticker: {company.parentTicker}</span>}
              </div>
              {company.whyNoRealTicker && <small className="company-catalogue-reason">{company.whyNoRealTicker}</small>}
            </div>
            <span className={`company-catalogue-status ${status}`}>{statusLabel}</span>
          </article>;
        })}
      </div>

      {!viewAll && filteredRecords.length > PAGE_SIZE && <div className="company-catalogue-pagination" aria-label="Company catalogue pagination">
        <span>Showing {firstRecord.toLocaleString()}–{lastRecord.toLocaleString()} of {filteredRecords.length.toLocaleString()} companies</span>
        <div>
          <button className="secondary-button" type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</button>
          <span>Page {Math.min(page + 1, pageCount)} of {pageCount}</span>
          <button className="secondary-button" type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page + 1 >= pageCount}>Next</button>
        </div>
      </div>}

      <div className="company-catalogue-bulk-actions">
        <button className="primary-button" type="button" onClick={() => void applyStatus("verified")} disabled={!selectedCount || updateStatus.isPending}>Mark selected verified</button>
        <button className="secondary-button" type="button" onClick={() => void applyStatus("unverified")} disabled={!selectedCount || updateStatus.isPending}>Mark selected unverified</button>
        {statusFilter === "archived"
          ? <button className="secondary-button" type="button" onClick={() => void restoreSelected()} disabled={!selectedCount || updateStatus.isPending}>Restore selected</button>
          : <button className="danger-button" type="button" onClick={() => void applyStatus("archived")} disabled={!selectedCount || updateStatus.isPending}>Delete selected</button>}
      </div>
      {updateStatus.isError && <p className="admin-ops-empty error" role="alert">{updateStatus.error.message}</p>}
      {updateStatus.isSuccess && <p className="company-catalogue-success" role="status">Catalogue changes saved.</p>}
    </section>
    <p className="company-catalogue-disclaimer">Delete moves records to Archived; it does not permanently remove the source catalogue. Archived records can be restored. Admin verification is an internal status only: all records remain reference-only and ineligible for verified trade rotation.</p>
  </div>;
}

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { getPageCount } from "../trading-catalogue-pagination";

const PAGE_SIZE = 10;

export default function AdminCompanyCatalogue() {
  const [search, setSearch] = useState("");
  const [countryName, setCountryName] = useState("");
  const [page, setPage] = useState(0);
  const summary = trpc.companyCatalogueReference.summary.useQuery();
  const count = trpc.companyCatalogueReference.count.useQuery({
    search: search.trim() || undefined,
    countryName: countryName || undefined,
  });
  const records = trpc.companyCatalogueReference.search.useQuery({
    search: search.trim() || undefined,
    countryName: countryName || undefined,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const total = count.data ?? 0;
  const pageCount = getPageCount(total, PAGE_SIZE);
  const firstRecord = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRecord = Math.min((page + 1) * PAGE_SIZE, total);
  const countries = useMemo(
    () => Object.keys(summary.data?.countryCounts ?? {}).sort((a, b) => a.localeCompare(b)),
    [summary.data?.countryCounts],
  );

  useEffect(() => { setPage(0); }, [search, countryName]);
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  return <div className="arb-page portal-page admin-company-catalogue">
    <div className="portal-page-top">
      <div>
        <div className="eyebrow">Trade · Company reference catalogue</div>
        <h1>Company names shown</h1>
        <p>Browse the complete saved company/logo reference collection. These are informational brand records, not verified active securities or authorization to execute a trade.</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => { void summary.refetch(); void count.refetch(); void records.refetch(); }} disabled={summary.isFetching || count.isFetching || records.isFetching}>Refresh catalogue</button>
    </div>

    <div className="admin-kpi-grid">
      <div><span>Saved company records</span><strong>{summary.data?.total?.toLocaleString() ?? "—"}</strong><b>Stable Logo ID catalogue</b></div>
      <div><span>Matching records</span><strong>{total.toLocaleString()}</strong><b>Current search and country filter</b></div>
      <div><span>Verified active listings</span><strong>{summary.data?.verifiedActive ?? "—"}</strong><b>None are independently verified</b></div>
      <div><span>Workbook public candidates</span><strong>{summary.data?.tickerCandidates?.toLocaleString() ?? "—"}</strong><b>Research status only</b></div>
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
      </div>

      {records.isLoading && <div className="empty-state" role="status">Loading company catalogue…</div>}
      {records.isError && <div className="admin-ops-empty error" role="alert">
        <strong>Company catalogue could not be loaded.</strong>
        <p>{records.error.message}</p>
        <button className="secondary-button" type="button" onClick={() => void records.refetch()}>Retry loading</button>
      </div>}

      {!records.isLoading && !records.isError && (records.data?.length ?? 0) === 0 && <div className="empty-state">No company records match these filters.</div>}

      <div className="company-catalogue-list">
        {(records.data ?? []).map((company) => {
          const logoId = company.id.replace(/^logo-brand-/, "");
          return <article className="company-catalogue-row" key={company.id}>
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
            <span className="company-catalogue-status">Reference only · Unverified</span>
          </article>;
        })}
      </div>

      <div className="company-catalogue-pagination" aria-label="Company catalogue pagination">
        <span>Showing {firstRecord.toLocaleString()}–{lastRecord.toLocaleString()} of {total.toLocaleString()} companies</span>
        <div>
          <button className="secondary-button" type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || records.isFetching}>Previous</button>
          <span>Page {Math.min(page + 1, pageCount)} of {pageCount}</span>
          <button className="secondary-button" type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page + 1 >= pageCount || records.isFetching}>Next</button>
        </div>
      </div>
    </section>
    <p className="company-catalogue-disclaimer">{summary.data?.note ?? "Company reference data is not proof of a verified security listing."} Supplied ticker values and workbook classifications are displayed as provided and must not be treated as live market instruments.</p>
  </div>;
}

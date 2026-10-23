import { useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileClock,
  FileText,
  History,
  LockKeyhole,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  PRIVACY_REQUEST_TYPES,
  privacyRequestStatusLabel,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from "../../../shared/privacy";
import "./privacy-center.css";

function displayDate(value: Date | string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function displayDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CustomerPrivacyCenter() {
  const policy = trpc.privacy.currentPolicy.useQuery(undefined, { retry: 1 });
  const history = trpc.privacy.policyHistory.useQuery(undefined, { retry: 1 });
  const requests = trpc.privacy.myRequests.useQuery(undefined, { refetchInterval: 30000 });
  const utils = trpc.useUtils();
  const createRequest = trpc.privacy.createRequest.useMutation();
  const cancelRequest = trpc.privacy.cancelRequest.useMutation();
  const formRef = useRef<HTMLDivElement | null>(null);
  const requestKey = useRef<string>(globalThis.crypto?.randomUUID?.() || "privacy-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  const [requestType, setRequestType] = useState<PrivacyRequestType>("access");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [requestError, setRequestError] = useState("");

  const currentPolicy = policy.data;
  const viewedPolicy = selectedVersionId
    ? history.data?.find((item) => item.id === selectedVersionId) || currentPolicy
    : currentPolicy;
  const historicalView = Boolean(viewedPolicy && currentPolicy && viewedPolicy.id !== currentPolicy.id);
  const customerRequests = requests.data || [];

  const openRequestForm = (type?: PrivacyRequestType) => {
    if (type) setRequestType(type);
    setFormOpen(true);
    setNotice("");
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const downloadPolicy = () => {
    if (!viewedPolicy) return;
    const text = [
      viewedPolicy.title,
      "Version " + viewedPolicy.versionLabel,
      "Effective: " + displayDate(viewedPolicy.effectiveAt),
      "",
      viewedPolicy.summary,
      "",
      ...viewedPolicy.sections.flatMap((section) => [section.title, section.body, ""]),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "privacy-notice-" + viewedPolicy.versionLabel.replace(/[^a-z0-9.-]/gi, "-") + ".txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError("");
    setNotice("");
    try {
      const result = await createRequest.mutateAsync({
        requestType,
        subject: subject.trim(),
        details: details.trim(),
        idempotencyKey: requestKey.current,
      });
      requestKey.current = globalThis.crypto?.randomUUID?.() || "privacy-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      setSubject("");
      setDetails("");
      setFormOpen(false);
      setNoticeTone("success");
      setNotice("Request received. Keep reference " + result.requestReference + " for your records.");
      await Promise.all([utils.privacy.myRequests.invalidate(), utils.privacy.policyHistory.invalidate()]);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Your request could not be submitted. Please retry.");
    }
  };

  const cancelOwnRequest = async (requestId: number, reference: string) => {
    setNotice("");
    setRequestError("");
    try {
      await cancelRequest.mutateAsync({ requestId });
      setNoticeTone("success");
      setNotice("Request " + reference + " has been cancelled.");
      await utils.privacy.myRequests.invalidate();
    } catch (error) {
      setNoticeTone("error");
      setNotice(error instanceof Error ? error.message : "The request could not be cancelled.");
    }
  };

  return (
    <div className="arb-page portal-page privacy-center-page">
      <div className="portal-page-top privacy-page-top">
        <div>
          <div className="eyebrow">Account governance · Privacy</div>
          <h1>Privacy Centre</h1>
          <p>Understand how account information is handled and keep track of privacy requests in one place.</p>
        </div>
        <span className="privacy-top-chip"><ShieldCheck size={14} /> Privacy information</span>
      </div>

      <section className="privacy-hero" aria-labelledby="privacy-hero-title">
        <div className="privacy-hero-art" aria-hidden="true">
          <div className="privacy-orbit privacy-orbit-one" />
          <div className="privacy-orbit privacy-orbit-two" />
          <div className="privacy-shield"><LockKeyhole size={29} /></div>
          <span className="privacy-art-dot privacy-art-dot-one" />
          <span className="privacy-art-dot privacy-art-dot-two" />
        </div>
        <div className="privacy-hero-copy">
          <span className="privacy-kicker"><Sparkles size={13} /> CLARITY. CONFIDENTIALITY. CONTROL.</span>
          <h2 id="privacy-hero-title">Your information deserves responsible care.</h2>
          <p>Review the published Privacy Notice, understand the information used across financial account services, and submit a request for an authorized review.</p>
          <div className="privacy-hero-actions">
            <button type="button" className="privacy-primary-button" onClick={() => openRequestForm("access")}>
              Make a privacy request <ArrowRight size={15} />
            </button>
            <button type="button" className="privacy-secondary-button" onClick={downloadPolicy} disabled={!viewedPolicy}>
              <ArrowDownToLine size={15} /> Download notice
            </button>
          </div>
        </div>
        <div className="privacy-hero-version">
          <span className="privacy-live-mark"><i /> PUBLISHED NOTICE</span>
          <span className="privacy-version-number">{currentPolicy ? "v" + currentPolicy.versionLabel : "—"}</span>
          <span className="privacy-version-label">Current version</span>
          <span className="privacy-version-date"><CalendarDays size={13} /> Effective {displayDate(currentPolicy?.effectiveAt)}</span>
        </div>
      </section>

      {notice && <div className={"privacy-inline-notice " + (noticeTone === "error" ? "is-error" : "is-success")} role="status" aria-live="polite">
        {noticeTone === "error" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
        <span>{notice}</span>
        <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><XCircle size={14} /></button>
      </div>}

      <div className="privacy-overview-grid">
        <div className="privacy-overview-card">
          <span className="privacy-overview-icon"><FileText size={17} /></span>
          <span className="privacy-overview-label">Published notice</span>
          <strong>{policy.isLoading ? "Loading…" : currentPolicy?.versionLabel || "Unavailable"}</strong>
          <small>{currentPolicy ? "Effective " + displayDate(currentPolicy.effectiveAt) : "The published notice could not be loaded."}</small>
        </div>
        <div className="privacy-overview-card">
          <span className="privacy-overview-icon"><FileClock size={17} /></span>
          <span className="privacy-overview-label">Your requests</span>
          <strong>{requests.isLoading ? "…" : customerRequests.length}</strong>
          <small>Requests submitted from this account</small>
        </div>
        <div className="privacy-overview-card">
          <span className="privacy-overview-icon"><History size={17} /></span>
          <span className="privacy-overview-label">Notice history</span>
          <strong>{history.isLoading ? "…" : (history.data || []).length}</strong>
          <small>Published versions available for review</small>
        </div>
      </div>

      <div className="privacy-content-grid">
        <main className="privacy-main-column">
          <section className="privacy-document-card" aria-labelledby="privacy-notice-heading">
            <div className="privacy-section-heading">
              <div>
                <span className="eyebrow">THE NOTICE</span>
                <h2 id="privacy-notice-heading">{viewedPolicy?.title || "Privacy Notice"}</h2>
                <p>{viewedPolicy?.summary || "The published notice describes information handling practices and available privacy request routes."}</p>
              </div>
              {historicalView && <span className="privacy-history-badge">Historical version</span>}
            </div>

            {policy.isLoading ? (
              <div className="privacy-loading-panel" role="status">Loading the published Privacy Notice…</div>
            ) : policy.isError ? (
              <div className="privacy-empty-state" role="alert">
                <ShieldCheck size={22} />
                <strong>Privacy information is temporarily unavailable.</strong>
                <span>Reload this section to retrieve the published notice from the application.</span>
                <button type="button" className="privacy-secondary-button" onClick={() => policy.refetch()}>Retry loading</button>
              </div>
            ) : !viewedPolicy ? (
              <div className="privacy-empty-state">
                <FileText size={22} />
                <strong>No published notice is available yet.</strong>
                <span>Please contact platform support while an administrator reviews the publication configuration.</span>
              </div>
            ) : (
              <>
                {historicalView && <div className="privacy-history-banner">
                  <History size={15} />
                  <span>You are viewing version {viewedPolicy.versionLabel}, published on {displayDate(viewedPolicy.publishedAt)}. This version is retained for reference.</span>
                  <button type="button" onClick={() => setSelectedVersionId(null)}>Return to current</button>
                </div>}
                <div className="privacy-document-meta">
                  <span><FileText size={13} /> Version {viewedPolicy.versionLabel}</span>
                  <span><CalendarDays size={13} /> Effective {displayDate(viewedPolicy.effectiveAt)}</span>
                  <span><Clock3 size={13} /> Published {displayDate(viewedPolicy.publishedAt)}</span>
                </div>
                <div className="privacy-document-sections">
                  {viewedPolicy.sections.map((section, index) => (
                    <details className="privacy-policy-section" key={section.id} open={index === 0}>
                      <summary>
                        <span className="privacy-section-index">{String(index + 1).padStart(2, "0")}</span>
                        <span className="privacy-section-title">{section.title}</span>
                        <ChevronDown size={16} className="privacy-section-chevron" />
                      </summary>
                      <div className="privacy-policy-body"><p>{section.body}</p></div>
                    </details>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="privacy-request-list-card" aria-labelledby="privacy-requests-heading">
            <div className="privacy-section-heading">
              <div>
                <span className="eyebrow">ACCOUNTABLE FOLLOW-THROUGH</span>
                <h2 id="privacy-requests-heading">Your privacy requests</h2>
                <p>Each request receives a unique reference and a recorded status history.</p>
              </div>
              <button type="button" className="privacy-secondary-button" onClick={() => requests.refetch()} disabled={requests.isFetching}>
                <RotateCcw size={14} /> Refresh
              </button>
            </div>
            {requests.isLoading ? <div className="privacy-loading-panel" role="status">Loading your requests…</div> :
              requests.isError ? <div className="privacy-empty-state" role="alert"><span>Your request history could not be loaded.</span><button type="button" className="privacy-secondary-button" onClick={() => requests.refetch()}>Retry</button></div> :
              customerRequests.length === 0 ? (
                <div className="privacy-empty-state privacy-empty-compact">
                  <MessageSquareText size={22} />
                  <strong>No privacy requests yet.</strong>
                  <span>Requests you submit here will appear with a reference, current status and relevant customer-facing updates.</span>
                  <button type="button" className="privacy-primary-button" onClick={() => openRequestForm()}>Create your first request <ArrowRight size={14} /></button>
                </div>
              ) : (
                <div className="privacy-request-list">
                  {customerRequests.map((request) => (
                    <article className="privacy-request-item" key={request.id}>
                      <div className="privacy-request-item-top">
                        <div>
                          <span className="privacy-request-reference">{request.requestReference}</span>
                          <h3>{request.subject}</h3>
                        </div>
                        <span className={"privacy-status-pill privacy-status-" + request.status}>{privacyRequestStatusLabel(request.status as PrivacyRequestStatus)}</span>
                      </div>
                      <div className="privacy-request-meta">
                        <span>{PRIVACY_REQUEST_TYPES.find((item) => item.value === request.requestType)?.label || request.requestType}</span>
                        <span>Submitted {displayDateTime(request.createdAt)}</span>
                      </div>
                      {request.events?.length > 0 && <div className="privacy-timeline">
                        {request.events.slice(0, 4).map((event) => (
                          <div className="privacy-timeline-event" key={event.id}>
                            <i />
                            <div><span>{displayDateTime(event.createdAt)}</span><p>{event.message}</p></div>
                          </div>
                        ))}
                      </div>}
                      {request.status === "submitted" && <button type="button" className="privacy-text-action" onClick={() => void cancelOwnRequest(request.id, request.requestReference)} disabled={cancelRequest.isPending}>
                        Cancel before review
                      </button>}
                    </article>
                  ))}
                </div>
              )}
          </section>
        </main>

        <aside className="privacy-side-column" aria-label="Privacy tools">
          <section className="privacy-side-card privacy-commitment-card">
            <span className="privacy-side-icon"><ShieldCheck size={20} /></span>
            <span className="eyebrow">OUR APPROACH</span>
            <h2>Information handled with purpose.</h2>
            <p>The published notice explains the categories of information that may be used, the service purposes involved, retention considerations and circumstances where disclosure may be appropriate.</p>
            <div className="privacy-principle-row"><CheckCircle2 size={15} /><span>Purpose-aware handling</span></div>
            <div className="privacy-principle-row"><CheckCircle2 size={15} /><span>Restricted access and accountability</span></div>
            <div className="privacy-principle-row"><CheckCircle2 size={15} /><span>Documented request outcomes</span></div>
          </section>

          <section className="privacy-side-card privacy-request-actions">
            <span className="eyebrow">PRIVACY ACTIONS</span>
            <h2>What would you like us to review?</h2>
            {PRIVACY_REQUEST_TYPES.slice(0, 4).map((item) => (
              <button type="button" className="privacy-action-row" key={item.value} onClick={() => openRequestForm(item.value)}>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                <ArrowRight size={15} />
              </button>
            ))}
          </section>

          <section className="privacy-side-card privacy-history-card">
            <div className="privacy-side-card-heading">
              <span className="privacy-side-icon"><History size={18} /></span>
              <div><span className="eyebrow">TRANSPARENCY</span><h2>Notice history</h2></div>
            </div>
            {history.isLoading ? <p className="privacy-muted-copy">Loading published versions…</p> :
              history.isError ? <p className="privacy-muted-copy">Notice history is temporarily unavailable.</p> :
              (history.data || []).length === 0 ? <p className="privacy-muted-copy">No previous published versions are available.</p> :
              <div className="privacy-version-list">
                {(history.data || []).map((item) => (
                  <button type="button" className={"privacy-version-row " + (viewedPolicy?.id === item.id ? "is-selected" : "")} key={item.id} onClick={() => setSelectedVersionId(item.id === currentPolicy?.id ? null : item.id)}>
                    <span className="privacy-version-file"><FileText size={16} /></span>
                    <span><strong>Version {item.versionLabel}</strong><small>Published {displayDate(item.publishedAt)}</small></span>
                    {item.id === currentPolicy?.id ? <span className="privacy-current-tag">Current</span> : <ArrowRight size={14} />}
                  </button>
                ))}
              </div>}
          </section>
        </aside>
      </div>

      <div className="privacy-request-form-anchor" ref={formRef}>
        {formOpen && <section className="privacy-request-form-card" aria-labelledby="privacy-request-form-heading">
          <div className="privacy-section-heading">
            <div>
              <span className="eyebrow">SECURE REQUEST WORKFLOW</span>
              <h2 id="privacy-request-form-heading">Submit a privacy request</h2>
              <p>Requests are routed to an authorized reviewer. Submission does not automatically delete, change or disclose records.</p>
            </div>
            <button type="button" className="privacy-icon-button" aria-label="Close request form" onClick={() => setFormOpen(false)}><XCircle size={18} /></button>
          </div>
          <form className="privacy-request-form" onSubmit={submitRequest}>
            <label>
              Request category
              <select value={requestType} onChange={(event) => setRequestType(event.target.value as PrivacyRequestType)} disabled={createRequest.isPending}>
                {PRIVACY_REQUEST_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
              <small>{PRIVACY_REQUEST_TYPES.find((item) => item.value === requestType)?.description}</small>
            </label>
            <label>
              Subject
              <input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={5} maxLength={180} required placeholder="Describe what you need reviewed" disabled={createRequest.isPending} />
            </label>
            <label>
              Additional context <span className="privacy-optional-label">Optional</span>
              <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={3000} rows={4} placeholder="Share only the details needed to understand your request." disabled={createRequest.isPending} />
            </label>
            <div className="privacy-form-safety-note"><LockKeyhole size={15} /><span>Do not enter passwords, authentication codes, full identity-document numbers or unnecessary sensitive financial details.</span></div>
            {requestError && <div className="privacy-inline-notice is-error" role="alert"><XCircle size={15} />{requestError}</div>}
            <div className="privacy-form-actions">
              <button type="button" className="privacy-secondary-button" onClick={() => setFormOpen(false)} disabled={createRequest.isPending}>Cancel</button>
              <button type="submit" className="privacy-primary-button" disabled={createRequest.isPending}>{createRequest.isPending ? "Submitting…" : "Submit request"} <ArrowRight size={15} /></button>
            </div>
          </form>
        </section>}
      </div>

      <div className="privacy-footer-note"><LockKeyhole size={14} /><span>Privacy requests are reviewed through authenticated, role-restricted workflows. Applicable rights and retention requirements may vary by jurisdiction and record type.</span></div>
    </div>
  );
}

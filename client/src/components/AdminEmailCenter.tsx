import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function AdminEmailCenter() {
  const customers = trpc.adminOperations.customers.useQuery(undefined, { refetchInterval: 15000 });
  const status = trpc.adminOperations.emailStatus.useQuery(undefined, { refetchInterval: 15000 });
  const [userId, setUserId] = useState<number | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const send = trpc.adminOperations.sendCustomerEmail.useMutation({ onSuccess: () => { setMessage("Message queued. It will send only after SMTP is configured and the customer inbox is verified."); setSubject(""); setBody(""); }, onError: e => setMessage(e.message) });
  const test = trpc.adminOperations.sendTestEmail.useMutation({ onSuccess: () => setMessage("Test message queued for delivery. Check the recipient inbox after SMTP processes the outbox."), onError: e => setMessage(e.message) });
  const selected = (customers.data || []).find((c: any) => c.id === userId);
  return <div className="portal-page">
    <div className="portal-page-top"><div><div className="eyebrow">Outbound communication</div><h1>Email center</h1><p>One-to-one messages only. Bulk sending is not enabled.</p></div></div>
    <div className="settings-card"><div className="customer-panel-head"><div><div className="eyebrow">Transport status</div><h2>{status.data?.smtpConfigured ? "SMTP configured" : "SMTP not configured"}</h2></div><span className={status.data?.smtpConfigured ? "admin-live-chip" : "status-pill warning"}>{status.data?.smtpConfigured ? "Ready" : "Disabled"}</span></div>
      <p className="settings-copy">SMTP credentials are server-only environment secrets; they are never stored in admin settings or returned to the browser. No email is sent while the transport is disabled.</p>
      <p className="settings-copy">Daily digest: {status.data?.dailyDigestSchedule ? `${status.data.dailyDigestSchedule.time} · ${status.data.dailyDigestSchedule.timezone}` : "not configured (set EMAIL_DAILY_DIGEST_TIME and EMAIL_DAILY_DIGEST_TIMEZONE on the host)"}.</p>
      <button type="button" className="secondary-button" onClick={() => test.mutate({})} disabled={test.isPending || !status.data?.smtpConfigured}>{test.isPending ? "Queuing…" : "Send test to admin inbox"}</button>
    </div>
    <div className="settings-card"><div className="eyebrow">Customer message</div><h2>Send one email to one customer</h2>
      <label>Customer<select value={userId} onChange={e => setUserId(e.target.value ? Number(e.target.value) : "")}><option value="">Choose customer</option>{(customers.data || []).map((customer: any) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.email} {customer.emailVerified ? "(verified)" : "(unverified)"}</option>)}</select></label>
      {selected && <p className="settings-copy">Inbox: {selected.emailVerified ? "verified" : "not verified"}. Direct mail is blocked until the customer verifies the inbox.</p>}
      <label>Subject<input maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} /></label>
      <label>Message<textarea rows={7} maxLength={8000} value={body} onChange={e => setBody(e.target.value)} /></label>
      <button className="primary-button" disabled={!selected?.emailVerified || !subject.trim() || !body.trim() || send.isPending} onClick={() => selected && send.mutate({ userId: selected.id, subject, body })}>{send.isPending ? "Queuing…" : "Queue email"}</button>
      {selected?.emailVerified && <button type="button" className="secondary-button" disabled={!status.data?.smtpConfigured || test.isPending} onClick={() => test.mutate({ userId: selected.id })}>Send test to selected customer</button>}
    </div>
    {message && <div role="status" className="test-notice">{message}</div>}
  </div>;
}

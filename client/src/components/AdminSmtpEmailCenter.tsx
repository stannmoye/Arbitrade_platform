import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Cloud, Mail, Paperclip, Send, Server, ShieldCheck, TestTube2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type EmailProvider = "local" | "local-smtp" | "sendgrid" | "aws-ses" | "other";

const providerOptions: Array<{ value: EmailProvider; label: string; description: string }> = [
  { value: "local", label: "Local server mail", description: "Use the server's local sendmail service. No SMTP credentials." },
  { value: "local-smtp", label: "Local SMTP relay", description: "Use an SMTP service on this host or private network, commonly port 25." },
  { value: "sendgrid", label: "SendGrid", description: "Use Twilio SendGrid's SMTP relay with an API key." },
  { value: "aws-ses", label: "Amazon SES", description: "Use Amazon SES SMTP credentials for the selected AWS region." },
  { value: "other", label: "Other SMTP provider", description: "Configure any standards-compliant SMTP host." },
];

const awsRegions = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "af-south-1", "ap-south-1", "ap-south-2", "ap-southeast-1",
  "ap-southeast-2", "ap-northeast-1", "ca-central-1",
  "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3",
  "eu-north-1", "me-south-1", "sa-east-1",
];

export function AdminSmtpEmailCenter() {
  const config = trpc.adminOperations.emailAdminConfig.useQuery();
  const recipients = trpc.adminOperations.emailRecipients.useQuery();
  const save = trpc.adminOperations.saveEmailConfig.useMutation({ onSuccess: () => config.refetch() });
  const test = trpc.adminOperations.testEmail.useMutation();
  const send = trpc.adminOperations.composeEmail.useMutation();
  const reports = trpc.adminOperations.runDailyReports.useMutation();
  const editor = useRef<HTMLDivElement>(null);

  const [provider, setProvider] = useState<EmailProvider>("local");
  const [mode, setMode] = useState<"external" | "direct">("direct");
  const [authType, setAuthType] = useState<"login" | "plain" | "none">("login");
  const [region, setRegion] = useState("us-east-1");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(25);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [fromName, setFromName] = useState("Arbitrade");
  const [fromAddress, setFromAddress] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [hour, setHour] = useState(23);
  const [minute, setMinute] = useState(59);
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [files, setFiles] = useState<{ filename: string; content: string; contentType?: string }[]>([]);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    const email: any = config.data?.email;
    const saved: any = email?.smtp;
    if (!saved) return;
    const nextProvider: EmailProvider = saved.provider || (saved.mode === "direct" ? "local" : "other");
    setProvider(nextProvider);
    setMode(saved.mode || (nextProvider === "local" ? "direct" : "external"));
    setAuthType(saved.authType || "login");
    setRegion(saved.region || "us-east-1");
    setHost(saved.host || "127.0.0.1");
    setPort(Number(saved.port || 25));
    setSecure(Boolean(saved.secure));
    setUser(saved.user || "");
    setFromName(saved.fromName || "Arbitrade");
    setFromAddress(saved.fromAddress || "");
    setReplyTo(saved.replyTo || "");
    setHour(Number(email.dailyCloseHourUtc ?? 23));
    setMinute(Number(email.dailyCloseMinuteUtc ?? 59));
  }, [config.data]);

  const chooseProvider = (next: EmailProvider) => {
    setProvider(next);
    setPassword("");
    setClearPassword(true);
    setMessage("");
    if (next === "local") {
      setMode("direct"); setHost("127.0.0.1"); setPort(25); setSecure(false); setAuthType("none"); setUser("");
    } else if (next === "local-smtp") {
      setMode("external"); setHost("127.0.0.1"); setPort(25); setSecure(false); setAuthType("none"); setUser("");
    } else if (next === "sendgrid") {
      setMode("external"); setHost("smtp.sendgrid.net"); setPort(587); setSecure(false); setAuthType("login"); setUser("apikey");
    } else if (next === "aws-ses") {
      setMode("external"); setHost(`email-smtp.${region}.amazonaws.com`); setPort(587); setSecure(false); setAuthType("login"); setUser("");
    } else {
      setMode("external"); setHost(""); setPort(587); setSecure(false); setAuthType("login"); setUser("");
    }
  };

  const chooseRegion = (next: string) => {
    setRegion(next);
    if (provider === "aws-ses") setHost(`email-smtp.${next}.amazonaws.com`);
  };

  const saveConfig = async () => {
    setMessage("");
    if (!fromAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) {
      setMessageKind("error"); setMessage("Enter a valid sender email address before saving."); return;
    }
    if (mode === "external" && !host.trim()) {
      setMessageKind("error"); setMessage("Enter the SMTP hostname."); return;
    }
    if (["sendgrid", "aws-ses"].includes(provider) && (!user.trim() || !(password || (!clearPassword && config.data?.email?.smtp?.hasPassword)))) {
      setMessageKind("error"); setMessage(provider === "sendgrid" ? "Enter your SendGrid API key in the password field." : "Enter the SMTP username and SMTP password generated by Amazon SES."); return;
    }
    try {
      await save.mutateAsync({ provider, region, clearPassword, mode, authType, host, port, secure, user, password: password || undefined, fromName, fromAddress, replyTo, dailyCloseHourUtc: hour, dailyCloseMinuteUtc: minute });
      setPassword("");
      setClearPassword(false);
      setMessageKind("success");
      setMessage("Email transport saved securely. The same server-side configuration is used by supported transactional and administrative email flows.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Could not save email configuration.");
    }
  };

  const sendTest = async () => {
    setMessage("");
    if (!fromAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) {
      setMessageKind("error"); setMessage("Enter a valid destination address for the test."); return;
    }
    try {
      await test.mutateAsync({ to: fromAddress });
      setMessageKind("success");
      setMessage("Test message accepted by the configured mail transport. Check the inbox and spam folder to confirm delivery.");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Email test failed. Check the provider settings and server logs.");
    }
  };

  const encode = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const added: { filename: string; content: string; contentType?: string }[] = [];
    for (const file of Array.from(list).slice(0, 10)) {
      if (file.size > 25_000_000) continue;
      added.push({ filename: file.name, content: await encode(file), contentType: file.type || "application/octet-stream" });
    }
    setFiles(current => [...current, ...added].slice(0, 10));
  };

  const compose = async () => {
    const html = editor.current?.innerHTML || "";
    if (!selected.length || !subject.trim() || !html.trim()) {
      setMessageKind("error"); setMessage("Choose recipients, a subject, and message content."); return;
    }
    try {
      await send.mutateAsync({ recipients: selected, subject, htmlBody: html, attachments: files });
      setMessageKind("success"); setMessage("Message sent to the selected recipients.");
      setSubject(""); setFiles([]); if (editor.current) editor.current.innerHTML = "";
    } catch (error) {
      setMessageKind("error"); setMessage(error instanceof Error ? error.message : "Message delivery failed.");
    }
  };

  const savedConfig = config.data?.email?.smtp;
  const ready = Boolean(config.data?.email?.smtpReady);
  const selectedProvider = providerOptions.find(item => item.value === provider) || providerOptions[0];

  return <div className="portal-page settings-page arb-page">
    <div className="portal-page-top">
      <div><div className="eyebrow">Communications control plane</div><h1>Email &amp; SMTP Settings</h1><p>Configure one server-side mail transport for account verification, password recovery, transactional notices, reports and administrator communications. Email setup is optional during installation.</p></div>
      <span className={ready ? "admin-live-chip" : "status-pill warning"}>{ready ? <><span className="pulse" /> Mail transport ready</> : "Email not configured"}</span>
    </div>

    <div className="email-admin-grid">
      <section className="settings-card">
        <div className="settings-card-icon"><Server size={18} /></div>
        <div className="eyebrow">Delivery provider</div>
        <h2>Choose how Arbitrade sends email</h2>
        <p className="settings-copy">Select a provider to apply safe defaults, then enter the credentials issued by that provider. Credentials are encrypted before being saved and are never returned to the browser.</p>
        <label>Mail provider
          <select value={provider} onChange={event => chooseProvider(event.target.value as EmailProvider)}>
            {providerOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="settings-copy"><strong>{selectedProvider.label}:</strong> {selectedProvider.description}</div>

        {provider === "aws-ses" && <label>AWS SES region
          <select value={region} onChange={event => chooseRegion(event.target.value)}>
            {awsRegions.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>}

        {mode === "external" && <div className="form-two">
          <label>SMTP host<input value={host} onChange={event => setHost(event.target.value)} placeholder="smtp.example.com" autoComplete="off" /></label>
          <label>Port<input type="number" min="1" max="65535" value={port} onChange={event => setPort(Number(event.target.value))} /></label>
          <label>SMTP username<input value={user} onChange={event => setUser(event.target.value)} placeholder={provider === "sendgrid" ? "apikey" : "SMTP username"} autoComplete="username" readOnly={provider === "sendgrid"} /></label>
          <label>{provider === "sendgrid" ? "SendGrid API key" : "SMTP password"}<input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder={savedConfig?.hasPassword ? "Saved securely — leave blank to keep" : "Enter provider-issued secret"} autoComplete="new-password" /></label>
          <label>Authentication<select value={authType} disabled={provider === "sendgrid"} onChange={event => setAuthType(event.target.value as "login" | "plain" | "none")}><option value="login">LOGIN</option><option value="plain">PLAIN</option><option value="none">No authentication</option></select></label>
          <label className="admin-toggle-row"><span>Use implicit TLS (usually port 465)</span><input type="checkbox" checked={secure} onChange={event => setSecure(event.target.checked)} /></label>
        </div>}

        {provider === "aws-ses" && <p className="settings-copy"><AlertTriangle size={14} /> Use Amazon SES SMTP credentials, not your normal AWS console password or access key. The sender domain/address must be verified in SES, and sandbox accounts can only send to verified recipients.</p>}
        {provider === "sendgrid" && <p className="settings-copy"><AlertTriangle size={14} /> SendGrid SMTP uses the literal username <code>apikey</code> and your generated API key as the password. Verify the sender identity in SendGrid first.</p>}
        {provider === "local" && <p className="settings-copy">The host must have an executable local sendmail-compatible service. If your hosting provider only exposes SMTP, choose Local SMTP Relay instead.</p>}

        <div className="form-two">
          <label>From name<input value={fromName} onChange={event => setFromName(event.target.value)} maxLength={120} placeholder="Arbitrade" /></label>
          <label>From email address<input type="email" value={fromAddress} onChange={event => setFromAddress(event.target.value)} placeholder="no-reply@your-domain.com" autoComplete="email" /></label>
          <label>Reply-to address (optional)<input type="email" value={replyTo} onChange={event => setReplyTo(event.target.value)} placeholder="support@your-domain.com" /></label>
          <label>Daily trading close (UTC)<div className="form-two"><input aria-label="Hour" type="number" min="0" max="23" value={hour} onChange={event => setHour(Number(event.target.value))} /><input aria-label="Minute" type="number" min="0" max="59" value={minute} onChange={event => setMinute(Number(event.target.value))} /></div></label>
        </div>

        <div className="settings-actions">
          <button className="primary-button" onClick={saveConfig} disabled={save.isPending}><Check size={14} />{save.isPending ? "Saving…" : "Save email settings"}</button>
          <button className="secondary-button" onClick={sendTest} disabled={test.isPending || !ready}><TestTube2 size={14} />{test.isPending ? "Sending test…" : "Send test email"}</button>
        </div>
        {message && <div className="test-notice" role="status">{messageKind === "success" ? <CheckCircle2 size={15} /> : messageKind === "error" ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}{message}</div>}
        <div className="settings-copy"><ShieldCheck size={14} /> Status: {ready ? "configured and ready" : "not ready"}{savedConfig?.hasPassword ? " · provider secret saved" : " · no provider secret saved"}. Secrets are never displayed after saving.</div>
      </section>

      <section className="settings-card">
        <div className="settings-card-icon"><Cloud size={18} /></div>
        <div className="eyebrow">Recipient intelligence</div><h2>Manual email composer</h2>
        <p className="settings-copy">Messages use the same saved transport as supported system emails. Confirm recipients and content before sending.</p>
        <div className="recipient-picker">{(recipients.data || []).map((recipient: any) => <label key={recipient.email}><input type="checkbox" checked={selected.includes(recipient.email)} onChange={event => setSelected(current => event.target.checked ? [...current, recipient.email] : current.filter(item => item !== recipient.email))} /><span><strong>{recipient.name || recipient.email}</strong><small>{recipient.email}</small></span></label>)}</div>
        <label>Subject<input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Account update" maxLength={200} /></label>
        <div className="rich-toolbar"><button type="button" onClick={() => document.execCommand("bold")}><b>B</b></button><button type="button" onClick={() => document.execCommand("italic")}><i>I</i></button><button type="button" onClick={() => document.execCommand("insertUnorderedList")}>• List</button><button type="button" onClick={() => { const url = window.prompt("Link URL"); if (url && /^https?:\/\//i.test(url)) document.execCommand("createLink", false, url); }}>Link</button></div>
        <div ref={editor} className="rich-editor" contentEditable suppressContentEditableWarning data-placeholder="Compose an email to selected recipients…" />
        <label className="attachment-dropzone"><Paperclip size={15} /> Add attachments<input type="file" multiple hidden onChange={event => addFiles(event.target.files)} /></label>
        {files.map((file, index) => <div className="attachment-chip" key={`${file.filename}-${index}`}>{file.filename}<button type="button" onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}
        <button className="primary-button wide" onClick={compose} disabled={send.isPending || !ready}><Send size={14} />{send.isPending ? "Sending…" : "Send email"}</button>
        <button className="secondary-button wide" onClick={() => reports.mutate({ force: true })} disabled={reports.isPending}>{reports.isPending ? "Running reports…" : "Run daily reports now"}</button>
      </section>
    </div>
  </div>;
}

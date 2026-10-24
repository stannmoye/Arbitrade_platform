import { useEffect, useState } from "react";
import { AlertCircle, Check, ExternalLink, MessageCircle, RefreshCw, Save, ShieldCheck, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  COMMUNICATION_TEMPLATE_DEFINITIONS,
  DEFAULT_COMMUNICATION_SETTINGS,
  isValidWhatsAppNumber,
  renderMessageTemplate,
  validateCommunicationSettings,
  type CommunicationSettings,
  type CommunicationTemplateKey,
} from "@shared/communication";

const PREVIEW_VALUES = {
  customerName: "Alex Morgan",
  customerEmail: "alex@example.com",
  platformName: "Arbitrade",
  date: "24 Oct 2026",
  reference: "ACT-123456",
};

export function AdminCommunicationSettings() {
  const settingsQuery = trpc.adminOperations.communicationSettings.useQuery(undefined, {
    retry: 2,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  const save = trpc.adminOperations.updateCommunicationSettings.useMutation({
    onSuccess: (savedSettings) => {
      setDraft(savedSettings);
      setDirty(false);
      setStatus("Communication settings saved. The customer contact options now use this configuration.");
      setStatusIsError(false);
    },
    onError: (error) => {
      setStatus(error.message || "Communication settings could not be saved.");
      setStatusIsError(true);
    },
  });
  const [draft, setDraft] = useState<CommunicationSettings>(DEFAULT_COMMUNICATION_SETTINGS);
  const [selectedTemplate, setSelectedTemplate] = useState<CommunicationTemplateKey>("generalSupport");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !dirty) setDraft(settingsQuery.data);
  }, [settingsQuery.data, dirty]);

  const patchDraft = (update: (current: CommunicationSettings) => CommunicationSettings) => {
    setDraft(current => update(current));
    setDirty(true);
    setStatus("");
    setStatusIsError(false);
  };
  const patchTemplate = (key: CommunicationTemplateKey, update: Partial<CommunicationSettings["templates"][CommunicationTemplateKey]>) => {
    patchDraft(current => ({
      ...current,
      templates: {
        ...current.templates,
        [key]: { ...current.templates[key], ...update },
      },
    }));
  };

  const validationErrors = validateCommunicationSettings(draft);
  const selectedDefinition = COMMUNICATION_TEMPLATE_DEFINITIONS.find(item => item.key === selectedTemplate) || COMMUNICATION_TEMPLATE_DEFINITIONS[0];
  const selectedMessage = draft.templates[selectedTemplate];
  const previewMessage = renderMessageTemplate(selectedMessage.body, PREVIEW_VALUES);
  const phoneIsValid = isValidWhatsAppNumber(draft.whatsapp.phoneNumber);
  const canSave = Boolean(settingsQuery.data) && !settingsQuery.isFetching && !save.isPending && validationErrors.length === 0;

  return (
    <div className="arb-page portal-page communication-settings-page">
      <div className="portal-page-top">
        <div>
          <div className="eyebrow">Communication & integration control</div>
          <h1>Message templates & WhatsApp</h1>
          <p>Manage the support contact number, customer message copy, and planned wallet-provider details without editing application code.</p>
        </div>
        <span className="admin-live-chip"><span className="pulse" /> Administrator controlled</span>
      </div>

      {settingsQuery.isLoading && <div className="test-notice" role="status"><RefreshCw size={15} /> Loading saved communication settings…</div>}
      {settingsQuery.isError && !settingsQuery.data && (
        <div className="communication-alert" role="alert">
          <AlertCircle size={17} />
          <div><strong>Saved settings could not be loaded.</strong><span>Your edits are not discarded, but saving remains disabled until the current settings load.</span></div>
          <button type="button" className="secondary-button" onClick={() => void settingsQuery.refetch()} disabled={settingsQuery.isFetching}><RefreshCw size={14} /> Retry</button>
        </div>
      )}
      {status && <div className={statusIsError ? "communication-alert" : "test-notice"} role={statusIsError ? "alert" : "status"}>{statusIsError ? <AlertCircle size={15} /> : <Check size={15} />}{status}</div>}

      <section className="settings-card communication-config-card" aria-labelledby="communication-whatsapp-heading">
        <div className="communication-card-heading">
          <span className="communication-card-icon"><MessageCircle size={19} /></span>
          <div><div className="eyebrow">Customer contact channel</div><h2 id="communication-whatsapp-heading">WhatsApp contact</h2><p>Customers can start a WhatsApp conversation from Support Centre. The link opens a pre-filled draft; it never sends a message automatically.</p></div>
          <span className={"communication-state-pill " + (draft.whatsapp.enabled && phoneIsValid ? "ready" : "inactive")}>{draft.whatsapp.enabled && phoneIsValid ? "Contact enabled" : "Not available to customers"}</span>
        </div>
        <div className="communication-form-grid">
          <label className="communication-field">Support display name
            <input value={draft.whatsapp.displayName} maxLength={120} onChange={event => patchDraft(current => ({ ...current, whatsapp: { ...current.whatsapp, displayName: event.target.value } }))} placeholder="Arbitrade Support" />
            <small>Displayed beside the customer contact action.</small>
          </label>
          <label className="communication-field">International WhatsApp number
            <input type="tel" value={draft.whatsapp.phoneNumber} maxLength={24} onChange={event => patchDraft(current => ({ ...current, whatsapp: { ...current.whatsapp, phoneNumber: event.target.value } }))} aria-invalid={draft.whatsapp.enabled && !phoneIsValid} placeholder="+2348012345678" autoComplete="off" />
            <small>Include the country calling code. Spaces, brackets and hyphens are accepted.</small>
            {draft.whatsapp.enabled && !phoneIsValid && <span className="communication-field-error">Enter a valid international number before enabling this contact.</span>}
          </label>
        </div>
        <label className="communication-enable-row">
          <input type="checkbox" checked={draft.whatsapp.enabled} onChange={event => patchDraft(current => ({ ...current, whatsapp: { ...current.whatsapp, enabled: event.target.checked } }))} />
          <span><strong>Show WhatsApp contact to authenticated customers</strong><small>Turning this on requires a valid number. Turning it off removes the link from Support Centre without deleting your saved templates.</small></span>
        </label>
        <div className="communication-inline-note"><ShieldCheck size={15} /><span>This is a customer-initiated WhatsApp link, not an automated WhatsApp Business API connection. Provider delivery remains separate.</span></div>
      </section>

      <section className="settings-card communication-config-card" aria-labelledby="communication-template-heading">
        <div className="communication-card-heading">
          <span className="communication-card-icon"><MessageCircle size={19} /></span>
          <div><div className="eyebrow">Reusable message copy</div><h2 id="communication-template-heading">Customer message templates</h2><p>Customize the message title and text shown for each support topic. Enabled templates appear in the customer WhatsApp message selector.</p></div>
        </div>
        <div className="communication-template-layout">
          <nav className="communication-template-nav" aria-label="Message templates">
            {COMMUNICATION_TEMPLATE_DEFINITIONS.map(definition => (
              <button
                key={definition.key}
                type="button"
                className={selectedTemplate === definition.key ? "active" : ""}
                aria-current={selectedTemplate === definition.key ? "true" : undefined}
                onClick={() => setSelectedTemplate(definition.key)}
              >
                <span><strong>{definition.label}</strong><small>{definition.description}</small></span>
                <em className={draft.templates[definition.key].enabled ? "enabled" : ""}>{draft.templates[definition.key].enabled ? "Enabled" : "Hidden"}</em>
              </button>
            ))}
          </nav>
          <div className="communication-template-editor">
            <div className="communication-template-editor-head"><div><span className="eyebrow">Template editor</span><h3>{selectedDefinition.label}</h3></div><label className="communication-template-toggle"><input type="checkbox" checked={selectedMessage.enabled} onChange={event => patchTemplate(selectedTemplate, { enabled: event.target.checked })} /> Available to customers</label></div>
            <label className="communication-field">Message title
              <input value={selectedMessage.title} maxLength={120} onChange={event => patchTemplate(selectedTemplate, { title: event.target.value })} />
            </label>
            <label className="communication-field">Message body
              <textarea value={selectedMessage.body} rows={8} maxLength={3000} onChange={event => patchTemplate(selectedTemplate, { body: event.target.value })} spellCheck={true} />
              <small>{selectedMessage.body.length.toLocaleString()} / 3,000 characters. Keep messages helpful and never ask for passwords, one-time codes, recovery phrases or private keys.</small>
            </label>
            <div className="communication-placeholder-list"><strong>Supported placeholders</strong><span>{"{{customerName}}"}</span><span>{"{{customerEmail}}"}</span><span>{"{{platformName}}"}</span><span>{"{{date}}"}</span><span>{"{{reference}}"}</span></div>
            <div className="communication-preview" aria-live="polite">
              <div className="communication-preview-heading"><span>Live preview</span><span>Sample customer data · not sent</span></div>
              <strong>{selectedMessage.title || "Untitled message"}</strong>
              <p>{previewMessage || "Enter a message body to preview its text."}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-card communication-config-card" aria-labelledby="communication-wallet-provider-heading">
        <div className="communication-card-heading">
          <span className="communication-card-icon"><WalletCards size={19} /></span>
          <div><div className="eyebrow">Future integration readiness</div><h2 id="communication-wallet-provider-heading">Wallet provider details</h2><p>Record the provider the team intends to evaluate so its integration details are available to administrators later.</p></div>
          <span className="communication-state-pill inactive">Not connected</span>
        </div>
        <div className="communication-inline-note"><ShieldCheck size={15} /><span>Provider execution is not implemented or enabled by this form. No API keys or account passwords are accepted here. A real adapter, private server-side credentials, sandbox verification and explicit approval are still required.</span></div>
        <div className="communication-form-grid">
          <label className="communication-field">Planned provider name
            <input value={draft.walletProvider.providerName} maxLength={120} onChange={event => patchDraft(current => ({ ...current, walletProvider: { ...current.walletProvider, providerName: event.target.value } }))} placeholder="Provider to evaluate later" />
          </label>
          <label className="communication-field">Internal account / connection label
            <input value={draft.walletProvider.accountLabel} maxLength={160} onChange={event => patchDraft(current => ({ ...current, walletProvider: { ...current.walletProvider, accountLabel: event.target.value } }))} placeholder="For example, primary wallet provider" />
          </label>
          <label className="communication-field communication-field-wide">Official provider documentation URL <span className="communication-optional">Optional</span>
            <input type="url" value={draft.walletProvider.documentationUrl} maxLength={500} onChange={event => patchDraft(current => ({ ...current, walletProvider: { ...current.walletProvider, documentationUrl: event.target.value } }))} placeholder="https://provider.example/docs" autoComplete="off" />
            <small>HTTPS only. This records a documentation reference; it does not establish a live connection.</small>
            {draft.walletProvider.documentationUrl && !/^https:\/\//i.test(draft.walletProvider.documentationUrl.trim()) && <span className="communication-field-error">Use a secure HTTPS URL.</span>}
          </label>
          {draft.walletProvider.documentationUrl && /^https:\/\//i.test(draft.walletProvider.documentationUrl.trim()) && (
            <a className="communication-doc-link" href={draft.walletProvider.documentationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Review provider documentation</a>
          )}
        </div>
      </section>

      {validationErrors.length > 0 && <div className="communication-validation-summary" role="alert"><strong>Resolve these settings before saving.</strong>{validationErrors.map(error => <span key={error}>{error}</span>)}</div>}
      <div className="communication-save-bar">
        <div><ShieldCheck size={16} /><span>Saved values are stored in the existing settings registry with the administrator ID. Provider secrets are never stored here.</span></div>
        <button type="button" className="primary-button" onClick={() => save.mutate(draft)} disabled={!canSave}>
          <Save size={15} /> {save.isPending ? "Saving settings…" : "Save communication settings"} 
        </button>
      </div>
    </div>
  );
}

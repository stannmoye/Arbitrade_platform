import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function CustomerAuthenticatorSettings({ push }: { push?: (message: string) => void }) {
  const status = trpc.customer.authenticatorStatus.useQuery(undefined, { refetchInterval: 30_000 });
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mode, setMode] = useState<"enroll" | "replace">("enroll");
  const [replacementRequested, setReplacementRequested] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [generateCodesRequested, setGenerateCodesRequested] = useState(false);
  const [message, setMessage] = useState("");

  const start = trpc.customer.startAuthenticatorEnrollment.useMutation({
    onSuccess: (result) => {
      setMode("enroll");
      setSecret(result.secret);
      setUri(result.provisioningUri);
      setCode("");
      setMessage("Add this account to your authenticator app, then enter its current six-digit code to confirm setup.");
    },
    onError: (error) => setMessage(error.message),
  });
  const confirm = trpc.customer.confirmAuthenticatorEnrollment.useMutation({
    onSuccess: async (result) => {
      setSecret("");
      setUri("");
      setCode("");
      setMode("enroll");
      setRecoveryCodes(result.recoveryCodes || []);
      setMessage("Authenticator enabled. Save the one-time recovery codes shown below; they will not be shown again.");
      await status.refetch();
      push?.("Authenticator app enabled");
    },
    onError: (error) => setMessage(error.message),
  });
  const startReplacement = trpc.customer.startAuthenticatorReplacement.useMutation({
    onSuccess: (result) => {
      setMode("replace");
      setSecret(result.secret);
      setUri(result.provisioningUri);
      setCode("");
      setCurrentCode("");
      setReplacementRequested(false);
      setMessage("The existing authenticator remains active until you confirm the replacement. Setup expires in ten minutes.");
    },
    onError: (error) => setMessage(error.message),
  });
  const confirmReplacement = trpc.customer.confirmAuthenticatorReplacement.useMutation({
    onSuccess: async () => {
      setSecret("");
      setUri("");
      setCode("");
      setCurrentCode("");
      setRecoveryCode("");
      setMode("enroll");
      setRecoveryRequested(false);
      setMessage("Authenticator replaced. The new authenticator is now required for protected payouts.");
      await status.refetch();
      push?.("Authenticator app replaced");
    },
    onError: (error) => setMessage(error.message),
  });
  const generateCodes = trpc.customer.generateAuthenticatorRecoveryCodes.useMutation({
    onSuccess: async (result) => {
      setRecoveryCodes(result.recoveryCodes);
      setCurrentCode("");
      setGenerateCodesRequested(false);
      setMessage("New recovery codes generated. Any previously issued recovery codes are now invalid.");
      await status.refetch();
    },
    onError: (error) => setMessage(error.message),
  });
  const startRecovery = trpc.customer.startAuthenticatorRecovery.useMutation({
    onSuccess: async (result) => {
      setMode("replace");
      setSecret(result.secret);
      setUri(result.provisioningUri);
      setCode("");
      setRecoveryCode("");
      setRecoveryRequested(false);
      setReplacementRequested(false);
      setMessage("Recovery code accepted and consumed. Confirm the new authenticator within ten minutes; the previous authenticator stays active until then.");
      await status.refetch();
    },
    onError: (error) => setMessage(error.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    if (mode === "replace") {
      if (!confirmReplacement.isPending) confirmReplacement.mutate({ code });
    } else if (!confirm.isPending) {
      confirm.mutate({ code });
    }
  };
  const submitReplacementStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(currentCode) || startReplacement.isPending) return;
    setMessage("");
    startReplacement.mutate({ currentCode });
  };
  const submitGenerateCodes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(currentCode) || generateCodes.isPending) return;
    setMessage("");
    generateCodes.mutate({ currentCode });
  };
  const submitRecoveryStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (startRecovery.isPending || recoveryCode.trim().length < 16) return;
    setMessage("");
    startRecovery.mutate({ recoveryCode: recoveryCode.trim() });
  };
  const clearSetup = () => {
    setSecret("");
    setUri("");
    setCode("");
    setCurrentCode("");
    setRecoveryCode("");
    setMode("enroll");
    setReplacementRequested(false);
    setRecoveryRequested(false);
    setGenerateCodesRequested(false);
    setMessage("Setup details cleared. Any unfinished setup expires in ten minutes; an enabled authenticator remains active.");
    void status.refetch();
  };
  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setMessage("Recovery codes copied. Store them privately and preferably offline.");
    } catch {
      setMessage("Clipboard access was unavailable. Copy the recovery codes manually and store them privately.");
    }
  };
  const confirmationPending = mode === "replace" ? confirmReplacement.isPending : confirm.isPending;

  return <div className="settings-card account-card">
    <div className="settings-card-icon"><KeyRound size={18}/></div>
    <h2>Authenticator app</h2>
    <p>Use an authenticator app to confirm sensitive payout requests. The secret is encrypted before it is stored.</p>
    {status.isLoading ? <p>Checking authenticator status…</p> : status.data?.enabled ? <>
      <p><ShieldCheck size={15} aria-hidden="true"/> Authenticator confirmed and enabled.</p>
      <p>{status.data.recoveryCodesRemaining ?? 0} one-time recovery codes remaining.</p>
      {status.data.replacementPending && <p>An unfinished replacement is pending. Your existing authenticator remains active until the new one is confirmed.</p>}
      {!secret && !replacementRequested && !recoveryRequested && !generateCodesRequested && <>
        <button className="secondary-button" type="button" disabled={status.isError} onClick={() => { setMessage(""); setReplacementRequested(true); }}>{status.data.replacementPending ? "Restart authenticator replacement" : "Replace authenticator"}</button>
        <button className="secondary-button" type="button" disabled={status.isError} onClick={() => { setMessage(""); setRecoveryCodes([]); setGenerateCodesRequested(true); }}>{(status.data.recoveryCodesRemaining ?? 0) > 0 ? "Regenerate backup codes" : "Generate backup codes"}</button>
        <button className="secondary-button" type="button" disabled={status.isError || (status.data.recoveryCodesRemaining ?? 0) === 0} onClick={() => { setMessage(""); setRecoveryCodes([]); setRecoveryRequested(true); }}>Lost your device? Use a recovery code</button>
      </>}
      {replacementRequested && !secret && <form onSubmit={submitReplacementStart}>
        <label htmlFor="authenticator-current-code">Current six-digit authenticator code</label>
        <input id="authenticator-current-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={currentCode} onChange={(event) => setCurrentCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required/>
        <button className="primary-button" type="submit" disabled={!/^\d{6}$/.test(currentCode) || startReplacement.isPending}>{startReplacement.isPending ? "Verifying current code…" : "Verify and prepare replacement"}</button>
        <button className="secondary-button" type="button" onClick={() => { setReplacementRequested(false); setCurrentCode(""); setMessage(""); }}>Cancel</button>
      </form>}
      {generateCodesRequested && !secret && <form onSubmit={submitGenerateCodes}>
        <label htmlFor="authenticator-generate-codes-code">Current six-digit authenticator code</label>
        <input id="authenticator-generate-codes-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={currentCode} onChange={(event) => setCurrentCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required/>
        <p>Generating a new set invalidates every previously issued recovery code.</p>
        <button className="primary-button" type="submit" disabled={!/^\d{6}$/.test(currentCode) || generateCodes.isPending}>{generateCodes.isPending ? "Generating…" : "Generate new recovery codes"}</button>
        <button className="secondary-button" type="button" onClick={() => { setGenerateCodesRequested(false); setCurrentCode(""); setMessage(""); }}>Cancel</button>
      </form>}
      {recoveryRequested && !secret && <form onSubmit={submitRecoveryStart}>
        <label htmlFor="authenticator-recovery-code">Unused recovery code</label>
        <input id="authenticator-recovery-code" autoComplete="off" maxLength={30} value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} required/>
        <p>Each recovery code can be used once. After verification, set up a new authenticator within ten minutes.</p>
        <button className="primary-button" type="submit" disabled={recoveryCode.trim().length < 16 || startRecovery.isPending}>{startRecovery.isPending ? "Verifying recovery code…" : "Verify recovery code"}</button>
        <button className="secondary-button" type="button" onClick={() => { setRecoveryRequested(false); setRecoveryCode(""); setMessage(""); }}>Cancel</button>
      </form>}
    </> : <>
      {!secret && <button className="secondary-button" type="button" disabled={start.isPending || status.isError} onClick={() => { setMessage(""); start.mutate(); }}>{start.isPending ? "Preparing setup…" : "Set up authenticator"}</button>}
    </>}
    {secret && <>
      {mode === "replace" && <p>The current authenticator remains active until this replacement is confirmed. If you cancel, it will continue to work.</p>}
      <p><strong>Setup key (shown only during this setup)</strong></p>
      <code className="authenticator-setup-key">{secret}</code>
      <p>Enter the key manually in your authenticator app, or use the provisioning URI if your app supports it. Setup expires in ten minutes.</p>
      <label htmlFor="authenticator-provisioning-uri">Provisioning URI</label>
      <textarea id="authenticator-provisioning-uri" rows={3} readOnly value={uri}/>
      <form onSubmit={submit}>
        <label htmlFor="authenticator-confirm-code">Six-digit code from the {mode === "replace" ? "new " : ""}authenticator</label>
        <input id="authenticator-confirm-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required/>
        <button className="primary-button" type="submit" disabled={!/^\d{6}$/.test(code) || confirmationPending}>{confirmationPending ? "Confirming…" : mode === "replace" ? "Confirm replacement" : "Confirm authenticator"}</button>
      </form>
      <button className="secondary-button" type="button" onClick={clearSetup}>Cancel setup</button>
    </>}
    {recoveryCodes.length > 0 && <section className="authenticator-recovery-codes" aria-labelledby="authenticator-recovery-codes-heading">
      <h3 id="authenticator-recovery-codes-heading">Save these recovery codes</h3>
      <p>Each code can be used once to replace a lost authenticator. These codes are shown only now; closing or refreshing this page will not reveal them again.</p>
      <div className="authenticator-recovery-codes-list">{recoveryCodes.map((item) => <code key={item}>{item}</code>)}</div>
      <button className="secondary-button" type="button" onClick={copyRecoveryCodes}>Copy recovery codes</button>
      <button className="secondary-button" type="button" onClick={() => setRecoveryCodes([])}>I've saved these codes</button>
    </section>}
    {message && <p className="payout-feedback" role="status">{message}</p>}
    {status.isError && <p role="alert">Authenticator status could not be verified. Refresh and try again.</p>}
  </div>;
}

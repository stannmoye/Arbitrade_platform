import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function CustomerAuthenticatorSettings({ push }: { push?: (message: string) => void }) {
  const status = trpc.customer.authenticatorStatus.useQuery(undefined, { refetchInterval: 30_000 });
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const start = trpc.customer.startAuthenticatorEnrollment.useMutation({
    onSuccess: (result) => {
      setSecret(result.secret);
      setUri(result.provisioningUri);
      setCode("");
      setMessage("Add this account to your authenticator app, then enter the current six-digit code to confirm setup.");
    },
    onError: (error) => setMessage(error.message),
  });
  const confirm = trpc.customer.confirmAuthenticatorEnrollment.useMutation({
    onSuccess: async () => {
      setSecret("");
      setUri("");
      setCode("");
      setMessage("Authenticator enabled. Payout requests will require a fresh code.");
      await status.refetch();
      push?.("Authenticator app enabled");
    },
    onError: (error) => setMessage(error.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || confirm.isPending) return;
    confirm.mutate({ code });
  };
  return <div className="settings-card account-card">
    <div className="settings-card-icon"><KeyRound size={18}/></div>
    <h2>Authenticator app</h2>
    <p>Use an authenticator app to confirm sensitive payout requests. The secret is encrypted before it is stored.</p>
    {status.isLoading ? <p>Checking authenticator status…</p> : status.data?.enabled ? <p><ShieldCheck size={15} aria-hidden="true"/> Authenticator confirmed and enabled.</p> : <>
      {!secret && <button className="secondary-button" type="button" disabled={start.isPending || status.isError} onClick={() => { setMessage(""); start.mutate(); }}>{start.isPending ? "Preparing setup…" : "Set up authenticator"}</button>}
      {secret && <>
        <p><strong>Setup key (shown only during this setup)</strong></p>
        <code className="authenticator-setup-key">{secret}</code>
        <p>Enter the key manually in your authenticator app, or use the provisioning URI if your app supports it. Setup expires in ten minutes.</p>
        <label htmlFor="authenticator-provisioning-uri">Provisioning URI</label>
        <textarea id="authenticator-provisioning-uri" rows={3} readOnly value={uri}/>
        <form onSubmit={submit}>
          <label htmlFor="authenticator-confirm-code">Six-digit authenticator code</label>
          <input id="authenticator-confirm-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required/>
          <button className="primary-button" type="submit" disabled={!/^\d{6}$/.test(code) || confirm.isPending}>{confirm.isPending ? "Confirming…" : "Confirm authenticator"}</button>
        </form>
        <button className="secondary-button" type="button" onClick={() => { setSecret(""); setUri(""); setCode(""); setMessage(""); }}>Cancel setup</button>
      </>}
    </>}
    {message && <p className="payout-feedback" role="status">{message}</p>}
    {status.isError && <p role="alert">Authenticator status could not be verified. Refresh and try again.</p>}
  </div>;
}

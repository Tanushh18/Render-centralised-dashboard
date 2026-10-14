import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, AlertCircle, ArrowUpRight, Check, ChevronDown, CircleHelp, Cloud,
  ExternalLink, Eye, EyeOff, Filter, Gauge, Globe2, Layers3, LoaderCircle,
  LockKeyhole, Plus, RefreshCw, Search, Server, ShieldCheck, TerminalSquare,
  Trash2, X, Zap, Rocket, RotateCw, History, KeyRound, Copy, Save, Unlock,
  Eye as EyeIcon,
} from "lucide-react";
import { decryptVault, deleteSavedVault, encryptVault, hasSavedVault } from "./vault";

const API = "https://api.render.com/v1";
type EnvVar = { key: string; value: string; originalValue?: string; isNew?: boolean; visible?: boolean };
type LogEntry = { id?: string; message?: string; timestamp?: string; labels?: { name: string; value: string }[] };
type Deploy = { id: string; status?: string; trigger?: string; createdAt?: string; updatedAt?: string; startedAt?: string; finishedAt?: string; commit?: { id?: string; message?: string; createdAt?: string } };
type RenderService = {
  id: string; name: string; type?: string; ownerId?: string; suspended?: string;
  createdAt?: string; updatedAt?: string; dashboardUrl?: string; repo?: string; branch?: string;
  serviceDetails?: { env?: string; region?: string; plan?: string; url?: string; buildPlan?: string };
  accountId?: string; accountName?: string;
};
type Account = { id: string; name: string; apiKey: string; services: RenderService[]; connectedAt: string };
type VaultData = { accounts: Account[] };
type Tab = "overview" | "logs" | "env" | "deploys";

async function apiRequest<T>(account: Account, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${account.apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let detail = "";
    try { const body = await response.json(); detail = body.message || body.error || ""; } catch { /* response may not be JSON */ }
    throw new Error(`Render API ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
function normalizeServices(payload: any): RenderService[] {
  if (!Array.isArray(payload)) throw new Error("Unexpected response from Render services endpoint.");
  return payload.map((entry) => entry?.service ?? entry).filter((s) => s?.id).map((s) => ({ ...s, name: s.name || "Unnamed service" }));
}
function normalizeList<T>(payload: any, key: string): T[] {
  if (!Array.isArray(payload)) throw new Error("Unexpected response from Render API.");
  return payload.map((entry) => entry?.[key] ?? entry).filter(Boolean);
}
function serviceUrl(service: RenderService) {
  return service.dashboardUrl || `https://dashboard.render.com/web/${service.id}`;
}
function relativeTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
function serviceKind(service: RenderService) {
  const type = (service.type || "").toLowerCase();
  if (type.includes("static")) return "Static site";
  if (type.includes("private")) return "Private service";
  if (type.includes("cron")) return "Cron job";
  if (type.includes("postgres")) return "PostgreSQL";
  if (type.includes("worker")) return "Background worker";
  return "Web service";
}
function initials(value: string) {
  return value.split(/[\s-_]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "R";
}
function labelValue(log: LogEntry, key: string) {
  return log.labels?.find((label) => label.name === key)?.value || "";
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState("");
  const [accountName, setAccountName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<RenderService | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState("Overview");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logType, setLogType] = useState("app");
  const [logSearch, setLogSearch] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envBusy, setEnvBusy] = useState(false);
  const [envLoaded, setEnvLoaded] = useState(false);
  const [envSearch, setEnvSearch] = useState("");
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [deploysBusy, setDeploysBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showEnvValues, setShowEnvValues] = useState(false);
  const [showNewEnv, setShowNewEnv] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [detailError, setDetailError] = useState("");

  useEffect(() => { setVaultExists(hasSavedVault()); }, []);
  const services = useMemo(() => accounts.flatMap((a) => a.services.map((s) => ({ ...s, accountId: a.id, accountName: a.name }))), [accounts]);
  const filtered = useMemo(() => services.filter((s) => {
    const text = `${s.name} ${s.type || ""} ${s.serviceDetails?.region || ""} ${s.accountName || ""}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (accountFilter === "all" || s.accountId === accountFilter) && (typeFilter === "all" || serviceKind(s) === typeFilter);
  }), [services, query, accountFilter, typeFilter]);
  const suspended = services.filter((s) => s.suspended === "suspended").length;
  const liveCount = services.length - suspended;
  const selectedAccount = selected ? accounts.find((a) => a.id === selected.accountId) : undefined;

  async function saveAccounts(next: Account[]) {
    setAccounts(next);
    if (vaultUnlocked && passphrase) await encryptVault({ accounts: next } satisfies VaultData, passphrase);
  }
  async function setupVault(event: FormEvent) {
    event.preventDefault(); setVaultError("");
    if (passphrase.length < 12) { setVaultError("Use at least 12 characters for a stronger vault passphrase."); return; }
    if (passphrase !== passphraseConfirm) { setVaultError("Passphrases do not match."); return; }
    setVaultBusy(true);
    try {
      await encryptVault({ accounts: [] } satisfies VaultData, passphrase);
      setAccounts([]); setVaultUnlocked(true); setVaultExists(true); setPassphraseConfirm(""); setNotice("Encrypted local vault created. Add your Render accounts.");
    } catch (e) { setVaultError(e instanceof Error ? e.message : "Could not create encrypted vault."); }
    finally { setVaultBusy(false); }
  }
  async function unlockVault(event: FormEvent) {
    event.preventDefault(); setVaultError(""); setVaultBusy(true);
    try {
      const data = await decryptVault<VaultData>(passphrase);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setVaultUnlocked(true); setVaultError(""); setNotice("Local vault unlocked.");
    } catch (e) { setVaultError(e instanceof Error ? e.message : "Could not unlock vault."); }
    finally { setVaultBusy(false); }
  }
  function lockVault() {
    setAccounts([]); setPassphrase(""); setVaultUnlocked(false); setSelected(null); setEnvVars([]); setLogs([]); setDeploys([]);
    setNotice("Vault locked. The encrypted vault remains saved on this browser.");
  }
  async function connectAccount(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!apiKey.trim()) { setError("Paste a Render API key to connect this account."); return; }
    setConnecting(true);
    try {
      const loaded = normalizeServices(await apiRequest<any>({ id: "temp", name: "temp", apiKey: apiKey.trim(), services: [], connectedAt: "" }, "/services?limit=100"));
      const name = accountName.trim() || `Render account ${accounts.length + 1}`;
      const id = `account-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const account: Account = { id, name, apiKey: apiKey.trim(), services: loaded.map((s) => ({ ...s, accountId: id, accountName: name })), connectedAt: new Date().toISOString() };
      await saveAccounts([...accounts, account]);
      setApiKey(""); setAccountName(""); setAdding(false); setNotice(`Connected ${name} and loaded ${loaded.length} services. Credentials saved encrypted on this browser.`); setLastSync(new Date());
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to connect to Render.";
      setError(message.includes("Failed to fetch") ? "The browser could not reach Render. This may be a CORS restriction or network issue; a frontend-only app cannot bypass CORS. Try the local app in a modern browser or use a local-only proxy." : message);
    } finally { setConnecting(false); }
  }
  async function refreshAll() {
    setRefreshing(true); setError(""); setNotice("");
    try {
      const results = await Promise.all(accounts.map(async (account) => ({ id: account.id, services: normalizeServices(await apiRequest<any>(account, "/services?limit=100")) })));
      const next = accounts.map((a) => { const result = results.find((r) => r.id === a.id); return result ? { ...a, services: result.services.map((s) => ({ ...s, accountId: a.id, accountName: a.name })) } : a; });
      await saveAccounts(next); setLastSync(new Date()); setNotice("All connected accounts refreshed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Refresh failed."); }
    finally { setRefreshing(false); }
  }
  async function removeAccount(id: string) {
    const account = accounts.find((a) => a.id === id);
    if (!account || !window.confirm(`Disconnect ${account.name} and permanently remove its saved API key from the encrypted vault?`)) return;
    await saveAccounts(accounts.filter((a) => a.id !== id)); setNotice(`${account.name} disconnected and removed from the saved vault.`);
  }
  function accountFor(service: RenderService) { return accounts.find((a) => a.id === service.accountId); }

  async function loadLogs(service = selected, type = logType) {
    if (!service) return;
    const account = accountFor(service);
    if (!account) return;
    const ownerId = service.ownerId;
    if (!ownerId) { setDetailError("This service response does not include ownerId, which Render requires to query logs. Open the service in Render or refresh service data."); return; }
    setLogsBusy(true); setDetailError("");
    try {
      const end = new Date(); const start = new Date(end.getTime() - 60 * 60 * 1000);
      const params = new URLSearchParams({ ownerId, resource: service.id, startTime: start.toISOString(), endTime: end.toISOString(), direction: "backward", limit: "100", type });
      const data = await apiRequest<any>(account, `/logs?${params.toString()}`);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) { setDetailError(`Could not load logs: ${e instanceof Error ? e.message : "Unknown error"}. Browser CORS restrictions may block this request.`); }
    finally { setLogsBusy(false); }
  }
  async function loadEnv(service = selected) {
    if (!service) return;
    const account = accountFor(service); if (!account) return;
    setEnvBusy(true); setDetailError(""); setEnvLoaded(false);
    try {
      const payload = await apiRequest<any>(account, `/services/${encodeURIComponent(service.id)}/env-vars?limit=100`);
      const vars = normalizeList<any>(payload, "envVar").map((v) => ({ key: v.key || "", value: v.value || "", originalValue: v.value || "" })).filter((v) => v.key);
      setEnvVars(vars); setEnvLoaded(true);
    } catch (e) { setDetailError(`Could not load environment variables: ${e instanceof Error ? e.message : "Unknown error"}.`); }
    finally { setEnvBusy(false); }
  }
  async function saveEnvVars() {
    if (!selected || !selectedAccount) return;
    const dirty = envVars.filter((v) => v.isNew || v.value !== v.originalValue);
    if (!dirty.length) { setNotice("No environment variable changes to save."); return; }
    if (!window.confirm(`Save ${dirty.length} environment variable change(s) for ${selected.name}? Render may require a deploy for changes to take effect.`)) return;
    setActionBusy(true); setDetailError("");
    try {
      for (const item of dirty) {
        await apiRequest<any>(selectedAccount, `/services/${encodeURIComponent(selected.id)}/env-vars/${encodeURIComponent(item.key)}`, { method: "PUT", body: JSON.stringify({ value: item.value }) });
      }
      await loadEnv(selected); setNotice("Environment variables saved. Trigger a deploy if you need the new values applied."); 
    } catch (e) { setDetailError(`Saving environment variables failed: ${e instanceof Error ? e.message : "Unknown error"}.`); }
    finally { setActionBusy(false); }
  }
  async function deleteEnvVar(item: EnvVar) {
    if (!selected || !selectedAccount || item.isNew) { setEnvVars((v) => v.filter((x) => x.key !== item.key)); return; }
    if (!window.confirm(`Permanently delete environment variable ${item.key} from ${selected.name}? This cannot be undone.`)) return;
    setActionBusy(true); setDetailError("");
    try {
      await apiRequest<void>(selectedAccount, `/services/${encodeURIComponent(selected.id)}/env-vars/${encodeURIComponent(item.key)}`, { method: "DELETE" });
      setEnvVars((v) => v.filter((x) => x.key !== item.key)); setNotice(`Deleted ${item.key}. Trigger a deploy if needed.`);
    } catch (e) { setDetailError(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}.`); }
    finally { setActionBusy(false); }
  }
  async function loadDeploys(service = selected) {
    if (!service) return;
    const account = accountFor(service); if (!account) return;
    setDeploysBusy(true); setDetailError("");
    try {
      const payload = await apiRequest<any>(account, `/services/${encodeURIComponent(service.id)}/deploys?limit=20`);
      setDeploys(normalizeList<Deploy>(payload, "deploy"));
    } catch (e) { setDetailError(`Could not load deployments: ${e instanceof Error ? e.message : "Unknown error"}.`); }
    finally { setDeploysBusy(false); }
  }
  async function triggerDeploy(clearCache = false) {
    if (!selected || !selectedAccount) return;
    const text = clearCache ? "deploy with cache cleared" : "deploy the latest commit";
    if (!window.confirm(`Are you sure you want to ${text} for ${selected.name}?`)) return;
    setActionBusy(true); setDetailError("");
    try {
      await apiRequest<any>(selectedAccount, `/services/${encodeURIComponent(selected.id)}/deploys`, { method: "POST", body: JSON.stringify({ clearCache: clearCache ? "clear" : "do_not_clear", deployMode: "build_and_deploy" }) });
      setNotice(`Deploy triggered for ${selected.name}.`); await loadDeploys(selected);
    } catch (e) { setDetailError(`Deploy failed: ${e instanceof Error ? e.message : "Unknown error"}.`); }
    finally { setActionBusy(false); }
  }
  async function restartService() {
    if (!selected || !selectedAccount) return;
    if (serviceKind(selected) === "Cron job") { setDetailError("Render does not support restarting cron jobs through this endpoint."); return; }
    if (!window.confirm(`Restart ${selected.name} now? This can briefly interrupt service.`)) return;
    setActionBusy(true); setDetailError("");
    try { await apiRequest<any>(selectedAccount, `/services/${encodeURIComponent(selected.id)}/restart`, { method: "POST" }); setNotice(`Restart requested for ${selected.name}.`); }
    catch (e) { setDetailError(`Restart failed: ${e instanceof Error ? e.message : "Unknown error"}.`); }
    finally { setActionBusy(false); }
  }
  function openService(service: RenderService) {
    setSelected(service); setTab("overview"); setLogs([]); setDeploys([]); setEnvVars([]); setEnvLoaded(false); setDetailError(""); setShowNewEnv(false);
  }
  function changeTab(next: Tab) {
    setTab(next); setDetailError("");
    if (next === "logs") void loadLogs(selected);
    if (next === "env") void loadEnv(selected);
    if (next === "deploys") void loadDeploys(selected);
  }
  async function addEnvVar(event: FormEvent) {
    event.preventDefault();
    const key = newEnvKey.trim();
    if (!key || envVars.some((v) => v.key === key)) { setDetailError("Environment variable key must be unique and non-empty."); return; }
    setEnvVars((v) => [...v, { key, value: newEnvValue, originalValue: "", isNew: true }]);
    setNewEnvKey(""); setNewEnvValue(""); setShowNewEnv(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Layers3 size={20}/></div><div><div className="brand-name">render<span>desk</span></div><div className="brand-caption">PERSONAL CONTROL PLANE</div></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className={`nav-item ${activeView === "Overview" ? "active" : ""}`} onClick={() => setActiveView("Overview")}><Gauge size={17}/><span>Overview</span><span className="nav-shortcut">⌘ 1</span></button>
        <button className={`nav-item ${activeView === "Services" ? "active" : ""}`} onClick={() => setActiveView("Services")}><Server size={17}/><span>Services</span><span className="nav-count">{services.length}</span></button>
        <button className={`nav-item ${activeView === "Activity" ? "active" : ""}`} onClick={() => { setActiveView("Activity"); setNotice("Use service details to inspect logs and deployment history."); }}><Activity size={17}/><span>Activity</span></button>
        <div className="sidebar-divider"/>
        <div className="workspace-label">CONNECTIONS <button className="tiny-add" onClick={() => { setAdding(true); setError(""); }} aria-label="Add account"><Plus size={14}/></button></div>
        {accounts.length === 0 ? <div className="empty-accounts"><div className="empty-account-icon"><Cloud size={16}/></div><span>No accounts connected</span><small>Connect a Render API key to get started.</small></div> : accounts.map((a) => <div className="account-nav" key={a.id}><div className="account-avatar">{initials(a.name)}</div><div className="account-nav-copy"><strong>{a.name}</strong><small>{a.services.length} services</small></div><span className="connection-dot"/></div>)}
        <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={16}/><div><strong>Encrypted local vault</strong><span>Keys encrypted at rest</span></div></div><div className="sidebar-foot"><span className="foot-dot"/> Personal workspace <span className="foot-version">v1.0</span></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeView}</strong></div><div className="topbar-actions"><div className="sync-status"><span className="sync-dot"/>{lastSync ? `Synced ${relativeTime(lastSync.toISOString())}` : vaultUnlocked ? "Vault unlocked" : "Vault locked"}</div><button className="icon-button" title="Refresh all accounts" onClick={refreshAll} disabled={!accounts.length || refreshing}>{refreshing ? <LoaderCircle className="spin" size={17}/> : <RefreshCw size={17}/>}</button><button className="icon-button" title={vaultUnlocked ? "Lock vault" : "Unlock vault"} onClick={lockVault} disabled={!vaultUnlocked}><LockKeyhole size={16}/></button><div className="top-avatar">TC</div></div></header>
        <div className="page-content">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> INFRASTRUCTURE OVERVIEW</div><h1>Your services, <span>at a glance.</span></h1><p className="page-subtitle">One calm place to see what’s running across all your Render accounts.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={refreshAll} disabled={!accounts.length || refreshing}><RefreshCw size={15} className={refreshing ? "spin" : ""}/> Refresh</button><button className="button button-primary" onClick={() => { setAdding(true); setError(""); }} disabled={!vaultUnlocked}><Plus size={16}/> Connect account</button></div></section>
          {error && <div className="alert alert-error"><AlertCircle size={17}/><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={15}/></button></div>}
          {notice && <div className="alert alert-success"><Check size={17}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}
          <section className="stat-grid">
            <div className="stat-card stat-card-featured"><div className="stat-top"><span className="stat-label">TOTAL SERVICES</span><div className="stat-icon"><Layers3 size={17}/></div></div><div className="stat-value">{services.length.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="stat-detail">Across connected accounts</span><span className="stat-chip"><ArrowUpRight size={13}/>{accounts.length} accounts</span></div><div className="stat-decoration"/></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-label">NOT SUSPENDED</span><div className="stat-icon icon-green"><Activity size={17}/></div></div><div className="stat-value">{liveCount.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="status-dot green-dot"/>Services not marked suspended</div><div className="stat-progress"><span style={{width:services.length ? `${liveCount/services.length*100}%` : "0%"}}/></div></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-label">SUSPENDED</span><div className="stat-icon icon-amber"><Zap size={17}/></div></div><div className="stat-value">{suspended.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="status-dot amber-dot"/>May need your attention</div><div className="stat-progress amber-progress"><span style={{width:services.length ? `${suspended/services.length*100}%` : "0%"}}/></div></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-label">CONNECTED ACCOUNTS</span><div className="stat-icon icon-blue"><Globe2 size={17}/></div></div><div className="stat-value">{accounts.length.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="status-dot blue-dot"/>{accounts.length ? "Accounts in this vault" : "Ready for your first key"}</div><div className="stat-footnote"><LockKeyhole size={12}/> AES-GCM encrypted storage</div></div>
          </section>
          <section className="content-grid">
            <div className="panel services-panel">
              <div className="panel-header"><div><div className="panel-title-row"><h2>Service inventory</h2><span className="count-pill">{filtered.length}</span></div><p>Every connected service, without account hopping.</p></div><button className="text-button" onClick={() => setActiveView("Services")}>View all <ArrowUpRight size={14}/></button></div>
              <div className="toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search services, regions, accounts…" value={query} onChange={(e) => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={13}/></button>}</div><div className="filter-wrap"><Filter size={14}/><select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}><option value="all">All accounts</option>{accounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select><ChevronDown size={13}/></div><div className="filter-wrap type-filter"><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">All types</option><option>Web service</option><option>Static site</option><option>Private service</option><option>Cron job</option><option>Background worker</option><option>PostgreSQL</option></select><ChevronDown size={13}/></div></div>
              <div className="table-wrap"><table><thead><tr><th>SERVICE</th><th>ACCOUNT</th><th>TYPE</th><th>REGION</th><th>STATUS</th><th/></tr></thead><tbody>
                {filtered.map((s) => <tr key={`${s.accountId}-${s.id}`} onClick={() => openService(s)} className="service-row"><td><div className="service-cell"><div className={`service-symbol ${serviceKind(s)==="PostgreSQL"?"db-symbol":""}`}>{serviceKind(s)==="PostgreSQL"?<Layers3 size={16}/>:<Server size={16}/>}</div><div className="service-name-wrap"><strong>{s.name}</strong><span>{s.id.slice(0,12)}{s.branch?` · ${s.branch}`:""}</span></div></div></td><td><span className="account-cell"><span className="mini-avatar">{initials(s.accountName||"")}</span>{s.accountName}</span></td><td><span className="type-label">{serviceKind(s)}</span></td><td><span className="region-label">{s.serviceDetails?.region||"—"}</span></td><td>{s.suspended==="suspended"?<span className="status-pill suspended"><span/>Suspended</span>:<span className="status-pill connected"><span/>Listed</span>}</td><td><button className="row-open" title="Open service details" onClick={(e)=>{e.stopPropagation();openService(s);}}><ArrowUpRight size={15}/></button></td></tr>)}
                {!filtered.length&&<tr><td colSpan={6}><div className="empty-table"><div className="empty-illustration"><Server size={23}/><Plus size={13}/></div><h3>{services.length?"No matching services":"Your control room is ready"}</h3><p>{services.length?"Try another search or change the filters.":"Unlock your local vault and connect a Render account."}</p>{!services.length&&<button className="button button-primary" onClick={()=>setAdding(true)} disabled={!vaultUnlocked}><Plus size={15}/> Connect first account</button>}</div></td></tr>}
              </tbody></table></div>
              <div className="table-footer"><span>Showing <strong>{filtered.length}</strong> of <strong>{services.length}</strong> services</span><span className="footer-live"><span className="sync-dot"/> {lastSync?`Last sync ${lastSync.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:"Not synced yet"}</span></div>
            </div>
            <div className="right-column">
              <div className="panel connections-panel"><div className="panel-header"><div><h2>Connected accounts</h2><p>Your Render workspaces</p></div><button className="panel-icon-button" onClick={()=>setAdding(true)} title="Add account" disabled={!vaultUnlocked}><Plus size={16}/></button></div>
                {accounts.length?<div className="connections-list">{accounts.map((a)=><div className="connection-item" key={a.id}><div className="connection-logo">{initials(a.name)}</div><div className="connection-info"><strong>{a.name}</strong><span>{a.services.length} services · encrypted locally</span></div><button className="connection-remove" title={`Disconnect ${a.name}`} onClick={()=>void removeAccount(a.id)}><Trash2 size={14}/></button></div>)}</div>:<div className="connections-empty"><div className="cloud-outline"><Cloud size={21}/></div><strong>No accounts yet</strong><span>Unlock or create your encrypted vault, then add a Render API key.</span><button className="button button-secondary button-full" onClick={()=>setAdding(true)} disabled={!vaultUnlocked}><Plus size={15}/> Add your first account</button></div>}
                <button className="add-connection-link" onClick={()=>setAdding(true)} disabled={!vaultUnlocked}><Plus size={14}/> Connect another account</button>
              </div>
              <div className="tip-card"><div className="tip-icon"><ShieldCheck size={18}/></div><div className="tip-heading"><span>LOCAL ENCRYPTION</span><h3>Your keys, your device.</h3></div><p>API keys are encrypted with AES-256-GCM and a passphrase-derived key before they are saved in this browser.</p><div className="tip-divider"/><div className="tip-footer"><LockKeyhole size={14}/><span>Never commit API keys to GitHub.</span></div></div>
              <div className="quick-links"><div className="quick-links-title">QUICK LINKS</div><a href="https://dashboard.render.com" target="_blank" rel="noreferrer"><span><Globe2 size={15}/> Render dashboard</span><ExternalLink size={13}/></a><a href="https://render.com/docs/api" target="_blank" rel="noreferrer"><span><CircleHelp size={15}/> API documentation</span><ExternalLink size={13}/></a></div>
            </div>
          </section>
          <footer className="page-footer"><span>renderdesk <span className="footer-sep">/</span> Personal infrastructure console</span><span><span className="footer-dot"/> No application backend · encrypted local vault</span></footer>
        </div>
      </main>

      {(!vaultUnlocked)&&<div className="modal-backdrop vault-backdrop"><div className="connect-modal"><div className="modal-top"><div className="modal-icon"><LockKeyhole size={20}/></div></div><div className="modal-kicker">LOCAL CREDENTIAL VAULT</div><h2>{vaultExists?"Unlock your vault":"Create your encrypted vault"}</h2><p className="modal-description">{vaultExists?"Enter the passphrase you created to decrypt your saved Render account keys on this device.":"Choose a strong passphrase. It encrypts your Render API keys locally; it is never sent to any server and cannot be recovered if forgotten."}</p><form onSubmit={vaultExists?unlockVault:setupVault}><label htmlFor="vault-passphrase">Vault passphrase</label><input id="vault-passphrase" className="modal-input" type="password" autoComplete="current-password" value={passphrase} onChange={(e)=>setPassphrase(e.target.value)} placeholder="At least 12 characters" autoFocus required minLength={vaultExists?1:12}/>{!vaultExists&&<><label htmlFor="vault-confirm">Confirm passphrase</label><input id="vault-confirm" className="modal-input" type="password" autoComplete="new-password" value={passphraseConfirm} onChange={(e)=>setPassphraseConfirm(e.target.value)} placeholder="Type it again" required minLength={12}/></>}{vaultError&&<div className="modal-error"><AlertCircle size={15}/>{vaultError}</div>}<button className="button button-primary button-full connect-submit" type="submit" disabled={vaultBusy}>{vaultBusy?<><LoaderCircle size={16} className="spin"/> {vaultExists?"Unlocking…":"Encrypting vault…"}</>:<><Unlock size={16}/>{vaultExists?"Unlock vault":"Create vault & continue"}</>}</button><div className="modal-note">This is local encryption, not website authentication. Use this dashboard only on a trusted device and over HTTPS or localhost. If you lose the passphrase, the saved keys cannot be recovered.</div></form></div></div>}

      {adding&&<div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setAdding(false);}}><div className="connect-modal"><div className="modal-top"><div className="modal-icon"><Cloud size={20}/></div><button className="modal-close" onClick={()=>setAdding(false)} aria-label="Close"><X size={18}/></button></div><div className="modal-kicker">NEW CONNECTION</div><h2>Connect a Render account</h2><p className="modal-description">Validate the API key and load services. The key is encrypted before permanent local storage.</p><form onSubmit={connectAccount}><label htmlFor="account-name">Account name <span>OPTIONAL</span></label><input id="account-name" className="modal-input" placeholder="e.g. GgnHome production" value={accountName} onChange={(e)=>setAccountName(e.target.value)} autoFocus/><label htmlFor="api-key">Render API key</label><div className="key-input-wrap"><input id="api-key" className="modal-input" type={showKey?"text":"password"} placeholder="rnd_••••••••••••••••••••" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} autoComplete="off" spellCheck={false}/><button type="button" className="show-key" onClick={()=>setShowKey(!showKey)} aria-label={showKey?"Hide key":"Show key"}>{showKey?<EyeOff size={16}/>:<Eye size={16}/>}</button></div><div className="key-help"><LockKeyhole size={14}/><span>Encrypted with your vault passphrase using AES-GCM. The key is never sent anywhere except Render API requests.</span></div>{error&&<div className="modal-error"><AlertCircle size={15}/>{error}</div>}<button className="button button-primary button-full connect-submit" type="submit" disabled={connecting||!apiKey.trim()}>{connecting?<><LoaderCircle size={16} className="spin"/> Validating key…</>:<><Zap size={16}/> Validate & connect</>}</button><div className="modal-note">If the browser blocks Render API requests due to CORS, a frontend-only page cannot bypass that restriction.</div></form></div></div>}

      {selected&&<div className="modal-backdrop detail-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setSelected(null);}}><div className="detail-modal wide-detail"><div className="detail-top"><div className="service-symbol large-symbol"><Server size={19}/></div><button className="modal-close" onClick={()=>setSelected(null)} aria-label="Close"><X size={18}/></button></div><div className="modal-kicker">SERVICE CONTROL</div><h2>{selected.name}</h2><p className="modal-description">{selected.accountName} · {serviceKind(selected)} · {selected.id}</p>
        <div className="detail-actions"><a className="button button-secondary" href={serviceUrl(selected)} target="_blank" rel="noreferrer">Open Render <ExternalLink size={14}/></a><button className="button button-secondary" onClick={()=>void restartService()} disabled={actionBusy||serviceKind(selected)==="Cron job"}><RotateCw size={14}/> Restart</button><button className="button button-primary" onClick={()=>void triggerDeploy(false)} disabled={actionBusy}><Rocket size={14}/> Deploy latest</button><button className="button button-secondary" onClick={()=>void triggerDeploy(true)} disabled={actionBusy}>Deploy + clear cache</button></div>
        <div className="detail-tabs"><button className={tab==="overview"?"selected":""} onClick={()=>changeTab("overview")}><Gauge size={14}/> Overview</button><button className={tab==="logs"?"selected":""} onClick={()=>changeTab("logs")}><TerminalSquare size={14}/> Logs</button><button className={tab==="env"?"selected":""} onClick={()=>changeTab("env")}><KeyRound size={14}/> Environment</button><button className={tab==="deploys"?"selected":""} onClick={()=>changeTab("deploys")}><History size={14}/> Deployments</button></div>
        {detailError&&<div className="alert alert-error detail-alert"><AlertCircle size={16}/><span>{detailError}</span><button onClick={()=>setDetailError("")} aria-label="Dismiss"><X size={15}/></button></div>}
        {tab==="overview"&&<><div className="detail-grid"><div><span>Service ID</span><strong>{selected.id}</strong></div><div><span>Region</span><strong>{selected.serviceDetails?.region||"Not provided"}</strong></div><div><span>Type</span><strong>{selected.type||"Unknown"}</strong></div><div><span>Last updated</span><strong>{relativeTime(selected.updatedAt)}</strong></div><div><span>Plan</span><strong>{selected.serviceDetails?.plan||selected.serviceDetails?.buildPlan||"—"}</strong></div><div><span>State</span><strong>{selected.suspended==="suspended"?"Suspended":"Not marked suspended"}</strong></div><div><span>Repository</span><strong>{selected.repo||"—"}</strong></div><div><span>Branch</span><strong>{selected.branch||"—"}</strong></div></div><div className="detail-note"><ShieldCheck size={16}/><span>Restart and deploy actions ask for confirmation. Environment changes are saved individually to avoid accidentally deleting variables.</span></div></>}
        {tab==="logs"&&<div className="detail-section"><div className="section-toolbar"><div><h3>Recent logs</h3><p>Last 60 minutes · up to 100 entries</p></div><div className="section-tools"><select value={logType} onChange={(e)=>{setLogType(e.target.value);void loadLogs(selected,e.target.value);}}><option value="app">Application</option><option value="request">Request</option><option value="build">Build</option></select><button className="panel-icon-button" onClick={()=>void loadLogs(selected)} disabled={logsBusy}>{logsBusy?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}</button></div></div><div className="search-box log-search"><Search size={15}/><input placeholder="Filter log messages…" value={logSearch} onChange={(e)=>setLogSearch(e.target.value)}/></div>{logsBusy?<div className="section-loading"><LoaderCircle className="spin"/> Loading logs…</div>:<div className="logs-list">{logs.filter((log)=>String(log.message||"").toLowerCase().includes(logSearch.toLowerCase())).map((log,i)=><div className="log-line" key={log.id||i}><span className="log-time">{log.timestamp?new Date(log.timestamp).toLocaleTimeString(): "—"}</span><span className={`log-level ${labelValue(log,"level").toLowerCase()}`}>{labelValue(log,"level")||labelValue(log,"type")||"LOG"}</span><code>{log.message||"(empty log entry)"}</code></div>)}{!logs.length&&<div className="section-empty">No logs returned for this period. Try another log type or check Render access.</div>}</div>}</div>}
        {tab==="env"&&<div className="detail-section"><div className="section-toolbar"><div><h3>Environment variables</h3><p>Direct service variables only; linked environment groups are separate.</p></div><div className="section-tools"><button className="panel-icon-button" title={showEnvValues?"Mask values":"Show values"} onClick={()=>setShowEnvValues(!showEnvValues)}>{showEnvValues?<EyeOff size={15}/>:<EyeIcon size={15}/>}</button><button className="panel-icon-button" title="Refresh variables" onClick={()=>void loadEnv(selected)} disabled={envBusy}>{envBusy?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}</button></div></div><div className="env-toolbar"><div className="search-box"><Search size={15}/><input placeholder="Find a variable…" value={envSearch} onChange={(e)=>setEnvSearch(e.target.value)}/></div><button className="button button-secondary" onClick={()=>setShowNewEnv(!showNewEnv)}><Plus size={14}/> Add variable</button></div>{showNewEnv&&<form className="new-env-form" onSubmit={addEnvVar}><input className="modal-input" placeholder="VARIABLE_NAME" value={newEnvKey} onChange={(e)=>setNewEnvKey(e.target.value)} required/><input className="modal-input" placeholder="Value" value={newEnvValue} onChange={(e)=>setNewEnvValue(e.target.value)} required/><button className="button button-primary" type="submit"><Plus size={14}/> Add</button></form>}{envBusy?<div className="section-loading"><LoaderCircle className="spin"/> Loading variables…</div>:!envLoaded?<div className="section-empty">Load variables to view and edit this service’s environment.</div>:<div className="env-list">{envVars.filter((v)=>v.key.toLowerCase().includes(envSearch.toLowerCase())).map((v)=><div className="env-row" key={v.key}><div className="env-key"><strong>{v.key}</strong>{v.isNew&&<span className="new-tag">NEW</span>}</div><input className="env-value-input" type={showEnvValues?"text":"password"} value={v.value} onChange={(e)=>setEnvVars((prev)=>prev.map((item)=>item.key===v.key?{...item,value:e.target.value}:item))} autoComplete="off"/><button className="connection-remove" title={`Delete ${v.key}`} onClick={()=>void deleteEnvVar(v)} disabled={actionBusy}><Trash2 size={14}/></button></div>)}{!envVars.length&&<div className="section-empty">No direct environment variables found.</div>}</div>}<div className="env-footer"><span>Changes are not deployed automatically.</span><button className="button button-primary" onClick={()=>void saveEnvVars()} disabled={actionBusy||envBusy||!envLoaded}><Save size={14}/>{actionBusy?"Saving…":"Save changes"}</button></div><div className="modal-note">Secret values returned by Render depend on API behavior and permissions. Values shown here are fetched from Render, not recovered from a hidden secret store.</div></div>}
        {tab==="deploys"&&<div className="detail-section"><div className="section-toolbar"><div><h3>Deployment history</h3><p>Recent deploys for this service</p></div><button className="panel-icon-button" onClick={()=>void loadDeploys(selected)} disabled={deploysBusy}>{deploysBusy?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}</button></div>{deploysBusy?<div className="section-loading"><LoaderCircle className="spin"/> Loading deployments…</div>:<div className="deploy-list">{deploys.map((deploy)=><div className="deploy-item" key={deploy.id}><div className={`deploy-state ${(deploy.status||"").toLowerCase().includes("live")?"live":(deploy.status||"").toLowerCase().includes("fail")?"failed":""}`}><Rocket size={15}/></div><div className="deploy-main"><div className="deploy-title"><strong>{deploy.status||"Unknown status"}</strong><span className="deploy-trigger">{deploy.trigger||"—"}</span></div><p>{deploy.commit?.message||deploy.id}</p><small>{deploy.commit?.id?deploy.commit.id.slice(0,8)+" · ":""}{relativeTime(deploy.createdAt)}</small></div><span className="deploy-date">{deploy.createdAt?new Date(deploy.createdAt).toLocaleString(): "—"}</span></div>)}{!deploys.length&&<div className="section-empty">No deployments returned for this service.</div>}</div>}</div>}
      </div></div>}
    </div>
  );
}

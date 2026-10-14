import { useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Bell, Check, ChevronDown,
  CircleHelp, Cloud, Command, ExternalLink, Eye, EyeOff, Filter, Gauge, Globe2,
  Layers3, LoaderCircle, LockKeyhole, Plus, RefreshCw, Search, Server, Settings2,
  ShieldCheck, TerminalSquare, Trash2, X, Zap,
} from "lucide-react";

type RenderService = {
  id: string;
  name: string;
  type?: string;
  serviceDetails?: { env?: string; region?: string; plan?: string; url?: string };
  service?: RenderService;
  suspended?: string;
  createdAt?: string;
  updatedAt?: string;
  dashboardUrl?: string;
  repo?: string;
  branch?: string;
  accountId?: string;
  accountName?: string;
  state?: string;
};
type Account = { id: string; name: string; apiKey: string; services: RenderService[]; connectedAt: string };
const API = "https://api.render.com/v1";

function normalizeServices(payload: unknown): RenderService[] {
  if (!Array.isArray(payload)) throw new Error("Unexpected response from Render. Please check the API key and try again.");
  return payload.map((entry: any) => entry?.service ?? entry).filter((s: any) => s?.id).map((s: any) => ({
    ...s,
    name: s.name || "Unnamed service",
    accountId: "",
    state: s.suspended === "suspended" ? "Suspended" : "Connected",
  }));
}
function serviceUrl(service: RenderService) {
  return service.dashboardUrl || (service.id ? `https://dashboard.render.com/web/${service.id}` : "https://dashboard.render.com");
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
  return "Web service";
}
function initials(value: string) {
  return value.split(/[\s-_]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "R";
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState("Overview");

  const services = useMemo(() => accounts.flatMap((a) => a.services.map((s) => ({ ...s, accountId: a.id, accountName: a.name }))), [accounts]);
  const filtered = useMemo(() => services.filter((s) => {
    const text = `${s.name} ${s.type || ""} ${s.serviceDetails?.region || ""} ${s.accountName || ""}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (accountFilter === "all" || s.accountId === accountFilter) && (typeFilter === "all" || serviceKind(s) === typeFilter);
  }), [services, query, accountFilter, typeFilter]);
  const suspended = services.filter((s) => s.suspended === "suspended").length;
  const liveCount = services.length - suspended;

  async function connectAccount(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    if (!apiKey.trim()) { setError("Paste a Render API key to connect this account."); return; }
    setConnecting(true);
    try {
      const response = await fetch(`${API}/services?limit=100`, { headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: "application/json" } });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("Render rejected this key. Check that it is valid and has access to the intended account.");
        throw new Error(`Render API returned ${response.status}. Try again in a moment.`);
      }
      const loaded = normalizeServices(await response.json());
      const name = accountName.trim() || `Render account ${accounts.length + 1}`;
      const id = `account-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setAccounts((current) => [...current, { id, name, apiKey: apiKey.trim(), services: loaded.map((s) => ({ ...s, accountId: id, accountName: name })), connectedAt: new Date().toISOString() }]);
      setApiKey(""); setAccountName(""); setAdding(false); setNotice(`Connected ${name} and loaded ${loaded.length} services.`); setLastSync(new Date());
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to connect to Render.";
      setError(message.includes("Failed to fetch") ? "The browser could not reach the Render API. This may be a CORS restriction or a network issue; a browser-only dashboard cannot bypass it. No server is configured in this build." : message);
    } finally { setConnecting(false); }
  }

  async function refreshAll() {
    setRefreshing(true); setError(""); setNotice("");
    try {
      const results = await Promise.all(accounts.map(async (account) => {
        const response = await fetch(`${API}/services?limit=100`, { headers: { Authorization: `Bearer ${account.apiKey}`, Accept: "application/json" } });
        if (!response.ok) throw new Error(`${account.name}: Render API returned ${response.status}`);
        return { id: account.id, services: normalizeServices(await response.json()) };
      }));
      setAccounts((current) => current.map((a) => {
        const result = results.find((r) => r.id === a.id);
        return result ? { ...a, services: result.services.map((s) => ({ ...s, accountId: a.id, accountName: a.name })) } : a;
      }));
      setLastSync(new Date()); setNotice("All connected accounts refreshed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Refresh failed."); }
    finally { setRefreshing(false); }
  }
  function removeAccount(id: string) {
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    if (!window.confirm(`Disconnect ${account.name}? Its API key will be removed from this page's memory.`)) return;
    setAccounts((current) => current.filter((a) => a.id !== id));
    setNotice(`${account.name} disconnected.`);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Layers3 size={20} strokeWidth={2.4} /></div><div><div className="brand-name">render<span>desk</span></div><div className="brand-caption">PERSONAL CONTROL PLANE</div></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className={`nav-item ${activeView === "Overview" ? "active" : ""}`} onClick={() => setActiveView("Overview")}><Gauge size={17}/><span>Overview</span><span className="nav-shortcut">⌘ 1</span></button>
        <button className={`nav-item ${activeView === "Services" ? "active" : ""}`} onClick={() => setActiveView("Services")}><Server size={17}/><span>Services</span><span className="nav-count">{services.length}</span></button>
        <button className={`nav-item ${activeView === "Activity" ? "active" : ""}`} onClick={() => { setActiveView("Activity"); setNotice("Activity timeline is coming in the next iteration. Service inventory is live."); }}><Activity size={17}/><span>Activity</span><span className="soon-tag">SOON</span></button>
        <div className="sidebar-divider"/>
        <div className="workspace-label">CONNECTIONS <button className="tiny-add" onClick={() => { setAdding(true); setError(""); }} aria-label="Add account"><Plus size={14}/></button></div>
        {accounts.length === 0 ? <div className="empty-accounts"><div className="empty-account-icon"><Cloud size={16}/></div><span>No accounts connected</span><small>Connect a Render API key to get started.</small></div> : accounts.map((a) => <div className="account-nav" key={a.id}><div className="account-avatar">{initials(a.name)}</div><div className="account-nav-copy"><strong>{a.name}</strong><small>{a.services.length} services</small></div><span className="connection-dot"/></div>)}
        <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={16}/><div><strong>Session-only keys</strong><span>Keys stay in page memory</span></div></div><div className="sidebar-foot"><span className="foot-dot"/> Personal workspace <span className="foot-version">v0.1</span></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeView}</strong></div><div className="topbar-actions"><div className="sync-status"><span className="sync-dot"/>{lastSync ? `Synced ${relativeTime(lastSync.toISOString())}` : "Waiting for connection"}</div><button className="icon-button" title="Refresh all accounts" onClick={refreshAll} disabled={!accounts.length || refreshing}>{refreshing ? <LoaderCircle className="spin" size={17}/> : <RefreshCw size={17}/>}</button><div className="top-avatar">TC</div></div></header>

        <div className="page-content">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> INFRASTRUCTURE OVERVIEW</div><h1>Your services, <span>at a glance.</span></h1><p className="page-subtitle">One calm place to see what’s running across all your Render accounts.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={refreshAll} disabled={!accounts.length || refreshing}><RefreshCw size={15} className={refreshing ? "spin" : ""}/> Refresh</button><button className="button button-primary" onClick={() => { setAdding(true); setError(""); }}><Plus size={16}/> Connect account</button></div></section>

          {error && <div className="alert alert-error"><AlertCircle size={17}/><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={15}/></button></div>}
          {notice && <div className="alert alert-success"><Check size={17}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}

          <section className="stat-grid">
            <div className="stat-card stat-card-featured"><div className="stat-top"><span className="stat-label">TOTAL SERVICES</span><div className="stat-icon"><Layers3 size={17}/></div></div><div className="stat-value">{services.length.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="stat-detail">Across connected accounts</span><span className="stat-chip"><ArrowUpRight size={13}/>{accounts.length} accounts</span></div><div className="stat-decoration"/></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-label">AVAILABLE</span><div className="stat-icon icon-green"><Activity size={17}/></div></div><div className="stat-value">{liveCount.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="status-dot green-dot"/>Services not marked suspended</div><div className="stat-progress"><span style={{width: services.length ? `${(liveCount/services.length)*100}%` : "0%"}}/></div></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-label">SUSPENDED</span><div className="stat-icon icon-amber"><Zap size={17}/></div></div><div className="stat-value">{suspended.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="status-dot amber-dot"/>May need your attention</div><div className="stat-progress amber-progress"><span style={{width: services.length ? `${(suspended/services.length)*100}%` : "0%"}}/></div></div>
            <div className="stat-card"><div className="stat-top"><span className="stat-label">CONNECTED ACCOUNTS</span><div className="stat-icon icon-blue"><Globe2 size={17}/></div></div><div className="stat-value">{accounts.length.toString().padStart(2,"0")}</div><div className="stat-bottom"><span className="status-dot blue-dot"/>{accounts.length ? "All connected in this session" : "Ready for your first key"}</div><div className="stat-footnote"><LockKeyhole size={12}/> Credentials not persisted</div></div>
          </section>

          <section className="content-grid">
            <div className="panel services-panel">
              <div className="panel-header"><div><div className="panel-title-row"><h2>Service inventory</h2><span className="count-pill">{filtered.length}</span></div><p>Every connected service, without account hopping.</p></div><button className="text-button" onClick={() => setActiveView("Services")}>View all <ArrowUpRight size={14}/></button></div>
              <div className="toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search services, regions, accounts…" value={query} onChange={(e) => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={13}/></button>}</div><div className="filter-wrap"><Filter size={14}/><select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}><option value="all">All accounts</option>{accounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select><ChevronDown size={13}/></div><div className="filter-wrap type-filter"><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="all">All types</option><option>Web service</option><option>Static site</option><option>Private service</option><option>Cron job</option><option>PostgreSQL</option></select><ChevronDown size={13}/></div></div>
              <div className="table-wrap"><table><thead><tr><th>SERVICE</th><th>ACCOUNT</th><th>TYPE</th><th>REGION</th><th>STATUS</th><th></th></tr></thead><tbody>
                {filtered.map((s) => <tr key={`${s.accountId}-${s.id}`} onClick={() => setSelected(s)} className="service-row"><td><div className="service-cell"><div className={`service-symbol ${serviceKind(s) === "PostgreSQL" ? "db-symbol" : ""}`}>{serviceKind(s) === "PostgreSQL" ? <Layers3 size={16}/> : <Server size={16}/>}</div><div className="service-name-wrap"><strong>{s.name}</strong><span>{s.id.slice(0, 12)}{s.branch ? ` · ${s.branch}` : ""}</span></div></div></td><td><span className="account-cell"><span className="mini-avatar">{initials(s.accountName || "")}</span>{s.accountName}</span></td><td><span className="type-label">{serviceKind(s)}</span></td><td><span className="region-label">{s.serviceDetails?.region || "—"}</span></td><td>{s.suspended === "suspended" ? <span className="status-pill suspended"><span/>Suspended</span> : <span className="status-pill connected"><span/>Listed</span>}</td><td><button className="row-open" title="Open service details" onClick={(e) => { e.stopPropagation(); setSelected(s); }}><ArrowUpRight size={15}/></button></td></tr>)}
                {!filtered.length && <tr><td colSpan={6}><div className="empty-table"><div className="empty-illustration"><Server size={23}/><Plus size={13}/></div><h3>{services.length ? "No matching services" : "Your control room is ready"}</h3><p>{services.length ? "Try another search or change the filters." : "Connect a Render account to pull your services into one view."}</p>{!services.length && <button className="button button-primary" onClick={() => setAdding(true)}><Plus size={15}/> Connect first account</button>}</div></td></tr>}
              </tbody></table></div>
              <div className="table-footer"><span>Showing <strong>{filtered.length}</strong> of <strong>{services.length}</strong> services</span><span className="footer-live"><span className="sync-dot"/> {lastSync ? `Last sync ${lastSync.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "Not synced yet"}</span></div>
            </div>

            <div className="right-column">
              <div className="panel connections-panel"><div className="panel-header"><div><h2>Connected accounts</h2><p>Your Render workspaces</p></div><button className="panel-icon-button" onClick={() => setAdding(true)} title="Add account"><Plus size={16}/></button></div>
                {accounts.length ? <div className="connections-list">{accounts.map((a) => <div className="connection-item" key={a.id}><div className="connection-logo">{initials(a.name)}</div><div className="connection-info"><strong>{a.name}</strong><span>{a.services.length} services · connected this session</span></div><button className="connection-remove" title={`Disconnect ${a.name}`} onClick={() => removeAccount(a.id)}><Trash2 size={14}/></button></div>)}</div> : <div className="connections-empty"><div className="cloud-outline"><Cloud size={21}/></div><strong>No accounts yet</strong><span>Add an API key for each Render account. Keys are held in memory only.</span><button className="button button-secondary button-full" onClick={() => setAdding(true)}><Plus size={15}/> Add your first account</button></div>}
                <button className="add-connection-link" onClick={() => setAdding(true)}><Plus size={14}/> Connect another account</button>
              </div>
              <div className="tip-card"><div className="tip-icon"><ShieldCheck size={18}/></div><div className="tip-heading"><span>BUILT FOR YOUR WORKFLOW</span><h3>Private by design.</h3></div><p>This browser-only build never saves API keys to local storage or a database. Refreshing the page clears connected sessions.</p><div className="tip-divider"/><div className="tip-footer"><LockKeyhole size={14}/><span>Keep this page on a trusted device.</span></div></div>
              <div className="quick-links"><div className="quick-links-title">QUICK LINKS</div><a href="https://dashboard.render.com" target="_blank" rel="noreferrer"><span><Globe2 size={15}/> Render dashboard</span><ExternalLink size={13}/></a><a href="https://render.com/docs/api" target="_blank" rel="noreferrer"><span><CircleHelp size={15}/> API documentation</span><ExternalLink size={13}/></a></div>
            </div>
          </section>
          <footer className="page-footer"><span>renderdesk <span className="footer-sep">/</span> Personal infrastructure console</span><span><span className="footer-dot"/> No backend · No stored credentials</span></footer>
        </div>
      </main>

      {adding && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAdding(false); }}><div className="connect-modal"><div className="modal-top"><div className="modal-icon"><Cloud size={20}/></div><button className="modal-close" onClick={() => setAdding(false)} aria-label="Close"><X size={18}/></button></div><div className="modal-kicker">NEW CONNECTION</div><h2>Connect a Render account</h2><p className="modal-description">Add a name and API key. We’ll validate the key and load services directly from Render.</p><form onSubmit={connectAccount}><label htmlFor="account-name">Account name <span>OPTIONAL</span></label><input id="account-name" className="modal-input" placeholder="e.g. GgnHome production" value={accountName} onChange={(e) => setAccountName(e.target.value)} autoFocus/><label htmlFor="api-key">Render API key</label><div className="key-input-wrap"><input id="api-key" className="modal-input" type={showKey ? "text" : "password"} placeholder="rnd_••••••••••••••••••••" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false}/><button type="button" className="show-key" onClick={() => setShowKey(!showKey)} aria-label={showKey ? "Hide key" : "Show key"}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div><div className="key-help"><LockKeyhole size={14}/><span>Use a Render API key from your account settings. It stays in this page’s memory and is cleared when you refresh or close the tab.</span></div>{error && <div className="modal-error"><AlertCircle size={15}/>{error}</div>}<button className="button button-primary button-full connect-submit" type="submit" disabled={connecting || !apiKey.trim()}>{connecting ? <><LoaderCircle size={16} className="spin"/> Validating key…</> : <><Zap size={16}/> Validate & connect</>}</button><div className="modal-note">Keys are sent directly from your browser to api.render.com. If Render blocks browser requests due to CORS, this frontend-only approach cannot work without a proxy.</div></form></div></div>}

      {selected && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}><div className="detail-modal"><div className="detail-top"><div className="service-symbol large-symbol"><Server size={19}/></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X size={18}/></button></div><div className="modal-kicker">SERVICE DETAILS</div><h2>{selected.name}</h2><p className="modal-description">{selected.accountName} · {serviceKind(selected)}</p><div className="detail-grid"><div><span>Service ID</span><strong>{selected.id}</strong></div><div><span>Region</span><strong>{selected.serviceDetails?.region || "Not provided"}</strong></div><div><span>Type</span><strong>{selected.type || "Unknown"}</strong></div><div><span>Last updated</span><strong>{relativeTime(selected.updatedAt)}</strong></div><div><span>Plan</span><strong>{selected.serviceDetails?.plan || "—"}</strong></div><div><span>State</span><strong>{selected.suspended === "suspended" ? "Suspended" : "Not marked suspended"}</strong></div></div><div className="detail-note"><TerminalSquare size={16}/><span>Logs, environment variables, and deploy controls are not enabled in this browser-only MVP yet. Open Render to manage this service securely.</span></div><a className="button button-primary button-full detail-open" href={serviceUrl(selected)} target="_blank" rel="noreferrer">Open in Render <ExternalLink size={15}/></a></div></div>}
    </div>
  );
}

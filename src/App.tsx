import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { PasskeyListItem, Session } from "@supabase/supabase-js";
import { formatDate, stars, toCsv } from "./helpers";
import { supabase, type Tasting } from "./supabase";

const Scanner = lazy(() => import("./Scanner"));

type View = "home" | "new" | "history" | "account";
type FormState = {
  ean: string;
  roaster: string;
  name: string;
  origin: string;
  roast: "" | "light" | "medium" | "dark";
  rating: number;
  note: string;
  date: string;
};

const emptyForm = (): FormState => ({
  ean: "",
  roaster: "",
  name: "",
  origin: "",
  roast: "",
  rating: 0,
  note: "",
  date: new Date().toISOString().slice(0, 10),
});

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tastings, setTastings] = useState<Tasting[]>([]);
  const [view, setView] = useState<View>("home");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [knownProductId, setKnownProductId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [passkeys, setPasskeys] = useState<PasskeyListItem[] | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState("");
  const passkeySupported = window.isSecureContext && "PublicKeyCredential" in window;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadTastings = useCallback(async () => {
    const { data, error } = await supabase
      .from("tastings")
      .select("id,rating,tasted_on,note,created_at,product:products(id,ean,roaster,name,origin_country,roast_level)")
      .order("tasted_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) setMessage("Kunde inte hämta kaffeloggen.");
    else setTastings((data ?? []) as unknown as Tasting[]);
  }, []);

  useEffect(() => {
    if (session) loadTastings();
  }, [session, loadTastings]);

  const loadPasskeys = useCallback(async () => {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) {
      setPasskeyMessage("Kunde inte hämta dina passkeys.");
      return false;
    }
    setPasskeys(data);
    return true;
  }, []);

  useEffect(() => {
    if (session) loadPasskeys();
    else setPasskeys(null);
  }, [session, loadPasskeys]);

  const average = useMemo(
    () => tastings.length ? (tastings.reduce((sum, item) => sum + item.rating, 0) / tastings.length).toFixed(1) : "–",
    [tastings],
  );

  function startNew() {
    setForm(emptyForm());
    setKnownProductId(null);
    setMessage("");
    setScannerOpen(true);
  }

  const handleScan = useCallback(async (raw: string) => {
    const ean = raw.replace(/\D/g, "");
    setScannerOpen(false);
    setView("new");
    setBusy(true);
    setMessage("Letar efter kaffet …");
    setForm((current) => ({ ...current, ean }));

    const { data: ownProduct } = await supabase.from("products").select("*").eq("ean", ean).maybeSingle();
    if (ownProduct) {
      setKnownProductId(ownProduct.id);
      setForm((current) => ({
        ...current,
        ean,
        roaster: ownProduct.roaster,
        name: ownProduct.name,
        origin: ownProduct.origin_country ?? "",
        roast: ownProduct.roast_level ?? "",
      }));
      setMessage("Kaffet finns redan i din logg.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,brands,origins,countries`);
      const result = await response.json();
      if (result.status === 1) {
        setForm((current) => ({
          ...current,
          ean,
          roaster: result.product.brands?.split(",")[0]?.trim() ?? "",
          name: result.product.product_name ?? "",
          origin: (result.product.origins || result.product.countries || "").split(",")[0].trim(),
        }));
        setMessage("Vi hittade en produkt. Kontrollera uppgifterna.");
      } else {
        setMessage("Ingen träff – fyll i uppgifterna själv.");
      }
    } catch {
      setMessage("Produktregistret svarar inte. Du kan fylla i manuellt.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function saveTasting(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !/^\d{8,14}$/.test(form.ean) || !form.name.trim() || !form.roaster.trim() || !form.rating) {
      setMessage("Fyll i en giltig streckkod, rosteri, kaffe och betyg.");
      return;
    }
    setBusy(true);
    setMessage("");

    let productId = knownProductId;
    if (!productId) {
      const { data, error } = await supabase
        .from("products")
        .upsert(
          {
            user_id: session.user.id,
            ean: form.ean,
            roaster: form.roaster.trim(),
            name: form.name.trim(),
            origin_country: form.origin.trim() || null,
            roast_level: form.roast || null,
          },
          { onConflict: "user_id,ean" },
        )
        .select("id")
        .single();
      if (error) {
        setBusy(false);
        setMessage("Kunde inte spara kaffet. Försök igen.");
        return;
      }
      productId = data.id;
    }

    const { error } = await supabase.from("tastings").insert({
      user_id: session.user.id,
      product_id: productId,
      rating: form.rating,
      tasted_on: form.date,
      note: form.note.trim() || null,
    });
    setBusy(false);
    if (error) return setMessage("Kunde inte spara smakningen. Försök igen.");

    await loadTastings();
    setView("home");
    setForm(emptyForm());
    setKnownProductId(null);
    setMessage("Smakningen är sparad.");
  }

  function exportCsv() {
    const blob = new Blob([toCsv(tastings)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kaffeloggen-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function registerPasskey() {
    setPasskeyBusy(true);
    setPasskeyMessage("");
    const { error } = await supabase.auth.registerPasskey();
    setPasskeyBusy(false);
    if (error) {
      setPasskeyMessage(error.code === "webauthn_credential_exists" ? "Den här passkeyn är redan registrerad." : "Registreringen avbröts eller misslyckades.");
      return;
    }
    if (await loadPasskeys()) setPasskeyMessage("Passkey skapad – nästa inloggning går utan e-post.");
  }

  async function deletePasskey(passkeyId: string) {
    if (!window.confirm("Ta bort denna passkey? Du kan fortfarande logga in via e-post.")) return;
    setPasskeyBusy(true);
    setPasskeyMessage("");
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    setPasskeyBusy(false);
    if (error) return setPasskeyMessage("Passkeyn kunde inte tas bort.");
    if (await loadPasskeys()) setPasskeyMessage("Passkeyn är borttagen.");
  }

  if (!authReady) return <div className="loading-page"><span className="bean-loader">●</span></div>;
  if (!session) return <Login />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setView("home")}>KAFFE<span>•</span>LOGGEN</button>
        <div className="top-actions">
          <button className="text-button" onClick={exportCsv} disabled={!tastings.length}>Exportera CSV</button>
          <button className="avatar" onClick={() => setView("account")} aria-label="Öppna konto">
            {session.user.email?.slice(0, 1).toUpperCase() ?? "K"}
          </button>
        </div>
      </header>

      <main>
        {view === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">Din personliga kaffehylla</span>
                <h1>Kom ihåg varje<br /><em>riktigt bra</em> kopp.</h1>
                <p>Skanna påsen, sätt ett betyg och bygg din egen smakbank.</p>
                <button className="button primary scan-button" onClick={startNew}>
                  <Icon name="scan" /> Skanna en ny påse
                </button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="sun" />
                <div className="coffee-bag">
                  <span className="bag-top">SMÅ PARTIER</span>
                  <strong>GOD<br />MORGON</strong>
                  <span className="bag-origin">KAFFE / 250 G</span>
                  <i>☕</i>
                </div>
                <span className="scribble">smaka → minns</span>
              </div>
            </section>

            {message && <p className="message success">{message}</p>}

            {passkeySupported && passkeys?.length === 0 && (
              <section className="passkey-prompt">
                <div className="passkey-icon" aria-hidden="true"><Icon name="key" /></div>
                <div><span className="eyebrow">Snabbare nästa gång</span><h2>Logga in med Face ID eller passkey</h2><p>Skapa en passkey på den här enheten. E-post finns kvar som reserv.</p></div>
                <button className="button secondary" onClick={registerPasskey} disabled={passkeyBusy}>{passkeyBusy ? "Öppnar …" : "Skapa passkey"}</button>
              </section>
            )}
            {passkeyMessage && <p className="message info" role="status">{passkeyMessage}</p>}

            <section className="dashboard-grid">
              <div className="recent-section">
                <div className="section-title">
                  <div><span className="eyebrow">Senast provat</span><h2>Dina senaste koppar</h2></div>
                  {tastings.length > 3 && <button className="text-button" onClick={() => setView("history")}>Visa alla →</button>}
                </div>
                {tastings.length ? (
                  <div className="coffee-list">
                    {tastings.slice(0, 3).map((item, index) => <CoffeeCard key={item.id} item={item} index={index} />)}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span>☕</span><h3>Hyllan är tom</h3>
                    <p>Skanna din första kaffepåse för att börja logga.</p>
                  </div>
                )}
              </div>
              <aside className="stats-card">
                <span className="eyebrow">Smakbanken</span>
                <div className="big-stat"><strong>{tastings.length}</strong><span>smakningar</span></div>
                <div className="stat-row"><span>Snittbetyg</span><b>{average} <small>★</small></b></div>
                <div className="stat-row"><span>Olika kaffen</span><b>{new Set(tastings.map((t) => t.product.id)).size}</b></div>
                <div className="steam" aria-hidden="true">〰</div>
              </aside>
            </section>
          </>
        )}

        {view === "new" && (
          <section className="form-page">
            <button className="back-button" onClick={() => setView("home")}>← Tillbaka</button>
            <div className="form-intro"><span className="eyebrow">Ny smakning</span><h1>Hur smakade det?</h1><p>Vi sparar kaffet så att nästa skanning går ännu snabbare.</p></div>
            <form className="coffee-form" onSubmit={saveTasting}>
              <div className="form-section">
                <span className="form-number">01</span><div><h2>Påsen</h2><p>Grunduppgifter om kaffet</p></div>
              </div>
              <div className="field-grid">
                <label>Streckkod *<input required inputMode="numeric" minLength={8} maxLength={14} pattern="[0-9]{8,14}" value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value.replace(/\D/g, "") })} placeholder="EAN / UPC" /></label>
                <label>Rosteriet *<input required value={form.roaster} onChange={(e) => setForm({ ...form, roaster: e.target.value })} placeholder="Till exempel Gringo" /></label>
                <label className="wide">Kaffets namn *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Till exempel Ethiopia Guji" /></label>
                <label>Ursprung<input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Land eller region" /></label>
                <label>Rostning<select value={form.roast} onChange={(e) => setForm({ ...form, roast: e.target.value as FormState["roast"] })}><option value="">Välj nivå</option><option value="light">Ljus</option><option value="medium">Mellan</option><option value="dark">Mörk</option></select></label>
              </div>
              <div className="divider" />
              <div className="form-section">
                <span className="form-number coral">02</span><div><h2>Koppen</h2><p>Din smakning</p></div>
              </div>
              <fieldset className="rating-field"><legend>Betyg *</legend><div className="rating-buttons">{[1, 2, 3, 4, 5].map((rating) => <button type="button" key={rating} className={rating <= form.rating ? "selected" : ""} onClick={() => setForm({ ...form, rating })} aria-label={`${rating} av 5 stjärnor`}>★</button>)}</div></fieldset>
              <div className="field-grid">
                <label>Datum<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
                <label className="wide">Smaknotering<textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Fruktigt, chokladigt, nästa gång grövre malning …" /></label>
              </div>
              {message && <p className={`message ${message.includes("Kunde") || message.includes("Fyll") ? "error" : "info"}`}>{message}</p>}
              <button className="button primary save-button" type="submit" disabled={busy}>{busy ? "Sparar …" : "Spara smakningen"}</button>
            </form>
          </section>
        )}

        {view === "history" && (
          <section className="history-page">
            <div className="history-header"><div><span className="eyebrow">Smakbanken</span><h1>Alla koppar</h1><p>{tastings.length} smakningar, från nyast till äldst.</p></div><button className="button primary" onClick={startNew}><Icon name="scan" /> Skanna nytt</button></div>
            <div className="coffee-list full-list">{tastings.map((item, index) => <CoffeeCard key={item.id} item={item} index={index} />)}</div>
          </section>
        )}

        {view === "account" && (
          <AccountPage
            email={session.user.email ?? ""}
            passkeys={passkeys}
            passkeySupported={passkeySupported}
            busy={passkeyBusy}
            message={passkeyMessage}
            onBack={() => setView("home")}
            onRegister={registerPasskey}
            onDelete={deletePasskey}
            onSignOut={() => {
              setView("home");
              supabase.auth.signOut();
            }}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Huvudmeny">
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Icon name="home" /><span>Hem</span></button>
        <button className="nav-scan" onClick={startNew} aria-label="Skanna ny påse"><Icon name="scan" /></button>
        <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}><Icon name="list" /><span>Historik</span></button>
      </nav>

      {scannerOpen && <Suspense fallback={null}><Scanner onClose={() => setScannerOpen(false)} onScan={handleScan} /></Suspense>}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"email" | "passkey" | null>(null);
  const passkeySupported = window.isSecureContext && "PublicKeyCredential" in window;

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy("email");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split("#")[0] } });
    setBusy(null);
    setMessage(error ? "Inloggningen misslyckades. Kontrollera adressen." : "Klart! Öppna länken vi skickade till din e-post.");
  }

  async function loginWithPasskey() {
    setBusy("passkey");
    setMessage("");
    const { error } = await supabase.auth.signInWithPasskey();
    setBusy(null);
    if (error) setMessage("Passkey-inloggningen avbröts eller misslyckades. Prova igen eller använd e-post.");
  }

  return (
    <main className="login-page">
      <div className="login-brand">KAFFE<span>•</span>LOGGEN</div>
      <section className="login-card">
        <div className="login-illustration" aria-hidden="true"><span>☕</span></div>
        <span className="eyebrow">Välkommen in</span>
        <h1>Din bästa kopp<br />är värd att <em>minnas.</em></h1>
        <p>Logga in med en passkey – eller använd e-post första gången.</p>
        {passkeySupported && (
          <button className="button primary passkey-login" onClick={loginWithPasskey} disabled={busy !== null}>
            <Icon name="key" /> {busy === "passkey" ? "Öppnar …" : "Logga in med passkey"}
          </button>
        )}
        <div className="login-divider"><span>eller med e-post</span></div>
        <form onSubmit={login}>
          <label htmlFor="email">E-postadress</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="du@exempel.se" />
          <button className="button secondary" disabled={busy !== null}>{busy === "email" ? "Skickar …" : "Skicka inloggningslänk"}</button>
        </form>
        {message && <p className={`message ${message.startsWith("Klart") ? "info" : "error"}`} role="status">{message}</p>}
      </section>
      <p className="login-footer">Skannat, smakat, sparat.</p>
    </main>
  );
}

function AccountPage({ email, passkeys, passkeySupported, busy, message, onBack, onRegister, onDelete, onSignOut }: {
  email: string;
  passkeys: PasskeyListItem[] | null;
  passkeySupported: boolean;
  busy: boolean;
  message: string;
  onBack: () => void;
  onRegister: () => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
}) {
  return (
    <section className="account-page" aria-labelledby="account-title">
      <button className="back-button" onClick={onBack}>← Tillbaka</button>
      <div className="account-header">
        <span className="eyebrow">Ditt konto</span>
        <h1 id="account-title">Inloggning och säkerhet</h1>
        <p>{email}</p>
      </div>
      <section className="account-card">
        <div className="account-section-heading">
          <div><h2>Passkeys</h2><p>Logga in med Face ID, fingeravtryck eller enhetens kod.</p></div>
          <button className="button secondary" onClick={onRegister} disabled={busy || !passkeySupported}>{busy ? "Vänta …" : "+ Lägg till"}</button>
        </div>
        {!passkeySupported && <p className="message error">Den här webbläsaren kan inte skapa passkeys. Du kan fortfarande hantera befintliga nycklar.</p>}
        {passkeys === null ? <p className="muted">Hämtar passkeys …</p> : passkeys.length ? (
          <ul className="passkey-list">
            {passkeys.map((passkey) => (
              <li key={passkey.id}>
                <div className="passkey-list-icon"><Icon name="key" /></div>
                <div><strong>{passkey.friendly_name || "Passkey"}</strong><span>Skapad {formatDate(passkey.created_at.slice(0, 10))}{passkey.last_used_at ? ` · Senast använd ${formatDate(passkey.last_used_at.slice(0, 10))}` : ""}</span></div>
                <button className="delete-button" onClick={() => onDelete(passkey.id)} disabled={busy}>Ta bort</button>
              </li>
            ))}
          </ul>
        ) : <div className="no-passkeys"><p>Du har ingen passkey ännu.</p><span>E-postinloggningen fortsätter fungera som vanligt.</span></div>}
        {message && <p className="message info" role="status">{message}</p>}
      </section>
      <button className="text-button sign-out" onClick={onSignOut}>Logga ut</button>
    </section>
  );
}

function CoffeeCard({ item, index }: { item: Tasting; index: number }) {
  const colors = ["ochre", "coral-bg", "sage"];
  const roast = item.product.roast_level === "light" ? "Ljusrost" : item.product.roast_level === "medium" ? "Mellanrost" : item.product.roast_level === "dark" ? "Mörkrost" : "Rostning okänd";
  return (
    <article className="coffee-card">
      <div className={`coffee-mark ${colors[index % colors.length]}`} aria-hidden="true"><span>☕</span></div>
      <div className="coffee-main"><span className="roaster">{item.product.roaster}</span><h3>{item.product.name}</h3><p>{[item.product.origin_country, roast].filter(Boolean).join(" · ")}</p>{item.note && <q>{item.note}</q>}</div>
      <div className="coffee-score"><span aria-label={`${item.rating} av 5`}>{stars(item.rating)}</span><time>{formatDate(item.tasted_on)}</time></div>
    </article>
  );
}

function Icon({ name }: { name: "scan" | "home" | "list" | "key" }) {
  if (name === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>;
  if (name === "list") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
  if (name === "key") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4" /><path d="M12 12h9M17 12v3M20 12v2" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9v6M11 8v8M14 9v6M17 8v8" /></svg>;
}

export default App;

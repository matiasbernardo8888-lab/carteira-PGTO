import { useState, useEffect, useRef, useMemo } from "react";

/* ───────────────────────────────────────────────────────────────
   NEXUS PAY — painel do lojista (protótipo com dados simulados)
   Valores sempre em CENTAVOS. Nada aqui chama API real.
   ─────────────────────────────────────────────────────────────── */

const C = {
  bg: "#1A171E", bg2: "#1A171E", panel: "#1F1C23", line: "#2A282D",
  cyan: "#F6CC60", blue: "#E0A93B", violet: "#B58AF0",
  text: "#fff", dim: "rgba(255,255,255,0.62)", faint: "rgba(255,255,255,0.38)",
  ok: "#27E08B", warn: "#FFB547", bad: "#FF5C6C",
};

const brl = (cents) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/* mesma regra do banco (calc_fee): bps sobre o valor + fixo */
function calcFee(method, amount, installments = 1) {
  if (method === "pix") return Math.ceil((amount * 99) / 10000);
  if (method === "boleto") return 349;
  const bps = 349 + Math.max(installments - 1, 0) * 199;
  return Math.ceil((amount * bps) / 10000) + 39;
}

const METHOD = { pix: "Pix", card: "Cartão", boleto: "Boleto" };
const STATUS = {
  paid: { label: "Pago", color: C.ok },
  pending: { label: "Pendente", color: C.warn },
  failed: { label: "Falhou", color: C.bad },
  expired: { label: "Expirada", color: C.faint },
  refunded: { label: "Reembolsada", color: C.violet },
};

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const seedCharges = [
  { id: "ch_8f3a91c2d4", method: "pix", amount: 14990, customer: "Maria Souza", status: "paid", at: ago(12), desc: "Pedido #1042" },
  { id: "ch_71be04a9e0", method: "card", amount: 32900, installments: 3, customer: "João Lima", status: "paid", at: ago(55), desc: "Curso Avançado" },
  { id: "ch_c20d77b1f5", method: "pix", amount: 8900, customer: "Ana Paula", status: "pending", at: ago(4), desc: "Pedido #1043" },
  { id: "ch_5a9e3318cc", method: "boleto", amount: 49900, customer: "Carlos Mendes", status: "pending", at: ago(180), desc: "Mensalidade" },
  { id: "ch_e4417d0b62", method: "card", amount: 12990, installments: 1, customer: "Beatriz Rocha", status: "failed", at: ago(240), desc: "Pedido #1039" },
  { id: "ch_09d2c6a8b7", method: "pix", amount: 25000, customer: "Rafael Dias", status: "paid", at: ago(400), desc: "Pedido #1038" },
  { id: "ch_b13f8e5470", method: "pix", amount: 6700, customer: "Lúcia Ferraz", status: "expired", at: ago(900), desc: "Pedido #1031" },
  { id: "ch_3c6a2f91d8", method: "card", amount: 89900, installments: 6, customer: "Pedro Alves", status: "refunded", at: ago(1500), desc: "Kit Premium" },
];

const seedLinks = [
  { id: 1, name: "Mentoria 1:1", amount: 29700, methods: ["pix", "card"], slug: "mentoria", sales: 14, active: true },
  { id: 2, name: "Doação livre", amount: null, methods: ["pix"], slug: "apoie", sales: 38, active: true },
  { id: 3, name: "Ebook de Finanças", amount: 4990, methods: ["pix", "card", "boleto"], slug: "ebook", sales: 121, active: false },
];

const seedPayouts = [
  { id: "po_a81c20ff", amount: 200000, fee: 367, status: "completed", at: ago(2880) },
  { id: "po_77de01b3", amount: 85000, fee: 367, status: "completed", at: ago(7200) },
];

const volume = [18, 24, 21, 33, 29, 41, 38, 30, 44, 52, 47, 39, 58, 63].map((v) => v * 1000 * 100 / 10);

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#1A171E;color:#fff;font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
button{font-family:inherit;cursor:pointer}
input,select{font-family:inherit}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.card{background:${C.panel};border:1px solid ${C.line};border-radius:12px;transition:border-color .2s}
.card:hover{border-color:rgba(246,204,96,.22)}
.btn{border:0;border-radius:10px;padding:11px 18px;font-weight:600;font-size:14px;color:#001018;background:linear-gradient(135deg,${C.cyan},${C.blue});transition:transform .15s,box-shadow .15s,opacity .15s}
.btn:hover{transform:translateY(-1px);box-shadow:0 8px 28px rgba(246,204,96,.28)}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.btn2{background:transparent;color:${C.cyan};border:1px solid rgba(246,204,96,.45);border-radius:10px;padding:10px 16px;font-weight:600;font-size:13px;transition:background .15s}
.btn2:hover{background:rgba(246,204,96,.1)}
.ghost{background:transparent;border:1px solid ${C.line};color:${C.dim};border-radius:10px;padding:9px 14px;font-size:13px}
.ghost:hover{color:#fff;border-color:rgba(255,255,255,.2)}
.inp{width:100%;background:rgba(255,255,255,.05);border:1px solid ${C.line};border-radius:10px;color:#fff;padding:11px 13px;font-size:14px;outline:none;transition:border-color .15s}
.inp:focus{border-color:rgba(246,204,96,.55)}
.inp::placeholder{color:${C.faint}}
select.inp option{background:#0F1018}
.lbl{display:block;font-size:12px;color:${C.dim};margin-bottom:6px;font-weight:500}
.chip{border:1px solid ${C.line};background:transparent;color:${C.dim};border-radius:999px;padding:6px 13px;font-size:12px;font-weight:500}
.chip.on{color:${C.cyan};border-color:rgba(246,204,96,.5);background:rgba(246,204,96,.1)}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px}
.badge i{width:6px;height:6px;border-radius:50%;display:inline-block}
.row{display:grid;align-items:center;padding:13px 16px;border-bottom:1px solid ${C.line};font-size:14px}
.row:last-child{border-bottom:0}
.th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${C.faint};font-weight:600}
.fade{animation:fade .35s ease both}
@keyframes fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(246,204,96,.45)}50%{box-shadow:0 0 0 12px rgba(246,204,96,0)}}
@keyframes slideIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}

.app{max-width:480px;margin:0 auto;min-height:100vh;background:${C.bg};position:relative;padding:0 18px 104px}
.top{display:flex;align-items:center;justify-content:space-between;padding:20px 0 16px}
.ico{background:transparent;border:0;color:${C.cyan};width:40px;height:40px;display:grid;place-items:center;border-radius:10px}
.ico:hover{background:rgba(246,204,96,.1)}
.bnav{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;display:flex;justify-content:space-around;align-items:center;padding:14px 12px 20px;background:${C.bg};border-top:1px solid #24212A;z-index:50}
.bnav button{background:transparent;border:0;color:#fff;width:52px;height:44px;display:grid;place-items:center;border-radius:12px}
.bnav button.on{color:${C.cyan}}
.drawer{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.6)}
.drawer>div{width:270px;height:100%;background:${C.bg};border-right:1px solid ${C.line};padding:20px 14px;display:flex;flex-direction:column;gap:4px}
.pill{display:inline-flex;align-items:center;gap:12px;border:0;background:${C.cyan};color:#1A171E;font-weight:600;font-size:16px;border-radius:14px;padding:11px 16px}
.menu{position:absolute;right:0;top:calc(100% + 6px);background:#25222B;border:1px solid ${C.line};border-radius:12px;padding:6px;z-index:20;min-width:100%}
.menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:#fff;padding:10px 12px;border-radius:8px;font-size:14px}
.menu button:hover,.menu button.on{background:rgba(246,204,96,.12);color:${C.cyan}}
.layout{display:grid;grid-template-columns:232px 1fr;min-height:100vh}
.side{position:sticky;top:0;height:100vh;border-right:1px solid ${C.line};background:${C.bg2};padding:20px 14px;display:flex;flex-direction:column;gap:4px}
.nav{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:10px;border:0;background:transparent;color:${C.dim};font-size:14px;font-weight:500;text-align:left;width:100%}
.nav:hover{color:#fff;background:rgba(255,255,255,.04)}
.nav.on{color:${C.cyan};background:rgba(246,204,96,.1)}
.main{padding:28px 32px 64px;max-width:1180px;width:100%}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.grid2{display:grid;grid-template-columns:1.6fr 1fr;gap:14px}
.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;max-width:1120px;margin:0 auto;padding:0 28px;width:100%}
@media(max-width:900px){
 .layout{grid-template-columns:1fr}
 .side{position:fixed;bottom:0;left:0;right:0;top:auto;height:auto;flex-direction:row;overflow-x:auto;padding:8px;z-index:50;border-right:0;border-top:1px solid ${C.line}}
 .side .brand,.side .foot{display:none}
 .nav{flex-direction:column;gap:3px;font-size:10px;padding:8px 10px;min-width:64px;text-align:center}
 .main{padding:20px 16px 96px}
 .grid4{grid-template-columns:1fr 1fr}
 .grid2{grid-template-columns:1fr}
 .hero{grid-template-columns:1fr;gap:28px;padding:24px 20px}
 .hide-m{display:none!important}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/* ───────── Marca ───────── */
function Mark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="NEXUS PAY">
      <defs>
        <linearGradient id="nxg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00E5FF" /><stop offset=".55" stopColor="#0A84FF" /><stop offset="1" stopColor="#6A3DFF" />
        </linearGradient>
      </defs>
      <path d="M256 52 L436 154 V358 L256 460 L76 358 V154 Z" fill="none" stroke="url(#nxg)" strokeWidth="14" strokeLinejoin="round" />
      <path d="M170 350 V166 H212 L300 268 V166 H342 V350 H300 L212 248 V350 Z" fill="url(#nxg)" />
      <circle cx="342" cy="166" r="17" fill="#fff" />
      <circle cx="342" cy="166" r="30" fill="none" stroke="#00E5FF" strokeOpacity=".55" strokeWidth="4" />
    </svg>
  );
}
function Logo({ size = 36 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Mark size={size} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontWeight: 800, letterSpacing: ".06em", fontSize: size * 0.46 }}>NEXUS</div>
        <div style={{ fontWeight: 500, letterSpacing: ".5em", fontSize: size * 0.27, color: C.cyan, marginTop: 3 }}>PAY</div>
      </div>
    </div>
  );
}

/* ───────── Partículas de fundo ───────── */
function Particles() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const fit = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; };
    fit(); window.addEventListener("resize", fit);
    const pts = Array.from({ length: 46 }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.6 + .4, vy: -(Math.random() * .3 + .08), vx: (Math.random() - .5) * .15 }));
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf;
    const tick = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      pts.forEach((p, i) => {
        if (!calm) { p.x += p.vx; p.y += p.vy; if (p.y < 0) { p.y = cv.height; p.x = Math.random() * cv.width; } }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fillStyle = "rgba(246,204,96,.55)"; ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(p.x - pts[j].x, p.y - pts[j].y);
          if (d < 110) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pts[j].x, pts[j].y); ctx.strokeStyle = `rgba(246,204,96,${.08 * (1 - d / 110)})`; ctx.stroke(); }
        }
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, []);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

/* ───────── ENTRADA ───────── */
function Entry({ onEnter }) {
  const [mode, setMode] = useState("cta");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [tried, setTried] = useState(false);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const passOk = pass.length >= 8;
  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", overflow: "hidden", background: "radial-gradient(900px 500px at 78% 20%,rgba(246,204,96,.10),transparent 60%),#1A171E" }}>
      <Particles />
      <div className="hero" style={{ position: "relative", gridTemplateColumns: "1fr", maxWidth: 900, textAlign: "center" }}>
        <div className="fade">
          <div style={{ display: "flex", justifyContent: "center" }}><Logo size={46} /></div>
          <h1 style={{ fontSize: "clamp(32px,4.6vw,52px)", lineHeight: 1.05, fontWeight: 800, letterSpacing: "-.03em", margin: "34px 0 18px" }}>
            Receba por Pix, cartão e boleto<br />
            <span style={{ background: `linear-gradient(90deg,${C.cyan},${C.blue},${C.violet})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>com uma única API.</span>
          </h1>
          <p style={{ color: C.dim, fontSize: 17, lineHeight: 1.6, maxWidth: 520, margin: "0 auto 30px" }}>
            Crie cobranças, acompanhe cada centavo no extrato e saque quando quiser. Taxas claras, webhooks assinados e painel completo.
          </p>

          {mode === "cta" ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="btn" style={{ padding: "14px 26px", fontSize: 15 }} onClick={() => setMode("signup")}>Criar conta grátis</button>
              <button className="btn2" style={{ padding: "13px 22px", fontSize: 14 }} onClick={() => setMode("login")}>Entrar</button>
            </div>
          ) : (
            <form className="card fade" style={{ padding: 20, maxWidth: 400, margin: "0 auto", textAlign: "left" }} noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (emailOk && passOk) onEnter(mode); }}>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 14 }}>{mode === "signup" ? "Criar conta" : "Entrar"}</div>
              <label className="lbl" htmlFor="em">E-mail</label>
              <input id="em" className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" aria-invalid={tried && !emailOk} />
              {tried && !emailOk && <div role="alert" style={{ color: C.bad, fontSize: 12, marginTop: 6 }}>Informe um e-mail válido, como voce@empresa.com.br.</div>}
              <label className="lbl" htmlFor="pw" style={{ marginTop: 12 }}>Senha</label>
              <input id="pw" className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Mínimo de 8 caracteres" autoComplete={mode === "signup" ? "new-password" : "current-password"} aria-invalid={tried && !passOk} />
              <div role={tried && !passOk ? "alert" : undefined} style={{ fontSize: 12, marginTop: 6, color: tried && !passOk ? C.bad : passOk ? C.ok : C.faint }}>
                {passOk ? "Senha ok ✓" : tried ? `A senha precisa ter pelo menos 8 caracteres (você digitou ${pass.length}).` : "Mínimo de 8 caracteres."}
              </div>
              <button className="btn" type="submit" style={{ width: "100%", marginTop: 16 }}>{mode === "signup" ? "Continuar" : "Entrar no painel"}</button>
              <button type="button" className="ghost" style={{ width: "100%", marginTop: 8, border: 0 }} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
                {mode === "signup" ? "Já tenho conta" : "Ainda não tenho conta"}
              </button>
            </form>
          )}
          <div style={{ display: "flex", gap: 22, marginTop: 34, color: C.faint, fontSize: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <span>Pix · Cartão · Boleto</span><span>Webhooks com HMAC</span><span>Ledger auditável</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── ONBOARDING / KYC ───────── */
function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ type: "cnpj", doc: "", name: "", segment: "", rep: "", cpf: "", birth: "", bank: "260", agency: "", acc: "", pix: "" });
  const [docs, setDocs] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const steps = ["Empresa", "Responsável", "Conta para saque", "Documentos"];
  const digits = (v) => v.replace(/\D/g, "").length;
  const [showErr, setShowErr] = useState(false);
  const missing = [
    [digits(f.doc) < 11 && `${f.type === "cnpj" ? "CNPJ" : "CPF"} (pelo menos 11 números)`, !f.name.trim() && (f.type === "cnpj" ? "Razão social" : "Nome completo"), !f.segment && "O que você vende"],
    [!f.rep.trim() && "Nome do responsável", digits(f.cpf) < 11 && "CPF (11 números)", !f.birth && "Data de nascimento"],
    [!f.agency.trim() && "Agência", !f.acc.trim() && "Conta com dígito"],
    [docs.length < 2 && `Documentos: envie pelo menos 2 (${docs.length}/2)`],
  ][step].filter(Boolean);
  const toggleDoc = (d) => setDocs(docs.includes(d) ? docs.filter((x) => x !== d) : [...docs, d]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", padding: "36px 20px", background: "radial-gradient(700px 400px at 50% 0,rgba(246,204,96,.08),transparent 60%),#1A171E" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <Logo size={34} />
        <div style={{ display: "flex", gap: 6, margin: "30px 0 8px" }} role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1}>
          {steps.map((s, i) => <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? `linear-gradient(90deg,${C.cyan},${C.blue})` : C.line }} />)}
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginBottom: 18 }}>Etapa {step + 1} de 4 · {steps[step]}</div>

        <div className="card fade" key={step} style={{ padding: 24 }}>
          {step === 0 && <>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>Dados da empresa</h2>
            <p style={{ color: C.dim, fontSize: 14, marginBottom: 18 }}>Precisamos validar quem recebe os pagamentos.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["cnpj", "cpf"].map((t) => <button type="button" key={t} className={`chip ${f.type === t ? "on" : ""}`} onClick={() => setF({ ...f, type: t })}>{t === "cnpj" ? "Empresa (CNPJ)" : "Pessoa física (CPF)"}</button>)}
            </div>
            <label className="lbl" htmlFor="d">{f.type === "cnpj" ? "CNPJ" : "CPF"}</label>
            <input id="d" className="inp" value={f.doc} onChange={set("doc")} placeholder="Somente números" inputMode="numeric" />
            <label className="lbl" htmlFor="n" style={{ marginTop: 12 }}>{f.type === "cnpj" ? "Razão social" : "Nome completo"}</label>
            <input id="n" className="inp" value={f.name} onChange={set("name")} />
            <label className="lbl" htmlFor="s" style={{ marginTop: 12 }}>O que você vende?</label>
            <select id="s" className="inp" value={f.segment} onChange={set("segment")}>
              <option value="">Selecione</option><option>Infoprodutos e cursos</option><option>E-commerce</option><option>Serviços</option><option>SaaS / assinatura</option><option>Outro</option>
            </select>
          </>}
          {step === 1 && <>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>Responsável legal</h2>
            <p style={{ color: C.dim, fontSize: 14, marginBottom: 18 }}>Pessoa que responde pela conta.</p>
            <label className="lbl" htmlFor="r">Nome completo</label>
            <input id="r" className="inp" value={f.rep} onChange={set("rep")} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div><label className="lbl" htmlFor="c">CPF</label><input id="c" className="inp" value={f.cpf} onChange={set("cpf")} inputMode="numeric" /></div>
              <div><label className="lbl" htmlFor="b">Nascimento</label><input id="b" className="inp" type="date" value={f.birth} onChange={set("birth")} /></div>
            </div>
          </>}
          {step === 2 && <>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>Conta para receber saques</h2>
            <p style={{ color: C.dim, fontSize: 14, marginBottom: 18 }}>A conta precisa estar no mesmo CPF/CNPJ do cadastro.</p>
            <label className="lbl" htmlFor="bk">Banco</label>
            <select id="bk" className="inp" value={f.bank} onChange={set("bank")}>
              <option value="260">Nu Pagamentos (260)</option><option value="341">Itaú (341)</option><option value="237">Bradesco (237)</option><option value="001">Banco do Brasil (001)</option><option value="104">Caixa (104)</option><option value="077">Inter (077)</option>
            </select>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12, marginTop: 12 }}>
              <div><label className="lbl" htmlFor="ag">Agência</label><input id="ag" className="inp" value={f.agency} onChange={set("agency")} inputMode="numeric" /></div>
              <div><label className="lbl" htmlFor="ac">Conta com dígito</label><input id="ac" className="inp" value={f.acc} onChange={set("acc")} /></div>
            </div>
            <label className="lbl" htmlFor="px" style={{ marginTop: 12 }}>Chave Pix (opcional)</label>
            <input id="px" className="inp" value={f.pix} onChange={set("pix")} />
          </>}
          {step === 3 && <>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>Documentos</h2>
            <p style={{ color: C.dim, fontSize: 14, marginBottom: 18 }}>Envie pelo menos 2. (Neste protótipo, tocar marca como enviado.)</p>
            {["Documento com foto (frente)", "Documento com foto (verso)", "Selfie segurando o documento", "Comprovante de endereço", ...(f.type === "cnpj" ? ["Cartão CNPJ", "Contrato social"] : [])].map((d) => (
              <button type="button" key={d} onClick={() => toggleDoc(d)} aria-pressed={docs.includes(d)}
                style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "13px 14px", marginBottom: 8, borderRadius: 10, background: docs.includes(d) ? "rgba(39,224,139,.08)" : "rgba(255,255,255,.04)", border: `1px solid ${docs.includes(d) ? "rgba(39,224,139,.4)" : C.line}`, color: "#fff", fontSize: 14, textAlign: "left" }}>
                <span>{d}</span><span style={{ color: docs.includes(d) ? C.ok : C.faint }}>{docs.includes(d) ? "Enviado ✓" : "Enviar"}</span>
              </button>
            ))}
          </>}
          {showErr && missing.length > 0 && <div role="alert" style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: "rgba(255,92,108,.08)", border: "1px solid rgba(255,92,108,.35)", color: C.bad, fontSize: 13, lineHeight: 1.5 }}>Falta preencher: {missing.join(", ")}.</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            {step > 0 && <button type="button" className="ghost" onClick={() => { setShowErr(false); setStep(step - 1); }}>Voltar</button>}
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => { if (missing.length) { setShowErr(true); return; } setShowErr(false); if (step < 3) setStep(step + 1); else onDone(f.name, true); }}>
              {step < 3 ? "Continuar" : "Enviar para análise"}
            </button>
          </div>
        </div>
        <button type="button" className="ghost" style={{ width: "100%", marginTop: 14, border: 0 }} onClick={() => onDone(f.name.trim(), false)}>Preencher depois e ir para o painel (modo teste)</button>
      </div>
    </div>
  );
}

/* ───────── Componentes de UI ───────── */
function Status({ s }) {
  const m = STATUS[s];
  return <span className="badge" style={{ color: m.color, background: m.color + "1f" }}><i style={{ background: m.color }} />{m.label}</span>;
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="th">{label}</div>
      <div className="mono" style={{ fontSize: 24, fontWeight: 500, margin: "8px 0 2px", color: accent || "#fff", letterSpacing: "-.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.faint }}>{sub}</div>}
    </div>
  );
}

function Head({ title, sub, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
      <div><h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{title}</h1>{sub && <p style={{ color: C.dim, fontSize: 14, marginTop: 4 }}>{sub}</p>}</div>
      {action}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}>
      <div className="card fade" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, padding: 24, maxHeight: "92vh", overflowY: "auto", background: "#0C0E16" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 19 }}>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Fechar" style={{ padding: "4px 10px" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* QR simulado: padrão determinístico, NÃO é um Pix válido */
function FakeQR({ seed }) {
  const n = 25;
  const cells = useMemo(() => {
    let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const out = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      h = (h * 1664525 + 1013904223) >>> 0;
      out.push((h >>> 28) % 2 === 0);
    }
    return out;
  }, [seed]);
  const inFinder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([ox, oy]) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7);
  const finderOn = (x, y) => { const [ox, oy] = [[0, 0], [n - 7, 0], [0, n - 7]].find(([a, b]) => x >= a && x < a + 7 && y >= b && y < b + 7); const lx = x - ox, ly = y - oy; const edge = lx === 0 || lx === 6 || ly === 0 || ly === 6; const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4; return edge || core; };
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width="176" height="176" style={{ background: "#fff", padding: 8, borderRadius: 12 }} role="img" aria-label="QR Code de exemplo">
      {cells.map((on, i) => { const x = i % n, y = Math.floor(i / n); const v = inFinder(x, y) ? finderOn(x, y) : on; return v ? <rect key={i} x={x} y={y} width="1" height="1" fill="#000" /> : null; })}
    </svg>
  );
}

/* gráficos */
function Bars({ data }) {
  const max = Math.max(...data);
  return (
    <svg viewBox="0 0 420 150" width="100%" role="img" aria-label="Volume pago por dia nos últimos 14 dias">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.cyan} /><stop offset="1" stopColor={C.blue} stopOpacity=".35" /></linearGradient></defs>
      {data.map((v, i) => { const h = (v / max) * 120; return <rect key={i} x={i * 30 + 6} y={130 - h} width="18" height={h} rx="4" fill="url(#bg)" opacity={i === data.length - 1 ? 1 : .75} />; })}
      <line x1="0" y1="130.5" x2="420" y2="130.5" stroke={C.line} />
      <text x="6" y="146" fill={C.faint} fontSize="9">14 dias atrás</text>
      <text x="414" y="146" fill={C.faint} fontSize="9" textAnchor="end">hoje</text>
    </svg>
  );
}

function Donut({ parts }) {
  const total = parts.reduce((s, p) => s + p.v, 0);
  let acc = 0; const r = 46, c = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Volume por método de pagamento">
        <circle cx="60" cy="60" r={r} fill="none" stroke={C.line} strokeWidth="14" />
        {parts.map((p) => { const len = (p.v / total) * c; const el = <circle key={p.k} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 60 60)" />; acc += len; return el; })}
      </svg>
      <div style={{ display: "grid", gap: 9, flex: 1 }}>
        {parts.map((p) => (
          <div key={p.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: C.dim }}><i style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />{p.k}</span>
            <span className="mono">{Math.round((p.v / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── ÍCONES (traço, 24px) ───────── */
const I = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  home: <path d="M3.5 11 12 3.5 20.5 11V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1V11Z" />,
  box: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  growth: <><path d="M4 20V10M10 20V4M16 20v-7" /><path d="M3 20h18" /><circle cx="19" cy="7" r="3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A9.5 9.5 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  chev: <path d="m6 9 6 6 6-6" />,
};
function Ico({ n, size = 26, sw = 1.9 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>;
}

/* gráfico de área dourado (igual ao print) */
function Area({ data }) {
  const W = 400, H = 330, L = 44, R = 12, T = 14, B = 16;
  const m = Math.max(...data, 0.01);
  const raw = (m * 1.12) / 4, pw = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pw).find((v) => v >= raw);
  const top = step * 4;
  const x = (i) => L + (i * (W - L - R)) / (data.length - 1);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const pts = data.map((v, i) => [x(i), y(v)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  const area = `${d} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z`;
  const ticks = [4, 3, 2, 1].map((k) => k * step);
  const mi = data.indexOf(m);
  const fmt = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Faturamento líquido no período" style={{ display: "block" }}>
      <defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D9B054" /><stop offset=".55" stopColor="#67552D" /><stop offset="1" stopColor="#1F1B1B" /></linearGradient></defs>
      {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#322F36" />)}
      {data.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="#3A373F" strokeOpacity=".7" />)}
      {ticks.map((t) => <text key={"t" + t} x={L - 8} y={y(t) + 4} fill="#fff" fontSize="12" textAnchor="end">{fmt(t)}</text>)}
      <path d={area} fill="url(#gold)" />
      <path d={d} fill="none" stroke="#F6CC60" strokeWidth="3" strokeLinecap="round" />
      {[mi, data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r="6" fill="#1A171E" stroke="#F6CC60" strokeWidth="2.5" />)}
    </svg>
  );
}

/* ───────── DASHBOARD (réplica do print) ───────── */
const PERIODS = { "7d": ["Últimos 7 dias", 7], "30d": ["Últimos 30 dias", 10], "3m": ["Últimos 3 meses", 7] };
function Overview({ charges, balance }) {
  const [period, setPeriod] = useState("3m");
  const [hide, setHide] = useState(false);
  const [dd, setDd] = useState(false);
  const net = charges.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount - calcFee(c.method, c.amount, c.installments), 0);
  const [label, n] = PERIODS[period];
  const w = volume.slice(-n), sum = w.reduce((a, b) => a + b, 0);
  const series = w.map((v) => ((v / sum) * net) / 100);
  const mask = (v) => (hide ? "R$ ••••" : brl(v));
  const card = (lbl, v) => (
    <div className="card" style={{ padding: "16px 14px 14px", position: "relative", background: "#1F1C23" }}>
      <button onClick={() => setHide(!hide)} aria-label={hide ? "Mostrar valores" : "Ocultar valores"} style={{ position: "absolute", top: 12, right: 10, background: "transparent", border: 0, color: "#8C8A90", display: "grid" }}><Ico n={hide ? "eyeoff" : "eye"} size={20} sw={1.7} /></button>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.01em", marginTop: 8 }}>{mask(v)}</div>
      <div style={{ fontSize: 14, color: "#B9B7BD", marginTop: 6 }}>{lbl}</div>
    </div>
  );
  return (
    <div className="fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 31, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.02em" }}>Dashboard</h1>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#8C8A90", marginTop: 8 }}>Total vendido</div>
        </div>
        <div style={{ position: "relative" }}>
          <button className="pill" aria-haspopup="listbox" aria-expanded={dd} onClick={() => setDd(!dd)}>{label}<Ico n="chev" size={18} sw={2.6} /></button>
          {dd && <div className="menu" role="listbox">{Object.entries(PERIODS).map(([k, [l]]) => <button key={k} role="option" aria-selected={k === period} className={k === period ? "on" : ""} onClick={() => { setPeriod(k); setDd(false); }}>{l}</button>)}</div>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 26 }}>
        {card("Saldo disponível", balance.available)}
        {card("Saldo pendente", balance.pending)}
      </div>
      <div style={{ textAlign: "center", margin: "36px 0 22px" }}>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-.02em" }}>{mask(net)}</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: "#B9B7BD", marginTop: 6 }}>Faturamento Liquido</div>
      </div>
      <Area data={series} />
    </div>
  );
}

/* ───────── COBRANÇAS ───────── */
function NewChargeModal({ onClose, onCreate }) {
  const [method, setMethod] = useState("pix");
  const [amount, setAmount] = useState("");
  const [inst, setInst] = useState(1);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [created, setCreated] = useState(null);
  const cents = Math.round(parseFloat(amount.replace(/\./g, "").replace(",", ".")) * 100) || 0;
  const fee = cents >= 100 ? calcFee(method, cents, inst) : 0;
  const ok = cents >= 100 && name.trim();

  if (created) return (
    <Modal title="Cobrança criada" onClose={onClose}>
      <div style={{ textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 28, marginBottom: 4 }}>{brl(created.amount)}</div>
        <div style={{ color: C.dim, fontSize: 13, marginBottom: 18 }}>{created.customer} · {METHOD[created.method]} · <span className="mono">{created.id}</span></div>
        {created.method === "pix" && <><div style={{ display: "flex", justifyContent: "center" }}><FakeQR seed={created.id} /></div>
          <div className="mono" style={{ marginTop: 14, padding: 10, borderRadius: 8, background: "rgba(255,255,255,.05)", fontSize: 11, color: C.dim, wordBreak: "break-all" }}>00020126…{created.id}…6304ABCD</div>
          <p style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>QR e código de exemplo — não é um Pix real.</p></>}
        {created.method === "boleto" && <div className="mono" style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,.05)", fontSize: 12, color: C.dim }}>23793.38128 60000.000003 00000.000408 1 00000000{String(created.amount).padStart(6, "0")}</div>}
        {created.method === "card" && <p style={{ color: C.dim, fontSize: 14 }}>Link de checkout gerado para o cliente informar o cartão com segurança.</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="btn2" style={{ flex: 1 }} onClick={() => { onCreate(created.id, "simulate"); onClose(); }}>Simular pagamento</button>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  );

  return (
    <Modal title="Nova cobrança" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {Object.keys(METHOD).map((m) => <button key={m} type="button" className={`chip ${method === m ? "on" : ""}`} onClick={() => setMethod(m)}>{METHOD[m]}</button>)}
      </div>
      <label className="lbl" htmlFor="am">Valor (R$)</label>
      <input id="am" className="inp mono" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" style={{ fontSize: 20 }} />
      {method === "card" && <><label className="lbl" htmlFor="in" style={{ marginTop: 12 }}>Parcelas</label>
        <select id="in" className="inp" value={inst} onChange={(e) => setInst(+e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}x</option>)}</select></>}
      <label className="lbl" htmlFor="cn" style={{ marginTop: 12 }}>Cliente</label>
      <input id="cn" className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" />
      <label className="lbl" htmlFor="ds" style={{ marginTop: 12 }}>Descrição</label>
      <input id="ds" className="inp" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Pedido #1044" />
      <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "rgba(255,255,255,.04)", display: "grid", gap: 7, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.dim }}>Taxa</span><span className="mono">{brl(fee)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}><span>Você recebe</span><span className="mono" style={{ color: C.ok }}>{brl(Math.max(cents - fee, 0))}</span></div>
      </div>
      <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={!ok} onClick={() => {
        const c = { id: "ch_" + Math.random().toString(16).slice(2, 12), method, amount: cents, installments: inst, customer: name.trim(), status: "pending", at: new Date().toISOString(), desc: desc || "Cobrança avulsa" };
        onCreate(c); setCreated(c);
      }}>Criar cobrança</button>
    </Modal>
  );
}

function Charges({ charges, onCreate, autoOpen }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(!!autoOpen);
  const [sel, setSel] = useState(null);
  const list = filter === "all" ? charges : charges.filter((c) => c.status === filter);
  const detail = charges.find((c) => c.id === sel);
  return (
    <div className="fade">
      <Head title="Cobranças" sub={`${charges.length} no total`} action={<button className="btn" onClick={() => setOpen(true)}>+ Nova cobrança</button>} />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["all", "Todas"], ["paid", "Pagas"], ["pending", "Pendentes"], ["failed", "Falhas"], ["expired", "Expiradas"], ["refunded", "Reembolsadas"]].map(([k, l]) =>
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row th" style={{ gridTemplateColumns: "1.5fr .7fr .9fr .9fr .9fr" }}><span>Cliente</span><span>Método</span><span>Status</span><span className="hide-m">Data</span><span style={{ textAlign: "right" }}>Valor</span></div>
        {list.length === 0 && <div style={{ padding: 36, textAlign: "center", color: C.dim }}>Nenhuma cobrança com esse status.</div>}
        {list.map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className="row" style={{ gridTemplateColumns: "1.5fr .7fr .9fr .9fr .9fr", width: "100%", background: "transparent", border: 0, borderBottom: `1px solid ${C.line}`, color: "#fff", textAlign: "left" }}>
            <div><div style={{ fontWeight: 600 }}>{c.customer}</div><div className="mono" style={{ fontSize: 11, color: C.faint }}>{c.id}</div></div>
            <span style={{ color: C.dim }}>{METHOD[c.method]}{c.installments > 1 ? ` ${c.installments}x` : ""}</span>
            <Status s={c.status} />
            <span className="hide-m" style={{ color: C.dim, fontSize: 13 }}>{dt(c.at)}</span>
            <span className="mono" style={{ textAlign: "right" }}>{brl(c.amount)}</span>
          </button>
        ))}
      </div>
      {open && <NewChargeModal onClose={() => setOpen(false)} onCreate={onCreate} />}
      {detail && (
        <Modal title="Detalhe da cobrança" onClose={() => setSel(null)}>
          <div className="mono" style={{ fontSize: 26, marginBottom: 6 }}>{brl(detail.amount)}</div>
          <Status s={detail.status} />
          <div style={{ display: "grid", gap: 10, marginTop: 18, fontSize: 14 }}>
            {[["ID", detail.id], ["Cliente", detail.customer], ["Descrição", detail.desc], ["Método", METHOD[detail.method]], ["Taxa", brl(calcFee(detail.method, detail.amount, detail.installments))], ["Líquido", brl(detail.amount - calcFee(detail.method, detail.amount, detail.installments))], ["Criada em", dt(detail.at)]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: C.dim }}>{k}</span><span className={k === "ID" ? "mono" : ""} style={{ textAlign: "right" }}>{v}</span></div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            {detail.status === "pending" && <button className="btn2" style={{ flex: 1 }} onClick={() => { onCreate(detail.id, "simulate"); setSel(null); }}>Simular pagamento</button>}
            {detail.status === "paid" && <button className="btn2" style={{ flex: 1 }} onClick={() => { onCreate(detail.id, "refund"); setSel(null); }}>Reembolsar</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ───────── LINKS DE PAGAMENTO ───────── */
function Links({ links, setLinks }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(""); const [a, setA] = useState(""); const [m, setM] = useState(["pix", "card"]);
  const tm = (k) => setM(m.includes(k) ? m.filter((x) => x !== k) : [...m, k]);
  const cents = a ? Math.round(parseFloat(a.replace(/\./g, "").replace(",", ".")) * 100) : null;
  const slug = n.toLowerCase().normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  return (
    <div className="fade">
      <Head title="Links de pagamento" sub="Cobre sem escrever código." action={<button className="btn" onClick={() => setOpen(true)}>+ Novo link</button>} />
      <div style={{ display: "grid", gap: 12 }}>
        {links.map((l) => (
          <div key={l.id} className="card" style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{l.name}</div>
              <div className="mono" style={{ fontSize: 12, color: C.cyan, margin: "4px 0" }}>pay.nexuspay.com.br/{l.slug}</div>
              <div style={{ fontSize: 12, color: C.faint }}>{l.methods.map((x) => METHOD[x]).join(" · ")} · {l.sales} vendas</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="mono">{l.amount ? brl(l.amount) : "Valor aberto"}</div>
              <button className={`chip ${l.active ? "on" : ""}`} onClick={() => setLinks(links.map((x) => x.id === l.id ? { ...x, active: !x.active } : x))} aria-pressed={l.active}>{l.active ? "Ativo" : "Pausado"}</button>
            </div>
          </div>
        ))}
      </div>
      {open && <Modal title="Novo link de pagamento" onClose={() => setOpen(false)}>
        <label className="lbl" htmlFor="ln">Nome do produto</label>
        <input id="ln" className="inp" value={n} onChange={(e) => setN(e.target.value)} />
        <label className="lbl" htmlFor="la" style={{ marginTop: 12 }}>Valor (deixe vazio para valor aberto)</label>
        <input id="la" className="inp mono" value={a} onChange={(e) => setA(e.target.value)} placeholder="0,00" />
        <div className="lbl" style={{ marginTop: 12 }}>Métodos aceitos</div>
        <div style={{ display: "flex", gap: 8 }}>{Object.keys(METHOD).map((k) => <button key={k} type="button" className={`chip ${m.includes(k) ? "on" : ""}`} onClick={() => tm(k)} aria-pressed={m.includes(k)}>{METHOD[k]}</button>)}</div>
        <button className="btn" style={{ width: "100%", marginTop: 18 }} disabled={!n.trim() || m.length === 0} onClick={() => { setLinks([{ id: Date.now(), name: n.trim(), amount: cents, methods: m, slug: slug || "link", sales: 0, active: true }, ...links]); setOpen(false); setN(""); setA(""); }}>Criar link</button>
      </Modal>}
    </div>
  );
}

/* ───────── SALDO E SAQUES ───────── */
function Balance({ balance, payouts, onPayout, kyc, setKyc }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const cents = Math.round(parseFloat(v.replace(/\./g, "").replace(",", ".")) * 100) || 0;
  const FEE = 367;
  const err = cents < 1000 ? "Valor mínimo de R$ 10,00." : cents + FEE > balance.available ? "Saldo disponível insuficiente (inclui a taxa de saque)." : "";
  return (
    <div className="fade">
      <Head title="Saldo e saques" sub="Cada movimento fica registrado no extrato." action={<button className="btn" disabled={kyc !== "approved"} onClick={() => setOpen(true)}>Solicitar saque</button>} />
      {kyc !== "approved" && <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: "rgba(255,181,71,.35)", color: C.warn, fontSize: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span>Saques ficam disponíveis após a aprovação do cadastro.</span>
        <button className="btn2" onClick={() => setKyc("approved")}>Simular aprovação (demo)</button></div>}
      <div className="grid4" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 14 }}>
        <Stat label="Disponível" value={brl(balance.available)} accent={C.ok} sub="Pode sacar agora" />
        <Stat label="A liberar" value={brl(balance.pending)} sub="Cartão: D+30" />
        <Stat label="Bloqueado" value={brl(balance.blocked)} sub="Reserva por disputas" />
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="th" style={{ padding: "16px 16px 4px" }}>Histórico de saques</div>
        {payouts.map((p) => (
          <div key={p.id} className="row" style={{ gridTemplateColumns: "1.3fr 1fr 1fr 1fr" }}>
            <span className="mono" style={{ fontSize: 12, color: C.dim }}>{p.id}</span>
            <span style={{ color: C.dim, fontSize: 13 }}>{dt(p.at)}</span>
            <span className="badge" style={{ color: p.status === "completed" ? C.ok : C.warn, background: (p.status === "completed" ? C.ok : C.warn) + "1f", width: "fit-content" }}>{p.status === "completed" ? "Concluído" : "Processando"}</span>
            <span className="mono" style={{ textAlign: "right" }}>− {brl(p.amount)}<div style={{ fontSize: 11, color: C.faint }}>taxa {brl(p.fee)}</div></span>
          </div>
        ))}
      </div>
      {open && <Modal title="Solicitar saque" onClose={() => setOpen(false)}>
        <div style={{ color: C.dim, fontSize: 13, marginBottom: 14 }}>Disponível: <span className="mono" style={{ color: C.ok }}>{brl(balance.available)}</span> · Taxa por saque: {brl(FEE)}</div>
        <label className="lbl" htmlFor="pv">Valor (R$)</label>
        <input id="pv" className="inp mono" style={{ fontSize: 20 }} value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" inputMode="decimal" />
        {v && err && <div role="alert" style={{ color: C.bad, fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ fontSize: 13, color: C.dim, marginTop: 14 }}>Destino: conta cadastrada no onboarding (Pix).</div>
        <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={!!err} onClick={() => { onPayout(cents, FEE); setOpen(false); setV(""); }}>Confirmar saque</button>
      </Modal>}
    </div>
  );
}

/* ───────── DESENVOLVEDORES ───────── */
function Developers({ kyc }) {
  const [keys, setKeys] = useState([{ id: 1, name: "Loja principal", mode: "test", prefix: "sk_test_9f3a…", last: "há 2 min" }]);
  const [shown, setShown] = useState(null);
  const [hooks, setHooks] = useState([
    { id: 1, ev: "charge.paid", code: 200, at: ago(12), ok: true },
    { id: 2, ev: "charge.created", code: 200, at: ago(14), ok: true },
    { id: 3, ev: "charge.paid", code: 500, at: ago(55), ok: false },
  ]);
  const mk = (mode) => {
    const raw = `sk_${mode}_` + Array.from({ length: 24 }, () => "abcdef0123456789"[Math.floor(Math.random() * 16)]).join("");
    setKeys([{ id: Date.now(), name: "Nova chave", mode, prefix: raw.slice(0, 12) + "…", last: "nunca" }, ...keys]); setShown(raw);
  };
  return (
    <div className="fade">
      <Head title="Desenvolvedores" sub="Chaves, webhooks e exemplos de integração." />
      <div className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div className="th">Chaves de API</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn2" onClick={() => mk("test")}>+ Chave de teste</button>
            <button className="btn2" disabled={kyc !== "approved"} style={kyc !== "approved" ? { opacity: .4, cursor: "not-allowed" } : {}} onClick={() => mk("live")}>+ Chave de produção</button>
          </div>
        </div>
        {shown && <div role="status" style={{ padding: 12, borderRadius: 10, background: "rgba(39,224,139,.08)", border: "1px solid rgba(39,224,139,.35)", marginBottom: 12, fontSize: 13 }}>
          Copie agora — ela não será mostrada de novo:<div className="mono" style={{ marginTop: 6, wordBreak: "break-all", color: C.ok }}>{shown}</div>
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => setShown(null)}>Já copiei</button></div>}
        {keys.map((k) => (
          <div key={k.id} className="row" style={{ gridTemplateColumns: "1.2fr 1.3fr .7fr 1fr", padding: "10px 0" }}>
            <span>{k.name}</span><span className="mono" style={{ color: C.dim, fontSize: 13 }}>{k.prefix}</span>
            <span className="badge" style={{ color: k.mode === "live" ? C.ok : C.warn, background: (k.mode === "live" ? C.ok : C.warn) + "1f", width: "fit-content" }}>{k.mode === "live" ? "Produção" : "Teste"}</span>
            <span style={{ color: C.faint, fontSize: 12, textAlign: "right" }}>Usada {k.last}</span>
          </div>
        ))}
        {kyc !== "approved" && <p style={{ color: C.faint, fontSize: 12, marginTop: 10 }}>Chaves de produção são liberadas após a aprovação do cadastro.</p>}
      </div>
      <div className="grid2">
        <div className="card" style={{ padding: 20 }}>
          <div className="th" style={{ marginBottom: 12 }}>Criar cobrança Pix (Node.js)</div>
          <pre className="mono" style={{ fontSize: 12, lineHeight: 1.7, color: C.dim, overflowX: "auto", padding: 14, borderRadius: 10, background: "rgba(0,0,0,.55)", border: `1px solid ${C.line}` }}>
{`const res = await fetch(
  "https://api.nexuspay.com.br/v1/charges", {
  method: "POST",
  headers: {
    Authorization: "Bearer sk_test_...",
    "Idempotency-Key": crypto.randomUUID(),
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: 14990,          // centavos
    method: "pix",
    customer: { name: "Maria Souza" },
  }),
});`}
          </pre>
        </div>
        <div className="card" style={{ padding: 20 }}>
          <div className="th" style={{ marginBottom: 12 }}>Entregas de webhook</div>
          {hooks.map((h) => (
            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
              <div><div className="mono">{h.ev}</div><div style={{ fontSize: 11, color: C.faint }}>{dt(h.at)}</div></div>
              {h.ok ? <span style={{ color: C.ok }} className="mono">{h.code}</span>
                : <button className="btn2" style={{ padding: "4px 10px", fontSize: 12, color: C.bad, borderColor: "rgba(255,92,108,.5)" }} onClick={() => setHooks(hooks.map((x) => x.id === h.id ? { ...x, ok: true, code: 200 } : x))}>{h.code} · Reenviar</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── APP ───────── */
// Login/cadastro desligados por enquanto: o app abre direto no painel.
// Para religar a tela de entrada e o KYC, troque para false.
const SKIP_AUTH = true;

const NAV = [
  ["overview", "Visão geral", "◈"], ["charges", "Cobranças", "⇄"], ["links", "Links", "⌁"],
  ["balance", "Saldo", "◎"], ["dev", "Developers", "‹›"],
];

export default function NexusPay() {
  const [phase, setPhase] = useState(SKIP_AUTH ? "app" : "entry");
  const [tab, setTab] = useState("overview");
  const [openNew, setOpenNew] = useState(false);
  const [menu, setMenu] = useState(false);
  const [merchant, setMerchant] = useState("Sua empresa");
  const [kyc, setKyc] = useState(SKIP_AUTH ? "pending" : "under_review");
  const [charges, setCharges] = useState(seedCharges);
  const [links, setLinks] = useState(seedLinks);
  const [payouts, setPayouts] = useState(seedPayouts);
  const [balance, setBalance] = useState({ available: 1248730, pending: 482000, blocked: 0 });

  const handleCharge = (c, action) => {
    if (typeof c === "object") { setCharges((cur) => [c, ...cur]); return; }
    const id = c;
    const ch = charges.find((x) => x.id === id); if (!ch) return;
    const fee = calcFee(ch.method, ch.amount, ch.installments);
    if (action === "simulate" && ch.status === "pending") {
      setCharges((cur) => cur.map((x) => x.id === id ? { ...x, status: "paid" } : x));
      setBalance((b) => ch.method === "card" ? { ...b, pending: b.pending + ch.amount - fee } : { ...b, available: b.available + ch.amount - fee });
    }
    if (action === "refund" && ch.status === "paid") {
      setCharges((cur) => cur.map((x) => x.id === id ? { ...x, status: "refunded" } : x));
      setBalance((b) => ({ ...b, available: Math.max(b.available - ch.amount, 0) }));
    }
  };
  const handlePayout = (amount, fee) => {
    setPayouts((p) => [{ id: "po_" + Math.random().toString(16).slice(2, 10), amount, fee, status: "processing", at: new Date().toISOString() }, ...p]);
    setBalance((b) => ({ ...b, available: b.available - amount - fee }));
  };
  const go = (t, withNew) => { setTab(t); setOpenNew(!!withNew); };

  return (
    <>
      <style>{CSS}</style>
      {phase === "entry" && <Entry onEnter={(m) => setPhase(m === "signup" ? "kyc" : "app")} />}
      {phase === "kyc" && <Onboarding onDone={(n, submitted) => { setMerchant(n || "Sua empresa"); setKyc(submitted ? "under_review" : "pending"); setPhase("app"); }} />}
      {phase === "app" && (
        <div className="app">
          <header className="top">
            <button className="ico" aria-label="Abrir menu" onClick={() => setMenu(true)}><Ico n="menu" size={30} sw={2.2} /></button>
            <Logo size={30} />
            <button className="ico" aria-label="Notificações"><Ico n="bell" size={28} sw={2} /></button>
          </header>
          {menu && (
            <div className="drawer" onClick={() => setMenu(false)}>
              <aside aria-label="Menu principal" onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: "4px 8px 22px" }}><Logo size={32} /></div>
                {NAV.map(([k, l]) => (
                  <button key={k} className={`nav ${tab === k ? "on" : ""}`} onClick={() => { go(k); setMenu(false); }} aria-current={tab === k ? "page" : undefined}>{l}</button>
                ))}
                <div style={{ marginTop: "auto", padding: 12, borderRadius: 12, background: "rgba(255,255,255,.04)", fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{merchant}</div>
                  <span className="badge" style={{ color: kyc === "approved" ? C.ok : C.warn, background: (kyc === "approved" ? C.ok : C.warn) + "1f" }}>
                    <i style={{ background: kyc === "approved" ? C.ok : C.warn }} />{kyc === "approved" ? "Conta aprovada" : "Modo teste"}
                  </span>
                </div>
              </aside>
            </div>
          )}
          <main>
            {kyc !== "approved" && tab !== "overview" && (
              <div className="card" style={{ padding: "12px 14px", marginBottom: 16, borderColor: "rgba(255,181,71,.3)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ color: C.warn }}>Modo teste: nenhum dinheiro real é movimentado.</span>
                <button className="btn2" onClick={() => setKyc("approved")}>Simular aprovação (demo)</button>
              </div>
            )}
            {tab === "overview" && <Overview charges={charges} balance={balance} />}
            {tab === "charges" && <Charges key={String(openNew)} charges={charges} onCreate={handleCharge} autoOpen={openNew} />}
            {tab === "links" && <Links links={links} setLinks={setLinks} />}
            {tab === "balance" && <Balance balance={balance} payouts={payouts} onPayout={handlePayout} kyc={kyc} setKyc={setKyc} />}
            {tab === "dev" && <Developers kyc={kyc} />}
          </main>
          <nav className="bnav" aria-label="Navegação">
            {[["overview", "home", "Início"], ["charges", "box", "Cobranças"], ["balance", "growth", "Saldo"], ["dev", "gear", "Developers"]].map(([k, ic, l]) => (
              <button key={k} className={tab === k ? "on" : ""} aria-label={l} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}><Ico n={ic} size={28} sw={1.9} /></button>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}

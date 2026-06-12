import { useState } from "react";

const PASSWORD = "edge2026";

export function useAuth() {
  const stored = sessionStorage.getItem("edge_auth");
  const [authed, setAuthed] = useState(stored === "1");
  function login(pw) {
    if (pw === PASSWORD) { sessionStorage.setItem("edge_auth", "1"); setAuthed(true); return true; }
    return false;
  }
  return { authed, login };
}

export function LoginScreen({ login }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  function attempt() { if (!login(pw)) { setErr(true); setPw(""); } }
  return (
    <div style={{ background: "#0d0f14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: "#1a1e28", border: "1px solid #252a38", borderRadius: 14, padding: "40px 36px", width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em", color: "#e8eaf0", marginBottom: 6 }}>EDGE</div>
        <div style={{ color: "#6b7280", fontSize: 12, letterSpacing: "0.1em", marginBottom: 32 }}>BETTING TRACKER</div>
        <input
          type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()}
          placeholder="Password"
          style={{ width: "100%", background: "#13161d", border: `1px solid ${err ? "#ef4444" : "#252a38"}`, borderRadius: 8, padding: "12px 14px", color: "#e8eaf0", fontSize: 15, boxSizing: "border-box", marginBottom: 10, outline: "none" }}
          autoFocus
        />
        {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 10 }}>Incorrect password</div>}
        <button onClick={attempt} style={{ width: "100%", background: "#1e6fff", color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Enter</button>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { login, logout, handleCallback, getToken, isAuthenticated } from "./auth";
import { generateDiagram, listDiagrams, fetchDiagram, saveDiagramToS3, deleteDiagram, SavedDiagram, JobResult } from "./api";
import { DiagramSkeleton } from "./DiagramSkeleton";
import {
  PanelLeftClose, PanelLeftOpen, Download, Plus, LogOut, Undo2,
  Send, Loader2, Check, FileCode2, Clock, ChevronRight, Trash2,
} from "lucide-react";

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#FAFBFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  primaryLight: "#EFF6FF",
  primaryMuted: "#DBEAFE",
  violet: "#7C3AED",
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  success: "#16A34A",
  error: "#DC2626",
  userBubble: "#2563EB",
  assistantBubble: "#F1F5F9",
  sidebarBg: "#F8FAFC",
  hover: "#EFF6FF",
  selected: "#DBEAFE",
};

const FONT = { mono: "'JetBrains Mono', monospace", sans: "'Inter', system-ui, sans-serif" };

interface Message { role: "user" | "assistant"; content: string; }

const QUICK_ACTIONS = [
  "Add monitoring with CloudWatch",
  "Add security layer with WAF",
  "Add CI/CD pipeline",
];

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusPhase, setStatusPhase] = useState<"thinking" | "building" | "done" | null>(null);
  const [buildingServices, setBuildingServices] = useState<string[]>([]);
  const [diagramXml, setDiagramXml] = useState<string | null>(null);
  const [diagramUrl, setDiagramUrl] = useState<string | null>(null);
  const [diagramKey, setDiagramKey] = useState<string | null>(null);
  const [diagramTitle, setDiagramTitle] = useState<string | null>(null);
  const [savedDiagrams, setSavedDiagrams] = useState<SavedDiagram[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [iframeReady, setIframeReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [prevSpec, setPrevSpec] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      handleCallback(code)
        .then(() => { setAuthed(true); window.history.replaceState({}, "", "/"); })
        .catch((e) => alert(`Login failed: ${e.message}`));
    }
  }, []);

  const refreshDiagrams = useCallback(() => {
    const token = getToken();
    if (token) listDiagrams(token).then(setSavedDiagrams);
  }, []);

  useEffect(() => { if (authed) refreshDiagrams(); }, [authed, refreshDiagrams]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // draw.io iframe message handler
  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      if (evt.origin !== "https://embed.diagrams.net") return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg.event === "init") setIframeReady(true);
        if (msg.event === "save" && msg.xml && diagramKey) {
          const token = getToken();
          if (token) {
            setSaveStatus("saving");
            saveDiagramToS3(msg.xml, diagramKey, token).then((ok) => {
              setSaveStatus(ok ? "saved" : "error");
              if (ok) setDiagramXml(msg.xml);
              setTimeout(() => setSaveStatus(null), 2000);
            });
          }
        }
        if (msg.event === "exit") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ action: "export", format: "xml" }), "*");
        }
        if (msg.event === "export" && msg.data && diagramKey) {
          const token = getToken();
          if (token) { saveDiagramToS3(msg.data, diagramKey, token); setDiagramXml(msg.data); }
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [diagramKey]);

  const loadXmlIntoIframe = useCallback((xml: string) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(JSON.stringify({ action: "load", xml, autosave: 0 }), "*");
  }, []);

  useEffect(() => { if (diagramXml && iframeReady) loadXmlIntoIframe(diagramXml); }, [diagramXml, iframeReady, loadXmlIntoIframe]);

  const extractTitle = (xml: string): string | null => {
    const match = xml.match(/name="([^"]+)"/);
    return match ? match[1] : null;
  };

  const send = async (prompt?: string) => {
    const msg = prompt || input.trim();
    if (!msg || loading) return;
    const token = getToken();
    if (!token) { login(); return; }
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    const known = ["API Gateway","Lambda","DynamoDB","S3","CloudFront","RDS","ECS","EKS","Fargate","ALB","NLB","Cognito","SQS","SNS","EventBridge","Step Functions","CloudWatch","CloudTrail","WAF","IAM","Bedrock","ElastiCache","Aurora","Route 53","EC2","NAT Gateway","VPC","Kinesis","Athena","Glue"];
    const lower = msg.toLowerCase();
    setBuildingServices(known.filter((s) => lower.includes(s.toLowerCase())));
    try {
      const result: JobResult = await generateDiagram(msg, token, (s, phase) => { setStatusMsg(s); setStatusPhase(phase || null); }, diagramKey);
      setMessages((m) => [...m, { role: "assistant", content: result.response || "Diagram generated." }]);
      if (result.diagram_url) {
        if (diagramXml) setPrevSpec(diagramXml);
        setDiagramUrl(result.diagram_url);
        if (result.diagram_key) setDiagramKey(result.diagram_key);
        const xml = result.diagram_xml || await fetchDiagram(result.diagram_url);
        if (xml) { setDiagramXml(xml); setDiagramTitle(extractTitle(xml)); }
      }
      refreshDiagrams();
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : err}` }]);
    } finally {
      setLoading(false); setStatusMsg(null); setStatusPhase(null); setBuildingServices([]);
    }
  };

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); send(); };
  const handleUndo = () => { if (!prevSpec) return; setDiagramXml(prevSpec); setDiagramTitle(extractTitle(prevSpec)); setPrevSpec(null); setMessages((m) => [...m, { role: "assistant", content: "Reverted to previous version." }]); };
  const newDiagram = () => { setDiagramXml(null); setDiagramUrl(null); setDiagramKey(null); setDiagramTitle(null); setPrevSpec(null); setMessages([]); };

  const groupedDiagrams = groupByDate(savedDiagrams);

  // ── Login screen ─────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileCode2 size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Diagram Agent</span>
        </div>
        <p style={{ color: C.textSecondary, fontSize: 14, marginBottom: 32 }}>Generate AWS architecture diagrams with AI</p>
        <button onClick={login} style={{ ...btnPrimary, padding: "10px 32px", fontSize: 14 }}>Sign in with SSO</button>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.bg, fontFamily: FONT.sans }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={btnIcon} title="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div style={{ width: 1, height: 20, background: C.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileCode2 size={13} color="#fff" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
              {diagramTitle || "Diagram Agent"}
            </span>
            {diagramKey && (
              <span style={{ fontSize: 11, color: C.textMuted, fontFamily: FONT.mono }}>
                {diagramKey.split("/").pop()?.replace(".drawio", "")}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {saveStatus && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: saveStatus === "saved" ? C.success : saveStatus === "error" ? C.error : C.textSecondary }}>
              {saveStatus === "saved" && <Check size={14} />}
              {saveStatus === "saving" && <Loader2 size={14} className="animate-spin" />}
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving..." : "Save failed"}
            </span>
          )}
          {prevSpec && <button onClick={handleUndo} style={btnGhost} title="Undo last change"><Undo2 size={15} /><span>Undo</span></button>}
          {diagramUrl && (
            <a href={diagramUrl} download="diagram.drawio" style={{ ...btnGhost, textDecoration: "none" }}>
              <Download size={15} /><span>.drawio</span>
            </a>
          )}
          <button onClick={newDiagram} style={btnGhost}><Plus size={15} /><span>New</span></button>
          <div style={{ width: 1, height: 20, background: C.border }} />
          <button onClick={logout} style={btnGhost}><LogOut size={15} /></button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{ width: 240, minWidth: 200, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", background: C.sidebarBg, flexShrink: 0 }}>
            <div style={{ padding: "12px 16px", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.borderLight}` }}>
              Diagrams
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
              {Object.entries(groupedDiagrams).map(([group, diagrams]) => (
                <div key={group}>
                  <div style={{ padding: "8px 16px 4px", fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={10} />{group}
                  </div>
                  {diagrams.map((d) => {
                    const active = d.key === diagramKey;
                    return (
                      <div
                        key={d.key}
                        onClick={async () => {
                          const xml = await fetchDiagram(d.url);
                          if (xml) {
                            setDiagramXml(xml); setDiagramUrl(d.url); setDiagramKey(d.key);
                            setDiagramTitle(extractTitle(xml) || d.name); setPrevSpec(null);
                            setMessages([{ role: "assistant", content: `Loaded: ${d.name}\nYou can now ask me to modify this diagram.` }]);
                          }
                        }}
                        style={{
                          padding: "6px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                          background: active ? C.selected : "transparent",
                          borderLeft: active ? `2px solid ${C.primary}` : "2px solid transparent",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = C.hover; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                      >
                        <FileCode2 size={14} color={active ? C.primary : C.textMuted} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? C.text : C.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.mono }}>
                            {d.name.replace(".drawio", "")}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0, fontFamily: FONT.mono }}>{formatSize(d.size)}</span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Delete ${d.name}?`)) return;
                            const token = getToken();
                            if (token && await deleteDiagram(d.key, token)) {
                              if (diagramKey === d.key) newDiagram();
                              refreshDiagrams();
                            }
                          }}
                          style={{ ...btnIcon, width: 24, height: 24, opacity: 0.4, color: C.textMuted }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = C.error; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.4"; e.currentTarget.style.color = C.textMuted; }}
                          title="Delete diagram"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
              {savedDiagrams.length === 0 && (
                <div style={{ padding: 24, fontSize: 12, color: C.textMuted, textAlign: "center" }}>No diagrams yet</div>
              )}
            </div>
          </div>
        )}

        {/* Chat panel */}
        <div style={{ width: 380, minWidth: 300, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
          <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", marginTop: "28vh" }}>
                <p style={{ fontSize: 14, color: C.textSecondary, fontWeight: 500 }}>Describe an architecture</p>
                <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4, fontFamily: FONT.mono }}>
                  "API Gateway, Lambda, DynamoDB with Cognito"
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                padding: "10px 14px",
                borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: m.role === "user" ? C.userBubble : C.assistantBubble,
                color: m.role === "user" ? "#fff" : C.text,
                fontSize: 13, lineHeight: 1.6,
              }}>
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {m.role === "assistant" ? extractExplanation(m.content) : m.content}
                </div>
              </div>
            ))}
            {loading && statusMsg && (
              <div style={{
                alignSelf: "flex-start", maxWidth: "88%",
                padding: "10px 14px", borderRadius: "14px 14px 14px 4px",
                background: C.primaryLight, color: C.primary, fontSize: 13,
                display: "flex", alignItems: "center", gap: 8,
                border: `1px solid ${C.primaryMuted}`,
              }}>
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontFamily: FONT.mono, fontSize: 12 }}>{statusMsg}</span>
              </div>
            )}
            {!loading && diagramXml && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                {QUICK_ACTIONS.map((action) => (
                  <button key={action} onClick={() => send(action)} style={btnQuickAction}>
                    <ChevronRight size={12} />{action}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={loading ? "Generating..." : diagramKey ? "Modify this diagram..." : "Describe your architecture..."}
              disabled={loading}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 8,
                border: `1px solid ${C.border}`, fontSize: 13, outline: "none",
                fontFamily: FONT.sans, color: C.text, background: C.surface,
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = C.primary}
              onBlur={(e) => e.currentTarget.style.borderColor = C.border}
              autoFocus
            />
            <button type="submit" disabled={loading || !input.trim()} style={{
              ...btnPrimary, padding: "9px 14px", display: "flex", alignItems: "center",
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}>
              {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
            </button>
          </form>
        </div>

        {/* Diagram viewer */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", background: C.bg }}>
          {loading && <DiagramSkeleton services={buildingServices} phase={statusPhase} />}
          {diagramXml ? (
            <iframe
              ref={iframeRef}
              src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : !loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: C.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <FileCode2 size={28} color={C.primary} />
                </div>
                <p style={{ color: C.textSecondary, fontSize: 14, fontWeight: 500 }}>Your diagram will appear here</p>
                <p style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>Describe an architecture to get started</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractExplanation(content: string): string {
  let text = content.replace(/```(?:json|xml)[\s\S]*?```/g, "").trim();
  text = text.replace(/^Tool #\d+:.*$/gm, "").trim();
  text = text.replace(/\n{3,}/g, "\n\n");
  return text || "Diagram generated.";
}

function groupByDate(diagrams: SavedDiagram[]): Record<string, SavedDiagram[]> {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const groups: Record<string, SavedDiagram[]> = {};
  for (const d of diagrams) {
    const date = new Date(d.modified).toDateString();
    const label = date === today ? "Today" : date === yesterday ? "Yesterday" : date;
    (groups[label] ??= []).push(d);
  }
  return groups;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}K`;
}

// ── Shared button styles ─────────────────────────────────────────────────────

const btnPrimary: React.CSSProperties = {
  borderRadius: 8, border: "none", background: "#2563EB", color: "#fff",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif",
  transition: "background 0.15s",
};

const btnGhost: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "5px 10px", borderRadius: 6, border: `1px solid #E2E8F0`,
  background: "transparent", fontSize: 12, fontWeight: 500, cursor: "pointer",
  color: "#64748B", fontFamily: "'Inter', sans-serif",
  transition: "all 0.15s",
};

const btnIcon: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 6, border: "none",
  background: "transparent", cursor: "pointer", color: "#64748B",
  transition: "all 0.15s",
};

const btnQuickAction: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "5px 12px", borderRadius: 16,
  border: "1px solid #E2E8F0", background: "#FFFFFF",
  fontSize: 11, fontWeight: 500, cursor: "pointer", color: "#64748B",
  fontFamily: "'Inter', sans-serif", transition: "all 0.15s", whiteSpace: "nowrap",
};

import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { login, logout, handleCallback, getToken, isAuthenticated } from "./auth";
import { generateDiagram, listDiagrams, fetchDiagram, saveDiagramToS3, deleteDiagram, SavedDiagram, JobResult } from "./api";
import { DiagramSkeleton } from "./DiagramSkeleton";
import { C, FONT, btnPrimary, btnAction, btnActionPrimary, btnIcon, btnQuickAction, KEYFRAMES } from "./styles";
import {
  PanelLeftClose, PanelLeftOpen, Download, Plus, LogOut, Undo2,
  Send, Loader2, Check, FileCode2, Clock, ChevronRight, Trash2, Sparkles, Bot,
  MessageSquare, MessageSquareOff,
} from "lucide-react";

// ── Design tokens imported from styles.ts ────────────────────────────────────

interface Message { role: "user" | "assistant"; content: string; }

const EXAMPLE_PROMPTS = [
  { label: "3-tier Web App", prompt: "3-tier web app with ALB, ECS, RDS PostgreSQL, and ElastiCache" },
  { label: "Serverless API", prompt: "Serverless API with API Gateway, Lambda, DynamoDB, and Cognito auth" },
  { label: "Data Pipeline", prompt: "Real-time data pipeline with Kinesis, Lambda, S3, and Athena" },
  { label: "ML Platform", prompt: "ML platform with SageMaker, S3, Lambda, API Gateway, and Bedrock" },
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
  const [chatOpen, setChatOpen] = useState(true);
  const [iframeReady, setIframeReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [prevSpec, setPrevSpec] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
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
        // Success celebration
        setShowDone(true);
        setTimeout(() => setShowDone(false), 2000);
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileCode2 size={20} color="#fff" />
          </div>
          <span style={{ fontSize: 26, fontWeight: 700, color: C.text }}>Blueprint</span>
        </div>
        <p style={{ color: C.textSecondary, fontSize: 14, marginBottom: 6 }}>AI-powered AWS architecture diagrams</p>
        <p style={{ color: C.textMuted, fontSize: 12, marginBottom: 32, fontFamily: FONT.mono }}>describe → generate → iterate → export .drawio</p>
        <button onClick={login} style={{ ...btnPrimary, padding: "10px 32px", fontSize: 14 }}>Sign in with SSO</button>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.bg, fontFamily: FONT.sans }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={btnIcon} title="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          {!sidebarOpen && (
            <div style={{ width: 28, height: 28, borderRadius: 7, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT.sans }}>B</span>
            </div>
          )}
          <div style={{ width: 1, height: 20, background: C.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {sidebarOpen && (
              <div style={{ width: 24, height: 24, borderRadius: 6, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FileCode2 size={13} color="#fff" />
              </div>
            )}
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
              {diagramTitle || "Blueprint"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {saveStatus && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: saveStatus === "saved" ? C.success : saveStatus === "error" ? C.error : C.textSecondary }}>
              {saveStatus === "saved" && <Check size={14} />}
              {saveStatus === "saving" && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
              {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving..." : "Save failed"}
            </span>
          )}
          {prevSpec && <button onClick={handleUndo} style={btnAction} title="Undo last change"><Undo2 size={14} /><span>Undo</span></button>}
          <button onClick={newDiagram} style={btnActionPrimary}><Plus size={14} /><span>New</span></button>
          {diagramUrl && (
            <a href={diagramUrl} download="diagram.drawio" style={{ ...btnAction, textDecoration: "none" }}>
              <Download size={14} /><span>Export</span>
            </a>
          )}
          <div style={{ width: 1, height: 20, background: C.border }} />
          <button onClick={() => setChatOpen(!chatOpen)} style={btnIcon} title="Toggle chat">
            {chatOpen ? <MessageSquareOff size={17} /> : <MessageSquare size={17} />}
          </button>
          <button onClick={logout} style={btnIcon} title="Sign out"><LogOut size={17} /></button>
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
                            {humanName(d.name)}
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
        {chatOpen && (
        <div style={{ width: 380, minWidth: 300, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
          <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ marginTop: "16vh", padding: "0 8px" }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: C.primaryLight, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                    <Sparkles size={20} color={C.primary} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: C.text }}>What do you want to build?</p>
                  <p style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>Describe an architecture or pick a template</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => send(ex.prompt)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                        borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface,
                        cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                        fontFamily: FONT.sans,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.background = C.primaryLight; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}
                    >
                      <ChevronRight size={14} color={C.primary} style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{ex.label}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{ex.prompt}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex", gap: 8, alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%", flexDirection: m.role === "user" ? "row-reverse" : "row",
              }}>
                {m.role === "assistant" && (
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: C.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                    <Bot size={13} color={C.primary} />
                  </div>
                )}
                <div style={{
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
                {getSmartActions(diagramTitle || "").map((action) => (
                  <button key={action} onClick={() => send(action)} style={btnQuickAction}>
                    <ChevronRight size={12} />{action}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={handleSubmit} style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
            <div style={{
              display: "flex", alignItems: "center",
              borderRadius: 10, border: `1px solid ${C.border}`,
              background: C.surface, overflow: "hidden",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
              onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.primaryMuted}`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={loading ? "Generating..." : diagramKey ? "Modify this diagram..." : "Describe your architecture..."}
                disabled={loading}
                style={{
                  flex: 1, padding: "10px 14px", border: "none", outline: "none",
                  fontSize: 13, fontFamily: FONT.sans, color: C.text, background: "transparent",
                }}
                autoFocus
              />
              <button type="submit" disabled={loading || !input.trim()} style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 40, height: 38, border: "none", cursor: "pointer",
                background: loading || !input.trim() ? "transparent" : C.primary,
                color: loading || !input.trim() ? C.textMuted : "#fff",
                borderRadius: "0 9px 9px 0", transition: "all 0.15s",
                marginRight: 1,
              }}>
                {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={16} />}
              </button>
            </div>
          </form>
        </div>
        )}

        {/* Diagram viewer */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", background: C.bg }}>
          {loading && <DiagramSkeleton services={buildingServices} phase={statusPhase} />}
          {showDone && (
            <div style={{
              position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20,
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 20px", borderRadius: 20,
              background: C.surface, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", border: `1px solid ${C.border}`,
              animation: "fadeInUp 0.3s ease",
            }}>
              <Sparkles size={14} color={C.success} />
              <span style={{ fontSize: 13, fontWeight: 500, color: C.success }}>Diagram ready!</span>
            </div>
          )}
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

      <style>{KEYFRAMES}</style>
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

/** Context-aware quick actions based on what's likely in the diagram. */
function getSmartActions(title: string): string[] {
  const t = title.toLowerCase();
  const actions: string[] = [];
  if (!t.includes("cloudwatch") && !t.includes("monitor")) actions.push("Add CloudWatch monitoring");
  if (!t.includes("waf") && !t.includes("shield")) actions.push("Add WAF security layer");
  if (!t.includes("cloudfront") && !t.includes("cdn")) actions.push("Add CloudFront CDN");
  if (!t.includes("cognito") && !t.includes("auth")) actions.push("Add Cognito authentication");
  if (!t.includes("ci") && !t.includes("pipeline")) actions.push("Add CI/CD pipeline");
  actions.push("Switch to top-down layout");
  return actions.slice(0, 3);
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

/** Convert S3 filename like "20260408-013412-ai-chatbot-rag-on-aws.drawio" to "AI Chatbot RAG on AWS" */
function humanName(filename: string): string {
  const UPPER = new Set(["aws","api","alb","nlb","cdn","rds","ecs","eks","iam","s3","sqs","sns","vpc","ci","cd","rag","ai","ml","db","sql","http","ssl","tls","waf","kms","acm"]);
  const LOWER = new Set(["on","in","with","and","for","the","a","an","to","of"]);
  return filename
    .replace(".drawio", "")
    .replace(/^\d{8}-\d{6}-/, "")
    .replace(/[-_]+/g, " ")
    .split(" ")
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (UPPER.has(lw)) return lw.toUpperCase();
      if (i > 0 && LOWER.has(lw)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(" ");
}

// ── Shared button styles imported from styles.ts ─────────────────────────────

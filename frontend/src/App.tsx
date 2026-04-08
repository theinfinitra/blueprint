import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { login, logout, handleCallback, getToken, isAuthenticated } from "./auth";
import { generateDiagram, listDiagrams, fetchDiagram, saveDiagramToS3, deleteDiagram, SavedDiagram, JobResult } from "./api";
import { DiagramSkeleton } from "./DiagramSkeleton";
import { C, FONT, btnPrimary, btnAction, btnActionPrimary, btnIcon, btnQuickAction, KEYFRAMES } from "./styles";
import {
  PanelLeftClose, PanelLeftOpen, Download, Plus, LogOut, Undo2,
  Send, Loader2, Check, FileCode2, Clock, ChevronRight, Trash2, Sparkles, Bot,
  MessageSquare, Paperclip, X,
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
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
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

    // Build prompt with file context if attached
    let fullPrompt = msg;
    if (attachedFile) {
      fullPrompt = `The user attached a file (${attachedFile.name}):\n---\n${attachedFile.content}\n---\n\n${msg}`;
    }

    setInput("");
    setAttachedFile(null);
    setMessages((m) => [...m, { role: "user", content: attachedFile ? `📎 ${attachedFile.name}\n${msg}` : msg }]);
    setLoading(true);
    const known = ["API Gateway","Lambda","DynamoDB","S3","CloudFront","RDS","ECS","EKS","Fargate","ALB","NLB","Cognito","SQS","SNS","EventBridge","Step Functions","CloudWatch","CloudTrail","WAF","IAM","Bedrock","ElastiCache","Aurora","Route 53","EC2","NAT Gateway","VPC","Kinesis","Athena","Glue"];
    const lower = fullPrompt.toLowerCase();
    setBuildingServices(known.filter((s) => lower.includes(s.toLowerCase())));
    try {
      const result: JobResult = await generateDiagram(fullPrompt, token, (s, phase) => { setStatusMsg(s); setStatusPhase(phase || null); }, diagramKey);
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
  const newDiagram = () => { setDiagramXml(null); setDiagramUrl(null); setDiagramKey(null); setDiagramTitle(null); setPrevSpec(null); setMessages([]); setAttachedFile(null); };

  const MAX_FILE_SIZE = 200 * 1024; // 200KB
  const ALLOWED_EXTENSIONS = [".txt", ".md", ".yaml", ".yml", ".json", ".csv", ".tf", ".py", ".ts", ".js"];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File too large (${(file.size / 1024).toFixed(0)}KB). Max 200KB.`);
      return;
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert(`Unsupported file type. Supported: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let content = reader.result as string;
      if (content.length > 30000) {
        content = content.slice(0, 30000) + "\n\n[... truncated — file exceeded 30KB text limit ...]";
      }
      setAttachedFile({ name: file.name, content });
    };
    reader.readAsText(file);
    e.target.value = ""; // reset so same file can be re-attached
  };

  const groupedDiagrams = groupByDate(savedDiagrams);

  // ── Login screen ─────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: FONT.sans }}>B</span>
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
          <div style={{ width: 28, height: 28, borderRadius: 7, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: FONT.sans }}>B</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Blueprint</span>
          {diagramTitle && (
            <>
              <div style={{ width: 1, height: 18, background: C.border }} />
              <span style={{ fontSize: 15, color: C.text, fontWeight: 700 }}>{diagramTitle}</span>
            </>
          )}
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
          <button onClick={logout} style={btnIcon} title="Sign out"><LogOut size={17} /></button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        {sidebarOpen ? (
          <div style={{ width: 240, minWidth: 200, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", background: C.sidebarBg, flexShrink: 0 }}>
            <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Diagrams</span>
              <button onClick={() => setSidebarOpen(false)} style={{ ...btnIcon, width: 24, height: 24 }} title="Close sidebar">
                <PanelLeftClose size={14} />
              </button>
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
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              width: 28, alignSelf: "stretch", border: "none", borderRight: `1px solid ${C.border}`,
              background: C.sidebarBg, cursor: "pointer", display: "flex", alignItems: "flex-start", justifyContent: "center",
              paddingTop: 12, transition: "background 0.15s", flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.hover}
            onMouseLeave={(e) => e.currentTarget.style.background = C.sidebarBg}
            title="Open sidebar"
          >
            <PanelLeftOpen size={14} color={C.textMuted} />
          </button>
        )}

        {/* Floating chat widget */}
        {chatOpen ? (
          <div style={{
            position: "absolute", bottom: 20, right: 20, width: 380,
            height: "min(520px, calc(100% - 40px))",
            borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column",
            zIndex: 30, overflow: "hidden",
          }}>
            {/* Chat header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bot size={16} color={C.primary} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Blueprint AI</span>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ ...btnIcon, width: 28, height: 28 }} title="Minimize chat">
                <ChevronRight size={16} style={{ transform: "rotate(90deg)" }} />
              </button>
            </div>
            {/* Chat messages */}
            <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ marginTop: "12vh", padding: "0 4px" }}>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <Sparkles size={18} color={C.primary} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 8 }}>What do you want to build?</p>
                    <p style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Pick a template or describe your own</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {EXAMPLE_PROMPTS.map((ex) => (
                      <button
                        key={ex.label}
                        onClick={() => send(ex.prompt)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                          borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface,
                          cursor: "pointer", textAlign: "left", transition: "all 0.15s", fontFamily: FONT.sans,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.background = C.primaryLight; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}
                      >
                        <ChevronRight size={12} color={C.primary} style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{ex.label}</div>
                          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{ex.prompt}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{
                  display: "flex", gap: 6, alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%", flexDirection: m.role === "user" ? "row-reverse" : "row",
                }}>
                  {m.role === "assistant" && (
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: C.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                      <Bot size={12} color={C.primary} />
                    </div>
                  )}
                  <div style={{
                    padding: "8px 12px",
                    borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    background: m.role === "user" ? C.userBubble : C.assistantBubble,
                    color: m.role === "user" ? "#fff" : C.text,
                    fontSize: 12, lineHeight: 1.6,
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
                  padding: "8px 12px", borderRadius: "12px 12px 12px 4px",
                  background: C.primaryLight, color: C.primary, fontSize: 12,
                  display: "flex", alignItems: "center", gap: 6,
                  border: `1px solid ${C.primaryMuted}`,
                }}>
                  <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                  <span style={{ fontFamily: FONT.mono, fontSize: 11 }}>{statusMsg}</span>
                </div>
              )}
              {!loading && diagramXml && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                  {getSmartActions(diagramXml || "").map((action) => (
                    <button key={action} onClick={() => send(action)} style={btnQuickAction}>
                      <ChevronRight size={10} />{action}
                    </button>
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            {/* Chat input */}
            <form onSubmit={handleSubmit} style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}` }}>
              {attachedFile && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                  padding: "6px 10px", borderRadius: 8, background: C.primaryLight,
                  fontSize: 11, color: C.primary, fontFamily: FONT.mono,
                }}>
                  <Paperclip size={12} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedFile.name}</span>
                  <span style={{ color: C.textMuted, flexShrink: 0 }}>{(attachedFile.content.length / 1024).toFixed(1)}KB</span>
                  <button onClick={() => setAttachedFile(null)} style={{ ...btnIcon, width: 20, height: 20, color: C.primary }}>
                    <X size={12} />
                  </button>
                </div>
              )}
              <div style={{
                display: "flex", alignItems: "center",
                borderRadius: 10, border: `1px solid ${C.border}`,
                background: C.surface, overflow: "hidden",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
                onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.primaryMuted}`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileAttach} accept={ALLOWED_EXTENSIONS.join(",")} style={{ display: "none" }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...btnIcon, width: 34, height: 34, color: attachedFile ? C.primary : C.textMuted }} title="Attach file">
                  <Paperclip size={14} />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={loading ? "Generating..." : attachedFile ? "Describe what to generate..." : diagramKey ? "Modify this diagram..." : "Describe your architecture..."}
                  disabled={loading}
                  style={{
                    flex: 1, padding: "9px 4px", border: "none", outline: "none",
                    fontSize: 12, fontFamily: FONT.sans, color: C.text, background: "transparent",
                  }}
                  autoFocus
                />
                <button type="submit" disabled={loading || !input.trim()} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 36, height: 34, border: "none", cursor: "pointer",
                  background: loading || !input.trim() ? "transparent" : C.primary,
                  color: loading || !input.trim() ? C.textMuted : "#fff",
                  borderRadius: "0 9px 9px 0", transition: "all 0.15s", marginRight: 1,
                }}>
                  {loading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Minimized chat bubble */
          <button
            onClick={() => setChatOpen(true)}
            style={{
              position: "absolute", bottom: 20, right: 20, zIndex: 30,
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 24, border: "none",
              background: C.primary, color: "#fff", cursor: "pointer",
              boxShadow: "0 4px 16px rgba(37,99,235,0.3)",
              fontSize: 13, fontWeight: 600, fontFamily: FONT.sans,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 6px 24px rgba(37,99,235,0.4)"}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,0.3)"}
          >
            <MessageSquare size={16} />
            Chat
            {messages.length > 0 && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", opacity: 0.7 }} />
            )}
          </button>
        )}

        {/* Diagram viewer — full width */}
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
              src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&grid=1&noExitBtn=1&saveAndExit=0&splash=0"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : !loading ? (
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              backgroundImage: "radial-gradient(circle, #d0d5dd 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: C.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <span style={{ color: C.primary, fontSize: 28, fontWeight: 700, fontFamily: FONT.sans }}>B</span>
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

/** Context-aware quick actions based on what's NOT in the current diagram. */
function getSmartActions(xml: string): string[] {
  const lower = xml.toLowerCase();
  const actions: string[] = [];
  if (!lower.includes("cloudwatch")) actions.push("Add CloudWatch monitoring");
  if (!lower.includes("waf")) actions.push("Add WAF security layer");
  if (!lower.includes("cloudfront")) actions.push("Add CloudFront CDN");
  if (!lower.includes("cognito")) actions.push("Add Cognito authentication");
  if (!lower.includes("codepipeline") && !lower.includes("ci")) actions.push("Add CI/CD pipeline");
  if (!lower.includes("elasticache") && !lower.includes("redis")) actions.push("Add ElastiCache caching");
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

import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { login, logout, handleCallback, getToken, isAuthenticated } from "./auth";
import { generateDiagram, listDiagrams, fetchDiagram, saveDiagramToS3, deleteDiagram, SavedDiagram, JobResult } from "./api";
import { DiagramSkeleton } from "./DiagramSkeleton";
import { C, FONT, btnPrimary, btnAction, btnActionPrimary, btnIcon, btnQuickAction, KEYFRAMES } from "./styles";
import {
  PanelLeftClose, PanelLeftOpen, Download, Plus, LogOut, History,
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
  const [versionStack, setVersionStack] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingXml = useRef<string | null>(null);

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
        if (msg.event === "autosave" && msg.xml && diagramKey) {
          pendingXml.current = msg.xml;
          if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
          autosaveTimer.current = setTimeout(() => {
            if (!pendingXml.current) return;
            const token = getToken();
            if (token) {
              setSaveStatus("saving");
              saveDiagramToS3(pendingXml.current, diagramKey, token).then((ok) => {
                setSaveStatus(ok ? "saved" : "error");
                if (ok) setDiagramXml(pendingXml.current!);
                pendingXml.current = null;
                setTimeout(() => setSaveStatus(null), 2000);
              });
            }
          }, 30000);
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

  // Save pending changes when user clicks away from the diagram
  useEffect(() => {
    const onBlur = () => {
      if (!pendingXml.current || !diagramKey) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      const token = getToken();
      if (token) {
        setSaveStatus("saving");
        saveDiagramToS3(pendingXml.current, diagramKey, token).then((ok) => {
          setSaveStatus(ok ? "saved" : "error");
          if (ok) setDiagramXml(pendingXml.current!);
          pendingXml.current = null;
          setTimeout(() => setSaveStatus(null), 2000);
        });
      }
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [diagramKey]);

  const loadXmlIntoIframe = useCallback((xml: string) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(JSON.stringify({ action: "load", xml, autosave: 1 }), "*");
  }, []);

  useEffect(() => { if (diagramXml && iframeReady) loadXmlIntoIframe(diagramXml); }, [diagramXml, iframeReady, loadXmlIntoIframe]);

  const extractTitle = (xml: string): string | null => {
    const match = xml.match(/name="([^"]+)"/);
    return match ? match[1] : null;
  };

  const send = async (prompt?: string) => {
    const msg = prompt || input.trim();
    if ((!msg && !attachedFile) || loading) return;
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
        if (diagramXml) setVersionStack((s) => [...s.slice(-9), diagramXml]);
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
  const handleUndo = () => { if (!versionStack.length) return; const prev = versionStack[versionStack.length - 1]; setVersionStack((s) => s.slice(0, -1)); setDiagramXml(prev); setDiagramTitle(extractTitle(prev)); setMessages((m) => [...m, { role: "assistant", content: "Reverted to previous version." }]); };
  const newDiagram = () => { setDiagramXml(null); setDiagramUrl(null); setDiagramKey(null); setDiagramTitle(null); setVersionStack([]); setMessages([]); setAttachedFile(null); };

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
  // ── Landing page (unauthenticated) ──────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT.sans }}>
        {/* Grid background (matches diagram area) */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "radial-gradient(circle, rgb(208, 213, 221) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

        {/* Nav */}
        <nav style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 18, fontWeight: 700, fontFamily: FONT.mono }}>B</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: FONT.mono }}>Blueprint</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="https://github.com/theinfinitra/blueprint" target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, textDecoration: "none", color: C.text, fontSize: 12, fontFamily: FONT.mono }} title="Star on GitHub">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              <span>Star</span>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </a>
            <button onClick={login} style={{ ...btnPrimary, padding: "8px 20px", fontSize: 13, display: "flex", alignItems: "center" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              Sign in
            </button>
          </div>
        </nav>

        {/* Hero */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "60px 32px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 44, fontWeight: 800, color: C.text, lineHeight: 1.2, marginBottom: 16, fontFamily: FONT.mono }}>
            AWS architecture diagrams<br />from a conversation
          </h1>
          <p style={{ fontSize: 18, color: C.textSecondary, maxWidth: 600, margin: "0 auto 32px", lineHeight: 1.6 }}>
            Describe your architecture in plain English. Get an editable .drawio file with proper AWS icons in seconds. <span style={{ fontFamily: FONT.handwritten, fontSize: 22 }}>Refine through chat.</span>
          </p>
          <button onClick={login} style={{ ...btnPrimary, padding: "14px 40px", fontSize: 16, borderRadius: 10, display: "inline-flex", alignItems: "center" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            Get started — it's free
          </button>
          <p style={{ fontSize: 13, color: C.textMuted, marginTop: 12, fontFamily: FONT.mono }}>5 diagrams/month free • No credit card required</p>
        </div>

        {/* Stats strip */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", gap: 32, padding: "24px 32px", maxWidth: 700, margin: "0 auto" }}>
          {[
            { value: "178", label: "AWS services" },
            { value: "~5s", label: "edit speed" },
            { value: "100%", label: "editable .drawio" },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.primary, fontFamily: FONT.mono }}>{value}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Before/After */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 950, margin: "0 auto", padding: "24px 32px 60px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1.6fr", gap: 20, alignItems: "center" }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, fontFamily: FONT.mono }}>YOUR PROMPT</div>
              <p style={{ fontSize: 15, color: C.text, fontFamily: FONT.mono, lineHeight: 1.6 }}>
                "3-tier web app with CloudFront, ALB, ECS Fargate, RDS PostgreSQL, and ElastiCache"
              </p>
            </div>
            <div style={{ fontSize: 28, color: C.textMuted }}>→</div>
            <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
              <img src="/screenshot.png" alt="Generated diagram" style={{ width: "100%", display: "block" }} />
            </div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "40px 32px 60px" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 40, fontFamily: FONT.mono }}>How it works</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
            {[
              { step: "1", title: "Describe", desc: "Tell Blueprint what you want in plain English. \"3-tier web app with ALB, ECS, and RDS.\"" },
              { step: "2", title: "Generate", desc: "AI creates a JSON spec. A deterministic renderer produces pixel-perfect draw.io XML with AWS icons." },
              { step: "3", title: "Iterate", desc: "\"Add CloudFront in front of the ALB.\" Edits take ~5 seconds via JSON patches — no regeneration." },
            ].map(({ step, title, desc }) => (
              <div key={step} style={{ textAlign: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: C.primary, color: "#fff", fontSize: 18, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12, fontFamily: FONT.mono }}>{step}</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: FONT.mono }}>{title}</h3>
                <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div style={{ position: "relative", zIndex: 1, background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 32px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {[
              { title: "Editable .drawio output", desc: "Open in draw.io, export to PNG/SVG/PDF. Full control over your diagrams." },
              { title: "178 AWS service icons", desc: "Official AWS Architecture Icons. Lambda, ECS, RDS, DynamoDB, CloudFront, and more." },
              { title: "Fast iterations", desc: "Edits via JSON patch in ~5s. No waiting for full regeneration." },
              { title: "Deterministic rendering", desc: "Style guide enforced in code. Consistent icons, fonts, and layout every time." },
            ].map(({ title, desc }) => (
              <div key={title} style={{ padding: 20 }}>
                <h4 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: FONT.mono }}>{title}</h4>
                <p style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.5 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "60px 32px", textAlign: "center" }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 16, fontFamily: FONT.mono }}>Start diagramming in seconds</h2>
          <button onClick={login} style={{ ...btnPrimary, padding: "14px 40px", fontSize: 16, borderRadius: 10, display: "inline-flex", alignItems: "center" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            Sign in with LinkedIn
          </button>
        </div>

        {/* Footer */}
        <footer style={{ position: "relative", zIndex: 1, padding: "24px 32px", textAlign: "center", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "center", gap: 16, alignItems: "center" }}>
          <p style={{ fontSize: 12, color: C.textMuted }}>© 2026 Blueprint</p>
          <a href="https://github.com/theinfinitra/blueprint" target="_blank" rel="noopener" style={{ color: C.textMuted, display: "flex" }} title="GitHub">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
        </footer>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.bg, fontFamily: FONT.sans }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", height: 48, borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: FONT.mono }}>B</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: C.text, fontFamily: FONT.mono }}>Blueprint</span>
          </a>
          {diagramTitle && (
            <>
              <div style={{ width: 1, height: 18, background: C.border }} />
              <span style={{ fontSize: 16, color: C.text, fontWeight: 700 }}>{diagramTitle}</span>
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
          {versionStack.length > 0 && <button onClick={handleUndo} style={btnAction} title="Revert to previous AI version"><History size={14} /><span>Revert</span></button>}
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
                  <div style={{ padding: "8px 16px 4px", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
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
                            setDiagramTitle(extractTitle(xml) || d.name); setVersionStack([]);
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
                          <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? C.text : C.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT.mono }}>
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
            position: "absolute", bottom: 20, right: 20, width: 400,
            height: "min(600px, calc(100% - 40px))",
            borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`,
            boxShadow: "0 12px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
            display: "flex", flexDirection: "column",
            zIndex: 30, overflow: "hidden",
          }}>
            {/* Chat header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: C.primary, flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bot size={16} color="#fff" />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Blueprint AI</span>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ ...btnIcon, width: 28, height: 28, color: "rgba(255,255,255,0.7)" }} title="Minimize chat">
                <ChevronRight size={16} style={{ transform: "rotate(90deg)" }} />
              </button>
            </div>
            {/* Chat messages */}
            <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ marginTop: "12vh", padding: "0 4px" }}>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <Sparkles size={18} color={C.primary} />
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginTop: 8 }}>What do you want to build?</p>
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
                          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{ex.prompt}</div>
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
                    fontSize: 14, lineHeight: 1.6,
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
                  <span style={{ fontFamily: FONT.mono, fontSize: 13 }}>{statusMsg}</span>
                </div>
              )}
              {!loading && diagramXml && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.textMuted }}>How was this?</span>
                    <button onClick={() => setMessages((m) => [...m, { role: "assistant", content: "Thanks for the feedback! 🎉" }])} style={{ ...btnIcon, width: 24, height: 24 }} title="Good">👍</button>
                    <button onClick={() => { const title = encodeURIComponent(`Feedback: ${diagramTitle || "diagram"}`); const body = encodeURIComponent("## What went wrong?\n\n\n## What did you expect?\n\n"); window.open(`https://github.com/theinfinitra/blueprint/issues/new?title=${title}&body=${body}`, "_blank"); }} style={{ ...btnIcon, width: 24, height: 24 }} title="Report issue">👎</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {getSmartActions(diagramXml || "").map((action) => (
                      <button key={action} onClick={() => send(action)} style={btnQuickAction}>
                        <ChevronRight size={10} />{action}
                      </button>
                    ))}
                  </div>
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
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...btnIcon, width: 38, height: 40, color: attachedFile ? C.primary : C.textMuted }} title="Attach file">
                  <Paperclip size={15} />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={loading ? "Generating..." : attachedFile ? "Describe what to generate..." : diagramKey ? "Modify this diagram..." : "Describe your architecture..."}
                  disabled={loading}
                  style={{
                    flex: 1, padding: "11px 4px", border: "none", outline: "none",
                    fontSize: 14, fontFamily: FONT.sans, color: C.text, background: "transparent",
                  }}
                  autoFocus
                />
                <button type="submit" disabled={loading || !input.trim()} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 40, height: 40, border: "none", cursor: "pointer",
                  background: loading || !input.trim() ? "transparent" : C.primary,
                  color: loading || !input.trim() ? C.textMuted : "#fff",
                  borderRadius: "0 9px 9px 0", transition: "all 0.15s", marginRight: 1,
                }}>
                  {loading ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={15} />}
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
  const isIoT = lower.includes("iot") || lower.includes("greengrass") || lower.includes("sensor");
  const isML = lower.includes("bedrock") || lower.includes("sagemaker") || lower.includes("ml");
  const isServerless = lower.includes("lambda") && (lower.includes("dynamodb") || lower.includes("api_gateway") || lower.includes("api gateway"));
  const isWebApp = lower.includes("alb") || lower.includes("ecs") || lower.includes("ec2") || lower.includes("fargate");
  const isDataPipeline = lower.includes("kinesis") || lower.includes("glue") || lower.includes("athena") || lower.includes("firehose");
  if (isIoT) {
    if (!lower.includes("kinesis")) actions.push("Add Kinesis for stream ingestion");
    if (!lower.includes("timestream") && !lower.includes("dynamodb")) actions.push("Add Timestream for time-series data");
    if (!lower.includes("lambda")) actions.push("Add Lambda for event processing");
  } else if (isDataPipeline) {
    if (!lower.includes("s3")) actions.push("Add S3 data lake");
    if (!lower.includes("redshift") && !lower.includes("athena")) actions.push("Add Athena for querying");
    if (!lower.includes("quicksight")) actions.push("Add QuickSight dashboards");
  } else if (isML) {
    if (!lower.includes("s3")) actions.push("Add S3 for model artifacts");
    if (!lower.includes("lambda") && !lower.includes("api_gateway")) actions.push("Add API Gateway + Lambda for inference endpoint");
    if (!lower.includes("cloudwatch")) actions.push("Add CloudWatch for model monitoring");
  } else if (isServerless) {
    if (!lower.includes("cognito")) actions.push("Add Cognito authentication");
    if (!lower.includes("cloudfront")) actions.push("Add CloudFront CDN");
    if (!lower.includes("sqs")) actions.push("Add SQS for async processing");
    if (!lower.includes("cloudwatch")) actions.push("Add CloudWatch monitoring");
  } else if (isWebApp) {
    if (!lower.includes("cloudfront")) actions.push("Add CloudFront CDN");
    if (!lower.includes("waf")) actions.push("Add WAF security layer");
    if (!lower.includes("elasticache") && !lower.includes("redis")) actions.push("Add ElastiCache caching");
    if (!lower.includes("cloudwatch")) actions.push("Add CloudWatch monitoring");
  } else {
    if (!lower.includes("cloudwatch")) actions.push("Add CloudWatch monitoring");
    if (!lower.includes("iam")) actions.push("Add IAM roles & policies");
    if (!lower.includes("cloudtrail")) actions.push("Add CloudTrail audit logging");
  }
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

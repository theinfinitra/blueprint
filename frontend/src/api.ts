const API = import.meta.env.VITE_API_ENDPOINT;

export interface SavedDiagram {
  key: string;
  name: string;
  size: number;
  modified: string;
  url: string;
}

export interface JobResult {
  status: "processing" | "complete" | "error";
  response?: string;
  diagram_key?: string;
  diagram_url?: string;
  diagram_xml?: string;
  error?: string;
}

async function startJob(prompt: string, token: string, diagramKey?: string | null): Promise<string> {
  const body: Record<string, string> = { prompt };
  if (diagramKey) body.diagram_key = diagramKey;

  const resp = await fetch(`${API}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `API error: ${resp.status}`);
  }
  return (await resp.json()).job_id;
}

async function pollJob(jobId: string, token: string): Promise<JobResult> {
  const resp = await fetch(`${API}/result?job_id=${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Poll error: ${resp.status}`);
  return resp.json();
}

export async function generateDiagram(
  prompt: string,
  token: string,
  onStatus: (msg: string, phase?: "thinking" | "building" | "done") => void,
  diagramKey?: string | null,
): Promise<JobResult> {
  onStatus("Starting generation...", "thinking");
  const jobId = await startJob(prompt, token, diagramKey);

  // Extract service names from prompt for skeleton display
  const services = extractServices(prompt);
  if (services.length > 0) {
    onStatus(`Building: ${services.join(", ")}...`, "building");
  } else {
    onStatus("Generating diagram...", "building");
  }

  const POLL_INTERVAL = 2500;
  const MAX_POLLS = 72; // 3 min

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const result = await pollJob(jobId, token);

    if (result.status === "complete") {
      onStatus("Done!", "done");
      return result;
    }
    if (result.status === "error") throw new Error(result.error || "Generation failed");

    const elapsed = Math.round(((i + 1) * POLL_INTERVAL) / 1000);
    if (services.length > 0) {
      onStatus(`Building: ${services.join(", ")}... ${elapsed}s`, "building");
    } else {
      onStatus(`Generating diagram... ${elapsed}s`, "building");
    }
  }
  throw new Error("Generation timed out");
}

export async function listDiagrams(token: string): Promise<SavedDiagram[]> {
  const resp = await fetch(`${API}/diagrams`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.diagrams || []).filter((d: SavedDiagram) => d.name.endsWith(".drawio"));
}

export async function fetchDiagram(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (resp.ok) return resp.text();
  } catch { /* ignore */ }
  return null;
}

/** Save edited diagram XML back to S3. */
export async function saveDiagramToS3(xml: string, key: string, token: string): Promise<boolean> {
  const resp = await fetch(`${API}/diagrams`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ xml, key }),
  });
  return resp.ok;
}

/** Delete a diagram (and its spec) from S3. */
export async function deleteDiagram(key: string, token: string): Promise<boolean> {
  const resp = await fetch(`${API}/diagrams?key=${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.ok;
}

/** Extract AWS service names from a prompt for skeleton display. */
function extractServices(prompt: string): string[] {
  const known = [
    "API Gateway", "Lambda", "DynamoDB", "S3", "CloudFront", "RDS", "ECS", "EKS",
    "Fargate", "ALB", "NLB", "Cognito", "SQS", "SNS", "EventBridge", "Step Functions",
    "CloudWatch", "CloudTrail", "WAF", "IAM", "KMS", "Bedrock", "SageMaker",
    "Kinesis", "Athena", "Glue", "OpenSearch", "ElastiCache", "Aurora", "Redshift",
    "Route 53", "NAT Gateway", "VPC", "EC2",
  ];
  const lower = prompt.toLowerCase();
  return known.filter((s) => lower.includes(s.toLowerCase()));
}

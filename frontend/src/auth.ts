/** Cognito OAuth2 PKCE auth — no SDK dependency. */

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;

interface Tokens {
  id_token: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function getStoredTokens(): Tokens | null {
  const raw = localStorage.getItem("diagram_tokens");
  if (!raw) return null;
  const tokens: Tokens = JSON.parse(raw);
  if (Date.now() > tokens.expires_at) {
    localStorage.removeItem("diagram_tokens");
    return null;
  }
  return tokens;
}

function storeTokens(data: { id_token: string; access_token: string; refresh_token: string; expires_in: number }) {
  const tokens: Tokens = {
    ...data,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  localStorage.setItem("diagram_tokens", JSON.stringify(tokens));
  return tokens;
}

// PKCE helpers
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

export async function login() {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem("pkce_verifier", verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid email profile",
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

export async function handleCallback(code: string): Promise<Tokens> {
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("Missing PKCE verifier");
  sessionStorage.removeItem("pkce_verifier");

  const resp = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: verifier,
    }),
  });

  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
  const data = await resp.json();
  return storeTokens(data);
}

export function logout() {
  localStorage.removeItem("diagram_tokens");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: window.location.origin,
  });
  window.location.href = `${COGNITO_DOMAIN}/logout?${params}`;
}

export function getToken(): string | null {
  return getStoredTokens()?.id_token ?? null;
}

export function isAuthenticated(): boolean {
  return getStoredTokens() !== null;
}

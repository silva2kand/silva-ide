param(
  [switch]$Apply,
  [switch]$Plan
)

$ErrorActionPreference = "Stop"

if (-not $Apply -and -not $Plan) { $Plan = $true }

function Get-CoworkOsElectronRoot {
  $root = Join-Path $env:APPDATA "npm\node_modules\cowork-os\dist\electron\electron"
  if (-not (Test-Path -LiteralPath $root)) {
    throw "cowork-os electron dist not found at: $root"
  }
  return $root
}

function New-BackupPath([string]$Path, [string]$Stamp) {
  return "$Path.bak.$Stamp"
}

function Ensure-ParentDir([string]$Path) {
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

function Read-Text([string]$Path) {
  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Write-TextIfChanged([string]$Path, [string]$Content, [ref]$PlannedChanges, [switch]$ApplyMode, [string]$Stamp) {
  $exists = Test-Path -LiteralPath $Path
  $before = if ($exists) { Read-Text $Path } else { "" }
  if ($before -eq $Content) { return }

  $PlannedChanges.Value += @{
    path = $Path
    action = if ($exists) { "update" } else { "create" }
  }

  if (-not $ApplyMode) { return }

  Ensure-ParentDir $Path
  if ($exists) {
    Copy-Item -LiteralPath $Path -Destination (New-BackupPath $Path $Stamp) -Force
  }
  else {
    New-Item -ItemType File -Path $Path -Force | Out-Null
  }
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function Replace-Once([string]$Text, [string]$Pattern, [string]$Replacement, [string]$FileLabel) {
  $normalizedPattern = $Pattern -replace '\\\\', '\'
  $re = [regex]::new($normalizedPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $m = $re.Match($Text)
  if (-not $m.Success) {
    throw "Patch failed ($FileLabel): pattern not found"
  }
  $after = $re.Replace($Text, $Replacement, 1)
  if ($after -eq $Text) {
    throw "Patch failed ($FileLabel): replacement produced no change"
  }
  return $after
}

function Patch-File([string]$Path, [scriptblock]$Transform, [ref]$PlannedChanges, [switch]$ApplyMode, [string]$Stamp) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "File not found: $Path"
  }
  $before = Read-Text $Path
  $after = & $Transform $before
  if ($after -eq $before) { return }

  $PlannedChanges.Value += @{ path = $Path; action = "update" }
  if (-not $ApplyMode) { return }

  Copy-Item -LiteralPath $Path -Destination (New-BackupPath $Path $Stamp) -Force
  Set-Content -LiteralPath $Path -Value $after -Encoding UTF8
}

$stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$root = Get-CoworkOsElectronRoot

$planned = @()

$microsoftOAuthJs = @'
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMicrosoftOAuth = startMicrosoftOAuth;
const http_1 = __importDefault(require("http"));
const crypto_1 = require("crypto");
const url_1 = require("url");
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const OAUTH_CALLBACK_PORT = 18767;
const MICROSOFT_AUTHORIZE_BASE = "https://login.microsoftonline.com";
const MICROSOFT_DEFAULT_TENANT = "common";
const MICROSOFT_OAUTH_VERSION_PATH = "oauth2/v2.0";
function getElectronShell() {
    try {
        const electron = require("electron");
        const shell = electron?.shell;
        if (shell?.openExternal)
            return shell;
    }
    catch {
    }
    return null;
}
async function openExternalUrl(url) {
    const shell = getElectronShell();
    if (!shell?.openExternal) {
        throw new Error("Electron shell is unavailable outside the Electron runtime");
    }
    await shell.openExternal(url);
}
function base64Url(buffer) {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function createCodeVerifier() {
    return base64Url((0, crypto_1.randomBytes)(32));
}
function createCodeChallenge(verifier) {
    const hash = (0, crypto_1.createHash)("sha256").update(verifier).digest();
    return base64Url(hash);
}
function parseJsonSafe(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return undefined;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return undefined;
    }
}
function parseScopeList(scope) {
    if (!scope)
        return undefined;
    return scope
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
}
async function startOAuthCallbackServer(timeoutMs = DEFAULT_TIMEOUT_MS) {
    const state = base64Url((0, crypto_1.randomBytes)(16));
    return new Promise((resolve, reject) => {
        const server = http_1.default.createServer();
        let resolveCode = () => { };
        let rejectCode = () => { };
        const codePromise = new Promise((innerResolve, innerReject) => {
            resolveCode = innerResolve;
            rejectCode = innerReject;
        });
        const timeout = setTimeout(() => {
            server.close();
            rejectCode(new Error("OAuth timed out. Please try again."));
        }, timeoutMs);
        server.on("request", (req, res) => {
            if (!req.url) {
                res.writeHead(400);
                res.end("Invalid request");
                return;
            }
            const url = new url_1.URL(req.url, "http://127.0.0.1");
            if (url.pathname !== "/oauth/callback") {
                res.writeHead(404);
                res.end("Not found");
                return;
            }
            const code = url.searchParams.get("code");
            const returnedState = url.searchParams.get("state");
            const error = url.searchParams.get("error");
            const errorDescription = url.searchParams.get("error_description");
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', system-ui, sans-serif; padding: 24px;">
        <h2>Authorization complete</h2>
        <p>You can close this window and return to CoWork OS.</p>
      </body></html>`);
            clearTimeout(timeout);
            server.close();
            if (error) {
                rejectCode(new Error(errorDescription || error));
                return;
            }
            if (!code || !returnedState) {
                rejectCode(new Error("Missing OAuth code or state"));
                return;
            }
            if (returnedState !== state) {
                rejectCode(new Error("OAuth state mismatch"));
                return;
            }
            resolveCode({ code, state: returnedState });
        });
        server.on("error", (error) => {
            clearTimeout(timeout);
            const portMessage = error.code === "EADDRINUSE"
                ? `Port ${OAUTH_CALLBACK_PORT} is already in use. Close the conflicting app and try again.`
                : error.message;
            reject(new Error(`OAuth callback server failed: ${portMessage}`));
        });
        server.listen(OAUTH_CALLBACK_PORT, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                clearTimeout(timeout);
                server.close();
                reject(new Error("Failed to start OAuth callback server"));
                return;
            }
            const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
            resolve({
                redirectUri,
                state,
                waitForCode: () => codePromise,
            });
        });
    });
}
function buildMicrosoftEndpoint(tenantId, path) {
    const tenant = (tenantId && String(tenantId).trim()) || MICROSOFT_DEFAULT_TENANT;
    return `${MICROSOFT_AUTHORIZE_BASE}/${encodeURIComponent(tenant)}/${MICROSOFT_OAUTH_VERSION_PATH}/${path}`;
}
async function startMicrosoftOAuth(request) {
    if (!request?.clientId) {
        throw new Error("Microsoft OAuth requires a client ID");
    }
    const scopes = request.scopes && request.scopes.length > 0
        ? request.scopes
        : ["offline_access", "Mail.Read", "Mail.Send", "User.Read"];
    const { redirectUri, waitForCode, state } = await startOAuthCallbackServer();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const authorizeUrl = new url_1.URL(buildMicrosoftEndpoint(request.tenantId, "authorize"));
    authorizeUrl.searchParams.set("client_id", request.clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_mode", "query");
    authorizeUrl.searchParams.set("scope", scopes.join(" "));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("prompt", request.prompt || "select_account");
    await openExternalUrl(authorizeUrl.toString());
    const { code } = await waitForCode();
    const tokenUrl = buildMicrosoftEndpoint(request.tenantId, "token");
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: request.clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        scope: scopes.join(" "),
    });
    const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });
    const rawText = typeof tokenResponse.text === "function" ? await tokenResponse.text() : "";
    const tokenData = rawText ? parseJsonSafe(rawText) : undefined;
    if (!tokenResponse.ok) {
        const message = tokenData?.error_description ||
            tokenData?.error ||
            tokenResponse.statusText ||
            "OAuth failed";
        throw new Error(`Microsoft OAuth failed: ${message}`);
    }
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
        throw new Error("Microsoft OAuth did not return an access_token");
    }
    const expiresIn = typeof tokenData?.expires_in === "number" ? tokenData.expires_in : undefined;
    const scopesGranted = parseScopeList(tokenData?.scope);
    return {
        accessToken,
        refreshToken: tokenData?.refresh_token,
        expiresIn,
        tokenType: tokenData?.token_type,
        scopes: scopesGranted,
    };
}
'@

$graphEmailClientJs = @'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrosoftGraphEmailClient = void 0;
const events_1 = require("events");
const microsoft_oauth_1 = require("../../utils/microsoft-oauth");
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_SCOPES = ["offline_access", "Mail.Read", "Mail.Send", "User.Read"];
class MicrosoftGraphEmailClient extends events_1.EventEmitter {
    options;
    connected = false;
    pollInFlight = false;
    pollTimer;
    seenMessageIds = new Set();
    seenOrder = [];
    MAX_SEEN_CACHE = 2000;
    accountEmail;
    constructor(options) {
        super();
        this.options = {
            ...options,
            pollInterval: Math.max(1000, Number(options.pollInterval || 30000)),
            timeoutMs: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
            tenantId: (options.tenantId && String(options.tenantId).trim()) || "common",
            scopes: Array.isArray(options.scopes) && options.scopes.length > 0 ? options.scopes : DEFAULT_SCOPES,
        };
    }
    async checkConnection() {
        try {
            const me = await this.request("/me", { method: "GET" });
            const email = (typeof me?.mail === "string" && me.mail) ||
                (typeof me?.userPrincipalName === "string" && me.userPrincipalName) ||
                this.accountEmail ||
                undefined;
            if (email) {
                this.accountEmail = email;
            }
            return { success: true, email: email || "Microsoft Graph" };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    async startReceiving() {
        if (this.connected)
            return;
        this.connected = true;
        this.emit("connected");
        await this.pollMailbox();
        this.pollTimer = setInterval(() => {
            void this.pollMailbox();
        }, this.options.pollInterval);
    }
    async stopReceiving() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
        this.connected = false;
        this.pollInFlight = false;
        this.emit("disconnected");
    }
    getEmail() {
        return this.accountEmail || "Microsoft Graph";
    }
    async fetchUnreadEmails(limit) {
        const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 50);
        const messages = await this.fetchUnreadMessages(safeLimit);
        return messages.map((m) => this.toEmailMessage(m));
    }
    async sendEmail(options) {
        const headers = [];
        if (options.inReplyTo) {
            headers.push({ name: "In-Reply-To", value: options.inReplyTo });
        }
        if (options.references && options.references.length > 0) {
            headers.push({ name: "References", value: options.references.join(" ") });
        }
        const payload = {
            message: {
                subject: options.subject,
                body: {
                    contentType: "Text",
                    content: options.text,
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: options.to,
                        },
                    },
                ],
                ...(headers.length > 0 ? { internetMessageHeaders: headers } : {}),
            },
            saveToSentItems: true,
        };
        await this.request("/me/sendMail", { method: "POST", body: payload });
        return `graph-${Date.now()}`;
    }
    async markAsRead(messageId) {
        if (!messageId)
            return;
        await this.request(`/me/messages/${encodeURIComponent(String(messageId))}`, {
            method: "PATCH",
            body: { isRead: true },
        });
    }
    async pollMailbox() {
        if (!this.connected || this.pollInFlight)
            return;
        this.pollInFlight = true;
        try {
            const messages = await this.fetchUnreadMessages(200);
            const oldestFirst = [...messages].sort((a, b) => {
                const aDate = Date.parse(String(a.receivedDateTime || ""));
                const bDate = Date.parse(String(b.receivedDateTime || ""));
                if (Number.isNaN(aDate) && Number.isNaN(bDate))
                    return 0;
                if (Number.isNaN(aDate))
                    return -1;
                if (Number.isNaN(bDate))
                    return 1;
                return aDate - bDate;
            });
            for (const message of oldestFirst) {
                const messageId = typeof message?.id === "string" ? message.id : undefined;
                if (!messageId)
                    continue;
                if (this.seenMessageIds.has(messageId))
                    continue;
                this.rememberSeenMessage(messageId);
                this.emit("message", this.toEmailMessage(message));
            }
        }
        catch (error) {
            this.emit("error", error instanceof Error ? error : new Error(String(error)));
        }
        finally {
            this.pollInFlight = false;
        }
    }
    rememberSeenMessage(messageId) {
        this.seenMessageIds.add(messageId);
        this.seenOrder.push(messageId);
        while (this.seenOrder.length > this.MAX_SEEN_CACHE) {
            const oldest = this.seenOrder.shift();
            if (oldest)
                this.seenMessageIds.delete(oldest);
        }
    }
    buildTokenEndpoint() {
        const tenant = this.options.tenantId || "common";
        return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
    }
    async ensureAccessToken() {
        const now = Date.now();
        const expiresAt = Number.isFinite(this.options.expiresAt) ? Number(this.options.expiresAt) : undefined;
        if (this.options.accessToken && expiresAt && now < expiresAt - 60_000) {
            return this.options.accessToken;
        }
        if (this.options.refreshToken) {
            const refreshed = await this.refreshAccessToken();
            return refreshed;
        }
        if (this.options.interactiveAuth !== false) {
            const oauth = await (0, microsoft_oauth_1.startMicrosoftOAuth)({
                clientId: this.options.clientId,
                tenantId: this.options.tenantId,
                scopes: this.options.scopes,
            });
            const nextExpiresAt = typeof oauth.expiresIn === "number" ? now + oauth.expiresIn * 1000 : undefined;
            this.options.accessToken = oauth.accessToken;
            if (oauth.refreshToken) {
                this.options.refreshToken = oauth.refreshToken;
            }
            this.options.expiresAt = nextExpiresAt;
            this.options.onTokensUpdated?.({
                microsoftAccessToken: this.options.accessToken,
                microsoftRefreshToken: this.options.refreshToken,
                microsoftExpiresAt: this.options.expiresAt,
            });
            return oauth.accessToken;
        }
        throw new Error("Microsoft Graph access token not configured");
    }
    async refreshAccessToken() {
        const params = new URLSearchParams({
            client_id: this.options.clientId,
            grant_type: "refresh_token",
            refresh_token: this.options.refreshToken,
            scope: this.options.scopes.join(" "),
        });
        const tokenResponse = await fetch(this.buildTokenEndpoint(), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });
        const rawText = typeof tokenResponse.text === "function" ? await tokenResponse.text() : "";
        let tokenData;
        try {
            tokenData = rawText ? JSON.parse(rawText) : undefined;
        }
        catch {
            tokenData = undefined;
        }
        if (!tokenResponse.ok) {
            const message = tokenData?.error_description || tokenData?.error || tokenResponse.statusText || "Token refresh failed";
            throw new Error(`Microsoft OAuth refresh failed: ${message}`);
        }
        const accessToken = tokenData?.access_token;
        if (!accessToken) {
            throw new Error("Microsoft OAuth refresh did not return an access_token");
        }
        const now = Date.now();
        const expiresIn = typeof tokenData?.expires_in === "number" ? tokenData.expires_in : undefined;
        const nextExpiresAt = typeof expiresIn === "number" ? now + expiresIn * 1000 : undefined;
        this.options.accessToken = accessToken;
        if (typeof tokenData?.refresh_token === "string" && tokenData.refresh_token) {
            this.options.refreshToken = tokenData.refresh_token;
        }
        this.options.expiresAt = nextExpiresAt;
        this.options.onTokensUpdated?.({
            microsoftAccessToken: this.options.accessToken,
            microsoftRefreshToken: this.options.refreshToken,
            microsoftExpiresAt: this.options.expiresAt,
        });
        return accessToken;
    }
    async request(path, options) {
        const token = await this.ensureAccessToken();
        const url = `${GRAPH_BASE}${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
        try {
            const response = await fetch(url, {
                method: options.method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    ...(options.headers || {}),
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });
            const rawText = typeof response.text === "function" ? await response.text() : "";
            let data;
            try {
                data = rawText ? JSON.parse(rawText) : undefined;
            }
            catch {
                data = undefined;
            }
            if (!response.ok) {
                const message = data?.error?.message || data?.message || response.statusText || "Microsoft Graph error";
                throw new Error(`Microsoft Graph error ${response.status}: ${message}`);
            }
            return data;
        }
        catch (error) {
            if (error?.name === "AbortError") {
                throw new Error("Microsoft Graph request timed out");
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async fetchUnreadMessages(limit) {
        const cappedLimit = Math.max(1, Math.min(Number(limit || 50), 200));
        const mailbox = (this.options.mailboxFolder && String(this.options.mailboxFolder).trim()) || "inbox";
        const select = [
            "id",
            "subject",
            "bodyPreview",
            "receivedDateTime",
            "from",
            "toRecipients",
            "internetMessageId",
            "isRead",
            "inReplyTo",
        ].join(",");
        const url = `/me/mailFolders/${encodeURIComponent(mailbox)}/messages` +
            `?$top=${cappedLimit}` +
            `&$orderby=receivedDateTime desc` +
            `&$filter=isRead eq false` +
            `&$select=${encodeURIComponent(select)}`;
        const response = await this.request(url, { method: "GET" });
        const values = Array.isArray(response?.value) ? response.value : [];
        return values;
    }
    toEmailMessage(message) {
        const fromAddress = message?.from?.emailAddress?.address || "";
        const fromName = message?.from?.emailAddress?.name || undefined;
        const toRecipients = Array.isArray(message?.toRecipients) ? message.toRecipients : [];
        const to = toRecipients
            .map((r) => ({
            name: r?.emailAddress?.name,
            address: r?.emailAddress?.address,
        }))
            .filter((r) => typeof r.address === "string" && r.address);
        const internetMessageIdRaw = typeof message?.internetMessageId === "string" ? message.internetMessageId : "";
        const internetMessageId = internetMessageIdRaw ? internetMessageIdRaw.replace(/[<>]/g, "") : undefined;
        const uid = typeof message?.id === "string" ? message.id : `graph-${Date.now()}`;
        const dateRaw = typeof message?.receivedDateTime === "string" ? message.receivedDateTime : "";
        const date = dateRaw ? new Date(dateRaw) : new Date();
        return {
            messageId: internetMessageId || uid,
            uid,
            from: { name: fromName, address: fromAddress || "unknown" },
            to,
            subject: typeof message?.subject === "string" && message.subject ? message.subject : "(No Subject)",
            text: typeof message?.bodyPreview === "string" ? message.bodyPreview : "",
            date,
            inReplyTo: typeof message?.inReplyTo === "string" ? message.inReplyTo.replace(/[<>]/g, "") : undefined,
            references: undefined,
            isRead: message?.isRead === true,
            headers: new Map(),
        };
    }
}
exports.MicrosoftGraphEmailClient = MicrosoftGraphEmailClient;
'@

Write-TextIfChanged -Path (Join-Path $root "utils\microsoft-oauth.js") -Content $microsoftOAuthJs -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp
Write-TextIfChanged -Path (Join-Path $root "gateway\channels\microsoft-graph-email-client.js") -Content $graphEmailClientJs -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp

Patch-File -Path (Join-Path $root "utils\loom.js") -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp -Transform {
  param($text)
  if ($text -match "ms-graph") { return $text }
  $pattern = "function normalizeEmailProtocol\\(rawProtocol\\)\\s*\\{[\\s\\S]*?\\}"
  $replacement = @'
function normalizeEmailProtocol(rawProtocol) {
    const value = String(rawProtocol || "").trim().toLowerCase();
    if (value === "loom") {
        return "loom";
    }
    if (value === "ms-graph" || value === "microsoft" || value === "graph" || value === "outlook") {
        return "ms-graph";
    }
    return "imap-smtp";
}
'@
  return Replace-Once $text $pattern $replacement "utils/loom.js normalizeEmailProtocol"
}

Patch-File -Path (Join-Path $root "utils\validation.js") -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp -Transform {
  param($text)
  if ($text -match "emailMicrosoftClientId") { return $text }

  $text = $text -replace 'zod_1\\.z\\.enum\\(\\["imap-smtp", "loom"\\]\\)', 'zod_1.z.enum(["imap-smtp", "loom", "ms-graph"])'

  $text = Replace-Once $text `
    'loomAccessToken:\\s*"emailLoomAccessToken",\\s*\\n\\s*\\},\\s*\\n\\s*update:\\s*\\{' `
    @'
loomAccessToken: "emailLoomAccessToken",
        microsoftClientId: "emailMicrosoftClientId",
        microsoftTenantId: "emailMicrosoftTenantId",
        microsoftScopes: "emailMicrosoftScopes",
        microsoftAccessToken: "emailMicrosoftAccessToken",
        microsoftRefreshToken: "emailMicrosoftRefreshToken",
        microsoftExpiresAt: "emailMicrosoftExpiresAt",
    },
    update: {
'@ `
    "utils/validation.js EMAIL_FIELD_KEY_MAP add"

  $text = Replace-Once $text `
    'loomAccessToken:\\s*"loomAccessToken",\\s*\\n\\s*\\},\\s*\\n\\};\\s*\\nconst EMAIL_TRANSPORT_BASE_SHAPES' `
    @'
loomAccessToken: "loomAccessToken",
        microsoftClientId: "microsoftClientId",
        microsoftTenantId: "microsoftTenantId",
        microsoftScopes: "microsoftScopes",
        microsoftAccessToken: "microsoftAccessToken",
        microsoftRefreshToken: "microsoftRefreshToken",
        microsoftExpiresAt: "microsoftExpiresAt",
    },
};
const EMAIL_TRANSPORT_BASE_SHAPES'@ `
    "utils/validation.js EMAIL_FIELD_KEY_MAP update"

  $text = Replace-Once $text `
    '\\[EMAIL_FIELD_KEY_MAP\\.add\\.loomAccessToken\\]: zod_1\\.z\\.string\\(\\)\\.min\\(1\\)\\.max\\(4000\\)\\.optional\\(\\),' `
    @'
[EMAIL_FIELD_KEY_MAP.add.loomAccessToken]: zod_1.z.string().min(1).max(4000).optional(),
        [EMAIL_FIELD_KEY_MAP.add.microsoftClientId]: zod_1.z.string().min(1).max(200).optional(),
        [EMAIL_FIELD_KEY_MAP.add.microsoftTenantId]: zod_1.z.string().min(1).max(100).optional(),
        [EMAIL_FIELD_KEY_MAP.add.microsoftScopes]: zod_1.z.array(zod_1.z.string().min(1).max(200)).max(50).optional(),
        [EMAIL_FIELD_KEY_MAP.add.microsoftAccessToken]: zod_1.z.string().min(1).max(4000).optional(),
        [EMAIL_FIELD_KEY_MAP.add.microsoftRefreshToken]: zod_1.z.string().min(1).max(4000).optional(),
        [EMAIL_FIELD_KEY_MAP.add.microsoftExpiresAt]: zod_1.z.number().int().min(0).optional(),
'@ `
    "utils/validation.js EMAIL_TRANSPORT_BASE_SHAPES add"

  $text = Replace-Once $text `
    '\\[EMAIL_FIELD_KEY_MAP\\.update\\.loomAccessToken\\]: zod_1\\.z\\.string\\(\\)\\.min\\(1\\)\\.max\\(4000\\)\\.optional\\(\\),' `
    @'
[EMAIL_FIELD_KEY_MAP.update.loomAccessToken]: zod_1.z.string().min(1).max(4000).optional(),
        [EMAIL_FIELD_KEY_MAP.update.microsoftClientId]: zod_1.z.string().min(1).max(200).optional(),
        [EMAIL_FIELD_KEY_MAP.update.microsoftTenantId]: zod_1.z.string().min(1).max(100).optional(),
        [EMAIL_FIELD_KEY_MAP.update.microsoftScopes]: zod_1.z.array(zod_1.z.string().min(1).max(200)).max(50).optional(),
        [EMAIL_FIELD_KEY_MAP.update.microsoftAccessToken]: zod_1.z.string().min(1).max(4000).optional(),
        [EMAIL_FIELD_KEY_MAP.update.microsoftRefreshToken]: zod_1.z.string().min(1).max(4000).optional(),
        [EMAIL_FIELD_KEY_MAP.update.microsoftExpiresAt]: zod_1.z.number().int().min(0).optional(),
'@ `
    "utils/validation.js EMAIL_TRANSPORT_BASE_SHAPES update"

  $text = Replace-Once $text `
    'if \\(protocol === "loom"\\) \\{[\\s\\S]*?return;\\s*\\}\\s*if \\(!getOptionalString\\(data\\[fieldMap\\.email\\]\\)\\) \\{' `
    @'
if (protocol === "loom") {
        if (!getOptionalString(data[fieldMap.loomBaseUrl])) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: [fieldMap.loomBaseUrl],
                message: `LOOM base URL is required when ${fieldMap.protocol === "protocol" ? "protocol" : "emailProtocol"} is "loom"`,
            });
        }
        else if (typeof data[fieldMap.loomBaseUrl] === "string" &&
            !(0, loom_1.isSecureOrLocalLoomUrl)(data[fieldMap.loomBaseUrl])) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: [fieldMap.loomBaseUrl],
                message: "LOOM base URL must use HTTPS unless it points to localhost/127.0.0.1/::1",
            });
        }
        if (!getOptionalString(data[fieldMap.loomAccessToken])) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: [fieldMap.loomAccessToken],
                message: `LOOM access token is required when ${fieldMap.protocol === "protocol" ? "protocol" : "emailProtocol"} is "loom"`,
            });
        }
        return;
    }
    if (protocol === "ms-graph") {
        return;
    }
    if (!getOptionalString(data[fieldMap.email])) {
'@ `
    "utils/validation.js validateEmailChannelConfigByProtocol"

  return $text
}

Patch-File -Path (Join-Path $root "gateway\channel-registry.js") -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp -Transform {
  param($text)
  if ($text -match "microsoftClientId") { return $text }
  $text = $text -replace 'Transport protocol: "imap-smtp" \\(default\\) or "loom"', 'Transport protocol: "imap-smtp" (default), "loom", or "ms-graph"'
  $insertAfter = 'default: "imap-smtp",\s*\n\s*\},'
  $replacement = @'
default: "imap-smtp",
                        },
                        microsoftClientId: {
                            type: "string",
                            description: "Microsoft Entra app (client) ID for ms-graph mode (optional; uses built-in default if omitted)",
                        },
                        microsoftTenantId: {
                            type: "string",
                            description: 'Microsoft tenant for ms-graph mode (default: "common")',
                            default: "common",
                        },
                        microsoftScopes: {
                            type: "array",
                            description: "OAuth scopes for Microsoft Graph (optional)",
                        },
                        microsoftAccessToken: {
                            type: "string",
                            description: "Microsoft Graph access token (auto-filled after OAuth)",
                            secret: true,
                        },
                        microsoftRefreshToken: {
                            type: "string",
                            description: "Microsoft Graph refresh token (auto-filled after OAuth)",
                            secret: true,
                        },
                        microsoftExpiresAt: {
                            type: "number",
                            description: "Access token expiry timestamp (ms since epoch)",
                        },
                        },
'@
  $pattern = 'default: "imap-smtp",\s*\n\s*\},'
  return Replace-Once $text $pattern $replacement "gateway/channel-registry.js email configSchema"
}

Patch-File -Path (Join-Path $root "gateway\index.js") -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp -Transform {
  param($text)
  if ($text -match "ms-graph") { return $text }
  $text = Replace-Once $text `
    'const protocol = options\\?\\.protocol === "loom" \\? "loom" : "imap-smtp";' `
    'const protocol = options?.protocol === "loom" ? "loom" : options?.protocol === "ms-graph" ? "ms-graph" : "imap-smtp";' `
    "gateway/index.js addEmailChannel protocol"

  $pattern = 'const config = protocol === "loom"\\s*\\? \\{[\\s\\S]*?\\}\\s*: \\{[\\s\\S]*?\\};'
  $replacement = @'
const config = protocol === "loom"
            ? {
                protocol: "loom",
                loomBaseUrl: options?.loomBaseUrl,
                loomAccessToken: options?.loomAccessToken,
                loomIdentity: options?.loomIdentity,
                loomMailboxFolder: options?.loomMailboxFolder ?? "INBOX",
                loomPollInterval: options?.loomPollInterval ?? 30000,
                displayName,
            }
            : protocol === "ms-graph"
                ? {
                    protocol: "ms-graph",
                    microsoftClientId: options?.microsoftClientId,
                    microsoftTenantId: options?.microsoftTenantId ?? "common",
                    microsoftScopes: options?.microsoftScopes,
                    microsoftAccessToken: options?.microsoftAccessToken,
                    microsoftRefreshToken: options?.microsoftRefreshToken,
                    microsoftExpiresAt: options?.microsoftExpiresAt,
                    mailbox: options?.mailbox ?? "inbox",
                    pollInterval: options?.pollInterval ?? 30000,
                    markAsRead: options?.markAsRead ?? true,
                    displayName,
                    allowedSenders,
                    subjectFilter,
                }
                : {
                    protocol: "imap-smtp",
                    email,
                    password,
                    imapHost,
                    imapPort: options?.imapPort ?? 993,
                    imapSecure: true,
                    smtpHost,
                    smtpPort: options?.smtpPort ?? 587,
                    smtpSecure: false,
                    displayName,
                    allowedSenders,
                    subjectFilter,
                };
'@
  $text = Replace-Once $text $pattern $replacement "gateway/index.js addEmailChannel config"

  $text = Replace-Once $text `
    'loomStatePath,\\s*\\n\\s*\\}\\);' `
    @'
loomStatePath,
                    microsoftClientId: channel.config.microsoftClientId,
                    microsoftTenantId: channel.config.microsoftTenantId,
                    microsoftScopes: channel.config.microsoftScopes,
                    microsoftAccessToken: channel.config.microsoftAccessToken,
                    microsoftRefreshToken: channel.config.microsoftRefreshToken,
                    microsoftExpiresAt: channel.config.microsoftExpiresAt,
                    channelId: channel.id,
                    onConfigUpdate: (partial) => {
                        try {
                            if (!partial || typeof partial !== "object")
                                return;
                            const latest = this.channelRepo.findById(channel.id);
                            if (!latest)
                                return;
                            this.updateChannel(channel.id, { config: { ...latest.config, ...partial } });
                        }
                        catch {
                        }
                    },
                });
'@ `
    "gateway/index.js createAdapterForChannel email pass-through"

  return $text
}

Patch-File -Path (Join-Path $root "gateway\channels\email.js") -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp -Transform {
  param($text)
  if ($text -match "MicrosoftGraphEmailClient") { return $text }
  $text = Replace-Once $text `
    'const loom_client_1 = require\\("\\./loom-client"\\);' `
    ('const loom_client_1 = require("./loom-client");' + "`n" + 'const microsoft_graph_email_client_1 = require("./microsoft-graph-email-client");') `
    "gateway/channels/email.js add graph client require"

  $text = Replace-Once $text `
    'const protocol = \\(0, loom_1\\.normalizeEmailProtocol\\)\\(config\\.protocol\\);\\s*\\n\\s*this\\.config = \\{[\\s\\S]*?\\n\\s*\\};' `
    @'
const protocol = (0, loom_1.normalizeEmailProtocol)(config.protocol);
        this.config = {
            ...config,
            protocol,
            imapPort: config.imapPort ?? 993,
            imapSecure: config.imapSecure ?? true,
            smtpPort: config.smtpPort ?? 587,
            smtpSecure: config.smtpSecure ?? false,
            mailbox: config.mailbox ?? (protocol === "ms-graph" ? "inbox" : "INBOX"),
            pollInterval: config.pollInterval ?? 30000,
            markAsRead: config.markAsRead ?? true,
            deduplicationEnabled: config.deduplicationEnabled ?? true,
            loomMailboxFolder: config.loomMailboxFolder ?? "INBOX",
            loomPollInterval: config.loomPollInterval ?? config.pollInterval ?? 30000,
        };
'@ `
    "gateway/channels/email.js constructor config defaults"

  $text = Replace-Once $text `
    'if \\(protocol === "loom"\\) \\{\\s*\\n\\s*const loomBaseUrl = this\\.config\\.loomBaseUrl;' `
    @'
if (protocol === "ms-graph") {
                const clientId = this.config.microsoftClientId || "a0c978a3-720e-48ea-80a5-f1a80535153a";
                this.client = new microsoft_graph_email_client_1.MicrosoftGraphEmailClient({
                    clientId,
                    tenantId: this.config.microsoftTenantId || "common",
                    scopes: this.config.microsoftScopes,
                    accessToken: this.config.microsoftAccessToken,
                    refreshToken: this.config.microsoftRefreshToken,
                    expiresAt: this.config.microsoftExpiresAt,
                    mailboxFolder: this.config.mailbox || "inbox",
                    pollInterval: this.config.pollInterval || 30000,
                    timeoutMs: this.config.timeoutMs,
                    interactiveAuth: true,
                    onTokensUpdated: (tokens) => {
                        try {
                            const fn = this.config.onConfigUpdate;
                            if (typeof fn === "function") {
                                fn(tokens);
                            }
                        }
                        catch {
                        }
                    },
                });
            }
            else if (protocol === "loom") {
                const loomBaseUrl = this.config.loomBaseUrl;
'@ `
    "gateway/channels/email.js connect ms-graph branch"

  $text = Replace-Once $text `
    'if \\(protocol === "loom"\\) \\{[\\s\\S]*?return new EmailAdapter\\(\\{\\s*\\n\\s*\\.\\.\\.config,\\s*\\n\\s*protocol: "loom",[\\s\\S]*?\\}\\);\\s*\\n\\s*\\}\\s*if \\(!config\\.imapHost\\) \\{' `
    @'
if (protocol === "ms-graph") {
        return new EmailAdapter({
            ...config,
            protocol: "ms-graph",
        });
    }
    if (protocol === "loom") {
        if (!config.loomBaseUrl) {
            throw new Error("LOOM base URL is required");
        }
        if (!config.loomAccessToken) {
            throw new Error("LOOM access token is required");
        }
        (0, loom_1.assertSafeLoomBaseUrl)(config.loomBaseUrl);
        const safeLoomMailboxFolder = (0, loom_1.assertSafeLoomMailboxFolder)(config.loomMailboxFolder);
        return new EmailAdapter({
            ...config,
            protocol: "loom",
            loomMailboxFolder: safeLoomMailboxFolder,
        });
    }
    if (!config.imapHost) {
'@ `
    "gateway/channels/email.js createEmailAdapter support ms-graph"

  return $text
}

Patch-File -Path (Join-Path $root "ipc\handlers.js") -PlannedChanges ([ref]$planned) -ApplyMode:$Apply -Stamp $stamp -Transform {
  param($text)
  if ($text -match "emailMicrosoftClientId") { return $text }

  $pattern = 'loomMailboxFolder:\\s*validated\\.emailLoomMailboxFolder,\\s*\\n\\s*loomPollInterval:\\s*validated\\.emailLoomPollInterval,\\s*\\n\\s*\\}\\);'
  $replacement = @'
loomMailboxFolder: validated.emailLoomMailboxFolder,
                loomPollInterval: validated.emailLoomPollInterval,
                microsoftClientId: validated.emailMicrosoftClientId,
                microsoftTenantId: validated.emailMicrosoftTenantId,
                microsoftScopes: validated.emailMicrosoftScopes,
                microsoftAccessToken: validated.emailMicrosoftAccessToken,
                microsoftRefreshToken: validated.emailMicrosoftRefreshToken,
                microsoftExpiresAt: validated.emailMicrosoftExpiresAt,
            });
'@

  return Replace-Once $text $pattern $replacement "ipc/handlers.js addEmailChannel ms-graph options"
}

if ($Plan) {
  if ($planned.Count -eq 0) {
    Write-Output "No changes needed. Microsoft OAuth Email patch already applied."
    exit 0
  }
  Write-Output ""
  Write-Output "Planned changes:"
  foreach ($c in $planned) {
    Write-Output ("- {0}: {1}" -f $c.action, $c.path)
  }
  Write-Output ""
  Write-Output "Run:"
  Write-Output "  .\patch-cowork-os-microsoft-email.ps1 -Apply"
  exit 0
}

if ($Apply) {
  if ($planned.Count -eq 0) {
    Write-Output "No changes needed."
    exit 0
  }
  Write-Output "Applied changes:"
  foreach ($c in $planned) {
    Write-Output ("- {0}: {1}" -f $c.action, $c.path)
  }
  Write-Output ""
  Write-Output "Restart CoWork OS."
}

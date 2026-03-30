import { useState, useEffect, useCallback } from "react";
import {
  ChannelData,
  ChannelUserData,
  SecurityMode,
  ContextType,
  ContextPolicy,
} from "../../shared/types";
import { PairingCodeDisplay } from "./PairingCodeDisplay";
import { ContextPolicySettings } from "./ContextPolicySettings";

// ── Bulk Account Setup ─────────────────────────────────────────────────────────
interface BulkAccountRow {
  name: string;
  email: string;
  password: string;
  preset: "gmail" | "outlook" | "yahoo" | "custom";
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

const PRESETS: Record<string, Pick<BulkAccountRow, "imapHost" | "imapPort" | "smtpHost" | "smtpPort">> = {
  gmail:   { imapHost: "imap.gmail.com",          imapPort: 993, smtpHost: "smtp.gmail.com",          smtpPort: 587 },
  outlook: { imapHost: "outlook.office365.com",   imapPort: 993, smtpHost: "smtp.office365.com",      smtpPort: 587 },
  yahoo:   { imapHost: "imap.mail.yahoo.com",     imapPort: 993, smtpHost: "smtp.mail.yahoo.com",     smtpPort: 465 },
};

const makeBulkRow = (): BulkAccountRow => ({
  name: "", email: "", password: "", preset: "gmail",
  ...PRESETS.gmail,
});

// ──────────────────────────────────────────────────────────────────────────────

interface EmailSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

export function EmailSettings({ onStatusChange }: EmailSettingsProps) {
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [emailChannels, setEmailChannels] = useState<ChannelData[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [showBulkSetup, setShowBulkSetup] = useState(false);
  const [bulkAccounts, setBulkAccounts] = useState<BulkAccountRow[]>(() =>
    Array.from({ length: 8 }, makeBulkRow),
  );
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number; total: number; errors: string[];
  } | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Form state
  const [channelName, setChannelName] = useState("Email");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [emailProtocol, setEmailProtocol] = useState<"imap-smtp" | "loom">("imap-smtp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [displayName, setDisplayName] = useState("");
  const [allowedSenders, setAllowedSenders] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [historicalSyncStartDate, setHistoricalSyncStartDate] = useState("2024-01-01");
  const [historicalSyncBatchSize, setHistoricalSyncBatchSize] = useState(40);
  const [loomBaseUrl, setLoomBaseUrl] = useState("http://127.0.0.1:8787");
  const [loomAccessToken, setLoomAccessToken] = useState("");
  const [loomIdentity, setLoomIdentity] = useState("");
  const [loomMailboxFolder, setLoomMailboxFolder] = useState("INBOX");
  const [loomPollInterval, setLoomPollInterval] = useState(30000);

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number>(0);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Context policy state
  const [contextPolicies, setContextPolicies] = useState<Record<ContextType, ContextPolicy>>(
    {} as Record<ContextType, ContextPolicy>,
  );
  const [savingPolicy, setSavingPolicy] = useState(false);

  const resetAccountForm = () => {
    setChannelName("Email");
    setSecurityMode("pairing");
    setEmailProtocol("imap-smtp");
    setEmail("");
    setPassword("");
    setImapHost("");
    setImapPort(993);
    setSmtpHost("");
    setSmtpPort(587);
    setDisplayName("");
    setAllowedSenders("");
    setSubjectFilter("");
    setHistoricalSyncStartDate("2024-01-01");
    setHistoricalSyncBatchSize(40);
    setLoomBaseUrl("http://127.0.0.1:8787");
    setLoomAccessToken("");
    setLoomIdentity("");
    setLoomMailboxFolder("INBOX");
    setLoomPollInterval(30000);
  };

  // ── Bulk helpers ─────────────────────────────────────────────────────────────
  const updateBulkRow = (
    index: number,
    updates: Partial<BulkAccountRow>,
  ) => {
    setBulkAccounts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row)),
    );
  };

  const applyBulkPreset = (index: number, preset: BulkAccountRow["preset"]) => {
    const hosts = preset !== "custom" ? PRESETS[preset] : {};
    setBulkAccounts((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, preset, ...hosts } : row,
      ),
    );
  };

  const handleBulkAdd = async () => {
    const toAdd = bulkAccounts.filter(
      (r) => r.email.trim() && r.password.trim() && r.imapHost.trim() && r.smtpHost.trim(),
    );
    if (toAdd.length === 0) return;

    setBulkAdding(true);
    setBulkProgress({ done: 0, total: toAdd.length, errors: [] });

    for (let i = 0; i < toAdd.length; i++) {
      const row = toAdd[i];
      try {
        await window.electronAPI.addGatewayChannel({
          type: "email",
          name: row.name.trim() || row.email,
          securityMode: "pairing",
          emailProtocol: "imap-smtp",
          emailAddress: row.email.trim(),
          emailPassword: row.password.trim(),
          emailImapHost: row.imapHost.trim(),
          emailImapPort: row.imapPort,
          emailSmtpHost: row.smtpHost.trim(),
          emailSmtpPort: row.smtpPort,
          emailHistoricalSyncStartDate: "2024-01-01",
          emailHistoricalSyncBatchSize: 40,
        });
      } catch (err: any) {
        const label = row.email || `Row ${i + 1}`;
        setBulkProgress((prev) =>
          prev ? { ...prev, errors: [...prev.errors, `${label}: ${err.message}`] } : null,
        );
      }
      setBulkProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : null));
    }

    setBulkAdding(false);
    setShowBulkSetup(false);
    setBulkAccounts(Array.from({ length: 8 }, makeBulkRow));
    setBulkProgress(null);
    await loadChannel();
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const loadChannel = useCallback(async () => {
    try {
      setLoading(true);
      const channels = await window.electronAPI.getGatewayChannels();
      const emailList = channels.filter((c: ChannelData) => c.type === "email");
      setEmailChannels(emailList);

      if (emailList.length === 0) {
        setChannel(null);
        setUsers([]);
        setSelectedChannelId("");
        onStatusChange?.(false);
        return;
      }

      const selected =
        emailList.find((c: ChannelData) => c.id === selectedChannelId) || emailList[0];

      if (selected) {
        setChannel(selected);
        setSelectedChannelId(selected.id);
        setChannelName(selected.name);
        setSecurityMode(selected.securityMode);
        onStatusChange?.(selected.status === "connected");

        // Load config settings
        if (selected.config) {
          const protocol = selected.config.protocol === "loom" ? "loom" : "imap-smtp";
          setEmailProtocol(protocol);
          setEmail((selected.config.email as string) || "");
          setPassword((selected.config.password as string) || "");
          setImapHost((selected.config.imapHost as string) || "");
          setImapPort((selected.config.imapPort as number) || 993);
          setSmtpHost((selected.config.smtpHost as string) || "");
          setSmtpPort((selected.config.smtpPort as number) || 587);
          setDisplayName((selected.config.displayName as string) || "");
          const senders = (selected.config.allowedSenders as string[]) || [];
          setAllowedSenders(senders.join(", "));
          setSubjectFilter((selected.config.subjectFilter as string) || "");
          setHistoricalSyncStartDate(
            (selected.config.historicalSyncStartDate as string) || "2024-01-01",
          );
          setHistoricalSyncBatchSize(
            (selected.config.historicalSyncBatchSize as number) || 40,
          );
          setLoomBaseUrl((selected.config.loomBaseUrl as string) || "http://127.0.0.1:8787");
          setLoomAccessToken((selected.config.loomAccessToken as string) || "");
          setLoomIdentity((selected.config.loomIdentity as string) || "");
          setLoomMailboxFolder((selected.config.loomMailboxFolder as string) || "INBOX");
          setLoomPollInterval((selected.config.loomPollInterval as number) || 30000);
        }

        // Load users for this channel
        const channelUsers = await window.electronAPI.getGatewayUsers(selected.id);
        setUsers(channelUsers);

        // Load context policies
        const policies = await window.electronAPI.listContextPolicies(selected.id);
        const policyMap: Record<ContextType, ContextPolicy> = {} as Record<
          ContextType,
          ContextPolicy
        >;
        for (const policy of policies) {
          policyMap[policy.contextType as ContextType] = policy;
        }
        setContextPolicies(policyMap);
      }
    } catch (error) {
      console.error("Failed to load Email channel:", error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange, selectedChannelId]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onGatewayUsersUpdated?.((data) => {
      if (data?.channelType !== "email") return;
      if (channel && data?.channelId && data.channelId !== channel.id) return;
      loadChannel();
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [channel?.id, loadChannel]);

  const handleAddChannel = async () => {
    if (emailProtocol === "loom") {
      if (!loomBaseUrl.trim() || !loomAccessToken.trim()) {
        setTestResult({ success: false, error: "LOOM base URL and access token are required" });
        return;
      }
    } else if (!email.trim() || !password.trim() || !imapHost.trim() || !smtpHost.trim()) {
      setTestResult({
        success: false,
        error: "Email, password, IMAP host, and SMTP host are required",
      });
      return;
    }

    try {
      setSaving(true);
      setTestResult(null);

      const senderList = allowedSenders
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await window.electronAPI.addGatewayChannel({
        type: "email",
        name: channelName,
        securityMode,
        emailProtocol,
        emailAddress: emailProtocol === "imap-smtp" ? email.trim() : undefined,
        emailPassword: emailProtocol === "imap-smtp" ? password.trim() : undefined,
        emailImapHost: emailProtocol === "imap-smtp" ? imapHost.trim() : undefined,
        emailImapPort: emailProtocol === "imap-smtp" ? imapPort : undefined,
        emailSmtpHost: emailProtocol === "imap-smtp" ? smtpHost.trim() : undefined,
        emailSmtpPort: emailProtocol === "imap-smtp" ? smtpPort : undefined,
        emailDisplayName: displayName.trim() || undefined,
        emailAllowedSenders:
          emailProtocol === "imap-smtp" && senderList.length > 0 ? senderList : undefined,
        emailSubjectFilter:
          emailProtocol === "imap-smtp" ? subjectFilter.trim() || undefined : undefined,
        emailHistoricalSyncStartDate: historicalSyncStartDate.trim() || undefined,
        emailHistoricalSyncBatchSize: Math.max(1, Math.min(500, Number(historicalSyncBatchSize) || 40)),
        emailLoomBaseUrl: emailProtocol === "loom" ? loomBaseUrl.trim() : undefined,
        emailLoomAccessToken: emailProtocol === "loom" ? loomAccessToken.trim() : undefined,
        emailLoomIdentity: emailProtocol === "loom" ? loomIdentity.trim() || undefined : undefined,
        emailLoomMailboxFolder:
          emailProtocol === "loom" ? loomMailboxFolder.trim() || "INBOX" : undefined,
        emailLoomPollInterval: emailProtocol === "loom" ? loomPollInterval : undefined,
      });

      setShowAddAccountForm(false);
      resetAccountForm();
      await loadChannel();
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!channel) return;

    try {
      setTesting(true);
      setTestResult(null);

      const result = await window.electronAPI.testGatewayChannel(channel.id);
      setTestResult(result);
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!channel) return;

    try {
      setSaving(true);
      if (channel.enabled) {
        await window.electronAPI.disableGatewayChannel(channel.id);
      } else {
        await window.electronAPI.enableGatewayChannel(channel.id);
      }
      await loadChannel();
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveChannel = async () => {
    if (!channel) return;

    if (!confirm("Are you sure you want to remove the Email channel?")) {
      return;
    }

    try {
      setSaving(true);
      await window.electronAPI.removeGatewayChannel(channel.id);
      setChannel(null);
      setUsers([]);
      onStatusChange?.(false);
    } catch (error: Any) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSecurityMode = async (newMode: SecurityMode) => {
    if (!channel) return;

    try {
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        securityMode: newMode,
      });
      setSecurityMode(newMode);
      setChannel({ ...channel, securityMode: newMode });
    } catch (error: Any) {
      console.error("Failed to update security mode:", error);
    }
  };

  const handleGeneratePairingCode = async () => {
    if (!channel) return;

    try {
      setGeneratingCode(true);
      const code = await window.electronAPI.generateGatewayPairing(channel.id, "");
      setPairingCode(code);
      // Default TTL is 5 minutes (300 seconds)
      setPairingExpiresAt(Date.now() + 5 * 60 * 1000);
    } catch (error: Any) {
      console.error("Failed to generate pairing code:", error);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handlePolicyChange = async (contextType: ContextType, updates: Partial<ContextPolicy>) => {
    if (!channel) return;

    try {
      setSavingPolicy(true);
      const updated = await window.electronAPI.updateContextPolicy(channel.id, contextType, {
        securityMode: updates.securityMode,
        toolRestrictions: updates.toolRestrictions,
      });
      setContextPolicies((prev) => ({
        ...prev,
        [contextType]: updated,
      }));
    } catch (error: Any) {
      console.error("Failed to update context policy:", error);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleRevokeAccess = async (channelUserId: string) => {
    if (!channel) return;

    try {
      await window.electronAPI.revokeGatewayAccess(channel.id, channelUserId);
      await loadChannel();
    } catch (error: Any) {
      console.error("Failed to revoke access:", error);
    }
  };

  // Common email provider presets
  const applyPreset = (provider: string) => {
    switch (provider) {
      case "gmail":
        setImapHost("imap.gmail.com");
        setImapPort(993);
        setSmtpHost("smtp.gmail.com");
        setSmtpPort(587);
        break;
      case "outlook":
        setImapHost("outlook.office365.com");
        setImapPort(993);
        setSmtpHost("smtp.office365.com");
        setSmtpPort(587);
        break;
      case "yahoo":
        setImapHost("imap.mail.yahoo.com");
        setImapPort(993);
        setSmtpHost("smtp.mail.yahoo.com");
        setSmtpPort(465);
        break;
    }
  };

  const isLoomMode = emailProtocol === "loom";
  const canAddChannel = isLoomMode
    ? Boolean(loomBaseUrl.trim() && loomAccessToken.trim())
    : Boolean(email.trim() && password.trim() && imapHost.trim() && smtpHost.trim());
  const configuredChannelHandle =
    (typeof channel?.config?.email === "string" && channel.config.email) ||
    (typeof channel?.config?.loomIdentity === "string" && channel.config.loomIdentity) ||
    (typeof channel?.config?.loomBaseUrl === "string" && channel.config.loomBaseUrl) ||
    null;

  if (loading) {
    return <div className="settings-loading">Loading Email settings...</div>;
  }

  // No channel configured yet
  if (!channel) {
    return (
      <div className="email-settings">
        <div className="settings-section">
          <h3>Connect Email</h3>
          <p className="settings-description">
            Choose IMAP/SMTP for traditional inboxes or LOOM for your agent-native email protocol
            node.
          </p>

          <div className="settings-field">
            <label>Channel Name</label>
            <input
              type="text"
              className="settings-input"
              placeholder="My Email Bot"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>Protocol</label>
            <select
              className="settings-select"
              value={emailProtocol}
              onChange={(e) => setEmailProtocol(e.target.value as "imap-smtp" | "loom")}
            >
              <option value="imap-smtp">IMAP / SMTP (Legacy)</option>
              <option value="loom">LOOM Protocol</option>
            </select>
          </div>

          {!isLoomMode && (
            <>
              <div className="settings-callout info">
                <strong>Quick Setup:</strong>
                <div style={{ margin: "8px 0", display: "flex", gap: "8px" }}>
                  <button className="button-secondary" onClick={() => applyPreset("gmail")}>
                    Gmail
                  </button>
                  <button className="button-secondary" onClick={() => applyPreset("outlook")}>
                    Outlook
                  </button>
                  <button className="button-secondary" onClick={() => applyPreset("yahoo")}>
                    Yahoo
                  </button>
                </div>
                <p style={{ fontSize: "13px", marginTop: "8px" }}>
                  Note: For Gmail/Outlook, you may need to use an App Password instead of your
                  regular password.
                </p>
              </div>

              <div className="settings-field">
                <label>Email Address *</label>
                <input
                  type="email"
                  className="settings-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="settings-field">
                <label>Password *</label>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Your password or app password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="settings-hint">
                  For Gmail/Outlook, use an App Password (2FA must be enabled)
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="settings-field">
                  <label>IMAP Host *</label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="imap.example.com"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                  />
                </div>

                <div className="settings-field">
                  <label>IMAP Port</label>
                  <input
                    type="number"
                    className="settings-input"
                    placeholder="993"
                    value={imapPort}
                    onChange={(e) => setImapPort(parseInt(e.target.value) || 993)}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="settings-field">
                  <label>SMTP Host *</label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="smtp.example.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                  />
                </div>

                <div className="settings-field">
                  <label>SMTP Port</label>
                  <input
                    type="number"
                    className="settings-input"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                  />
                </div>
              </div>

              <div className="settings-field">
                <label>Allowed Senders (optional)</label>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="user@example.com, other@example.com"
                  value={allowedSenders}
                  onChange={(e) => setAllowedSenders(e.target.value)}
                />
                <p className="settings-hint">
                  Comma-separated email addresses to accept messages from (leave empty for all)
                </p>
              </div>

              <div className="settings-field">
                <label>Subject Filter (optional)</label>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="[CoWork]"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                />
                <p className="settings-hint">
                  Only process emails containing this text in the subject
                </p>
              </div>
            </>
          )}

          {isLoomMode && (
            <>
              <div className="settings-field">
                <label>LOOM Base URL *</label>
                <input
                  type="url"
                  className="settings-input"
                  placeholder="http://127.0.0.1:8787"
                  value={loomBaseUrl}
                  onChange={(e) => setLoomBaseUrl(e.target.value)}
                />
              </div>

              <div className="settings-field">
                <label>LOOM Access Token *</label>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Bearer access token"
                  value={loomAccessToken}
                  onChange={(e) => setLoomAccessToken(e.target.value)}
                />
              </div>

              <div className="settings-field">
                <label>LOOM Identity (optional)</label>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="loom://agent@example.com"
                  value={loomIdentity}
                  onChange={(e) => setLoomIdentity(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="settings-field">
                  <label>Mailbox Folder</label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="INBOX"
                    value={loomMailboxFolder}
                    onChange={(e) => setLoomMailboxFolder(e.target.value)}
                  />
                </div>

                <div className="settings-field">
                  <label>Poll Interval (ms)</label>
                  <input
                    type="number"
                    className="settings-input"
                    placeholder="30000"
                    value={loomPollInterval}
                    onChange={(e) => setLoomPollInterval(parseInt(e.target.value) || 30000)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="settings-field">
            <label>Display Name (optional)</label>
            <input
              type="text"
              className="settings-input"
              placeholder="CoWork Bot"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="settings-hint">Name shown in outgoing messages</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="settings-field">
              <label>Historical Sync Start Date</label>
              <input
                type="date"
                className="settings-input"
                value={historicalSyncStartDate}
                onChange={(e) => setHistoricalSyncStartDate(e.target.value)}
              />
              <p className="settings-hint">Ingest emails from this date onward (recommended: 2024-01-01)</p>
            </div>

            <div className="settings-field">
              <label>Historical Sync Batch Size</label>
              <input
                type="number"
                className="settings-input"
                min={1}
                max={500}
                value={historicalSyncBatchSize}
                onChange={(e) => setHistoricalSyncBatchSize(parseInt(e.target.value, 10) || 40)}
              />
              <p className="settings-hint">Lower values are safer for stability on large inboxes</p>
            </div>
          </div>

          <div className="settings-field">
            <label>Security Mode</label>
            <select
              className="settings-select"
              value={securityMode}
              onChange={(e) => setSecurityMode(e.target.value as SecurityMode)}
            >
              <option value="pairing">Pairing Code (Recommended)</option>
              <option value="allowlist">Allowlist Only</option>
              <option value="open">Open (Anyone can use)</option>
            </select>
            <p className="settings-hint">
              {securityMode === "pairing" &&
                "Users must enter a code generated in this app to use the bot"}
              {securityMode === "allowlist" && "Only pre-approved email addresses can use the bot"}
              {securityMode === "open" && "Anyone who emails the bot can use it (not recommended)"}
            </p>
          </div>

          {testResult && (
            <div className={`test-result ${testResult.success ? "success" : "error"}`}>
              {testResult.success ? <>✓ Connection successful</> : <>✗ {testResult.error}</>}
            </div>
          )}

          <button
            className="button-primary"
            onClick={handleAddChannel}
            disabled={saving || !canAddChannel}
          >
            {saving ? "Adding..." : "Add Email"}
          </button>
        </div>

        <div className="settings-section">
          <h4>Email Features</h4>
          <ul className="setup-instructions">
            {isLoomMode ? (
              <>
                <li>Receive mailbox messages via LOOM gateway API</li>
                <li>Send via LOOM SMTP submit endpoint</li>
                <li>Thread and mailbox state mapped to LOOM thread graph</li>
                <li>Bearer-token authenticated protocol access</li>
              </>
            ) : (
              <>
                <li>Receive emails via IMAP (polling)</li>
                <li>Send emails via SMTP</li>
                <li>Reply threading support</li>
                <li>Filter by sender or subject</li>
                <li>Universal - works with any email provider</li>
              </>
            )}
          </ul>
        </div>
      </div>
    );
  }

  // Channel is configured
  return (
    <div className="email-settings">
      <div className="settings-section">
        <div className="channel-header">
          <div className="channel-info">
            <h3>
              {channel.name}
              {configuredChannelHandle && (
                <span className="bot-username">{configuredChannelHandle}</span>
              )}
            </h3>
            <div className={`channel-status ${channel.status}`}>
              {channel.status === "connected" && "● Connected"}
              {channel.status === "connecting" && "○ Connecting..."}
              {channel.status === "disconnected" && "○ Disconnected"}
              {channel.status === "error" && "● Error"}
            </div>
            {emailChannels.length > 1 && (
              <div className="settings-field" style={{ marginTop: "8px" }}>
                <label>Account</label>
                <select
                  className="settings-select"
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                >
                  {emailChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="channel-actions">
            <button
              className="button-secondary"
              onClick={() => {
                resetAccountForm();
                setShowAddAccountForm((value) => !value);
                setShowBulkSetup(false);
              }}
            >
              {showAddAccountForm ? "Cancel Add" : "Add Account"}
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                setShowBulkSetup((v) => !v);
                setShowAddAccountForm(false);
                resetAccountForm();
              }}
            >
              {showBulkSetup ? "Cancel Bulk" : "Bulk Setup"}
            </button>
            <button
              className={channel.enabled ? "button-secondary" : "button-primary"}
              onClick={handleToggleEnabled}
              disabled={saving}
            >
              {channel.enabled ? "Disable" : "Enable"}
            </button>
            <button
              className="button-secondary"
              onClick={handleTestConnection}
              disabled={testing || !channel.enabled}
            >
              {testing ? "Testing..." : "Test"}
            </button>
            <button className="button-danger" onClick={handleRemoveChannel} disabled={saving}>
              Remove
            </button>
          </div>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.success ? "success" : "error"}`}>
            {testResult.success ? <>✓ Connection successful</> : <>✗ {testResult.error}</>}
          </div>
        )}
      </div>

      {showAddAccountForm && (
        <div className="settings-section">
          <h4>Add Another Email Account</h4>
          <p className="settings-description">
            Add an additional mailbox without removing existing connected accounts.
          </p>

          <div className="settings-field">
            <label>Channel Name</label>
            <input
              type="text"
              className="settings-input"
              placeholder="Email Account"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>

          <div className="settings-field">
            <label>Protocol</label>
            <select
              className="settings-select"
              value={emailProtocol}
              onChange={(e) => setEmailProtocol(e.target.value as "imap-smtp" | "loom")}
            >
              <option value="imap-smtp">IMAP / SMTP</option>
              <option value="loom">LOOM Protocol</option>
            </select>
          </div>

          {!isLoomMode ? (
            <>
              <div className="settings-field">
                <label>Email Address *</label>
                <input
                  type="email"
                  className="settings-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <label>Password *</label>
                <input
                  type="password"
                  className="settings-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="settings-field">
                  <label>IMAP Host *</label>
                  <input
                    type="text"
                    className="settings-input"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                  />
                </div>
                <div className="settings-field">
                  <label>SMTP Host *</label>
                  <input
                    type="text"
                    className="settings-input"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="settings-field">
                <label>LOOM Base URL *</label>
                <input
                  type="url"
                  className="settings-input"
                  value={loomBaseUrl}
                  onChange={(e) => setLoomBaseUrl(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <label>LOOM Access Token *</label>
                <input
                  type="password"
                  className="settings-input"
                  value={loomAccessToken}
                  onChange={(e) => setLoomAccessToken(e.target.value)}
                />
              </div>
              <div className="settings-field">
                <label>LOOM Identity (optional)</label>
                <input
                  type="text"
                  className="settings-input"
                  value={loomIdentity}
                  onChange={(e) => setLoomIdentity(e.target.value)}
                />
              </div>
            </>
          )}

          <button
            className="button-primary"
            onClick={handleAddChannel}
            disabled={saving || !canAddChannel}
          >
            {saving ? "Adding..." : "Add Email Account"}
          </button>
        </div>
      )}

      {showBulkSetup && (
        <div className="settings-section">
          <h4>Bulk Account Setup</h4>
          <p className="settings-description">
            Fill in up to 8 IMAP/SMTP inboxes at once. Rows with a blank email or password are
            skipped. All accounts will sync from 2024-01-01 in 40-email batches.
          </p>

          {bulkAccounts.map((row, idx) => (
            <div
              key={idx}
              style={{
                border: "1px solid var(--border-color, #333)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "10px",
                background: "var(--surface-alt, #1a1a1a)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    background: "var(--accent, #5865f2)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: "20px",
                    height: "20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <input
                  type="text"
                  className="settings-input"
                  placeholder={`Account ${idx + 1} name (optional)`}
                  value={row.name}
                  onChange={(e) => updateBulkRow(idx, { name: e.target.value })}
                  style={{ flex: 1 }}
                />
                <select
                  className="settings-select"
                  value={row.preset}
                  onChange={(e) => applyBulkPreset(idx, e.target.value as BulkAccountRow["preset"])}
                  style={{ width: "110px" }}
                >
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook</option>
                  <option value="yahoo">Yahoo</option>
                  <option value="custom">Custom…</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <input
                  type="email"
                  className="settings-input"
                  placeholder="email@example.com *"
                  value={row.email}
                  onChange={(e) => updateBulkRow(idx, { email: e.target.value })}
                />
                <input
                  type="password"
                  className="settings-input"
                  placeholder="App password *"
                  value={row.password}
                  onChange={(e) => updateBulkRow(idx, { password: e.target.value })}
                />
              </div>

              {row.preset === "custom" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr 80px", gap: "8px", marginTop: "8px" }}>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="IMAP host"
                    value={row.imapHost}
                    onChange={(e) => updateBulkRow(idx, { imapHost: e.target.value })}
                  />
                  <input
                    type="number"
                    className="settings-input"
                    placeholder="993"
                    value={row.imapPort}
                    onChange={(e) => updateBulkRow(idx, { imapPort: parseInt(e.target.value) || 993 })}
                  />
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="SMTP host"
                    value={row.smtpHost}
                    onChange={(e) => updateBulkRow(idx, { smtpHost: e.target.value })}
                  />
                  <input
                    type="number"
                    className="settings-input"
                    placeholder="587"
                    value={row.smtpPort}
                    onChange={(e) => updateBulkRow(idx, { smtpPort: parseInt(e.target.value) || 587 })}
                  />
                </div>
              )}
            </div>
          ))}

          {bulkProgress && (
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  height: "6px",
                  borderRadius: "3px",
                  background: "var(--border-color, #333)",
                  overflow: "hidden",
                  marginBottom: "6px",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`,
                    background: bulkProgress.errors.length > 0 ? "#f0a500" : "var(--accent, #5865f2)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: "12px", margin: 0 }}>
                {bulkProgress.done}/{bulkProgress.total} accounts processed
                {bulkProgress.errors.length > 0 && ` · ${bulkProgress.errors.length} error(s)`}
              </p>
              {bulkProgress.errors.map((e, i) => (
                <p key={i} style={{ fontSize: "11px", color: "var(--error-color, #f04747)", margin: "2px 0" }}>
                  ✗ {e}
                </p>
              ))}
            </div>
          )}

          <button
            className="button-primary"
            onClick={handleBulkAdd}
            disabled={
              bulkAdding ||
              !bulkAccounts.some(
                (r) => r.email.trim() && r.password.trim() && r.imapHost.trim() && r.smtpHost.trim(),
              )
            }
          >
            {bulkAdding
              ? `Adding… (${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0})`
              : "Add All Accounts"}
          </button>
        </div>
      )}

      <div className="settings-section">
        <h4>Security Mode</h4>
        <select
          className="settings-select"
          value={securityMode}
          onChange={(e) => handleUpdateSecurityMode(e.target.value as SecurityMode)}
        >
          <option value="pairing">Pairing Code</option>
          <option value="allowlist">Allowlist Only</option>
          <option value="open">Open</option>
        </select>
      </div>

      {securityMode === "pairing" && (
        <div className="settings-section">
          <h4>Generate Pairing Code</h4>
          <p className="settings-description">
            Generate a one-time code for a user to enter in their email to gain access.
          </p>
          {pairingCode && pairingExpiresAt > 0 ? (
            <PairingCodeDisplay
              code={pairingCode}
              expiresAt={pairingExpiresAt}
              onRegenerate={handleGeneratePairingCode}
              isRegenerating={generatingCode}
            />
          ) : (
            <button
              className="button-secondary"
              onClick={handleGeneratePairingCode}
              disabled={generatingCode}
            >
              {generatingCode ? "Generating..." : "Generate Code"}
            </button>
          )}
        </div>
      )}

      {/* Per-Context Security Policies */}
      <div className="settings-section">
        <h4>Context Policies</h4>
        <p className="settings-description">
          Configure different security settings for direct emails vs group/thread emails.
        </p>
        <ContextPolicySettings
          channelId={channel.id}
          channelType="email"
          policies={contextPolicies}
          onPolicyChange={handlePolicyChange}
          isSaving={savingPolicy}
        />
      </div>

      <div className="settings-section">
        <h4>Authorized Users</h4>
        {users.length === 0 ? (
          <p className="settings-description">No users have connected yet.</p>
        ) : (
          <div className="users-list">
            {users.map((user) => (
              <div key={user.id} className="user-item">
                <div className="user-info">
                  <span className="user-name">{user.displayName}</span>
                  {user.username && <span className="user-username">{user.username}</span>}
                  <span className={`user-status ${user.allowed ? "allowed" : "pending"}`}>
                    {user.allowed ? "✓ Allowed" : "○ Pending"}
                  </span>
                </div>
                {user.allowed && (
                  <button
                    className="button-small button-danger"
                    onClick={() => handleRevokeAccess(user.channelUserId)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

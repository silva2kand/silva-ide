import { useEffect, useState } from "react";
import {
  MessageCircle,
  Send,
  Hash,
  Clock,
  Monitor,
} from "lucide-react";

const APP_NAME = "CoWork";

const DISPATCH_CHANNELS = [
  { type: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle, settingsTab: "whatsapp" },
  { type: "telegram" as const, label: "Telegram", icon: Send, settingsTab: "telegram" },
  { type: "slack" as const, label: "Slack", icon: Hash, settingsTab: "slack" },
];

interface DispatchPanelProps {
  onOpenSettings?: (tab: string) => void;
}

export function DispatchPanel({ onOpenSettings }: DispatchPanelProps) {
  const [channels, setChannels] = useState<{ id: string; type: string; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await window.electronAPI.getGatewayChannels();
        if (!cancelled) {
          setChannels(
            (list || []).map((c: { id: string; type: string; name: string; status: string }) => ({
              id: c.id,
              type: c.type,
              name: c.name,
              status: c.status || "disconnected",
            })),
          );
        }
      } catch {
        if (!cancelled) setChannels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const connectedChannels = channels.filter((c) => c.status === "connected");
  const hasConnections = connectedChannels.length > 0;

  return (
    <div className="dispatch-panel">
      <div className="dp-header">
        <h1 className="dp-title">Dispatch</h1>
      </div>

      {loading ? (
        <div className="dispatch-loading">Loading…</div>
      ) : !hasConnections ? (
        <div className="dispatch-onboarding">
          <div className="dispatch-illustration">
            <svg
              width="160"
              height="80"
              viewBox="0 0 160 80"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="8" y="20" width="36" height="56" rx="4" />
              <rect x="116" y="8" width="36" height="64" rx="4" />
              <path
                d="M44 48 Q80 24 116 48"
                stroke="var(--color-error)"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
          </div>
          <h2 className="dispatch-onboarding-title">CoWork on the go</h2>
          <p className="dispatch-onboarding-subtitle">
            Dispatch tasks to {APP_NAME} from WhatsApp, Telegram, Slack, and other messaging apps—in one
            continuous conversation.
          </p>

          <div className="dispatch-feature-cards">
            <div className="dispatch-feature-card">
              <MessageCircle size={20} strokeWidth={2} className="dispatch-feature-icon" />
              <p>
                Your messaging apps act like a walkie-talkie that can communicate with {APP_NAME} on your
                computer.
              </p>
            </div>
            <div className="dispatch-feature-card">
              <Send size={20} strokeWidth={2} className="dispatch-feature-icon" />
              <p>
                Just send {APP_NAME} a message from WhatsApp, Telegram, or Slack, and it will work on tasks
                using your computer.
              </p>
            </div>
            <div className="dispatch-feature-card">
              <Clock size={20} strokeWidth={2} className="dispatch-feature-icon" />
              <p>
                {APP_NAME} can also run tasks on a schedule or whenever you need them.
              </p>
            </div>
            <div className="dispatch-feature-card">
              <Monitor size={20} strokeWidth={2} className="dispatch-feature-icon" />
              <p>
                Remember to keep your computer awake so {APP_NAME} can keep working.{" "}
                <button
                  type="button"
                  className="dispatch-link"
                  onClick={() => onOpenSettings?.("system")}
                >
                  Learn more
                </button>
              </p>
            </div>
          </div>

          <span className="dispatch-section-label">Connect at least one channel to get started</span>
          <div className="dispatch-setup-cards">
            {DISPATCH_CHANNELS.map(({ type, label, icon: Icon, settingsTab }) => {
              const ch = channels.find((c) => c.type === type);
              const isConnected = ch?.status === "connected";
              return (
                <button
                  key={type}
                  type="button"
                  className="dispatch-setup-card"
                  onClick={() => onOpenSettings?.(settingsTab)}
                >
                  <Icon size={20} strokeWidth={2} className="dispatch-setup-icon" />
                  <div className="dispatch-setup-card-content">
                    <strong>
                      {isConnected ? `Connected to ${label}` : `Connect to ${label}`}
                    </strong>
                    <span>
                      {isConnected
                        ? "Send tasks from " + label + " anytime"
                        : `Link your ${label} account to dispatch tasks`}
                    </span>
                  </div>
                  {isConnected ? (
                    <span className="dispatch-setup-badge connected">●</span>
                  ) : (
                    <span className="dispatch-setup-badge">+</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="dispatch-get-started-btn"
            onClick={() => onOpenSettings?.("telegram")}
          >
            Get started
          </button>

          <p className="dispatch-disclaimer">
            {APP_NAME} will access your desktop (files, apps, and browser) to complete tasks you send from
            messaging apps. This may have security risks. Only connect devices and accounts that you own and
            trust.{" "}
            <button
              type="button"
              className="dispatch-link"
              onClick={() => onOpenSettings?.("system")}
            >
              Learn how to use this safely
            </button>
          </p>
        </div>
      ) : (
        <div className="dispatch-connected">
          <div className="dispatch-info-card">
            <p>
              <strong>Dispatch</strong> from your connected apps—seamless task handoff from WhatsApp,
              Telegram, Slack, and more.
            </p>
          </div>
          <div className="dispatch-settings-list">
            <div className="dispatch-settings-item">
              <Monitor size={18} strokeWidth={2} />
              <div>
                <strong>Keep this computer awake</strong>
                <span>Prevents sleep while Dispatch is running.</span>
              </div>
              <label className="dispatch-toggle">
                <input type="checkbox" defaultChecked={false} />
                <span className="dispatch-toggle-slider" />
              </label>
            </div>
          </div>
          <div className="dp-section">
            <span className="dp-section-label">Outputs</span>
            <div className="dp-placeholder">
              Files {APP_NAME} shares will appear here.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

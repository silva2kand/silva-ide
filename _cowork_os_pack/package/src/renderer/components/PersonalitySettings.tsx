import { useState, useEffect } from "react";
import type { PersonalityConfigV2, PersonaDefinition } from "../../shared/types";
import { PersonalityIdentityTab } from "./personality/PersonalityIdentityTab";
import { PersonalityTraitsTab } from "./personality/PersonalityTraitsTab";
import { PersonalityInstructionsTab } from "./personality/PersonalityInstructionsTab";
import { PersonalityStyleTab } from "./personality/PersonalityStyleTab";
import { PersonalityAdvancedTab } from "./personality/PersonalityAdvancedTab";

type TabId = "identity" | "personality" | "instructions" | "style" | "advanced";

interface PersonalitySettingsProps {
  onSettingsChanged?: () => void;
}

export function PersonalitySettings({ onSettingsChanged }: PersonalitySettingsProps) {
  const [config, setConfig] = useState<PersonalityConfigV2 | null>(null);
  const [personas, setPersonas] = useState<PersonaDefinition[]>([]);
  const [presets, setPresets] = useState<Record<string, { name: string; description: string; icon: string; traits: Record<string, number> }>>({});
  const [relationshipStats, setRelationshipStats] = useState<{
    tasksCompleted: number;
    projectsCount: number;
    daysTogether: number;
    nextMilestone: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("identity");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onPersonalitySettingsChanged) return;
    const unsub = window.electronAPI.onPersonalitySettingsChanged(() => {
      loadData();
      onSettingsChanged?.();
    });
    return unsub;
  }, [onSettingsChanged]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [loadedConfig, loadedPersonas, loadedPresets, stats] = await Promise.all([
        window.electronAPI.getPersonalityConfigV2(),
        window.electronAPI.getPersonaDefinitions?.(),
        window.electronAPI.getPersonalityTraitPresets?.(),
        window.electronAPI.getRelationshipStats?.(),
      ]);
      setConfig(loadedConfig as PersonalityConfigV2);
      setPersonas((loadedPersonas as PersonaDefinition[]) ?? []);
      setPresets((loadedPresets as Record<string, { name: string; description: string; icon: string; traits: Record<string, number> }>) ?? {});
      setRelationshipStats(stats as typeof relationshipStats);
    } catch (err) {
      console.error("Failed to load personality settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (updates: Partial<PersonalityConfigV2>) => {
    if (!config) return;
    setConfig({ ...config, ...updates });
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await window.electronAPI.savePersonalityConfigV2(config);
      onSettingsChanged?.();
    } catch (err) {
      console.error("Failed to save personality settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  if (loading || !config) {
    return <div className="settings-loading">Loading personality settings...</div>;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "identity", label: "Identity" },
    { id: "personality", label: "Personality" },
    { id: "instructions", label: "Instructions" },
    { id: "style", label: "Style" },
    { id: "advanced", label: "Advanced" },
  ];

  return (
    <div className="personality-settings">
      <div className="personality-nav">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`personality-nav-btn ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "identity" && (
        <PersonalityIdentityTab
          config={config}
          relationshipStats={relationshipStats}
          onUpdate={handleUpdate}
          onSave={handleSave}
          saving={saving}
        />
      )}
      {activeTab === "personality" && (
        <PersonalityTraitsTab
          config={config}
          presets={presets}
          onUpdate={handleUpdate}
          onSave={handleSave}
          saving={saving}
          onToast={showToast}
        />
      )}
      {activeTab === "instructions" && (
        <PersonalityInstructionsTab
          config={config}
          onUpdate={handleUpdate}
          onSave={handleSave}
          saving={saving}
        />
      )}
      {activeTab === "style" && (
        <PersonalityStyleTab
          config={config}
          personas={personas}
          onUpdate={handleUpdate}
          onSave={handleSave}
          saving={saving}
        />
      )}
      {activeTab === "advanced" && (
        <PersonalityAdvancedTab
          config={config}
          onUpdate={handleUpdate}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {toast && <div className="personality-toast">{toast}</div>}

      <div className="settings-tip">
        <h4>Chat Commands</h4>
        <ul className="command-examples">
          <li>
            <code>be more friendly</code> — Switch personality
          </li>
          <li>
            <code>call yourself Jarvis</code> — Change name
          </li>
          <li>
            <code>my name is Alex</code> — Set your name
          </li>
          <li>
            <code>be like a pirate</code> — Apply persona
          </li>
        </ul>
      </div>
    </div>
  );
}

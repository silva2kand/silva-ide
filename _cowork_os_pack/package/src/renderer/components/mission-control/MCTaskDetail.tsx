import { ActivityFeed } from "../ActivityFeed";
import { MentionInput } from "../MentionInput";
import { MentionList } from "../MentionList";
import { BOARD_COLUMNS } from "./useMissionControlData";
import type { MissionControlData } from "./useMissionControlData";

interface MCTaskDetailProps {
  data: MissionControlData;
  taskId: string;
}

export function MCTaskDetail({ data, taskId }: MCTaskDetailProps) {
  const {
    tasks, agents, selectedWorkspaceId,
    handleAssignTask, handleMoveTask, getMissionColumnForTask,
    commentText, setCommentText, postingComment, handlePostComment,
    formatRelativeTime, agentContext,
  } = data;

  const task = tasks.find((t) => t.id === taskId);
  if (!task) return <div className="mc-v2-empty">{agentContext.getUiCopy("mcTaskEmpty")}</div>;

  return (
    <>
      <div>
        <div className="mc-v2-task-detail-title">
          <h3>{task.title}</h3>
          <span className={`mc-v2-status-pill status-${task.status}`}>{task.status.replace("_", " ")}</span>
        </div>
        <div className="mc-v2-detail-updated">
          {agentContext.getUiCopy("mcTaskUpdatedAt", { time: formatRelativeTime(task.updatedAt) })}
        </div>
      </div>

      <div className="mc-v2-detail-meta">
        <label>
          {agentContext.getUiCopy("mcTaskAssigneeLabel")}
          <select
            value={task.assignedAgentRoleId || ""}
            onChange={(e) => handleAssignTask(task.id, e.target.value || null)}
          >
            <option value="">{agentContext.getUiCopy("mcTaskUnassigned")}</option>
            {agents.filter((a) => a.isActive).map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.displayName}</option>
            ))}
          </select>
        </label>
        <label>
          {agentContext.getUiCopy("mcTaskStageLabel")}
          <select
            value={getMissionColumnForTask(task)}
            onChange={(e) => handleMoveTask(task.id, e.target.value)}
          >
            {BOARD_COLUMNS.map((col) => (
              <option key={col.id} value={col.id}>{col.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mc-v2-detail-section">
        <h4>{agentContext.getUiCopy("mcTaskBriefTitle")}</h4>
        <p className="mc-v2-detail-brief">{task.prompt}</p>
      </div>

      <div className="mc-v2-detail-section">
        <h4>{agentContext.getUiCopy("mcTaskUpdatesTitle")}</h4>
        {selectedWorkspaceId && (
          <ActivityFeed workspaceId={selectedWorkspaceId} taskId={task.id} compact maxItems={20} showFilters={false} />
        )}
        <div className="mc-v2-comment-box">
          <textarea
            placeholder={agentContext.getUiCopy("mcTaskUpdatePlaceholder")}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
          />
          <button
            className="mc-v2-comment-submit"
            onClick={handlePostComment}
            disabled={postingComment || commentText.trim().length === 0}
          >
            {postingComment ? agentContext.getUiCopy("mcTaskPosting") : agentContext.getUiCopy("mcTaskPostUpdate")}
          </button>
        </div>
      </div>

      <div className="mc-v2-detail-section">
        <h4>{agentContext.getUiCopy("mcTaskMentionsTitle")}</h4>
        {selectedWorkspaceId && (
          <>
            <MentionInput workspaceId={selectedWorkspaceId} taskId={task.id} placeholder={agentContext.getUiCopy("mcTaskMentionPlaceholder")} />
            <MentionList workspaceId={selectedWorkspaceId} taskId={task.id} />
          </>
        )}
      </div>
    </>
  );
}

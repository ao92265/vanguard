import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Expand,
  FolderGit2,
  GitBranch,
  Minimize,
  Package,
  Play,
  Plus,
  Search,
  Server,
  Sparkles,
  Store,
  Terminal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type IconComponent, OpenCodeIcon } from "@/components/icons";

import type { BranchWithWorktreeStatus } from "@/lib/git";
import type { McpServerConfig } from "@/lib/mcp";
import type { PluginConfig, SkillConfig } from "@/lib/plugins";
import { type ClaudeSessionInfo, deleteClaudeSession, listClaudeSessions } from "@/lib/terminal";
import type { PrReviewLaunch } from "@/lib/terminalPrompt";
import type { TmuxSession } from "@/lib/tmux";
import type { AiMode } from "@/stores/useSessionStore";
import type { RepositoryInfo, WorkspaceType } from "@/stores/useWorkspaceStore";

/** Pre-launch session slot configuration. */
/** Controls how a session's working directory is resolved at launch. */
export type WorktreeMode = "auto" | "project" | "new";

export interface SessionSlot {
  /**
   * Name of an existing tmux session this slot will attach to instead of
   * launching an agent. When set, every other setting on the slot is inert:
   * the pane runs whatever that session is already running.
   */
  attachTmux?: string | null;
  id: string;
  mode: AiMode;
  branch: string | null;
  /** Custom display name shown in the terminal header instead of the default `{provider} #{id}`. */
  customName: string;
  /** How the working directory is resolved: auto-detect/reuse, project path, or new worktree. */
  worktreeMode: WorktreeMode;
  sessionId: number | null;
  /** Path to the worktree if one was created for this session. */
  worktreePath: string | null;
  /** Warning message from worktree preparation (e.g., fallback to project path). */
  worktreeWarning: string | null;
  /** Names of enabled MCP servers for this session. */
  enabledMcpServers: string[];
  /** IDs of enabled skills for this session. */
  enabledSkills: string[];
  /** IDs of enabled plugins for this session. */
  enabledPlugins: string[];
  /**
   * Whether default MCP/skill/plugin selections have been applied (at slot
   * creation or by the post-fetch refill). Once true, an empty enabled list
   * is the user's explicit "Unselect All" and must never be refilled.
   */
  mcpDefaultsApplied?: boolean;
  skillsDefaultsApplied?: boolean;
  pluginsDefaultsApplied?: boolean;
  /** Claude session UUID to resume, if resuming a previous session. */
  resumeSessionId?: string | null;
  /**
   * Launch in this exact directory (an existing worktree recovered from the
   * History tab) instead of deriving one from branch/worktreeMode.
   */
  workingDirOverride?: string | null;
  /**
   * Samurai successor metadata (issue #55): forces skip-permissions on the
   * CLI command and registers the session under supervision right before the
   * CLI launches. Never set for manually created slots.
   */
  samurai?: import("@/stores/usePendingLaunchStore").SamuraiSuccessorInfo | null;
  /**
   * Interactive harvest triage (issue #98): arms the backend's journal
   * prompt injection right before the CLI launches. Never set for manually
   * created slots.
   */
  harvest?: boolean;
  /**
   * Generic initial prompt: arms the backend's one-shot prompt injection
   * right before the CLI launches (Claude mode only). Never set for manually
   * created slots.
   */
  initialPrompt?: string | null;
  /**
   * Where a long `initialPrompt` is staged as a brief file, and under what
   * stem (issue #138). Never set for manually created slots.
   */
  briefDir?: string | null;
  briefStem?: string | null;
  /**
   * PR-review launch metadata (issue #139): recorded backend-side so the
   * review has an identity its artifacts group under. Never set for manually
   * created slots.
   */
  prRun?: PrReviewLaunch | null;
}

interface PreLaunchCardProps {
  slot: SessionSlot;
  projectPath: string;
  branches: BranchWithWorktreeStatus[];
  isLoadingBranches: boolean;
  isGitRepo: boolean;
  /** List of repositories for multi-repo workspaces. */
  repositories?: RepositoryInfo[];
  /** Workspace type - single-repo, multi-repo, or non-git. */
  workspaceType?: WorkspaceType;
  /** Currently selected repository path. */
  selectedRepoPath?: string;
  /** Callback to change the selected repository. */
  onRepoChange?: (path: string) => void;
  /** Live tmux sessions offered as attach targets. Empty hides the section. */
  tmuxSessions?: TmuxSession[];
  onAttachTmuxChange?: (name: string | null) => void;
  mcpServers: McpServerConfig[];
  skills: SkillConfig[];
  plugins: PluginConfig[];
  onCreateBranch?: (name: string, andCheckout: boolean, repoPath?: string) => Promise<void>;
  onCustomNameChange: (name: string) => void;
  onModeChange: (mode: AiMode) => void;
  onBranchChange: (branch: string | null) => void;
  onWorktreeModeChange: (mode: WorktreeMode) => void;
  /** Whether a managed worktree exists for the current project. Disables "Current Worktree" if false. */
  hasManagedWorktree?: boolean;
  /** Called when the branch dropdown is opened, to refresh the branch list. */
  onRefreshBranches?: () => void;
  onMcpToggle: (serverName: string) => void;
  onSkillToggle: (skillId: string) => void;
  onPluginToggle: (pluginId: string) => void;
  onMcpSelectAll: () => void;
  onMcpUnselectAll: () => void;
  onPluginsSelectAll: () => void;
  onPluginsUnselectAll: () => void;
  onLaunch: () => void;
  onRemove: () => void;
  onResumeSessionChange: (sessionId: string | null) => void;
  isZoomed?: boolean;
  onToggleZoom?: () => void;
}

const AI_MODES: {
  mode: AiMode;
  icon: IconComponent;
  label: string;
  color: string;
}[] = [
  { mode: "Claude", icon: BrainCircuit, label: "Claude Code", color: "text-violet-500" },
  { mode: "Gemini", icon: Sparkles, label: "Gemini CLI", color: "text-blue-400" },
  { mode: "Codex", icon: Code2, label: "Codex", color: "text-green-400" },
  { mode: "OpenCode", icon: OpenCodeIcon, label: "OpenCode", color: "text-purple-500" },
  { mode: "Plain", icon: Terminal, label: "Terminal", color: "text-maestro-muted" },
];

function getModeConfig(mode: AiMode) {
  return AI_MODES.find((m) => m.mode === mode) ?? AI_MODES[0];
}

/** "1 plugin" / "3 plugins", count first, so a zero reads as a zero. */
function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Validate a git branch name (simplified check). */
function isValidBranchName(name: string): boolean {
  if (!name || name.length === 0) return false;
  // Disallow spaces, ~, ^, :, ?, *, [, \, consecutive dots, @{ sequences, trailing dot/slash/lock
  if (/[\s~^:?*[\]\\]/.test(name)) return false;
  if (name.includes("..")) return false;
  if (name.includes("@{")) return false;
  if (name.startsWith("-") || name.startsWith(".")) return false;
  if (name.endsWith(".") || name.endsWith("/") || name.endsWith(".lock")) return false;
  return /^[a-zA-Z0-9._/-]+$/.test(name);
}

export function PreLaunchCard({
  slot,
  projectPath,
  branches,
  isLoadingBranches,
  isGitRepo,
  repositories,
  workspaceType,
  selectedRepoPath,
  onRepoChange,
  tmuxSessions = [],
  onAttachTmuxChange,
  mcpServers,
  skills,
  plugins,
  onCreateBranch,
  onCustomNameChange,
  onModeChange,
  onBranchChange,
  onWorktreeModeChange,
  hasManagedWorktree = false,
  onRefreshBranches,
  onMcpToggle,
  onSkillToggle,
  onPluginToggle,
  onMcpSelectAll,
  onMcpUnselectAll,
  onPluginsSelectAll,
  onPluginsUnselectAll,
  onLaunch,
  onRemove,
  onResumeSessionChange,
  isZoomed = false,
  onToggleZoom,
}: PreLaunchCardProps) {
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [mcpDropdownOpen, setMcpDropdownOpen] = useState(false);
  const [pluginsSkillsDropdownOpen, setPluginsSkillsDropdownOpen] = useState(false);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
  const [mcpSearchQuery, setMcpSearchQuery] = useState("");
  const [pluginsSearchQuery, setPluginsSearchQuery] = useState("");
  const [branchSearchQuery, setBranchSearchQuery] = useState("");
  const [showBranchCreate, setShowBranchCreate] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchCreateError, setBranchCreateError] = useState<string | null>(null);
  const branchCreateInputRef = useRef<HTMLInputElement>(null);

  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const mcpDropdownRef = useRef<HTMLDivElement>(null);
  const pluginsSkillsDropdownRef = useRef<HTMLDivElement>(null);

  // Resume session state
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSessionInfo[]>([]);

  // Fetch Claude sessions when mode is Claude. Guard against races where
  // selectedRepoPath changes mid-flight so a stale response can't clobber the
  // newer one.
  useEffect(() => {
    if (slot.mode !== "Claude") {
      setClaudeSessions([]);
      return;
    }
    let ignore = false;
    const sessionPath = selectedRepoPath || projectPath;
    listClaudeSessions(sessionPath)
      .then((listing) => {
        if (!ignore) setClaudeSessions(listing.sessions);
      })
      .catch(() => {
        if (!ignore) setClaudeSessions([]);
      });
    return () => {
      ignore = true;
    };
  }, [slot.mode, selectedRepoPath, projectPath]);

  const modeConfig = getModeConfig(slot.mode);
  const ModeIcon = modeConfig.icon;

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setModeDropdownOpen(false);
      }
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setBranchDropdownOpen(false);
      }
      if (mcpDropdownRef.current && !mcpDropdownRef.current.contains(event.target as Node)) {
        setMcpDropdownOpen(false);
      }
      if (
        pluginsSkillsDropdownRef.current &&
        !pluginsSkillsDropdownRef.current.contains(event.target as Node)
      ) {
        setPluginsSkillsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus branch create input when shown
  useEffect(() => {
    if (showBranchCreate && branchCreateInputRef.current) {
      branchCreateInputRef.current.focus();
    }
  }, [showBranchCreate]);

  // Helper: relative time string
  const formatRelativeTime = (isoDate: string): string => {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    return new Date(isoDate).toLocaleDateString();
  };

  // MCP server display info
  const enabledCount = slot.enabledMcpServers.length;
  const totalCount = mcpServers.length;
  const hasMcpServers = totalCount > 0;

  // Helper to extract base name from skill ID (strip prefix like "plugin:", "project:", "personal:")
  const getSkillBaseName = (skillId: string): string => {
    const colonIndex = skillId.indexOf(":");
    return colonIndex >= 0 ? skillId.slice(colonIndex + 1) : skillId;
  };

  // Build a map of skill base name -> skill for quick lookup
  const skillByBaseName = new Map(skills.map((s) => [getSkillBaseName(s.id), s]));

  // Group skills by plugin using the plugin's skills array (matching by base name)
  const pluginSkillsMap = new Map<string, typeof skills>();
  const skillsInPlugins = new Set<string>();

  for (const plugin of plugins) {
    const pluginSkills: typeof skills = [];
    for (const skillId of plugin.skills) {
      const baseName = getSkillBaseName(skillId);
      const skill = skillByBaseName.get(baseName);
      if (skill) {
        pluginSkills.push(skill);
        skillsInPlugins.add(skill.id);
      }
    }
    if (pluginSkills.length > 0) {
      pluginSkillsMap.set(plugin.name, pluginSkills);
    }
  }

  // Toggle plugin expansion
  const togglePluginExpanded = (pluginId: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  };

  // Display info for combined Plugins & Skills
  const enabledPluginsCount = slot.enabledPlugins.length;
  const enabledSkillsCount = slot.enabledSkills.length;
  const hasPluginsOrSkills = plugins.length > 0 || skills.length > 0;

  // Find current branch display info
  const currentBranch = branches.find((b) => b.isCurrent);
  const selectedBranchInfo = slot.branch
    ? branches.find((b) => b.name === slot.branch)
    : currentBranch;
  /* What the panel knows about the branch: an explicit choice, else the polled
     current branch, else null because nothing has settled it yet.

     This is NOT a promise about where the launch lands, in either arm.
     With no explicit choice and `worktreeMode: "auto"`, the backend reuses the
     first managed worktree it finds and returns whatever branch that one is on,
     reaching HEAD only when there is none.
     And an explicit choice is not exact either: the picker offers remote-only
     refs, so this can hold `origin/x` while `resolve_local_branch_name` strips
     the remote and the session lands on `x`.

     Both are reasons to say less here, not more. Do not write a comment or a
     label that promises this value is the launch branch. */
  const resolvedBranch = selectedBranchInfo?.name ?? slot.branch ?? null;
  /* "Current" is the picker button's label for an unsettled branch, and reads
     as one there. It is a placeholder, so it stays inside the picker: see the
     resolves-to panel for what an unsettled branch is called where a reader
     takes the value for the branch itself. */
  const displayBranch = resolvedBranch ?? "Current";

  // Separate local and remote branches
  const localBranches = branches.filter((b) => !b.isRemote);
  // Filter out remote branches that already have a local counterpart
  // e.g., hide "origin/feature/foo" when "feature/foo" exists locally
  const localBranchNames = new Set(localBranches.map((b) => b.name));
  const remoteBranches = branches.filter((b) => {
    if (!b.isRemote) return false;
    const slashIndex = b.name.indexOf("/");
    if (slashIndex === -1) return true;
    const localName = b.name.substring(slashIndex + 1);
    return !localBranchNames.has(localName);
  });

  // Check if this is a multi-repo workspace
  const isMultiRepo = workspaceType === "multi-repo" && repositories && repositories.length > 0;
  // Get the selected repo info for display
  const selectedRepo = repositories?.find((r) => r.path === selectedRepoPath);
  /* Whether the repository this session lands in is a checkout at all. In a
     multi-repo workspace the selected repo answers, not `isGitRepo`: that is
     the result of the branch poll and lags a round behind the selection.

     This is NOT yet the only git-ness test in the file. The Working Directory
     selector and `resolvedWorkingDirectory` still read the raw poll flag, so
     they can disagree with this one for the length of a poll. Both belong
     with the queued resolves-to defects, which want fixing at the source
     rather than patched here. Do not assume this flag covers them. */
  const branchPickerIsGit = isMultiRepo ? Boolean(selectedRepo?.isGitRepo) : isGitRepo;

  /* The local branch name a choice really lands on. `resolve_local_branch_name`
     (src-tauri/src/commands/worktree.rs) strips the first segment of anything
     that is not a local branch before the session is created, so a remote-only
     `origin/x` becomes `x`. Mirror it exactly, including the case it
     deliberately leaves alone: `feature/foo` IS a local branch, so it survives
     whole, and stripping it here would print a branch that does not exist. */
  const localBranchName = (name: string): string => {
    if (branches.some((b) => !b.isRemote && b.name === name)) return name;
    const slashIndex = name.indexOf("/");
    return slashIndex === -1 ? name : name.substring(slashIndex + 1);
  };

  /* What the resolves-to row says about the branch, decided the way
     `launchSlotInner` decides it rather than the way the picker labels it.

     Four things could make this row name a branch the session will not be on,
     and all four are answered here, in one place, rather than patched where
     each shows up:

     - A poll in flight. Switching repository re-runs the branch poll, and
       until it returns, `branches` and `isGitRepo` still hold the PREVIOUS
       repository's answers. Nothing is claimed while `isLoadingBranches`.
     - The git flag, which is that poll's result and so lags the selection by a
       round. Covered by the same case: the in-flight window is the only one in
       which it can disagree with the selection.
     - Auto mode with no explicit choice. `prepare_worktree_inner` walks the
       managed worktrees and returns the FIRST one's branch, reaching HEAD only
       when there is none, so the polled current branch is a guess. `project`
       never prepares a worktree at all and `new` passes force_new, which skips
       that walk and cuts from HEAD, so both of those can still name it. A
       resume pins the project directory, so it can too.
     - A remote-only choice, stripped to its local name above.

     "resolved at launch" is this panel's existing words for a branch nothing
     has settled yet; the working-directory row says the same for the same
     reason. Do not replace it with a value that merely looks more specific. */
  const branchResolvesTo = isLoadingBranches
    ? "resolved at launch"
    : !branchPickerIsGit
      ? "not a git repository"
      : slot.branch
        ? localBranchName(slot.branch)
        : slot.worktreeMode === "auto" && !slot.resumeSessionId
          ? "resolved at launch"
          : (resolvedBranch ?? "resolved at launch");

  // What the launch will actually do, read off the same fields the launch
  // reads (see `launchSlotInner` in TerminalGrid). A worktree that does not
  // exist yet is described as one, never as a made-up path.
  const launchBasePath = selectedRepoPath || projectPath;
  const resolvedWorkingDirectory =
    slot.workingDirOverride && slot.workingDirOverride !== launchBasePath
      ? slot.workingDirOverride
      : !isGitRepo || slot.worktreeMode === "project" || slot.resumeSessionId
        ? launchBasePath
        : slot.worktreeMode === "new"
          ? "a new worktree, created at launch"
          : "this project's managed worktree, resolved at launch";
  const integrationsSummary = [
    countLabel(slot.enabledMcpServers.length, "MCP server"),
    countLabel(slot.enabledPlugins.length, "plugin"),
    countLabel(slot.enabledSkills.length, "skill"),
  ].join(" · ");

  return (
    // The `terminal-cell` class (globals.css) sets `overflow: hidden` and
    // is loaded after Tailwind utilities, so an `overflow-y-auto` on this
    // same element loses the cascade. Put the scroll responsibility on an
    // inner div instead — terminal-cell still clips visually for the
    // rounded border, and the inner div handles overflow.
    //
    // That inner div is also the column that holds the title, the two
    // content columns and the resolves-to strip, so all three scroll as one.
    <div className="session-setup terminal-cell flex h-full flex-col bg-maestro-bg">
      {/* One scroll container for the whole pane: the title spans the top, the
          project and settings columns sit under it (stacking when the pane is
          too narrow, which a split pane can be well before any viewport
          breakpoint would guess), and the resolves-to summary runs full width
          underneath both. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-7 pb-6 pt-8">
          <h2 className="text-[30px] font-semibold leading-tight tracking-tight text-maestro-text">
            New session
          </h2>
          <div className="flex items-center gap-1">
            {/* Zoom toggle button */}
            {onToggleZoom && (
              <button
                type="button"
                onClick={() => onToggleZoom()}
                className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-accent"
                title={isZoomed ? "Restore grid view" : "Zoom terminal"}
                aria-label={isZoomed ? "Restore grid view" : "Zoom terminal"}
              >
                {isZoomed ? <Minimize size={14} /> : <Expand size={14} />}
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-red"
              title="Remove session slot"
              aria-label="Remove session slot"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap content-start items-stretch">
          <ProjectColumn
            projectPath={projectPath}
            selectedRepoPath={selectedRepoPath}
            isMultiRepo={Boolean(isMultiRepo)}
            repositories={repositories}
            onRepoChange={onRepoChange}
            isGitRepo={branchPickerIsGit}
            currentBranch={currentBranch?.name ?? null}
          />

          <section
            aria-label="Session settings"
            className="flex min-w-[300px] flex-[3] basis-[420px] flex-col gap-5 px-7 pb-8"
          >
            {/* Window Name (optional) */}
            <div>
              <label
                htmlFor={`session-name-${slot.id}`}
                className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted"
              >
                Window Name <span className="text-maestro-muted/60">(optional)</span>
              </label>
              <input
                id={`session-name-${slot.id}`}
                type="text"
                value={slot.customName}
                onChange={(e) => onCustomNameChange(e.target.value)}
                placeholder="e.g. backend bugfix"
                maxLength={60}
                className="w-full rounded border border-maestro-border bg-maestro-card px-3 py-2 text-sm text-maestro-text outline-none transition-colors placeholder:text-maestro-muted/50 hover:border-maestro-accent/50 focus:border-maestro-accent"
              />
            </div>

            {/* AI Mode Selector */}
            <div className="relative" ref={modeDropdownRef}>
              <label
                htmlFor="prelaunch-ai-mode"
                className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted"
              >
                AI Mode
              </label>
              <button
                id="prelaunch-ai-mode"
                type="button"
                onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
                className="flex w-full items-center justify-between gap-2 rounded border border-maestro-border bg-maestro-card px-3 py-2 text-left text-sm text-maestro-text transition-colors hover:border-maestro-accent/50"
              >
                <div className="flex items-center gap-2">
                  <ModeIcon size={16} className={modeConfig.color} />
                  <span>{modeConfig.label}</span>
                </div>
                <ChevronDown size={14} className="text-maestro-muted" />
              </button>

              {modeDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded border border-maestro-border bg-maestro-card shadow-lg">
                  {AI_MODES.map((option) => {
                    const Icon = option.icon;
                    const isSelected = option.mode === slot.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        onClick={() => {
                          onModeChange(option.mode);
                          setModeDropdownOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? "bg-maestro-accent/10 text-maestro-text"
                            : "text-maestro-muted hover:bg-maestro-surface hover:text-maestro-text"
                        }`}
                      >
                        <Icon size={16} className={option.color} />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Repository & Branch Selector */}
            <div className="relative" ref={branchDropdownRef}>
              <label
                htmlFor="prelaunch-branch"
                className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted"
              >
                Git Branch
              </label>
              {!branchPickerIsGit ? (
                <div
                  id="prelaunch-branch"
                  className="flex items-center gap-2 rounded border border-maestro-border bg-maestro-card/50 px-3 py-2 text-sm text-maestro-muted"
                >
                  <Terminal size={14} />
                  <span>Not a Git repository</span>
                </div>
              ) : (
                <>
                  <button
                    id="prelaunch-branch"
                    type="button"
                    onClick={() => {
                      if (!branchDropdownOpen) onRefreshBranches?.();
                      setBranchDropdownOpen(!branchDropdownOpen);
                    }}
                    disabled={isLoadingBranches}
                    className="flex w-full items-center justify-between gap-2 rounded border border-maestro-border bg-maestro-card px-3 py-2 text-left text-sm text-maestro-text transition-colors hover:border-maestro-accent/50 disabled:opacity-50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <GitBranch size={14} className="shrink-0 text-maestro-accent" />
                      <span className="truncate">{displayBranch}</span>
                      {selectedBranchInfo?.hasWorktree && (
                        <span title="Worktree exists">
                          <FolderGit2 size={12} className="shrink-0 text-maestro-orange" />
                        </span>
                      )}
                      {selectedBranchInfo?.isCurrent && (
                        <span className="shrink-0 rounded bg-maestro-green/20 px-1 text-[9px] text-maestro-green">
                          current
                        </span>
                      )}
                      {slot.branch && !selectedBranchInfo && (
                        <span className="shrink-0 rounded bg-maestro-accent/20 px-1 text-[9px] text-maestro-accent">
                          new
                        </span>
                      )}
                    </div>
                    <ChevronDown size={14} className="shrink-0 text-maestro-muted" />
                  </button>

                  {branchDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded border border-maestro-border bg-maestro-card shadow-lg">
                      {/* Search input */}
                      <div className="border-b border-maestro-border p-2">
                        <div className="relative">
                          <Search
                            size={12}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-maestro-muted"
                          />
                          <input
                            type="text"
                            placeholder="Search branches..."
                            value={branchSearchQuery}
                            onChange={(e) => setBranchSearchQuery(e.target.value)}
                            className="w-full rounded border border-maestro-border bg-maestro-surface py-1.5 pl-7 pr-2 text-xs text-maestro-text placeholder:text-maestro-muted focus:border-maestro-accent focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      {/* Branch creation, in every workspace shape: the project column
                          picks the repository, so this always acts on that one. */}
                      {onCreateBranch && (
                        <div className="border-b border-maestro-border">
                          {showBranchCreate ? (
                            <div className="p-2">
                              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-maestro-muted/70">
                                New Branch Name
                              </div>
                              <div className="space-y-1.5">
                                <input
                                  ref={branchCreateInputRef}
                                  type="text"
                                  value={newBranchName}
                                  onChange={(e) => {
                                    setNewBranchName(e.target.value);
                                    setBranchCreateError(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const trimmed = newBranchName.trim();
                                      if (!trimmed || isCreatingBranch) return;
                                      if (!/^[a-zA-Z0-9._/-]+$/.test(trimmed)) {
                                        setBranchCreateError(
                                          "Invalid name. Use letters, numbers, dots, dashes, slashes.",
                                        );
                                        return;
                                      }
                                      setIsCreatingBranch(true);
                                      setBranchCreateError(null);
                                      onCreateBranch(
                                        trimmed,
                                        false,
                                        selectedRepoPath ?? projectPath,
                                      )
                                        .then(() => {
                                          onBranchChange(trimmed);
                                          setNewBranchName("");
                                          setShowBranchCreate(false);
                                          setBranchDropdownOpen(false);
                                          setBranchSearchQuery("");
                                        })
                                        .catch((err) => {
                                          setBranchCreateError(
                                            err instanceof Error
                                              ? err.message
                                              : "Failed to create branch",
                                          );
                                        })
                                        .finally(() => setIsCreatingBranch(false));
                                    } else if (e.key === "Escape") {
                                      e.preventDefault();
                                      setShowBranchCreate(false);
                                      setNewBranchName("");
                                      setBranchCreateError(null);
                                    }
                                  }}
                                  placeholder="feature/my-branch"
                                  className="w-full rounded border border-maestro-border bg-maestro-surface px-2 py-1 text-xs text-maestro-text placeholder:text-maestro-muted/50 focus:border-maestro-accent focus:outline-none"
                                  disabled={isCreatingBranch}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const trimmed = newBranchName.trim();
                                      if (!trimmed || isCreatingBranch) return;
                                      if (!/^[a-zA-Z0-9._/-]+$/.test(trimmed)) {
                                        setBranchCreateError(
                                          "Invalid name. Use letters, numbers, dots, dashes, slashes.",
                                        );
                                        return;
                                      }
                                      setIsCreatingBranch(true);
                                      setBranchCreateError(null);
                                      onCreateBranch(
                                        trimmed,
                                        false,
                                        selectedRepoPath ?? projectPath,
                                      )
                                        .then(() => {
                                          setNewBranchName("");
                                          setShowBranchCreate(false);
                                        })
                                        .catch((err) => {
                                          setBranchCreateError(
                                            err instanceof Error
                                              ? err.message
                                              : "Failed to create branch",
                                          );
                                        })
                                        .finally(() => setIsCreatingBranch(false));
                                    }}
                                    disabled={!newBranchName.trim() || isCreatingBranch}
                                    className="rounded border border-maestro-border bg-maestro-surface px-2 py-1 text-xs font-medium text-maestro-text disabled:opacity-50 hover:bg-maestro-border/40"
                                    title="Create branch without selecting"
                                  >
                                    {isCreatingBranch ? "..." : "Create"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const trimmed = newBranchName.trim();
                                      if (!trimmed || isCreatingBranch) return;
                                      if (!/^[a-zA-Z0-9._/-]+$/.test(trimmed)) {
                                        setBranchCreateError(
                                          "Invalid name. Use letters, numbers, dots, dashes, slashes.",
                                        );
                                        return;
                                      }
                                      setIsCreatingBranch(true);
                                      setBranchCreateError(null);
                                      onCreateBranch(
                                        trimmed,
                                        false,
                                        selectedRepoPath ?? projectPath,
                                      )
                                        .then(() => {
                                          onBranchChange(trimmed);
                                          setNewBranchName("");
                                          setShowBranchCreate(false);
                                          setBranchDropdownOpen(false);
                                          setBranchSearchQuery("");
                                        })
                                        .catch((err) => {
                                          setBranchCreateError(
                                            err instanceof Error
                                              ? err.message
                                              : "Failed to create branch",
                                          );
                                        })
                                        .finally(() => setIsCreatingBranch(false));
                                    }}
                                    disabled={!newBranchName.trim() || isCreatingBranch}
                                    className="rounded bg-maestro-accent px-2 py-1 text-xs font-medium text-maestro-on-accent disabled:opacity-50"
                                    title="Create branch and select it"
                                  >
                                    {isCreatingBranch ? "..." : "Create & Select"}
                                  </button>
                                </div>
                              </div>
                              {branchCreateError && (
                                <div className="mt-1 text-[10px] text-maestro-red">
                                  {branchCreateError}
                                </div>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowBranchCreate(true);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-maestro-accent transition-colors hover:bg-maestro-accent/10"
                            >
                              <Plus size={12} />
                              <span>Create New Branch</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="max-h-48 overflow-y-auto">
                        {/* Current branch option - only show if not searching or if it matches */}
                        {(!branchSearchQuery ||
                          "use current branch".includes(branchSearchQuery.toLowerCase())) && (
                          <button
                            type="button"
                            onClick={() => {
                              onBranchChange(null);
                              setBranchDropdownOpen(false);
                              setBranchSearchQuery("");
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                              slot.branch === null
                                ? "bg-maestro-accent/10 text-maestro-text"
                                : "text-maestro-muted hover:bg-maestro-surface hover:text-maestro-text"
                            }`}
                          >
                            <GitBranch size={14} />
                            <span>Use current branch</span>
                          </button>
                        )}

                        {/* Local branches */}
                        {localBranches.filter((b) =>
                          b.name.toLowerCase().includes(branchSearchQuery.toLowerCase()),
                        ).length > 0 && (
                          <>
                            <div className="border-t border-maestro-border px-3 py-1 text-[9px] font-medium uppercase tracking-wide text-maestro-muted">
                              Local
                            </div>
                            {localBranches
                              .filter((b) =>
                                b.name.toLowerCase().includes(branchSearchQuery.toLowerCase()),
                              )
                              .map((branch) => (
                                <button
                                  key={branch.name}
                                  type="button"
                                  onClick={() => {
                                    onBranchChange(branch.name);
                                    setBranchDropdownOpen(false);
                                    setBranchSearchQuery("");
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                    slot.branch === branch.name
                                      ? "bg-maestro-accent/10 text-maestro-text"
                                      : "text-maestro-muted hover:bg-maestro-surface hover:text-maestro-text"
                                  }`}
                                >
                                  <GitBranch size={14} />
                                  <span className="truncate">{branch.name}</span>
                                  {branch.hasWorktree && (
                                    <span title="Worktree exists">
                                      <FolderGit2
                                        size={12}
                                        className="shrink-0 text-maestro-orange"
                                      />
                                    </span>
                                  )}
                                  {branch.isCurrent && (
                                    <span className="shrink-0 rounded bg-maestro-green/20 px-1 text-[9px] text-maestro-green">
                                      current
                                    </span>
                                  )}
                                </button>
                              ))}
                          </>
                        )}

                        {/* Remote branches */}
                        {remoteBranches.filter((b) =>
                          b.name.toLowerCase().includes(branchSearchQuery.toLowerCase()),
                        ).length > 0 && (
                          <>
                            <div className="border-t border-maestro-border px-3 py-1 text-[9px] font-medium uppercase tracking-wide text-maestro-muted">
                              Remote
                            </div>
                            {remoteBranches
                              .filter((b) =>
                                b.name.toLowerCase().includes(branchSearchQuery.toLowerCase()),
                              )
                              .map((branch) => (
                                <button
                                  key={branch.name}
                                  type="button"
                                  onClick={() => {
                                    onBranchChange(branch.name);
                                    setBranchDropdownOpen(false);
                                    setBranchSearchQuery("");
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                    slot.branch === branch.name
                                      ? "bg-maestro-accent/10 text-maestro-text"
                                      : "text-maestro-muted hover:bg-maestro-surface hover:text-maestro-text"
                                  }`}
                                >
                                  <GitBranch size={14} className="text-maestro-muted/60" />
                                  <span className="truncate">{branch.name}</span>
                                  {branch.hasWorktree && (
                                    <span title="Worktree exists">
                                      <FolderGit2
                                        size={12}
                                        className="shrink-0 text-maestro-orange"
                                      />
                                    </span>
                                  )}
                                </button>
                              ))}
                          </>
                        )}

                        {/* Create new branch option - show when query doesn't exactly match any branch */}
                        {branchSearchQuery.trim() &&
                          isValidBranchName(branchSearchQuery.trim()) &&
                          !branches.some((b) => b.name === branchSearchQuery.trim()) && (
                            <>
                              <div className="border-t border-maestro-border px-3 py-1 text-[9px] font-medium uppercase tracking-wide text-maestro-muted">
                                Create
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onBranchChange(branchSearchQuery.trim());
                                  setBranchDropdownOpen(false);
                                  setBranchSearchQuery("");
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-maestro-accent transition-colors hover:bg-maestro-accent/10"
                              >
                                <Plus size={14} />
                                <span className="truncate">
                                  Create{" "}
                                  <span className="font-medium">{branchSearchQuery.trim()}</span>
                                </span>
                              </button>
                            </>
                          )}

                        {/* No results message */}
                        {branchSearchQuery &&
                          !isValidBranchName(branchSearchQuery.trim()) &&
                          localBranches.filter((b) =>
                            b.name.toLowerCase().includes(branchSearchQuery.toLowerCase()),
                          ).length === 0 &&
                          remoteBranches.filter((b) =>
                            b.name.toLowerCase().includes(branchSearchQuery.toLowerCase()),
                          ).length === 0 &&
                          !"use current branch".includes(branchSearchQuery.toLowerCase()) && (
                            <div className="px-3 py-2 text-center text-xs text-maestro-muted">
                              No branches match "{branchSearchQuery}"
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Worktree Mode Selector — only shown for git repos */}
            {isGitRepo && (
              <div>
                {/* Group heading for the worktree mode buttons below — not a control label. */}
                <span className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
                  Working Directory
                </span>
                <div className="flex gap-1">
                  {(["auto", "project", "new"] as WorktreeMode[]).map((m) => {
                    const labels: Record<WorktreeMode, string> = {
                      auto: "Current Worktree",
                      project: "Original Path",
                      new: "New Worktree",
                    };
                    const isActive = slot.worktreeMode === m;
                    const isDisabled = m === "auto" && !hasManagedWorktree;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && onWorktreeModeChange(m)}
                        title={
                          isDisabled ? "No managed worktree exists for this project" : undefined
                        }
                        className={`flex-1 rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          isDisabled
                            ? "border border-maestro-border bg-maestro-card text-maestro-muted opacity-40 cursor-not-allowed"
                            : isActive
                              ? "bg-maestro-accent text-maestro-on-accent"
                              : "border border-maestro-border bg-maestro-card text-maestro-muted hover:text-maestro-text hover:border-maestro-accent/50"
                        }`}
                      >
                        {labels[m]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MCP Servers Selector */}
            <div className="relative" ref={mcpDropdownRef}>
              <label
                htmlFor="prelaunch-mcp-servers"
                className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted"
              >
                MCP Servers
              </label>
              {!hasMcpServers ? (
                <div
                  id="prelaunch-mcp-servers"
                  className="flex items-center gap-2 rounded border border-maestro-border bg-maestro-card/50 px-3 py-2 text-sm text-maestro-muted"
                >
                  <Server size={14} />
                  <span>No MCP servers configured</span>
                </div>
              ) : (
                <>
                  <button
                    id="prelaunch-mcp-servers"
                    type="button"
                    onClick={() => setMcpDropdownOpen(!mcpDropdownOpen)}
                    className="flex w-full items-center justify-between gap-2 rounded border border-maestro-border bg-maestro-card px-3 py-2 text-left text-sm text-maestro-text transition-colors hover:border-maestro-accent/50"
                  >
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-maestro-green" />
                      <span>
                        {enabledCount} of {totalCount} servers
                      </span>
                    </div>
                    <ChevronDown size={14} className="text-maestro-muted" />
                  </button>

                  {mcpDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded border border-maestro-border bg-maestro-card shadow-lg">
                      {/* Search input */}
                      <div className="border-b border-maestro-border p-2">
                        <div className="relative">
                          <Search
                            size={12}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-maestro-muted"
                          />
                          <input
                            type="text"
                            placeholder="Search servers..."
                            value={mcpSearchQuery}
                            onChange={(e) => setMcpSearchQuery(e.target.value)}
                            className="w-full rounded border border-maestro-border bg-maestro-surface py-1.5 pl-7 pr-2 text-xs text-maestro-text placeholder:text-maestro-muted focus:border-maestro-accent focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      {/* Select All / Unselect All buttons */}
                      <div className="flex items-center justify-between border-b border-maestro-border px-2 py-1.5">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMcpSelectAll();
                            }}
                            className="rounded bg-maestro-surface px-2 py-0.5 text-[10px] text-maestro-muted transition-colors hover:bg-maestro-border hover:text-maestro-text"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMcpUnselectAll();
                            }}
                            className="rounded bg-maestro-surface px-2 py-0.5 text-[10px] text-maestro-muted transition-colors hover:bg-maestro-border hover:text-maestro-text"
                          >
                            Unselect All
                          </button>
                        </div>
                        <span className="text-[10px] text-maestro-muted">
                          {enabledCount}/{totalCount}
                        </span>
                      </div>
                      {/* Server list */}
                      <div className="max-h-36 overflow-y-auto">
                        {mcpServers
                          .filter((server) =>
                            server.name.toLowerCase().includes(mcpSearchQuery.toLowerCase()),
                          )
                          .map((server) => {
                            const isEnabled = slot.enabledMcpServers.includes(server.name);
                            const serverType = server.type;
                            return (
                              <button
                                key={server.name}
                                type="button"
                                onClick={() => onMcpToggle(server.name)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-maestro-surface"
                              >
                                <span
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                    isEnabled
                                      ? "border-maestro-green bg-maestro-green"
                                      : "border-maestro-border bg-transparent"
                                  }`}
                                >
                                  {isEnabled && <Check size={12} className="text-white" />}
                                </span>
                                <span
                                  className={isEnabled ? "text-maestro-text" : "text-maestro-muted"}
                                >
                                  {server.name}
                                </span>
                                <span className="ml-auto text-[10px] text-maestro-muted/60">
                                  {serverType}
                                </span>
                              </button>
                            );
                          })}
                        {mcpServers.filter((server) =>
                          server.name.toLowerCase().includes(mcpSearchQuery.toLowerCase()),
                        ).length === 0 && (
                          <div className="px-3 py-2 text-center text-xs text-maestro-muted">
                            No servers match "{mcpSearchQuery}"
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Plugins & Skills Selector */}
            <div className="relative" ref={pluginsSkillsDropdownRef}>
              <label
                htmlFor="prelaunch-plugins-skills"
                className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted"
              >
                Plugins & Skills
              </label>
              {!hasPluginsOrSkills ? (
                <div
                  id="prelaunch-plugins-skills"
                  className="flex items-center gap-2 rounded border border-maestro-border bg-maestro-card/50 px-3 py-2 text-sm text-maestro-muted"
                >
                  <Store size={14} />
                  <span>No plugins or skills configured</span>
                </div>
              ) : (
                <>
                  <button
                    id="prelaunch-plugins-skills"
                    type="button"
                    onClick={() => setPluginsSkillsDropdownOpen(!pluginsSkillsDropdownOpen)}
                    className="flex w-full items-center justify-between gap-2 rounded border border-maestro-border bg-maestro-card px-3 py-2 text-left text-sm text-maestro-text transition-colors hover:border-maestro-accent/50"
                  >
                    <div className="flex items-center gap-2">
                      <Store size={14} className="text-maestro-purple" />
                      <span>
                        {enabledPluginsCount} plugins, {enabledSkillsCount} skills
                      </span>
                    </div>
                    <ChevronDown size={14} className="text-maestro-muted" />
                  </button>

                  {pluginsSkillsDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded border border-maestro-border bg-maestro-card shadow-lg">
                      {/* Search input */}
                      <div className="border-b border-maestro-border p-2">
                        <div className="relative">
                          <Search
                            size={12}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-maestro-muted"
                          />
                          <input
                            type="text"
                            placeholder="Search plugins & skills..."
                            value={pluginsSearchQuery}
                            onChange={(e) => setPluginsSearchQuery(e.target.value)}
                            className="w-full rounded border border-maestro-border bg-maestro-surface py-1.5 pl-7 pr-2 text-xs text-maestro-text placeholder:text-maestro-muted focus:border-maestro-accent focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      {/* Select All / Unselect All buttons */}
                      <div className="flex items-center justify-between border-b border-maestro-border px-2 py-1.5">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPluginsSelectAll();
                            }}
                            className="rounded bg-maestro-surface px-2 py-0.5 text-[10px] text-maestro-muted transition-colors hover:bg-maestro-border hover:text-maestro-text"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPluginsUnselectAll();
                            }}
                            className="rounded bg-maestro-surface px-2 py-0.5 text-[10px] text-maestro-muted transition-colors hover:bg-maestro-border hover:text-maestro-text"
                          >
                            Unselect All
                          </button>
                        </div>
                        <span className="text-[10px] text-maestro-muted">
                          {enabledPluginsCount}P / {enabledSkillsCount}S
                        </span>
                      </div>
                      {/* Scrollable content */}
                      <div className="max-h-52 overflow-y-auto">
                        {/* Plugins with their skills */}
                        {plugins.length > 0 && (
                          <>
                            <div className="border-b border-maestro-border px-3 py-1.5 text-[9px] font-medium uppercase tracking-wide text-maestro-muted">
                              Plugins ({plugins.length})
                            </div>
                            {plugins
                              .filter((plugin) => {
                                if (!pluginsSearchQuery) return true;
                                const query = pluginsSearchQuery.toLowerCase();
                                // Match plugin name
                                if (plugin.name.toLowerCase().includes(query)) return true;
                                // Match any skill name within the plugin
                                const pluginSkills = pluginSkillsMap.get(plugin.name) ?? [];
                                return pluginSkills.some((skill) =>
                                  skill.name.toLowerCase().includes(query),
                                );
                              })
                              .map((plugin) => {
                                const isPluginEnabled = slot.enabledPlugins.includes(plugin.id);
                                const pluginSkills = pluginSkillsMap.get(plugin.name) ?? [];
                                const isExpanded = expandedPlugins.has(plugin.id);
                                const hasSkillsToShow = pluginSkills.length > 0;

                                // Filter skills by search query
                                const filteredPluginSkills = pluginsSearchQuery
                                  ? pluginSkills.filter((skill) =>
                                      skill.name
                                        .toLowerCase()
                                        .includes(pluginsSearchQuery.toLowerCase()),
                                    )
                                  : pluginSkills;

                                return (
                                  <div key={plugin.id}>
                                    {/* Plugin row */}
                                    <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-maestro-surface">
                                      {/* Expand/collapse button */}
                                      {hasSkillsToShow ? (
                                        <button
                                          type="button"
                                          onClick={() => togglePluginExpanded(plugin.id)}
                                          className="shrink-0 rounded p-0.5 hover:bg-maestro-border/40"
                                        >
                                          {isExpanded ? (
                                            <ChevronDown size={12} className="text-maestro-muted" />
                                          ) : (
                                            <ChevronRight
                                              size={12}
                                              className="text-maestro-muted"
                                            />
                                          )}
                                        </button>
                                      ) : (
                                        <span className="w-5" />
                                      )}
                                      {/* Plugin checkbox */}
                                      <button
                                        type="button"
                                        onClick={() => onPluginToggle(plugin.id)}
                                        className="flex flex-1 items-center gap-2 text-left text-sm"
                                      >
                                        <span
                                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                            isPluginEnabled
                                              ? "border-maestro-purple bg-maestro-purple"
                                              : "border-maestro-border bg-transparent"
                                          }`}
                                        >
                                          {isPluginEnabled && (
                                            <Check size={12} className="text-white" />
                                          )}
                                        </span>
                                        <Package
                                          size={12}
                                          className="shrink-0 text-maestro-purple"
                                        />
                                        <span
                                          className={`flex-1 truncate ${isPluginEnabled ? "text-maestro-text" : "text-maestro-muted"}`}
                                        >
                                          {plugin.name}
                                        </span>
                                        {hasSkillsToShow && (
                                          <span className="text-[10px] text-maestro-muted">
                                            {pluginSkills.length}
                                          </span>
                                        )}
                                        <span className="text-[10px] text-maestro-muted/60">
                                          v{plugin.version}
                                        </span>
                                      </button>
                                    </div>
                                    {/* Expanded skills */}
                                    {isExpanded && hasSkillsToShow && (
                                      <div className="ml-5 border-l border-maestro-border/40 pl-2">
                                        {(pluginsSearchQuery
                                          ? filteredPluginSkills
                                          : pluginSkills
                                        ).map((skill) => {
                                          const isSkillEnabled = slot.enabledSkills.includes(
                                            skill.id,
                                          );
                                          return (
                                            <button
                                              key={skill.id}
                                              type="button"
                                              onClick={() => onSkillToggle(skill.id)}
                                              className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm transition-colors hover:bg-maestro-surface"
                                              title={skill.description || undefined}
                                            >
                                              <span
                                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                                  isSkillEnabled
                                                    ? "border-maestro-orange bg-maestro-orange"
                                                    : "border-maestro-border bg-transparent"
                                                }`}
                                              >
                                                {isSkillEnabled && (
                                                  <Check size={10} className="text-white" />
                                                )}
                                              </span>
                                              <Zap
                                                size={11}
                                                className="shrink-0 text-maestro-orange"
                                              />
                                              <span
                                                className={`flex-1 truncate text-xs ${isSkillEnabled ? "text-maestro-text" : "text-maestro-muted"}`}
                                              >
                                                {skill.name}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </>
                        )}

                        {/* Standalone Skills - hidden from toggles since Claude CLI cannot disable them per-session */}

                        {/* No results message */}
                        {pluginsSearchQuery &&
                          plugins.filter((plugin) => {
                            const query = pluginsSearchQuery.toLowerCase();
                            if (plugin.name.toLowerCase().includes(query)) return true;
                            const pluginSkills = pluginSkillsMap.get(plugin.name) ?? [];
                            return pluginSkills.some((skill) =>
                              skill.name.toLowerCase().includes(query),
                            );
                          }).length === 0 && (
                            <div className="px-3 py-2 text-center text-xs text-maestro-muted">
                              No results match "{pluginsSearchQuery}"
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Resume Session Picker — Claude only */}
            {slot.mode === "Claude" && claudeSessions.length > 0 && (
              <div>
                {/* Group heading for the session cards below — not a control label. */}
                <span className="mb-1.5 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
                  Resume Previous Session
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {claudeSessions.map((session) => {
                    const isSelected = slot.resumeSessionId === session.session_id;
                    return (
                      <div
                        key={session.session_id}
                        className={`relative flex w-44 shrink-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "border-violet-500/50 bg-violet-500/10"
                            : "border-maestro-border bg-maestro-card hover:border-maestro-accent/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onResumeSessionChange(isSelected ? null : session.session_id)
                          }
                          className="flex flex-1 flex-col gap-1 text-left"
                        >
                          <span className="line-clamp-2 pr-4 text-xs leading-snug text-maestro-text">
                            {session.first_prompt ?? "No prompt recorded"}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] text-maestro-muted">
                            {session.git_branch && (
                              <span className="flex items-center gap-0.5 truncate">
                                <GitBranch size={9} />
                                {session.git_branch}
                              </span>
                            )}
                            <span className="shrink-0">
                              {formatRelativeTime(session.last_active)}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          title="Delete session"
                          onClick={(e) => {
                            e.stopPropagation();
                            const preview =
                              session.first_prompt?.trim().slice(0, 80) ?? "this session";
                            if (
                              !window.confirm(
                                `Delete \u201C${preview}\u201D? The transcript cannot be recovered.`,
                              )
                            ) {
                              return;
                            }
                            if (isSelected) onResumeSessionChange(null);
                            deleteClaudeSession(selectedRepoPath || projectPath, session.session_id)
                              .then(() => {
                                setClaudeSessions((prev) =>
                                  prev.filter((s) => s.session_id !== session.session_id),
                                );
                              })
                              .catch((err) => {
                                console.error("Failed to delete Claude session:", err);
                              });
                          }}
                          className="absolute right-1.5 top-1.5 rounded p-0.5 text-maestro-muted opacity-0 transition-opacity hover:text-maestro-red [div:hover>&]:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tmuxSessions.length > 0 && onAttachTmuxChange && (
              <section aria-label="Attach to tmux" className="flex flex-col gap-1.5">
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
                  Attach to tmux
                </span>
                {tmuxSessions.map((tmux) => {
                  const selected = slot.attachTmux === tmux.name;
                  return (
                    <button
                      key={tmux.name}
                      type="button"
                      aria-pressed={selected}
                      title={tmux.cwd}
                      onClick={() => onAttachTmuxChange(selected ? null : tmux.name)}
                      className={`flex items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "border-maestro-accent bg-maestro-card text-maestro-text"
                          : "border-maestro-border bg-maestro-card/50 text-maestro-muted hover:border-maestro-accent/50"
                      }`}
                    >
                      <span className="truncate">{tmux.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-maestro-muted">
                        {tmux.attached ? "attached" : "detached"}
                      </span>
                    </button>
                  );
                })}
              </section>
            )}

            {/* Launch Button */}
            <button
              type="button"
              onClick={onLaunch}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-maestro-accent px-4 py-2.5 text-sm font-medium text-maestro-on-accent transition-colors hover:bg-maestro-accent/80"
            >
              <Play size={16} fill="currentColor" />
              {slot.attachTmux
                ? "Attach"
                : slot.resumeSessionId
                  ? "Resume Session"
                  : "Launch Session"}
            </button>
          </section>
        </div>

        {/* Full width, under both columns: this summarises the whole form, so
            it reads better wide than as a third column squeezed beside it. */}
        <section
          aria-label="Resolves to"
          className="mt-auto flex flex-col gap-4 border-t border-maestro-border bg-maestro-surface px-7 py-6"
        >
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
            Resolves to
          </span>
          {slot.attachTmux ? (
            <div className="flex flex-col gap-2">
              <ResolveRow label="runs on">
                this machine, and attaches to the tmux session {slot.attachTmux}
              </ResolveRow>
              <p className="m-0 text-[11.5px] leading-relaxed text-maestro-muted">
                That session keeps running whatever it is already running, so the settings above do
                not apply to it.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <ResolveRow label="runs on">this machine</ResolveRow>
              <ResolveRow label="agent">
                {modeConfig.label}
                {slot.resumeSessionId ? " · resuming a previous conversation" : ""}
              </ResolveRow>
              <ResolveRow label="branch">
                {/* Every reason this row could name the wrong branch is settled in
                  `branchResolvesTo` above, next to the launch conditions it
                  mirrors. Do not reintroduce a test here: a second one drifts
                  from the first, which is how the panel came to disagree with
                  the picker in the first place. */}
                {branchResolvesTo}
              </ResolveRow>
              <ResolveRow label="working directory">{resolvedWorkingDirectory}</ResolveRow>
              <ResolveRow label="integrations">{integrationsSummary}</ResolveRow>
              <ResolveRow label="images stage to">
                this machine, until the session is given an SSH destination
              </ResolveRow>
              <ResolveRow label="cleanup">
                staged images are kept for 24 hours, and removed when the session closes
              </ResolveRow>
            </div>
          )}
          <p className="m-0 text-[11.5px] leading-relaxed text-maestro-muted">
            Maestro launches sessions on this machine. There is no remote launcher, and setting an
            image destination only changes where a pasted file is written.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Above this many projects the column earns a filter box; below it, clutter. */
const FILTER_PROJECTS_ABOVE = 8;

/**
 * The pane's left column: which project this session lands in.
 *
 * The design this screen is ported from picks an execution host here, which
 * this app has no notion of. A workspace with several repositories does have
 * something to pick, so that becomes the list. A single-project workspace has
 * nothing to choose between, so it states the project instead of rendering a
 * picker with one row in it.
 */
function ProjectColumn({
  projectPath,
  selectedRepoPath,
  isMultiRepo,
  repositories,
  onRepoChange,
  isGitRepo,
  currentBranch,
}: {
  projectPath: string;
  selectedRepoPath?: string;
  isMultiRepo: boolean;
  repositories?: RepositoryInfo[];
  onRepoChange?: (repoPath: string) => void;
  isGitRepo: boolean;
  /**
   * The repository's own HEAD, or null while the poll has not answered. NOT
   * the branch this session will land on: that is the user's pick, it can be
   * a name that does not exist yet, and under "Project" a reader would take
   * it for the checkout's own state.
   */
  currentBranch: string | null;
}) {
  const [filter, setFilter] = useState("");
  const path = selectedRepoPath || projectPath;
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? (repositories ?? []).filter((r) => r.name.toLowerCase().includes(needle))
    : (repositories ?? []);
  /* Trailing separators would otherwise make the name empty. */
  const name = path.replace(/\/+$/, "").split("/").pop() || path;

  return (
    <section
      aria-label="Project"
      className="flex min-w-[220px] max-w-[380px] flex-1 basis-[260px] flex-col gap-4 self-stretch border-r border-maestro-border bg-maestro-surface px-7 pb-8"
    >
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.07em] text-maestro-muted">
        Project
      </span>

      {isMultiRepo && repositories && repositories.length > 0 ? (
        <div className="flex min-h-0 flex-col gap-2">
          {/* The old repo tree inside the branch dropdown could be searched.
              A workspace of a dozen nested checkouts needs that here now,
              and a workspace of three does not. */}
          {repositories.length > FILTER_PROJECTS_ABOVE && (
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter projects..."
              aria-label="Filter projects"
              className="w-full rounded border border-maestro-border bg-maestro-card px-2 py-1.5 text-xs text-maestro-text outline-none transition-colors placeholder:text-maestro-muted/60 focus:border-maestro-accent"
            />
          )}
          <div className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto">
            {shown.map((repo) => {
              const selected = repo.path === selectedRepoPath;
              return (
                <button
                  key={repo.path}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onRepoChange?.(repo.path)}
                  title={repo.path}
                  className={`flex flex-col items-start gap-0.5 rounded border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-maestro-accent bg-maestro-card"
                      : "border-transparent hover:border-maestro-border hover:bg-maestro-card/60"
                  }`}
                >
                  <span className="w-full truncate text-sm text-maestro-text">{repo.name}</span>
                  <span className="w-full truncate font-mono text-[11px] text-maestro-muted">
                    {repo.isGitRepo
                      ? (repo.currentBranch ?? "no branch yet")
                      : "not a git repository"}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <span className="px-1 py-2 text-xs text-maestro-muted">No project matches.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="break-words text-sm text-maestro-text">{name}</span>
          <span className="break-words font-mono text-[11px] leading-relaxed text-maestro-muted">
            {path}
          </span>
          <span className="mt-2 font-mono text-[11px] leading-relaxed text-maestro-muted">
            {isGitRepo ? (currentBranch ?? "branch resolved at launch") : "not a git repository"}
          </span>
        </div>
      )}
    </section>
  );
}

/** One `label` / `value` pair of the resolves-to summary. */
function ResolveRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    /* Bounded width so the pairs wrap into readable columns across the strip
       rather than one pair stretching the full pane. */
    <div className="min-w-[180px] max-w-[420px]">
      <div className="font-mono text-[11px] leading-relaxed text-maestro-muted">{label}</div>
      <div className="mt-0.5 break-words font-mono text-xs leading-relaxed text-maestro-text">
        {children}
      </div>
    </div>
  );
}

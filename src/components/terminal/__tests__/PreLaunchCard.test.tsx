import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreLaunchCard, type SessionSlot } from "../PreLaunchCard";

vi.mock("@/lib/terminal", () => ({
  listClaudeSessions: vi
    .fn()
    .mockResolvedValue({ sessions: [], total_found: 0, truncated: false, unreadable: 0 }),
  deleteClaudeSession: vi.fn().mockResolvedValue(undefined),
}));

describe("PreLaunchCard branch creation", () => {
  const makeSlot = (overrides?: Partial<SessionSlot>): SessionSlot => ({
    id: "slot-1",
    mode: "Claude",
    branch: null,
    sessionId: null,
    worktreePath: null,
    worktreeWarning: null,
    enabledMcpServers: [],
    enabledSkills: [],
    enabledPlugins: [],
    ...overrides,
  });

  const defaultProps = {
    slot: makeSlot(),
    projectPath: "/tmp/test-repo",
    branches: [
      { name: "main", isRemote: false, isCurrent: true, hasWorktree: false },
      { name: "develop", isRemote: false, isCurrent: false, hasWorktree: false },
    ],
    isLoadingBranches: false,
    isGitRepo: true,
    mcpServers: [],
    skills: [],
    plugins: [],
    onModeChange: vi.fn(),
    onBranchChange: vi.fn(),
    onMcpToggle: vi.fn(),
    onSkillToggle: vi.fn(),
    onPluginToggle: vi.fn(),
    onMcpSelectAll: vi.fn(),
    onMcpUnselectAll: vi.fn(),
    onPluginsSelectAll: vi.fn(),
    onPluginsUnselectAll: vi.fn(),
    onLaunch: vi.fn(),
    onRemove: vi.fn(),
    onResumeSessionChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Helper to open the branch dropdown */
  it("keeps launch available while advanced integrations are collapsed", () => {
    render(<PreLaunchCard {...defaultProps} />);
    expect(screen.queryByText("No MCP servers configured")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Launch Session" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }));
    expect(screen.getByText("No MCP servers configured")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Launch Session" }));
    expect(defaultProps.onLaunch).toHaveBeenCalledTimes(1);
  });

  function openBranchDropdown() {
    // The branch selector button contains the display branch name ("main")
    // and a GitBranch icon. The resolves-to summary names the same branch, so
    // take the occurrence that is inside a button.
    const branchButton = screen
      .getAllByText("main")
      .map((node) => node.closest("button"))
      .find((node): node is HTMLButtonElement => node !== null);
    if (branchButton) fireEvent.click(branchButton);
  }

  it("shows 'Create New Branch' button in branch dropdown when onCreateBranch is provided", () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined);
    render(<PreLaunchCard {...defaultProps} onCreateBranch={onCreateBranch} />);

    openBranchDropdown();

    expect(screen.getByText("Create New Branch")).toBeInTheDocument();
  });

  it("does NOT show 'Create New Branch' when onCreateBranch prop is omitted", () => {
    render(<PreLaunchCard {...defaultProps} />);

    openBranchDropdown();

    expect(screen.queryByText("Create New Branch")).not.toBeInTheDocument();
  });

  it("clicking 'Create New Branch' shows input with 'Create' and 'Create & Select' buttons", () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined);
    render(<PreLaunchCard {...defaultProps} onCreateBranch={onCreateBranch} />);

    openBranchDropdown();
    fireEvent.click(screen.getByText("Create New Branch"));

    expect(screen.getByPlaceholderText("feature/my-branch")).toBeInTheDocument();
    expect(screen.getByTitle("Create branch without selecting")).toBeInTheDocument();
    expect(screen.getByTitle("Create branch and select it")).toBeInTheDocument();
  });

  it("'Create' calls onCreateBranch(name, false) and does NOT call onBranchChange", async () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined);
    render(<PreLaunchCard {...defaultProps} onCreateBranch={onCreateBranch} />);

    openBranchDropdown();
    fireEvent.click(screen.getByText("Create New Branch"));
    fireEvent.change(screen.getByPlaceholderText("feature/my-branch"), {
      target: { value: "feature/test" },
    });
    fireEvent.click(screen.getByTitle("Create branch without selecting"));

    await waitFor(() => {
      expect(onCreateBranch).toHaveBeenCalledWith("feature/test", false);
    });
    // onBranchChange should NOT be called by the "Create" button
    expect(defaultProps.onBranchChange).not.toHaveBeenCalled();
  });

  it("'Create & Select' calls onCreateBranch(name, false) and then onBranchChange(name)", async () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined);
    render(<PreLaunchCard {...defaultProps} onCreateBranch={onCreateBranch} />);

    openBranchDropdown();
    fireEvent.click(screen.getByText("Create New Branch"));
    fireEvent.change(screen.getByPlaceholderText("feature/my-branch"), {
      target: { value: "feature/select" },
    });
    fireEvent.click(screen.getByTitle("Create branch and select it"));

    await waitFor(() => {
      expect(onCreateBranch).toHaveBeenCalledWith("feature/select", false);
    });
    await waitFor(() => {
      expect(defaultProps.onBranchChange).toHaveBeenCalledWith("feature/select");
    });
  });

  it("invalid branch name shows validation error", async () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined);
    render(<PreLaunchCard {...defaultProps} onCreateBranch={onCreateBranch} />);

    openBranchDropdown();
    fireEvent.click(screen.getByText("Create New Branch"));
    fireEvent.change(screen.getByPlaceholderText("feature/my-branch"), {
      target: { value: "bad name with spaces" },
    });
    fireEvent.click(screen.getByTitle("Create branch and select it"));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid name. Use letters, numbers, dots, dashes, slashes."),
      ).toBeInTheDocument();
    });
    expect(onCreateBranch).not.toHaveBeenCalled();
  });

  it("Escape closes the creation input", () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined);
    render(<PreLaunchCard {...defaultProps} onCreateBranch={onCreateBranch} />);

    openBranchDropdown();
    fireEvent.click(screen.getByText("Create New Branch"));

    const input = screen.getByPlaceholderText("feature/my-branch");
    expect(input).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByPlaceholderText("feature/my-branch")).not.toBeInTheDocument();
    expect(screen.getByText("Create New Branch")).toBeInTheDocument();
  });
});

describe("PreLaunchCard AI Mode Selection", () => {
  const makeSlot = (overrides?: Partial<SessionSlot>): SessionSlot => ({
    id: "slot-1",
    mode: "Claude",
    branch: null,
    sessionId: null,
    worktreePath: null,
    worktreeWarning: null,
    enabledMcpServers: [],
    enabledSkills: [],
    enabledPlugins: [],
    ...overrides,
  });

  const defaultProps = {
    slot: makeSlot(),
    projectPath: "/tmp/test-repo",
    branches: [
      { name: "main", isRemote: false, isCurrent: true, hasWorktree: false },
      { name: "develop", isRemote: false, isCurrent: false, hasWorktree: false },
    ],
    isLoadingBranches: false,
    isGitRepo: true,
    mcpServers: [],
    skills: [],
    plugins: [],
    onModeChange: vi.fn(),
    onBranchChange: vi.fn(),
    onMcpToggle: vi.fn(),
    onSkillToggle: vi.fn(),
    onPluginToggle: vi.fn(),
    onMcpSelectAll: vi.fn(),
    onMcpUnselectAll: vi.fn(),
    onPluginsSelectAll: vi.fn(),
    onPluginsUnselectAll: vi.fn(),
    onLaunch: vi.fn(),
    onRemove: vi.fn(),
    onResumeSessionChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Helper to open the AI mode dropdown */
  function openModeDropdown() {
    // Find the AI Mode section and click its dropdown button
    const aiModeLabel = screen.getByText("AI Mode");
    const dropdownContainer = aiModeLabel.parentElement;
    const modeButton = dropdownContainer?.querySelector("button");
    if (modeButton) fireEvent.click(modeButton);
  }

  it("displays all AI providers in the mode dropdown", () => {
    render(<PreLaunchCard {...defaultProps} />);

    openModeDropdown();

    // Verify all providers are shown in the dropdown
    // Use getAllByText since provider names may appear in both button and dropdown
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Gemini CLI").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Codex").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("OpenCode").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Terminal").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onModeChange with correct mode when each provider is selected", () => {
    const providers = [
      { label: "Claude Code", mode: "Claude" },
      { label: "Gemini CLI", mode: "Gemini" },
      { label: "Codex", mode: "Codex" },
      { label: "OpenCode", mode: "OpenCode" },
      { label: "Terminal", mode: "Plain" },
    ];

    for (const { label, mode } of providers) {
      vi.clearAllMocks();

      // Render fresh for each provider test
      render(<PreLaunchCard {...defaultProps} />);

      openModeDropdown();

      // Click on the provider. The trigger, the dropdown option and the
      // resolves-to summary can all carry the label; only the first two sit
      // inside a button, and the dropdown option is the later of those.
      const providerButtons = screen
        .getAllByText(label)
        .map((node) => node.closest("button"))
        .filter((node): node is HTMLButtonElement => node !== null);
      const providerButton = providerButtons[providerButtons.length - 1];
      fireEvent.click(providerButton);

      // Verify onModeChange was called with the correct mode
      expect(defaultProps.onModeChange).toHaveBeenCalledWith(mode);
      expect(defaultProps.onModeChange).toHaveBeenCalledTimes(1);

      // Cleanup for next iteration
      cleanup();
    }
  });
});

describe("PreLaunchCard resolves-to panel", () => {
  const makeSlot = (overrides?: Partial<SessionSlot>): SessionSlot => ({
    id: "slot-1",
    mode: "Claude",
    branch: null,
    customName: "",
    worktreeMode: "project",
    sessionId: null,
    worktreePath: null,
    worktreeWarning: null,
    enabledMcpServers: [],
    enabledSkills: [],
    enabledPlugins: [],
    ...overrides,
  });

  const baseProps = {
    projectPath: "/tmp/test-repo",
    branches: [
      { name: "main", isRemote: false, isCurrent: true, hasWorktree: false },
      { name: "develop", isRemote: false, isCurrent: false, hasWorktree: false },
    ],
    isLoadingBranches: false,
    isGitRepo: true,
    mcpServers: [],
    skills: [],
    plugins: [],
    onCustomNameChange: vi.fn(),
    onModeChange: vi.fn(),
    onBranchChange: vi.fn(),
    onWorktreeModeChange: vi.fn(),
    onMcpToggle: vi.fn(),
    onSkillToggle: vi.fn(),
    onPluginToggle: vi.fn(),
    onMcpSelectAll: vi.fn(),
    onMcpUnselectAll: vi.fn(),
    onPluginsSelectAll: vi.fn(),
    onPluginsUnselectAll: vi.fn(),
    onLaunch: vi.fn(),
    onRemove: vi.fn(),
    onResumeSessionChange: vi.fn(),
  };

  function summary() {
    return screen.getByRole("region", { name: "Resolves to" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers no execution host, because this app has no remote launcher", () => {
    render(<PreLaunchCard {...baseProps} slot={makeSlot()} />);
    expect(screen.queryByText(/execution host/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reachable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ed25519/i)).not.toBeInTheDocument();
    expect(summary()).toHaveTextContent("this machine");
  });

  it("names the directory the launch will actually use", () => {
    render(<PreLaunchCard {...baseProps} slot={makeSlot({ worktreeMode: "project" })} />);
    expect(summary()).toHaveTextContent("/tmp/test-repo");
  });

  it("says a new worktree does not exist yet rather than inventing its path", () => {
    render(<PreLaunchCard {...baseProps} slot={makeSlot({ worktreeMode: "new" })} />);
    expect(summary()).toHaveTextContent("a new worktree, created at launch");
    expect(summary()).not.toHaveTextContent("/tmp/test-repo/");
  });

  it("prefers a recovered working directory over the project path", () => {
    render(
      <PreLaunchCard
        {...baseProps}
        slot={makeSlot({ worktreeMode: "auto", workingDirOverride: "/tmp/wt/feature" })}
      />,
    );
    expect(summary()).toHaveTextContent("/tmp/wt/feature");
  });

  it("summarises the agent, branch and integrations the slot really carries", () => {
    render(
      <PreLaunchCard
        {...baseProps}
        slot={makeSlot({
          mode: "Codex",
          branch: "develop",
          enabledMcpServers: ["one", "two"],
          enabledPlugins: ["p"],
          enabledSkills: ["s", "t", "u"],
        })}
      />,
    );
    const panel = summary();
    expect(panel).toHaveTextContent("Codex");
    expect(panel).toHaveTextContent("develop");
    expect(panel).toHaveTextContent("2 MCP servers");
    expect(panel).toHaveTextContent("1 plugin");
    expect(panel).toHaveTextContent("3 skills");
  });

  it("states image staging and retention as this backend performs them", () => {
    render(<PreLaunchCard {...baseProps} slot={makeSlot()} />);
    const panel = summary();
    expect(panel).toHaveTextContent("kept for 24 hours");
    expect(panel).toHaveTextContent("removed when the session closes");
    expect(panel).not.toHaveTextContent("turn ends");
  });
});

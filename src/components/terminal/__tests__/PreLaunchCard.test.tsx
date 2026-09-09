import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreLaunchCard, type SessionSlot } from "../PreLaunchCard";

vi.mock("@/lib/terminal", () => ({
  listClaudeSessions: vi
    .fn()
    .mockResolvedValue({ sessions: [], total_found: 0, truncated: false, unreadable: 0 }),
  deleteClaudeSession: vi.fn().mockResolvedValue(undefined),
}));

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

describe("PreLaunchCard branch creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Helper to open the branch dropdown */
  it("keeps launch available with every setting on screen", () => {
    render(<PreLaunchCard {...defaultProps} />);
    expect(screen.getByText("No MCP servers configured")).toBeVisible();
    expect(screen.getByRole("button", { name: "Launch Session" })).toBeVisible();
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
      expect(onCreateBranch).toHaveBeenCalledWith("feature/test", false, "/tmp/test-repo");
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
      expect(onCreateBranch).toHaveBeenCalledWith("feature/select", false, "/tmp/test-repo");
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

  /**
   * The value cell of ONE resolves-to row. Assert through this, not against the
   * whole region: the rows share vocabulary, so "resolved at launch" under
   * `branch` is also a substring of the working-directory row's "this project's
   * managed worktree, resolved at launch". A region-wide assertion would keep
   * passing if the branch row stopped rendering altogether.
   *
   * The label and the value are sibling divs inside the row wrapper.
   */
  function resolveRow(label: string) {
    const labelCell = within(summary()).getByText(label);
    const valueCell = labelCell.nextElementSibling;
    if (!(valueCell instanceof HTMLElement)) {
      throw new Error(`resolves-to row "${label}" has no value cell`);
    }
    return valueCell;
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

  it("names the polled current branch when the branch poll has returned one", () => {
    // `branches` is what `list_branches` gave TerminalGrid (TerminalGrid.tsx
    // :774), so `main` here is a real branch name off a real repo, and it is
    // the same one the picker button above shows with its `current` badge.
    render(<PreLaunchCard {...baseProps} slot={makeSlot()} />);
    expect(summary()).toHaveTextContent("main");
  });

  it("says the branch is not settled yet rather than printing the picker's placeholder", () => {
    // A freshly opened setup card: TerminalGrid holds `branches` at `[]`
    // (TerminalGrid.tsx:498) until the fetch resolves, and the slot carries no
    // explicit branch. "Current" is the branch picker's own label for that
    // state; printed under `branch` in a panel whose job is to state what the
    // launch will do, it reads as a branch named Current. The launch really
    // does leave it open here: it passes `slot.branch ?? null` to
    // `prepareSessionWorktree` and takes the branch back off the result
    // (TerminalGrid.tsx:1007, :1013).
    // Only `branches: []` is load-bearing: the row reads `resolvedBranch`, which
    // is derived from `branches` and the slot, and never looks at the loading
    // flag. Left at its default so the test states one condition, not two.
    render(<PreLaunchCard {...baseProps} branches={[]} slot={makeSlot({ branch: null })} />);
    const branchRow = resolveRow("branch");
    expect(branchRow).not.toHaveTextContent("Current");
    expect(branchRow).toHaveTextContent("resolved at launch");
  });

  it("does not describe a non-git folder in a multi-repo workspace as having a branch", () => {
    // A multi-repo workspace can hold folders that are not checkouts, and they
    // are selectable: the repo row's select button has no git guard, and the
    // list tags them "no git". Selecting one makes TerminalGrid set `isGitRepo`
    // false (git_branches really does reject for a non-git path) while
    // `isMultiRepo` stays true. Guarding on `isMultiRepo` alone therefore kept
    // the row talking about a branch for a folder that has none.
    // `isMultiRepo` is derived, not passed: the component computes it from
    // `workspaceType` and a non-empty `repositories`, so those are what a real
    // multi-repo workspace hands it.
    render(
      <PreLaunchCard
        {...baseProps}
        isGitRepo={false}
        workspaceType="multi-repo"
        repositories={[
          {
            name: "notes",
            path: "/tmp/notes",
            isGitRepo: false,
            currentBranch: null,
            remoteUrl: null,
          },
        ]}
        selectedRepoPath="/tmp/notes"
        branches={[]}
        slot={makeSlot({ branch: null })}
      />,
    );
    const branchRow = resolveRow("branch");
    expect(branchRow).toHaveTextContent("not a git repository");
    expect(branchRow).not.toHaveTextContent("resolved at launch");
  });

  it("states image staging and retention as this backend performs them", () => {
    render(<PreLaunchCard {...baseProps} slot={makeSlot()} />);
    const panel = summary();
    expect(panel).toHaveTextContent("kept for 24 hours");
    expect(panel).toHaveTextContent("removed when the session closes");
    expect(panel).not.toHaveTextContent("turn ends");
  });
});

/*
 * Design 1b: the pane is a project column, a settings column and a
 * full-width resolves-to strip, with nothing hidden behind a disclosure.
 */
describe("PreLaunchCard layout (design 1b)", () => {
  const repos = [
    {
      path: "/tmp/api",
      name: "api",
      isGitRepo: true,
      currentBranch: "main",
      remoteUrl: null,
    },
    {
      path: "/tmp/web",
      name: "web",
      isGitRepo: true,
      currentBranch: "release",
      remoteUrl: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("states the checkout's own branch, not the branch this session will switch to", () => {
    /* The picked branch belongs to the session, and can even be a name that
       does not exist yet. Under "Project" a reader takes the value for the
       repository's own state, so it has to be HEAD. */
    render(<PreLaunchCard {...defaultProps} slot={makeSlot({ branch: "develop" })} />);

    const project = within(screen.getByRole("region", { name: "Project" }));
    expect(project.getByText("main")).toBeVisible();
    expect(project.queryByText("develop")).not.toBeInTheDocument();
  });

  it("names the one project instead of offering a list of one", () => {
    render(<PreLaunchCard {...defaultProps} />);

    const project = within(screen.getByRole("region", { name: "Project" }));
    expect(project.getByText("test-repo")).toBeVisible();
    expect(project.getByText("/tmp/test-repo")).toBeVisible();
    // A single-project workspace has nothing to choose between, so the
    // column must not render a picker with one row in it.
    expect(project.queryAllByRole("button")).toHaveLength(0);
  });

  it("lists the workspace repositories in the project column and switches on click", () => {
    const onRepoChange = vi.fn();
    render(
      <PreLaunchCard
        {...defaultProps}
        workspaceType="multi-repo"
        repositories={repos}
        selectedRepoPath="/tmp/api"
        onRepoChange={onRepoChange}
      />,
    );

    const project = within(screen.getByRole("region", { name: "Project" }));
    const web = project.getByRole("button", { name: /web/ });
    expect(project.getByRole("button", { name: /api/ })).toHaveAttribute("aria-pressed", "true");
    expect(web).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(web);
    expect(onRepoChange).toHaveBeenCalledWith("/tmp/web");
  });

  it("shows the integrations without an advanced disclosure", () => {
    render(<PreLaunchCard {...defaultProps} />);

    expect(screen.queryByRole("button", { name: /Advanced settings/ })).not.toBeInTheDocument();
    expect(screen.getByText("MCP Servers")).toBeVisible();
    expect(screen.getByText("Plugins & Skills")).toBeVisible();
  });

  it("puts the resolves-to summary outside the settings column, after it", () => {
    render(<PreLaunchCard {...defaultProps} />);

    const settings = screen.getByRole("region", { name: "Session settings" });
    const resolves = screen.getByRole("region", { name: "Resolves to" });

    expect(settings.contains(resolves)).toBe(false);
    expect(
      settings.compareDocumentPosition(resolves) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(resolves).getByText(/There is no remote launcher/)).toBeVisible();
  });
});

/*
 * The project column owns which repository a session lands in, so the branch
 * control below it picks a branch and nothing else.
 */
describe("PreLaunchCard branch picker (design 1b)", () => {
  const repos = [
    { path: "/tmp/api", name: "api", isGitRepo: true, currentBranch: "main", remoteUrl: null },
    { path: "/tmp/web", name: "web", isGitRepo: true, currentBranch: "release", remoteUrl: null },
  ];
  const multiProps = {
    ...defaultProps,
    workspaceType: "multi-repo" as const,
    repositories: repos,
    selectedRepoPath: "/tmp/api",
    onRepoChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function openPicker() {
    fireEvent.click(screen.getByLabelText("Git Branch"));
  }

  it("calls the control Git Branch whatever shape the workspace is", () => {
    render(<PreLaunchCard {...multiProps} />);

    expect(screen.getByText("Git Branch")).toBeVisible();
    expect(screen.queryByText("Repository & Branch")).not.toBeInTheDocument();
  });

  it("offers no way to change repository from the branch picker", () => {
    render(<PreLaunchCard {...multiProps} />);
    openPicker();

    const settings = within(screen.getByRole("region", { name: "Session settings" }));
    expect(settings.queryByText("web")).not.toBeInTheDocument();
    expect(settings.getByText("develop")).toBeVisible();
  });

  it("still offers branch creation in a multi-repo workspace", () => {
    render(<PreLaunchCard {...multiProps} onCreateBranch={vi.fn()} />);
    openPicker();

    expect(screen.getByText("Create New Branch")).toBeVisible();
  });

  it("asks the selected repository whether it is a checkout, not the lagging poll", () => {
    /* The poll's flag is initialised true and answers a round behind the
       selection, so on switching to a non-git folder it still says "git" for
       one window. Both the picker and the resolves-to row must ignore it. */
    render(
      <PreLaunchCard
        {...multiProps}
        isGitRepo={true}
        repositories={[
          {
            path: "/tmp/notes",
            name: "notes",
            isGitRepo: false,
            currentBranch: null,
            remoteUrl: null,
          },
        ]}
        selectedRepoPath="/tmp/notes"
      />,
    );

    expect(screen.getByText("Not a Git repository")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Resolves to" })).getByText("not a git repository"),
    ).toBeVisible();
  });

  it("creates a branch in the repository the project column has selected", async () => {
    const onCreateBranch = vi.fn().mockResolvedValue(undefined);
    render(<PreLaunchCard {...multiProps} onCreateBranch={onCreateBranch} />);
    openPicker();

    fireEvent.click(screen.getByText("Create New Branch"));
    fireEvent.change(screen.getByPlaceholderText("feature/my-branch"), {
      target: { value: "feat/x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreateBranch).toHaveBeenCalledWith("feat/x", false, "/tmp/api"));
  });
});

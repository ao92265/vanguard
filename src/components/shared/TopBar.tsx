import {
  Bird,
  Columns,
  Factory,
  Gauge,
  Inbox,
  LayoutGrid,
  List,
  Network,
  Package,
  Plus,
  RadioTower,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { WorkbenchRail } from "./WorkbenchRail";

/** One entry of the eagle-view "add terminal" project dropdown. */
export interface EagleProjectOption {
  tabId: string;
  name: string;
  color: string;
  /** Project already has the maximum number of session slots. */
  atMax: boolean;
}

interface TopBarProps {
  projectNavigation?: ReactNode;
  ledgerViewOpen?: boolean;
  onOpenLedger?: () => void;
  canAddSession?: boolean;
  workflowsViewOpen?: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onAddSession?: () => void;
  /** Whether eagle view (all projects' terminals at once) is active */
  eagleView?: boolean;
  onToggleEagleView?: () => void;
  /** Landscape view: every project, terminal and subagent on one canvas */
  landscapeView?: boolean;
  onToggleLandscapeView?: () => void;
  /** A terminal somewhere is waiting for input — marks the landscape button. */
  landscapeAttention?: boolean;
  /** Board layer: every piece of live work, in the stage it is in */
  boardViewOpen?: boolean;
  /** Board/Grid segmented toggle. A two-position selector, not a toggle
   *  button: clicking the segment you are already on is a no-op by design,
   *  the way a radio group behaves. */
  onSetBoardView?: (open: boolean) => void;
  /** Home decision queue: blocked on you / landed / running */
  homeViewOpen?: boolean;
  onToggleHomeView?: () => void;
  /** A terminal somewhere is waiting for input — marks the Home button. */
  homeAttention?: boolean;
  /** Factory: the ACT lane (spec in, run stages, PR out) */
  factoryViewOpen?: boolean;
  onToggleFactoryView?: () => void;
  /** Orchestrator: goal box, session scope, safe-mode proposal queue */
  orchestratorViewOpen?: boolean;
  onToggleOrchestratorView?: () => void;
  /** Pulse: today's timeline, flow score and metrics */
  pulseViewOpen?: boolean;
  onTogglePulseView?: () => void;
  /** More menu → Extensions: opens the sidebar on its Infra tab (MCP
   *  servers, plugins, skills) — that tab no longer has its own strip
   *  button, but its content still renders when selected. */
  onOpenExtensions?: () => void;
  /** More menu → Workflows: opens the full-screen workflow editor overlay.
   *  Its only trigger used to live inside the (now cut) Launch panel, but
   *  the overlay itself is a standalone store-driven view — reachable here
   *  with no change to the editor. */
  onOpenWorkflows?: () => void;
}

export function TopBar({
  projectNavigation,
  ledgerViewOpen = false,
  onOpenLedger,
  canAddSession = true,
  workflowsViewOpen = false,
  sidebarOpen,
  onToggleSidebar,
  onAddSession,
  eagleView = false,
  onToggleEagleView,
  landscapeView = false,
  onToggleLandscapeView,
  landscapeAttention = false,
  boardViewOpen = false,
  onSetBoardView,
  homeViewOpen = false,
  onToggleHomeView,
  homeAttention = false,
  factoryViewOpen = false,
  onToggleFactoryView,
  orchestratorViewOpen = false,
  onToggleOrchestratorView,
  pulseViewOpen = false,
  onTogglePulseView,
  onOpenExtensions,
  onOpenWorkflows,
}: TopBarProps) {
  const covered =
    homeViewOpen ||
    factoryViewOpen ||
    orchestratorViewOpen ||
    pulseViewOpen ||
    landscapeView ||
    workflowsViewOpen;
  return (
    <WorkbenchRail
      projectNavigation={projectNavigation}
      sidebarOpen={sidebarOpen}
      onToggleSidebar={onToggleSidebar}
      primary={[
        {
          label: "Inbox",
          icon: Inbox,
          selected: homeViewOpen,
          attention: homeAttention,
          onClick: onToggleHomeView,
        },
        {
          label: "Board",
          icon: Columns,
          selected: boardViewOpen && !ledgerViewOpen && !covered,
          onClick: onSetBoardView ? () => onSetBoardView(true) : undefined,
        },
        {
          label: "Orchestrator",
          icon: RadioTower,
          selected: orchestratorViewOpen,
          onClick: onToggleOrchestratorView,
        },
        { label: "Pulse", icon: Gauge, selected: pulseViewOpen, onClick: onTogglePulseView },
        {
          label: "Factory",
          icon: Factory,
          selected: factoryViewOpen,
          onClick: onToggleFactoryView,
        },
        {
          label: "Ledger",
          icon: List,
          selected: boardViewOpen && ledgerViewOpen && !covered,
          onClick: onOpenLedger,
        },
        { label: "New session", icon: Plus, disabled: !canAddSession, onClick: onAddSession },
        {
          label: "Terminals",
          icon: LayoutGrid,
          selected: !boardViewOpen && !covered,
          onClick: onSetBoardView ? () => onSetBoardView(false) : undefined,
        },
      ]}
      tools={[
        { label: "Fleet", icon: Bird, pressed: eagleView, onClick: onToggleEagleView },
        {
          label: "Map",
          icon: Network,
          selected: landscapeView,
          attention: landscapeAttention,
          onClick: onToggleLandscapeView,
        },
        {
          label: "Workflows",
          icon: Workflow,
          selected: workflowsViewOpen,
          onClick: onOpenWorkflows,
        },
        { label: "Extensions", icon: Package, onClick: onOpenExtensions },
      ]}
    />
  );
}

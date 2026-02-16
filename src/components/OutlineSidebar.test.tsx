import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { OutlineSidebar } from "./OutlineSidebar";
import { dispatchNavigateToLineFromOutline } from "@/lib/outline";
import { useStore, type OutlineNode } from "@/store/useStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/lib/outline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/outline")>("@/lib/outline");
  return {
    ...actual,
    dispatchNavigateToLineFromOutline: vi.fn(),
  };
});

const invokeMock = vi.mocked(invoke);
const dispatchNavigateMock = vi.mocked(dispatchNavigateToLineFromOutline);

function createOutlineNodes(): OutlineNode[] {
  return [
    {
      label: "Root",
      nodeType: "object",
      line: 1,
      column: 1,
      children: [
        {
          label: "Child",
          nodeType: "key",
          line: 2,
          column: 3,
          children: [],
        },
      ],
    },
    {
      label: "Leaf",
      nodeType: "function",
      line: 8,
      column: 2,
      children: [],
    },
  ];
}

describe("OutlineSidebar", () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({ language: "en-US" });
    useStore.setState({
      outlineOpen: true,
      activeTabId: "tab-outline",
      outlineWidth: 280,
    });
    invokeMock.mockResolvedValue([]);
  });

  it("renders null when outline sidebar is closed", () => {
    useStore.setState({ outlineOpen: false });

    const view = render(
      <OutlineSidebar nodes={createOutlineNodes()} activeType="json" parseError={null} />
    );

    expect(view.container.firstChild).toBeNull();
  });

  it("renders parse error and disables tree action buttons", () => {
    render(
      <OutlineSidebar
        nodes={createOutlineNodes()}
        activeType="json"
        parseError="Outline parse failed"
      />
    );

    expect(screen.getByText("Outline parse failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand All" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Collapse All" })).toBeDisabled();
  });

  it("filters nodes by keyword and supports clear search", async () => {
    const nodes = createOutlineNodes();
    invokeMock.mockResolvedValue([nodes[1]]);

    render(<OutlineSidebar nodes={nodes} activeType="json" parseError={null} />);

    const searchInput = screen.getByPlaceholderText("Search outline...");
    fireEvent.change(searchInput, { target: { value: "leaf" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("filter_outline_nodes", {
        nodes,
        keyword: "leaf",
      });
    });

    expect(screen.getByText("Leaf")).toBeInTheDocument();
    expect(screen.queryByText("Root")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    await waitFor(() => {
      expect(screen.getByText("Root")).toBeInTheDocument();
    });
  });

  it("supports collapse and expand all, and navigates on node click", async () => {
    render(<OutlineSidebar nodes={createOutlineNodes()} activeType="json" parseError={null} />);

    expect(screen.getByText("Child")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse All" }));
    await waitFor(() => {
      expect(screen.queryByText("Child")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Expand All" }));
    await waitFor(() => {
      expect(screen.getByText("Child")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Leaf"));

    expect(dispatchNavigateMock).toHaveBeenCalledWith("tab-outline", 8, 2);
  });
});

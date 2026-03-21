import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ChevronUp, WholeWord, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/i18n";
import {
  QUICK_FIND_OPEN_EVENT,
  type QuickFindOpenEventDetail,
} from "@/lib/quickFind";
import { cn } from "@/lib/utils";
import { type FileTab, useStore } from "@/store/useStore";
import type {
  SearchCursorStepBackendResult,
  SearchMode,
} from "./search-panel/types";
import {
  dispatchNavigateToLine,
  dispatchSearchClose,
} from "./search-panel/utils";

const QUICK_FIND_OCCLUDED_RIGHT_PX = 332;
const QUICK_FIND_INPUT_DEBOUNCE_MS = 120;
const QUICK_FIND_REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;

export function QuickFindOverlay({ tab }: { tab: FileTab | null }) {
  const language = useStore((state) => state.settings.language);
  const cursorPositionByTab = useStore((state) => state.cursorPositionByTab);
  const [isOpen, setIsOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regexMode, setRegexMode] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cursorAnchorRef = useRef<{ line: number; column: number } | null>(null);
  const cursorPositionByTabRef = useRef(cursorPositionByTab);
  const requestSerialRef = useRef(0);
  const openTabIdRef = useRef<string | null>(null);
  const translate = useCallback(
    (key: Parameters<typeof t>[1]) => t(language, key),
    [language],
  );
  const restoreInputFocus = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    window.requestAnimationFrame(() => {
      const currentInput = inputRef.current;
      if (!currentInput) {
        return;
      }
      if (document.activeElement === currentInput) {
        return;
      }

      try {
        currentInput.focus({ preventScroll: true });
      } catch {
        currentInput.focus();
      }
    });
  }, []);

  useEffect(() => {
    cursorPositionByTabRef.current = cursorPositionByTab;
  }, [cursorPositionByTab]);

  const buildSearchRequest = useCallback(
    (rawKeyword: string): { keyword: string; mode: SearchMode } => {
      if (!rawKeyword) {
        return {
          keyword: "",
          mode: "literal",
        };
      }

      if (regexMode) {
        return {
          keyword: wholeWord ? `\\b(?:${rawKeyword})\\b` : rawKeyword,
          mode: "regex",
        };
      }

      if (wholeWord) {
        const escapedLiteral = rawKeyword.replace(
          QUICK_FIND_REGEX_ESCAPE_PATTERN,
          "\\$&",
        );
        return {
          keyword: `\\b${escapedLiteral}\\b`,
          mode: "regex",
        };
      }

      return {
        keyword: rawKeyword,
        mode: "literal",
      };
    },
    [regexMode, wholeWord],
  );

  const closeQuickFind = useCallback((options?: { clearKeyword?: boolean }) => {
    requestSerialRef.current += 1;
    setIsOpen(false);
    setIsSearching(false);
    setFeedbackMessage(null);
    cursorAnchorRef.current = null;

    if (options?.clearKeyword) {
      setKeyword("");
    }

    const closingTabId = openTabIdRef.current;
    if (closingTabId) {
      dispatchSearchClose(closingTabId);
    }
    openTabIdRef.current = null;
  }, []);

  const navigateByStep = useCallback(
    async (step: 1 | -1, options?: { resetAnchor?: boolean }) => {
      if (!tab) {
        return;
      }

      const searchRequest = buildSearchRequest(keyword);
      if (!searchRequest.keyword) {
        setFeedbackMessage(null);
        setIsSearching(false);
        dispatchSearchClose(tab.id);
        return;
      }

      if (options?.resetAnchor || !cursorAnchorRef.current) {
        const cursor = cursorPositionByTabRef.current[tab.id];
        cursorAnchorRef.current = {
          line: Math.max(1, Math.floor(cursor?.line ?? 1)),
          column: Math.max(1, Math.floor(cursor?.column ?? 1)),
        };
      }

      const cursorAnchor = cursorAnchorRef.current ?? { line: 1, column: 1 };
      requestSerialRef.current += 1;
      const requestSerial = requestSerialRef.current;
      setIsSearching(true);

      try {
        const stepResult = await invoke<SearchCursorStepBackendResult>(
          "search_step_from_cursor_in_document",
          {
            id: tab.id,
            keyword: searchRequest.keyword,
            mode: searchRequest.mode,
            caseSensitive,
            cursorLine: cursorAnchor.line,
            cursorColumn: cursorAnchor.column,
            step,
          },
        );

        if (requestSerialRef.current !== requestSerial) {
          return;
        }

        const targetMatch = stepResult.targetMatch;
        if (!targetMatch) {
          setFeedbackMessage(translate("quickFind.noMatches"));
          dispatchSearchClose(tab.id);
          return;
        }

        const matchLength = Math.max(
          0,
          targetMatch.endChar - targetMatch.startChar,
        );
        cursorAnchorRef.current = {
          line: Math.max(1, Math.floor(targetMatch.line)),
          column: Math.max(1, Math.floor(targetMatch.column)),
        };
        setFeedbackMessage(null);
        dispatchNavigateToLine(
          tab.id,
          targetMatch.line,
          targetMatch.column,
          matchLength,
          targetMatch.lineText,
          QUICK_FIND_OCCLUDED_RIGHT_PX,
          "quick-find",
        );
        restoreInputFocus();
      } catch (error) {
        if (requestSerialRef.current !== requestSerial) {
          return;
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        setFeedbackMessage(
          `${translate("quickFind.failedPrefix")} ${errorMessage}`,
        );
      } finally {
        if (requestSerialRef.current === requestSerial) {
          setIsSearching(false);
        }
      }
    },
    [
      buildSearchRequest,
      caseSensitive,
      keyword,
      restoreInputFocus,
      tab,
      translate,
    ],
  );

  useEffect(() => {
    const handleQuickFindOpen = (event: Event) => {
      if (!tab) {
        return;
      }

      const customEvent = event as CustomEvent<QuickFindOpenEventDetail>;
      const targetTabId = customEvent.detail?.tabId;
      if (targetTabId && targetTabId !== tab.id) {
        return;
      }

      openTabIdRef.current = tab.id;
      requestSerialRef.current += 1;
      cursorAnchorRef.current = null;
      setFeedbackMessage(null);
      setIsSearching(false);
      setCaseSensitive(false);
      setWholeWord(false);
      setRegexMode(false);
      setIsOpen(true);
    };

    window.addEventListener(
      QUICK_FIND_OPEN_EVENT,
      handleQuickFindOpen as EventListener,
    );
    return () => {
      window.removeEventListener(
        QUICK_FIND_OPEN_EVENT,
        handleQuickFindOpen as EventListener,
      );
    };
  }, [tab]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!tab || (openTabIdRef.current && openTabIdRef.current !== tab.id)) {
      closeQuickFind();
    }
  }, [closeQuickFind, isOpen, tab]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !tab) {
      return;
    }

    requestSerialRef.current += 1;
    cursorAnchorRef.current = null;

    if (!keyword) {
      setFeedbackMessage(null);
      setIsSearching(false);
      dispatchSearchClose(tab.id);
      return;
    }

    const timer = window.setTimeout(() => {
      void navigateByStep(1, { resetAnchor: true });
    }, QUICK_FIND_INPUT_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, keyword, navigateByStep, tab]);

  if (!isOpen || !tab) {
    return null;
  }

  return (
    <div
      className="absolute right-2 top-2 z-[80] flex w-[448px] max-w-[calc(100%-16px)] flex-col gap-1 rounded-md border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm"
      data-testid="quick-find-overlay"
    >
      <div className="flex items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            className="h-8 w-full rounded-md border border-input bg-background px-2 pr-[102px] text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={translate("quickFind.placeholder")}
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void navigateByStep(event.shiftKey ? -1 : 1);
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                closeQuickFind({ clearKeyword: false });
              }
            }}
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
            <button
              type="button"
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-sm border text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                caseSensitive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title={translate("quickFind.caseSensitive")}
              aria-label={translate("quickFind.caseSensitive")}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                setCaseSensitive((value) => !value);
              }}
            >
              Aa
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                wholeWord
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title={translate("quickFind.wholeWord")}
              aria-label={translate("quickFind.wholeWord")}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                setWholeWord((value) => !value);
              }}
            >
              <WholeWord className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-sm border text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                regexMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title={translate("quickFind.regex")}
              aria-label={translate("quickFind.regex")}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                setRegexMode((value) => !value);
              }}
            >
              .*
            </button>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          title={translate("quickFind.previous")}
          aria-label={translate("quickFind.previous")}
          disabled={!keyword}
          onClick={() => {
            void navigateByStep(-1);
          }}
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
          title={translate("quickFind.next")}
          aria-label={translate("quickFind.next")}
          disabled={!keyword}
          onClick={() => {
            void navigateByStep(1);
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title={translate("quickFind.close")}
          aria-label={translate("quickFind.close")}
          onClick={() => {
            closeQuickFind({ clearKeyword: false });
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {(isSearching || feedbackMessage) && (
        <p className="px-0.5 text-[11px] text-muted-foreground">
          {isSearching ? translate("quickFind.searching") : feedbackMessage}
        </p>
      )}
    </div>
  );
}

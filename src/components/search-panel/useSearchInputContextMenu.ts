import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type {
  SearchSidebarInputContextAction,
  SearchSidebarInputContextMenuState,
  SearchSidebarTextInputElement,
} from './types';
import {
  getTextInputSelectionRange,
  hasTextInputSelection,
  isTextInputEditable,
  replaceSelectedInputText,
  resolveSearchSidebarTextInputTarget,
  writePlainTextToClipboard,
} from './utils';

interface UseSearchInputContextMenuOptions {
  isOpen: boolean;
}

export function useSearchInputContextMenu({ isOpen }: UseSearchInputContextMenuOptions) {
  const [inputContextMenu, setInputContextMenu] = useState<SearchSidebarInputContextMenuState | null>(null);
  const inputContextMenuTargetRef = useRef<SearchSidebarTextInputElement | null>(null);
  const inputContextMenuRef = useRef<HTMLDivElement>(null);

  const closeInputContextMenu = useCallback(() => {
    setInputContextMenu(null);
    inputContextMenuTargetRef.current = null;
  }, []);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    closeInputContextMenu();
  }, [closeInputContextMenu, isOpen]);

  useEffect(() => {
    if (!inputContextMenu) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        closeInputContextMenu();
        return;
      }

      if (inputContextMenuRef.current?.contains(target)) {
        return;
      }

      closeInputContextMenu();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeInputContextMenu();
      }
    };

    const closeOnWindowBlur = () => {
      closeInputContextMenu();
    };

    window.addEventListener('pointerdown', closeOnOutsidePointer, true);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('blur', closeOnWindowBlur);
    window.addEventListener('resize', closeOnWindowBlur);

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('blur', closeOnWindowBlur);
      window.removeEventListener('resize', closeOnWindowBlur);
    };
  }, [closeInputContextMenu, inputContextMenu]);

  const handleInputContextMenuAction = useCallback(
    async (action: SearchSidebarInputContextAction) => {
      const inputTarget = inputContextMenuTargetRef.current;
      closeInputContextMenu();

      if (!inputTarget) {
        return;
      }

      const { start, end } = getTextInputSelectionRange(inputTarget);
      const hasSelection = end > start;
      const selectedText = hasSelection ? inputTarget.value.slice(start, end) : '';
      const canEdit = isTextInputEditable(inputTarget);

      try {
        if (action === 'copy') {
          if (!hasSelection) {
            return;
          }

          await writePlainTextToClipboard(selectedText);
          return;
        }

        if (action === 'cut') {
          if (!canEdit || !hasSelection) {
            return;
          }

          await writePlainTextToClipboard(selectedText);
          replaceSelectedInputText(inputTarget, '', 'start');
          return;
        }

        if (action === 'paste') {
          if (!canEdit) {
            return;
          }

          let clipboardText = '';
          if (navigator.clipboard?.readText) {
            clipboardText = await navigator.clipboard.readText();
          } else {
            inputTarget.focus();
            if (document.execCommand('paste')) {
              return;
            }
          }

          replaceSelectedInputText(inputTarget, clipboardText, 'end');
          return;
        }

        if (!canEdit || !hasSelection) {
          return;
        }

        replaceSelectedInputText(inputTarget, '', 'start');
      } catch (error) {
        console.error('Search sidebar input context action failed:', error);
      }
    },
    [closeInputContextMenu]
  );

  const handleSearchSidebarContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const textInputTarget = resolveSearchSidebarTextInputTarget(event.target);
      if (!textInputTarget) {
        event.preventDefault();
        closeInputContextMenu();
        return;
      }

      event.preventDefault();
      textInputTarget.focus();
      inputContextMenuTargetRef.current = textInputTarget;
      setInputContextMenu({
        x: event.clientX,
        y: event.clientY,
        hasSelection: hasTextInputSelection(textInputTarget),
        canEdit: isTextInputEditable(textInputTarget),
      });
    },
    [closeInputContextMenu]
  );

  return {
    handleInputContextMenuAction,
    handleSearchSidebarContextMenu,
    inputContextMenu,
    inputContextMenuRef,
  };
}

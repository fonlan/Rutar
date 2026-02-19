import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GO_TO_LINE_DIALOG_REQUEST_EVENT,
  type GoToLineDialogRequest,
} from '@/lib/goToLineDialog';
import { useStore } from '@/store/useStore';
import { GoToLineModal } from './GoToLineModal';

describe('GoToLineModal', () => {
  let initialState: ReturnType<typeof useStore.getState>;

  beforeAll(() => {
    initialState = useStore.getState();
  });

  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.getState().updateSettings({
      language: 'en-US',
    });
  });

  function openDialog(detail: GoToLineDialogRequest) {
    act(() => {
      window.dispatchEvent(
        new CustomEvent<GoToLineDialogRequest>(GO_TO_LINE_DIALOG_REQUEST_EVENT, {
          detail,
        })
      );
    });
  }

  it('opens with unified dialog style and default line value', async () => {
    render(<GoToLineModal />);

    openDialog({
      tabId: 'tab-goto-modal-open',
      maxLineNumber: 120,
      initialLineNumber: 7,
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Go to Line')).toBeInTheDocument();
      expect(screen.getByLabelText('Line Number')).toHaveValue('7');
    });
  });

  it('dispatches navigate-to-line and clamps line number on confirm', async () => {
    render(<GoToLineModal />);

    const navigateEvents: Array<{ tabId: string; line: number; column: number }> = [];
    const navigateListener = (event: Event) => {
      navigateEvents.push((event as CustomEvent).detail as { tabId: string; line: number; column: number });
    };
    window.addEventListener('rutar:navigate-to-line', navigateListener as EventListener);

    try {
      openDialog({
        tabId: 'tab-goto-modal-clamp',
        maxLineNumber: 30,
        initialLineNumber: 1,
      });

      const input = await screen.findByLabelText('Line Number');
      fireEvent.change(input, {
        target: { value: '999' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Go' }));

      await waitFor(() => {
        expect(navigateEvents).toEqual([
          {
            tabId: 'tab-goto-modal-clamp',
            line: 30,
            column: 1,
            source: 'shortcut',
          },
        ]);
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      window.removeEventListener('rutar:navigate-to-line', navigateListener as EventListener);
    }
  });

  it('submits by Enter in input and navigates to target line', async () => {
    render(<GoToLineModal />);

    const navigateEvents: Array<{ tabId: string; line: number; column: number }> = [];
    const navigateListener = (event: Event) => {
      navigateEvents.push((event as CustomEvent).detail as { tabId: string; line: number; column: number });
    };
    window.addEventListener('rutar:navigate-to-line', navigateListener as EventListener);

    try {
      openDialog({
        tabId: 'tab-goto-modal-enter',
        maxLineNumber: 88,
        initialLineNumber: 3,
      });

      const input = await screen.findByLabelText('Line Number');
      fireEvent.change(input, {
        target: { value: '42' },
      });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(navigateEvents).toEqual([
          {
            tabId: 'tab-goto-modal-enter',
            line: 42,
            column: 1,
            source: 'shortcut',
          },
        ]);
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    } finally {
      window.removeEventListener('rutar:navigate-to-line', navigateListener as EventListener);
    }
  });

  it('disables confirm button for invalid input and supports Escape to close', async () => {
    render(<GoToLineModal />);

    openDialog({
      tabId: 'tab-goto-modal-invalid',
      maxLineNumber: 20,
      initialLineNumber: 2,
    });

    const input = await screen.findByLabelText('Line Number');
    fireEvent.change(input, {
      target: { value: 'abc' },
    });

    const confirmButton = screen.getByRole('button', { name: 'Go' });
    expect(confirmButton).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});

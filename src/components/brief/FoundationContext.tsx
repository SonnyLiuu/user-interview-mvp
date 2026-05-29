'use client';

import { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';
import type { Foundation } from '@/lib/backend-types';
import { backendClientFetch } from '@/lib/backend-client';

// ── Reducer ───────────────────────────────────────────────────────────────────

type EditorState = {
  working: Foundation;
  history: Foundation[];
  cursor: number;
};

type EditorAction =
  | { type: 'change'; next: Foundation }
  | { type: 'commit' }
  | { type: 'commitNow'; next: Foundation }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'applyPatch'; patch: Partial<Foundation> };

function normalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCompare);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalizeForCompare(nested)]),
    );
  }

  return value;
}

function serializeFoundation(foundation: Foundation): string {
  return JSON.stringify(normalizeForCompare(foundation));
}

function foundationsEqual(a: Foundation, b: Foundation): boolean {
  return serializeFoundation(a) === serializeFoundation(b);
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'change':
      if (foundationsEqual(state.working, action.next)) return state;
      return { ...state, working: action.next };

    case 'commit': {
      const base = state.history[state.cursor];
      if (foundationsEqual(base, state.working)) return state;
      const next = [...state.history.slice(0, state.cursor + 1), { ...state.working }];
      return { ...state, history: next, cursor: next.length - 1 };
    }

    case 'commitNow': {
      if (foundationsEqual(state.working, action.next)) return state;
      const next = [...state.history.slice(0, state.cursor + 1), { ...action.next }];
      return { working: action.next, history: next, cursor: next.length - 1 };
    }

    case 'undo': {
      if (state.cursor === 0) return state;
      const prev = state.cursor - 1;
      return { ...state, working: state.history[prev], cursor: prev };
    }

    case 'redo': {
      if (state.cursor >= state.history.length - 1) return state;
      const next = state.cursor + 1;
      return { ...state, working: state.history[next], cursor: next };
    }

    case 'applyPatch': {
      const next = { ...state.working, ...action.patch };
      if (foundationsEqual(state.working, next)) return state;
      const history = [...state.history.slice(0, state.cursor + 1), next];
      return { working: next, history, cursor: history.length - 1 };
    }
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type FoundationContextValue = {
  foundation: Foundation;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  handleChange: (next: Foundation) => void;
  handleBlur: () => void;
  commitNow: (next: Foundation) => void;
  applyPatch: (patch: Partial<Foundation>) => void;
  undo: () => void;
  redo: () => void;
};

const FoundationContext = createContext<FoundationContextValue | null>(null);

export function useFoundation() {
  return useContext(FoundationContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function FoundationProvider({
  projectId,
  initialFoundation,
  children,
}: {
  projectId: string;
  initialFoundation: Foundation;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(editorReducer, {
    working: initialFoundation,
    history: [initialFoundation],
    cursor: 0,
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstRender = useRef(true);
  const lastSavedSnapshot = useRef(serializeFoundation(initialFoundation));

  const scheduleAutoSave = useCallback(
    (data: Foundation, snapshot: string) => {
      clearTimeout(saveTimer.current);
      if (snapshot === lastSavedSnapshot.current) return;

      saveTimer.current = setTimeout(async () => {
        if (snapshot === lastSavedSnapshot.current) return;
        setSaveStatus('saving');
        try {
          const res = await backendClientFetch(`/v1/projects/${projectId}/foundation`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error();
          lastSavedSnapshot.current = snapshot;
          setSaveStatus('saved');
          clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
        } catch {
          setSaveStatus('error');
        }
      }, 800);
    },
    [projectId],
  );

  // Auto-save on any working state change (edits, undo, redo, AI patches)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    scheduleAutoSave(state.working, serializeFoundation(state.working));
  }, [state.working, scheduleAutoSave]);

  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      clearTimeout(savedTimer.current);
    };
  }, []);

  // Keyboard shortcuts
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  const value: FoundationContextValue = {
    foundation: state.working,
    saveStatus,
    canUndo: state.cursor > 0,
    canRedo: state.cursor < state.history.length - 1,
    handleChange: useCallback((next: Foundation) => dispatch({ type: 'change', next }), []),
    handleBlur: useCallback(() => dispatch({ type: 'commit' }), []),
    commitNow: useCallback((next: Foundation) => dispatch({ type: 'commitNow', next }), []),
    applyPatch: useCallback((patch: Partial<Foundation>) => dispatch({ type: 'applyPatch', patch }), []),
    undo,
    redo,
  };

  return <FoundationContext.Provider value={value}>{children}</FoundationContext.Provider>;
}

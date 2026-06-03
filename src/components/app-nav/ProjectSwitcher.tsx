'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectNavItem } from '@/lib/backend-types';
import { backendClientFetch } from '@/lib/backend-client';
import { getProjectPathSegment } from '@/lib/projects';
import styles from './AppNav.module.css';

function IconChevron({ down }: { down: boolean }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={styles.projectSwitcherIcon}>
      <path
        d={down ? 'M2 4.5l5 5 5-5' : 'M2 9.5l5-5 5 5'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 2.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 5v8.25A1.75 1.75 0 0 0 7.75 15h2.5A1.75 1.75 0 0 0 12 13.25V5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.5v4.5M10 7.5v4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 12.75V15h2.25L13.5 6.75 11.25 4.5 3 12.75Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10.5 5.25 12.75 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.75 15h5.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ProjectSwitcher({ slug, projectId, projectName, expanded, initialProjects }: {
  slug: string | null;
  projectId: string | null;
  projectName: string | null;
  expanded: boolean;
  initialProjects: ProjectNavItem[];
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState(initialProjects);
  const [editTarget, setEditTarget] = useState<ProjectNavItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectNavItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function loadProjects() {
    try {
      const response = await backendClientFetch('/v1/projects');
      const data = await response.json() as ProjectNavItem[];
      setProjects(data);
    } catch {
      // Keep the server-provided list if a client refresh fails.
    }
  }

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    if (initialProjects.length > 0) return;
    void loadProjects();
  }, [initialProjects]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!deleteTarget && !editTarget) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deleting && !savingEdit) {
        cancelEdit();
        cancelDelete();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, editTarget, deleting, savingEdit]);

  function select(p: ProjectNavItem) {
    setOpen(false);
    router.push(`/dashboard/${getProjectPathSegment(p)}/foundation`);
  }

  function startDelete(project: ProjectNavItem) {
    setOpen(false);
    setDeleteTarget(project);
    setDeleteConfirm('');
    setDeleteError('');
  }

  function cancelDelete() {
    setDeleteTarget(null);
    setDeleteConfirm('');
    setDeleteError('');
  }

  function startEdit() {
    if (!resolvedCurrentProject) return;
    setOpen(false);
    setEditTarget(resolvedCurrentProject);
    setEditName(resolvedCurrentProject.name);
    setEditError('');
  }

  function cancelEdit() {
    setEditTarget(null);
    setEditName('');
    setEditError('');
  }

  async function confirmEdit() {
    if (!editTarget) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError('Project name cannot be empty.');
      return;
    }

    const normalizedName = trimmedName.toLocaleLowerCase();
    const duplicate = projects.some((project) =>
      project.id !== editTarget.id && project.name.trim().toLocaleLowerCase() === normalizedName,
    );
    if (duplicate) {
      setEditError('You already have a project with this name.');
      return;
    }

    setSavingEdit(true);
    setEditError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setEditError(body?.error ?? 'Could not rename project. Please try again.');
        return;
      }

      const updated = await res.json() as ProjectNavItem;
      setProjects((current) =>
        current.map((project) => (project.id === updated.id ? { ...project, name: updated.name, slug: updated.slug } : project)),
      );
      cancelEdit();
      router.refresh();
    } catch {
      setEditError('Could not rename project. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const normalizedConfirm = deleteConfirm.trim().toLocaleLowerCase();
    const normalizedName = deleteTarget.name.trim().toLocaleLowerCase();

    if (normalizedConfirm !== normalizedName) {
      setDeleteError('Project name does not match.');
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      const res = await backendClientFetch(`/v1/projects/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setDeleteError('Could not delete project. Please try again.');
        setDeleting(false);
        return;
      }

      const deletingCurrent = getProjectPathSegment(deleteTarget) === slug;
      cancelDelete();
      await loadProjects();
      setOpen(false);

      if (deletingCurrent) {
        router.push('/dashboard');
      } else {
        router.refresh();
      }
    } catch {
      setDeleteError('Could not delete project. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const currentProjectFromList = projectId
    ? projects.find((project) => project.id === projectId) ?? null
    : null;
  const startupProjects = projects.filter((project) => project.project_type === 'startup');
  const resolvedCurrentProject = projectId
    ? currentProjectFromList ?? {
        id: projectId,
        name: projectName ?? 'Untitled project',
        slug,
        project_type: 'startup' as const,
      }
    : null;
  const displayName = resolvedCurrentProject?.name ?? projectName ?? 'Select project';
  const canDelete = !!deleteTarget && deleteConfirm.trim().toLocaleLowerCase() === deleteTarget.name.trim().toLocaleLowerCase();
  const canSaveEdit = !!editTarget && !!editName.trim() && editName.trim() !== editTarget.name;

  return (
    <>
      <div className={styles.projectSwitcher} ref={ref}>
        <div className={styles.projectSwitcherHeader}>
          {expanded && resolvedCurrentProject && (
            <button
              type="button"
              className={styles.projectEditButton}
              onClick={startEdit}
              aria-label={`Rename ${displayName}`}
              title={`Rename ${displayName}`}
            >
              <IconPencil />
            </button>
          )}
          <button
            type="button"
            className={styles.projectSwitcherBtn}
            onClick={() => setOpen((v) => !v)}
            title={displayName}
          >
            {expanded ? (
              <>
                <span className={styles.projectSwitcherName}>{displayName}</span>
                <IconChevron down={open} />
              </>
            ) : (
              <span className={styles.logoMark} style={{ margin: '0 auto' }}>SF</span>
            )}
          </button>
        </div>

        {open && expanded && (
          <div className={styles.projectDropdown}>
            {startupProjects.map((p: ProjectNavItem) => (
              <div
                key={p.id}
                className={`${styles.projectDropdownRow} ${getProjectPathSegment(p) === slug ? styles.projectDropdownItemActive : ''}`}
              >
                <button
                  type="button"
                  className={styles.projectDropdownItem}
                  onClick={() => select(p)}
                  title={p.name}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  className={styles.projectDeleteButton}
                  onClick={() => startDelete(p)}
                  aria-label={`Delete ${p.name}`}
                  title={`Delete ${p.name}`}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
            {startupProjects.length > 0 && <div className={styles.projectDropdownDivider} />}
            <Link
              href="/onboarding"
              className={`${styles.projectDropdownItem} ${styles.projectDropdownAdd}`}
              onClick={() => setOpen(false)}
            >
              + New startup
            </Link>
          </div>
        )}
      </div>

      {editTarget && (
        <div className={styles.projectDeleteOverlay} role="presentation" onClick={!savingEdit ? cancelEdit : undefined}>
          <div
            className={styles.projectDeleteModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-project-title"
            onClick={(event) => event.stopPropagation()}
          >
            <form
              className={styles.projectDeleteConfirm}
              onSubmit={(event) => {
                event.preventDefault();
                void confirmEdit();
              }}
            >
              <p id="edit-project-title" className={styles.projectDeleteTitle}>Rename project</p>
              <p className={styles.projectDeleteCopy}>
                Update the project name shown across your workspace.
              </p>
              <input
                className={styles.projectDeleteInput}
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value);
                  if (editError) setEditError('');
                }}
                placeholder="Project name"
                autoFocus
              />
              {editError && <p className={styles.projectDeleteError}>{editError}</p>}
              <div className={styles.projectDeleteActions}>
                <button type="button" className={styles.projectDeleteCancel} onClick={cancelEdit} disabled={savingEdit}>
                  Cancel
                </button>
                <button type="submit" className={styles.projectDeleteDanger} disabled={savingEdit || !canSaveEdit}>
                  {savingEdit ? 'Saving...' : 'Save name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.projectDeleteOverlay} role="presentation" onClick={!deleting ? cancelDelete : undefined}>
          <div
            className={styles.projectDeleteModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            onClick={(event) => event.stopPropagation()}
          >
            <form
              className={styles.projectDeleteConfirm}
              onSubmit={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              <p id="delete-project-title" className={styles.projectDeleteTitle}>Delete project?</p>
              <p className={styles.projectDeleteCopy}>
                This will remove <strong>{deleteTarget.name}</strong> from your dashboard.
              </p>
              <p className={styles.projectDeleteHint}>
                Type the project name to confirm.
              </p>
              <div className={styles.projectDeleteInputWrap}>
                {deleteTarget.name.startsWith(deleteConfirm) && (
                  <div className={styles.projectDeleteGhost} aria-hidden="true">
                    <span className={styles.projectDeleteGhostTyped}>{deleteConfirm}</span>
                    <span className={styles.projectDeleteGhostSuffix}>
                      {deleteTarget.name.slice(deleteConfirm.length)}
                    </span>
                  </div>
                )}
                <input
                  className={styles.projectDeleteInput}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  autoFocus
                />
              </div>
              {deleteError && <p className={styles.projectDeleteError}>{deleteError}</p>}
              <div className={styles.projectDeleteActions}>
                <button type="button" className={styles.projectDeleteCancel} onClick={cancelDelete} disabled={deleting}>
                  Cancel
                </button>
                <button type="submit" className={styles.projectDeleteDanger} disabled={deleting || !canDelete}>
                  {deleting ? 'Deleting...' : 'Delete project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

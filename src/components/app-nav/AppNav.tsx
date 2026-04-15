'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import styles from './AppNav.module.css';
import { backendClientFetch } from '@/lib/backend-client';
import type { ProjectNavItem } from '@/lib/backend-types';
import { getProjectPathSegment } from '@/lib/projects';

const STORAGE_KEY = 'startup-foundry:nav-expanded';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconProject() {
  return (
    <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="7" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="7" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="7" y1="15" x2="11" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 18c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="16" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M13 18c0-2.21 1.34-4 3-4s3 1.79 3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function IconBoard() {
  return (
    <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="5" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="4" width="5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="16" y="4" width="5" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

function IconInsights() {
  return (
    <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <polyline points="2,16 7,10 11,13 15,6 20,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="15,6 20,6 20,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

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

// ── Project switcher ──────────────────────────────────────────────────────────

function ProjectSwitcher({ slug, projectId, projectName, expanded, initialProjects }: {
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
    backendClientFetch('/v1/projects')
      .then((r) => r.json())
      .then((data: ProjectNavItem[]) => setProjects(data))
      .catch(() => {});
  }

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    if (initialProjects.length > 0) return;
    loadProjects();
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
  const resolvedCurrentProject = projectId
    ? currentProjectFromList ?? {
        id: projectId,
        name: projectName ?? 'Untitled project',
        slug,
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
            title={!expanded ? displayName : undefined}
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
            {projects.map((p: ProjectNavItem) => (
              <div
                key={p.id}
                className={`${styles.projectDropdownRow} ${getProjectPathSegment(p) === slug ? styles.projectDropdownItemActive : ''}`}
              >
                <button
                  type="button"
                  className={styles.projectDropdownItem}
                  onClick={() => select(p)}
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
            {projects.length > 0 && <div className={styles.projectDropdownDivider} />}
            <Link
              href="/onboarding"
              className={`${styles.projectDropdownItem} ${styles.projectDropdownAdd}`}
              onClick={() => setOpen(false)}
            >
              + New project
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
              <input
                className={styles.projectDeleteInput}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={deleteTarget.name}
                autoFocus
              />
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

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({ href, label, icon, active, expanded }: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  expanded: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${styles.item} ${active ? styles.itemActive : ''}`}
      title={!expanded ? label : undefined}
    >
      <span className={styles.itemIcon}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
    </Link>
  );
}

// ── AppNav ────────────────────────────────────────────────────────────────────

export function AppNav({ slug, projectId, projectName, initialProjects }: {
  slug?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  initialProjects?: ProjectNavItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === '1') setExpanded(true);
  }, []);

  const toggle = () => {
    setExpanded((v) => {
      localStorage.setItem(STORAGE_KEY, v ? '0' : '1');
      return !v;
    });
  };

  const cls = expanded ? styles.expanded : styles.collapsed;

  const projectNav = slug
    ? [
        { href: `/dashboard/${slug}/foundation`, label: 'Foundation', icon: <IconProject />, match: (p: string) => p.startsWith(`/dashboard/${slug}/foundation`) },
        { href: `/dashboard/${slug}/people`, label: 'People', icon: <IconPeople />, match: (p: string) => p.startsWith(`/dashboard/${slug}/people`) },
        { href: `/dashboard/${slug}/board`, label: 'Board', icon: <IconBoard />, match: (p: string) => p.startsWith(`/dashboard/${slug}/board`) },
        { href: `/dashboard/${slug}/insights`, label: 'Insights', icon: <IconInsights />, match: (p: string) => p.startsWith(`/dashboard/${slug}/insights`) },
      ]
    : [];

  return (
    <aside className={`${styles.nav} ${cls}`}>
      {/* Project switcher */}
      <ProjectSwitcher
        slug={slug ?? null}
        projectId={projectId ?? null}
        projectName={projectName ?? null}
        expanded={expanded}
        initialProjects={initialProjects ?? []}
      />

      {/* Project nav links */}
      <nav className={styles.items}>
        {projectNav.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={item.match(pathname ?? '')}
            expanded={expanded}
          />
        ))}
      </nav>

      {/* Profile */}
      <div className={styles.divider} />
      <nav className={styles.bottomItems}>
        <div className={styles.profileWrap} ref={menuRef}>
          {menuOpen && (
            <div className={styles.profileMenu}>
              <Link href="/settings" className={styles.profileMenuItem} onClick={() => setMenuOpen(false)}>
                Account settings
              </Link>
              <a href="mailto:feedback@startupfoundry.app" className={styles.profileMenuItem}>
                Send feedback
              </a>
              <div className={styles.profileMenuDivider} />
              <button
                className={`${styles.profileMenuItem} ${styles.profileMenuSignOut}`}
                onClick={() => signOut({ redirectUrl: '/login' })}
              >
                Sign out
              </button>
            </div>
          )}
          <button
            type="button"
            className={`${styles.item} ${menuOpen ? styles.itemActive : ''}`}
            title={!expanded ? (user?.fullName ?? 'Account') : undefined}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.itemIcon}>
              {user?.imageUrl ? (
                <Image src={user.imageUrl} alt="" width={28} height={28} className={styles.avatarImg} unoptimized />
              ) : (
                <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <circle cx="11" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M4 19c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              )}
            </span>
            <span className={styles.itemLabel}>{user?.fullName ?? 'Account'}</span>
          </button>
        </div>
      </nav>

      {/* Handle */}
      <button
        type="button"
        className={styles.handle}
        onClick={toggle}
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        <svg viewBox="0 0 8 14" fill="none" aria-hidden="true">
          <path
            d={expanded ? 'M6 1L2 7l4 6' : 'M2 1l4 6-4 6'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </aside>
  );
}

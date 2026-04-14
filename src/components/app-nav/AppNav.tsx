'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import styles from './AppNav.module.css';
import type { Project } from '@/lib/db/schema';

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

// ── Project switcher ──────────────────────────────────────────────────────────

function ProjectSwitcher({ projectId, projectName, expanded }: {
  projectId: string | null;
  projectName: string | null;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: Project[]) => setProjects(data))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function select(id: string) {
    setOpen(false);
    router.push(`/project/${id}/people`);
  }

  const displayName = projectName ?? 'Select project';

  return (
    <div className={styles.projectSwitcher} ref={ref}>
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

      {open && expanded && (
        <div className={styles.projectDropdown}>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.projectDropdownItem} ${p.id === projectId ? styles.projectDropdownItemActive : ''}`}
              onClick={() => select(p.id)}
            >
              {p.name}
            </button>
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

export function AppNav({ projectId, projectName }: {
  projectId?: string | null;
  projectName?: string | null;
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

  const projectNav = projectId
    ? [
        { href: `/project/${projectId}`, label: 'Project', icon: <IconProject />, match: (p: string) => p === `/project/${projectId}` },
        { href: `/project/${projectId}/people`, label: 'People', icon: <IconPeople />, match: (p: string) => p.startsWith(`/project/${projectId}/people`) },
        { href: `/project/${projectId}/board`, label: 'Board', icon: <IconBoard />, match: (p: string) => p.startsWith(`/project/${projectId}/board`) },
        { href: `/project/${projectId}/insights`, label: 'Insights', icon: <IconInsights />, match: (p: string) => p.startsWith(`/project/${projectId}/insights`) },
      ]
    : [];

  return (
    <aside className={`${styles.nav} ${cls}`}>
      {/* Project switcher */}
      <ProjectSwitcher
        projectId={projectId ?? null}
        projectName={projectName ?? null}
        expanded={expanded}
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
              <Link href="/account" className={styles.profileMenuItem} onClick={() => setMenuOpen(false)}>
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

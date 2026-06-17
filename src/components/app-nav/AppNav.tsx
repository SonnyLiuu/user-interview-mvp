'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import styles from './AppNav.module.css';
import type { ProjectNavItem, ProjectType } from '@/lib/backend-types';
import { ProjectSwitcher } from './ProjectSwitcher';

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
      <circle cx="11" cy="7.4" r="3.2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5.2 18c.5-3.6 2.65-5.4 5.8-5.4s5.3 1.8 5.8 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
      <path d="M4 15.5l4.4-5 3.4 3.2L17.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14.1 7h3.4v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
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

export function AppNav({ slug, projectId, projectName, projectType, initialProjects }: {
  slug?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectType?: ProjectType | null;
  initialProjects?: ProjectNavItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const outreachProjectId = pathname?.match(/\/outreach-projects\/([^/]+)/)?.[1] ?? searchParams.get('outreachProjectId');
  const peopleHref = slug && outreachProjectId
    ? `/dashboard/${slug}/people?outreachProjectId=${encodeURIComponent(outreachProjectId)}`
    : slug
      ? `/dashboard/${slug}/people`
      : '';

  const projectNav = slug
    ? [
        { href: `/dashboard/${slug}/foundation`, label: 'Foundation', icon: <IconProject />, match: (p: string) => p.startsWith(`/dashboard/${slug}/foundation`) },
        { href: peopleHref, label: 'People', icon: <IconPeople />, match: (p: string) => p.startsWith(`/dashboard/${slug}/people`) },
        { href: `/dashboard/${slug}/board`, label: 'Board', icon: <IconBoard />, match: (p: string) => p.startsWith(`/dashboard/${slug}/board`) },
        { href: `/dashboard/${slug}/insights`, label: 'Insights', icon: <IconInsights />, match: (p: string) => p.startsWith(`/dashboard/${slug}/insights`) },
      ]
    : [];

  return (
    <aside className={`${styles.nav} ${cls}`}>
      {/* Startup switcher */}
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
              <a href="mailto:feedback@userinterview.app" className={styles.profileMenuItem}>
                Send feedback
              </a>
              <div className={styles.profileMenuDivider} />
              <button
                className={`${styles.profileMenuItem} ${styles.profileMenuSignOut}`}
                onClick={() => signOut({ redirectUrl: '/' })}
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

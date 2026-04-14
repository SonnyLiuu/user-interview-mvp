'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import styles from './AppNav.module.css';

const STORAGE_KEY = 'startup-foundry:nav-expanded';

const MAIN_NAV = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    match: (p: string) => p === '/dashboard',
    icon: (
      <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="2" fill="currentColor" opacity="0.85"/>
        <rect x="12" y="2" width="8" height="8" rx="2" fill="currentColor" opacity="0.65"/>
        <rect x="2" y="12" width="8" height="8" rx="2" fill="currentColor" opacity="0.65"/>
        <rect x="12" y="12" width="8" height="8" rx="2" fill="currentColor" opacity="0.45"/>
      </svg>
    ),
  },
];

export function AppNav() {
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

  return (
    <aside className={`${styles.nav} ${cls}`}>
      {/* Logo */}
      <Link href="/dashboard" className={styles.logo}>
        {expanded ? (
          <span className={styles.logoFull}>Startup Foundry</span>
        ) : (
          <span className={styles.logoMark}>SF</span>
        )}
      </Link>

      {/* Main nav */}
      <nav className={styles.items}>
        {MAIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.item} ${item.match(pathname ?? '') ? styles.itemActive : ''}`}
            title={!expanded ? item.label : undefined}
          >
            <span className={styles.itemIcon}>{item.icon}</span>
            <span className={styles.itemLabel}>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom: account */}
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

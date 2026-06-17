'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { backendClientFetch } from '@/lib/backend-client';
import type { OutreachProjectRecord, ProjectType } from '@/lib/backend-types';
import styles from './WorkspaceTopBar.module.css';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d={open ? 'M2 9.5l5-5 5 5' : 'M2 4.5l5 5 5-5'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className={styles.plusIcon} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function currentOutreachId(pathname: string | null, searchParams: { get(name: string): string | null }) {
  return pathname?.match(/\/outreach-projects\/([^/]+)/)?.[1] ?? searchParams.get('outreachProjectId');
}

export function WorkspaceTopBar({
  slug,
  projectId,
  projectType,
  initialOutreachProjects,
}: {
  slug: string;
  projectId: string;
  projectType: ProjectType;
  initialOutreachProjects: OutreachProjectRecord[];
}) {
  const [projectOpen, setProjectOpen] = useState(false);
  const [outreachProjects, setOutreachProjects] = useState(initialOutreachProjects);
  const projectRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const isStartupWorkspace = projectType === 'startup';
  const selectedOutreachProjectId = currentOutreachId(pathname, searchParams);
  const selectedOutreachProject = useMemo(() => {
    if (selectedOutreachProjectId) {
      return outreachProjects.find((project) => project.id === selectedOutreachProjectId) ?? null;
    }
    return outreachProjects.find((project) => project.status !== 'archived') ?? null;
  }, [outreachProjects, selectedOutreachProjectId]);
  const hasOutreachProjects = outreachProjects.length > 0;

  useEffect(() => {
    setOutreachProjects(initialOutreachProjects);
  }, [initialOutreachProjects]);

  useEffect(() => {
    if (!projectOpen) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (projectRef.current && !projectRef.current.contains(target)) setProjectOpen(false);
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [projectOpen]);

  async function refreshOutreachProjects() {
    const res = await backendClientFetch(`/v1/projects/${projectId}/outreach-projects`);
    if (!res.ok) return;
    setOutreachProjects(await res.json() as OutreachProjectRecord[]);
  }

  function openOutreachProject(project: OutreachProjectRecord) {
    setProjectOpen(false);
    if (pathname?.startsWith(`/dashboard/${slug}/people`)) {
      router.push(`/dashboard/${slug}/people?outreachProjectId=${encodeURIComponent(project.id)}`);
      return;
    }

    router.push(`/dashboard/${slug}/outreach-projects/${project.id}/onboarding`);
  }

  function openNewOutreachProjectPage() {
    setProjectOpen(false);
    router.push(`/dashboard/${slug}/outreach-projects`);
  }

  return (
    <header className={styles.topBar}>
      {isStartupWorkspace && (
        <div className={`${styles.dropdownWrap} ${styles.projectDropdownWrap}`} ref={projectRef}>
          <button
            type="button"
            className={`${styles.selectorButton} ${styles.projectSelectorButton} ${!hasOutreachProjects ? styles.createSelectorButton : ''}`}
            onClick={() => {
              if (!hasOutreachProjects) {
                openNewOutreachProjectPage();
                return;
              }

              setProjectOpen((open) => !open);
              if (!projectOpen) void refreshOutreachProjects();
            }}
            aria-expanded={hasOutreachProjects ? projectOpen : undefined}
            aria-haspopup={hasOutreachProjects ? 'menu' : undefined}
          >
            <span className={styles.selectorKicker}>Project</span>
            <span className={styles.selectorName}>
              {!hasOutreachProjects ? 'New outreach project' : selectedOutreachProject?.name ?? 'Outreach projects'}
            </span>
            {hasOutreachProjects ? <ChevronIcon open={projectOpen} /> : <PlusIcon />}
          </button>

          {hasOutreachProjects && projectOpen && (
            <div className={`${styles.menu} ${styles.projectMenu}`} role="menu">
              {outreachProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`${styles.menuItem} ${project.id === selectedOutreachProject?.id ? styles.menuItemActive : ''}`}
                  onClick={() => openOutreachProject(project)}
                  role="menuitem"
                >
                  <span className={styles.outreachName}>{project.name}</span>
                  <span className={styles.outreachStatus}>{project.status}</span>
                </button>
              ))}
              <div className={styles.menuDivider} />
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemCreate}`}
                onClick={openNewOutreachProjectPage}
                role="menuitem"
              >
                <PlusIcon />
                New outreach project
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

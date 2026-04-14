'use client';

import ProjectChat from '@/components/project/ProjectChat';
import { dispatchIntakeComplete } from '@/components/brief/BriefPanel';

type Message = { role: 'assistant' | 'user'; content: string };

type Props = {
  projectId: string;
  initialConversation: Message[];
  hasBrief: boolean;
};

export default function ProjectPageClient({ projectId, initialConversation, hasBrief }: Props) {
  return (
    <ProjectChat
      projectId={projectId}
      initialConversation={initialConversation}
      hasBrief={hasBrief}
      onIntakeComplete={() => dispatchIntakeComplete(projectId)}
    />
  );
}

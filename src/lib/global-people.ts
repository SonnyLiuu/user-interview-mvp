import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  global_people,
  global_person_urls,
  person_global_links,
  type GlobalPerson,
  type Person,
  type PersonAnalysis,
} from '@/lib/db/schema';
import {
  buildGlobalPersonCaptureInput,
  chooseGlobalPersonMatch,
  GLOBAL_TAG_ALLOWLISTS,
  mergedGlobalPersonFields,
  type GlobalPersonCaptureInput,
  type GlobalPersonMatch,
  type GlobalPersonMatchCandidates,
} from '@/lib/global-people-core';

export {
  buildGlobalPersonCaptureInput,
  chooseGlobalPersonMatch,
  GLOBAL_TAG_ALLOWLISTS,
  mergeTagSets,
  normalizeGlobalTags,
  normalizeIdentityKey,
  normalizePublicUrl,
  urlKindFor,
} from '@/lib/global-people-core';
export type {
  GlobalMatchMethod,
  GlobalPersonCaptureInput,
  GlobalPersonMatch,
  GlobalPersonMatchCandidates,
  GlobalPersonUrlInput,
  GlobalUrlKind,
} from '@/lib/global-people-core';

export async function findGlobalPersonMatch(input: GlobalPersonCaptureInput): Promise<GlobalPersonMatch> {
  const candidates: GlobalPersonMatchCandidates = {};

  if (input.linkedinKey) {
    const [globalPerson] = await db
      .select()
      .from(global_people)
      .where(eq(global_people.linkedin_key, input.linkedinKey))
      .limit(1);
    candidates.byLinkedin = globalPerson ?? null;
  }

  if (!candidates.byLinkedin && input.websiteKey) {
    const [globalPerson] = await db
      .select()
      .from(global_people)
      .where(and(eq(global_people.website_key, input.websiteKey), eq(global_people.name_key, input.nameKey)))
      .limit(1);
    candidates.byWebsiteName = globalPerson ?? null;
  }

  if (!candidates.byLinkedin && !candidates.byWebsiteName && input.companyKey && input.titleKey) {
    const [globalPerson] = await db
      .select()
      .from(global_people)
      .where(and(
        eq(global_people.name_key, input.nameKey),
        eq(global_people.company_key, input.companyKey),
        eq(global_people.title_key, input.titleKey),
      ))
      .limit(1);
    candidates.byNameCompanyTitle = globalPerson ?? null;
  }

  return chooseGlobalPersonMatch(candidates);
}

async function upsertGlobalUrls(globalPersonId: string, urls: GlobalPersonCaptureInput['urls']) {
  for (const url of urls) {
    await db
      .insert(global_person_urls)
      .values({
        global_person_id: globalPersonId,
        url: url.url,
        normalized_url: url.normalizedUrl,
        url_kind: url.kind,
        last_seen_at: new Date(),
      })
      .onConflictDoUpdate({
        target: global_person_urls.normalized_url,
        set: {
          url: url.url,
          url_kind: url.kind,
          last_seen_at: new Date(),
        },
      });
  }
}

export async function captureGlobalPerson(input: GlobalPersonCaptureInput) {
  const existingLink = await db
    .select()
    .from(person_global_links)
    .where(eq(person_global_links.person_id, input.personId))
    .limit(1);
  if (existingLink.length) return existingLink[0];

  const match = await findGlobalPersonMatch(input);
  let globalPersonId = match.globalPerson?.id;

  if (match.globalPerson) {
    await db
      .update(global_people)
      .set(mergedGlobalPersonFields(match.globalPerson as GlobalPerson, input))
      .where(eq(global_people.id, match.globalPerson.id));
  } else {
    const [created] = await db
      .insert(global_people)
      .values({
        name_key: input.nameKey,
        display_name: input.displayName,
        company_key: input.companyKey,
        display_company: input.displayCompany,
        title_key: input.titleKey,
        display_title: input.displayTitle,
        linkedin_key: input.linkedinKey,
        website_key: input.websiteKey,
        role_tags: input.tags.role_tags,
        market_tags: input.tags.market_tags,
        seniority_tags: input.tags.seniority_tags,
        project_fit_tags: input.tags.project_fit_tags,
        learning_value_tags: input.tags.learning_value_tags,
        last_seen_at: new Date(),
      })
      .returning();
    globalPersonId = created.id;
  }

  await upsertGlobalUrls(globalPersonId!, input.urls);

  const [link] = await db
    .insert(person_global_links)
    .values({
      person_id: input.personId,
      global_person_id: globalPersonId!,
      project_id: input.projectId,
      match_method: match.method,
      match_confidence: match.confidence,
    })
    .onConflictDoNothing()
    .returning();

  return link ?? null;
}

export async function captureGlobalPersonFromResearch(args: {
  person: Pick<Person, 'id' | 'project_id' | 'name' | 'title' | 'company' | 'source_urls' | 'discovered_urls'>;
  analysis: PersonAnalysis;
}) {
  const input = buildGlobalPersonCaptureInput(args);
  if (!input) return null;
  return captureGlobalPerson(input);
}

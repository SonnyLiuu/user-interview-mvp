import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

// Project IDs (from our earlier query)
const USER_INTERVIEW_ID = '97efcd69-d87e-462f-8f57-8ac4f904b22a';
const STEALTH_STARTUP_ID = '34b57433-41eb-4e5e-8d28-c62127e0132e';
const STEALTH_INFO_DISCOVERY_ID = '04dd6c33-0bfc-4967-8760-ab69e84d11a1';

async function main() {
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const sql = neon(databaseUrl!);

  // ── Step 1: Show current state ──────────────────────────────────────────
  console.log('=== CURRENT STATE ===');
  const currentCounts = await sql`
    SELECT pj.name, count(pp.id)::int as people_count
    FROM projects pj
    LEFT JOIN people pp ON pp.project_id = pj.id
    WHERE pj.id IN (${USER_INTERVIEW_ID}, ${STEALTH_STARTUP_ID})
    GROUP BY pj.id, pj.name
  `;
  console.table(currentCounts);

  // ── Step 2: Ensure Stealth Startup has an idea_validation outreach project ─
  console.log('\n=== STEP 1: Setting up idea_validation outreach under Stealth Startup ===');

  // Check if there's already an idea_validation outreach project for Stealth
  const existingIdeaValidation = await sql`
    SELECT id, type, status FROM outreach_projects
    WHERE startup_project_id = ${STEALTH_STARTUP_ID}
    AND type = 'idea_validation'
    AND status <> 'archived'
  `;

  let ideaValidationOutreachId: string;

  if (existingIdeaValidation.length > 0) {
    ideaValidationOutreachId = existingIdeaValidation[0].id;
    console.log(`Found existing idea_validation outreach: ${ideaValidationOutreachId}`);
    // Ensure it's active
    if (existingIdeaValidation[0].status !== 'active') {
      await sql`
        UPDATE outreach_projects SET status = 'active', updated_at = now()
        WHERE id = ${ideaValidationOutreachId}
      `;
      console.log('Set status to active');
    }
  } else {
    // Update the existing Information Discovery to idea_validation
    const updateResult = await sql`
      UPDATE outreach_projects 
      SET type = 'idea_validation', name = 'Idea Validation', updated_at = now()
      WHERE id = ${STEALTH_INFO_DISCOVERY_ID}
      RETURNING id, type, name
    `;
    ideaValidationOutreachId = updateResult[0].id;
    console.log(`Updated outreach project to idea_validation:`, updateResult[0]);
  }

  // ── Step 3: Move all people from User Interview to Stealth Startup ──────
  console.log('\n=== STEP 2: Moving people from User Interview → Stealth Startup ===');

  // Get list of people to move
  const peopleToMove = await sql`
    SELECT id, name FROM people WHERE project_id = ${USER_INTERVIEW_ID}
  `;
  const personIds = peopleToMove.map((p: any) => p.id);
  console.log(`Found ${peopleToMove.length} people to move`);

  // Update people
  const moveResult = await sql`
    UPDATE people 
    SET 
      project_id = ${STEALTH_STARTUP_ID},
      outreach_project_id = ${ideaValidationOutreachId},
      updated_at = now()
    WHERE project_id = ${USER_INTERVIEW_ID}
    RETURNING id, name
  `;
  console.log(`Moved ${moveResult.length} people:`);
  for (const p of moveResult) {
    console.log(`  ✅ ${p.name}`);
  }

  // Update debriefs project_id for moved people
  const debriefUpdate = await sql`
    UPDATE debriefs 
    SET project_id = ${STEALTH_STARTUP_ID}
    WHERE person_id = ANY(${personIds}::uuid[])
    RETURNING id
  `;
  console.log(`\nUpdated ${debriefUpdate.length} debriefs to Stealth Startup`);

  // Update interactions outreach_project_id for moved people
  const interactionUpdate = await sql`
    UPDATE interactions 
    SET outreach_project_id = ${ideaValidationOutreachId}
    WHERE person_id = ANY(${personIds}::uuid[])
    RETURNING id
  `;
  console.log(`Updated ${interactionUpdate.length} interactions to idea_validation outreach`);

  // Update person_global_links project_id for moved people
  const globalLinkUpdate = await sql`
    UPDATE person_global_links 
    SET project_id = ${STEALTH_STARTUP_ID}
    WHERE person_id = ANY(${personIds}::uuid[])
    RETURNING person_id
  `;
  console.log(`Updated ${globalLinkUpdate.length} person_global_links to Stealth Startup`);

  // ── Step 4: Verify final state ──────────────────────────────────────────
  console.log('\n=== FINAL STATE ===');
  const finalCounts = await sql`
    SELECT pj.name, count(pp.id)::int as people_count
    FROM projects pj
    LEFT JOIN people pp ON pp.project_id = pj.id
    WHERE pj.id IN (${USER_INTERVIEW_ID}, ${STEALTH_STARTUP_ID})
    GROUP BY pj.id, pj.name
  `;
  console.table(finalCounts);

  // Verify outreach project assignment
  const outreachVerify = await sql`
    SELECT op.name, op.type, op.status, count(p.id)::int as people_count
    FROM outreach_projects op
    LEFT JOIN people p ON p.outreach_project_id = op.id
    WHERE op.id = ${ideaValidationOutreachId}
    GROUP BY op.id, op.name, op.type, op.status
  `;
  console.log('\n=== OUTREACH PROJECT VERIFICATION ===');
  console.table(outreachVerify);

  console.log('\n✅ Done!');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

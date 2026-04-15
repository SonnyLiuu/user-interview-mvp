import { NextRequest, NextResponse } from 'next/server';
import { getBackendAccessToken } from '@/lib/backend-auth';
import { env } from '@/lib/server-env';
import { validateInput, createPersonSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  try {
    // Validate request body
    const body = await req.json();
    const validatedData = validateInput(createPersonSchema, body);

    // Get backend token
    const token = await getBackendAccessToken();

    // Forward to backend API
    const response = await fetch(`${env.FOUNDRY_API_BASE_URL}/v1/people`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(validatedData),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return NextResponse.json(
        { error: 'Failed to create person' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Validation failed:')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('Person creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

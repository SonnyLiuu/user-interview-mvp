export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnvOnStartup } = await import('@/lib/server-env');
    validateEnvOnStartup();
  }
}

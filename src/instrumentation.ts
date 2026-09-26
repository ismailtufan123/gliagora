// Runs once when the Next.js server starts, before it handles requests.
export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { connectOnStart } = await import('./lib/startup')
    await connectOnStart()
  }
}

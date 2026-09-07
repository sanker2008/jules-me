export async function validateAndPersistApiKey(
  apiKey: string,
  validateConnection: (key: string) => Promise<unknown>,
  persistKey: (key: string) => Promise<void>,
): Promise<string> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new Error('API Key is required.');

  await validateConnection(normalizedKey);
  await persistKey(normalizedKey);
  return normalizedKey;
}

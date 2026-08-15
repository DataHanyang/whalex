import type { ProviderSettings } from "@whalex/shared";
import { OpenAICompatProvider } from "./OpenAICompatProvider.js";
import type { ProviderClient, SecretResolver } from "./Provider.js";

export async function createProvider(
  settings: ProviderSettings,
  resolveSecret: SecretResolver,
): Promise<ProviderClient> {
  const apiKey = settings.apiKeyRef ? await resolveSecret(settings.apiKeyRef) : null;
  return new OpenAICompatProvider({ baseUrl: settings.baseUrl, apiKey });
}

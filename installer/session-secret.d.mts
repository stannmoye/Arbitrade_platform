export function ensureSessionSecret(options?: {
  root?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<{
  generated: boolean;
  source: "environment" | "env-file" | "generated";
}>;

type EnvReader = (name: string) => string | undefined;

// This is public deployment configuration, not a credential. Preserve all explicitly
// configured origins while adding only the HTTPS origin owned by this application.
export const PRODUCTION_ORIGIN = 'https://bigmatch.justcolors.net';

export function withProductionOrigin(readEnv: EnvReader): EnvReader {
  return (name) => {
    const value = readEnv(name);
    if (name !== 'BIG_MATCH_ALLOWED_ORIGINS') return value;
    const origins = (value ?? '').split(',').map(origin => origin.trim()).filter(Boolean);
    return [...new Set([...origins, PRODUCTION_ORIGIN])].join(',');
  };
}

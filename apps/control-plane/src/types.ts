export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: 'development' | 'preview' | 'production';
  AUTH_MODE: 'development' | 'cloudflare-access';
  DASHBOARD_ORIGIN: string;
  CLOUDFLARE_ACCOUNT_NAME: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_BUILD_TOKEN?: string;
  CLOUDFLARE_BUILD_TOKEN_ID?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
}

export interface Variables {
  actor: string;
  requestId: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}

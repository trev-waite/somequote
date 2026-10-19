declare namespace Cloudflare {
  interface Env {
    /** Migrations read by vitest.config.ts so each test file can build its own database. */
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}

declare module '*?raw' {
  const content: string;
  export default content;
}

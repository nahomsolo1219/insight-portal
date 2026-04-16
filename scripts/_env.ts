// Side-effect import that must run BEFORE `@/db` is evaluated.
//
// `src/db/index.ts` reads `process.env.DATABASE_URL` at import time to
// construct the postgres client. ES module imports are hoisted, so unless we
// load `.env.local` as an earlier side-effect import, `db` is instantiated
// with an undefined connection string. Every seed / helper script should
// `import './_env';` before importing anything from `src/db`.

import { config } from 'dotenv';

config({ path: '.env.local' });

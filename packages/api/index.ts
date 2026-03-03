import { createTRPCRouter } from './trpc';
import { identityRouter } from './routers/identity';
import { workRouter } from './routers/work';
import { connectionRouter } from './routers/connection';
import { groupRouter } from './routers/group';
import { adminRouter } from './routers/admin';

export { createTRPCContext } from './trpc';

export const appRouter = createTRPCRouter({
  identity: identityRouter,
  work: workRouter,
  connection: connectionRouter,
  group: groupRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

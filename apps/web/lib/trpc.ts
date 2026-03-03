import { createTRPCReact } from '@trpc/react-query';
import { type AppRouter } from '@creativeid/api';

export const trpc = createTRPCReact<AppRouter>();

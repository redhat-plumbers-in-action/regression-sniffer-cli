import { z } from 'zod';

export const filtersSchema = z.object({
  followUp: z.array(z.string().min(1)),
  revert: z.array(z.string().min(1)),
  mention: z.array(z.string().min(1)),
  cherryPick: z.array(z.string().min(1)),
});

export type Filters = z.infer<typeof filtersSchema>;

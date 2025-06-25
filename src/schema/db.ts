import { z } from 'zod';

export const followUpSchema = z.object({
  sha: z.string(),
  message: z.string(),
  url: z.url(),
  backported: z.boolean().optional(),
  waived: z.boolean().optional(),
});

export const revertSchema = followUpSchema;

export type followUpDb = z.infer<typeof followUpSchema>;
export type revertDb = z.infer<typeof revertSchema>;

export const trackerSchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.url(),
  status: z.string(),
  statusCategory: z.string(),
  versions: z.array(z.string()),
  summary: z.string(),
});

export type trackerDb = z.infer<typeof trackerSchema>;

export const prSchema = z.object({
  number: z.number(),
  url: z.url(),
  waived: z.boolean().optional(),
});

export type prDb = z.infer<typeof prSchema>;

export const commitSchema = z.object({
  sha: z.string(),
  url: z.string(),
  cherryPicks: z.array(
    z.object({
      sha: z.string(),
      url: z.string(),
    })
  ),
  message: z.string(),
  followUps: z.array(followUpSchema),
  reverts: z.array(revertSchema),
  tracker: trackerSchema.optional(),
  pr: prSchema.optional(),
});

export type CommitDb = z.infer<typeof commitSchema>;

export const projectSchema = z.object({
  upstream: z.url(),
  downstream: z.url(),
  commits: z.array(commitSchema),
});

export const dbSchema = projectSchema;

export type Db = z.infer<typeof dbSchema>;

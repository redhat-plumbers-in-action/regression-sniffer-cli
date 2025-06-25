import { z } from 'zod';

export const externalLinkSchema = z
  .object({
    object: z.object({
      title: z.string(),
      url: z.url(),
    }),
  })
  .transform(link => ({
    sha: link.object.url.split('/').pop(),
    url: link.object.url,
    type:
      (link.object.title.match(
        /^\[(follow-up|revert|cherry-pick|backport)\] - (.+)$/
      )?.[1] as 'follow-up' | 'revert' | 'cherry-pick' | 'backport') ||
      undefined,
    title: link.object.title.replace(
      /^\[(follow-up|revert|cherry-pick|backport)\] - /,
      ''
    ),
  }));

export type ExternalLink = z.infer<typeof externalLinkSchema>;

const findValue = (
  links: ExternalLink[],
  type: ExternalLink['type'],
  key: keyof ExternalLink
): string => {
  return links.find(link => link.type === type)?.[key] || '';
};

const filterValues = (links: ExternalLink[], type: ExternalLink['type']) => {
  return links
    .filter(link => link.type === type)
    .map(link => ({
      sha: link.sha ?? '',
      url: link.url,
      message: link.title,
    }));
};

export const jiraIssueSchema = z
  .object({
    key: z.string(),
    url: z.url(),
    type: z.string(),
    status: z.string(),
    statusCategory: z.string(),
    summary: z.string(),
    labels: z.array(z.string()),
    links: externalLinkSchema.array(),
    versions: z.array(z.string()),
    epic: z.string().optional(),
  })
  .transform(issue => ({
    sha: findValue(issue.links, 'backport', 'sha'),
    url: findValue(issue.links, 'backport', 'url'),
    cherryPicks: filterValues(issue.links, 'cherry-pick'),
    message: findValue(issue.links, 'backport', 'title'),
    followUp: filterValues(issue.links, 'follow-up'),
    revert: filterValues(issue.links, 'revert'),
    tracker: {
      id: issue.key,
      type: issue.type,
      url: issue.url,
      status: issue.status,
      statusCategory: issue.statusCategory,
      versions: issue.versions,
      summary: issue.summary,
    },
  }));

export type JiraIssue = z.infer<typeof jiraIssueSchema>;

export const releaseSchema = z.coerce.number().min(8).max(10);

import { describe, expect, test } from 'vitest';

import { filters, shaFilter } from '../../src/filter';

describe('Filters', () => {
  test('filter utility', () => {
    expect(shaFilter).toBe('%{sha}%');
  });

  test('filters', () => {
    expect(filters.cherryPick).toMatchInlineSnapshot(`
      [
        "^\\(cherry picked from commit (%{sha}%)\\)$",
      ]
    `);
    expect(filters.mention).toMatchInlineSnapshot(`
      [
        "(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(%{sha}%)",
      ]
    `);
    expect(filters.followUp).toMatchInlineSnapshot(`
      [
        "follow-?up *(|:|-|for|to) *(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(%{sha}%)",
      ]
    `);
    expect(filters.revert).toMatchInlineSnapshot(`
      [
        "(This)? *reverts? *(commit)? *(|:|-) *(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(%{sha}%)",
      ]
    `);
  });
});

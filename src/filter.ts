import { Filters } from './schema/filter';

export const shaFilter = '%{sha}%';

export const filters: Filters = {
  cherryPick: [`^\\(cherry picked from commit (${shaFilter})\\)$`],
  mention: [
    `(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(${shaFilter})`,
  ],
  followUp: [
    `follow-?up *(|:|-|for|to) *(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(${shaFilter})`,
  ],
  revert: [
    `(This)? *reverts? *(commit)? *(|:|-) *(https:\\/\\/github\\.com\\/systemd\\/systemd\\/commit\\/)?(${shaFilter})`,
  ],
};

import { OptionValues } from 'commander';

export function raise(error: string): never {
  throw new Error(error);
}

export function tokenUnavailable(type: 'jira' | 'github'): never {
  let tokenType: string;
  switch (type) {
    case 'jira':
      tokenType = 'JIRA_API_TOKEN';
      break;
    case 'github':
      tokenType = 'GITHUB_API_TOKEN';
      break;
  }

  return raise(
    `${tokenType} not set.\nPlease set the ${tokenType} environment variable in '~/.config/regression-sniffer/.env' or '~/.env.regression-sniffer' or '~/.env.'`
  );
}

export function isDefaultValuesDisabled(): boolean {
  return process.env['NODEFAULTS'] ? true : false;
}

export function getDefaultValue(
  envName:
    | 'COMPONENT'
    | 'RELEASE'
    | 'EPIC'
    | 'UPSTREAM'
    | 'DOWNSTREAM'
    | 'LABEL'
    | 'CLEANUP'
    | 'NOCOLOR'
    | 'DRY'
) {
  if (isDefaultValuesDisabled()) {
    return undefined;
  }

  const value = process.env[envName];

  if (
    (envName === 'NOCOLOR' || envName === 'DRY' || envName === 'CLEANUP') &&
    !value
  ) {
    return false;
  }

  return value;
}

export function getOptions(inputs: OptionValues): OptionValues {
  return {
    ...inputs,
    component: inputs.component || getDefaultValue('COMPONENT'),
    release: inputs.release || getDefaultValue('RELEASE'),
    epic: inputs.epic || getDefaultValue('EPIC'),
    upstream: inputs.upstream || getDefaultValue('UPSTREAM'),
    downstream: inputs.downstream || getDefaultValue('DOWNSTREAM'),
  };
}

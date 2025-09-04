import { OptionValues } from 'commander';
import os from 'node:os';

export function raise(error: string): never {
  throw new Error(error);
}

const tokenEnvVars = {
  jira: 'JIRA_API_TOKEN',
  github: 'GITHUB_API_TOKEN',
} as const;

export function tokenUnavailable(type: keyof typeof tokenEnvVars): never {
  const tokenType = tokenEnvVars[type];

  return raise(
    `${tokenType} not set.\nPlease set the ${tokenType} environment variable in '~/.config/regression-sniffer/.env' or '~/.env.regression-sniffer' or '~/.env.'`
  );
}

export function getUserFromLogin(): string | undefined {
  try {
    const login = os.userInfo().username;
    return `${login}@redhat.com`;
  } catch {
    return undefined;
  }
}

export function isDefaultValuesDisabled(): boolean {
  return !!process.env['NODEFAULTS'];
}

export function getDefaultValue(
  envName:
    | 'COMPONENT'
    | 'RELEASE'
    | 'EPIC'
    | 'UPSTREAM'
    | 'DOWNSTREAM'
    | 'LABEL'
    | 'FROM'
    | 'LOGIN'
    | 'CLEANUP'
    | 'NOCOLOR'
    | 'DRY'
) {
  if (isDefaultValuesDisabled()) {
    return undefined;
  }

  const value = process.env[envName];

  if (envName === 'LOGIN' && !value) {
    return getUserFromLogin();
  }

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
    login: inputs.login || getDefaultValue('LOGIN'),
  };
}

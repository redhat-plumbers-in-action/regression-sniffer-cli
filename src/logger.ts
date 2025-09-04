export class Logger {
  // Matches full ANSI escape sequences: ESC[ followed by params and a terminator
  static readonly colorRegex = /\x1b\[\d+(;\d+)*m/g;

  constructor(readonly noColor: boolean = false) {}

  log(message?: string): void {
    if (!message) {
      return;
    }

    if (!this.noColor) {
      console.log(message);
      return;
    }

    console.log(message.replace(Logger.colorRegex, ''));
  }
}

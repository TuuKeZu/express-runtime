import chalk from 'chalk';

export class ProcessConsole {
    #silent: boolean = false;

    #getDateTime = (): string => {
        return `${new Date().toLocaleDateString('EN-us', { 'weekday': 'short' })} ${new Date().toLocaleTimeString('FI-fi').replaceAll('.', ':')}`;
    }

    suppress = () => {
        this.#silent = true;
    }

    clear = () => {
        console.clear();
    }

    log = (data: any) => {
        if (this.#silent) return;
        console.log(chalk.gray(`[${this.#getDateTime()}]:`), chalk.white(data));
    }

    warn = (data: any) => {
        if (this.#silent) return;
        console.log(chalk.gray(`[${this.#getDateTime()}]:`), chalk.yellow(data));
    }

    info = (data: any) => {
        if (this.#silent) return;
        console.log(chalk.gray(`[${this.#getDateTime()}]:`), chalk.green(data));
    }

    error = (data: any) => {
        if (this.#silent) return;
        console.log(chalk.gray(`[${this.#getDateTime()}]:`), chalk.redBright(data));
    }
}
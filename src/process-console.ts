import chalk from 'chalk';

export class ProcessConsole {

    #getDateTime = (): string => {
        return `${new Date().toLocaleDateString('EN-us', { 'weekday': 'short' })} ${new Date().toLocaleTimeString('FI-fi').replaceAll('.', ':')}`;
    }

    clear = () => {
        console.clear();
    }

    log = (data: any) => {
        console.log(chalk.gray(`[${this.#getDateTime()}]:`), chalk.white(data));
    }

    warn = (data: any) => {
        console.log(chalk.gray(`[${this.#getDateTime()}]:`), chalk.yellow(data));
    }

    info = (data: any) => {
        console.log(chalk.gray(`[${this.#getDateTime()}]:`), chalk.green(data));
    }

    error = (data: any) => {
        console.log(chalk.gray(`[${this.#getDateTime}]:`), chalk.redBright(data));
    }
}
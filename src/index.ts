import { process_path } from './config.json';
import { exec, ChildProcess } from 'child_process';

export class Process {
    process: ChildProcess | null = null;


    spawnProcess() {
        this.process = exec(`node ${process_path}`);

        this.process.stdout?.on('data', this.onLogData);
        this.process.stderr?.on('data', this.onLogError);
        this.process.on('close', this.onClose);
    }

    killProcess() {
        this.process?.kill();
        this.process = null;
    }

    respawnProcess() {
        console.log("a?");
        this.killProcess();

        setTimeout(() => {
            this.spawnProcess();
        }, 5000); 
    }

    onLogData(data: any) {
        console.log(data);
    }

    onLogError(data: any) {
        console.log(data);
    }

    onClose(code: number) {
        switch(code) {
            case 0:
                console.log("clean exit");
                break;
            case 1:
                this.respawnProcess();
                break;
        }
    }
}




const runProcess = () => {
    return new Promise((resolve, reject) => {
        const process = new Process();
        process.spawnProcess();
    });
}

runProcess();
import { process_path } from './config.json';
import { fork, ChildProcess } from 'node:child_process';
import { AnalyticsPacketType, AnalyticsPacket, MultipartNetworkRequestAnalytics } from 'express-runtime-dependency';
import { AnalyticsEngine } from './analytics-engine';
import { ProcessConsole } from './process-console';

export class Process {
    process: ChildProcess | null = null;
    analytics: AnalyticsEngine;
    console: ProcessConsole;

    constructor() {
        this.console = new ProcessConsole();
        this.console.clear();
        
        this.analytics = new AnalyticsEngine(this.console);
    }

    spawnProcess = (): [AnalyticsEngine, ProcessConsole] => {
        this.console.info("Starting process...");
        this.process = fork(process_path, { 'stdio': ['ipc', 'pipe', 'pipe']});

        this.process.stdout?.on('data', this.#onLogData);
        this.process.stderr?.on('data', this.#onLogError);
        this.process.on('message', this.#onreceiveData);
        this.process.on('close', this.#onClose);

        return [this.analytics, this.console];
    }

    killProcess = () => {
        this.process?.kill();
        this.process = null;
    }

    #respawnProcess = () => {
        this.killProcess();

        setTimeout(() => {
            this.spawnProcess();
        }, 5000); 
    }

    #onLogData = (data: any) => {
        this.console.log(data);
    }

    #onLogError = (data: any) => {
        this.console.error(data);
    }

    #onreceiveData = (data: any) => {
        const packet = data['type'] == undefined ? null : data as AnalyticsPacket;
        if (!packet) return this.console.log(data);

        switch(packet.type) {
            case AnalyticsPacketType.MultipartNetworkRequest:
                this.analytics.onRequest(packet as MultipartNetworkRequestAnalytics);
                break; 
            default:
                this.console.log(data);
        }
    }

    #onClose = (code: number) => {
        switch(code) {
            case 0:
                this.console.info("clean exit");
                break;
            case 1:
                this.#respawnProcess();
                break;
        }
    }
}
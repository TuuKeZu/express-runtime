import { process_path } from './config.json';
import { fork, ChildProcess } from 'node:child_process';
import { AnalyticsPacketType, AnalyticsPacket, MultipartNetworkRequestAnalytics } from 'express-runtime-dependency';
import { AnalyticsEngine } from './analytics-engine';
import { ProcessConsole } from './process-console';

export interface ProcessConfig {
    should_restart?: boolean,
    restart_delay?: number,
    suppress_console?: boolean,
}

export class Process {
    process: ChildProcess | null = null;
    analytics: AnalyticsEngine;
    console: ProcessConsole;
    
    #config: ProcessConfig;

    constructor(config: ProcessConfig) {
        this.#config = config;

        this.console = new ProcessConsole();
        this.console.clear();

        this.analytics = new AnalyticsEngine(this.console);
    }

    spawnProcess = (): [AnalyticsEngine, ProcessConsole] => {
        if (this.#config.suppress_console) {
            this.console.info("Running in silent mode");
            this.console.suppress();
        }

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
                break;
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
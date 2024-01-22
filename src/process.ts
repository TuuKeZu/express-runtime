import { process_path } from './config.json';
import { fork, ChildProcess } from 'node:child_process';
import { AnalyticsPacketType, AnalyticsPacket, MultipartNetworkRequestAnalytics } from '@tuukezu/express-runtime-dependency';
import { AnalyticsEngine } from './analytics-engine';
import { ProcessConsole } from './process-console';

import fs from 'node:fs';
import path from 'node:path';

export interface ProcessConfig {
    should_restart?: boolean,
    restart_delay?: number,
    suppress_console?: boolean,
}

interface ProcessInfo {
    path: string,
    name: string,
    version: string
}

export class Process {
    process: ChildProcess | null = null;
    info: ProcessInfo | null = null;
    active: boolean = false;

    analytics: AnalyticsEngine;
    console: ProcessConsole;
    
    #config: ProcessConfig;

    constructor(config: ProcessConfig) {
        this.#config = config;

        this.console = new ProcessConsole();
        this.console.clear();

        this.analytics = new AnalyticsEngine({
            console: this.console,
            disable_logs: false,
        });
    }


    spawnProcess = (): [AnalyticsEngine, ProcessConsole] => {
        if (this.#config.suppress_console) {
            this.console.info("Running in silent mode");
            this.console.suppress();
        }
        
        this.info = this.#resolveProcessInfo();
        this.console.info(`Starting '${this.info.name}@${this.info.version}'`);

        this.process = fork(process_path, { 'stdio': ['ipc', 'pipe', 'pipe']});
        this.active = true;

        this.process.stdout?.on('data', this.#onLogData);
        this.process.stderr?.on('data', this.#onLogError);
        this.process.on('message', this.#onreceiveData);
        this.process.on('close', this.#onClose);

        return [this.analytics, this.console];
    }

    #resolveProcessInfo = (): ProcessInfo => {
        const packagePath = path.join(process_path, 'package.json')
        const data = JSON.parse(fs.readFileSync(packagePath, { 'encoding': 'utf-8' }));
        
        return {
            path: process_path,
            name: data['name'] ?? 'unknown',
            version: data['version'] ?? 'unknown',
        }
    }

    killProcess = () => {
        this.process?.kill();
        this.process = null;
        this.active = false;
    }

    #respawnProcess = () => {
        this.console.warn(`Restarting process in ${this.#config.restart_delay ?? 5000}ms...`);
        this.killProcess();

        setTimeout(() => {
            this.spawnProcess();
        }, this.#config.restart_delay ?? 5000); 
    }

    #onLogData = (data: any) => {
        this.console.log(data);
    }

    #onLogError = (data: any) => {
        this.console.error(data);
        this.#exportError(data);
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
        this.active = false;
        switch(code) {
            case 0:
                this.console.info("clean exit");
                break;
            case 1:
                if (!this.#config.should_restart) return console.error("Process crashed - process will not be restarted.")
                this.#respawnProcess();
                break;
        }
    }

    #exportError = (data: any) => {
        const errorLogName = `error ${new Date().toLocaleDateString('Fi-fi', {
            'day': '2-digit',
            'month': '2-digit',
            'year': 'numeric',
            'hour': '2-digit',
            'minute': '2-digit',
            'second': '2-digit'
        }).replaceAll('.', '-').replaceAll(' ', '_')}.txt`;

        const errorLogPath = path.join('logs', errorLogName);

        fs.writeFileSync(errorLogPath, data);
    }
}
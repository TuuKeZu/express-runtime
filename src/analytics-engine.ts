import { request } from "express";
import { AnalyticsPacket, AnalyticsPacketType, MultipartNetworkRequestAnalytics, RequestStatus } from '@tuukezu/express-runtime-dependency';
import fs from 'node:fs';
import path from 'node:path';
import { ProcessConsole } from "./process-console";
import { LogData, LogHistory } from "./analytics/logs";
import { Statistics, StatisticsResponse, StatisticsWrapper } from "./analytics/statistics";


export interface AnalyticsEngineConfig {
    console: ProcessConsole,
    disable_logs?: boolean,
}

export class AnalyticsEngine {
    TICK_TIME = 30 * 1000;

    #runtime: NodeJS.Timeout;
    #console: ProcessConsole;
    #logHistory: LogHistory;
    #tick: number;
    #disableLogs: boolean;

    history: LogData;
    requestBuffer: AnalyticsPacket[] = [];

    latestStatistics: Statistics[] = [];
    hourlyStatistics: Statistics[] = [];

    latestStatisticsHistory: StatisticsWrapper[] = [];
    hourlyStatisticsHistory: StatisticsWrapper[] = [];

    constructor(config: AnalyticsEngineConfig) {
        this.#runtime = setInterval(this.#onTick, this.TICK_TIME);
        this.#console = config.console;
        this.#tick = (new Date().getHours() * 60 * 2) + (new Date().getMinutes() * 2) + Math.floor(new Date().getSeconds() / 30);

        this.#disableLogs = config.disable_logs ?? false;

        this.#logHistory = new LogHistory().generate('./logs');
        this.history = this.#logHistory.averageTimings();
        
        if (!fs.existsSync(path.join('./logs'))) this.#console.warn("Missing './logs' directory");
        if (this.#disableLogs) this.#console.warn("Running in no-logs mode");

        
        this.#console.info("Running analytics engine");
        this.#console.log(`Syncing analytics-engine: Skipped '${this.#tick}' ticks (${Math.floor(this.#tick / 2 / 60)}h ${(this.#tick / 2) % 60}min)'`)
        this.#console.log(`Calculating average timings from log history:`);
        this.#console.log(`> ${this.history.overview.totalRequests.toFixed(0)} requests on average`);
        this.#console.log(`> ${this.history.timings.averageHandleTime.toFixed(2)}ms (+${this.history.timings.averageProcessTime.toFixed(2)}ms) on average`);
    }

    #onTick = () => {
        this.#on30sTick();

        if (this.#tick % (2 * 60) == 0) return this.#onHourTick();
        if (this.#tick >= (2 * 60 * 24) - 2) return this.#onDayTick();
    }

    onRequest = (request: AnalyticsPacket) => {
        this.requestBuffer.push(request);
    }

    #on30sTick = () => {
        const statistics = new Statistics(this).fromRequestBuffer(this.requestBuffer);
        this.latestStatistics.push(statistics);
        
        this.latestStatisticsHistory.push(statistics.format());
        if (this.latestStatisticsHistory.length >= 120) this.latestStatisticsHistory.shift();

        this.requestBuffer = [];
        this.#tick += 1;
    }

    #resolveLogPath = (date?: Date, ignoreExtension?: boolean): string => {
        const fileName = (date ?? new Date()).toLocaleDateString('FI-fi', { 'day': '2-digit', 'month': '2-digit', 'year': 'numeric' }).replaceAll('.', '-');
        return path.join('./logs', `${fileName}${ ignoreExtension ? '' : '.json' }`);
    }

    #onHourTick = () => {
        if (this.latestStatistics.length <= 0) return;

        const statistics = new Statistics(this).fromStatisticsBuffer(this.latestStatistics);
        if (!this.#disableLogs) statistics.export(this.#resolveLogPath(), 'hourly');

        
        this.hourlyStatisticsHistory.push(statistics.format());
        if (this.hourlyStatisticsHistory.length >= 24) this.hourlyStatisticsHistory.shift();

        this.latestStatistics = [];

        this.hourlyStatistics.push(statistics);
    }

    #onDayTick = () => {
        if (this.hourlyStatistics.length <= 0) return;

        const statistics = new Statistics(this).fromStatisticsBuffer(this.hourlyStatistics);
        if (!this.#disableLogs) statistics.export(`${this.#resolveLogPath(new Date(), true)}-overview.json`, 'overview');
        
        this.#console.info("Exporting statistics gathered during the last 24h");
        this.#console.log(`${statistics.totalrequests} requests in total`);

        this.hourlyStatistics = [];
        this.#tick = 0;

        this.#logHistory = new LogHistory().generate('./logs');
        this.history = this.#logHistory.averageTimings();
    }

    getLatest = (): StatisticsResponse => {
        const list = this.latestStatisticsHistory;
        if (list.length <= 1) return { range: [new Date(), new Date()], count: 0, entries: [] };

        return {
            range: [list[0].timeStamp, (<StatisticsWrapper>list.at(-1)).timeStamp],
            count: list.length,
            entries: list
        };
    }
    
    getHourly = (): StatisticsResponse => {
        const list = this.hourlyStatisticsHistory;
        if (list.length <= 1) return { range: [new Date(), new Date()], count: 0, entries: [] };

        return {
            range: [list[0].timeStamp, (<StatisticsWrapper>list.at(-1)).timeStamp],
            count: list.length,
            entries: list
        };
    }
    
    getRequestsPerWeekday = (auth: boolean) => {
        return this.#logHistory.requestsPerWeekday(!auth);
    }
    
    getStatisticsPerDay = (auth: boolean) => {
        return this.#logHistory.statisticsPerDay(!auth);
    }

    getRequestsPerDay = (auth: boolean) => {
        return this.#logHistory.requestsPerDay(!auth);
    }
}
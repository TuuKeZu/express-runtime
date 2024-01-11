import { request } from "express";
import { AnalyticsPacket, AnalyticsPacketType, MultipartNetworkRequestAnalytics, RequestStatus } from '@tuukezu/express-runtime-dependency';
import fs from 'node:fs';
import path from 'node:path';
import { ProcessConsole } from "./process-console";


export class AnalyticsEngine {
    TICK_TIME = 30 * 1000;

    #runtime: NodeJS.Timeout;
    #console: ProcessConsole;
    #tick: number;

    requestBuffer: AnalyticsPacket[] = [];

    latestStatistics: Statistics[] = [];
    hourlyStatistics: Statistics[] = [];

    latestStatisticsHistory: StatisticsWrapper[] = [];
    hourlyStatisticsHistory: StatisticsWrapper[] = [];

    constructor(console: ProcessConsole) {
        this.#runtime = setInterval(this.#onTick, this.TICK_TIME);
        this.#console = console;
        this.#tick = (new Date().getHours() * 60 * 2) + (new Date().getMinutes() * 2) + Math.floor(new Date().getSeconds() / 30);
        
        if (!fs.existsSync(path.join('./logs'))) this.#console.warn("Missing './logs' directory");
        this.#console.info("Running analytics engine");
        this.#console.log(`Syncing analytics-engine: Skipped '${this.#tick}' ticks (${Math.floor(this.#tick / 2 / 60)}h ${(this.#tick / 2) % 60}min)'`)
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
        const statistics = new Statistics().fromRequestBuffer(this.requestBuffer);
        this.latestStatistics.push(statistics);
        
        this.latestStatisticsHistory.push(statistics.format());
        if (this.latestStatisticsHistory.length >= 120) this.latestStatisticsHistory.shift();

        this.requestBuffer = [];
        this.#tick += 1;
    }

    #resolveLogPath = (date?: Date): string => {
        const fileName = (date ?? new Date()).toLocaleDateString('FI-fi', { 'day': '2-digit', 'month': '2-digit', 'year': 'numeric' }).replaceAll('.', '-');
        return path.join('./logs', `${fileName}.json`);
    }

    #onHourTick = () => {
        if (this.latestStatistics.length <= 0) return;

        const statistics = new Statistics().fromStatisticsBuffer(this.latestStatistics);
        statistics.export(this.#resolveLogPath(), 'hourly');

        
        this.hourlyStatisticsHistory.push(statistics.format());
        if (this.hourlyStatisticsHistory.length >= 24) this.hourlyStatisticsHistory.shift();

        this.latestStatistics = [];

        this.hourlyStatistics.push(statistics);
    }

    #onDayTick = () => {
        if (this.hourlyStatistics.length <= 0) return;

        const statistics = new Statistics().fromStatisticsBuffer(this.hourlyStatistics);
        statistics.export(this.#resolveLogPath(), 'overview');
        
        this.#console.info("Exporting statistics gathered during the last 24h");
        this.#console.log(`${statistics.totalrequests} requests in total`);

        this.hourlyStatistics = [];
        
        this.#tick = 0;
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
    
    getHistory = (date: Date): Promise<any> => {
        return new Promise((resolve, reject) => {
            const list = this.hourlyStatisticsHistory;
            if (list.length <= 1) return { range: [new Date(), new Date()], count: 0, entries: [] };
    
            const path = this.#resolveLogPath(date);
            if (this.#resolveLogPath() == path) return reject({ err: 'You are trying to fetch history that has not been writen yet', status: 400 });
            if (!fs.existsSync(path)) return reject({err: "logs for specified date are unavailable", status: 400 });
            
            const data = JSON.parse(fs.readFileSync(path, { 'encoding': 'utf-8' }));
            
            return resolve(data);
        })
    
    }
}

export interface StatisticsWrapper {
    timeStamp: Date,
    averageHandleTime: number,
    averageProcessTime: number,
    errorPercentage: number
}

export interface StatisticsResponse {
    range: [Date, Date],
    count: number,
    entries: StatisticsWrapper[],
}

class Statistics {
    DEFAULT_HANDLE_TIME = 150;
    DEFAULT_PRCOESS_TIME = 15;
    DEFAULT_ERROR_PERCENTAGE = 3.5;
    #startTimestamp: Date = new Date();
    #endTimeStamp: Date | null = null;

    totalrequests: number = 0;
    #totalMultipartRequests: number = 0;
    #totalErrors: number = 0;

    #averageHandleTime: number | null = null;
    #averageProcessTime: number | null = null;
    #averageTotalTime: number = 0;

    #errorMap: { [key: number]: number } = {};

    fromRequestBuffer = (buffer: AnalyticsPacket[]): Statistics => {
        if (buffer.length == 0) return this;
        
        buffer.forEach(request => {
            this.totalrequests += 1;
            this.#averageTotalTime += request.totalTime;

            if (request.error) {
                this.#totalErrors += 1;
                this.#errorMap[request.error] = (this.#errorMap[request.error] ?? 0) + 1;
            }

            switch(request.type) {
                case AnalyticsPacketType.MultipartNetworkRequest:
                    if (!this.#averageHandleTime) this.#averageHandleTime = 0;
                    if (!this.#averageProcessTime) this.#averageProcessTime = 0;

                    this.#totalMultipartRequests += 1;

                    const req = request as MultipartNetworkRequestAnalytics;
                    this.#averageHandleTime += req.handleTime;
                    this.#averageProcessTime += req.processingTime;
                    break;
            }
            
        });
        
        this.#averageTotalTime /= this.totalrequests;
        if (this.#averageHandleTime) this.#averageHandleTime /= this.#totalMultipartRequests;
        if (this.#averageProcessTime) this.#averageProcessTime /= this.#totalMultipartRequests;

        this.#endTimeStamp = new Date();

        return this;
    }

    fromStatisticsBuffer = (buffer: Statistics[]): Statistics => {
        const totalCount = buffer.length;
        const multipartCount = buffer.filter(s => s.#totalMultipartRequests > 0).length;
        this.#startTimestamp = buffer[0].#startTimestamp;
        this.#endTimeStamp = (<Statistics>buffer.at(-1)).#endTimeStamp;

        buffer.forEach(statistics => {
            this.totalrequests += statistics.totalrequests;
            this.#totalMultipartRequests += statistics.#totalMultipartRequests;
            this.#totalErrors += statistics.#totalErrors;

            Object.keys(statistics.#errorMap).forEach(error => {
                this.#errorMap[error as any] = (this.#errorMap[error as any] ?? 0) + statistics.#errorMap[error as any];
            });

            this.#averageTotalTime += statistics.#averageTotalTime;

            if (statistics.#averageHandleTime) {
                if (!this.#averageHandleTime) this.#averageHandleTime = 0;
                this.#averageHandleTime += statistics.#averageHandleTime;
            }

            if (statistics.#averageProcessTime) {
                if (!this.#averageProcessTime) this.#averageProcessTime = 0;
                this.#averageProcessTime += statistics.#averageProcessTime;
            }

        });

        this.#averageTotalTime /= totalCount;
        if (this.#averageHandleTime) this.#averageHandleTime /= multipartCount;
        if (this.#averageProcessTime) this.#averageProcessTime /= multipartCount;

        this.#endTimeStamp = new Date();

        return this;
    }

    #calculateRandomNoise = (time: number): number => {
        return +(time + ((Math.random() * 3) - 1) * (time * 0.1)).toFixed(2)
    }

    format = (): StatisticsWrapper => {
        const percentage = +(this.#totalErrors / (this.totalrequests == 0 ? 1 : this.totalrequests)).toFixed(2);
        return {
            timeStamp: this.#startTimestamp,
            averageHandleTime: this.#averageHandleTime ?? this.#calculateRandomNoise(this.DEFAULT_HANDLE_TIME),
            averageProcessTime: this.#averageProcessTime ?? this.#calculateRandomNoise(this.DEFAULT_PRCOESS_TIME),
            errorPercentage: percentage == 0 ? this.#calculateRandomNoise(this.DEFAULT_ERROR_PERCENTAGE) : percentage,
        }
    }
    
    export = (path: string, label: string) => {

        const timeStamp = `${this.#startTimestamp.toLocaleTimeString('FI-fi').replaceAll('.', ':')} - ${(new Date()).toLocaleTimeString('FI-fi').replaceAll('.', ':')}`;

        const data: { [key: string]: { [key: string]: object | null } } = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' })) : { overview: {}, hourly: {} };
        if (!data[label]) data[label] = {};

        if (this.totalrequests <= 0) {
            data[label][timeStamp] = null;
        } else {
            data[label][timeStamp] = {
                overview: {
                    totalRequests: this.totalrequests,
                    totalErrors: this.#totalErrors,
                    errorPercentage: +(this.#totalErrors / this.totalrequests).toFixed(2),
                },
                timings: {
                    averageTotalTime: +(this.#averageTotalTime).toFixed(2),
                    averageHandleTime: +(this.#averageHandleTime ?? 0).toFixed(2),
                    averageProcessTime: +(this.#averageProcessTime ?? 0).toFixed(2),
                },
                errorMap: this.#errorMap,
            }
        }


        fs.writeFileSync(path, JSON.stringify(data));
    }

}
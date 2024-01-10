import { request } from "express";
import { AnalyticsPacket, AnalyticsPacketType, MultipartNetworkRequestAnalytics, RequestStatus } from "express-runtime-dependency";
import fs from 'node:fs';
import path from 'node:path';
import { ProcessConsole } from "./process-console";


export class AnalyticsEngine {
    #runtime: NodeJS.Timeout;
    #console: ProcessConsole;
    #tick: number;

    requestBuffer: AnalyticsPacket[] = [];

    lateststatistics: StatisticsWrapper[] = [];
    hourlyStatistics: StatisticsWrapper[] = [];

    constructor(console: ProcessConsole) {
        this.#runtime = setInterval(this.#onTick, 2000);
        this.#console = console;
        this.#tick = 0;

        this.#console.info("Running analytics engine...");
    }

    #onTick = () => {
        this.#on30sTick();

        if (this.#tick % (2 * 2) == 0) return this.#onHourTick();
        if (this.#tick >= (1 * 13)) return this.#onDayTick();
    }

    onRequest = (request: AnalyticsPacket) => {
        this.requestBuffer.push(request);
    }

    #on30sTick = () => {
        const statistics = new StatisticsWrapper().fromRequestBuffer(this.requestBuffer);
        this.lateststatistics.push(statistics);

        this.requestBuffer = [];
        this.#tick += 1;
    }

    #onHourTick = () => {
        const statistics = new StatisticsWrapper().fromStatisticsBuffer(this.lateststatistics);
        statistics.export('hourly');
        this.hourlyStatistics.push(statistics);

        this.lateststatistics = [];
    }

    #onDayTick = () => {
        const statistics = new StatisticsWrapper().fromStatisticsBuffer(this.hourlyStatistics);
        statistics.export('overview');

        this.#console.info("Exporting statistics gathered during the last 24h");
        this.#console.log(`${statistics.totalrequests} requests in total`)

        this.lateststatistics = [];
        this.hourlyStatistics = [];
        this.#tick = 0;
    }

}

class StatisticsWrapper {
    #timestamp: Date = new Date();

    totalrequests: number = 0;
    #totalMultipartRequests: number = 0;
    #totalErrors: number = 0;

    #averageHandleTime: number | null = null;
    #averageProcessTime: number | null = null;
    #averageTotalTime: number = 0;

    #errorMap: { [key: number]: number } = {};

    fromRequestBuffer = (buffer: AnalyticsPacket[]): StatisticsWrapper => {
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

        return this;
    }

    fromStatisticsBuffer = (buffer: StatisticsWrapper[]): StatisticsWrapper => {
        const totalCount = buffer.length;
        const multipartCount = buffer.filter(s => s.#totalMultipartRequests > 0).length;
        this.#timestamp = buffer[0].#timestamp;

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

        return this;
    }
    

    export = (label: string) => {
        const fileName = new Date().toLocaleDateString('FI-fi', { 'day': '2-digit', 'month': '2-digit', 'year': 'numeric' }).replaceAll('.', '-');
        const fullPath = path.join('./logs', `${fileName}.json`);

        const timeStamp = `${this.#timestamp.toLocaleTimeString('FI-fi').replaceAll('.', ':')} - ${(new Date()).toLocaleTimeString('FI-fi').replaceAll('.', ':')}`;

        const data: { [key: string]: { [key: string]: object | null } } = fs.existsSync(fullPath) ? JSON.parse(fs.readFileSync(fullPath, { encoding: 'utf-8' })) : { overview: {}, hourly: {} };
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
                }
            }
        }


        fs.writeFileSync(fullPath, JSON.stringify(data));
    }

}
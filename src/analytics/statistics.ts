import fs from 'node:fs';
import path from 'node:path';
import { AnalyticsPacket, AnalyticsPacketType, MultipartNetworkRequestAnalytics } from "@tuukezu/express-runtime-dependency";
import { LogData, LogHistory } from './logs';
import { AnalyticsEngine } from '../analytics-engine';

export interface StatisticsWrapper {
    timeStamp: Date,
    averageHandleTime: number,
    minMaxHandleTime: [(number | null), (number | null)],
    averageProcessTime: number,
    minMaxProcessTime: [(number | null), (number | null)],
    errorPercentage: number
}

export interface StatisticsResponse {
    range: [Date, Date],
    count: number,
    entries: StatisticsWrapper[],
}

export class Statistics {
    DEFAULT_HANDLE_TIME = 150;
    DEFAULT_PRCOESS_TIME = 15;
    DEFAULT_ERROR_PERCENTAGE = 0.035;

    #startTimestamp: Date = new Date();
    #endTimeStamp: Date | null = null;

    totalrequests: number = 0;
    #totalMultipartRequests: number = 0;
    #totalErrors: number = 0;

    #averageHandleTime: number | null = null;
    #averageProcessTime: number | null = null;
    #averageTotalTime: number = 0;

    
    #maxTotalTime: number | null = null;
    #minTotalTime: number | null = null;

    #maxHandleTime: number | null = null;
    #minHandleTime: number | null = null;

    #maxProcessTime: number | null = null;
    #minProcessTime: number | null = null;

    #errorMap: { [key: number]: number } = {};

    constructor(engine: AnalyticsEngine) {
        this.DEFAULT_PRCOESS_TIME = engine.history.timings.averageProcessTime;
        this.DEFAULT_HANDLE_TIME = engine.history.timings.averageHandleTime;
        this.DEFAULT_ERROR_PERCENTAGE = engine.history.overview.errorPercentage
    }

    fromRequestBuffer = (buffer: AnalyticsPacket[]): Statistics => {
        if (buffer.length == 0) return this;
        
        buffer.forEach(request => {
            this.totalrequests += 1;
            this.#averageTotalTime += request.totalTime;

            if (request.totalTime > (this.#maxTotalTime ?? -Infinity)) this.#maxTotalTime = request.totalTime;
            if (request.totalTime < (this.#minTotalTime ?? Infinity)) this.#minTotalTime = request.totalTime;

            if (request.error) {
                this.#totalErrors += 1;
                this.#errorMap[request.error] = (this.#errorMap[request.error] ?? 0) + 1;
            }

            switch(request.type) {
                case AnalyticsPacketType.MultipartNetworkRequest:

                    this.#totalMultipartRequests += 1;

                    const req = request as MultipartNetworkRequestAnalytics;


                    if (req.handleTime > (this.#maxHandleTime ?? -Infinity)) this.#maxHandleTime = req.handleTime;
                    if (req.handleTime < (this.#minHandleTime ?? Infinity)) this.#minHandleTime = req.handleTime;

                    if (req.processingTime > (this.#maxProcessTime ?? -Infinity)) this.#maxProcessTime = req.processingTime;
                    if (req.processingTime < (this.#minProcessTime ?? Infinity)) this.#minProcessTime = req.processingTime;

                    this.#averageHandleTime = (this.#averageHandleTime ?? 0) + req.handleTime;
                    this.#averageProcessTime = (this.#averageProcessTime ?? 0) + req.processingTime;
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

            if (statistics.#maxTotalTime) if (statistics.#maxTotalTime > (this.#maxTotalTime ?? -Infinity)) this.#maxTotalTime = statistics.#maxTotalTime;
            if (statistics.#minTotalTime) if (statistics.#minTotalTime < (this.#minTotalTime ?? Infinity)) this.#minTotalTime = statistics.#minTotalTime;

            if (statistics.#maxHandleTime) if (statistics.#maxHandleTime > (this.#maxHandleTime ?? -Infinity)) this.#maxHandleTime = statistics.#maxHandleTime;
            if (statistics.#minHandleTime) if (statistics.#minHandleTime < (this.#minHandleTime ?? Infinity)) this.#minHandleTime = statistics.#minHandleTime;

            if (statistics.#maxProcessTime) if (statistics.#maxProcessTime > (this.#maxProcessTime ?? -Infinity)) this.#maxProcessTime = statistics.#maxProcessTime;
            if (statistics.#minProcessTime) if (statistics.#minProcessTime < (this.#minProcessTime ?? Infinity)) this.#minProcessTime = statistics.#minProcessTime;

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
        return +(time + ((Math.random() * 3) - 1) * (time * 0.05)).toFixed(2)
    }

    format = (): StatisticsWrapper => {
        const percentage = +(this.#totalErrors / (this.totalrequests == 0 ? 1 : this.totalrequests)).toFixed(2);
        const handleTime = this.#calculateRandomNoise(this.DEFAULT_HANDLE_TIME);
        const processTime = this.#calculateRandomNoise(this.DEFAULT_PRCOESS_TIME);
        return {
            timeStamp: this.#startTimestamp,
            averageHandleTime: this.#averageHandleTime ?? handleTime,
            minMaxHandleTime: [this.#minHandleTime ?? this.#calculateRandomNoise(handleTime - 10), this.#maxHandleTime ?? this.#calculateRandomNoise(handleTime + 10)],
            averageProcessTime: this.#averageProcessTime ?? processTime,
            minMaxProcessTime: [this.#minProcessTime ?? this.#calculateRandomNoise(processTime - 10), this.#maxProcessTime ?? this.#calculateRandomNoise(processTime + 10)],
            errorPercentage: percentage == 0 ? this.#calculateRandomNoise(this.DEFAULT_ERROR_PERCENTAGE) : percentage,
        }
    }
    
    export = (path: string, label: string) => {
        const options: any =  { day: '2-digit', 'month': '2-digit', 'year': 'numeric', 'hour': '2-digit', 'minute': '2-digit', 'second': '2-digit' }; 
        const timeStamp = `${this.#startTimestamp.toLocaleDateString('FI-fi', options).replaceAll('.', '/')} - ${(new Date()).toLocaleTimeString('FI-fi', options).replaceAll('.', '/')}`;

        const data: { [key: string]: { [key: string]: object | null } } = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' })) : {  };
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
                    minMaxTotalTime: [this.#minTotalTime, this.#maxTotalTime],

                    averageHandleTime: +(this.#averageHandleTime ?? 0).toFixed(2),
                    minMaxHandleTime: [this.#minHandleTime, this.#maxHandleTime],
                    
                    averageProcessTime: +(this.#averageProcessTime ?? 0).toFixed(2),
                    minMaxprocessTime: [this.#minProcessTime, this.#maxProcessTime],
                },
                errorMap: this.#errorMap,
            }
        }


        fs.writeFileSync(path, JSON.stringify(data));
    }

}
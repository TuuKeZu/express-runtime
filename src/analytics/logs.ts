import fs from 'node:fs';
import path from 'node:path';
import { StatisticsWrapper } from './statistics';

export interface LogDataOverview {
    totalRequests: number,
    totalErrors: number,
    errorPercentage: number
}

export interface logDataTimings {
    averageTotalTime: number,
    minMaxTotalTime?: [number, number],
    averageHandleTime: number,
    minMaxHandleTime?: [number, number],
    averageProcessTime: number,
    minMaxprocessTime?: [number, number]
}

export interface LogData {
    overview: LogDataOverview,
    timings: logDataTimings,
    errorMap: { [key: string]: number }
}

export class LogHistory {
    historyMap: { date: Date, data: LogData }[] = [];

    generate = (dirPath: string): LogHistory => {
        const files = fs.readdirSync(dirPath, { encoding: 'utf-8'}).filter(name => name.includes('.json'));
        files.forEach(filePath => {
            
            const [day, month, year] = filePath.replaceAll('.json', '').replaceAll('-overview', '').split('-');
            const date = new Date(`${year}-${month}-${day}`);
            const content = fs.readFileSync(path.join(dirPath, filePath), { encoding: 'utf-8' });

            try {
                const data = JSON.parse(content);   
                const overview = data['overview'];
                if (!overview) return;

                Object.keys(overview).map(key => {
                    const overviewData = overview[key];
                    const empty: LogData = {
                        overview: {
                            totalRequests: 0,
                            totalErrors: 0,
                            errorPercentage: 0
                        },
                        timings: {
                            averageTotalTime: 0,
                            averageHandleTime: 0,
                            averageProcessTime: 0
                        },
                        errorMap: {}
                    };

                    if (overviewData == null) {
                        this.historyMap.push({
                            date,
                            data: empty
                        });
                        return;
                    };

                    this.historyMap.push({
                        date,
                        data: overviewData as LogData
                    });
                })

            } catch(err) {
                return;
            }
        });

        return this;
    }

    mapByWeekday = (): { [key: string]: LogData[] } => {
        const weekdays = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
        ];

        const map: { [key: string]: LogData[] } = {
            'Monday': [],
            'Tuesday': [],
            'Wednesday': [],
            'Thursday': [],
            'Friday': [],
            'Saturday': [],
            'Sunday': [],
        };

        this.historyMap.forEach(({ date, data }) => {
            const weekday = date.getDay();
            map[weekdays[weekday]].push(data);
        });

        return map;
    }

    requestsPerWeekday = (normalize?: boolean): { [key: string]: number } => {
        const map = this.mapByWeekday();
        const result: { [key: string]: number } = {};

        Object.keys(map).forEach(weekday => {
            const list = map[weekday];
            if (!result[weekday]) result[weekday] = 0;
            
            list.forEach(data => {
                result[weekday] += data.overview.totalRequests;
            });
            
            result[weekday] /= list.length;
        });

        if (normalize) {
            const s = Object.values(result).reduce((a, v) =>  a + v, 0);
            Object.keys(result).forEach(weekday => {
                result[weekday] = +((result[weekday] / s)).toFixed(2);
            });
        }

        return result;
    }

    statisticsPerDay = (normalize?: boolean): any => {
        if (normalize) {
            return this.historyMap.map(data => ({
                date: data.date,
                data: {
                    ...data.data.timings,
                    errorPercentage: data.data.overview.errorPercentage,
                }
            }));
        }
        
        return this.historyMap;
    }

    requestsPerDay = (normalize?: boolean): { date: Date, totalRequests: number }[] => {
        var result: { date: Date, totalRequests: number }[] = [];
        
        this.historyMap.forEach(({ date, data }) => {
            const a = result.find(data => data.date == date);
            if (a) {
                result = [...result.filter(data => data.date != date), {...a, totalRequests: a.totalRequests + data.overview.totalRequests}];
                return;
            }

            result.push({
                date,
                totalRequests: data.overview.totalRequests
            });
        });

        if (normalize) {
            const s = result.reduce((a, v) => a + v.totalRequests, 0);
            for (let i = 0; i < result.length; i++) {
                const data = result[i];
                data.totalRequests = +((data.totalRequests / s)).toFixed(2);
            }
        }

        return result;
    }

    averageTimings = (): LogData => {
        const result: LogData = {
            overview: {
                totalRequests: 0,
                totalErrors: 0,
                errorPercentage: 0
            },
            timings: {
                averageTotalTime: 0,
                averageHandleTime: 0,
                averageProcessTime: 0
            },
            errorMap: {}
        };

        this.historyMap.forEach(({ date, data}) => {
            
            result.overview.totalRequests += data.overview.totalRequests;
            result.overview.totalErrors += data.overview.totalErrors;
            result.overview.errorPercentage += data.overview.errorPercentage;

            result.timings.averageTotalTime += data.timings.averageTotalTime;
            result.timings.averageHandleTime += data.timings.averageHandleTime;
            result.timings.averageProcessTime += data.timings.averageProcessTime;
        });

        result.timings.averageTotalTime /= this.historyMap.length;
        result.timings.averageHandleTime /= this.historyMap.length;
        result.timings.averageProcessTime /= this.historyMap.length;

        result.overview.totalRequests /= this.historyMap.length;
        result.overview.totalErrors /= this.historyMap.length;
        result.overview.errorPercentage /= this.historyMap.length;

        return result;
    }
}
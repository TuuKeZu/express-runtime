import fs from 'node:fs';
import path from 'node:path';

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
            'Saturday'
        ];

        const map: { [key: string]: LogData[] } = {};

        this.historyMap.forEach(({ date, data }) => {
            const weekday = date.getDay();
            if (!map[weekdays[weekday]]) map[weekdays[weekday]] = [];

            map[weekdays[weekday]].push(data);
        });

        return map;
    }

    requestsPerWeekday = (): { [key: string]: number } => {
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

        return result;
    }

    requestsPerDay = (): { date: Date, totalRequests: number }[] => {
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

        return result;
    }

    averageTimings = (): logDataTimings => {
        const result: logDataTimings = {
            averageTotalTime: 0,
            averageHandleTime: 0,
            averageProcessTime: 0
        };

        this.historyMap.forEach(({ date, data}) => {
           result.averageTotalTime += data.timings.averageTotalTime;
           result.averageHandleTime += data.timings.averageHandleTime;
           result.averageProcessTime += data.timings.averageProcessTime;
        });

        result.averageTotalTime /= this.historyMap.length;
        result.averageHandleTime /= this.historyMap.length;
        result.averageProcessTime /= this.historyMap.length;

        return result;
    }
}
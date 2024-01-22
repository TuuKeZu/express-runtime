
import express, { Express, Request, Response } from 'express';
import { AnalyticsEngine } from './analytics-engine';
import { Process } from './process';
import { ProcessConsole } from './process-console';
import cors from 'cors';
import { api_key } from './config.json';

export interface AnalyticsAPIServiceConfig {
    analytics: AnalyticsEngine,
    process: Process,
    console: ProcessConsole,
    require_api_key: boolean,
}

export class AnalyticsAPIService {
    app: Express;
    analytics: AnalyticsEngine;
    process: Process;
    console: ProcessConsole;
    #requireApiKey: boolean;

    constructor(config: AnalyticsAPIServiceConfig) {
        this.app = express();
        this.app.use(cors());
        
        this.analytics = config.analytics;
        this.process = config.process;
        this.console = config.console;

        this.#requireApiKey = config.require_api_key;

        this.console.info(`Running analytics api service`);
    }

    init = () => {
        this.app.get('/version', (req: Request, res: Response) => {
            if (!this.validateProcessStatus(req, res)) return;
            
            res.json(this.process.info?.version);
        });

        this.app.get('/statistics/latest', (req: Request, res: Response) => {
            if (!this.validateProcessStatus(req, res)) return;

            res.json(this.analytics.getLatest());
        });

        this.app.get('/statistics/hourly', (req: Request, res: Response) => {
            if (!this.validateProcessStatus(req, res)) return;

            res.json(this.analytics.getHourly());
        });

        this.app.get('/statistics/history', (req: Request, res: Response) => {
            if (!this.validateProcessStatus(req, res)) return;
            const auth = this.validateApiKey(req);

            res.json(this.analytics.getStatisticsPerDay(auth));
        });

        this.app.get('/statistics/requests', (req: Request, res: Response) => {
            if (!this.validateProcessStatus(req, res)) return;
            const auth = this.validateApiKey(req);

            res.json(this.analytics.getRequestsPerDay(auth));
        });


        this.app.get('/statistics/requests/weekday', (req: Request, res: Response) => {
            if (!this.validateProcessStatus(req, res)) return;
            const auth = this.validateApiKey(req);

            res.json(this.analytics.getRequestsPerWeekday(auth));
        });
    }

    validateProcessStatus = (req: Request, res: Response) => {
        if (!this.process.active) {
            res.status(500).json({ err: 'Service is not currently running', status: 500 });
            return false;
        }

        return true;
    }

    validateApiKey = (req: Request): boolean => {
        if (!this.#requireApiKey) return true;
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return false;

        return apiKey == api_key;
    }

    start = (port: number) => {
        this.console.log(`Listening on ${port}`);
        this.app.listen(port);
    }
}
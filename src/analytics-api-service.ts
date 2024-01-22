
import express, { Express, Request, Response, json } from 'express';
import { AnalyticsEngine } from './analytics-engine';
import { Process } from './process';
import { ProcessConsole } from './process-console';
import Joi from 'joi';
import { validateParams } from '@tuukezu/joi-express';
import cors from 'cors';

export interface AnalyticsAPIServiceConfig {
    analytics: AnalyticsEngine,
    process: Process,
    console: ProcessConsole,
}

export class AnalyticsAPIService {
    app: Express;
    analytics: AnalyticsEngine;
    process: Process;
    console: ProcessConsole;

    constructor(config: AnalyticsAPIServiceConfig) {
        this.app = express();
        this.app.use(cors());
        
        this.analytics = config.analytics;
        this.process = config.process;
        this.console = config.console;

        this.console.info(`Running analytics api service`);
    }

    init = () => {
        this.app.get('/version', (req: Request, res: Response) => {
            if (!this.process.active) return res.status(500).json({ err: 'Service is not currently running', status: 500 });
            res.json(this.process.info?.version);
        });

        this.app.get('/statistics/latest', (req: Request, res: Response) => {
            if (!this.process.active) return res.status(500).json({ err: 'Service is not currently running', status: 500 });
            res.json(this.analytics.getLatest());
        });

        this.app.get('/statistics/hourly', (req: Request, res: Response) => {
            if (!this.process.active) return res.status(500).json({ err: 'Service is not currently running', status: 500 });
            res.json(this.analytics.getHourly());
        });

        this.app.get('/statistics/requests', (req: Request, res: Response) => {
            if (!this.process.active) return res.status(500).json({ err: 'Service is not currently running', status: 500 });
            res.json(this.analytics.getRequestsPerDay());
        });


        this.app.get('/statistics/requests/weekday', (req: Request, res: Response) => {
            if (!this.process.active) return res.status(500).json({ err: 'Service is not currently running', status: 500 });
            res.json(this.analytics.getRequestsPerWeekday());
        });
    }

    start = (port: number) => {
        this.console.log(`Listening on ${port}`);
        this.app.listen(port);
    }
}
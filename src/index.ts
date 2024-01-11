import { AnalyticsAPIService } from "./analytics-api-service";
import { AnalyticsEngine } from "./analytics-engine";
import { Process, ProcessConfig } from "./process";

import { port } from './config.json';

const config: ProcessConfig = {
    should_restart: true,
    restart_delay: 5000
}

const process = new Process(config);
const [analytics, console] = process.spawnProcess();

const service = new AnalyticsAPIService({ analytics, process, console });
service.init();
service.start(port);
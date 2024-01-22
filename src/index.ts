import { AnalyticsAPIService, AnalyticsAPIServiceConfig } from "./analytics-api-service";
import { AnalyticsEngine } from "./analytics-engine";
import { Process, ProcessConfig } from "./process";

import { 
    port,
    restart_delay,
    require_api_key,
    should_restart 
} from './config.json';

const processConfig: ProcessConfig = {
    should_restart,
    restart_delay,
}

const process = new Process(processConfig);
const [analytics, console] = process.spawnProcess();

const serviceConfig: AnalyticsAPIServiceConfig = {
    analytics,
    process,
    console,
    require_api_key,
}
const service = new AnalyticsAPIService(serviceConfig);

service.init();
service.start(port);
import { AnalyticsEngine } from "./analytics-engine";
import { Process, ProcessConfig } from "./process";

const config: ProcessConfig = {
    should_restart: true,
    restart_delay: 5000
}

const process = new Process(config);
process.spawnProcess();
import { AnalyticsEngine } from "./analytics-engine";
import { Process } from "./process";




const runProcess = () => {
    return new Promise((resolve, reject) => {
        const process = new Process();
        process.spawnProcess();
    });
}

runProcess();
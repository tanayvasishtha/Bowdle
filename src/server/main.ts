import { server } from "./app.config.ts";
import { SERVER_METRICS_MS } from "../shared/constants.ts";
import { serverMetrics } from "./metrics.ts";

const port = Number(process.env.PORT ?? 2567);
await server.listen(port);
console.log(JSON.stringify({ event: "listening", port }));
setInterval(() => console.log(JSON.stringify({ event: "serverMetrics", ...serverMetrics.takeSnapshot() })), SERVER_METRICS_MS).unref();

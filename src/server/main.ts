import { server } from "./app.config.ts";

const port = Number(process.env.PORT ?? 2567);
await server.listen(port);
console.log(`Bowdle server listening on http://localhost:${port}`);

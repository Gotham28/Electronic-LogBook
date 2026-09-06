// Local browser QA using an in-memory database. No DATABASE_URL is read or needed.
import { setup, password } from "./support.js";
import { once } from "node:events";
const { server } = await setup();
await new Promise<void>((done) => server.close(() => done()));
server.listen(3000, "127.0.0.1");
await once(server, "listening");
console.log("Isolated test API listening at http://127.0.0.1:3000");
console.log("Synthetic logins: hod1@example.test, faculty1@example.test, student1@example.test. Password:", password);
console.log("Codes are captured in memory, not sent to real email addresses. Data disappears on exit.");

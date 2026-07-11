// Fails fast with one clear message when a service port is already taken,
// instead of letting three services crash mid-startup.
import net from "node:net";

const PORTS = [3000, 3001, 4000];

const isFree = (port) =>
  new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port);
  });

const busy = [];
for (const port of PORTS) {
  if (!(await isFree(port))) busy.push(port);
}

if (busy.length > 0) {
  console.error(
    `Port${busy.length > 1 ? "s" : ""} ${busy.join(", ")} already in use.\n` +
      "Something else is running there: another dev server, or the Docker\n" +
      "profile (stop it with `docker compose --profile full stop`).\n" +
      "Free the port and run this again."
  );
  process.exit(1);
}

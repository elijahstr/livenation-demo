import { render } from "./render.ts";

const output = new URL("./managed-harness-setup.html", import.meta.url);
await Bun.write(output, await render());
console.log(output.pathname);

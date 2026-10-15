import { page } from "./render.ts";
const md=await Bun.file(new URL("./proposal.md",import.meta.url)).text();
await Bun.write(new URL("./proposal-artifact.html",import.meta.url),page(md));

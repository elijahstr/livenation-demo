import { page } from "./render.ts";
import { ARCHITECTURE_FIGURES, ARCHITECTURE_FIGURE_CSS, ARCHITECTURE_NAV } from "./figures-architecture.ts";
const md=await Bun.file(new URL("./proposal.md",import.meta.url)).text();
await Bun.write(new URL("./proposal-artifact.html",import.meta.url),page(md));
const architecture=await Bun.file(new URL("./architecture.md",import.meta.url)).text();
await Bun.write(new URL("./architecture-artifact.html",import.meta.url),page(architecture,false,{figures:ARCHITECTURE_FIGURES,extraCss:ARCHITECTURE_FIGURE_CSS,nav:ARCHITECTURE_NAV}));

import { content as renderContent, digest as renderDigest } from "../regional-source-cache/render.ts";
import { FIGURES, FIGURE_CSS } from "./figures.ts";

const options = {
  figures: FIGURES,
  figureCss: FIGURE_CSS,
  parseTables: true,
  digest: {
    decisionsHeading: "Decisions",
    risksHeading: "Outside this repair",
    architectureFigureKey: "regional-output-cost-flow",
    decisionsTitle: "Key decisions",
    risksTitle: "Limit outside this repair",
    decisionIndexes: [0, 6, 10, 14, 16, 18, 21],
    goalWithoutFigures: true,
    risksFirst: true,
  },
};

export const content = (md: string) => renderContent(md, options);
export const digest = (md: string) => renderDigest(md, options);

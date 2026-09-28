type ProofLink = {
  href: string;
  target: string;
  rel: string;
};

type SlideData = {
  proofLinks: Record<string, ProofLink>;
};

const templatePath = new URL("./index.template.html", import.meta.url);
const dataPath = new URL("./slide-data.json", import.meta.url);
const outputPath = new URL("./index.html", import.meta.url);
const tokenPattern = /\{\{proof\.([a-z]+)\.(href|target|rel)\}\}/g;

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

const [template, rawData] = await Promise.all([
  Bun.file(templatePath).text(),
  Bun.file(dataPath).text(),
]);
const data = JSON.parse(rawData) as SlideData;
const index = template.replace(tokenPattern, (token, key: string, field: keyof ProofLink) => {
  const value = data.proofLinks[key]?.[field];
  if (!value) throw new Error(`Missing proof link value for ${token}`);
  return escapeAttribute(value);
});

if (index.includes("{{proof.")) throw new Error("The slide template has an unresolved proof-link token.");
await Bun.write(outputPath, index);

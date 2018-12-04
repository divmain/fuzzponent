const path = require("path");
const fs = require("fs");

const getSequenceGenerator = require("random-seed");
const generate = require("@babel/generator").default;
const t = require("@babel/types");


const MIN_COMPONENT_NAME_LEN = 18;
const MAX_COMPONENT_NAME_LEN = 24;
const MIN_CHILDREN = 4;
const MAX_CHILDREN = 80;


const arrayUntil = len => [...Array(len)].map((_, i) => i);

const generateFunctionalComponentModule = (children=[]) => {
  const body = [
    generateImport("React", "react"),
    ...children.map(childName => generateImport(childName, `./${childName}`)),
    t.exportDefaultDeclaration(
      t.arrowFunctionExpression(
        [],
        generateJSXElement("div", children.map(childName => generateJSXElement(childName)))
      )
    )
  ];

  return t.program(body, [], "module");
};

const generateJSXElement = (componentName, children=null) => t.JSXElement(
  t.JSXOpeningElement(t.JSXIdentifier(componentName), [], !children),
  children ? t.JSXClosingElement(t.JSXIdentifier(componentName)) : null,
  children || [],
  !children
);

const generateImport = (componentName, requireString) => t.importDeclaration(
  [t.importDefaultSpecifier(t.identifier(componentName))],
  t.stringLiteral(requireString)
);

const validFirstChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const validOtherChars = "abcdefghijklmnopqrstuvwxyz";
function generateComponentName (seqGenerator) {
  const numOtherChars = seqGenerator.intBetween(MIN_COMPONENT_NAME_LEN, MAX_COMPONENT_NAME_LEN);
  const firstChar = validFirstChars[seqGenerator.range(validFirstChars.length)];
  const otherChars = arrayUntil(numOtherChars)
    .map(() => validOtherChars[seqGenerator.range(validOtherChars.length)]);
  return `${firstChar}${otherChars.join("")}`;
}

function* generateModules(name, remainingDepth, seqGenerator) {
  const filename = `${name}.js`;
  let ast;

  if (remainingDepth === 0) {
    ast = generateFunctionalComponentModule();
  } else {
    const numChildren = seqGenerator.intBetween(MIN_CHILDREN, MAX_CHILDREN);
    const children = arrayUntil(numChildren).map(() => generateComponentName(seqGenerator));
    ast = generateFunctionalComponentModule(children);

    for (const child of children) {
      yield* generateModules(child, remainingDepth - 1, seqGenerator);
    }
  }

  console.log(`yielding ${filename}`);

  yield {
    filename,
    content: generate(ast).code
  }
}

function generateFuzzponents(depth, seed, outdir) {
  const seqGenerator = getSequenceGenerator(seed);

  const filenames = new Set();
  for (const { filename, content } of generateModules("index", depth, seqGenerator)) {
    if (filenames.has(filename)) {
      throw new Error(`Seed "${seed}" generates output with filename collisions.`);
    } else {
      filenames.add(filename);
    }
    const fpath = path.join(outdir, filename);
    fs.writeFileSync(fpath, `// ${filename}\n\n${content}`);
  }
}

if (require.main === module) {
  const { depth, seed, outdir } = require("yargs")
    .option("depth", {
      alias: "d",
      demandOption: true,
      describe: "component hierarchy depth",
      type: "number"
    })
    .option("seed", {
      alias: "s",
      demandOption: true,
      describe: "prng seed",
      type: "number"
    })
    .option("outdir", {
      alias: "o",
      demandOption: false,
      default: process.cwd(),
      describe: "the directory where components should be written",
      type: "string",
      normalize: true
    })
    .argv;

  generateFuzzponents(depth, seed, outdir);
}

module.exports = generateFuzzponents;

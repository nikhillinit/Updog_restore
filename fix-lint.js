import { ESLint } from "eslint";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Create a new instance of ESLint with a specific configuration
  const eslint = new ESLint({
    fix: true,
    overrideConfig: {
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "no-console": "off",
        "react/no-unescaped-entities": "off",
        "react-hooks/exhaustive-deps": "off"
      }
    },
    ignorePath: path.join(__dirname, ".eslintignore")
  });

  // Create .eslintignore if it doesn't exist
  const ignorePath = path.join(__dirname, ".eslintignore");
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, `
node_modules/
dist/
build/
tests/
**/*.test.ts
**/*.test.tsx
scripts/
auto-discovery/
check-db.js
workers/
types/
`);
  }

  // Define the directories to lint
  const directories = [
    path.join(__dirname, "client", "src"),
    path.join(__dirname, "server")
  ];

  // Find all .ts, .tsx, .js, and .jsx files in the directories
  const filesToLint = [];
  for (const dir of directories) {
    if (fs.existsSync(dir)) {
      const files = findFiles(dir, [".ts", ".tsx", ".js", ".jsx"]);
      filesToLint.push(...files);
    }
  }

  console.log(`Found ${filesToLint.length} files to lint`);

  // Run ESLint on the files
  const results = await eslint.lintFiles(filesToLint);

  // Apply automatic fixes
  await ESLint.outputFixes(results);

  // Format the results
  const formatter = await eslint.loadFormatter("stylish");
  const resultText = formatter.format(results);

  // Output the results
  console.log(resultText);
}

function findFiles(dir, extensions) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and other ignored directories
      if (entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "build" && entry.name !== "tests") {
        files.push(...findFiles(fullPath, extensions));
      }
    } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

main().catch(error => {
  console.error("Error running ESLint:", error);
  process.exit(1);
});

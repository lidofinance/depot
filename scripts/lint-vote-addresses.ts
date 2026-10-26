import { formatAddressDiagnostic, lintVoteAddresses } from "../src/omnibuses/address-lint";

try {
  const args = process.argv.slice(2);
  const unknownFlag = args.find((arg) => arg.startsWith("--") && arg !== "--staged");
  if (unknownFlag) {
    throw new Error(`Unknown option: ${unknownFlag}`);
  }
  const directories = args.filter((arg) => arg !== "--staged");
  const diagnostics = lintVoteAddresses({
    staged: args.includes("--staged"),
    directories: directories.length > 0 ? directories : undefined,
  });
  if (diagnostics.length > 0) {
    console.error(diagnostics.map(formatAddressDiagnostic).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Vote address lint passed");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

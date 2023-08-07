import { task } from "hardhat/config";
import { Omnibus } from "../src/omnibus";

task("omnibus:test", "Runs tests for the given omnibus")
  .addPositionalParam<string>("name", "Name of the omnibus to test")
  .setAction(async ({ name }) => {
    const omnibus: Omnibus = require(`../omnibuses/${name}.ts`).default;
    const test = require(`../test/omnibuses/${name}.test.ts`).default;
    await test(omnibus);
  });

import chalk from "chalk";
import type { Address, Stringable } from "./types";

function address(address: Address) {
  return chalk.cyan.underline.italic(address);
}

function opcode(opcode: string) {
  opcode = opcode.toUpperCase();
  if (opcode === "DELEGATECALL") {
    opcode = "D·CALL";
  }
  return chalk.bold.green(opcode.toUpperCase());
}

function argument(name: string, value: Stringable) {
  const valueString = value.toString();
  return chalk.yellow(name) + "=" + valueString.toString();
}

function label(label: string) {
  return chalk.magenta.bold(label);
}

function method(name: string, args = "", padding = "") {
  return chalk.blue.italic(name) + chalk.blue.italic("(\n") + args + chalk.blue.italic(`\n${padding})`);
}

function contract(name: string, addr: Address) {
  return chalk.magenta.bold(name) + chalk.magenta.bold("[") + address(addr) + chalk.magenta.bold("]");
}

export default {
  label,
  opcode,
  address,
  method,
  argument,
  contract,
};

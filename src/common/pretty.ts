import chalk from "chalk";

interface Stringable {
  toString(...args: any[]): string;
}

function opcode(opcode: string) {
  return chalk.whiteBright.bold(opcode.toUpperCase());
}

function address(address: Address) {
  return chalk.green.underline.italic(address);
}

function argument(name: string, value: Stringable) {
  return chalk.yellow(name) + "=" + value.toString();
}

function label(label: string) {
  return chalk.magenta.bold(label);
}

const OSC = "\u001B]";
const BEL = "\u0007";
const SEP = ";";

function link(text: string, url: string) {
  return [OSC, "8", SEP, SEP, url, BEL, text, OSC, "8", SEP, SEP, BEL].join("");
}

export default {
  link,
  label,
  opcode,
  address,
  argument,
};

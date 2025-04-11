import chalk from 'chalk'
import { LogDescription } from 'ethers'

import type { Address, Stringable } from './types'

function address(address: Address) {
  return chalk.cyan.underline.italic(address)
}

function opcode(opcode: string) {
  opcode = opcode.toUpperCase()
  if (opcode === 'DELEGATECALL') {
    opcode = 'D·CALL'
  }
  return chalk.bold.green(opcode.toUpperCase())
}

function argument(name: string, value: Stringable) {
  const valueString = value.toString()
  return chalk.yellow(name) + '=' + valueString.toString()
}

function label(label: string) {
  return chalk.magenta.bold(label)
}

function method(name: string, args = '', padding = '') {
  return chalk.blue.italic(name) + chalk.blue.italic('(\n') + args + chalk.blue.italic(`\n${padding})`)
}

function contract(name: string, addr: Address) {
  return chalk.magenta.bold(name) + chalk.magenta.bold('[') + address(addr) + chalk.magenta.bold(']')
}

function log(log: LogDescription, contractName: string, padding: string) {
  let argsString: string
  if (log.args.length === 1) {
    argsString = `(${argument(log.fragment.inputs[0].name, log.args[0] as Stringable)})`
  } else {
    argsString = `(\n${log.args.map((arg: Stringable, i) => `${padding}  ${argument(log.fragment.inputs[i].name, arg)}`).join(',\n')}\n${padding})`
  }

  return `${padding}${opcode('LOG')} ${contractName}.${label(log.name)}${argsString}`
}

export default {
  label,
  log,
  opcode,
  address,
  method,
  argument,
  contract,
}

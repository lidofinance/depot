import chalk from 'chalk'

export const logBlue = (raw: string | TemplateStringsArray[], ...values: unknown[]) => {
  const strings = Array.isArray(raw) ? raw : [raw]
  const stringsColorize = strings.map((strings) => chalk.bold.blue(strings))
  const valuesColorize = values.map((value) => chalk.italic.blue(`'${value}'`))
  console.log(String.raw({ raw: stringsColorize }, ...valuesColorize))
}
export const logGreen = (raw: string | TemplateStringsArray[], ...values: unknown[]) => {
  const strings = Array.isArray(raw) ? raw : [raw]
  const stringsColorize = strings.map((strings) => chalk.bold.green(strings))
  const valuesColorize = values.map((value) => chalk.italic.green(`'${value}'`))
  console.log(String.raw({ raw: stringsColorize }, ...valuesColorize))
}

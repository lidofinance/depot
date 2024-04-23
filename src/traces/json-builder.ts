const TOKENS = {
  OBJECT_OPEN: '{',
  OBJECT_CLOSE: '}',
  ARRAY_OPEN: '[',
  ARRAY_CLOSE: ']',
  COLON: ':',
  COMMA: ',',
  DOUBLE_QUOTES: '"',
}

export class JsonBuilder {
  private readonly tokens: string[] = []

  /**
   * Builds js object from tokens and returns it
   * @returns Builded js object
   */
  public build(): object {
    this.stripTrailingComma()
    return this.parse(this.tokens.splice(0, this.tokens.length))
  }

  /**
   * Allows pop the latest built object from the top of the stack if it's item of the array or the root object.
   * Method returns null if top object is a part of the larger object.
   * @returns the built object from the top of the stack
   */
  public pop(): object | null {
    this.stripTrailingComma()
    if (this.tokens.length === 0) {
      return null
    } else if (this.lastToken === TOKENS.OBJECT_CLOSE) {
      return this.popObject()
    } else if (this.lastToken === TOKENS.ARRAY_CLOSE) {
      return this.popArray()
    }
    return null
  }

  private popArray() {
    let arrayOpenIndex = this.tokens.length - 1
    let arrayCloseTokensCount = 0
    while (arrayOpenIndex > 0) {
      --arrayOpenIndex
      if (this.tokens[arrayOpenIndex] === TOKENS.ARRAY_OPEN) {
        if (arrayCloseTokensCount === 0) {
          break
        } else {
          arrayCloseTokensCount -= 1
        }
      } else if (this.tokens[arrayOpenIndex] === TOKENS.ARRAY_CLOSE) {
        arrayCloseTokensCount += 1
      }
    }
    if (arrayOpenIndex < 0) {
      throw new Error(`Invalid JSON. Corresponding "${TOKENS.OBJECT_OPEN}" token not found`)
    }

    if (arrayOpenIndex > 0 && this.tokens[arrayOpenIndex - 1] === TOKENS.COLON) {
      // return null because it's part of the larger object
      return null
    }

    return this.parse(this.tokens.splice(arrayOpenIndex, this.tokens.length - arrayOpenIndex))
  }

  private popObject() {
    let objectOpenIndex = this.tokens.length - 1
    let objectCloseTokensCount = 0
    while (objectOpenIndex > 0) {
      --objectOpenIndex
      if (this.tokens[objectOpenIndex] === TOKENS.OBJECT_OPEN) {
        if (objectCloseTokensCount === 0) {
          break
        } else {
          objectCloseTokensCount -= 1
        }
      } else if (this.tokens[objectOpenIndex] === TOKENS.OBJECT_CLOSE) {
        objectCloseTokensCount += 1
      }
    }
    if (objectOpenIndex < 0) {
      throw new Error(`Invalid JSON. Corresponding "${TOKENS.OBJECT_OPEN}" token not found`)
    }

    if (objectOpenIndex > 0 && this.tokens[objectOpenIndex - 1] === TOKENS.COLON) {
      // return null because it's part of the larger object
      return null
    }

    return this.parse(this.tokens.splice(objectOpenIndex, this.tokens.length - objectOpenIndex))
  }

  public key(key: string) {
    this.tokens.push(TOKENS.DOUBLE_QUOTES)
    this.tokens.push(key)
    this.tokens.push(TOKENS.DOUBLE_QUOTES)
    this.tokens.push(TOKENS.COLON)
    return this
  }

  public value(value: string | number | boolean | null) {
    if (typeof value === 'string') {
      this.tokens.push(TOKENS.DOUBLE_QUOTES)
      this.tokens.push(value)
      this.tokens.push(TOKENS.DOUBLE_QUOTES)
    } else {
      this.tokens.push('' + value) // cast to string
    }
    this.comma()
    return this
  }

  public openArray() {
    this.tokens.push(TOKENS.ARRAY_OPEN)
    return this
  }

  public closeArray() {
    this.stripTrailingComma()
    this.tokens.push(TOKENS.ARRAY_CLOSE)
    this.comma()
    return this
  }

  public openObject() {
    this.tokens.push(TOKENS.OBJECT_OPEN)
    return this
  }

  public closeObject() {
    this.stripTrailingComma()
    this.tokens.push(TOKENS.OBJECT_CLOSE)
    this.comma()
    return this
  }

  private get lastToken() {
    return this.tokens[this.tokens.length - 1]
  }

  private comma() {
    this.tokens.push(TOKENS.COMMA)
  }

  private stripTrailingComma() {
    if (this.tokens[this.tokens.length - 1] === TOKENS.COMMA) {
      this.tokens.pop()
    }
  }

  private parse(tokens: string[]): object {
    return JSON.parse(tokens.join('').replace(/\n/g, '\\n'))
  }
}

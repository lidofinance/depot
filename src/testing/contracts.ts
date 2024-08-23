export interface ActionTestContext {
  imports?: string[];
  globalValues?: { [name: string]: any };
  localValues?: string[];
  beforeChecks?: string[];
  beforePreps?: string[];
  testSuites?: string[];
}

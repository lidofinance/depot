declare module "ipfs-only-hash" {
  function of(text: string, params: { cidVersion: 1 | 0, rawLeaves : true }): Promise<string>;
}

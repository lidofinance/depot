import Hash from 'ipfs-only-hash'

export function getUrlByCidV1(cid: string) {
  return `https://${cid}.ipfs.dweb.link`
}

export async function calculateCid(string: string) {
  return await Hash.of(string, { cidVersion: 1, rawLeaves: true })
}

export const isCidUploaded = async (cid: string) => {
  try {
    const resp = await fetch(getUrlByCidV1(cid), { signal: AbortSignal?.timeout(8000) })
    return resp.status < 300
  } catch {
    return false
  }
}

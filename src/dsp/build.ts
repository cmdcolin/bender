import { Chain } from './chain'

export function buildChain(sr: number): Chain {
  const chain = new Chain(sr)
  return chain
}

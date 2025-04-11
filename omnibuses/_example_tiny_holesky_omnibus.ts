import omnibuses from '../src/omnibuses/omnibuses'

export default omnibuses.create({
  network: 'holesky',
  description: 'example tiny omnibus at holesky via depot',
  items: ({ blueprints }) => [
    blueprints.tokens.transferLDO({
      title: 'Transfer 10,000 LDO to Lucky Wallet hhh',
      to: '0x0000000000000000000000000000000000000777', // Random Address
      amount: 10_000n * 10n ** 18n,
    }),
  ],
})

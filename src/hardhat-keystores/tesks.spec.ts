import { expect } from 'chai'
import hre from 'hardhat'

describe('keystore plugin', () => {
  it('keystore in hre', () => {
    expect(hre.keystores).to.be.instanceOf(Object)
    expect(hre.keystores.all).to.be.instanceOf(Function)
    expect(hre.keystores.has).to.be.instanceOf(Function)
    expect(hre.keystores.get).to.be.instanceOf(Function)
    expect(hre.keystores.add).to.be.instanceOf(Function)
    expect(hre.keystores.select).to.be.instanceOf(Function)
    expect(hre.keystores.remove).to.be.instanceOf(Function)
    expect(hre.keystores.unlock).to.be.instanceOf(Function)
    expect(hre.keystores.generate).to.be.instanceOf(Function)
    expect(hre.keystores.password).to.be.instanceOf(Function)
  })

  it('keystore in tasks', () => {
    const expectedTask = ['keystore:list', 'keystore:add', 'keystore:generate', 'keystore:delete', 'keystore:password']
    const keystoreTasks = Object.keys(hre.tasks).filter((taskNme) => taskNme.startsWith('keystore:'))
    expect(keystoreTasks).to.deep.equal(expectedTask)
  })
})

import './ready'
import './polyfill'
// import './observers/http'

import { init as enableLifeCycleHook } from './observers/lifecycle'

import { interfaces, invoke, register } from './rpc'
import modules from './modules/index'

rpc.exports = {
  interfaces,
  invoke,
}

function registerModules() {
  for (const [name, submodule] of Object.entries(modules)) {
    for (const [method, func] of Object.entries(submodule as {[key: string]: Function})) {
      if (method === 'default')
        register(func, name)
      else
        register(func, [name, func.name].join('/'))
    }
  }
}

setImmediate(registerModules)
setImmediate(enableLifeCycleHook)

Process.setExceptionHandler((detail) => {
  console.error('Exception report: ')
  console.error(JSON.stringify(detail, null, 4))
  send({
    subject: 'exception',
    detail
  })
  const { context } = detail
  const pc = Instruction.parse(context.pc)
  console.warn(DebugSymbol.fromAddress(context.pc))
  console.error(pc.toString())
  console.error(Instruction.parse(pc.next).toString())  
  console.error('Backtrace')
  console.error(
    Thread.backtrace(context, Backtracer.ACCURATE)
      .map(addr => DebugSymbol.fromAddress(addr).toString()).join('\n'))
  
  return false
})

Interceptor.attach(Module.findExportByName(null, 'objc_exception_throw')!, {
  onEnter(args) {
    console.error('Objective-C exception:', new ObjC.Object(args[0]))
  }
})
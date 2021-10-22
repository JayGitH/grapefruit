const CLLocationDegrees = (Process.pointerSize === 4) ? 'float' : 'double';
const CLLocationCoordinate2D = [CLLocationDegrees, CLLocationDegrees];

let listeners: InvocationListener[] = []
const hooked: Set<string> = new Set()

export function fake(lat: number, lng: number) {
  Module.load('/System/Library/Frameworks/CoreLocation.framework/CoreLocation')
  Module.ensureInitialized('CoreLocation')
  const CLLocationCoordinate2DMake = new NativeFunction(
    Module.findExportByName('CoreLocation', 'CLLocationCoordinate2DMake')!,
    CLLocationCoordinate2D, [CLLocationDegrees, CLLocationDegrees])

  dismiss()

  const methods = [
    '- startUpdatingLocation',
    '- startUpdatingHeading', // heading is unavailable on macOS
    '- requestLocation'
  ]

  function fakeWithOrigin(location: ObjC.Object) {
    if (location.handle.isNull())
      return location;

    const fake = CLLocationCoordinate2DMake(lat, lng)
    const newLocation = ObjC.classes.CLLocation.alloc()
    newLocation['- initWithCoordinate:' +
      'altitude:' +
      'horizontalAccuracy:' +
      'verticalAccuracy:' +
      'course:' +
      'speed:' +
      'timestamp:'](
        fake,
        location.altitude(),
        location.horizontalAccuracy(),
        location.verticalAccuracy(),
        location.course(),
        location.speed(),
        location.timestamp()
      )

    return newLocation
  }

  const callbacks: { [sel: string]: ((this: InvocationContext, args: InvocationArguments) => void) } = {
    '- locationManager:didUpdateToLocation:fromLocation:': function (args) {
      console.log('- locationManager:didUpdateToLocation:fromLocation:',
        new ObjC.Object(args[3]),
        new ObjC.Object(args[4]))

      const to = new ObjC.Object(args[3])
      const from = new ObjC.Object(args[4])

      args[3] = fakeWithOrigin(to)
      args[4] = fakeWithOrigin(from)
    },
    '- locationManager:didUpdateLocations:': function (args) {
      const newArray = ObjC.classes.NSMutableArray.alloc().init()
      const array = new ObjC.Object(args[3])
      const count = array.count().valueOf()
      for (var i = 0; i !== count; i++) {
        const location = array.objectAtIndex_(i)
        const newLocation = fakeWithOrigin(location)
        newArray.addObject_(newLocation)
      }
      args[3] = newArray.copy()
    },
    '- locationManager:didUpdateHeading:': function (args) {
      console.log('- locationManager:didUpdateHeading:',
        new ObjC.Object(args[3]))
    }
  };

  function hookDelegate(delegate: ObjC.Object) {
    const className = delegate.$className

    if (hooked.has(className)) return

    const clazz = ObjC.classes[className]
    for (let sel in callbacks) {
      if (sel in clazz) {
        Interceptor.attach(clazz[sel].implementation, {
          onEnter: callbacks[sel]
        });
      }
    }

    hooked.add(className)
  }

  const instances = ObjC.chooseSync(ObjC.classes.CLLocationManager)
  for (const mgr of instances) {
    hookDelegate(mgr.delegate())
  }

  for (const methodName of methods) {
    const method = ObjC.classes.CLLocationManager[methodName] as ObjC.ObjectMethod
    if (typeof method !== 'function')
      continue

    Interceptor.attach(method.implementation, {
      onEnter(args) {
        const delegate = new ObjC.Object(args[0]).delegate()
        hookDelegate(delegate)
      }
    })
  }
}

export function dismiss() {
  listeners.forEach(l => l.detach())
  listeners = []
}
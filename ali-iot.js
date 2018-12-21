const util = require('util')
const crypto = require('crypto')

function signUtil(opt = {}) {
  const signMethod = opt.signMethod || 'sha1'
  const timestamp = Date.now()
  const clientId = opt.clientId || opt.productKey + '&' + opt.deviceName + '_jlq-iot-device-sdk-js'

  const device = {
    productKey: opt.productKey,
    deviceName: opt.deviceName,
    clientId,
    timestamp,
    signMethod: 'hmac' + signMethod
  }
  
  const signcontent = 'clientId' + clientId + 'deviceName' + opt.deviceName + 'productKey' + opt.productKey + 'timestamp' + timestamp
  device.sign = crypto.createHmac(signMethod, opt.deviceSecret).update(signcontent).digest('hex')
  return device
}

function DefineAliMqttMethods(Client) {
  Client.prototype.serve = function (serviceName, ...args) {
    let cb
    let thingId
    if (args.length > 1 && typeof args[1] === 'function') {
      cb = args[1]
      thingId = args[0]
    } else {
      cb = args[0]
    }

    let topic
    if (thingId) {
      topic = util.format('/sys/%s/%s/thing/service/%s', thingId.productKey, thingId.deviceName, serviceName)
    } else {
      topic = '/sys/%product/%device/thing/service/' + serviceName
    }

    return this.subscribeAndListen(topic, function (err, topic, message) {
      if (err) {
        throw err
      }
      message = JSON.parse(message.toString())
      cb(message.params)
    })
  }

  Client.prototype.postProps = function (...args) {
    let params = args.length > 0 ? args[0] : {}
    let thingId
    if (params.productKey && params.deviceName) {
      thingId = params
      params = args.length > 1 ? args[1] : {}
    }

    let pubTopic
    let replyTopic
    if (thingId) {
      pubTopic = util.format('/sys/%s/%s/thing/event/property/post', thingId.productKey, thingId.deviceName)
      replyTopic = util.format('/sys/%s/%s/thing/event/property/post_reply', thingId.productKey, thingId.deviceName)
    } else {
      pubTopic = '/sys/%product/%device/thing/event/property/post'
      replyTopic = '/sys/%product/%device/thing/event/property/post_reply'
    }

    return this.rpc({
      message: {
        params,
        method: 'thing.event.property.post'
      },
      pubTopic,
      replyTopic
    })
  }

  Client.prototype.postEvent = function (eventName, ...args) {
    let params = args.length > 0 ? args[0] : {}
    let thingId
    if (params.productKey && params.deviceName) {
      thingId = params
      params = args.length > 1 ? args[1] : {}
    }

    let pubTopic
    let replyTopic
    if (thingId) {
      pubTopic = util.format('/sys/%s/%s/thing/event/%s/post', thingId.productKey, thingId.deviceName, eventName)
      replyTopic = util.format('/sys/%s/%s/thing/event/%s/post_reply', thingId.productKey, thingId.deviceName, eventName)
    } else {
      pubTopic = '/sys/%product/%device/thing/event/' + eventName + '/post'
      replyTopic = '/sys/%product/%device/thing/event/' + eventName + '/post_reply'
    }

    return this.rpc({
      message: {
        params,
        method: util.format('thing.event.%s.post', eventName)
      },
      pubTopic,
      replyTopic
    })
  }

  // for gateway
  Client.prototype.addTopo = function (deviceConfig = {}) {
    const deviceSign = signUtil(deviceConfig)
    return this.rpc({
      message: {
        params: [deviceSign],
        method: 'thing.topo.add'
      },
      pubTopic: '/sys/%product/%device/thing/topo/add',
      replyTopic: '/sys/%product/%device/thing/topo/add_reply'
    })
  }

  Client.prototype.deleteTopo = function (thingId) {
    return this.rpc({
      message: {
        params: [thingId],
        method: 'thing.topo.delete'
      },
      pubTopic: '/sys/%product/%device/thing/topo/delete',
      replyTopic: '/sys/%product/%device/thing/topo/delete_reply'
    })
  }

  Client.prototype.getTopo = function () {
    return this.rpc({
      message: {
        params: {},
        method: 'thing.topo.get'
      },
      pubTopic: '/sys/%product/%device/thing/topo/get',
      replyTopic: '/sys/%product/%device/thing/topo/get_reply'
    })
  }

  Client.prototype.login = function (deviceConfig = {}) {
    const params = signUtil(deviceConfig)
    return this.rpc({
      message: {
        params
      },
      pubTopic: '/ext/session/%product/%device/combine/login',
      replyTopic: '/ext/session/%product/%device/combine/login_reply'
    })
  }

  Client.prototype.logout = function (thingId) {
    return this.rpc({
      message: {
        params: thingId
      },
      pubTopic: '/ext/session/%product/%device/combine/logout',
      replyTopic: '/ext/session/%product/%device/combine/logout_reply'
    })
  }
}

module.exports = {
  DefineAliMqttMethods,
  signUtil
}

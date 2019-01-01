'use strict'
const util = require('util')
const crypto = require('crypto')
const {guid} = require('./utils')

const tlsPrefix = ['tls://', 'mqtts://', 'wss://']

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

const DEFAULT_REGION_ID = 'cn-shanghai';
const BROKER_URL = '%s%s.iot-as-mqtt.%s.aliyuncs.com/';

function EnableAliAuthConfig(config) {

  if (config.aliyun) {
    if (!config.brokerUrl) {
      let tls = false
      let brokerProtocol
      if ((config.brokerUrl && tlsPrefix.some(function (prefix) {
        return config.brokerUrl.startsWith(prefix);
      })) || config.tls) {
        tls = true
      }

      if (tls) {
        brokerProtocol = 'mqtts://';
      } else {
        brokerProtocol = 'mqtt://';
      }

      config.brokerUrl = util.format(BROKER_URL, brokerProtocol, config.productKey, config.regionId || DEFAULT_REGION_ID)
    }
  }

  if (config.brokerUrl && config.brokerUrl.indexOf('aliyuncs.com') !== -1) {

    if (typeof config.productKey === 'undefined') {
      throw new Error('productKey should not be empty');
    }
    if (typeof config.deviceName === 'undefined') {
      throw new Error('deviceName should not be empty');
    }
    if (typeof config.deviceSecret === 'undefined') {
      throw new Error('deviceSecret should not be empty');
    }

    // Is Aliyun IOT account
    const {brokerUrl, productKey, deviceName, deviceSecret, clientId} = config
    let _securemode = 3
    if (brokerUrl && tlsPrefix.some(prefix => brokerUrl.startsWith(prefix))) {
      _securemode = 2
    }
    
    const device = signUtil({clientId, deviceSecret, productKey, deviceName})
    config.clientId = device.clientId + '|securemode=' + _securemode + ',signmethod=' + device.signMethod + ',timestamp=' + device.timestamp + '|'
    config.username = deviceName + '&' + productKey
    config.password = device.sign
  }
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

  Client.prototype.rpc = function (pubTopic, replyTopic, message, timeout = 10000) {
    if (!message.id) {
      message.id = guid()
    }
    const {id} = message
    const payload = JSON.stringify(message)

    return new Promise((resolve, reject) => {
      const unsubReply = this.subscribeAndListen(replyTopic, function (err, topic, ackMessage) {
        if (err) {
          unsubReply()
          return reject(err)
        }
        ackMessage = JSON.parse(ackMessage.toString())
        if (ackMessage && ackMessage.id === id) {
          clearTimeout(timer)
          unsubReply()
          resolve(ackMessage)
        }
      })

      const timer = setTimeout(function () {
        unsubReply()
        reject(new Error('sub reply timeout: ' + replyTopic))
      }, timeout || 10000)

      this.publish(pubTopic, payload)
        .catch(err => {
          clearTimeout(timer)
          unsubReply()
          reject(err)
        })
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

    return this.rpc(
      pubTopic,
      replyTopic,
      {
        params,
        method: 'thing.event.property.post'
      }
    )
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

    return this.rpc(
      pubTopic,
      replyTopic,
      {
        params,
        method: util.format('thing.event.%s.post', eventName)
      }
    )
  }

  // for gateway
  Client.prototype.addTopo = function (deviceConfig = {}) {
    const deviceSign = signUtil(deviceConfig)
    return this.rpc(
      '/sys/%product/%device/thing/topo/add',
      '/sys/%product/%device/thing/topo/add_reply',
      {
        params: [deviceSign],
        method: 'thing.topo.add'
      }
    )
  }

  Client.prototype.deleteTopo = function (thingId) {
    return this.rpc(
      '/sys/%product/%device/thing/topo/delete',
      '/sys/%product/%device/thing/topo/delete_reply',
      {
        params: [thingId],
        method: 'thing.topo.delete'
      }
    )
  }

  Client.prototype.getTopo = function () {
    return this.rpc(
      '/sys/%product/%device/thing/topo/get',
      '/sys/%product/%device/thing/topo/get_reply',
      {
        params: {},
        method: 'thing.topo.get'
      }
    )
  }

  Client.prototype.login = function (deviceConfig = {}) {
    const params = signUtil(deviceConfig)
    return this.rpc(
      '/ext/session/%product/%device/combine/login',
      '/ext/session/%product/%device/combine/login_reply',
      {
        params
      }
    )
  }

  Client.prototype.logout = function (thingId) {
    return this.rpc(
      '/ext/session/%product/%device/combine/logout',
      '/ext/session/%product/%device/combine/logout_reply',
      {
        params: thingId
      }
    )
  }
}

module.exports = {
  EnableAliAuthConfig,
  DefineAliMqttMethods
}

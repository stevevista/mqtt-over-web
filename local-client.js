'use strict'

const mqtt = require('mqtt')
const EventEmitter = require('events')
const util = require('util')
const debug = require('debug')('device:iot')
const {guid, mqttMatch} = require('./utils')
const {DefineAliMqttMethods, signUtil} = require('./ali-iot')

const tlsPrefix = ['tls://', 'mqtts://', 'wss://']

function AliAuthConfig(config) {
  const {brokerUrl, productKey, deviceName, deviceSecret, clientId} = config
  let _securemode = 3
  if (brokerUrl && tlsPrefix.some(prefix => brokerUrl.startsWith(prefix))) {
    _securemode = 2
  }
  
  const device = signUtil({clientId, deviceSecret, productKey, deviceName})
  config.clientId = device.clientId + '|securemode=' + _securemode + ',signmethod=' + device.signMethod + ',timestamp=' + device.timestamp + '|'
  config.username = deviceName + '&' + productKey
  config.password = device.sign
  return config
}

class MqttClient extends EventEmitter {
  constructor(config = {}) {
    super()

    if (config.brokerUrl.indexOf('aliyuncs.com') !== -1) {
      // Is Aliyun IOT account
      config = AliAuthConfig(config)
    }

    this.brokerUrl = config.brokerUrl
    this.productKey = config.productKey
    this.deviceName = config.deviceName
    this.clientId = config.clientId
    this.username = config.username
    this.password = config.password

    // start
    this.onReady = this.createOnReady()
    this._subscribeAndListen = this.createSubTopicAndOnMessage()
    this.createRpcMethods(config.rpcMethods || [])
  }

  format(f, ...args) {
    if (typeof f === 'undefined') {
      return f
    }

    const formatRegExp = /%(%|client|product|device|s|d|j)/g
    let i = 0
    const len = args.length
    return String(f).replace(formatRegExp, (x) => {
      if (x === '%%') return '%'
      else if (x === '%client') return this.clientId
      else if (x === '%product') return this.productKey
      else if (x === '%device') return this.deviceName
      else if (x === '%s') {
        return i < len ? String(args[i++]) : x
      } else if (x === '%d') {
        return i < len ? Number(args[i++]) : x
      } else if (x === '%j') {
        try {
          return i < len ? JSON.stringify(args[i++]) : x
        } catch (_) {
          return '[Circular]'
        }
      } else return x
    })
  }

  createRpcMethods(manifest) {
    for (const {name, pubTopic, replyTopic} of manifest) {
      this[name] = (message, timeout, ...args) => this.rpc({
        message: message || {},
        timeout: timeout || 10000,
        pubTopic: this.format(pubTopic, ...args),
        replyTopic: this.format(replyTopic, ...args)})
    }
  }

  createOnReady() {
    let inited = false
    let callbacks = []

    const {clientId, username, password, brokerUrl} = this
    this._mqttClient = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password
    })
    const events = ['connect', 'error', 'close', 'reconnect', 'offline', 'message']
    events.forEach(evtName => {
      this._mqttClient.on(evtName, (...args) => {
        this.emit(evtName, ...args)

        if (!inited && evtName === 'connect') {
          // resolve callbacks
          inited = true
          callbacks.forEach(cb => cb())
          callbacks = []
        }
      })
    })

    return function (cb) {
      if (cb) {
        if (inited) {
          cb()
        } else {
          callbacks.push(cb)
        }
      }
    }
  }

  createSubTopicAndOnMessage() {
    var callbacks = []
    this.onReady(() => {
      this._mqttClient.on('message', (topic, message) => {
        callbacks.forEach(m => {
          if (mqttMatch(m.subTopic, topic)) {
            m.callback(null, topic, message)
          }
        })
      })
    })

    return (subTopic, cb) => {
      const fn = {
        subTopic: subTopic,
        callback: cb
      }
      callbacks.push(fn)

      const unsubTopicAndOnMessage = async () => {
        try {
          await this.unsubscribe(subTopic)
        } catch (err) {
          debug('un sub error:', subTopic, err)
        } finally {
          callbacks = callbacks.filter(c => fn !== c)
        }
      }

      this.onReady(async () => {
        try {
          await this.subscribe(subTopic)
        } catch (err) {
          cb(err)
          unsubTopicAndOnMessage()
        }
      })

      return unsubTopicAndOnMessage
    }
  }

  publish(topic, payload) {
    return new Promise((resolve, reject) => {
      this._mqttClient.publish(this.format(topic), payload, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
  
  subscribe(topic) {
    return new Promise((resolve, reject) => {
      this._mqttClient.subscribe(this.format(topic), (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  unsubscribe(topic) {
    return new Promise((resolve, reject) => {
      this._mqttClient.unsubscribe(this.format(topic), (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  end() {
    return new Promise((resolve, reject) => {
      this._mqttClient.end((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  rpc({message, timeout, pubTopic, replyTopic}) {
    if (!message.id) {
      message.id = guid()
    }
    const {id} = message
    const payload = JSON.stringify(message)

    pubTopic = this.format(pubTopic)
    replyTopic = this.format(replyTopic)

    return new Promise((resolve, reject) => {
      const unsubReply = this._subscribeAndListen(replyTopic, function (err, topic, ackMessage) {
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

      this._mqttClient.publish(pubTopic, payload, (err, res) => {
        if (err) {
          clearTimeout(timer)
          unsubReply()
          reject(err)
        }
      })
    })
  }

  subscribeAndListen(subTopic, cb) {
    return this._subscribeAndListen(this.format(subTopic), cb)
  }
}

const DEFAULT_REGION_ID = 'cn-shanghai';
const BROKER_URL = '%s%s.iot-as-mqtt.%s.aliyuncs.com:%s/';

class AliClient extends MqttClient {
  constructor(config = {}) {
    if (typeof config.productKey === 'undefined') {
      throw new Error('productKey should not be empty');
    }
    if (typeof config.deviceName === 'undefined') {
      throw new Error('deviceName should not be empty');
    }
    if (typeof config.deviceSecret === 'undefined') {
      throw new Error('deviceSecret should not be empty');
    }

    if (!config.brokerUrl) {
      let tls = false
      let brokerProtocol
      let brokerPort
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
      brokerPort = 1883

      config.brokerUrl = util.format(BROKER_URL, brokerProtocol, config.productKey, config.regionId || DEFAULT_REGION_ID, brokerPort)
    }

    super(config)
  }
}

DefineAliMqttMethods(AliClient)

module.exports = {
  MqttClient,
  AliClient
}

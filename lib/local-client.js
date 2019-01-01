'use strict'

const mqtt = require('mqtt')
const EventEmitter = require('events')
const {EnableAliAuthConfig, DefineAliMqttMethods} = require('./ali-iot')
const {MixinMqttMethods} = require('./mixin')

class LocalClient extends EventEmitter {
  constructor(config = {}) {
    super()

    EnableAliAuthConfig(config)

    this.config = config
    
    this.productKey = config.productKey
    this.deviceName = config.deviceName
    this.clientId = config.clientId
    this.username = config.username

    // start
    this.onReady = this.createOnReady()
    this._subscribeAndListen = this.createSubTopicAndOnMessage()
  }

  format(f, ...args) {
    if (typeof f === 'undefined') {
      return f
    }

    const formatRegExp = /%(%|client|product|device|user|s|d|j)/g
    let i = 0
    const len = args.length
    return String(f).replace(formatRegExp, (x) => {
      if (x === '%%') return '%'
      else if (x === '%client') return this.clientId || '[Undef]'
      else if (x === '%product') return this.productKey || '[Undef]'
      else if (x === '%device') return this.deviceName || '[Undef]'
      else if (x === '%user') return this.username || '[Undef]'
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

  formatTopicParameters(topic) {
    if (topic instanceof Array) {
      topic = topic.map(t => this.format(t))
    } else if (typeof topic === 'object') {
      const obj = {}
      for (const t in topic) {
        obj[this.format(t)] = topic[t]
      }
      topic = obj
    } else {
      topic = this.format(topic)
    }
    return topic
  }

  createOnReady() {
    let inited = false
    let callbacks = []

    this._mqttClient = 
      this.config.brokerUrl ? mqtt.connect(this.config.brokerUrl, this.config) : mqtt.connect(this.config)

    this._mqttClient.on('connect', () => {
      if (!inited) {
        // resolve callbacks
        inited = true
        callbacks.forEach(cb => cb())
        callbacks = []
      }

      this.emit('connect')
    })

    const events = ['error', 'close', 'reconnect', 'offline', 'message', 'packetsend', 'packetreceive']
    events.forEach(evtName => {
      this._mqttClient.on(evtName, (...args) => {
        this.emit(evtName, ...args)
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

  publish(topic, payload, ...args) {
    return new Promise((resolve, reject) => {
      this._mqttClient.publish(this.format(topic), payload, ...args, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
  
  subscribe(topic, ...args) {
    topic = this.formatTopicParameters(topic)
    return new Promise((resolve, reject) => {
      this._mqttClient.subscribe(topic, ...args, (err, granted) => {
        if (err) reject(err)
        else resolve(granted)
      })
    })
  }

  unsubscribe(topic, ...args) {
    if (topic instanceof Array) {
      topic = topic.map(t => this.format(t))
    } else {
      topic = this.format(topic)
    }
    return new Promise((resolve, reject) => {
      this._mqttClient.unsubscribe(topic, ...args, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  end(...args) {
    return new Promise((resolve, reject) => {
      this._mqttClient.end(...args, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  subscribeAndListen(subTopic, options, cb) {
    const topic = this.formatTopicParameters(subTopic)
    return this._subscribeAndListen(topic, options, cb)
  }
}

MixinMqttMethods(LocalClient)
DefineAliMqttMethods(LocalClient)

module.exports = LocalClient

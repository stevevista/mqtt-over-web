'use strict'

const mqtt = require('mqtt')
const EventEmitter = require('events')
const util = require('util')
const debug = require('debug')('device:iot')
const {guid, mqttMatch} = require('./utils')
const {EnableAliAuthConfig, DefineAliMqttMethods} = require('./ali-iot')

class LocalClient extends EventEmitter {
  constructor(config = {}) {
    super()

    EnableAliAuthConfig(config)
    
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

    const formatRegExp = /%(%|client|product|device|user|s|d|j)/g
    let i = 0
    const len = args.length
    return String(f).replace(formatRegExp, (x) => {
      if (x === '%%') return '%'
      else if (x === '%client') return this.clientId
      else if (x === '%product') return this.productKey
      else if (x === '%device') return this.deviceName
      else if (x === '%user') return this.username
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
      this[name] = (message, timeout, ...args) => this.rpc(
        this.format(pubTopic, ...args),
        this.format(replyTopic, ...args),
        message || {},
        timeout || 10000)
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

  publish(topic, payload, options) {
    return new Promise((resolve, reject) => {
      this._mqttClient.publish(this.format(topic), payload, options, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
  
  subscribe(topic, options) {
    return new Promise((resolve, reject) => {
      this._mqttClient.subscribe(this.format(topic), options, (err) => {
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

  end(force) {
    return new Promise((resolve, reject) => {
      this._mqttClient.end(force, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  rpc(pubTopic, replyTopic, message, timeout = 10000) {
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

DefineAliMqttMethods(LocalClient)

module.exports = LocalClient

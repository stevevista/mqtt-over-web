'use strict'
const EventEmitter = require('events')
const {guid} = require('./utils')
const {DefineAliMqttMethods} = require('./ali-iot')
const {MixinMqttMethods} = require('./mixin')

class MqttWebClient extends EventEmitter {
  constructor(options) {
    super()
    let url
    if (typeof options === 'object') {
      url = options.url
    } else {
      url = options
    }
    const ws = new WebSocket(url)
    this.ws = ws
    this.initCallbacks = []
    this.connected = false
    this.pendingActs = {}

    ws.onmessage = (data) => {
      try {
        const msg = JSON.parse(data.data)
        this.handleMsg(msg)
      } catch (e) {
        console.log(data.data)
        console.log(e)
      }
    }

    ws.onopen = () => {
      this.emit('socket-open')
    }

    ws.onerror = () => {
      this.emit('socket-error')
    }

    ws.onclose = () => {
      this.emit('socket-close')
    }

    this.subscribeAndListen = this.createSubTopicAndOnMessage()
  }

  handleMsg(msg) {
    if (msg.type === 'connect') {
      if (this.initCallbacks.length) {
        this.initCallbacks.forEach(cb => cb())
        this.initCallbacks = []
      }
      this.connected = true
      this.emit('connect')
    } else if (msg.type === 'close') {
      this.connected = false
      this.emit(msg.type)
    } else if (msg.type === 'reconnect' || msg.type === 'offline' || msg.type === 'end') {
      this.emit(msg.type)
    } else if (msg.type === 'error') {
      this.emit('error', new Error(msg.message))
    } else if (msg.type === 'message') {
      this.emit('message', msg.topic, msg.message)
    } else if (msg.type === 'result') {
      const {id, result} = msg
      if (this.pendingActs[id]) {
        const {resolve, reject, timer} = this.pendingActs[id]
        delete this.pendingActs[id]
        clearTimeout(timer)
        if (result) {
          resolve()
        } else {
          reject(new Error(msg.message))
        }
      }
    }
    // console.log(msg)
  }

  promise(act, id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(act + ' timeout'))
        delete this.pendingActs[id]
      }, 10000)

      this.pendingActs[id] = {resolve, reject, timer}
    })
  }

  publish(topic, payload, options) {
    const id = guid()
    const obj = {
      act: 'publish',
      id,
      topic,
      payload,
      options
    }
    this.ws.send(JSON.stringify(obj))
    return this.promise('publish', id)
  }

  subscribe(topic, options) {
    const id = guid()
    const obj = {
      act: 'subscribe',
      id,
      topic,
      options
    }
    this.ws.send(JSON.stringify(obj))
    return this.promise('subscribe', id)
  }

  unsubscribe(topic) {
    const id = guid()
    const obj = {
      act: 'unsubscribe',
      id,
      topic
    }
    this.ws.send(JSON.stringify(obj))
    return this.promise('unsubscribe', id)
  }

  onReady(cb) {
    if (cb) {
      if (this.connected) {
        cb()
      } else {
        this.initCallbacks.push(cb)
      }
    }
  }

  end() {
    this.ws.close()
  }
}

MixinMqttMethods(MqttWebClient)
DefineAliMqttMethods(MqttWebClient)

module.exports = MqttWebClient

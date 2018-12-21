'use strict'
const EventEmitter = require('events')
const {guid, mqttMatch} = require('./utils')
const {DefineAliMqttMethods} = require('./ali-iot')

class MqttWebClient extends EventEmitter {
  constructor(url) {
    super()
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
    } else if (msg.type === 'message') {
      delete msg.type
      this.emit('message', msg)
    } else if (msg.type === 'reconnect') {
      this.connected = true
      this.emit('reconnect')
    } else if (msg.type === 'close') {
      this.connected = false
      this.emit('offline')
    } else if (msg.type === 'offline') {
      this.connected = false
      this.emit('offline')
    } else if (msg.type === 'error') {
      this.emit('error', new Error(msg.message))
    } else if (msg.type === 'result') {
      const {id, result} = msg
      if (this.pendingActs[id]) {
        if (result) {
          this.pendingActs[id].resolve()
        } else {
          this.pendingActs[id].reject(new Error(msg.message))
        }
        
        delete this.pendingActs[id]
      }
    }
    console.log(msg)
  }

  promise(act, id) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.pendingActs[id]) {
          this.pendingActs[id].reject(new Error(act + ' timeout'))
          delete this.pendingActs[id]
        }
      }, 10000)

      this.pendingActs[id] = {resolve, reject}
    })
  }

  publish(topic, payload) {
    const id = guid()
    const obj = {
      act: 'publish',
      id,
      topic,
      payload
    }
    this.ws.send(JSON.stringify(obj))
    return this.promise('publish', id)
  }

  subscribe(topic) {
    const id = guid()
    const obj = {
      act: 'subscribe',
      id,
      topic
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

  createSubTopicAndOnMessage() {
    var callbacks = []
    this.onReady(() => {
      this.on('message', (message) => {
        callbacks.forEach(m => {
          if (mqttMatch(m.subTopic, message.topic)) {
            m.callback(null, message.topic, message.message)
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

      const unsubTopicAndOnMessage = () => {
        this.unsubscribe(subTopic)
        callbacks = callbacks.filter(c => fn !== c)
      }

      this.onReady(() => {
        this.subscribe(subTopic)
          .catch(err => {
            cb(err)
            unsubTopicAndOnMessage()
          })
      })

      return unsubTopicAndOnMessage
    }
  }

  rpc({message, pubTopic, timeout, replyTopic}) {
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
}

DefineAliMqttMethods(MqttWebClient)

module.exports = MqttWebClient

const debug = require('debug')('device:iot')
const {mqttMatch} = require('./utils')

function MixinMqttMethods(Client) {
  Client.prototype.createSubTopicAndOnMessage = function() {
    var callbacks = []
    this.onReady(() => {
      this.on('message', (topic, message) => {
        callbacks.forEach(m => {
          if (mqttMatch(m.subTopic, topic)) {
            m.callback(null, topic, message)
          }
        })
      })
    })

    return (subTopic, options, cb) => {

      if (typeof options === 'function') {
        cb = options
        options = undefined
      }

      const fn = {
        subTopic,
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

  Client.sendMessage = function(clientArg, topic, message, optinos) {
    const client = new Client(clientArg)
    return new Promise((resolve, reject) => {
      client.on('error', (e) => {
        client.end()
        reject(e)
      })

      client.on('connect', async() => {
        await client.publish(topic, message, optinos)
        await client.end()
        resolve()
      })
    })
  }
}

module.exports = {
  MixinMqttMethods
}

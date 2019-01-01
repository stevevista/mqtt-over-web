'use strict'

function mqttRegMatch(filter, topic) {
  const filterArray = filter.split('/')
  const length = filterArray.length
  const topicArray = topic.split('/')

  const matched = []

  for (let i = 0; i < length; ++i) {
    const left = filterArray[i]
    const right = topicArray[i]
    if (left === '+') {
      matched.push(right)
    } else if (left === '#') {
      const sub = []
      for (let n = i; n < topicArray.length; n++) {
        sub.push(topicArray[n])
      }
      matched.push(sub)
      return matched
    } else if (left !== right) {
      return false
    }
  }

  return length === topicArray.length ? matched : false
}

function mqttRegMatchArray(filters, topic) {
  if (filters instanceof Array) {
    for (let i = 0; i < filters.length; i++) {
      const matched = mqttRegMatch(filters[i], topic)
      if (matched) {
        return { i, matched }
      }
    }
  } else if (typeof filters === 'object') {
    for (const filter in filters) {
      const matched = mqttRegMatch(filter, topic)
      if (matched) {
        return { i: filter, matched }
      }
    }
  } else {
    const matched = mqttRegMatch(filters, topic)
    if (matched) {
      return { i: 0, matched }
    }
  }
  return false
}

function MixinMqttMethods(Client) {
  Client.prototype.createSubTopicAndOnMessage = function() {
    var callbacks = []
    this.onReady(() => {
      this.on('message', (topic, message) => {
        callbacks.forEach(m => {
          const matched = mqttRegMatchArray(m.subTopic, topic)
          if (matched) {
            m.callback(null, topic, message, matched.matched, matched.i)
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

      const unsubTopic = typeof subTopic === 'object' ? Object.keys(subTopic) : subTopic
      const args = options ? [options] : []

      const unsubTopicAndOnMessage = () => {
        this.unsubscribe(unsubTopic)
        callbacks = callbacks.filter(c => fn !== c)
      }

      this.onReady(() => {
        this.subscribe(subTopic, ...args)
          .catch(err => {
            cb(err)
            unsubTopicAndOnMessage()
          })
      })

      return unsubTopicAndOnMessage
    }
  }

  Client.sendMessage = function(clientArg, topic, message, ...args) {
    const client = new Client(clientArg)
    return new Promise((resolve, reject) => {
      client.on('error', (e) => {
        client.end()
        reject(e)
      })

      client.on('connect', async() => {
        await client.publish(topic, message, ...args)
        await client.end()
        resolve()
      })
    })
  }
}

module.exports = {
  MixinMqttMethods
}

'use strict'
// client for broked web

function brokeMqttOverSocket(client, socket, incomingProcess, outcomingProcess) {
  const send = (obj) => {
    const cnt = JSON.stringify(obj)
    socket.send(cnt, e => { if (e) console.log(e) })
  }

  const onResult = (id, result, err) => {
    send({
      type: 'result',
      id,
      result,
      message: err ? err.message : undefined
    })
  }

  client.on('connect', () => {
    send({
      type: 'connect'
    })
  })

  client.on('error', err => {
    send({
      type: 'error',
      message: err.message
    })
    socket.close()
  })

  client.on('close', () => {
    try {
      send({type: 'close'})
    } catch (e) {
      // socket may already closed
    }
  })

  client.on('message', (topic, message) => {
    if (incomingProcess) {
      message = incomingProcess(topic, message)
    } else {
      message = message.toString()
    }
    send({
      type: 'message',
      topic,
      message
    })
  })

  client.on('reconnect', () => {
    send({
      type: 'reconnect'
    })
  })

  client.on('offline', () => {
    send({
      type: 'offline'
    })
  })

  socket.on('close', () => {
    client.end()
  })

  // incoming data
  socket.on('message', data => {
    try {
      const obj = JSON.parse(data)
      let action
      if (obj.act === 'publish') {
        let payload = obj.payload
        if (outcomingProcess) {
          payload = outcomingProcess(obj.topic, payload)
        }
        action = client.publish(obj.topic, payload, obj.options)
      } else if (obj.act === 'subscribe') {
        action = client.subscribe(obj.topic, obj.options)
      } else if (obj.act === 'unsubscribe') {
        action = client.unsubscribe(obj.topic)
      } else {
        console.log(obj)
      }

      if (action) {
        action
          .then(() => onResult(obj.id, true))
          .catch(e => onResult(obj.id, false, e))
      }

    } catch (e) {
      // pass
      console.error(e)
    }
  })
}

module.exports = brokeMqttOverSocket

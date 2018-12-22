// client for broked web

function brokeMqttOverSocket(client, socket) {
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
    send({
      type: 'close'
    })
  })

  client.on('message', (topic, message) => {
    send({
      type: 'message',
      topic,
      message: message.toString()
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
        action = client.publish(obj.topic, obj.payload, obj.options)
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

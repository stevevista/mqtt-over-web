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

  const handleCommand = (obj) => {
    if (obj.act === 'publish') {
      client.publish(obj.topic, obj.payload)
        .then(() => onResult(obj.id, true))
        .catch(e => onResult(obj.id, false, e))
    } else if (obj.act === 'subscribe') {
      client.subscribe(obj.topic)
        .then(() => onResult(obj.id, true))
        .catch(e => onResult(obj.id, false, e))
    } else if (obj.act === 'unsubscribe') {
      client.unsubscribe(obj.topic)
        .then(() => onResult(obj.id, true))
        .catch(e => onResult(obj.id, false, e))
    }
    console.log(obj)
  }

  // incoming data
  let buffered = null
  socket.on('message', data => {
    let obj
    try {
      obj = JSON.parse(data)
      buffered = null
    } catch (e) {
      // pass
      console.error(e)
    }

    if (buffered) {
      data = buffered + data
      try {
        obj = JSON.parse(data)
        buffered = null
      } catch (e) {
        // pass
        console.error(e)
      }
    }

    // both failed
    if (!obj) {
      buffered = data
      if (buffered.length > 1024 * 1024 * 10) {
        buffered = null
      }
      return
    }

    try {
      handleCommand(obj)
    } catch (e) {
      console.error(e)
    }
  })
}

module.exports = brokeMqttOverSocket

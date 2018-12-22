
function createGuid() {
  var id = 1
  return function () {
    return String(id++)
  }
}

const guid = createGuid()

function mqttMatch(filter, topic) {
  const filterArray = filter.split('/')
  const length = filterArray.length
  const topicArray = topic.split('/')

  for (let i = 0; i < length; ++i) {
    const left = filterArray[i]
    const right = topicArray[i]
    if (left === '#') return true
    if (left !== '+' && left !== right) return false
  }

  return length === topicArray.length
}

module.exports = {
  createGuid,
  guid,
  mqttMatch
}

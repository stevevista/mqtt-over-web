
function createGuid() {
  var id = 1
  return function () {
    return String(id++)
  }
}

const guid = createGuid()

module.exports = {
  createGuid,
  guid
}

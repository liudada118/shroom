
let oldDate = 0
const HZ = 8

function jqbedReverse(arr) {
    let wsPointData = [...arr]
    const rowSize = 32
    const swappedRowCount = 15
    const movedLength = swappedRowCount * rowSize

    const movedRows = wsPointData.splice(wsPointData.length - movedLength, movedLength)
    wsPointData = movedRows.concat(wsPointData)

    // 还原 jqbed 中 1-15 行的调换。
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < rowSize; j++) {
            [wsPointData[i * rowSize + j], wsPointData[(14 - i) * rowSize + j]] = [
                wsPointData[(14 - i) * rowSize + j],
                wsPointData[i * rowSize + j],
            ]
        }
    }

    return wsPointData
}

function jqbedReverseIndex(index) {
    const rowSize = 32
    const totalRows = 32
    const movedRowCount = totalRows - 15
    const numericIndex = Number(index)

    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= rowSize * totalRows) {
        return -1
    }

    const row = Math.floor(numericIndex / rowSize)
    const col = numericIndex % rowSize
    const sourceRow = row < movedRowCount ? row + 15 : totalRows - 1 - row

    return sourceRow * rowSize + col
}

setInterval(() => {
    const newDate = new Date().getTime()
    if (newDate - oldDate > 1000 / HZ) {
        console.log(newDate, '111')
        oldDate = newDate
    }
}, 80)


setInterval(() => {
    const newDate = new Date().getTime()

    console.log(newDate, '222')

}, 125)


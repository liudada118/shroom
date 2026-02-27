const express = require('express')
const HttpResult = require('./server/HttpResult')
const { findAvailablePort, DEFAULT_PORTS } = require('../util/portFinder')
const app = express()

// 端口从环境变量读取，否则使用默认值 3001（避免与前端 dev server 的 3000 冲突）
const PREFERRED_PORT = parseInt(process.env.BACKEND_PORT, 10) || 3001

app.get('/', (req, res) => {
  res.send('Hello World!')
})

// 查询密钥
app.get('/getKey', (req, res) => {
  const uuid = req.query.uuid;
  console.log(JSON.stringify(uuid))
  res.json(new HttpResult(0, 'data', '获取设备列表成功'));
})

// 绑定密钥
app.post('/bindKey', (req, res) => {

})

// 使用动态端口分配启动服务
async function start() {
  try {
    const port = await findAvailablePort(PREFERRED_PORT)
    app.listen(port, () => {
      console.log(`[Backend] 服务已启动，端口: ${port}`)
    })
  } catch (err) {
    console.error('[Backend] 启动失败:', err.message)
    process.exit(1)
  }
}

start()

const fs = require("fs")
const path = require("path")

const cp = require("child_process")
const cron_name = process.argv[2] || "cron_default"

const crons = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "conf/" + cron_name + ".json"),
    "utf8"
  )
)
for (let v of crons) {
  let t = 1000
  for (let v2 of v.t) {
    t *= v2
  }
  v.t = t
}

console.log(crons)

class Cron {
  constructor() {
    this.cur = 0
    this.all_skipped = true
    this.last = {}
    this.go()
  }
  go() {
    console.log("=====================")
    let cr = crons[this.cur]
    if (crons[this.cur] == undefined) {
      this.cur = 0

      cr = crons[this.cur]
      this.restart(cr)
    } else {
      this.exec(cr)
    }
  }
  restart(cr) {
    if (this.all_skipped == true) {
      console.log("wait for 10 seconds...")
      setTimeout(() => {
        this.exec(cr)
      }, 1000 * 10)
    } else {
      this.all_skipped = true
      this.exec(cr)
    }
  }
  exec(cr) {
    if (
      cr.t != undefined &&
      this.last[this.cur] != undefined &&
      Date.now() - this.last[this.cur] < cr.t
    ) {
      console.log("skip...")
      this.next()
    } else {
      this.all_skipped = false
      this.last[this.cur] = Date.now()
      let cm = cr.cm
      if (cm == undefined) {
        cm = "node"
      }
      let p = cr.p
      if (p[0].match(/\./) == null) {
        p[0] = path.resolve(__dirname + "/" + p[0] + ".js")
      }
      let cl = cp.spawn(cm, p)
      cl.stdout.setEncoding("utf8")
      cl.stdout.on("data", data => {
        console.log(data)
      })
      cl.stderr.setEncoding("utf8")
      cl.stderr.on("data", data => {
        console.log(data)
      })
      cl.stderr.on("close", data => {
        this.next()
      })
    }
  }
  next() {
    this.cur += 1
    this.go()
  }
}
new Cron()

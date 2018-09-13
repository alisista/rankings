const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })
const spawn = require("child-process-promise").spawn
const target = process.argv[2]
const DB = require("monk")(process.env.MONGODB_URL)
const db = {
  sequence: DB.get("sequence")
}
const _ = require("lodash/fp")
let moment = require("moment")
let tz = require("moment-timezone")

const conf = {
  alis: {
    first: "2018-09-05",
    plus: 1000 * 60 * 60 * 48,
    dead: 1000 * 60 * 60 * 24 * 8,
    steps: [
      {
        key: "tweets",
        com: "node",
        params: [__dirname + "/getTweets.js", "#date"]
      },
      {
        key: "retweets",
        com: "node",
        params: [__dirname + "/getReTweets.js", "#date"]
      },
      {
        key: "users",
        com: "node",
        params: [__dirname + "/getUsers.js", "#date"]
      },
      {
        key: "calc",
        com: "node",
        params: [__dirname + "/calcRankings.js", "#date"]
      },
      {
        key: "drop",
        com: "node",
        params: [__dirname + "/dropRankings.js", "#date"]
      }
    ]
  }
}

if (conf[target] == undefined) {
  console.log(`no configuration found for ${target}`)
  process.exit(1)
}

class Sequence {
  constructor() {
    this.check()
      .then(res => {
        process.exit()
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }
  getNeeds(dates) {
    console.log(dates)
    let today = moment(Date.now() - (this.conf.plus || 0)).tz("Asia/Tokyo")
    let t = today.format("YYYY-MM-DD")
    console.log(t)
    let needs = []
    while (t != this.conf.first) {
      if (dates[t] != undefined) {
        if (
          dates[t][this.conf.steps[this.conf.steps.length - 1].key] == undefined
        ) {
          if (dates[t].dead != true) {
            needs.push(dates[t])
          }
        }
      } else {
        needs.push({ date: t })
      }
      today.add(-1, "day")
      t = today.format("YYYY-MM-DD")
    }
    return _.sortBy(v => {
      return v.date.split("-").join("") * 1
    })(needs)
  }
  async getDates() {
    const seqs = await db.sequence.find({ key: target })
    const dates = _.keyBy(v => {
      return v.date
    })(seqs)
    return dates
  }
  getNext(needs) {
    let next
    for (let v of needs) {
      if (next != undefined) {
        break
      }
      let index = 0
      for (let v2 of this.conf.steps || []) {
        if (v[v2.key] == undefined) {
          if (v2.manual != true && v2.com != undefined) {
            next = { conf: v, action: v2.key, ind: index }
          }
          break
        }
        index += 1
      }
    }
    return next
  }
  async check() {
    this.conf = conf[target]
    let dates = await this.getDates()
    let needs = this.getNeeds(dates)
    console.log(needs)
    let next = this.getNext(needs)
    console.log(next)
    if (next == undefined) {
      console.log("nothing to do now")
      process.exit()
    } else {
      this.next = next
      await this.goNext()
    }
  }
  async goNext() {
    let params = []
    let step = this.conf.steps[this.next.ind]

    if (
      this.conf.dead &&
      Date.now() - this.conf.dead > moment(this.next.conf.date).format("x") * 1
    ) {
      await db.sequence.update(
        { key: target, date: this.next.conf.date },
        { $set: { key: target, date: this.next.conf.date, dead: true } },
        { upsert: true }
      )
    } else {
      for (let v of step.params || []) {
        if (v == "#date") {
          params.push(this.next.conf.date)
        } else {
          params.push(v)
        }
      }
      if (step.com == undefined) {
        console.log(
          "waiting for manual..." + this.next.conf.date + ":" + step.key
        )
        await db.next2.update(
          { key: target, date: this.next.conf.date },
          { $set: { ismanual: step.key } }
        )
      } else {
        console.log("we gotta be here")
        let code = await this.spawn(step.com, params)
        console.log(code)
        if (code == 0) {
          await this.registerStep()
        } else {
          console.log("error..." + code)
          process.exit()
        }
      }
    }
  }
  async spawn(command, params) {
    let promise = spawn(command, params)
    let ls = promise.childProcess
    let exit_code
    ls.stdout.on("data", data => {
      console.log(`${data}`)
    })
    ls.stderr.on("data", data => {
      console.log(`stderr: ${data}`)
    })
    ls.on("close", code => {
      exit_code = code
    })
    return promise
      .then(() => {
        return exit_code
      })
      .catch(() => {
        return exit_code
      })
  }
  async registerStep() {
    let setter = { key: target, date: this.next.conf.date }
    let step = this.conf.steps[this.next.ind]
    setter[step.key] = Date.now()
    await db.sequence.update(
      { key: target, date: this.next.conf.date },
      { $set: setter },
      { upsert: true }
    )
  }
}

new Sequence()

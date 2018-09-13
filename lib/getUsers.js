const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })
const alis = require("alis")
const DB = require("monk")(process.env.MONGODB_URL)

const moment = require("moment")
const tz = require("moment-timezone")

const db = {
  articles: DB.get("articles"),
  users: DB.get("users")
}

const _ = require("lodash/fp")

_.mixin({})

const H = require("./utils/helpers")

const date = process.argv[2]

const getArticles = require("./utils/getArticles")

class Rankings {
  constructor(date) {
    this.getUsers(date)
      .then(total => {
        process.exit()
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }
  async getUsers(date) {
    if (!H.validateDate(date)) {
      console.log("The wrong date format")
      process.exit(1)
    } else {
      console.log(`fetching tweets on ${date}`)
      const articles = await getArticles(date, db)
      const user_ids = _.flow(
        _.pluck("user_id"),
        _.uniq
      )(articles)
      const existing_users = _.pluck("user_id")(
        await db.users.find(
          { user_id: { $in: user_ids } },
          { fields: { user_id: true } }
        )
      )
      const missing_users = _.difference(user_ids, existing_users)
      console.log(`${missing_users.length} users missing`)
      for (const user_id of missing_users) {
        const user = await alis.p.users.user_id.info({ user_id: user_id })
        console.log(user)
        await db.users.update(
          { user_id: user.user_id },
          { $set: user },
          { upsert: true }
        )
      }
    }
  }
}

new Rankings(date)

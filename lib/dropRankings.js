const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })
const alis = require("alis")
const DB = require("monk")(process.env.MONGODB_URL)

const moment = require("moment")
const tz = require("moment-timezone")

const db = {
  articles: DB.get("articles"),
  users: DB.get("users"),
  maps: DB.get("maps")
}

const _ = require("lodash/fp")

_.mixin({})

const H = require("./utils/helpers")

const date = process.argv[2]

const getArticles = require("./utils/getArticles")
const Dropbox = require("dropbox").Dropbox

const dropbox_credentials = {
  app_key: process.env.DROPBOX_APP_KEY,
  app_secret: process.env.DROPBOX_APP_SECRET,
  app_access_token: process.env.DROPBOX_APP_ACCESS_TOKEN
}
const dropbox = new Dropbox({
  accessToken: dropbox_credentials.app_access_token
})

class Drop {
  constructor(date) {
    this.dropRankings(date)
      .then(total => {
        process.exit()
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }

  async dropRankings(date) {
    if (!H.validateDate(date)) {
      console.log("The wrong date format")
      process.exit(1)
    } else {
      console.log(`fetching tweets on ${date}`)
      let articles = await getArticles(date, db, {
        article_id: true,
        counts: true,
        published_at: true,
        rank: true,
        title: true,
        topic: true,
        user_id: true,
        _id: false
      })
      console.log(articles)
      articles = _.sortBy(v => {
        return ((v.counts || {}).points || 0) * -1
      })(articles)

      await this.addUsers(articles)
      this.addRank(articles)
      const file_id = await this.dropArticles(articles, date)
      await this.dropMap(file_id, date)
    }
  }
  async dropMap(file_id, date) {
    const map_name = "alis_daily"
    let map = ((await db.maps.findOne({ key: map_name })) || {}).map || {}
    if (_.isUndefined(map[date])) {
      map[date] = file_id
      const file_path = `/maps/${map_name}.json`
      const map_id = await this.drop(file_path, map)
      console.log(`map saved...${map_id}`)
      await db.maps.update(
        { key: map_name },
        { $set: { key: map_name, map: map } },
        { upsert: true }
      )
    }
  }
  async drop(file_path, data) {
    await dropbox.filesUpload({
      path: file_path,
      contents: JSON.stringify(data),
      mode: "overwrite"
    })
    const result = await dropbox.sharingCreateSharedLink({
      path: file_path,
      short_url: false
    })
    const file_url = result.url.replace(/\?dl=0$/, "")
    const file_id = file_url.split("/")[4]
    return file_id
  }
  compressArticles(articles) {
    return _.map(v => {
      console.log(v)
      return {
        i: v.article_id,
        d: v.published_at,
        t: v.title,
        g: v.topic,
        u: v.user_id,
        n: v.user.user_display_name,
        r: v.rank,
        p: (v.user.icon_image_url || "").split("/")[8] || "",
        cp: v.counts.points,
        ct: v.counts.tweets,
        cr: v.counts.retweets,
        cl: v.counts.likes
      }
    })(articles)
  }
  async dropArticles(articles, date) {
    const file_path = "/rankings/alis/daily/" + date + ".json"
    const data = { a: this.compressArticles(articles), d: Date.now() }
    console.log(data)
    return await this.drop(file_path, data)
  }
  addRank(articles) {
    let rank = 0
    let last_points = null
    let pool = 0
    for (let article of articles) {
      let points = (article.counts || {}).points || 0
      if (last_points == null || last_points != points) {
        rank += pool + 1
        pool = 0
      } else {
        pool++
      }
      article.rank = rank
      last_points = points
    }
  }

  async addUsers(articles) {
    const user_ids = _.flow(
      _.pluck("user_id"),
      _.uniq
    )(articles)
    const users = _.keyBy(
      "user_id",
      await db.users.find(
        { user_id: { $in: user_ids } },
        {
          fields: {
            _id: false,
            user_id: true,
            icon_image_url: true,
            user_display_name: true
          }
        }
      )
    )
    articles = _.map(v => {
      v.user = users[v.user_id]
      if (!_.isUndefined(v.user)) {
        delete v.user.user_id
      }
      return v
    })(articles)
  }
}

new Drop(date)

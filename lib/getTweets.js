const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })
const alis = require("alis")
const DB = require("monk")(process.env.MONGODB_URL)

const moment = require("moment")
const tz = require("moment-timezone")

const db = {
  articles: DB.get("articles"),
  tweets: DB.get("tweets")
}

const _ = require("lodash/fp")

_.mixin({})

const H = require("./utils/helpers")

const twit = require("twit")
let twitter_credentials = {
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  timeout_ms: 60 * 1000
}

let T = new twit(twitter_credentials)

const date = process.argv[2]

const getArticles = require("./utils/getArticles")

class Tweets {
  constructor(date) {
    this.getTweets(date)
      .then(total => {
        process.exit()
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }

  async getTweets(date) {
    if (!H.validateDate(date)) {
      console.log("The wrong date format")
      process.exit(1)
    } else {
      console.log(`fetching articles on ${date}`)
      const articles = await getArticles(date, db)
      console.log(`${articles.length} articles found`)
      let cursor = 0
      for (const article of articles) {
        cursor += 1
        console.log(`[${cursor}/${articles.length}] ${article.title}`)
        const tweets = await this.getTweetsWithURL(article)
        let statuses = H.formatTweets(article, tweets.statuses)
        for (const status of statuses) {
          await db.tweets.update(
            { article_id: status.article_id, id_str: status.id_str },
            { $set: status },
            { upsert: true }
          )
        }
      }
    }
  }
  validateDate(date) {
    return (
      _.isString(date) && date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) !== null
    )
  }
  async getArticles(date) {
    let date_obj = moment.tz(date, "Asia/Tokyo")
    const start_x = date_obj.format("x") * 1
    date_obj.add(1, "day")
    const end_x = date_obj.format("x") * 1
    const finder = {
      published_at: { $gte: start_x, $lt: end_x }
    }
    return await db.articles.find(finder)
  }
  async getTweetsWithURL(article) {
    const article_url = `https://alis.to/${article.user_id}/articles/${
      article.article_id
    }`
    console.log(`getting tweets for ${article_url}`)
    return await new Promise((res, rej) => {
      T.get(
        "search/tweets",
        { q: article_url + " -filter:nativeretweets", count: 100 },
        (err, data, response) => {
          if (!_.isNil(err)) {
            if (err.code == 88) {
              console.log(`rate limit`)
            }
            rej(err)
          } else {
            res(data)
          }
        }
      )
    })
  }
}

new Tweets(date)

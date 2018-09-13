const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })
const alis = require("alis")
const DB = require("monk")(process.env.MONGODB_URL)

const moment = require("moment")
const tz = require("moment-timezone")

const db = {
  articles: DB.get("articles"),
  tweets: DB.get("tweets"),
  retweets: DB.get("retweets")
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
const force = process.argv[3]
const getArticles = require("./utils/getArticles")

class Retweets {
  constructor(date) {
    this.getRetweets(date)
      .then(total => {
        process.exit()
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }
  async getRetweets(date) {
    if (!H.validateDate(date)) {
      console.log("The wrong date format")
      process.exit(1)
    } else {
      console.log(`fetching tweets on ${date}`)
      const articles = await getArticles(date, db)
      let article_count = 0
      for (const article of articles) {
        article_count += 1
        console.log(
          `\n[${article_count}/${articles.length}] checking...article [${
            article.title
          }]`
        )
        let tweets = await this.getTweets(article)
        for (const tweet of tweets) {
          let retweets = await this.getStatusRetweets(tweet)
          let statuses = H.formatReTweets(article, tweet, retweets.statuses)
          for (const status of statuses) {
            await db.retweets.update(
              { id_str: status.id_str },
              { $set: status },
              { upsert: true }
            )
          }
          await db.tweets.update(
            { _id: tweet._id },
            { $set: { retweets_checked: Date.now() } }
          )
        }
      }
    }
  }

  async getTweets(article) {
    let finder = {
      article_id: article.article_id
    }
    if (force != "force") {
      finder.retweets_checked = { $exists: false }
    }
    return await db.tweets.find(finder)
  }

  async getStatusRetweets(tweet) {
    const status_url = `https://twitter.com/${tweet.user.screen_name}/status/${
      tweet.id_str
    }`
    console.log(`\tgetting retweets for ${status_url}`)
    return await new Promise((res, rej) => {
      T.get(
        "search/tweets",
        { q: status_url + " -filter:nativeretweets", count: 100 },
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

new Retweets(date)

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

const getArticles = require("./utils/getArticles")

class Rankings {
  constructor(date) {
    this.calcRankings(date)
      .then(total => {
        process.exit()
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }
  async calcRankings(date) {
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
        let retweets = await this.getReTweets(article)
        await this.countTweets(article, tweets, retweets)
      }
    }
  }
  async countTweets(article, tweets, retweets) {
    let counts = { tweets: 0, retweets: 0, likes: 0, points: 0 }
    for (let v of tweets) {
      counts.tweets += 1
      counts.retweets += v.retweet_count
      counts.likes += v.favorite_count
    }
    counts.points = counts.tweets + counts.retweets + counts.likes
    await db.articles.update(
      { article_id: article.article_id },
      { $set: { counts: counts } }
    )
  }
  async getTweets(article) {
    return await db.tweets.find({
      article_id: article.article_id
    })
  }
  async getReTweets(article) {
    return await db.retweets.find({
      article_id: article.article_id
    })
  }
}

new Rankings(date)

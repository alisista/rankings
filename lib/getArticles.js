const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })
const alis = require("alis")
const DB = require("monk")(process.env.MONGODB_URL)
const moment = require("moment")
const db = {
  articles: DB.get("articles")
}

const _ = require("lodash/fp")

_.mixin({
  format_articles: _.map(
    _.flow(
      _.pick([
        "title",
        "user_id",
        "topic",
        "overview",
        "eye_catch_url",
        "article_id",
        "tags",
        "published_at"
      ]),
      _.update("published_at", n => {
        return n * 1000
      })
    )
  )
})

class Articles {
  constructor() {
    this.getArticles()
      .then(total => {
        console.log(`${total} total articles inserted`)
        process.exit()
      })
      .catch(error => {
        console.log(error)
        process.exit(1)
      })
  }

  async getArticles() {
    const last_article_ids = await this.getLastArticleIds()
    return await this.getRecentArticles(1, last_article_ids)
  }

  async getLastArticleIds() {
    let last_articles = await db.articles.find(
      {},
      {
        fields: {
          _id: false,
          article_id: true
        },
        sort: { published_at: -1 },
        limit: 3
      }
    )
    return _.pluck("article_id")(last_articles)
  }

  async getRecentArticles(page = 1, last_article_ids = []) {
    let inserted = 0
    const date_7days_ago =
      moment()
        .add(-7, "day")
        .format("x") * 1

    let result = await alis.p.articles.recent({ limit: 100, page: page })
    let articles = _.format_articles(result.Items)

    for (const article of articles) {
      if (
        article.published_at < date_7days_ago ||
        last_article_ids.includes(article.article_id)
      ) {
        break
      }
      console.log(`[${article.user_id}] ${article.title}`)
      let res = await db.articles.update(
        { article_id: articles.article_id },
        { $set: article },
        { upsert: true }
      )
      inserted++
    }
    console.log(`${inserted} articles inserted`)
    if (inserted === 100) {
      inserted += await this.getRecentArticles(++page)
    }
    return inserted
  }
}

new Articles()

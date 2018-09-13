const _ = require("lodash/fp")
const moment = require("moment")
class Helpers {
  static validateDate(date) {
    return (
      _.isString(date) && date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) !== null
    )
  }

  static formatTweetsWithAddons(statuses, addons = {}) {
    return _.map(
      _.flow(
        _.pick([
          "created_at",
          "id_str",
          "text",
          "user.screen_name",
          "user.id_str",
          "retweet_count",
          "favorite_count"
        ]),
        _.update("created_at", n => {
          return moment(n, "ddd MMM DD HH:mm:ss ZZ YYYY").format("x") * 1
        }),
        _.tap(t => {
          for (let k in addons) {
            t[k] = addons[k]
          }
        })
      )
    )(statuses)
  }
  static formatTweets(article, statuses) {
    return this.formatTweetsWithAddons(statuses, {
      article_id: article.article_id
    })
  }
  static formatReTweets(article, status, statuses) {
    return this.formatTweetsWithAddons(statuses, {
      article_id: article.article_id,
      status_id: status.id_str
    })
  }
}

module.exports = Helpers

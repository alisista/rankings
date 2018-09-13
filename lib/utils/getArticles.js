const moment = require("moment")
module.exports = async function getTweets(date, db, fields) {
  let date_obj = moment.tz(date, "Asia/Tokyo")
  const start_x = date_obj.format("x") * 1
  date_obj.add(1, "day")
  const end_x = date_obj.format("x") * 1
  const finder = {
    published_at: { $gte: start_x, $lt: end_x }
  }
  const opts = {}
  if (fields != undefined) {
    opts.fields = fields
  }
  return await db.articles.find(finder, opts)
}

const TelegramBot = require("node-telegram-bot-api");
const { Configuration, OpenAIApi } = require("openai");
const schedule = require("node-schedule");
require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_AVTOBOT_API_KEY, {polling: true});
const configuration = new Configuration({apiKey: process.env.OPENAI_API_KEY});
const openai = new OpenAIApi(configuration);

schedule.scheduleJob({hour: 14, minute: 30, dayOfWeek: [1, 3, 5]}, () => {
  openai.createCompletion({
    model: "text-davinci-003",
    prompt: process.env.CHATGPT_QUERY_TEXT,
    max_tokens: 2048,
  }).then(({data}) => {
    bot.sendMessage(process.env.ID_OF_GARAGE_GROUP, data.choices[0].text);
  });
});
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const fetch = require('node-fetch');
const config = require('./config.json');

const chatsList = config.CHATS_LIST;

const bot = new TelegramBot(config.TELEGRAM_AVTOBOT_API_KEY, {polling: true});

const getPictureNumberFromStorage = (counterDir, picturesDir) => {
  if (fs.existsSync(counterDir)) {
    const oldNumber = Number(fs.readFileSync(counterDir, "utf8"));
    const numberOfPictures = fs.readdirSync(picturesDir)?.length;

    if (oldNumber && numberOfPictures) {
      const newNumber = oldNumber < numberOfPictures ? oldNumber + 1 : 1;

      fs.writeFileSync(counterDir, `${newNumber}`);

      return newNumber;
    } 
  }

  fs.writeFileSync(counterDir, `1`);

  return 1;
};
const getDayOfSprint = () => Math.ceil((new Date().getTime() - new Date('2022-09-28T00:00:00').getTime()) / 60000 / 60 / 24) % 14;  //Возвращает число от 0 до 9. 0 - это 10й день
const getSprintWorkingDay = (day) => {
  if (day > 10) {
    return day - 4;
  }

  if (day > 5) {
    return day - 2;
  }

  return day;
};
const getCompliment = async (role, text) => {
  try {
    const response = await fetch(config.YANDEX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${config.YANDEX_API_KEY}`,
      },
      body: JSON.stringify({
        modelUri: `gpt://${config.YANDEX_FOLDER_ID}/yandexgpt-lite`,
        completionOptions: {
          stream: false,
            temperature: 0.6,
            maxTokens: '1000',
        },
        messages: [
          {
            role: 'system',
            text: role,
          },
          {
            role: 'user',
            text,
          },
        ],
      }),
    });

    const json = await response.json();

    return json?.result?.alternatives?.[0]?.message?.text;
  } catch (e) {
    bot.sendMessage(config.ID_OF_TEST_GROUP, `Ошибка при генерации комплимента`)
  }
};

let pictureNumberForDaily = getPictureNumberFromStorage(config.DAILY_PICTURE_NUMBER_STORAGE_DIR, config.DAILY_PICTURES_DIR);
let pictureNumberForClosingTask = getPictureNumberFromStorage(config.TASK_PICTURE_NUMBER_STORAGE_DIR, config.TASK_PICTURES_DIR);
let dayOfSprint = getDayOfSprint();
let calendarDay = dayOfSprint ? dayOfSprint : 14;
let sprintWorkingDay = getSprintWorkingDay(calendarDay);

bot.on('message', (msg) => {
  const chatId = msg.chat?.id;
  const messageId = msg.message_id;
  const username = msg.chat?.username ?? msg.from?.username;
  const messageText = msg.text ?? '';

  if (chatId && (msg.text === '/start' || msg.text === '/help')) {
    bot.sendMessage(chatId, 'Привет! Если ты хочешь добавить этого бота к себе в группу или у тебя есть просьба, предложение по настройке бота - напиши свое пожелание после команды /contact и разработчик всяжется с тобой. ');
    bot.sendMessage(config.ID_OF_TEST_GROUP, `Сообщение ${messageId} ${msg.chat.type} от @${username} (id: ${chatId}):${messageText}`);
    return;
  }

  if (chatId && msg.text?.includes('/contact')) {
    bot.sendMessage(config.ID_OF_TEST_GROUP, `Сообщение ${messageId} ${msg.chat.type} от @${username} (id: ${chatId}):${messageText}`);
    return;
  }

  const photoId = msg?.photo?.[0]?.file_id;
  const photoCaption = msg.caption ?? '';

  if (photoId && photoCaption?.includes('/addphoto')) {
    bot.sendPhoto(config.ID_OF_TEST_GROUP, photoId, {caption: photoCaption});
  }
});

const jobOfUpdatingDataDaily = schedule.scheduleJob({hour: 6, minute: 0, dayOfWeek: new schedule.Range(1, 5)}, () => {
  pictureNumberForDaily = getPictureNumberFromStorage(config.DAILY_PICTURE_NUMBER_STORAGE_DIR, config.DAILY_PICTURES_DIR);
  pictureNumberForClosingTask = getPictureNumberFromStorage(config.TASK_PICTURE_NUMBER_STORAGE_DIR, config.TASK_PICTURES_DIR);

  dayOfSprint = getDayOfSprint();
  calendarDay = dayOfSprint ? dayOfSprint : 14;
  sprintWorkingDay = getSprintWorkingDay(calendarDay);
});

const job = schedule.scheduleJob({second: 0, dayOfWeek: new schedule.Range(1, 5)}, async (fireDate) => {
  const hour = fireDate.getHours();
  const minute = fireDate.getMinutes();
  const dayOfWeek = fireDate.getDay();

  chatsList?.forEach((chat) => {
    if (chat.id && chat.jobs && chat.jobs?.length) {
      chat.jobs.forEach((job) => {
        if (job.hour === hour && job.minute === minute && job.type) {
          if (job.type === 'daily_meeting') {
            if (job?.withPicture) {
              bot.sendPhoto(chat.id, `src/assets/daily-pictures/${pictureNumberForDaily}.jpg`, {caption: `Сегодня ${sprintWorkingDay} день спринта. Господа, скоро начнётся дейлик! ${job?.urlOfMeetingRoom ?? ''}`}).catch((e) => {
                bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
              });
            } else {
              bot.sendMessage(chat.id, `Сегодня ${sprintWorkingDay} день спринта. Господа, скоро начнётся дейлик! ${job?.urlOfMeetingRoom ?? ''}`).catch((e) => {
                bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
              });
            }
          }

          if (job.type === 'closing_tasks') {
            if (job?.withPicture) {
              switch (dayOfSprint) {
                case 0:
                  bot.sendPhoto(chat.id, config.PATH_TO_THE_PICTURE_FOR_CLOSING_TASKS_ON_THE_LAST_DAY_OF_THE_SPRINT, {caption: config.TEXT_FOR_CLOSING_TASKS_ON_THE_LAST_DAY_OF_THE_SPRINT}).catch((e) => {
                    bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
                  });
                  break;
                case 1:
                  bot.sendPhoto(chat.id, config.PATH_TO_THE_PICTURE_FOR_CLOSING_TASKS_ON_THE_FIRST_DAY_OF_THE_SPRINT, {caption: config.TEXT_FOR_CLOSING_TASKS_ON_THE_FIRST_DAY_OF_THE_SPRINT}).catch((e) => {
                    bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
                  });
                  break;
                default:
                  bot.sendPhoto(chat.id, `src/assets/task-pictures/${pictureNumberForClosingTask}.jpg`, {caption: config.TEXT_FOR_CLOSING_TASKS}).catch((e) => {
                    bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
                  });
              }
            } else {
              bot.sendMessage(chat.id, config.TEXT_FOR_CLOSING_TASKS).catch((e) => {
                bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
              });
            }
          }

          if (job.type === 'retro' && dayOfSprint === job.dayOfSprint) {
            if (job?.withPicture) {
              bot.sendPhoto(chat.id, config.PATH_TO_THE_PICTURE_FOR_RETRO, {caption: config.TEXT_FOR_RETRO}).catch((e) => {
                bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
              });
            } else {
              bot.sendMessage(chat.id, config.TEXT_FOR_RETRO).catch((e) => {
                bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)
              });
            }
          }

          if (job.type === 'compliment' && dayOfWeek === job.dayOfWeek) {
            const promiseOfCompliment = getCompliment(config.YANDEX_GPT_ROLE, config.YANDEX_GPT_PROMPT);

            promiseOfCompliment?.then((text) => {
              if (text) {
                const correctText = text?.match(/«(.*?)»/)?.[1] ?? text;
                bot.sendMessage(chat.id, `${correctText}`).catch((e) => { bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chat.id} ${e?.response?.request?.body}`)});
              }
            });
          }
        }
      })
    }
  });
});
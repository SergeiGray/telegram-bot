const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const fetch = require('node-fetch');
const querystring = require('node:querystring');
const config = require('./config.json');

const chatsList = config.CHATS_LIST;

const bot = new TelegramBot(config.TELEGRAM_AVTOBOT_API_KEY, {polling: true});

// getDayOfSprint возвращает день спринта от 0 до 13, где 0 - это последний 14ый день спринта
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
    const response = await fetch(config.YANDEX_GPT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${config.YANDEX_API_KEY}`,
      },
      body: JSON.stringify({
        modelUri: `gpt://${config.YANDEX_GPT_FOLDER_ID}/yandexgpt-lite`,
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
const getListOfImageUrls = async (publicKey) => {
  try {
    const queryPublicKey = querystring.stringify({public_key: publicKey});
    const response = await fetch(`${config.YANDEX_DISK_API_URL}?${queryPublicKey}&limit=1000`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${config.YANDEX_API_KEY}`,
      },
    });

    const json = await response.json();
    const listOfImageData = Array.from(json?._embedded?.items);
    const listOfImages = listOfImageData.map((data) => data?.sizes?.[0]?.url);

    return listOfImages;
  } catch (e) {
    bot.sendMessage(config.ID_OF_TEST_GROUP, `Ошибка при получении ссылок на изображения. Key: ${publicKey}`)
  }
};
const getImageNumber = (counterDir, listOfImages) => {
  if (fs.existsSync(counterDir)) {
    const oldNumber = Number(fs.readFileSync(counterDir, "utf8"));
    const numberOfPictures = listOfImages?.length;

    if (oldNumber && numberOfPictures) {
      const newNumber = oldNumber < numberOfPictures ? oldNumber + 1 : 1;

      fs.writeFileSync(counterDir, `${newNumber}`);

      return newNumber;
    }
  }

  fs.writeFileSync(counterDir, `1`);

  return 1;
};
const getImageUrl = async (publicKeyOfImageList, counterDir) => {
  const listOfImages = await getListOfImageUrls(publicKeyOfImageList);
  const numberOfTodayImage = getImageNumber(counterDir, listOfImages);

  return listOfImages?.[numberOfTodayImage - 1];
};
const sendError = (chatId, error, imageUrl) => {
  bot.sendMessage(config.ID_OF_TEST_GROUP, `${config.ERROR_SENDING_THE_MESSAGE} ${chatId} ${error} ${imageUrl ?? ''}`)
};
const patchText = (text, snippets) => {
  let patchedText = text;

  Object.entries(snippets).forEach(([name, value]) => {
    patchedText = patchedText.replace(new RegExp(`\\{${name}\\}`, 'g'), value);
  });

  return patchedText;
};

let dayOfSprint;
let calendarDay;
let sprintWorkingDay;

let dailyImageUrl;
let taskImageUrl;
let firstDayImageUrl;
let lastDayImageUrl;
let retroImageUrl;

const dataUpdate = () => {
  try {
    dayOfSprint = getDayOfSprint();
    calendarDay = dayOfSprint ? dayOfSprint : 14;
    sprintWorkingDay = getSprintWorkingDay(calendarDay);

    getImageUrl(config.YANDEX_DISK_DAILY_PICTURES_PUBLIC_KEY, config.DAILY_PICTURE_NUMBER_STORAGE_DIR).then((res) => { dailyImageUrl = res; });
    getImageUrl(config.YANDEX_DISK_TASK_PICTURES_PUBLIC_KEY, config.TASK_PICTURE_NUMBER_STORAGE_DIR).then((res) => { taskImageUrl = res; });
    getImageUrl(config.YANDEX_DISK_FIRST_DAY_PICTURES_PUBLIC_KEY, config.FIRST_DAY_PICTURE_NUMBER_STORAGE_DIR).then((res) => { firstDayImageUrl = res; });
    getImageUrl(config.YANDEX_DISK_LAST_DAY_PICTURES_PUBLIC_KEY, config.LAST_DAY_PICTURE_NUMBER_STORAGE_DIR).then((res) => { lastDayImageUrl = res; });
    getImageUrl(config.YANDEX_DISK_RETRO_PICTURES_PUBLIC_KEY, config.RETRO_PICTURE_NUMBER_STORAGE_DIR).then((res) => { retroImageUrl = res; });
  } catch (e) {
    bot.sendMessage(config.ID_OF_TEST_GROUP, `Ошибка при получении ссылки на изображение. ${e}`)
  }
};

dataUpdate();

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

const jobOfUpdatingDataDaily = schedule.scheduleJob({hour: 6, minute: 0, dayOfWeek: new schedule.Range(1, 5)}, dataUpdate);

const job = schedule.scheduleJob({second: 0, dayOfWeek: new schedule.Range(1, 5)}, async (fireDate) => {
  const hour = fireDate.getHours();
  const minute = fireDate.getMinutes();
  const dayOfWeek = fireDate.getDay();

  chatsList?.forEach((chat) => {
    if (chat.id && chat.jobs && chat.jobs?.length) {
      chat.jobs.forEach((job) => {
        if (job.hour === hour && job.minute === minute && job.type) {
          if (job.type === 'daily_meeting') {
            if (job?.withPicture && dailyImageUrl) {
              bot.sendPhoto(chat.id, dailyImageUrl, {caption: patchText(config.TEXT_FOR_DAILY, {0: sprintWorkingDay, 1: job?.urlOfMeetingRoom ?? ''})})
                  .catch((e) => sendError(chat.id, e, dailyImageUrl));
            } else {
              bot.sendMessage(chat.id, patchText(config.TEXT_FOR_DAILY, {0: sprintWorkingDay, 1: job?.urlOfMeetingRoom ?? ''}))
                  .catch((e) => sendError(chat.id, e));
            }
          }

          if (job.type === 'closing_tasks') {
            if (job?.withPicture && taskImageUrl) {
              switch (dayOfSprint) {
                case 0:
                  bot.sendPhoto(chat.id, lastDayImageUrl, {caption: config.TEXT_FOR_CLOSING_TASKS_ON_THE_LAST_DAY_OF_THE_SPRINT}).catch((e) => {
                    sendError(chat.id, e, lastDayImageUrl);
                  });
                  break;
                case 1:
                  bot.sendPhoto(chat.id, firstDayImageUrl, {caption: config.TEXT_FOR_CLOSING_TASKS_ON_THE_FIRST_DAY_OF_THE_SPRINT}).catch((e) => {
                    sendError(chat.id, e, firstDayImageUrl);
                  });
                  break;
                default:
                  bot.sendPhoto(chat.id, taskImageUrl, {caption: config.TEXT_FOR_CLOSING_TASKS}).catch((e) => {
                    sendError(chat.id, e, taskImageUrl);
                  });
              }
            } else {
              bot.sendMessage(chat.id, config.TEXT_FOR_CLOSING_TASKS).catch((e) => {
                sendError(chat.id, e);
              });
            }
          }

          if (job.type === 'retro' && dayOfSprint === job.dayOfSprint) {
            if (job?.withPicture && retroImageUrl) {
              bot.sendPhoto(chat.id, retroImageUrl, {caption: job.text})
                  .catch((e) => sendError(chat.id, e, retroImageUrl));
            } else {
              bot.sendMessage(chat.id, job.text)
                  .catch((e) => sendError(chat.id, e));
            }
          }

          if (job.type === 'every_day') {
            bot.sendMessage(chat.id, job.text).catch((e) => {
              sendError(chat.id, e);
            });
          }

          if (job.type === 'once_per_sprint' && dayOfSprint === job.dayOfSprint) {
            bot.sendMessage(chat.id, job.text).catch((e) => {
              sendError(chat.id, e);
            });
          }

          if (job.type === 'compliment' && dayOfWeek === job.dayOfWeek) {
            const promiseOfCompliment = getCompliment(config.YANDEX_GPT_ROLE, config.YANDEX_GPT_PROMPT);

            promiseOfCompliment?.then((text) => {
              if (text) {
                const correctText = text?.match(/«(.*?)»/)?.[1] ?? text;
                bot.sendMessage(chat.id, `${correctText}`).catch((e) => {
                  sendError(chat.id, e);
                });
              }
            });
          }
        }
      })
    }
  });
});